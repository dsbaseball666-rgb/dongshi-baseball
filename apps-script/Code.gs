/**
 * 東勢國中棒球隊｜冒險訓練筆記本 — Apps Script 後端 API（第五階段）
 *
 * 使用方式：
 *   1. 在試算表選單「擴充功能 → Apps Script」，把這個檔案的全部內容貼到 Code.gs。
 *   2. 執行 setup()：建立 14 張工作表與教練帳號（登入碼會顯示在「執行記錄」）。
 *   3. 執行 runSelfTests()：自動測試權限與資料保護，確認全部 PASS。
 *   4. 「部署 → 新增部署作業 → 網頁應用程式」，執行身分：我；存取權：所有人。
 *
 * 安全原則：
 *   - 角色一律從 Users 工作表讀取，不採信前端傳來的角色。
 *   - 每個 API 都在 ROUTES 宣告可使用的角色，執行前統一檢查；runSelfTests 會逐一驗證。
 *   - 登入碼只存加鹽雜湊值；登入碼變更後，舊的登入狀態立即失效。
 *   - 所有寫入使用 LockService，並以 requestId 防止重複提交。
 */

const API_VERSION = '5.7.0';
const TZ = 'Asia/Taipei';
const SESSION_SECONDS = 6 * 60 * 60; // CacheService 上限 6 小時
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECONDS = 10 * 60;
const REQUEST_CACHE_SECONDS = 10 * 60;

// ───────────────────────── 資料表欄位（唯一定義來源） ─────────────────────────

const SCHEMA = {
  Players: ['id', 'name', 'number', 'grade', 'position', 'active', 'createdAt', 'updatedAt'],
  Users: ['id', 'loginId', 'displayName', 'role', 'playerId', 'childPlayerIds', 'active', 'codeSalt', 'codeHash', 'createdAt', 'updatedAt'],
  DailyNotes: ['id', 'playerId', 'date', 'training', 'learned', 'improve', 'tomorrowPrep', 'shortGoal', 'midGoal', 'longGoal', 'selfChecks', 'coachComment', 'coachCommentBy', 'createdAt', 'updatedAt'],
  Goals: ['id', 'playerId', 'term', 'content', 'criteria', 'startDate', 'dueDate', 'status', 'checkpoints', 'createdBy', 'createdAt', 'updatedAt'],
  FitnessTests: ['id', 'playerId', 'date', 'item', 'value', 'unit', 'note', 'createdBy', 'createdAt', 'updatedAt'],
  Tasks: ['id', 'title', 'description', 'category', 'repeat', 'verify', 'expReward', 'pointReward', 'ballReward', 'active'],
  TaskCompletions: ['id', 'taskId', 'playerId', 'periodKey', 'status', 'submittedAt', 'reviewedBy', 'reviewedAt', 'claimedAt'],
  // evolveAffection：空白＝使用預設（AFFECTION_EVOLVE_DEFAULTS）；0＝用等級進化；大於 0＝親密度達到就能進化
  Monsters: ['id', 'dexNo', 'name', 'element', 'rarity', 'stage', 'evolvesTo', 'evolveLevel', 'description', 'habitat', 'catchRate', 'isStarter', 'inWild', 'evolveAffection'],
  // hp 空白代表滿血；hpAt 是最後一次寫入 hp 的時間（用來計算自然回復）
  // affection：親密度；careDate／careCounts：當天各種互動的次數
  PlayerMonsters: ['id', 'playerId', 'monsterId', 'nickname', 'level', 'exp', 'partner', 'obtainedAt', 'obtainedBy', 'hp', 'hpAt', 'affection', 'careDate', 'careCounts'],
  MonsterProgress: ['id', 'playerId', 'playerMonsterId', 'expGain', 'levelAfter', 'reason', 'at'],
  Rules: ['id', 'no', 'title', 'content', 'category', 'version', 'updatedAt', 'updatedBy', 'needsCoachReview', 'reviewNote', 'isAnnouncement'],
  KnowledgeArticles: ['id', 'title', 'category', 'audience', 'summary', 'details', 'cautions', 'sources', 'updatedAt', 'status', 'reviewed', 'quiz'],
  Announcements: ['id', 'title', 'body', 'audience', 'pinned', 'status', 'publishedAt', 'createdBy', 'updatedAt'],
  AuditLogs: ['id', 'at', 'actorId', 'actorName', 'action', 'target', 'detail'],
  // 第四階段：遊戲（第一次使用時自動建立）
  Wallets: ['playerId', 'points', 'balls', 'exploreDate', 'exploreCount', 'supplyDate', 'seenMonsterIds', 'encounterMonsterId', 'encounterAreaId', 'encounterAt', 'updatedAt', 'items', 'battleDate', 'pveCount', 'pvpCount'],
  RewardLogs: ['id', 'playerId', 'source', 'detail', 'exp', 'points', 'balls', 'at'],
  QuizPasses: ['id', 'playerId', 'articleId', 'date', 'at'],
  // 5.2：段考成績、對戰
  ExamScores: ['id', 'playerId', 'schoolYear', 'semester', 'examNo', 'grade', 'scores', 'note', 'createdBy', 'createdAt', 'updatedAt'],
  Battles: ['id', 'playerId', 'mode', 'opponentPlayerId', 'opponentName', 'date', 'status', 'state', 'log', 'result', 'createdAt', 'updatedAt'],
  // 5.4：家長、老師、教練三方平台
  Invites: ['id', 'codeSalt', 'codeHash', 'role', 'playerIds', 'label', 'status', 'createdById', 'createdBy', 'createdAt', 'expiresAt', 'usedBy', 'usedAt'],
  Messages: ['id', 'playerId', 'authorId', 'authorName', 'authorRole', 'body', 'createdAt', 'batchId', 'batchSize'],
  SchoolRecords: ['id', 'playerId', 'date', 'category', 'rating', 'content', 'authorId', 'authorName', 'authorRole', 'createdAt', 'updatedAt'],
  Events: ['id', 'title', 'date', 'startTime', 'endTime', 'location', 'category', 'playerIds', 'note', 'createdById', 'createdBy', 'createdAt', 'updatedAt'],
  // 5.7：球隊管理（練球通知、出缺席、通訊錄、預算、賽事）
  PracticeDays: ['id', 'date', 'type', 'startTime', 'endTime', 'location', 'content', 'note', 'createdById', 'updatedBy', 'createdAt', 'updatedAt'],
  Attendance: ['id', 'date', 'playerId', 'status', 'reason', 'updatedBy', 'createdAt', 'updatedAt'],
  PlayerProfiles: ['playerId', 'birthday', 'className', 'batsThrows', 'height', 'weight', 'phone', 'address', 'guardianName', 'guardianRelation', 'guardianPhone', 'guardian2Name', 'guardian2Relation', 'guardian2Phone', 'medicalNote', 'note', 'updatedBy', 'updatedAt'],
  BudgetItems: ['id', 'year', 'type', 'name', 'amount', 'note', 'createdById', 'createdAt', 'updatedAt'],
  Transactions: ['id', 'year', 'date', 'type', 'itemId', 'title', 'amount', 'handler', 'note', 'createdById', 'createdBy', 'createdAt', 'updatedAt'],
  Tournaments: ['id', 'name', 'kind', 'startDate', 'endDate', 'location', 'organizer', 'signupDeadline', 'fee', 'result', 'playerIds', 'note', 'createdById', 'createdAt', 'updatedAt'],
  Games: ['id', 'tournamentId', 'date', 'time', 'opponent', 'location', 'side', 'ourScore', 'oppScore', 'note', 'createdById', 'createdAt', 'updatedAt'],
};

// 遊戲規則（與前端示範模式相同）
const GAME = {
  dailyExplores: 3,
  dailySupplyBalls: 2,
  duplicateCapturePoints: 15,
  maxLevel: 30,
  rarityWeight: { 1: 60, 2: 30, 3: 10 },
  trainPlans: { light: { label: '基礎練習', cost: 10, exp: 15 }, focus: { label: '專項特訓', cost: 30, exp: 50 } },
};
// 對戰與血量（與前端 src/lib/battle.ts 的說明文字相同）
const BATTLE = {
  pveDaily: 5,
  pvpDaily: 3,
  regenPerHour: 0.25, // 每小時自然回復最大 HP 的 25%（約 4 小時回滿）
  maxTurns: 30,
  skillPower: 1.7,
  skillCooldown: 3,
  pveFleeRate: 0.7,
  rewards: {
    pve: { won: { exp: 20, points: 8 }, lost: { exp: 5, points: 0 }, draw: { exp: 5, points: 0 } },
    pvp: { won: { exp: 30, points: 12 }, lost: { exp: 8, points: 0 }, draw: { exp: 8, points: 0 } },
  },
  potionDropRate: 0.3,
};
// 屬性相剋：左邊剋右邊（傷害 ×1.3；反過來 ×0.8）
const ELEMENT_BEATS = { 熱血: '成長', 成長: '堅守', 堅守: '疾風', 疾風: '智慧', 智慧: '團結', 團結: '熱血' };
// 道具：只能用遊戲點數購買（捕捉球不在商店販售）
const ITEMS = {
  potion: { label: '回復藥水', price: 15, heal: 0.4 },
  superPotion: { label: '高級回復藥', price: 40, heal: 1 },
  powerGlove: { label: '力量手套', price: 20, boost: 'atkUp' },
  guardGear: { label: '防護護具', price: 20, boost: 'defUp' },
};
const ITEM_MAX_HOLD = 20;

// 與怪獸互動（與前端 src/lib/monster.ts 的 CARE_ACTIONS 相同）：每隻怪獸每天的次數各自計算
const CARE = {
  pet: { label: '摸摸牠', daily: 3, affection: 2, cost: 0, exp: 0, heal: 0 },
  feed: { label: '餵點心', daily: 2, affection: 4, cost: 5, exp: 0, heal: 0.2 },
  play: { label: '一起玩球', daily: 1, affection: 4, cost: 0, exp: 5, heal: 0 },
};
const MAX_AFFECTION = 100;
// 這些怪獸靠「親密度」進化（不看等級）；教練可在後台逐隻調整
const AFFECTION_EVOLVE_DEFAULTS = { M010: 50, M016: 50, M028: 50, M052: 50, M064: 50, M070: 50 };

// 段考成績：各年級的科目（7＝一年級、8＝二年級、9＝三年級）
const EXAM_SUBJECTS = {
  7: ['國文', '數學', '英文', '社會', '自然', '建教'],
  8: ['國文', '數學', '英文', '地理', '歷史', '公民', '理化', '建教'],
  9: ['國文', '數學', '英文', '地理', '歷史', '公民', '理化', '地科生物'],
};
const SEMESTERS = ['上', '下'];

const AREAS = ['field', 'riverside', 'orchard'];
const ELEMENTS = ['熱血', '疾風', '堅守', '成長', '智慧', '團結'];
const TASK_CATEGORIES = ['每日筆記', '紀律', '防護知識', '團隊合作', '持續進步', '訓練', '休養參與'];
const TASK_REPEATS = ['daily', 'weekly', 'once'];
const TASK_VERIFY = ['coach', 'note_today', 'quiz_week'];

const SELF_CHECK_KEYS = ['onTime', 'warmup', 'gear', 'water', 'report', 'teamwork'];

// 與前端 src/lib/fitness.ts 相同的項目與合理範圍
const FITNESS_ITEMS = {
  pushup: { label: '伏地挺身', unit: '次', min: 0, max: 200, integer: true },
  situp: { label: '仰臥起坐', unit: '次', min: 0, max: 200, integer: true },
  jump: { label: '立定跳遠', unit: '公分', min: 1, max: 400 },
  run1500: { label: '1500 公尺', unit: '秒', min: 180, max: 1800 },
  run150: { label: '150 公尺', unit: '秒', min: 12, max: 90 },
  grip: { label: '慣用手握力', unit: '公斤', min: 1, max: 100 },
  swing: { label: '揮棒速度', unit: 'km/h', min: 20, max: 200 },
  pitch: { label: '投球球速', unit: 'km/h', min: 20, max: 180 },
};

// 舊體能檢測系統的項目代碼 → 本系統項目
const LEGACY_ITEM_MAP = { run1500: 'run1500', longjump: 'jump', pushup: 'pushup', situp: 'situp', grip: 'grip', swing: 'swing', pitch: 'pitch', run150: 'run150' };

const GOAL_TERMS = ['short', 'mid', 'long'];
const GOAL_STATUSES = ['active', 'completed', 'not_met', 'cancelled'];
const DEFAULT_GOAL_SETTINGS = [
  { term: 'short', label: '短期目標', periodHint: '每週或指定日期範圍', defaultDays: 7 },
  { term: 'mid', label: '中期目標', periodHint: '數週至數月', defaultDays: 60 },
  { term: 'long', label: '長期目標', periodHint: '整季或指定長期期限', defaultDays: 180 },
];
const KNOWLEDGE_CATEGORIES = ['warmup', 'arm', 'batting', 'heat', 'injury', 'recovery'];
const PUBLISH_STATUSES = ['draft', 'published', 'archived'];

// ───────────────────────── 路由 ─────────────────────────
// roles：可以呼叫這個 API 的角色。伺服器在執行前統一檢查，函式內部仍會再檢查資料擁有權。

const ALL_ROLES = ['coach', 'player', 'parent', 'teacher', 'office'];
const COACH = ['coach'];
const COACH_PLAYER = ['coach', 'player'];
// 三方平台（家長、老師、教練）；學生本人不能看溝通區與在校紀錄
const HUB = ['coach', 'parent', 'teacher', 'office'];
// 學務處（office）：自動看得到全部學生，可以統一發布訊息與行程
const STAFF = ['coach', 'teacher', 'office'];

const ROUTES = {
  ping: { public: true, fn: () => ({ service: 'dongshi-baseball-api', version: API_VERSION, today: today_() }) },
  login: { public: true, fn: login_ },
  logout: { roles: ALL_ROLES, fn: logout_ },
  me: { roles: ALL_ROLES, fn: (ctx) => ({ user: publicUser_(ctx.actor) }) },
  changeMyCode: { roles: ALL_ROLES, write: true, fn: changeMyCode_ },
  listPlayers: { roles: ALL_ROLES, fn: listPlayers_ },
  // 每日筆記
  listNotes: { roles: COACH_PLAYER, fn: listNotes_ },
  saveNote: { roles: ['player'], write: true, fn: saveNote_ },
  commentNote: { roles: COACH, write: true, fn: commentNote_ },
  // 體能檢測
  listFitness: { roles: COACH_PLAYER, fn: listFitness_ },
  addFitness: { roles: COACH, write: true, fn: addFitness_ },
  updateFitness: { roles: COACH, write: true, fn: updateFitness_ },
  deleteFitness: { roles: COACH, write: true, fn: deleteFitness_ },
  // 目標
  listGoals: { roles: COACH_PLAYER, fn: listGoals_ },
  createGoal: { roles: COACH_PLAYER, write: true, fn: createGoal_ },
  submitCheckpoint: { roles: ['player'], write: true, fn: submitCheckpoint_ },
  reviewCheckpoint: { roles: COACH, write: true, fn: reviewCheckpoint_ },
  setGoalStatus: { roles: COACH, write: true, fn: setGoalStatus_ },
  getGoalSettings: { roles: COACH_PLAYER, fn: () => ({ settings: goalSettings_() }) },
  updateGoalSettings: { roles: COACH, write: true, fn: updateGoalSettings_ },
  // 球隊規章
  listRules: { roles: ALL_ROLES, fn: listRules_ },
  updateRule: { roles: COACH, write: true, fn: updateRule_ },
  importRules: { roles: COACH, write: true, fn: importRules_ },
  // 防護知識
  listArticles: { roles: ALL_ROLES, fn: listArticles_ },
  upsertArticle: { roles: COACH, write: true, fn: upsertArticle_ },
  setArticleStatus: { roles: COACH, write: true, fn: setArticleStatus_ },
  importArticles: { roles: COACH, write: true, fn: importArticles_ },
  // 公告
  listAnnouncements: { roles: ALL_ROLES, fn: listAnnouncements_ },
  upsertAnnouncement: { roles: COACH, write: true, fn: upsertAnnouncement_ },
  setAnnouncementStatus: { roles: COACH, write: true, fn: setAnnouncementStatus_ },
  // 遊戲（結果一律由伺服器決定）
  listMonsters: { roles: COACH_PLAYER, fn: listMonsters_ },
  getGameState: { roles: COACH_PLAYER, fn: getGameState_ },
  submitTask: { roles: ['player'], write: true, fn: submitTask_ },
  claimReward: { roles: ['player'], write: true, fn: claimReward_ },
  chooseStarter: { roles: ['player'], write: true, fn: chooseStarter_ },
  setPartner: { roles: ['player'], write: true, fn: setPartner_ },
  trainMonster: { roles: ['player'], write: true, fn: trainMonster_ },
  careMonster: { roles: ['player'], write: true, fn: careMonster_ },
  claimDailySupply: { roles: ['player'], write: true, fn: claimDailySupply_ },
  explore: { roles: ['player'], write: true, fn: explore_ },
  leaveEncounter: { roles: ['player'], write: true, fn: leaveEncounter_ },
  capture: { roles: ['player'], write: true, fn: capture_ },
  evolveMonster: { roles: ['player'], write: true, fn: evolveMonster_ },
  submitQuiz: { roles: ALL_ROLES, write: true, fn: submitQuiz_ },
  // 遊戲管理
  adminListTasks: { roles: COACH, fn: adminListTasks_ },
  upsertTask: { roles: COACH, write: true, fn: upsertTask_ },
  setTaskActive: { roles: COACH, write: true, fn: setTaskActive_ },
  reviewCompletion: { roles: COACH, write: true, fn: reviewCompletion_ },
  importTasks: { roles: COACH, write: true, fn: importTasks_ },
  importMonsters: { roles: COACH, write: true, fn: importMonsters_ },
  updateMonster: { roles: COACH, write: true, fn: updateMonster_ },
  grantExp: { roles: COACH, write: true, fn: grantExp_ },
  adminGameOverview: { roles: COACH, fn: adminGameOverview_ },
  // 帳號管理
  adminListUsers: { roles: COACH, fn: adminListUsers_ },
  adminCreatePlayer: { roles: COACH, write: true, fn: adminCreatePlayer_ },
  adminUpdatePlayer: { roles: COACH, write: true, fn: adminUpdatePlayer_ },
  adminCreateUser: { roles: COACH, write: true, fn: adminCreateUser_ },
  adminUpdateUser: { roles: COACH, write: true, fn: adminUpdateUser_ },
  adminResetCode: { roles: COACH, write: true, fn: adminResetCode_ },
  adminSetPlayerActive: { roles: COACH, write: true, fn: adminSetPlayerActive_ },
  adminDeletePlayer: { roles: COACH, write: true, fn: adminDeletePlayer_ },
  // 邀請碼：教練產生，家長／老師用邀請碼自己設定帳號與密碼
  register: { public: true, write: true, fn: register_ },
  adminCreateInvite: { roles: COACH, write: true, fn: adminCreateInvite_ },
  adminListInvites: { roles: COACH, fn: adminListInvites_ },
  adminRevokeInvite: { roles: COACH, write: true, fn: adminRevokeInvite_ },
  // 三方平台
  hubSummary: { roles: HUB, fn: hubSummary_ },
  postMessage: { roles: HUB, write: true, fn: postMessage_ },
  deleteMessage: { roles: HUB, write: true, fn: deleteMessage_ },
  hubRoster: { roles: HUB, fn: hubRoster_ },
  saveSchoolRecord: { roles: STAFF, write: true, fn: saveSchoolRecord_ },
  deleteSchoolRecord: { roles: STAFF, write: true, fn: deleteSchoolRecord_ },
  listEvents: { roles: ALL_ROLES, fn: listEvents_ },
  saveEvent: { roles: STAFF, write: true, fn: saveEvent_ },
  deleteEvent: { roles: STAFF, write: true, fn: deleteEvent_ },
  adminSetUserActive: { roles: COACH, write: true, fn: adminSetUserActive_ },
  listAudit: { roles: COACH, fn: listAudit_ },
  adminCreatePlayerAccount: { roles: COACH, write: true, fn: adminCreatePlayerAccount_ },
  // 匯入舊體能檢測資料（預覽不寫入；確認後才寫入）
  adminPreviewLegacyImport: { roles: COACH, fn: (ctx) => ({ preview: summarizeLegacyPlan_(planLegacyImportFromUrl_(ctx.payload.sheetUrl)) }) },
  adminRunLegacyImport: { roles: COACH, write: true, fn: adminRunLegacyImport_ },
  // 段考成績：教練輸入；球員看自己的、家長看子女的
  listExamScores: { roles: ALL_ROLES, fn: listExamScores_ },
  saveExamScores: { roles: COACH, write: true, fn: saveExamScores_ },
  deleteExamScore: { roles: COACH, write: true, fn: deleteExamScore_ },
  // 道具與對戰：所有結果由伺服器計算
  buyItem: { roles: ['player'], write: true, fn: buyItem_ },
  useItem: { roles: ['player'], write: true, fn: useItem_ },
  listOpponents: { roles: ['player'], fn: listOpponents_ },
  startBattle: { roles: ['player'], write: true, fn: startBattle_ },
  battleAction: { roles: ['player'], write: true, fn: battleAction_ },
  // 球隊管理：練球通知與賽事大家都看得到；出缺席、通訊錄、預算只有教練
  teamDbUrl: { roles: COACH, fn: () => ({ url: teamSpreadsheet_().getUrl() }) },
  listPractice: { roles: ALL_ROLES, fn: listPractice_ },
  savePracticeWeek: { roles: COACH, write: true, fn: savePracticeWeek_ },
  listAttendance: { roles: COACH, fn: listAttendance_ },
  saveAttendance: { roles: COACH, write: true, fn: saveAttendance_ },
  listProfiles: { roles: COACH, fn: listProfiles_ },
  saveProfile: { roles: COACH, write: true, fn: saveProfile_ },
  listBudget: { roles: COACH, fn: listBudget_ },
  saveBudgetItem: { roles: COACH, write: true, fn: saveBudgetItem_ },
  deleteBudgetItem: { roles: COACH, write: true, fn: deleteBudgetItem_ },
  saveTransaction: { roles: COACH, write: true, fn: saveTransaction_ },
  deleteTransaction: { roles: COACH, write: true, fn: deleteTransaction_ },
  listTournaments: { roles: ALL_ROLES, fn: listTournaments_ },
  saveTournament: { roles: COACH, write: true, fn: saveTournament_ },
  deleteTournament: { roles: COACH, write: true, fn: deleteTournament_ },
  saveGame: { roles: COACH, write: true, fn: saveGame_ },
  deleteGame: { roles: COACH, write: true, fn: deleteGame_ },
};

function doGet() {
  return json_({ ok: true, data: ROUTES.ping.fn() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST', error: '請求格式錯誤。' });
  }
  return text_(handle_(req));
}

/** 處理一個請求並回傳 JSON 字串（runSelfTests 也直接呼叫這裡） */
function handle_(req) {
  const cache = CacheService.getScriptCache();
  try {
    const route = ROUTES[req && req.action];
    if (!route) throw apiError_('NOT_FOUND', '未知的操作。');
    // requestId 與 token 綁在一起，別人無法用同一個 requestId 取得你的結果
    const requestId = typeof req.requestId === 'string' && req.requestId.length <= 64 ? 'req_' + String(req.token || '').slice(0, 64) + '_' + req.requestId : '';
    if (route.write && requestId) {
      const done = cache.get(requestId);
      if (done) return done; // 重複提交：直接回傳第一次的結果，不重複寫入
    }
    const ctx = {
      actor: route.public ? null : requireSession_(req.token),
      token: req.token,
      payload: req.payload && typeof req.payload === 'object' ? req.payload : {},
    };
    if (!route.public) {
      if (!Array.isArray(route.roles)) throw apiError_('SERVER', '此操作未設定權限。'); // 沒宣告角色的 API 一律拒絕
      requireRole_(ctx.actor, route.roles);
    }
    const data = route.write ? withLock_(() => route.fn(ctx)) : route.fn(ctx);
    const out = JSON.stringify({ ok: true, data: data });
    if (route.write && requestId) cache.put(requestId, out, REQUEST_CACHE_SECONDS);
    return out;
  } catch (err) {
    if (err && err.apiCode) return JSON.stringify({ ok: false, code: err.apiCode, error: err.message });
    console.error(err && err.stack ? err.stack : err);
    return JSON.stringify({ ok: false, code: 'SERVER', error: '伺服器發生錯誤，請稍後再試。' });
  }
}

// ───────────────────────── 登入與工作階段 ─────────────────────────

function login_(ctx) {
  const loginId = str_(ctx.payload.loginId, '帳號', { required: true, max: 40 }).toLowerCase();
  const code = str_(ctx.payload.code, '登入碼', { required: true, max: 40 });
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + loginId;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) throw apiError_('LOCKED', '登入失敗次數過多，請 10 分鐘後再試。');
  const u = readAll_('Users').find((x) => x.loginId.toLowerCase() === loginId);
  if (!u || u.active !== 'TRUE' || hashCode_(u.codeSalt, code) !== u.codeHash) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    throw apiError_('AUTH', '帳號或登入碼不正確。');
  }
  cache.remove(failKey);
  return { token: newSession_(u), user: publicUser_(u) };
}

/** 工作階段記住登入碼雜湊的片段；登入碼一旦變更或重設，舊的工作階段就失效 */
function newSession_(u) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({ userId: u.id, stamp: String(u.codeHash).slice(0, 16) }), SESSION_SECONDS);
  return token;
}

function logout_(ctx) {
  CacheService.getScriptCache().remove('sess_' + ctx.token);
  return { loggedOut: true };
}

function requireSession_(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw apiError_('AUTH', '尚未登入，請先登入。');
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw apiError_('AUTH', '登入已過期，請重新登入。');
  const sess = JSON.parse(raw);
  // 每次都重新讀取帳號，確保停用或角色變更立即生效
  const u = readAll_('Users').find((x) => x.id === sess.userId);
  if (!u || u.active !== 'TRUE') throw apiError_('AUTH', '此帳號已停用，請聯絡教練。');
  if (sess.stamp !== String(u.codeHash).slice(0, 16)) throw apiError_('AUTH', '登入碼已變更，請重新登入。');
  return u;
}

/** 使用者修改自己的登入碼（需要輸入目前的登入碼） */
function changeMyCode_(ctx) {
  const a = ctx.actor;
  const oldCode = str_(ctx.payload.oldCode, '目前的登入碼', { required: true, max: 40 });
  if (hashCode_(a.codeSalt, oldCode) !== a.codeHash) throw apiError_('INVALID', '目前的登入碼不正確。');
  const newCode = validNewCode_(ctx.payload.newCode, '新的登入碼');
  if (newCode === oldCode) throw apiError_('INVALID', '新的登入碼不能和目前的相同。');
  const salt = Utilities.getUuid();
  const updated = Object.assign({}, a, { codeSalt: salt, codeHash: hashCode_(salt, newCode), updatedAt: nowIso_() });
  updateRow_('Users', a._row, updated);
  CacheService.getScriptCache().remove('sess_' + ctx.token);
  audit_(a, '修改自己的登入碼', a.id, a.displayName);
  return { token: newSession_(updated) };
}

function publicUser_(u) {
  return {
    id: u.id,
    loginId: u.loginId,
    displayName: u.displayName,
    role: u.role,
    playerId: u.playerId || undefined,
    childPlayerIds: u.childPlayerIds ? u.childPlayerIds.split(',').filter(String) : [],
    active: u.active === 'TRUE',
    createdAt: u.createdAt,
  };
}

// ───────────────────────── 權限 ─────────────────────────

function requireRole_(actor, roles) {
  if (roles.indexOf(actor.role) < 0) throw apiError_('FORBIDDEN', '權限不足，無法執行此操作。');
}

/** 可以讀取這位球員資料的人：教練、球員本人 */
function requireCanReadPlayer_(actor, playerId) {
  if (actor.role === 'coach') return;
  if (actor.role === 'player' && actor.playerId === playerId) return;
  throw apiError_('FORBIDDEN', '只能查看自己的資料。');
}

// ───────────────────────── 球員 ─────────────────────────

function listPlayers_(ctx) {
  const a = ctx.actor;
  const all = readAll_('Players').map(parsePlayer_);
  if (seesAllStudents_(a)) return { players: all };
  if (a.role === 'player') return { players: all.filter((p) => p.id === a.playerId) };
  const kids = a.childPlayerIds ? a.childPlayerIds.split(',') : [];
  return { players: all.filter((p) => kids.indexOf(p.id) >= 0) };
}

function parsePlayer_(r) {
  return { id: r.id, name: r.name, number: r.number, grade: r.grade, position: r.position, active: r.active === 'TRUE', createdAt: r.createdAt };
}

// ───────────────────────── 每日筆記 ─────────────────────────

const NOTE_FIELDS = [
  ['training', '當日訓練內容', 1000, true],
  ['learned', '今日學到的事情', 1000, false],
  ['improve', '需要改進的地方', 1000, false],
  ['tomorrowPrep', '明日訓練準備', 1000, false],
  ['shortGoal', '短期目標', 300, false],
  ['midGoal', '中期目標', 300, false],
  ['longGoal', '長期目標', 300, false],
];

function listNotes_(ctx) {
  const playerId = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  requireCanReadPlayer_(ctx.actor, playerId);
  const notes = readAll_('DailyNotes').filter((n) => n.playerId === playerId).map(parseNote_);
  notes.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { notes: notes };
}

function parseNote_(r) {
  return {
    id: r.id, playerId: r.playerId, date: r.date, training: r.training, learned: r.learned, improve: r.improve,
    tomorrowPrep: r.tomorrowPrep, shortGoal: r.shortGoal, midGoal: r.midGoal, longGoal: r.longGoal,
    selfChecks: parseJson_(r.selfChecks, {}), coachComment: r.coachComment, coachCommentBy: r.coachCommentBy || undefined,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

/** 球員新增或更新自己的筆記；同一球員同一天只有一筆（在鎖內檢查） */
function saveNote_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  requireRole_(a, ['player']);
  if (!a.playerId || p.playerId !== a.playerId) throw apiError_('FORBIDDEN', '只能編輯自己的筆記。');
  requireActivePlayer_(a.playerId);
  const date = dateStr_(p.date, '日期');
  if (date > today_()) throw apiError_('INVALID', '不能建立未來日期的筆記。');
  const fields = {};
  NOTE_FIELDS.forEach((f) => (fields[f[0]] = str_(p[f[0]], f[1], { required: f[3], max: f[2] })));
  const checks = {};
  const raw = p.selfChecks && typeof p.selfChecks === 'object' ? p.selfChecks : {};
  SELF_CHECK_KEYS.forEach((k) => {
    if (raw[k] !== undefined) checks[k] = raw[k] === true;
  });
  const now = nowIso_();
  const existing = readAll_('DailyNotes').find((n) => n.playerId === a.playerId && n.date === date);
  let row;
  if (existing) {
    row = Object.assign({}, existing, fields, { selfChecks: JSON.stringify(checks), updatedAt: now });
    updateRow_('DailyNotes', existing._row, row);
  } else {
    row = Object.assign({ id: newId_('N'), playerId: a.playerId, date: date }, fields, {
      selfChecks: JSON.stringify(checks), coachComment: '', coachCommentBy: '', createdAt: now, updatedAt: now,
    });
    appendRow_('DailyNotes', row);
  }
  return { note: parseNote_(row), created: !existing };
}

function commentNote_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const noteId = str_(ctx.payload.noteId, '筆記', { required: true, max: 40 });
  const comment = str_(ctx.payload.comment, '教練評語', { max: 500 });
  const note = readAll_('DailyNotes').find((n) => n.id === noteId);
  if (!note) throw apiError_('NOT_FOUND', '找不到這筆筆記。');
  const row = Object.assign({}, note, { coachComment: comment, coachCommentBy: a.displayName, updatedAt: nowIso_() });
  updateRow_('DailyNotes', note._row, row);
  audit_(a, '撰寫筆記評語', note.playerId, note.date);
  return { note: parseNote_(row) };
}

// ───────────────────────── 體能檢測 ─────────────────────────

function listFitness_(ctx) {
  const playerId = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  requireCanReadPlayer_(ctx.actor, playerId);
  return { records: readAll_('FitnessTests').filter((f) => f.playerId === playerId).map(parseFitness_) };
}

function parseFitness_(r) {
  return { id: r.id, playerId: r.playerId, date: r.date, item: r.item, value: Number(r.value), unit: r.unit, note: r.note, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

function validFitness_(p) {
  const item = FITNESS_ITEMS[p.item];
  if (!item) throw apiError_('INVALID', '未知的檢測項目。');
  const date = dateStr_(p.date, '檢測日期');
  if (date > today_()) throw apiError_('INVALID', '檢測日期不能是未來日期。');
  const value = Number(p.value);
  if (typeof p.value !== 'number' || !isFinite(value) || value < item.min || value > item.max) {
    throw apiError_('INVALID', item.label + '的數值超出合理範圍（' + item.min + '～' + item.max + ' ' + item.unit + '）。');
  }
  if (item.integer && Math.round(value) !== value) throw apiError_('INVALID', '次數必須是整數。');
  return { item: p.item, date: date, value: Math.round(value * 100) / 100, unit: item.unit, note: str_(p.note, '備註', { max: 200 }), label: item.label };
}

function addFitness_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const playerId = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  if (!readAll_('Players').some((p) => p.id === playerId)) throw apiError_('NOT_FOUND', '找不到這位球員。');
  const v = validFitness_(ctx.payload);
  const now = nowIso_();
  const row = { id: newId_('F'), playerId: playerId, date: v.date, item: v.item, value: v.value, unit: v.unit, note: v.note, createdBy: a.displayName, createdAt: now, updatedAt: now };
  appendRow_('FitnessTests', row);
  audit_(a, '新增體能檢測', playerId, v.label + ' ' + v.value + v.unit + '（' + v.date + '）');
  return { record: parseFitness_(stringify_(row)) };
}

function updateFitness_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const id = str_(ctx.payload.id, '紀錄', { required: true, max: 40 });
  const rec = readAll_('FitnessTests').find((f) => f.id === id);
  if (!rec) throw apiError_('NOT_FOUND', '找不到這筆檢測紀錄。');
  const v = validFitness_(ctx.payload);
  const row = Object.assign({}, rec, { date: v.date, item: v.item, value: v.value, unit: v.unit, note: v.note, updatedAt: nowIso_() });
  updateRow_('FitnessTests', rec._row, row);
  audit_(a, '修改體能檢測', rec.playerId, v.label + '：' + rec.value + rec.unit + ' → ' + v.value + v.unit);
  return { record: parseFitness_(stringify_(row)) };
}

function deleteFitness_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const id = str_(ctx.payload.id, '紀錄', { required: true, max: 40 });
  const rec = readAll_('FitnessTests').find((f) => f.id === id);
  if (!rec) throw apiError_('NOT_FOUND', '找不到這筆檢測紀錄（可能已被刪除）。');
  deleteRow_('FitnessTests', rec._row);
  audit_(a, '刪除體能檢測', rec.playerId, (FITNESS_ITEMS[rec.item] ? FITNESS_ITEMS[rec.item].label : rec.item) + ' ' + rec.value + rec.unit + '（' + rec.date + '）');
  return { deleted: id };
}

// ───────────────────────── 目標 ─────────────────────────

function parseGoal_(r) {
  return {
    id: r.id, playerId: r.playerId, term: r.term, content: r.content, criteria: r.criteria, startDate: r.startDate, dueDate: r.dueDate,
    status: r.status, checkpoints: parseJson_(r.checkpoints, []), createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

/** 教練：不指定 playerId 時回傳全隊；球員：只能讀自己的 */
function listGoals_(ctx) {
  const a = ctx.actor;
  const playerId = str_(ctx.payload.playerId, '球員', { max: 20 });
  if (!playerId && a.role !== 'coach') throw apiError_('FORBIDDEN', '只能查看自己的資料。');
  if (playerId) requireCanReadPlayer_(a, playerId);
  const goals = readAll_('Goals').filter((g) => !playerId || g.playerId === playerId).map(parseGoal_);
  return { goals: goals };
}

function createGoal_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const playerId = str_(p.playerId, '球員', { required: true, max: 20 });
  if (a.role === 'player' && a.playerId !== playerId) throw apiError_('FORBIDDEN', '只能為自己建立目標。');
  requireActivePlayer_(playerId);
  if (GOAL_TERMS.indexOf(p.term) < 0) throw apiError_('INVALID', '目標類型不正確。');
  const startDate = dateStr_(p.startDate, '開始日');
  const dueDate = dateStr_(p.dueDate, '期限');
  if (dueDate < startDate) throw apiError_('INVALID', '期限不能早於開始日。');
  const labels = (Array.isArray(p.checkpoints) ? p.checkpoints : []).map((c) => str_(c, '檢核點', { max: 100 })).filter(String);
  if (labels.length < 1 || labels.length > 10) throw apiError_('INVALID', '請設定 1～10 個檢核點，進度會依檢核點計算。');
  const now = nowIso_();
  const row = {
    id: newId_('G'), playerId: playerId, term: p.term,
    content: str_(p.content, '目標內容', { required: true, max: 200 }),
    criteria: str_(p.criteria, '完成條件', { required: true, max: 300 }),
    startDate: startDate, dueDate: dueDate, status: 'active',
    checkpoints: JSON.stringify(labels.map((label, i) => ({ id: 'C' + (i + 1), label: label, state: 'todo' }))),
    createdBy: a.displayName, createdAt: now, updatedAt: now,
  };
  appendRow_('Goals', row);
  if (a.role === 'coach') audit_(a, '建立球員目標', playerId, row.content);
  return { goal: parseGoal_(row) };
}

function findGoal_(goalId) {
  const id = str_(goalId, '目標', { required: true, max: 40 });
  const g = readAll_('Goals').find((x) => x.id === id);
  if (!g) throw apiError_('NOT_FOUND', '找不到這個目標。');
  return g;
}

/** 球員只能「申請」完成檢核點，不能自己把進度改成完成 */
function submitCheckpoint_(ctx) {
  const a = ctx.actor;
  const g = findGoal_(ctx.payload.goalId);
  if (g.playerId !== a.playerId) throw apiError_('FORBIDDEN', '只能操作自己的目標。');
  if (g.status !== 'active') throw apiError_('INVALID', '這個目標已結束，無法再申請。');
  const cps = parseJson_(g.checkpoints, []);
  const cp = cps.find((c) => c.id === ctx.payload.checkpointId);
  if (!cp) throw apiError_('NOT_FOUND', '找不到檢核點。');
  if (cp.state !== 'todo') throw apiError_('INVALID', cp.state === 'submitted' ? '已送出申請，請等待教練確認。' : '此檢核點已核准。');
  cp.state = 'submitted';
  cp.submittedAt = nowIso_();
  const row = Object.assign({}, g, { checkpoints: JSON.stringify(cps), updatedAt: nowIso_() });
  updateRow_('Goals', g._row, row);
  return { goal: parseGoal_(row) };
}

function reviewCheckpoint_(ctx) {
  const a = ctx.actor;
  const g = findGoal_(ctx.payload.goalId);
  const approve = ctx.payload.approve === true;
  const cps = parseJson_(g.checkpoints, []);
  const cp = cps.find((c) => c.id === ctx.payload.checkpointId);
  if (!cp) throw apiError_('NOT_FOUND', '找不到檢核點。');
  if (cp.state !== 'submitted') throw apiError_('INVALID', '此檢核點目前不需要審核。');
  cp.state = approve ? 'approved' : 'todo';
  cp.reviewedBy = a.displayName;
  cp.reviewedAt = nowIso_();
  const allDone = cps.every((c) => c.state === 'approved');
  const row = Object.assign({}, g, { checkpoints: JSON.stringify(cps), status: allDone ? 'completed' : g.status, updatedAt: nowIso_() });
  updateRow_('Goals', g._row, row);
  audit_(a, approve ? '核准目標檢核點' : '退回目標檢核點', g.playerId, g.content + '／' + cp.label);
  return { goal: parseGoal_(row) };
}

function setGoalStatus_(ctx) {
  const a = ctx.actor;
  const g = findGoal_(ctx.payload.goalId);
  if (GOAL_STATUSES.indexOf(ctx.payload.status) < 0) throw apiError_('INVALID', '目標狀態不正確。');
  const row = Object.assign({}, g, { status: ctx.payload.status, updatedAt: nowIso_() });
  updateRow_('Goals', g._row, row);
  audit_(a, '變更目標狀態', g.playerId, g.content + ' → ' + ctx.payload.status);
  return { goal: parseGoal_(row) };
}

function goalSettings_() {
  return parseJson_(PropertiesService.getScriptProperties().getProperty('goalSettings'), DEFAULT_GOAL_SETTINGS);
}

function updateGoalSettings_(ctx) {
  const a = ctx.actor;
  const input = Array.isArray(ctx.payload.settings) ? ctx.payload.settings : [];
  const next = goalSettings_().map((s) => {
    const n = input.find((x) => x && x.term === s.term);
    if (!n) return s;
    const days = Number(n.defaultDays);
    if (!(Math.round(days) === days && days >= 1 && days <= 400)) throw apiError_('INVALID', '「預設天數」必須是 1～400 的整數。');
    return { term: s.term, label: str_(n.label, '目標名稱', { required: true, max: 20 }), periodHint: str_(n.periodHint, '期限說明', { required: true, max: 40 }), defaultDays: days };
  });
  PropertiesService.getScriptProperties().setProperty('goalSettings', JSON.stringify(next));
  audit_(a, '調整目標期限設定', 'goalSettings', next.map((s) => s.label + s.defaultDays + '天').join('、'));
  return { settings: next };
}

// ───────────────────────── 球隊規章 ─────────────────────────

function parseRule_(r) {
  return {
    id: r.id, no: Number(r.no), title: r.title, content: r.content, category: r.category, version: Number(r.version) || 1,
    updatedAt: r.updatedAt, updatedBy: r.updatedBy, needsCoachReview: r.needsCoachReview === 'TRUE', reviewNote: r.reviewNote, isAnnouncement: r.isAnnouncement === 'TRUE',
  };
}

function listRules_(ctx) {
  const rules = readAll_('Rules').map(parseRule_).sort((x, y) => x.no - y.no);
  // 「待教練確認」的內部備註只給教練看
  if (ctx.actor.role !== 'coach') rules.forEach((r) => { r.needsCoachReview = false; r.reviewNote = ''; });
  return { rules: rules };
}

function ruleFields_(p) {
  return {
    title: str_(p.title, '標題', { required: true, max: 40 }),
    content: str_(p.content, '規章內容', { required: true, max: 1000 }),
    category: str_(p.category, '分類', { required: true, max: 20 }),
    isAnnouncement: p.isAnnouncement === true,
    needsCoachReview: p.needsCoachReview === true,
    reviewNote: str_(p.reviewNote, '確認備註', { max: 200 }),
  };
}

function updateRule_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.id, '規章', { required: true, max: 20 });
  const r = readAll_('Rules').find((x) => x.id === id);
  if (!r) throw apiError_('NOT_FOUND', '找不到這條規章。');
  const version = (Number(r.version) || 1) + 1;
  const row = Object.assign({}, r, ruleFields_(ctx.payload), { version: version, updatedAt: nowIso_(), updatedBy: a.displayName });
  updateRow_('Rules', r._row, row);
  audit_(a, '修改球隊規章', r.id, '第 ' + r.no + ' 條 → 第 ' + version + ' 版');
  return { rule: parseRule_(stringify_(row)) };
}

/** 規章工作表是空的時候，匯入網頁內建的 17 條規章（依規章圖片輸入的版本） */
function importRules_(ctx) {
  const a = ctx.actor;
  if (readAll_('Rules').length > 0) throw apiError_('INVALID', '雲端已經有規章資料，不重複匯入。');
  const list = Array.isArray(ctx.payload.rules) ? ctx.payload.rules : [];
  if (list.length < 1 || list.length > 50) throw apiError_('INVALID', '規章數量不正確。');
  const now = nowIso_();
  list.forEach((p, i) => {
    const no = Number(p.no);
    if (no !== i + 1) throw apiError_('INVALID', '規章條號必須從 1 開始連續編號。');
    appendRow_('Rules', Object.assign({ id: 'R' + ('0' + no).slice(-2), no: no, version: 1, updatedAt: now, updatedBy: a.displayName }, ruleFields_(p)));
  });
  audit_(a, '匯入球隊規章', 'Rules', list.length + ' 條');
  return { imported: list.length };
}

// ───────────────────────── 防護知識 ─────────────────────────

function parseArticle_(r) {
  return {
    id: r.id, title: r.title, category: r.category, audience: r.audience ? r.audience.split(',') : [], summary: r.summary,
    details: parseJson_(r.details, []), cautions: parseJson_(r.cautions, []), sources: parseJson_(r.sources, []),
    updatedAt: r.updatedAt, status: r.status, reviewed: r.reviewed === 'TRUE', quiz: parseJson_(r.quiz, []),
  };
}

function listArticles_(ctx) {
  const a = ctx.actor;
  let list = readAll_('KnowledgeArticles').map(parseArticle_);
  if (a.role !== 'coach') {
    list = list.filter((x) => x.status === 'published' && x.audience.indexOf(a.role) >= 0);
    // 測驗答案只留在伺服器，由 submitQuiz 批改，避免直接從資料看到答案
    list.forEach((x) => (x.quiz = x.quiz.map((q) => ({ question: q.question, options: q.options }))));
  }
  return { articles: list };
}

function lines_(arr, label, maxItems) {
  const list = (Array.isArray(arr) ? arr : []).map((s) => str_(s, label, { max: 300 })).filter(String);
  if (list.length > maxItems) throw apiError_('INVALID', '「' + label + '」最多 ' + maxItems + ' 項。');
  return list;
}

function articleFields_(p) {
  if (KNOWLEDGE_CATEGORIES.indexOf(p.category) < 0) throw apiError_('INVALID', '文章分類不正確。');
  const audience = (Array.isArray(p.audience) ? p.audience : []).filter((r) => ALL_ROLES.indexOf(r) >= 0);
  if (audience.length === 0) throw apiError_('INVALID', '請至少選擇一個適用對象。');
  const details = lines_(p.details, '詳細說明', 20);
  const sources = lines_(p.sources, '參考來源', 10);
  if (details.length === 0) throw apiError_('INVALID', '請至少填寫一段詳細說明。');
  if (sources.length === 0) throw apiError_('INVALID', '健康與防護內容必須註明參考來源。');
  const quiz = (Array.isArray(p.quiz) ? p.quiz : []).map((q) => {
    const options = (Array.isArray(q && q.options) ? q.options : []).map((o) => str_(o, '選項', { required: true, max: 100 }));
    const answerIndex = Number(q && q.answerIndex);
    if (options.length < 2 || options.length > 6 || !(answerIndex >= 0 && answerIndex < options.length && Math.round(answerIndex) === answerIndex)) {
      throw apiError_('INVALID', '測驗題目的選項或答案不正確。');
    }
    return { question: str_(q.question, '測驗題目', { required: true, max: 200 }), options: options, answerIndex: answerIndex, explanation: str_(q.explanation, '解說', { max: 300 }) };
  });
  if (quiz.length > 10) throw apiError_('INVALID', '測驗最多 10 題。');
  return {
    title: str_(p.title, '標題', { required: true, max: 60 }), category: p.category, audience: audience.join(','),
    summary: str_(p.summary, '內容摘要', { required: true, max: 300 }),
    details: JSON.stringify(details), cautions: JSON.stringify(lines_(p.cautions, '注意事項', 20)), sources: JSON.stringify(sources),
    reviewed: p.reviewed === true, quiz: JSON.stringify(quiz),
  };
}

function upsertArticle_(ctx) {
  const a = ctx.actor;
  const f = articleFields_(ctx.payload);
  const id = str_(ctx.payload.id, '文章', { max: 40 });
  if (id) {
    const r = readAll_('KnowledgeArticles').find((x) => x.id === id);
    if (!r) throw apiError_('NOT_FOUND', '找不到這篇文章。');
    const row = Object.assign({}, r, f, { updatedAt: today_() });
    updateRow_('KnowledgeArticles', r._row, row);
    audit_(a, '修改防護知識', id, f.title);
    return { article: parseArticle_(stringify_(row)) };
  }
  const row = Object.assign({ id: newId_('K'), status: 'draft', updatedAt: today_() }, f);
  appendRow_('KnowledgeArticles', row);
  audit_(a, '新增防護知識（草稿）', row.id, f.title);
  return { article: parseArticle_(stringify_(row)) };
}

function setArticleStatus_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.id, '文章', { required: true, max: 40 });
  const status = ctx.payload.status;
  if (PUBLISH_STATUSES.indexOf(status) < 0) throw apiError_('INVALID', '狀態不正確。');
  const r = readAll_('KnowledgeArticles').find((x) => x.id === id);
  if (!r) throw apiError_('NOT_FOUND', '找不到這篇文章。');
  const row = Object.assign({}, r, { status: status });
  updateRow_('KnowledgeArticles', r._row, row);
  audit_(a, status === 'published' ? '發布防護知識' : status === 'archived' ? '下架防護知識' : '防護知識改為草稿', id, r.title);
  return { article: parseArticle_(row) };
}

/** 知識庫是空的時候，匯入網頁內建的示範文章；一律存為草稿，教練審閱後再發布 */
function importArticles_(ctx) {
  const a = ctx.actor;
  if (readAll_('KnowledgeArticles').length > 0) throw apiError_('INVALID', '雲端已經有知識文章，不重複匯入。');
  const list = Array.isArray(ctx.payload.articles) ? ctx.payload.articles : [];
  if (list.length < 1 || list.length > 30) throw apiError_('INVALID', '文章數量不正確。');
  list.forEach((p) => appendRow_('KnowledgeArticles', Object.assign({ id: newId_('K'), status: 'draft', updatedAt: today_() }, articleFields_(p))));
  audit_(a, '匯入防護知識（草稿）', 'KnowledgeArticles', list.length + ' 篇');
  return { imported: list.length };
}

// ───────────────────────── 公告 ─────────────────────────

function parseAnnouncement_(r) {
  return {
    id: r.id, title: r.title, body: r.body, audience: r.audience ? r.audience.split(',') : [], pinned: r.pinned === 'TRUE',
    status: r.status, publishedAt: r.publishedAt || undefined, createdBy: r.createdBy, updatedAt: r.updatedAt,
  };
}

/** 球員與家長只看得到「已發布」且開放給自己角色的公告 */
function listAnnouncements_(ctx) {
  const a = ctx.actor;
  let list = readAll_('Announcements').map(parseAnnouncement_);
  if (a.role !== 'coach') list = list.filter((x) => x.status === 'published' && x.audience.indexOf(a.role) >= 0);
  return { announcements: list };
}

function upsertAnnouncement_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const audience = (Array.isArray(p.audience) ? p.audience : []).filter((r) => ALL_ROLES.indexOf(r) >= 0);
  if (audience.length === 0) throw apiError_('INVALID', '請至少選擇一個可閱讀的對象。');
  const f = {
    title: str_(p.title, '公告標題', { required: true, max: 60 }),
    body: str_(p.body, '公告內容', { required: true, max: 2000 }),
    audience: audience.join(','),
    pinned: p.pinned === true,
    updatedAt: nowIso_(),
  };
  const id = str_(p.id, '公告', { max: 40 });
  if (id) {
    const r = readAll_('Announcements').find((x) => x.id === id);
    if (!r) throw apiError_('NOT_FOUND', '找不到這則公告。');
    const row = Object.assign({}, r, f);
    updateRow_('Announcements', r._row, row);
    audit_(a, '修改公告', id, f.title);
    return { announcement: parseAnnouncement_(stringify_(row)) };
  }
  const row = Object.assign({ id: newId_('A'), status: 'draft', publishedAt: '', createdBy: a.displayName }, f);
  appendRow_('Announcements', row);
  audit_(a, '新增公告（草稿）', row.id, f.title);
  return { announcement: parseAnnouncement_(stringify_(row)) };
}

function setAnnouncementStatus_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.id, '公告', { required: true, max: 40 });
  const status = ctx.payload.status;
  if (PUBLISH_STATUSES.indexOf(status) < 0) throw apiError_('INVALID', '狀態不正確。');
  const r = readAll_('Announcements').find((x) => x.id === id);
  if (!r) throw apiError_('NOT_FOUND', '找不到這則公告。');
  const now = nowIso_();
  const row = Object.assign({}, r, { status: status, updatedAt: now, publishedAt: status === 'published' ? now : r.publishedAt });
  updateRow_('Announcements', r._row, row);
  audit_(a, status === 'published' ? '發布公告' : status === 'archived' ? '下架公告' : '公告改為草稿', id, r.title);
  return { announcement: parseAnnouncement_(row) };
}

// ───────────────────────── 遊戲：資料轉換 ─────────────────────────

function parseTask_(r) {
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, repeat: r.repeat, verify: r.verify,
    expReward: Number(r.expReward) || 0, pointReward: Number(r.pointReward) || 0, ballReward: Number(r.ballReward) || 0, active: r.active === 'TRUE',
  };
}

function parseCompletion_(r) {
  return {
    id: r.id, taskId: r.taskId, playerId: r.playerId, periodKey: r.periodKey, status: r.status, submittedAt: r.submittedAt,
    reviewedBy: r.reviewedBy || undefined, reviewedAt: r.reviewedAt || undefined, claimedAt: r.claimedAt || undefined,
  };
}

function parseMonster_(r) {
  return {
    id: r.id, dexNo: Number(r.dexNo), name: r.name, element: r.element, rarity: Number(r.rarity) || 1, stage: Number(r.stage) || 1,
    evolvesTo: r.evolvesTo || undefined, evolveLevel: r.evolveLevel ? Number(r.evolveLevel) : undefined, description: r.description,
    habitat: r.habitat, catchRate: Number(r.catchRate) || 0, isStarter: r.isStarter === 'TRUE', inWild: r.inWild === 'TRUE',
    evolveAffection: r.evolvesTo ? evolveAffectionOf_(r) : undefined,
  };
}

/** 進化需要的親密度；0 代表用等級進化 */
function evolveAffectionOf_(m) {
  const raw = m.evolveAffection;
  if (raw === '' || raw === undefined || raw === null) return AFFECTION_EVOLVE_DEFAULTS[m.id] || 0;
  return Math.max(0, Number(raw) || 0);
}

function parsePM_(r) {
  return {
    id: r.id, playerId: r.playerId, monsterId: r.monsterId, nickname: r.nickname, level: Number(r.level) || 1, exp: Number(r.exp) || 0,
    partner: r.partner === 'TRUE', obtainedAt: r.obtainedAt, obtainedBy: r.obtainedBy,
    affection: Math.min(MAX_AFFECTION, Number(r.affection) || 0), careDate: r.careDate || '', careCounts: parseJson_(r.careCounts, {}),
  };
}

function parseWallet_(r) {
  return {
    playerId: r.playerId, points: Number(r.points) || 0, balls: Number(r.balls) || 0, exploreDate: r.exploreDate || '',
    exploreCount: Number(r.exploreCount) || 0, supplyDate: r.supplyDate || '',
    seenMonsterIds: r.seenMonsterIds ? r.seenMonsterIds.split(',').filter(String) : [],
    encounter: r.encounterMonsterId ? { monsterId: r.encounterMonsterId, areaId: r.encounterAreaId, at: r.encounterAt } : null,
    items: walletItems_(r),
    battleDate: r.battleDate || '',
    pveCount: Number(r.pveCount) || 0,
    pvpCount: Number(r.pvpCount) || 0,
  };
}

function walletItems_(w) {
  const raw = parseJson_(w.items, {});
  const out = {};
  Object.keys(ITEMS).forEach((k) => (out[k] = Math.max(0, Math.floor(Number(raw[k]) || 0))));
  return out;
}

/** 讀取球員錢包（還沒有時先給預設值，存檔時才寫入） */
function loadWallet_(playerId) {
  const r = readAll_('Wallets').find((x) => x.playerId === playerId);
  return r || { playerId: playerId, points: '0', balls: '0', exploreDate: '', exploreCount: '0', supplyDate: '', seenMonsterIds: '', encounterMonsterId: '', encounterAreaId: '', encounterAt: '', items: '', battleDate: '', pveCount: '0', pvpCount: '0' };
}

function saveWallet_(w) {
  const row = Object.assign({}, w, { updatedAt: nowIso_() });
  if (w._row) updateRow_('Wallets', w._row, row);
  else appendRow_('Wallets', row);
}

function addSeen_(w, monsterId) {
  const seen = w.seenMonsterIds ? w.seenMonsterIds.split(',').filter(String) : [];
  if (seen.indexOf(monsterId) < 0) seen.push(monsterId);
  w.seenMonsterIds = seen.join(',');
}

function expToNext_(level) {
  return 40 + level * 20;
}

function applyExp_(level, exp, gain) {
  let lv = level;
  let xp = exp + Math.max(0, gain);
  while (lv < GAME.maxLevel && xp >= expToNext_(lv)) {
    xp -= expToNext_(lv);
    lv += 1;
  }
  if (lv >= GAME.maxLevel) xp = 0;
  return { level: lv, exp: xp };
}

function isoWeekKey_(dateStr) {
  const p = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return dt.getUTCFullYear() + '-W' + ('0' + week).slice(-2);
}

function periodKey_(task, today) {
  if (task.repeat === 'daily') return today;
  if (task.repeat === 'weekly') return isoWeekKey_(today);
  return 'ONCE';
}

function progressLog_(playerId, pmId, gain, levelAfter, reason) {
  appendRow_('MonsterProgress', { id: newId_('MP'), playerId: playerId, playerMonsterId: pmId, expGain: gain, levelAfter: levelAfter, reason: reason, at: nowIso_() });
}

function rewardLog_(playerId, source, detail, exp, points, balls) {
  appendRow_('RewardLogs', { id: newId_('RL'), playerId: playerId, source: source, detail: detail, exp: exp, points: points, balls: balls, at: nowIso_() });
}

/** 球員的完整遊戲狀態；每個遊戲操作完成後都回傳最新狀態 */
function gameState_(playerId) {
  const today = today_();
  const tasks = readAll_('Tasks').map(parseTask_).filter((t) => t.active);
  const keys = {};
  tasks.forEach((t) => (keys[t.id] = periodKey_(t, today)));
  const byTime = (x, y) => (x.at < y.at ? 1 : -1);
  const monById = {};
  readAll_('Monsters').forEach((m) => (monById[m.id] = m));
  const nowMs = Date.now();
  const battles = readAll_('Battles');
  const active = battles.find((b) => b.playerId === playerId && b.status === 'active');
  return {
    today: today,
    wallet: parseWallet_(loadWallet_(playerId)),
    playerMonsters: readAll_('PlayerMonsters')
      .filter((x) => x.playerId === playerId)
      .map((r) => {
        const pm = parsePM_(r);
        const m = monById[r.monsterId];
        if (!m) return pm;
        const s = monsterStats_(m, pm.level);
        return Object.assign(pm, { maxHp: s.maxHp, hp: currentHp_(r, s.maxHp, nowMs), atk: s.atk, def: s.def, spd: s.spd });
      }),
    battle: active ? battleView_(active) : null,
    battleHistory: battles
      .filter((b) => b.status !== 'active' && (b.playerId === playerId || b.opponentPlayerId === playerId))
      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
      .slice(0, 10)
      .map((b) => battleSummary_(b, playerId)),
    progress: readAll_('MonsterProgress').filter((x) => x.playerId === playerId).map((r) => ({ id: r.id, playerId: r.playerId, playerMonsterId: r.playerMonsterId, expGain: Number(r.expGain), levelAfter: Number(r.levelAfter), reason: r.reason, at: r.at })).sort(byTime).slice(0, 15),
    rewardLogs: readAll_('RewardLogs').filter((x) => x.playerId === playerId).map((r) => ({ id: r.id, playerId: r.playerId, source: r.source, detail: r.detail, exp: Number(r.exp), points: Number(r.points), balls: Number(r.balls), at: r.at })).sort(byTime).slice(0, 15),
    tasks: tasks,
    completions: readAll_('TaskCompletions').filter((c) => c.playerId === playerId && keys[c.taskId] === c.periodKey).map(parseCompletion_),
    quizPassedArticleIds: readAll_('QuizPasses').filter((q) => q.playerId === playerId).map((q) => q.articleId).filter((v, i, arr) => arr.indexOf(v) === i),
  };
}

function requireGamePlayer_(actor) {
  if (!actor.playerId) throw apiError_('FORBIDDEN', '此帳號沒有對應的球員資料。');
  requireActivePlayer_(actor.playerId);
  return actor.playerId;
}

function findOwnPM_(actor, pmId) {
  const id = str_(pmId, '怪獸', { required: true, max: 40 });
  const pm = readAll_('PlayerMonsters').find((x) => x.id === id);
  if (!pm || pm.playerId !== actor.playerId) throw apiError_('FORBIDDEN', '只能操作自己的怪獸。');
  return pm;
}

// ───────────────────────── 遊戲：球員操作 ─────────────────────────

function listMonsters_() {
  return { monsters: readAll_('Monsters').map(parseMonster_).sort((x, y) => x.dexNo - y.dexNo) };
}

/** 球員只能看自己的；教練要指定球員 */
function getGameState_(ctx) {
  const a = ctx.actor;
  const asked = str_(ctx.payload.playerId, '球員', { max: 20 });
  if (a.role === 'player') {
    if (asked && asked !== a.playerId) throw apiError_('FORBIDDEN', '只能查看自己的資料。');
    return { state: gameState_(requireGamePlayer_(a)) };
  }
  if (!asked) throw apiError_('INVALID', '請指定球員。');
  return { state: gameState_(asked) };
}

/** 回報任務：同一期間只能有一筆有效回報；系統檢查型任務由伺服器驗證是否真的完成 */
function submitTask_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const id = str_(ctx.payload.taskId, '任務', { required: true, max: 40 });
  const t = readAll_('Tasks').find((x) => x.id === id);
  if (!t || t.active !== 'TRUE') throw apiError_('INVALID', '此任務目前未開放。');
  const task = parseTask_(t);
  const today = today_();
  const key = periodKey_(task, today);
  const dup = readAll_('TaskCompletions').some((c) => c.taskId === id && c.playerId === playerId && c.periodKey === key && c.status !== 'rejected');
  if (dup) throw apiError_('INVALID', '這個任務在本期已經回報過了，不能重複提交。');
  let status = 'submitted';
  if (task.verify === 'note_today') {
    const ok = readAll_('DailyNotes').some((n) => n.playerId === playerId && n.date === today && n.training);
    if (!ok) throw apiError_('INVALID', '系統沒有找到你今天的棒球筆記，請先完成今日筆記。');
    status = 'approved';
  } else if (task.verify === 'quiz_week') {
    const week = isoWeekKey_(today);
    const ok = readAll_('QuizPasses').some((q) => q.playerId === playerId && isoWeekKey_(q.date) === week);
    if (!ok) throw apiError_('INVALID', '本週還沒有通過防護知識測驗，請先到防護知識庫完成測驗。');
    status = 'approved';
  }
  const now = nowIso_();
  appendRow_('TaskCompletions', {
    id: newId_('TC'), taskId: id, playerId: playerId, periodKey: key, status: status, submittedAt: now,
    reviewedBy: status === 'approved' ? '系統檢查' : '', reviewedAt: status === 'approved' ? now : '', claimedAt: '',
  });
  return { status: status, state: gameState_(playerId) };
}

/** 領取獎勵：只有「已核准且未領取」可以領；在鎖內檢查，不會重複領取 */
function claimReward_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const id = str_(ctx.payload.completionId, '任務紀錄', { required: true, max: 40 });
  const c = readAll_('TaskCompletions').find((x) => x.id === id);
  if (!c) throw apiError_('NOT_FOUND', '找不到這筆任務紀錄。');
  if (c.playerId !== playerId) throw apiError_('FORBIDDEN', '只能領取自己的獎勵。');
  if (c.status === 'claimed') throw apiError_('INVALID', '這個獎勵已經領取過了，不能重複領取。');
  if (c.status !== 'approved') throw apiError_('INVALID', '任務尚未通過確認，還不能領取獎勵。');
  const t = readAll_('Tasks').find((x) => x.id === c.taskId);
  if (!t) throw apiError_('NOT_FOUND', '找不到任務設定。');
  const task = parseTask_(t);
  if (task.expReward > 0) {
    const pm = readAll_('PlayerMonsters').find((x) => x.playerId === playerId && x.partner === 'TRUE');
    if (!pm) throw apiError_('INVALID', '請先到怪獸訓練中心選擇你的初始夥伴，才能領取經驗值。');
    const r = applyExp_(Number(pm.level), Number(pm.exp), task.expReward);
    updateRow_('PlayerMonsters', pm._row, Object.assign({}, pm, { level: r.level, exp: r.exp }));
    progressLog_(playerId, pm.id, task.expReward, r.level, '任務獎勵：' + task.title);
  }
  const w = loadWallet_(playerId);
  w.points = (Number(w.points) || 0) + task.pointReward;
  w.balls = (Number(w.balls) || 0) + task.ballReward;
  saveWallet_(w);
  updateRow_('TaskCompletions', c._row, Object.assign({}, c, { status: 'claimed', claimedAt: nowIso_() }));
  rewardLog_(playerId, '任務', task.title, task.expReward, task.pointReward, task.ballReward);
  return { reward: { exp: task.expReward, points: task.pointReward, balls: task.ballReward }, state: gameState_(playerId) };
}

function chooseStarter_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  if (readAll_('PlayerMonsters').some((x) => x.playerId === playerId)) throw apiError_('INVALID', '你已經有夥伴了，初始夥伴只能選一次。');
  const id = str_(ctx.payload.monsterId, '怪獸', { required: true, max: 20 });
  const m = readAll_('Monsters').find((x) => x.id === id && x.isStarter === 'TRUE');
  if (!m) throw apiError_('INVALID', '這隻怪獸不是可選的初始夥伴。');
  appendRow_('PlayerMonsters', { id: newId_('PM'), playerId: playerId, monsterId: id, nickname: m.name, level: 1, exp: 0, partner: true, obtainedAt: nowIso_(), obtainedBy: 'starter' });
  const w = loadWallet_(playerId);
  addSeen_(w, id);
  saveWallet_(w);
  rewardLog_(playerId, '初始夥伴', '與 ' + m.name + ' 成為夥伴', 0, 0, 0);
  return { state: gameState_(playerId) };
}

function setPartner_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  readAll_('PlayerMonsters')
    .filter((x) => x.playerId === pm.playerId)
    .forEach((x) => {
      const want = x.id === pm.id ? 'TRUE' : 'FALSE';
      if (x.partner !== want) updateRow_('PlayerMonsters', x._row, Object.assign({}, x, { partner: want }));
    });
  return { state: gameState_(pm.playerId) };
}

function trainMonster_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  const plan = GAME.trainPlans[ctx.payload.plan];
  if (!plan) throw apiError_('INVALID', '訓練方式不正確。');
  if (Number(pm.level) >= GAME.maxLevel) throw apiError_('INVALID', '已經達到最高等級。');
  const w = loadWallet_(pm.playerId);
  const points = Number(w.points) || 0;
  if (points < plan.cost) throw apiError_('INVALID', '點數不足，需要 ' + plan.cost + ' 點（目前 ' + points + ' 點）。完成任務可以獲得點數。');
  w.points = points - plan.cost;
  saveWallet_(w);
  const r = applyExp_(Number(pm.level), Number(pm.exp), plan.exp);
  updateRow_('PlayerMonsters', pm._row, Object.assign({}, pm, { level: r.level, exp: r.exp }));
  progressLog_(pm.playerId, pm.id, plan.exp, r.level, plan.label + '（消耗 ' + plan.cost + ' 點）');
  return { state: gameState_(pm.playerId) };
}

/** 與怪獸互動：增加親密度；每隻怪獸每種互動每天有次數上限 */
function careMonster_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  requireActivePlayer_(pm.playerId);
  const kind = String(ctx.payload.action || '');
  const act = Object.prototype.hasOwnProperty.call(CARE, kind) ? CARE[kind] : null;
  if (!act) throw apiError_('INVALID', '互動方式不正確。');
  const today = today_();
  const counts = pm.careDate === today ? parseJson_(pm.careCounts, {}) : {};
  const used = Number(counts[kind]) || 0;
  if (used >= act.daily) throw apiError_('INVALID', '今天已經和 ' + pm.nickname + ' ' + act.label + ' ' + act.daily + ' 次了，明天再來吧！');
  if (act.cost) {
    const w = loadWallet_(pm.playerId);
    const points = Number(w.points) || 0;
    if (points < act.cost) throw apiError_('INVALID', '點數不足，' + act.label + '需要 ' + act.cost + ' 點（目前 ' + points + ' 點）。');
    w.points = points - act.cost;
    saveWallet_(w);
    rewardLog_(pm.playerId, '互動', act.label + '（' + pm.nickname + '）', 0, -act.cost, 0);
  }
  counts[kind] = used + 1;
  const before = Math.min(MAX_AFFECTION, Number(pm.affection) || 0);
  const affection = Math.min(MAX_AFFECTION, before + act.affection);
  const row = Object.assign({}, pm, { affection: affection, careDate: today, careCounts: JSON.stringify(counts) });
  let expGained = 0;
  if (act.exp && Number(pm.level) < GAME.maxLevel) {
    const r = applyExp_(Number(pm.level), Number(pm.exp), act.exp);
    row.level = r.level;
    row.exp = r.exp;
    expGained = act.exp;
  }
  let healed = 0;
  const m = readAll_('Monsters').find((x) => x.id === pm.monsterId);
  if (act.heal && m) {
    const s = monsterStats_(m, row.level);
    const hp = currentHp_(pm, s.maxHp, Date.now());
    if (hp < s.maxHp) {
      const after = Math.min(s.maxHp, hp + Math.ceil(s.maxHp * act.heal));
      healed = after - hp;
      row.hp = after >= s.maxHp ? '' : after;
      row.hpAt = nowIso_();
    }
  }
  updateRow_('PlayerMonsters', pm._row, row);
  if (expGained) progressLog_(pm.playerId, pm.id, expGained, row.level, act.label);
  return { action: kind, gained: affection - before, affection: affection, exp: expGained, healed: healed, state: gameState_(pm.playerId) };
}

/** 每日補給：所有球員每天都能領一次，不因成績或受傷休養而不同 */
function claimDailySupply_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const w = loadWallet_(playerId);
  const today = today_();
  if (w.supplyDate === today) throw apiError_('INVALID', '今天的補給已經領過了，明天再來吧！');
  w.supplyDate = today;
  w.balls = (Number(w.balls) || 0) + GAME.dailySupplyBalls;
  saveWallet_(w);
  rewardLog_(playerId, '每日補給', '捕捉球 ×' + GAME.dailySupplyBalls, 0, 0, GAME.dailySupplyBalls);
  return { state: gameState_(playerId) };
}

/** 探索：遇到哪隻怪獸由伺服器依稀有度抽選 */
function explore_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const areaId = ctx.payload.areaId;
  if (AREAS.indexOf(areaId) < 0) throw apiError_('INVALID', '探索地點不正確。');
  const w = loadWallet_(playerId);
  const today = today_();
  const used = w.exploreDate === today ? Number(w.exploreCount) || 0 : 0;
  if (used >= GAME.dailyExplores) throw apiError_('INVALID', '今天的探索次數已用完，明天再來探索吧！');
  const pool = readAll_('Monsters').filter((m) => m.habitat === areaId && m.inWild === 'TRUE');
  if (pool.length === 0) throw apiError_('INVALID', '這個區域目前沒有怪獸出沒。');
  const weight = (m) => GAME.rarityWeight[Number(m.rarity)] || GAME.rarityWeight[1];
  let roll = Math.random() * pool.reduce((s, m) => s + weight(m), 0);
  let picked = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    roll -= weight(pool[i]);
    if (roll < 0) {
      picked = pool[i];
      break;
    }
  }
  w.exploreDate = today;
  w.exploreCount = used + 1;
  w.encounterMonsterId = picked.id;
  w.encounterAreaId = areaId;
  w.encounterAt = nowIso_();
  addSeen_(w, picked.id);
  saveWallet_(w);
  return { monsterId: picked.id, state: gameState_(playerId) };
}

function leaveEncounter_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const w = loadWallet_(playerId);
  w.encounterMonsterId = '';
  w.encounterAreaId = '';
  w.encounterAt = '';
  saveWallet_(w);
  return { state: gameState_(playerId) };
}

/** 捕捉：成功與否由伺服器決定；捕捉球只能從任務與每日補給取得，不能用金錢購買 */
function capture_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const w = loadWallet_(playerId);
  if (!w.encounterMonsterId) throw apiError_('INVALID', '目前沒有遭遇中的怪獸。');
  const balls = Number(w.balls) || 0;
  if (balls < 1) throw apiError_('INVALID', '捕捉球不足。可以領取每日補給或完成任務來獲得捕捉球。');
  const m = readAll_('Monsters').find((x) => x.id === w.encounterMonsterId);
  if (!m) throw apiError_('NOT_FOUND', '怪獸資料不存在。');
  w.balls = balls - 1;
  const success = Math.random() < Number(m.catchRate);
  let duplicate = false;
  if (success) {
    w.encounterMonsterId = '';
    w.encounterAreaId = '';
    w.encounterAt = '';
    const mine = readAll_('PlayerMonsters').filter((x) => x.playerId === playerId);
    duplicate = mine.some((x) => x.monsterId === m.id);
    if (duplicate) {
      w.points = (Number(w.points) || 0) + GAME.duplicateCapturePoints;
      rewardLog_(playerId, '捕捉', '再次捕捉 ' + m.name + '，轉換為 ' + GAME.duplicateCapturePoints + ' 點', 0, GAME.duplicateCapturePoints, 0);
    } else {
      const hasPartner = mine.some((x) => x.partner === 'TRUE');
      appendRow_('PlayerMonsters', { id: newId_('PM'), playerId: playerId, monsterId: m.id, nickname: m.name, level: 1, exp: 0, partner: !hasPartner, obtainedAt: nowIso_(), obtainedBy: 'capture' });
      rewardLog_(playerId, '捕捉', '成功捕捉 ' + m.name, 0, 0, 0);
    }
  }
  saveWallet_(w);
  return { success: success, duplicate: duplicate, monsterName: m.name, state: gameState_(playerId) };
}

/** 進化：達到該怪獸設定的等級（或親密度）才能進化，等級、經驗值與親密度保留 */
function evolveMonster_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  const monsters = readAll_('Monsters');
  const m = monsters.find((x) => x.id === pm.monsterId);
  if (!m) throw apiError_('NOT_FOUND', '怪獸資料不存在。');
  const needAff = m.evolvesTo ? evolveAffectionOf_(m) : 0;
  if (!m.evolvesTo || (!m.evolveLevel && !needAff)) throw apiError_('INVALID', m.name + ' 已經是最終型態，無法再進化。');
  const aff = Number(pm.affection) || 0;
  if (needAff && aff < needAff) throw apiError_('INVALID', pm.nickname + ' 的親密度需要達到 ' + needAff + ' 才能進化（目前 ' + aff + '）。多和牠互動吧！');
  if (!needAff && Number(pm.level) < Number(m.evolveLevel)) throw apiError_('INVALID', pm.nickname + ' 需要達到 Lv.' + m.evolveLevel + ' 才能進化（目前 Lv.' + pm.level + '）。');
  const next = monsters.find((x) => x.id === m.evolvesTo);
  if (!next) throw apiError_('NOT_FOUND', '找不到進化後的怪獸資料。');
  updateRow_('PlayerMonsters', pm._row, Object.assign({}, pm, { monsterId: next.id, nickname: pm.nickname === m.name ? next.name : pm.nickname }));
  const w = loadWallet_(pm.playerId);
  addSeen_(w, next.id);
  saveWallet_(w);
  progressLog_(pm.playerId, pm.id, 0, Number(pm.level), '進化：' + m.name + ' → ' + next.name);
  rewardLog_(pm.playerId, '進化', m.name + ' 進化成 ' + next.name, 0, 0, 0);
  return { from: m.name, to: next.name, toId: next.id, state: gameState_(pm.playerId) };
}

/** 防護知識測驗：由伺服器批改；球員全部答對才記錄通過（家長、教練只看批改結果） */
function submitQuiz_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.articleId, '文章', { required: true, max: 40 });
  const r = readAll_('KnowledgeArticles').find((x) => x.id === id);
  const art = r && parseArticle_(r);
  const visible = art && (a.role === 'coach' || (art.status === 'published' && art.audience.indexOf(a.role) >= 0));
  if (!visible) throw apiError_('NOT_FOUND', '找不到這篇文章。');
  if (art.quiz.length === 0) throw apiError_('INVALID', '這篇文章沒有測驗。');
  const answers = Array.isArray(ctx.payload.answers) ? ctx.payload.answers : [];
  if (answers.length !== art.quiz.length) throw apiError_('INVALID', '請回答所有題目。');
  const results = art.quiz.map((q, i) => ({ correct: Number(answers[i]) === q.answerIndex, answerIndex: q.answerIndex, explanation: q.explanation }));
  const passed = results.every((x) => x.correct);
  if (a.role !== 'player') return { passed: passed, results: results, state: null };
  const playerId = requireGamePlayer_(a);
  if (passed) {
    const today = today_();
    if (!readAll_('QuizPasses').some((q) => q.playerId === playerId && q.articleId === id && q.date === today)) {
      appendRow_('QuizPasses', { id: newId_('QP'), playerId: playerId, articleId: id, date: today, at: nowIso_() });
    }
  }
  return { passed: passed, results: results, state: gameState_(playerId) };
}

// ───────────────────────── 遊戲：教練管理 ─────────────────────────

function adminListTasks_() {
  return {
    tasks: readAll_('Tasks').map(parseTask_),
    pending: readAll_('TaskCompletions').filter((c) => c.status === 'submitted').map(parseCompletion_),
  };
}

function taskFields_(p) {
  const int = (v, label, max) => {
    const n = Number(v);
    if (!(Math.round(n) === n && n >= 0 && n <= max)) throw apiError_('INVALID', '「' + label + '」必須是 0～' + max + ' 的整數。');
    return n;
  };
  if (TASK_CATEGORIES.indexOf(p.category) < 0) throw apiError_('INVALID', '任務分類不正確。');
  if (TASK_REPEATS.indexOf(p.repeat) < 0) throw apiError_('INVALID', '可領取頻率不正確。');
  if (TASK_VERIFY.indexOf(p.verify) < 0) throw apiError_('INVALID', '完成驗證方式不正確。');
  return {
    title: str_(p.title, '任務名稱', { required: true, max: 40 }),
    description: str_(p.description, '任務說明', { max: 200 }),
    category: p.category, repeat: p.repeat, verify: p.verify,
    expReward: int(p.expReward, '經驗值', 500), pointReward: int(p.pointReward, '點數', 500), ballReward: int(p.ballReward, '捕捉球', 10),
  };
}

function upsertTask_(ctx) {
  const a = ctx.actor;
  const f = taskFields_(ctx.payload);
  const id = str_(ctx.payload.id, '任務', { max: 40 });
  if (id) {
    const t = readAll_('Tasks').find((x) => x.id === id);
    if (!t) throw apiError_('NOT_FOUND', '找不到這個任務。');
    updateRow_('Tasks', t._row, Object.assign({}, t, f));
    audit_(a, '修改任務與獎勵', id, f.title + '（經驗 ' + f.expReward + '／點數 ' + f.pointReward + '／球 ' + f.ballReward + '）');
    return { task: parseTask_(stringify_(Object.assign({}, t, f))) };
  }
  const row = Object.assign({ id: newId_('T'), active: true }, f);
  appendRow_('Tasks', row);
  audit_(a, '新增任務', row.id, f.title);
  return { task: parseTask_(stringify_(row)) };
}

function setTaskActive_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.id, '任務', { required: true, max: 40 });
  const t = readAll_('Tasks').find((x) => x.id === id);
  if (!t) throw apiError_('NOT_FOUND', '找不到這個任務。');
  const active = ctx.payload.active === true;
  updateRow_('Tasks', t._row, Object.assign({}, t, { active: active ? 'TRUE' : 'FALSE' }));
  audit_(a, active ? '開放任務' : '關閉任務', id, t.title);
  return { task: parseTask_(Object.assign({}, t, { active: active ? 'TRUE' : 'FALSE' })) };
}

function reviewCompletion_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.completionId, '任務回報', { required: true, max: 40 });
  const c = readAll_('TaskCompletions').find((x) => x.id === id);
  if (!c) throw apiError_('NOT_FOUND', '找不到這筆任務回報。');
  if (c.status !== 'submitted') throw apiError_('INVALID', '這筆回報已處理過。');
  const approve = ctx.payload.approve === true;
  updateRow_('TaskCompletions', c._row, Object.assign({}, c, { status: approve ? 'approved' : 'rejected', reviewedBy: a.displayName, reviewedAt: nowIso_() }));
  const t = readAll_('Tasks').find((x) => x.id === c.taskId);
  audit_(a, approve ? '核准任務' : '退回任務', c.playerId, t ? t.title : c.taskId);
  return { completionId: id, status: approve ? 'approved' : 'rejected' };
}

/** 任務表是空的時候，匯入預設任務 */
function importTasks_(ctx) {
  const a = ctx.actor;
  if (readAll_('Tasks').length > 0) throw apiError_('INVALID', '雲端已經有任務資料，不重複匯入。');
  const list = Array.isArray(ctx.payload.tasks) ? ctx.payload.tasks : [];
  if (list.length < 1 || list.length > 30) throw apiError_('INVALID', '任務數量不正確。');
  const rows = list.map((p) => Object.assign({ id: newId_('T'), active: true }, taskFields_(p)));
  rows.forEach((r) => appendRow_('Tasks', r));
  audit_(a, '匯入預設任務', 'Tasks', rows.length + ' 個');
  return { imported: rows.length };
}

/** 怪獸表是空的時候，匯入網頁內建的 75 隻原創怪獸 */
function importMonsters_(ctx) {
  const a = ctx.actor;
  if (readAll_('Monsters').length > 0) throw apiError_('INVALID', '雲端已經有怪獸資料，不重複匯入。');
  const list = Array.isArray(ctx.payload.monsters) ? ctx.payload.monsters : [];
  if (list.length < 1 || list.length > 200) throw apiError_('INVALID', '怪獸數量不正確。');
  const ids = list.map((m) => String(m && m.id));
  const rows = list.map((m) => {
    if (!/^M\d{3}$/.test(String(m.id))) throw apiError_('INVALID', '怪獸編號格式不正確：' + m.id);
    if (ELEMENTS.indexOf(m.element) < 0 || AREAS.indexOf(m.habitat) < 0) throw apiError_('INVALID', '怪獸屬性或棲息地不正確：' + m.id);
    const rarity = Number(m.rarity);
    const stage = Number(m.stage);
    const rate = Number(m.catchRate);
    if ([1, 2, 3].indexOf(rarity) < 0 || [1, 2, 3].indexOf(stage) < 0 || !(rate >= 0.05 && rate <= 0.95)) throw apiError_('INVALID', '怪獸數值不正確：' + m.id);
    if (m.evolvesTo && ids.indexOf(String(m.evolvesTo)) < 0) throw apiError_('INVALID', '進化目標不存在：' + m.id);
    const lv = m.evolvesTo ? Number(m.evolveLevel) : '';
    if (m.evolvesTo && !(Math.round(lv) === lv && lv >= 2 && lv <= GAME.maxLevel)) throw apiError_('INVALID', '進化等級不正確：' + m.id);
    const aff = m.evolvesTo ? Number(m.evolveAffection) || 0 : '';
    if (m.evolvesTo && !(Math.round(aff) === aff && aff >= 0 && aff <= MAX_AFFECTION)) throw apiError_('INVALID', '進化親密度不正確：' + m.id);
    return {
      id: m.id, dexNo: Number(m.dexNo), name: str_(m.name, '怪獸名稱', { required: true, max: 12 }), element: m.element, rarity: rarity, stage: stage,
      evolvesTo: m.evolvesTo || '', evolveLevel: lv, description: str_(m.description, '圖鑑說明', { required: true, max: 120 }), habitat: m.habitat,
      catchRate: rate, isStarter: m.isStarter === true, inWild: m.inWild === true, evolveAffection: aff,
    };
  });
  rows.forEach((r) => appendRow_('Monsters', r));
  audit_(a, '匯入怪獸圖鑑', 'Monsters', rows.length + ' 隻');
  return { imported: rows.length };
}

function updateMonster_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const id = str_(p.id, '怪獸', { required: true, max: 20 });
  const m = readAll_('Monsters').find((x) => x.id === id);
  if (!m) throw apiError_('NOT_FOUND', '找不到這隻怪獸。');
  const rate = Number(p.catchRate);
  if (!(rate >= 0.05 && rate <= 0.95)) throw apiError_('INVALID', '捕捉率必須介於 5% 到 95%。');
  const changes = {
    name: str_(p.name, '怪獸名稱', { required: true, max: 12 }),
    description: str_(p.description, '圖鑑說明', { required: true, max: 120 }),
    catchRate: Math.round(rate * 100) / 100,
    inWild: p.inWild === true ? 'TRUE' : 'FALSE',
  };
  if (m.evolvesTo && p.evolveLevel !== undefined) {
    const lv = Number(p.evolveLevel);
    if (!(Math.round(lv) === lv && lv >= 2 && lv <= GAME.maxLevel)) throw apiError_('INVALID', '「進化等級」必須是 2～' + GAME.maxLevel + ' 的整數。');
    changes.evolveLevel = lv;
  }
  if (m.evolvesTo && p.evolveAffection !== undefined) {
    const aff = Number(p.evolveAffection);
    if (!(Math.round(aff) === aff && aff >= 0 && aff <= MAX_AFFECTION)) throw apiError_('INVALID', '「親密度進化」必須是 0～' + MAX_AFFECTION + ' 的整數（0 代表用等級進化）。');
    changes.evolveAffection = aff;
  }
  const row = Object.assign({}, m, changes);
  updateRow_('Monsters', m._row, row);
  const how = changes.evolveAffection ? '、親密度 ' + changes.evolveAffection + ' 進化' : changes.evolveLevel ? '、Lv.' + changes.evolveLevel + ' 進化' : '';
  audit_(a, '修改怪獸資料', id, changes.name + '（捕捉率 ' + Math.round(changes.catchRate * 100) + '%' + how + '）');
  return { monster: parseMonster_(stringify_(row)) };
}

function grantExp_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.playerMonsterId, '怪獸', { required: true, max: 40 });
  const pm = readAll_('PlayerMonsters').find((x) => x.id === id);
  if (!pm) throw apiError_('NOT_FOUND', '找不到這隻怪獸。');
  const amount = Number(ctx.payload.amount);
  if (!(Math.round(amount) === amount && amount >= 1 && amount <= 500)) throw apiError_('INVALID', '「經驗值」必須是 1～500 的整數。');
  const reason = str_(ctx.payload.reason, '發放原因', { required: true, max: 60 });
  const r = applyExp_(Number(pm.level), Number(pm.exp), amount);
  updateRow_('PlayerMonsters', pm._row, Object.assign({}, pm, { level: r.level, exp: r.exp }));
  progressLog_(pm.playerId, pm.id, amount, r.level, '教練發放：' + reason);
  rewardLog_(pm.playerId, '教練發放', reason, amount, 0, 0);
  audit_(a, '發放經驗值', pm.playerId, pm.nickname + ' +' + amount + '（' + reason + '）');
  return { level: r.level, exp: r.exp };
}

function adminGameOverview_() {
  return { playerMonsters: readAll_('PlayerMonsters').map(parsePM_) };
}

// ───────────────────────── 帳號管理（教練） ─────────────────────────

function adminListUsers_(ctx) {
  requireRole_(ctx.actor, ['coach']);
  return { users: readAll_('Users').map(publicUser_), players: readAll_('Players').map(parsePlayer_) };
}

function playerFields_(p) {
  return {
    name: str_(p.name, '姓名', { required: true, max: 30 }),
    number: str_(p.number, '背號', { max: 4 }),
    grade: str_(p.grade, '年級', { max: 10 }),
    position: str_(p.position, '守備位置', { max: 20 }),
  };
}

/** 新增球員，並同時建立球員帳號；登入碼只會在這次回傳中出現一次 */
function adminCreatePlayer_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const f = playerFields_(ctx.payload);
  const players = readAll_('Players');
  const next = players.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0) + 1;
  const id = 'P' + ('00' + next).slice(-3);
  const now = nowIso_();
  appendRow_('Players', Object.assign({ id: id, active: 'TRUE', createdAt: now, updatedAt: now }, f));
  const account = createUser_({ loginId: id.toLowerCase(), displayName: f.name, role: 'player', playerId: id, childPlayerIds: '' });
  audit_(a, '新增球員與帳號', id, f.name);
  return { player: { id: id, name: f.name, number: f.number, grade: f.grade, position: f.position, active: true, createdAt: now }, loginId: account.loginId, code: account.code };
}

function adminUpdatePlayer_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const id = str_(ctx.payload.id, '球員', { required: true, max: 20 });
  const p = readAll_('Players').find((x) => x.id === id);
  if (!p) throw apiError_('NOT_FOUND', '找不到這位球員。');
  const f = playerFields_(ctx.payload);
  updateRow_('Players', p._row, Object.assign({}, p, f, { updatedAt: nowIso_() }));
  const u = readAll_('Users').find((x) => x.role === 'player' && x.playerId === id);
  if (u) updateRow_('Users', u._row, Object.assign({}, u, { displayName: f.name, updatedAt: nowIso_() }));
  audit_(a, '修改球員資料', id, f.name);
  return { updated: id };
}

/** 新增教練或家長帳號 */
function adminCreateUser_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const p = ctx.payload;
  const role = p.role;
  if (['coach', 'parent', 'teacher', 'office'].indexOf(role) < 0) throw apiError_('INVALID', '這裡只能建立教練、家長、老師或學務處帳號；球員帳號請用「新增球員」。');
  const loginId = validLoginId_(p.loginId);
  const displayName = str_(p.displayName, '顯示名稱', { required: true, max: 30 });
  const kids = role === 'parent' || role === 'teacher' ? linkedPlayerIds_(p.childPlayerIds, role) : '';
  const account = createUser_({ loginId: loginId, displayName: displayName, role: role, playerId: '', childPlayerIds: kids });
  audit_(a, '新增帳號', account.id, displayName + '（' + role + '）');
  return { userId: account.id, loginId: account.loginId, code: account.code };
}

function validLoginId_(v) {
  const loginId = str_(v, '帳號', { required: true, max: 30 }).toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(loginId)) throw apiError_('INVALID', '帳號只能使用 3～30 個英文小寫、數字或 _ . -。');
  return loginId;
}

/** 家長（子女）或老師（負責的學生）對應的球員，至少一位且都要存在 */
function linkedPlayerIds_(raw, role) {
  const ids = (Array.isArray(raw) ? raw.map(String) : []).filter((v, i, arr) => v && arr.indexOf(v) === i);
  const players = readAll_('Players');
  if (ids.length === 0 || ids.length > 80 || ids.some((id) => !players.some((x) => x.id === id))) {
    throw apiError_('INVALID', (role === 'teacher' ? '老師帳號必須對應至少一位存在的學生。' : '家長帳號必須對應至少一位存在的球員。'));
  }
  return ids.join(',');
}

/** 密碼（登入碼）規則：至少 8 個字，並且同時有英文字母與數字 */
function validNewCode_(code, label) {
  const c = str_(code, label, { required: true, max: 40 });
  if (c.length < 8 || !/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) throw apiError_('INVALID', label + '至少 8 個字，並且要同時包含英文字母與數字。');
  return c;
}

/** 修改教練、家長或老師帳號的顯示名稱，以及家長／老師對應的學生 */
function adminUpdateUser_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const id = str_(p.userId, '帳號', { required: true, max: 40 });
  const u = readAll_('Users').find((x) => x.id === id);
  if (!u) throw apiError_('NOT_FOUND', '找不到這個帳號。');
  if (u.role === 'player') throw apiError_('INVALID', '球員帳號請在球員名單中修改。');
  const changes = { displayName: str_(p.displayName, '顯示名稱', { required: true, max: 30 }), updatedAt: nowIso_() };
  // 家長、老師、學務處之間可以互換角色（例如把原本用老師帳號建立的學務處改成學務處）
  const swappable = ['parent', 'teacher', 'office'];
  let role = u.role;
  if (p.role && p.role !== u.role) {
    if (swappable.indexOf(u.role) < 0 || swappable.indexOf(p.role) < 0) throw apiError_('INVALID', '只有家長、老師、學務處之間可以變更角色。');
    role = p.role;
    changes.role = role;
  }
  if (role === 'parent' || role === 'teacher') changes.childPlayerIds = linkedPlayerIds_(p.childPlayerIds, role);
  else if (role === 'office') changes.childPlayerIds = '';
  updateRow_('Users', u._row, Object.assign({}, u, changes));
  audit_(a, '修改帳號', u.id, changes.displayName + (changes.role ? '（角色改為 ' + ROLE_NAMES[changes.role] + '）' : '') + (changes.childPlayerIds ? '（對應學生：' + changes.childPlayerIds + '）' : ''));
  return { userId: id };
}

function adminResetCode_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const userId = str_(ctx.payload.userId, '帳號', { required: true, max: 40 });
  const u = readAll_('Users').find((x) => x.id === userId);
  if (!u) throw apiError_('NOT_FOUND', '找不到這個帳號。');
  const code = randomCode_();
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, Object.assign({}, u, { codeSalt: salt, codeHash: hashCode_(salt, code), updatedAt: nowIso_() }));
  audit_(a, '重設登入碼', u.id, u.displayName);
  return { loginId: u.loginId, code: code };
}

function adminSetPlayerActive_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const id = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  const active = ctx.payload.active === true;
  const p = readAll_('Players').find((x) => x.id === id);
  if (!p) throw apiError_('NOT_FOUND', '找不到這位球員。');
  updateRow_('Players', p._row, Object.assign({}, p, { active: active ? 'TRUE' : 'FALSE', updatedAt: nowIso_() }));
  readAll_('Users')
    .filter((u) => u.role === 'player' && u.playerId === id)
    .forEach((u) => updateRow_('Users', u._row, Object.assign({}, u, { active: active ? 'TRUE' : 'FALSE', updatedAt: nowIso_() })));
  audit_(a, active ? '啟用球員' : '停用球員', id, p.name);
  return { playerId: id, active: active };
}

/**
 * 永久刪除球員：連同球員帳號與這位球員的所有資料（筆記、體能、目標、段考、遊戲紀錄）一起刪除，
 * 並把他從家長帳號的子女清單移除。必須輸入球員姓名確認。刪除後無法復原（只能從備份找回）。
 */
function adminDeletePlayer_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  const p = readAll_('Players').find((x) => x.id === id);
  if (!p) throw apiError_('NOT_FOUND', '找不到這位球員。');
  if (str_(ctx.payload.confirmName, '確認姓名', { max: 30 }) !== p.name) throw apiError_('INVALID', '輸入的姓名和球員姓名不同，沒有刪除。');
  const removed = {};
  const del = (name, pred) => {
    const rows = readAll_(name).filter(pred).map((r) => r._row).sort((x, y) => y - x);
    rows.forEach((row) => deleteRow_(name, row));
    if (rows.length) removed[name] = rows.length;
  };
  const mine = (r) => r.playerId === id;
  ['DailyNotes', 'FitnessTests', 'Goals', 'TaskCompletions', 'PlayerMonsters', 'MonsterProgress', 'Wallets', 'RewardLogs', 'QuizPasses', 'ExamScores', 'Messages', 'SchoolRecords', 'Attendance', 'PlayerProfiles'].forEach((n) => del(n, mine));
  del('Battles', (r) => r.playerId === id || r.opponentPlayerId === id);
  del('Users', (u) => u.role === 'player' && u.playerId === id);
  const without = (csv) => csv.split(',').filter((k) => k && k !== id).join(',');
  readAll_('Users')
    .filter((u) => (u.role === 'parent' || u.role === 'teacher') && linkedIds_(u).indexOf(id) >= 0)
    .forEach((u) => updateRow_('Users', u._row, Object.assign({}, u, { childPlayerIds: without(u.childPlayerIds), updatedAt: nowIso_() })));
  // 只給這位學生的行程直接刪除；多人行程只移除他（不能變成空白，空白代表全隊）
  del('Events', (e) => e.playerIds === id);
  readAll_('Events')
    .filter((e) => e.playerIds.split(',').indexOf(id) >= 0)
    .forEach((e) => updateRow_('Events', e._row, Object.assign({}, e, { playerIds: without(e.playerIds) })));
  readAll_('Tournaments')
    .filter((t) => t.playerIds.split(',').indexOf(id) >= 0)
    .forEach((t) => updateRow_('Tournaments', t._row, Object.assign({}, t, { playerIds: without(t.playerIds) })));
  del('Players', (x) => x.id === id);
  audit_(a, '刪除球員', id, p.name + '（' + Object.keys(removed).map((k) => k + ' ' + removed[k]).join('、') + '）');
  return { deleted: id, removed: removed };
}

function adminSetUserActive_(ctx) {
  const a = ctx.actor;
  requireRole_(a, ['coach']);
  const id = str_(ctx.payload.userId, '帳號', { required: true, max: 40 });
  const active = ctx.payload.active === true;
  if (id === a.id) throw apiError_('INVALID', '不能停用自己的帳號。');
  const users = readAll_('Users');
  const u = users.find((x) => x.id === id);
  if (!u) throw apiError_('NOT_FOUND', '找不到這個帳號。');
  updateRow_('Users', u._row, Object.assign({}, u, { active: active ? 'TRUE' : 'FALSE', updatedAt: nowIso_() }));
  audit_(a, active ? '啟用帳號' : '停用帳號', u.id, u.displayName);
  return { userId: id, active: active };
}

function listAudit_(ctx) {
  requireRole_(ctx.actor, ['coach']);
  const logs = readAll_('AuditLogs').map((r) => ({ id: r.id, at: r.at, actorId: r.actorId, actorName: r.actorName, action: r.action, target: r.target, detail: r.detail }));
  logs.reverse();
  return { logs: logs.slice(0, 300) };
}

/** 建立帳號；沒有指定 code 時產生隨機登入碼（只回傳這一次） */
function createUser_(u, chosenCode) {
  const users = readAll_('Users');
  if (users.some((x) => x.loginId.toLowerCase() === u.loginId)) throw apiError_('INVALID', '帳號「' + u.loginId + '」已經有人使用，請換一個。');
  const code = chosenCode || randomCode_();
  const salt = Utilities.getUuid();
  const now = nowIso_();
  const id = newId_('U');
  appendRow_('Users', {
    id: id, loginId: u.loginId, displayName: u.displayName, role: u.role, playerId: u.playerId, childPlayerIds: u.childPlayerIds,
    active: 'TRUE', codeSalt: salt, codeHash: hashCode_(salt, code), createdAt: now, updatedAt: now,
  });
  return { id: id, loginId: u.loginId, code: code };
}

function requireActivePlayer_(playerId) {
  const p = readAll_('Players').find((x) => x.id === playerId);
  if (!p || p.active !== 'TRUE') throw apiError_('FORBIDDEN', '此球員已停用。');
}

/** 為已經在名單上、但還沒有帳號的球員建立帳號（例如從舊資料匯入的球員）；登入碼只回傳這一次 */
function adminCreatePlayerAccount_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.playerId, '球員', { required: true, max: 20 });
  const p = readAll_('Players').find((x) => x.id === id);
  if (!p) throw apiError_('NOT_FOUND', '找不到這位球員。');
  const users = readAll_('Users');
  if (users.some((u) => u.role === 'player' && u.playerId === id)) throw apiError_('INVALID', '這位球員已經有帳號了，如果忘記登入碼請使用「重設登入碼」。');
  let loginId = id.toLowerCase();
  for (let n = 2; users.some((u) => u.loginId.toLowerCase() === loginId); n++) loginId = id.toLowerCase() + '-' + n;
  const acc = createUser_({ loginId: loginId, displayName: p.name, role: 'player', playerId: id, childPlayerIds: '' });
  audit_(a, '建立球員帳號', id, p.name);
  return { loginId: acc.loginId, code: acc.code };
}

// ───────────────────────── 匯入舊體能檢測資料 ─────────────────────────

/**
 * 把舊系統的紀錄整理成匯入計畫（純計算，不寫入，方便測試）。
 * records：[{ legacyId, name, item, date, value, detail }]；existingIds：已匯入過的紀錄 id
 */
function planLegacyImport_(records, rosterNames, existingPlayers, existingIds) {
  const today = today_();
  const rows = [];
  const skipped = [];
  let duplicates = 0;
  const names = {};
  rosterNames.forEach((n) => {
    const name = String(n || '').trim();
    if (name) names[name] = true;
  });
  records.forEach((r, i) => {
    const line = i + 2;
    const name = String(r.name || '').trim();
    const legacyId = String(r.legacyId || '').trim();
    if (!name) return skipped.push({ line: line, reason: '沒有姓名' });
    if (!legacyId) return skipped.push({ line: line, reason: '沒有記錄ID' });
    const id = 'L-' + legacyId;
    if (existingIds[id]) {
      duplicates++;
      return;
    }
    const item = LEGACY_ITEM_MAP[String(r.item || '').trim()];
    if (!item) return skipped.push({ line: line, reason: '不支援的檢測項目：' + r.item });
    const m = String(r.date || '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    const date = m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
    let validDate = false;
    try {
      validDate = !!date && dateStr_(date, '日期') === date;
    } catch (e) {
      validDate = false;
    }
    if (!validDate) return skipped.push({ line: line, reason: '日期格式不正確：' + r.date });
    if (date > today) return skipped.push({ line: line, reason: '日期在未來：' + date });
    const def = FITNESS_ITEMS[item];
    const value = Number(r.value);
    if (!isFinite(value) || String(r.value).trim() === '' || value < def.min || value > def.max) return skipped.push({ line: line, reason: def.label + '的數值不合理：' + r.value });
    if (def.integer && Math.round(value) !== value) return skipped.push({ line: line, reason: def.label + '應為整數：' + r.value });
    const term = parseJson_(r.detail, {}).term;
    names[name] = true;
    rows.push({ id: id, name: name, item: item, date: date, value: Math.round(value * 100) / 100, unit: def.unit, note: '舊系統匯入' + (term ? '（' + term + '）' : '') });
  });
  // 姓名比對：同名只有一位時直接沿用；同名多位時無法判斷，該姓名的紀錄不匯入
  const byName = {};
  existingPlayers.forEach((p) => (byName[p.name] = (byName[p.name] || []).concat([p.id])));
  const ambiguous = Object.keys(names).filter((n) => (byName[n] || []).length > 1);
  const usable = rows.filter((r) => ambiguous.indexOf(r.name) < 0);
  ambiguous.forEach((n) => skipped.push({ line: 0, reason: '名單中有多位「' + n + '」，無法判斷是哪一位，請先修改姓名' }));
  const newNames = Object.keys(names).filter((n) => !byName[n]);
  return { rows: usable, newNames: newNames, existingByName: byName, skipped: skipped, duplicates: duplicates, totalRecords: records.length };
}

/** 讀取舊檔案：「紀錄」工作表必須有 記錄ID、姓名、檢測項目、日期、數值；「名單」工作表（有的話）提供姓名 */
function planLegacyImportFromUrl_(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(url || '').match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!m) throw apiError_('INVALID', '請貼上舊檔案的 Google 試算表網址。');
  let src;
  try {
    src = SpreadsheetApp.openById(m[1]);
  } catch (e) {
    throw apiError_('INVALID', '打不開這份試算表，請確認網址正確，而且是用同一個 Google 帳號建立或已分享給你。');
  }
  const recSheet = src.getSheetByName('紀錄');
  if (!recSheet) throw apiError_('INVALID', '這份試算表沒有「紀錄」工作表。');
  const values = recSheet.getDataRange().getDisplayValues();
  const head = values[0] || [];
  const col = (label) => head.indexOf(label);
  const need = ['記錄ID', '姓名', '檢測項目', '日期', '數值'];
  const missing = need.filter((h) => col(h) < 0);
  if (missing.length) throw apiError_('INVALID', '「紀錄」工作表缺少欄位：' + missing.join('、'));
  const records = values.slice(1).filter((r) => r.join('') !== '').map((r) => ({
    legacyId: r[col('記錄ID')], name: r[col('姓名')], item: r[col('檢測項目')], date: r[col('日期')], value: r[col('數值')], detail: col('細節') >= 0 ? r[col('細節')] : '',
  }));
  const rosterSheet = src.getSheetByName('名單');
  let roster = [];
  if (rosterSheet) {
    const rv = rosterSheet.getDataRange().getDisplayValues();
    const nc = (rv[0] || []).indexOf('姓名');
    if (nc >= 0) roster = rv.slice(1).map((r) => r[nc]);
  }
  const existingIds = {};
  readAll_('FitnessTests').forEach((f) => (existingIds[f.id] = true));
  const plan = planLegacyImport_(records, roster, readAll_('Players').map(parsePlayer_), existingIds);
  plan.title = src.getName();
  return plan;
}

/** 給教練看的預覽摘要（不含每一筆明細） */
function summarizeLegacyPlan_(plan) {
  const items = {};
  const perName = {};
  let from = '';
  let to = '';
  plan.rows.forEach((r) => {
    const label = FITNESS_ITEMS[r.item].label;
    items[label] = (items[label] || 0) + 1;
    perName[r.name] = (perName[r.name] || 0) + 1;
    if (!from || r.date < from) from = r.date;
    if (!to || r.date > to) to = r.date;
  });
  const allNames = Object.keys(perName).concat(plan.newNames.filter((n) => !perName[n]));
  return {
    title: plan.title || '',
    totalRecords: plan.totalRecords,
    importable: plan.rows.length,
    duplicates: plan.duplicates,
    skipped: plan.skipped.slice(0, 30),
    skippedCount: plan.skipped.length,
    items: items,
    dateFrom: from,
    dateTo: to,
    newPlayers: plan.newNames.length,
    students: allNames.sort().map((n) => ({ name: n, isNew: plan.newNames.indexOf(n) >= 0, records: perName[n] || 0 })),
  };
}

function adminRunLegacyImport_(ctx) {
  const a = ctx.actor;
  const plan = planLegacyImportFromUrl_(ctx.payload.sheetUrl);
  const now = nowIso_();
  // 1. 建立名單上還沒有的球員（不建立帳號，之後由教練按「建立帳號」）
  const players = readAll_('Players');
  let next = players.reduce((mx, p) => Math.max(mx, Number(String(p.id).replace(/\D/g, '')) || 0), 0);
  const idByName = {};
  Object.keys(plan.existingByName).forEach((n) => (idByName[n] = plan.existingByName[n][0]));
  const newPlayers = plan.newNames.map((name) => {
    next += 1;
    const id = 'P' + ('00' + next).slice(-3);
    idByName[name] = id;
    return { id: id, name: name, number: '', grade: '', position: '', active: true, createdAt: now, updatedAt: now };
  });
  appendRows_('Players', newPlayers);
  // 2. 寫入體能紀錄
  const fitness = plan.rows.map((r) => ({
    id: r.id, playerId: idByName[r.name], date: r.date, item: r.item, value: r.value, unit: r.unit, note: r.note, createdBy: a.displayName + '（匯入）', createdAt: now, updatedAt: now,
  }));
  appendRows_('FitnessTests', fitness);
  audit_(a, '匯入舊體能檢測資料', plan.title || 'FitnessTests', '新增球員 ' + newPlayers.length + ' 位、紀錄 ' + fitness.length + ' 筆（略過重複 ' + plan.duplicates + ' 筆、不合格 ' + plan.skipped.length + ' 筆）');
  return { newPlayers: newPlayers.length, imported: fitness.length, duplicates: plan.duplicates, skippedCount: plan.skipped.length };
}

// ───────────────────────── 段考成績 ─────────────────────────

/** 家長的子女、老師負責的學生 */
function linkedIds_(actor) {
  return (actor.childPlayerIds || '').split(',').filter(String);
}

/** 教練與學務處看得到全部學生 */
function seesAllStudents_(actor) {
  return actor.role === 'coach' || actor.role === 'office';
}

/** 可以讀取這位球員段考成績的人：教練、學務處、球員本人、該球員的家長與老師 */
function requireCanReadExam_(actor, playerId) {
  if (seesAllStudents_(actor)) return;
  if (actor.role === 'player' && actor.playerId === playerId) return;
  if ((actor.role === 'parent' || actor.role === 'teacher') && linkedIds_(actor).indexOf(playerId) >= 0) return;
  throw apiError_('FORBIDDEN', '只能查看自己（或自己子女、自己負責的學生）的成績。');}

/** 三方平台：教練、學務處看全部；家長看子女；老師看自己負責的學生 */
function requireHubAccess_(actor, playerId) {
  if (seesAllStudents_(actor)) return;
  if ((actor.role === 'parent' || actor.role === 'teacher') && linkedIds_(actor).indexOf(playerId) >= 0) return;
  throw apiError_('FORBIDDEN', '只能查看自己子女（或自己負責的學生）的資料。');
}

function parseExam_(r) {
  return {
    id: r.id, playerId: r.playerId, schoolYear: Number(r.schoolYear), semester: r.semester, examNo: Number(r.examNo), grade: Number(r.grade),
    scores: parseJson_(r.scores, {}), note: r.note, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

/** 教練不指定球員時回傳全隊；球員、家長一定要指定（並檢查權限） */
function listExamScores_(ctx) {
  const a = ctx.actor;
  const playerId = str_(ctx.payload.playerId, '球員', { max: 20 });
  if (!playerId && !seesAllStudents_(a)) throw apiError_('FORBIDDEN', '只能查看自己（或自己子女）的成績。');
  if (playerId) requireCanReadExam_(a, playerId);
  return { records: readAll_('ExamScores').filter((r) => !playerId || r.playerId === playerId).map(parseExam_) };
}

/** 驗證一次段考的共同欄位（學年、學期、第幾次、年級） */
function examKey_(p) {
  const schoolYear = Number(p.schoolYear);
  if (!(Math.round(schoolYear) === schoolYear && schoolYear >= 100 && schoolYear <= 200)) throw apiError_('INVALID', '「學年度」必須是 100～200 的整數（例如 115）。');
  if (SEMESTERS.indexOf(p.semester) < 0) throw apiError_('INVALID', '「學期」必須是上或下。');
  const examNo = Number(p.examNo);
  if ([1, 2, 3].indexOf(examNo) < 0) throw apiError_('INVALID', '「段考」必須是第 1、2 或 3 次。');
  const grade = Number(p.grade);
  if (!EXAM_SUBJECTS[grade]) throw apiError_('INVALID', '「年級」必須是一、二或三年級。');
  return { schoolYear: schoolYear, semester: p.semester, examNo: examNo, grade: grade };
}

/** 驗證一位球員的各科分數：0～100，最多一位小數；空白代表沒有這科成績 */
function examScores_(raw, grade, who) {
  const subjects = EXAM_SUBJECTS[grade];
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  Object.keys(src).forEach((k) => {
    if (subjects.indexOf(k) < 0) throw apiError_('INVALID', '「' + k + '」不是' + '一二三'.charAt(grade - 7) + '年級的科目。');
    const v = src[k];
    if (v === '' || v === null || v === undefined) return;
    const n = Number(v);
    if (typeof v !== 'number' || !isFinite(n) || n < 0 || n > 100) throw apiError_('INVALID', who + '的' + k + '成績必須是 0～100。');
    if (Math.round(n * 10) / 10 !== n) throw apiError_('INVALID', who + '的' + k + '成績最多一位小數。');
    out[k] = n;
  });
  if (Object.keys(out).length === 0) throw apiError_('INVALID', who + '：請至少輸入一科成績。');
  return out;
}

/** 儲存一次段考的成績（可以一次多位球員）；同一球員同一次段考只有一筆，再次儲存會更新 */
function saveExamScores_(ctx) {
  const a = ctx.actor;
  const key = examKey_(ctx.payload);
  const entries = Array.isArray(ctx.payload.entries) ? ctx.payload.entries : [];
  if (entries.length < 1 || entries.length > 80) throw apiError_('INVALID', '一次可以儲存 1～80 位球員的成績。');
  const players = {};
  readAll_('Players').forEach((p) => (players[p.id] = p));
  const seen = {};
  const clean = entries.map((e) => {
    const playerId = str_(e && e.playerId, '球員', { required: true, max: 20 });
    const p = players[playerId];
    if (!p) throw apiError_('NOT_FOUND', '找不到球員 ' + playerId + '。');
    if (seen[playerId]) throw apiError_('INVALID', p.name + ' 重複出現。');
    seen[playerId] = true;
    return { playerId: playerId, scores: examScores_(e.scores, key.grade, p.name), note: str_(e.note, '備註', { max: 100 }) };
  });
  const existing = readAll_('ExamScores').filter((r) => Number(r.schoolYear) === key.schoolYear && r.semester === key.semester && Number(r.examNo) === key.examNo);
  const now = nowIso_();
  const added = [];
  const saved = [];
  clean.forEach((e) => {
    const old = existing.find((r) => r.playerId === e.playerId);
    if (old) {
      const row = Object.assign({}, old, { grade: key.grade, scores: JSON.stringify(e.scores), note: e.note, updatedAt: now });
      updateRow_('ExamScores', old._row, row);
      saved.push(row);
    } else {
      const row = Object.assign({ id: newId_('EX'), playerId: e.playerId }, key, { scores: JSON.stringify(e.scores), note: e.note, createdBy: a.displayName, createdAt: now, updatedAt: now });
      added.push(row);
      saved.push(row);
    }
  });
  appendRows_('ExamScores', added);
  audit_(a, '儲存段考成績', key.schoolYear + key.semester + ' 第' + key.examNo + '次段考', '新增 ' + added.length + '、更新 ' + (clean.length - added.length) + ' 位');
  return { created: added.length, updated: clean.length - added.length, records: saved.map((r) => parseExam_(stringify_(r))) };
}

function deleteExamScore_(ctx) {
  const a = ctx.actor;
  const id = str_(ctx.payload.id, '成績', { required: true, max: 40 });
  const r = readAll_('ExamScores').find((x) => x.id === id);
  if (!r) throw apiError_('NOT_FOUND', '找不到這筆成績。');
  deleteRow_('ExamScores', r._row);
  audit_(a, '刪除段考成績', r.playerId, r.schoolYear + r.semester + ' 第' + r.examNo + '次段考');
  return { deleted: id };
}

// ───────────────────────── 血量與能力值 ─────────────────────────

/** 怪獸能力值：由等級、進化階段、稀有度與屬性計算（不另外存檔，調整公式時全部自動更新） */
function monsterStats_(m, level) {
  const lv = Number(level) || 1;
  const st = Number(m.stage) || 1;
  const ra = Number(m.rarity) || 1;
  const s = { maxHp: 40 + lv * 6 + st * 10 + ra * 5, atk: 10 + lv * 2 + st * 3 + ra * 2, def: 8 + lv * 1.5 + st * 3 + ra * 2, spd: 10 + lv * 1.5 + ra };
  const bonus = { 熱血: 'atk', 堅守: 'def', 疾風: 'spd', 成長: 'maxHp' }[m.element];
  if (bonus) s[bonus] *= 1.1;
  if (m.element === '團結') {
    s.atk *= 1.05;
    s.def *= 1.05;
  }
  Object.keys(s).forEach((k) => (s[k] = Math.round(s[k])));
  s.crit = m.element === '智慧' ? 0.15 : 0.08;
  return s;
}

/** 目前 HP：hp 空白代表滿血；受傷後每小時自然回復最大 HP 的一部分 */
function currentHp_(pm, maxHp, nowMs) {
  if (pm.hp === '' || pm.hp === undefined || pm.hp === null) return maxHp;
  const hp = Math.max(0, Math.min(maxHp, Number(pm.hp) || 0));
  const at = Date.parse(pm.hpAt);
  const regen = isFinite(at) ? Math.floor(((nowMs - at) / 3600000) * BATTLE.regenPerHour * maxHp) : maxHp;
  return Math.min(maxHp, hp + Math.max(0, regen));
}

function savePmHp_(pm, hp, maxHp) {
  updateRow_('PlayerMonsters', pm._row, Object.assign({}, pm, { hp: hp >= maxHp ? '' : Math.max(0, Math.round(hp)), hpAt: nowIso_() }));
}

// ───────────────────────── 道具 ─────────────────────────

/** 用遊戲點數購買道具（不能用真實金錢；捕捉球不在商店販售） */
function buyItem_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const itemId = String(ctx.payload.itemId || '');
  const item = ITEMS[itemId];
  if (!item || !Object.prototype.hasOwnProperty.call(ITEMS, itemId)) throw apiError_('INVALID', '商店沒有這個道具。');
  const qty = Number(ctx.payload.qty);
  if (!(Math.round(qty) === qty && qty >= 1 && qty <= 10)) throw apiError_('INVALID', '一次可以購買 1～10 個。');
  const w = loadWallet_(playerId);
  const items = walletItems_(w);
  if (items[itemId] + qty > ITEM_MAX_HOLD) throw apiError_('INVALID', item.label + '最多只能持有 ' + ITEM_MAX_HOLD + ' 個（目前 ' + items[itemId] + ' 個）。');
  const cost = item.price * qty;
  const points = Number(w.points) || 0;
  if (points < cost) throw apiError_('INVALID', '點數不足，需要 ' + cost + ' 點（目前 ' + points + ' 點）。完成任務或對戰可以獲得點數。');
  items[itemId] += qty;
  w.items = JSON.stringify(items);
  w.points = points - cost;
  saveWallet_(w);
  rewardLog_(playerId, '商店', '購買 ' + item.label + ' ×' + qty, 0, -cost, 0);
  return { state: gameState_(playerId) };
}

/** 對戰以外使用回復道具 */
function useItem_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  requireActivePlayer_(pm.playerId);
  const itemId = String(ctx.payload.itemId || '');
  const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : null;
  if (!item) throw apiError_('INVALID', '沒有這個道具。');
  if (!item.heal) throw apiError_('INVALID', item.label + '只能在對戰中使用。');
  if (readAll_('Battles').some((b) => b.playerId === pm.playerId && b.status === 'active')) throw apiError_('INVALID', '你有一場進行中的對戰，請在對戰畫面使用道具。');
  const w = loadWallet_(pm.playerId);
  const items = walletItems_(w);
  if (items[itemId] < 1) throw apiError_('INVALID', '你沒有' + item.label + '。可以到商店用點數購買。');
  const m = readAll_('Monsters').find((x) => x.id === pm.monsterId);
  if (!m) throw apiError_('NOT_FOUND', '怪獸資料不存在。');
  const s = monsterStats_(m, pm.level);
  const hp = currentHp_(pm, s.maxHp, Date.now());
  if (hp >= s.maxHp) throw apiError_('INVALID', pm.nickname + ' 的 HP 已經是滿的。');
  const after = Math.min(s.maxHp, hp + Math.ceil(s.maxHp * item.heal));
  savePmHp_(pm, after, s.maxHp);
  items[itemId] -= 1;
  w.items = JSON.stringify(items);
  saveWallet_(w);
  return { healed: after - hp, state: gameState_(pm.playerId) };
}

// ───────────────────────── 對戰 ─────────────────────────

/** 對戰中的一方（建立對戰時的能力值快照） */
function combatant_(pm, m, hp, owner) {
  const s = monsterStats_(m, pm.level);
  return {
    pmId: pm.id || '', monsterId: m.id, name: pm.nickname || m.name, level: Number(pm.level) || 1, element: m.element, owner: owner,
    maxHp: s.maxHp, hp: hp === undefined ? s.maxHp : hp, atk: s.atk, def: s.def, spd: s.spd, crit: s.crit, cd: 0, atkUp: false, defUp: false, defending: false,
  };
}

/** 傷害公式（純計算，方便測試） */
function battleDamage_(att, dfd, power, rng) {
  const type = ELEMENT_BEATS[att.element] === dfd.element ? 1.3 : ELEMENT_BEATS[dfd.element] === att.element ? 0.8 : 1;
  const crit = rng() < att.crit;
  const atk = att.atk * (att.atkUp ? 1.3 : 1);
  const def = dfd.def * (dfd.defUp ? 1.3 : 1);
  const lvScale = 0.9 + (Number(att.level) || 1) * 0.05; // 等級越高傷害越高，讓高等級對戰也維持 4～6 回合
  const dmg = Math.max(1, Math.round((atk / def) * 14 * lvScale * power * (0.85 + rng() * 0.15) * type * (crit ? 1.5 : 1) * (dfd.defending ? 0.5 : 1)));
  return { dmg: dmg, crit: crit, type: type };
}

/** 一方的行動；回傳是否打倒對手 */
function battleMove_(actor, target, move, log, rng) {
  if (move === 'defend') {
    actor.defending = true;
    log.push(actor.name + ' 擺出防守姿勢！');
    return false;
  }
  const skill = move === 'skill';
  if (skill) actor.cd = BATTLE.skillCooldown;
  const r = battleDamage_(actor, target, skill ? BATTLE.skillPower : 1, rng);
  target.hp = Math.max(0, target.hp - r.dmg);
  log.push(
    actor.name + (skill ? ' 使出必殺技！' : ' 發動攻擊！') + (r.crit ? '會心一擊！' : '') + (r.type > 1 ? '效果絕佳！' : r.type < 1 ? '效果不太好…' : '') +
      target.name + ' 受到 ' + r.dmg + ' 點傷害。',
  );
  if (target.hp <= 0) {
    log.push(target.name + ' 倒下了！');
    return true;
  }
  return false;
}

/** 對手（電腦）的選擇 */
function battleAi_(foe, rng) {
  const r = rng();
  if (foe.cd === 0 && r < 0.45) return 'skill';
  if (r > 0.88) return 'defend';
  return 'attack';
}

/**
 * 處理一回合（純計算，不讀寫試算表）：st 是對戰狀態、items 是背包；會直接修改兩者。
 * 回傳 { log, ended: null | 'won' | 'lost' | 'draw' | 'fled', usedItem }
 */
function resolveTurn_(st, mode, action, itemId, items, rng) {
  const me = st.me;
  const foe = st.foe;
  const log = [];
  let ended = null;
  let usedItem = '';
  if (['attack', 'skill', 'defend', 'item', 'flee'].indexOf(action) < 0) throw apiError_('INVALID', '不正確的行動。');
  if (action === 'skill' && me.cd > 0) throw apiError_('INVALID', '必殺技還在冷卻中（還要 ' + me.cd + ' 回合）。');
  if (action === 'item') {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : null;
    if (!item) throw apiError_('INVALID', '沒有這個道具。');
    if (!(items[itemId] > 0)) throw apiError_('INVALID', '你沒有' + item.label + '。');
    if (item.heal && me.hp >= me.maxHp) throw apiError_('INVALID', 'HP 已經是滿的。');
    if (item.boost && me[item.boost]) throw apiError_('INVALID', '這場對戰已經用過' + item.label + '了。');
    items[itemId] -= 1;
    usedItem = itemId;
    if (item.heal) {
      const before = me.hp;
      me.hp = Math.min(me.maxHp, me.hp + Math.ceil(me.maxHp * item.heal));
      log.push('使用了' + item.label + '！' + me.name + ' 回復 ' + (me.hp - before) + ' HP。');
    } else {
      me[item.boost] = true;
      log.push('使用了' + item.label + '！' + me.name + (item.boost === 'atkUp' ? ' 的攻擊力提升了！' : ' 的防禦力提升了！'));
    }
  }
  if (action === 'flee') {
    if (mode === 'pvp') {
      log.push('你選擇投降。');
      return { log: log, ended: 'lost', usedItem: usedItem };
    }
    if (rng() < BATTLE.pveFleeRate) {
      log.push('成功逃跑了！');
      return { log: log, ended: 'fled', usedItem: usedItem };
    }
    log.push('逃跑失敗！');
  }
  const foeMove = battleAi_(foe, rng);
  // 防守、使用道具、逃跑優先行動；其餘依速度，速度快的先出手（相同時隨機）
  const meQuick = ['defend', 'item', 'flee'].indexOf(action) >= 0;
  const foeQuick = foeMove === 'defend';
  const meFirst = meQuick !== foeQuick ? meQuick : me.spd > foe.spd || (me.spd === foe.spd && rng() < 0.5);
  const order = meFirst ? ['me', 'foe'] : ['foe', 'me'];
  for (let i = 0; i < order.length && !ended; i++) {
    if (order[i] === 'me') {
      if (action === 'attack' || action === 'skill' || action === 'defend') {
        if (battleMove_(me, foe, action, log, rng)) ended = 'won';
      }
    } else if (battleMove_(foe, me, foeMove, log, rng)) {
      ended = 'lost';
    }
  }
  // 回合結束：冷卻 -1、取消防守姿勢
  [me, foe].forEach((c) => {
    if (c.cd > 0) c.cd -= 1;
    c.defending = false;
  });
  st.turn += 1;
  if (!ended && st.turn > BATTLE.maxTurns) {
    const a = me.hp / me.maxHp;
    const b = foe.hp / foe.maxHp;
    ended = a > b ? 'won' : a < b ? 'lost' : 'draw';
    log.push('已經到達 ' + BATTLE.maxTurns + ' 回合，依剩餘 HP 比例判定' + (ended === 'won' ? '你獲勝！' : ended === 'lost' ? '對手獲勝。' : '平手。'));
  }
  return { log: log, ended: ended, usedItem: usedItem };
}

function battleView_(b) {
  const st = parseJson_(b.state, {});
  return {
    id: b.id, mode: b.mode, status: b.status, opponentName: b.opponentName, turn: st.turn || 1, me: st.me || null, foe: st.foe || null,
    log: parseJson_(b.log, []), result: parseJson_(b.result, null), createdAt: b.createdAt,
  };
}

/** 對戰紀錄摘要；被挑戰的一方看到的勝負是反過來的 */
function battleSummary_(b, playerId) {
  const st = parseJson_(b.state, {});
  const defense = b.playerId !== playerId;
  const flip = { won: 'lost', lost: 'won', draw: 'draw', fled: 'fled' };
  return {
    id: b.id, mode: b.mode, defense: defense, status: defense ? flip[b.status] || b.status : b.status, createdAt: b.createdAt,
    myMonster: defense ? (st.foe && st.foe.name) || '' : (st.me && st.me.name) || '',
    foeMonster: defense ? (st.me && st.me.name) || '' : (st.foe && st.foe.name) || '',
    opponentName: defense ? (st.me && st.me.owner) || '' : b.opponentName,
  };
}

/** PVP 對手名單：其他啟用中的球員與他們的夥伴（對方由電腦操控，不會扣對方的 HP） */
function listOpponents_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const today = today_();
  const players = readAll_('Players').filter((p) => p.active === 'TRUE' && p.id !== playerId);
  const pms = readAll_('PlayerMonsters').filter((x) => x.partner === 'TRUE');
  const monById = {};
  readAll_('Monsters').forEach((m) => (monById[m.id] = m));
  const challenged = readAll_('Battles').filter((b) => b.playerId === playerId && b.mode === 'pvp' && b.date === today).map((b) => b.opponentPlayerId);
  const list = [];
  players.forEach((p) => {
    const pm = pms.find((x) => x.playerId === p.id);
    const m = pm && monById[pm.monsterId];
    if (!m) return;
    list.push({ playerId: p.id, name: p.name, nickname: pm.nickname, monsterId: m.id, element: m.element, level: Number(pm.level) || 1, challengedToday: challenged.indexOf(p.id) >= 0 });
  });
  return { opponents: list };
}

function pickWeighted_(pool, rng) {
  const weight = (m) => GAME.rarityWeight[Number(m.rarity)] || GAME.rarityWeight[1];
  let roll = rng() * pool.reduce((s, m) => s + weight(m), 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weight(pool[i]);
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 開始對戰：PVE 對野生怪獸，PVP 挑戰隊友的夥伴；每天次數有限 */
function startBattle_(ctx) {
  const a = ctx.actor;
  const playerId = requireGamePlayer_(a);
  const mode = ctx.payload.mode;
  if (mode !== 'pve' && mode !== 'pvp') throw apiError_('INVALID', '對戰模式不正確。');
  const battles = readAll_('Battles');
  if (battles.some((b) => b.playerId === playerId && b.status === 'active')) throw apiError_('INVALID', '你有一場還沒結束的對戰，請先完成它。');
  const pm = findOwnPM_(a, ctx.payload.playerMonsterId);
  const monsters = readAll_('Monsters');
  const m = monsters.find((x) => x.id === pm.monsterId);
  if (!m) throw apiError_('NOT_FOUND', '怪獸資料不存在。');
  const hp = currentHp_(pm, monsterStats_(m, pm.level).maxHp, Date.now());
  if (hp <= 0) throw apiError_('INVALID', pm.nickname + ' 已經沒有體力了，請使用回復道具或等待自然回復。');
  const today = today_();
  const w = loadWallet_(playerId);
  if (w.battleDate !== today) {
    w.battleDate = today;
    w.pveCount = 0;
    w.pvpCount = 0;
  }
  const me = combatant_(pm, m, hp, playerName_(playerId));
  let foe;
  let opponentPlayerId = '';
  let opponentName;
  if (mode === 'pve') {
    if ((Number(w.pveCount) || 0) >= BATTLE.pveDaily) throw apiError_('INVALID', '今天的野外對戰次數（' + BATTLE.pveDaily + ' 次）已用完，明天再來吧！');
    const areaId = ctx.payload.areaId;
    if (AREAS.indexOf(areaId) < 0) throw apiError_('INVALID', '對戰地點不正確。');
    const area = monsters.filter((x) => x.habitat === areaId && x.inWild === 'TRUE');
    if (area.length === 0) throw apiError_('INVALID', '這個區域目前沒有怪獸出沒。');
    // 進化型的野生怪獸，要等你的怪獸達到牠「通常進化的等級」才會出現，避免新手一開始就遇到太強的對手
    const unlockLevel = (x) => {
      const prev = monsters.find((y) => y.evolvesTo === x.id);
      return prev ? Number(prev.evolveLevel) || 1 : 1;
    };
    const fair = area.filter((x) => me.level >= unlockLevel(x));
    const wild = pickWeighted_(fair.length ? fair : area, Math.random);
    const level = Math.max(1, Math.min(GAME.maxLevel, me.level + Math.floor(Math.random() * 4) - 2));
    foe = combatant_({ id: '', nickname: '野生的' + wild.name, level: level }, wild, undefined, '野生');
    opponentName = '野生的' + wild.name;
    w.pveCount = (Number(w.pveCount) || 0) + 1;
    addSeen_(w, wild.id); // 遭遇過的怪獸記入圖鑑「看過」
  } else {
    if ((Number(w.pvpCount) || 0) >= BATTLE.pvpDaily) throw apiError_('INVALID', '今天的隊友挑戰次數（' + BATTLE.pvpDaily + ' 次）已用完，明天再來吧！');
    opponentPlayerId = str_(ctx.payload.opponentPlayerId, '對手', { required: true, max: 20 });
    if (opponentPlayerId === playerId) throw apiError_('INVALID', '不能挑戰自己。');
    const op = readAll_('Players').find((p) => p.id === opponentPlayerId && p.active === 'TRUE');
    if (!op) throw apiError_('NOT_FOUND', '找不到這位隊友。');
    if (battles.some((b) => b.playerId === playerId && b.mode === 'pvp' && b.date === today && b.opponentPlayerId === opponentPlayerId)) throw apiError_('INVALID', '今天已經挑戰過 ' + op.name + ' 了，明天再來吧！');
    const opPm = readAll_('PlayerMonsters').find((x) => x.playerId === opponentPlayerId && x.partner === 'TRUE');
    const opM = opPm && monsters.find((x) => x.id === opPm.monsterId);
    if (!opM) throw apiError_('INVALID', op.name + ' 還沒有夥伴，無法挑戰。');
    foe = combatant_(opPm, opM, undefined, op.name); // 對方以滿血、電腦操控出戰，不影響對方的資料
    opponentName = op.name;
    w.pvpCount = (Number(w.pvpCount) || 0) + 1;
    addSeen_(w, opM.id);
  }
  saveWallet_(w);
  const now = nowIso_();
  const st = { turn: 1, me: me, foe: foe };
  const log = ['⚔️ 對戰開始！' + me.name + '（Lv.' + me.level + '）對上 ' + foe.name + '（Lv.' + foe.level + '）'];
  const row = { id: newId_('B'), playerId: playerId, mode: mode, opponentPlayerId: opponentPlayerId, opponentName: opponentName, date: today, status: 'active', state: JSON.stringify(st), log: JSON.stringify(log), result: '', createdAt: now, updatedAt: now };
  appendRow_('Battles', row);
  return { state: gameState_(playerId) };
}

function playerName_(playerId) {
  const p = readAll_('Players').find((x) => x.id === playerId);
  return p ? p.name : '';
}

/** 對戰中的一個行動：攻擊、必殺技、防守、使用道具、逃跑（PVP 為投降） */
function battleAction_(ctx) {
  const playerId = requireGamePlayer_(ctx.actor);
  const id = str_(ctx.payload.battleId, '對戰', { required: true, max: 40 });
  const b = readAll_('Battles').find((x) => x.id === id);
  if (!b) throw apiError_('NOT_FOUND', '找不到這場對戰。');
  if (b.playerId !== playerId) throw apiError_('FORBIDDEN', '只能操作自己的對戰。');
  if (b.status !== 'active') throw apiError_('INVALID', '這場對戰已經結束了。');
  const st = parseJson_(b.state, null);
  if (!st || !st.me || !st.foe) throw apiError_('SERVER', '對戰資料損毀，請聯絡教練。');
  const w = loadWallet_(playerId);
  const items = walletItems_(w);
  const turn = resolveTurn_(st, b.mode, ctx.payload.action, String(ctx.payload.itemId || ''), items, Math.random);
  if (turn.usedItem) {
    w.items = JSON.stringify(items);
    saveWallet_(w);
  }
  const log = parseJson_(b.log, []).concat(turn.log).slice(-40);
  let result = null;
  if (turn.ended) result = finishBattle_(b, st, turn.ended, log);
  const row = Object.assign({}, b, {
    status: turn.ended || 'active', state: JSON.stringify(st), log: JSON.stringify(log), result: result ? JSON.stringify(result) : '', updatedAt: nowIso_(),
  });
  updateRow_('Battles', b._row, row);
  // battle：這場對戰的最新畫面（結束後 state.battle 會是 null，前端用這個顯示最後的戰況）
  return { ended: turn.ended, result: result, battle: battleView_(row), state: gameState_(playerId) };
}

/** 對戰結束：把 HP 寫回怪獸，發放經驗值與點數 */
function finishBattle_(b, st, status, log) {
  const playerId = b.playerId;
  const pm = readAll_('PlayerMonsters').find((x) => x.id === st.me.pmId && x.playerId === playerId);
  const result = { exp: 0, points: 0, drop: '' };
  if (pm) {
    savePmHp_(pm, st.me.hp, st.me.maxHp);
    const reward = status === 'fled' ? null : BATTLE.rewards[b.mode][status];
    if (reward) {
      result.exp = reward.exp + (status === 'won' ? st.foe.level : 0);
      result.points = reward.points;
      const fresh = readAll_('PlayerMonsters').find((x) => x.id === pm.id);
      const r = applyExp_(Number(fresh.level), Number(fresh.exp), result.exp);
      updateRow_('PlayerMonsters', fresh._row, Object.assign({}, fresh, { level: r.level, exp: r.exp }));
      progressLog_(playerId, pm.id, result.exp, r.level, (b.mode === 'pvp' ? '隊友挑戰' : '野外對戰') + (status === 'won' ? '獲勝' : status === 'draw' ? '平手' : '落敗'));
    }
  }
  const w = loadWallet_(playerId);
  if (result.points) w.points = (Number(w.points) || 0) + result.points;
  if (b.mode === 'pve' && status === 'won' && Math.random() < BATTLE.potionDropRate) {
    const items = walletItems_(w);
    if (items.potion < ITEM_MAX_HOLD) {
      items.potion += 1;
      w.items = JSON.stringify(items);
      result.drop = 'potion';
    }
  }
  saveWallet_(w);
  const label = { won: '獲勝', lost: '落敗', draw: '平手', fled: '逃跑' }[status];
  log.push(status === 'won' ? '🏆 你贏了！' : status === 'lost' ? '下次再加油！' : status === 'draw' ? '雙方平手！' : '離開了對戰。');
  if (status !== 'fled') rewardLog_(playerId, b.mode === 'pvp' ? '隊友挑戰' : '野外對戰', label + '：對上 ' + b.opponentName + (result.drop ? '（獲得回復藥水）' : ''), result.exp, result.points, 0);
  return result;
}

// ───────────────────────── 邀請碼與自行註冊 ─────────────────────────

const INVITE_DAYS = 14;
const REGISTER_MAX_FAILS = 30; // 10 分鐘內全站最多 30 次錯誤的邀請碼，避免有人亂猜

function parseInvite_(r) {
  return {
    id: r.id, role: r.role, playerIds: r.playerIds ? r.playerIds.split(',') : [], label: r.label, status: r.status === 'active' && r.expiresAt < nowIso_() ? 'expired' : r.status,
    createdBy: r.createdBy, createdAt: r.createdAt, expiresAt: r.expiresAt, usedBy: r.usedBy, usedAt: r.usedAt,
  };
}

/** 教練產生邀請碼（只會顯示這一次）；一組邀請碼只能註冊一個帳號，14 天後失效 */
function adminCreateInvite_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  if (['parent', 'teacher', 'office'].indexOf(p.role) < 0) throw apiError_('INVALID', '邀請碼只能給家長、老師或學務處使用。');
  const playerIds = p.role === 'office' ? '' : linkedPlayerIds_(p.playerIds, p.role);
  const label = str_(p.label, '備註', { max: 40 });
  const code = randomCode_();
  const salt = Utilities.getUuid();
  const now = new Date();
  const row = {
    id: newId_('IV'), codeSalt: salt, codeHash: hashCode_(salt, code), role: p.role, playerIds: playerIds, label: label, status: 'active',
    createdById: a.id, createdBy: a.displayName, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86400000).toISOString(), usedBy: '', usedAt: '',
  };
  appendRow_('Invites', row);
  audit_(a, '產生邀請碼', row.id, ROLE_NAMES[p.role] + (label ? '（' + label + '）' : ''));
  return { invite: parseInvite_(stringify_(row)), code: code };
}

function adminListInvites_() {
  return { invites: readAll_('Invites').map(parseInvite_).reverse() };
}

function adminRevokeInvite_(ctx) {
  const id = str_(ctx.payload.id, '邀請碼', { required: true, max: 40 });
  const r = readAll_('Invites').find((x) => x.id === id);
  if (!r) throw apiError_('NOT_FOUND', '找不到這組邀請碼。');
  if (r.status !== 'active') throw apiError_('INVALID', '這組邀請碼已經用過或已作廢。');
  updateRow_('Invites', r._row, Object.assign({}, r, { status: 'revoked' }));
  audit_(ctx.actor, '作廢邀請碼', id, r.label);
  return { revoked: id };
}

/** 家長或老師用邀請碼建立帳號：帳號、顯示名稱、密碼都由自己設定；建立後直接登入 */
function register_(ctx) {
  const p = ctx.payload;
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('reg_fail') || 0);
  if (fails >= REGISTER_MAX_FAILS) throw apiError_('LOCKED', '嘗試次數過多，請 10 分鐘後再試。');
  const code = str_(p.inviteCode, '邀請碼', { required: true, max: 20 }).toUpperCase().replace(/\s/g, '');
  const now = nowIso_();
  const invite = readAll_('Invites').find((r) => r.status === 'active' && r.expiresAt > now && hashCode_(r.codeSalt, code) === r.codeHash);
  if (!invite) {
    cache.put('reg_fail', String(fails + 1), 600);
    throw apiError_('INVALID', '邀請碼不正確、已經用過或已過期，請向教練確認。');
  }
  const loginId = validLoginId_(p.loginId);
  const displayName = str_(p.displayName, '顯示名稱', { required: true, max: 30 });
  const password = validNewCode_(p.password, '密碼');
  const acc = createUser_({ loginId: loginId, displayName: displayName, role: invite.role, playerId: '', childPlayerIds: invite.playerIds }, password);
  updateRow_('Invites', invite._row, Object.assign({}, invite, { status: 'used', usedBy: acc.id, usedAt: now }));
  const u = readAll_('Users').find((x) => x.id === acc.id);
  audit_(u, '用邀請碼建立帳號', acc.id, displayName + '（' + ROLE_NAMES[invite.role] + '）');
  return { token: newSession_(u), user: publicUser_(u) };
}

// ───────────────────────── 三方平台：溝通、在校表現、行程 ─────────────────────────

const SCHOOL_CATEGORIES = ['上課表現', '作業繳交', '學習態度', '出缺席', '品德行為', '其他'];
const SCHOOL_RATINGS = ['', '優良', '良好', '普通', '待加強'];
const EVENT_CATEGORIES = ['練習', '比賽', '考試', '學校活動', '集合出發', '其他'];
const ROLE_NAMES = { coach: '教練', player: '球員', parent: '家長', teacher: '老師', office: '學務處' };

function parseMessage_(r) {
  return {
    id: r.id, playerId: r.playerId, authorId: r.authorId, authorName: r.authorName, authorRole: r.authorRole, body: r.body, createdAt: r.createdAt,
    batchId: r.batchId || '', batchSize: Number(r.batchSize) || 0,
  };
}

function parseSchoolRecord_(r) {
  return {
    id: r.id, playerId: r.playerId, date: r.date, category: r.category, rating: r.rating, content: r.content,
    authorId: r.authorId, authorName: r.authorName, authorRole: r.authorRole, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

function parseEvent_(r) {
  return {
    id: r.id, title: r.title, date: r.date, startTime: r.startTime, endTime: r.endTime, location: r.location, category: r.category,
    playerIds: r.playerIds ? r.playerIds.split(',') : [], note: r.note, createdById: r.createdById, createdBy: r.createdBy, updatedAt: r.updatedAt,
  };
}

/** 這個行程和這位球員有關嗎？（沒有指定學生＝全隊） */
function eventFor_(e, playerId) {
  return e.playerIds.length === 0 || e.playerIds.indexOf(playerId) >= 0;
}

/** 依角色可以看到的行程：教練全部；球員自己的與全隊的；家長、老師是子女／學生的與全隊的 */
function visibleEvents_(actor) {
  const all = readAll_('Events').map(parseEvent_);
  if (seesAllStudents_(actor)) return all;
  const mine = actor.role === 'player' ? [actor.playerId] : linkedIds_(actor);
  return all.filter((e) => e.playerIds.length === 0 || e.playerIds.some((id) => mine.indexOf(id) >= 0) || e.createdById === actor.id);
}

/** 行程清單：預設是 7 天前到 60 天後 */
function listEvents_(ctx) {
  const today = today_();
  const from = ctx.payload.from ? dateStr_(ctx.payload.from, '開始日期') : addDaysStr_(today, -7);
  const to = ctx.payload.to ? dateStr_(ctx.payload.to, '結束日期') : addDaysStr_(today, 60);
  const list = visibleEvents_(ctx.actor).filter((e) => e.date >= from && e.date <= to);
  list.sort((x, y) => (x.date + x.startTime < y.date + y.startTime ? -1 : 1));
  return { events: list, today: today };
}

function addDaysStr_(dateStr, days) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

function timeStr_(v, label) {
  const s = str_(v, label, { max: 5 });
  if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw apiError_('INVALID', '「' + label + '」請用 24 小時制，例如 08:30。');
  return s;
}

/** 新增／修改行程：教練、學務處可以設全隊或指定學生；老師只能設給自己負責的學生 */
function saveEvent_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  if (EVENT_CATEGORIES.indexOf(p.category) < 0) throw apiError_('INVALID', '請選擇行程類別。');
  let playerIds = (Array.isArray(p.playerIds) ? p.playerIds.map(String) : []).filter((v, i, arr) => v && arr.indexOf(v) === i);
  if (a.role === 'teacher') {
    const mine = linkedIds_(a);
    if (playerIds.length === 0) playerIds = mine; // 老師沒選學生＝自己負責的全部學生
    if (playerIds.some((id) => mine.indexOf(id) < 0)) throw apiError_('FORBIDDEN', '老師只能為自己負責的學生新增行程。');
  } else if (playerIds.length) {
    const players = readAll_('Players');
    if (playerIds.some((id) => !players.some((x) => x.id === id))) throw apiError_('INVALID', '找不到指定的學生。');
  }
  const startTime = timeStr_(p.startTime, '開始時間');
  const endTime = timeStr_(p.endTime, '結束時間');
  if (startTime && endTime && endTime < startTime) throw apiError_('INVALID', '結束時間不能早於開始時間。');
  const fields = {
    title: str_(p.title, '行程名稱', { required: true, max: 40 }), date: dateStr_(p.date, '日期'), startTime: startTime, endTime: endTime,
    location: str_(p.location, '地點', { max: 40 }), category: p.category, playerIds: playerIds.join(','), note: str_(p.note, '備註', { max: 300 }), updatedAt: nowIso_(),
  };
  let row;
  if (p.id) {
    const old = readAll_('Events').find((x) => x.id === p.id);
    if (!old) throw apiError_('NOT_FOUND', '找不到這個行程。');
    if (a.role !== 'coach' && old.createdById !== a.id) throw apiError_('FORBIDDEN', '只能修改自己新增的行程。');
    row = Object.assign({}, old, fields);
    updateRow_('Events', old._row, row);
  } else {
    row = Object.assign({ id: newId_('EV'), createdById: a.id, createdBy: a.displayName + '（' + ROLE_NAMES[a.role] + '）', createdAt: fields.updatedAt }, fields);
    appendRow_('Events', row);
  }
  return { event: parseEvent_(stringify_(row)) };
}

function deleteEvent_(ctx) {
  const a = ctx.actor;
  const r = readAll_('Events').find((x) => x.id === str_(ctx.payload.id, '行程', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這個行程。');
  if (a.role !== 'coach' && r.createdById !== a.id) throw apiError_('FORBIDDEN', '只能刪除自己新增的行程。');
  deleteRow_('Events', r._row);
  return { deleted: r.id };
}

/**
 * 溝通區留言：只有這位學生的家長、老師、學務處與教練看得到（學生本人看不到）。
 * playerIds 有多位時是「群發」：同一則訊息一次放進每位學生的溝通區（家長只能發給自己的孩子）。
 */
function postMessage_(ctx) {
  const a = ctx.actor;
  const raw = Array.isArray(ctx.payload.playerIds) ? ctx.payload.playerIds : [ctx.payload.playerId];
  const ids = raw.map((v) => str_(v, '學生', { required: true, max: 20 })).filter((v, i, arr) => arr.indexOf(v) === i);
  if (ids.length === 0) throw apiError_('INVALID', '請選擇至少一位學生。');
  if (ids.length > 200) throw apiError_('INVALID', '一次最多發給 200 位學生。');
  ids.forEach((id) => requireHubAccess_(a, id));
  const players = readAll_('Players');
  if (ids.some((id) => !players.some((x) => x.id === id))) throw apiError_('NOT_FOUND', '找不到指定的學生。');
  const body = str_(ctx.payload.body, '留言內容', { required: true, max: 1000 });
  const now = nowIso_();
  const batchId = ids.length > 1 ? newId_('MB') : '';
  const rows = ids.map((id) => ({ id: newId_('MS'), playerId: id, authorId: a.id, authorName: a.displayName, authorRole: a.role, body: body, createdAt: now, batchId: batchId, batchSize: ids.length > 1 ? ids.length : '' }));
  appendRows_('Messages', rows);
  return { message: parseMessage_(stringify_(rows[0])), messages: rows.map((r) => parseMessage_(stringify_(r))), sent: rows.length };
}

/** 刪除留言：自己的留言，或教練。wholeBatch：群發的訊息從所有學生的溝通區一起刪除 */
function deleteMessage_(ctx) {
  const a = ctx.actor;
  const all = readAll_('Messages');
  const r = all.find((x) => x.id === str_(ctx.payload.id, '留言', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這則留言。');
  if (a.role !== 'coach' && r.authorId !== a.id) throw apiError_('FORBIDDEN', '只能刪除自己的留言。');
  const targets = ctx.payload.wholeBatch === true && r.batchId ? all.filter((x) => x.batchId === r.batchId) : [r];
  targets.map((x) => x._row).sort((x, y) => y - x).forEach((row) => deleteRow_('Messages', row));
  return { deleted: r.id, count: targets.length };
}

/**
 * 全部學生一覽：每位學生的最新狀況（一次讀完）。
 * 教練、學務處：全部在籍學生；老師：負責的學生；家長：自己的孩子。
 */
function hubRoster_(ctx) {
  const a = ctx.actor;
  const today = today_();
  const since14 = addDaysStr_(today, -13);
  const mine = linkedIds_(a);
  const players = readAll_('Players').filter((p) => p.active === 'TRUE' && (seesAllStudents_(a) || mine.indexOf(p.id) >= 0));
  const ids = {};
  players.forEach((p) => (ids[p.id] = true));
  const pick = (name) => readAll_(name).filter((r) => ids[r.playerId]);
  const lastBy = (rows, field) => {
    const m = {};
    rows.forEach((r) => {
      if (!m[r.playerId] || m[r.playerId][field] < r[field]) m[r.playerId] = r;
    });
    return m;
  };
  const lastMsg = lastBy(pick('Messages'), 'createdAt');
  const lastRec = lastBy(pick('SchoolRecords'), 'date');
  const notes = pick('DailyNotes').filter((n) => n.date >= since14);
  const exams = pick('ExamScores').map(parseExam_);
  const latestExam = {};
  exams.forEach((e) => {
    const k = e.schoolYear * 100 + (e.semester === '上' ? 0 : 10) + e.examNo;
    if (!latestExam[e.playerId] || latestExam[e.playerId].k < k) latestExam[e.playerId] = { k: k, e: e };
  });
  const events = visibleEvents_(a).filter((e) => e.date >= today && e.date <= addDaysStr_(today, 7));
  return {
    today: today,
    students: players.map((p) => {
      const ex = latestExam[p.id] && latestExam[p.id].e;
      const vals = ex ? Object.keys(ex.scores).map((k) => ex.scores[k]) : [];
      return {
        playerId: p.id, name: p.name, grade: p.grade, number: p.number,
        lastMessageAt: lastMsg[p.id] ? lastMsg[p.id].createdAt : '',
        lastMessageBy: lastMsg[p.id] ? lastMsg[p.id].authorName : '',
        lastRecord: lastRec[p.id] ? { date: lastRec[p.id].date, category: lastRec[p.id].category, rating: lastRec[p.id].rating } : null,
        notes14: notes.filter((n) => n.playerId === p.id).length,
        latestExam: ex ? { label: ex.schoolYear + ex.semester + ' 第' + ex.examNo + '次', average: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null } : null,
        upcomingEvents: events.filter((e) => eventFor_(e, p.id)).length,
      };
    }),
  };
}

/** 在校表現紀錄：老師（自己負責的學生）與教練可以新增；只能修改自己寫的（教練可修改全部） */
function saveSchoolRecord_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const playerId = str_(p.playerId, '學生', { required: true, max: 20 });
  requireHubAccess_(a, playerId);
  if (SCHOOL_CATEGORIES.indexOf(p.category) < 0) throw apiError_('INVALID', '請選擇紀錄類別。');
  if (SCHOOL_RATINGS.indexOf(p.rating || '') < 0) throw apiError_('INVALID', '評等不正確。');
  const date = dateStr_(p.date, '日期');
  if (date > today_()) throw apiError_('INVALID', '日期不能是未來。');
  const fields = { playerId: playerId, date: date, category: p.category, rating: p.rating || '', content: str_(p.content, '內容', { required: true, max: 500 }), updatedAt: nowIso_() };
  let row;
  if (p.id) {
    const old = readAll_('SchoolRecords').find((x) => x.id === p.id);
    if (!old || old.playerId !== playerId) throw apiError_('NOT_FOUND', '找不到這筆紀錄。');
    if (a.role !== 'coach' && old.authorId !== a.id) throw apiError_('FORBIDDEN', '只能修改自己寫的紀錄。');
    row = Object.assign({}, old, fields);
    updateRow_('SchoolRecords', old._row, row);
  } else {
    row = Object.assign({ id: newId_('SR'), authorId: a.id, authorName: a.displayName, authorRole: a.role, createdAt: fields.updatedAt }, fields);
    appendRow_('SchoolRecords', row);
  }
  return { record: parseSchoolRecord_(stringify_(row)) };
}

function deleteSchoolRecord_(ctx) {
  const a = ctx.actor;
  const r = readAll_('SchoolRecords').find((x) => x.id === str_(ctx.payload.id, '紀錄', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這筆紀錄。');
  if (a.role !== 'coach' && r.authorId !== a.id) throw apiError_('FORBIDDEN', '只能刪除自己寫的紀錄。');
  deleteRow_('SchoolRecords', r._row);
  return { deleted: r.id };
}

/**
 * 三方平台的一位學生總覽（一次讀完，畫面不用分很多次請求）：
 * 行程、溝通區、在校表現、棒球筆記（含教練評語）、目標、體能最新成績、段考成績。
 */
function hubSummary_(ctx) {
  const a = ctx.actor;
  const playerId = str_(ctx.payload.playerId, '學生', { required: true, max: 20 });
  requireHubAccess_(a, playerId);
  const p = readAll_('Players').find((x) => x.id === playerId);
  if (!p) throw apiError_('NOT_FOUND', '找不到這位學生。');
  const today = today_();
  const byDateDesc = (x, y) => (x.date === y.date ? (x.createdAt < y.createdAt ? 1 : -1) : x.date < y.date ? 1 : -1);
  const fitness = readAll_('FitnessTests').filter((f) => f.playerId === playerId).map(parseFitness_);
  const latestFitness = {};
  fitness.forEach((f) => {
    if (!latestFitness[f.item] || latestFitness[f.item].date < f.date) latestFitness[f.item] = f;
  });
  const events = visibleEvents_(a).filter((e) => eventFor_(e, playerId) && e.date >= addDaysStr_(today, -3) && e.date <= addDaysStr_(today, 60));
  events.sort((x, y) => (x.date + x.startTime < y.date + y.startTime ? -1 : 1));
  return {
    today: today,
    player: parsePlayer_(p),
    events: events,
    messages: readAll_('Messages').filter((m) => m.playerId === playerId).map(parseMessage_).slice(-100),
    schoolRecords: readAll_('SchoolRecords').filter((r) => r.playerId === playerId).map(parseSchoolRecord_).sort(byDateDesc).slice(0, 50),
    notes: readAll_('DailyNotes').filter((n) => n.playerId === playerId).map(parseNote_).sort(byDateDesc).slice(0, 30),
    goals: readAll_('Goals').filter((g) => g.playerId === playerId).map(parseGoal_),
    fitness: Object.keys(latestFitness).map((k) => latestFitness[k]),
    exams: readAll_('ExamScores').filter((r) => r.playerId === playerId).map(parseExam_),
  };
}

// ───────────────────────── 球隊管理：練球通知、出缺席、通訊錄、預算、賽事 ─────────────────────────

const PRACTICE_TYPES = ['練球', '休息', '比賽', '其他'];
const ATTENDANCE_STATUSES = ['出席', '遲到', '早退', '事假', '病假', '公假', '缺席'];
const MONEY_TYPES = ['收入', '支出'];
const TOURNAMENT_KINDS = ['盃賽', '聯賽', '友誼賽', '其他'];
const GAME_SIDES = ['', '先攻', '後攻'];

function intStr_(v, label, min, max) {
  const s = str_(v, label, { max: 12 }).replace(/,/g, '');
  if (s === '') return '';
  if (!/^-?\d+$/.test(s) || Number(s) < min || Number(s) > max) throw apiError_('INVALID', '「' + label + '」請填 ' + min + '～' + max + ' 的整數。');
  return String(Number(s));
}

function numStr_(v, label, max) {
  const s = str_(v, label, { max: 8 });
  if (s === '') return '';
  if (!/^\d+(\.\d)?$/.test(s) || Number(s) > max) throw apiError_('INVALID', '「' + label + '」請填 0～' + max + ' 的數字（最多一位小數）。');
  return s;
}

function requirePlayerIds_(raw) {
  const ids = (Array.isArray(raw) ? raw.map(String) : []).filter((v, i, arr) => v && arr.indexOf(v) === i);
  if (ids.length > 200) throw apiError_('INVALID', '最多 200 位球員。');
  const players = readAll_('Players');
  if (ids.some((id) => !players.some((x) => x.id === id))) throw apiError_('INVALID', '找不到指定的球員。');
  return ids;
}

function rangeArgs_(p, defFrom, defTo, maxDays) {
  const from = p.from ? dateStr_(p.from, '開始日期') : defFrom;
  const to = p.to ? dateStr_(p.to, '結束日期') : defTo;
  if (to < from) throw apiError_('INVALID', '結束日期不能早於開始日期。');
  if (addDaysStr_(from, maxDays) < to) throw apiError_('INVALID', '一次最多查詢 ' + maxDays + ' 天。');
  return { from: from, to: to };
}

/* ── 一週練球通知 ── */

function parsePractice_(r) {
  return { id: r.id, date: r.date, type: r.type, startTime: r.startTime, endTime: r.endTime, location: r.location, content: r.content, note: r.note, updatedBy: r.updatedBy, updatedAt: r.updatedAt };
}

/** 練球安排：預設是今天前後各 21 天 */
function listPractice_(ctx) {
  const today = today_();
  const r = rangeArgs_(ctx.payload, addDaysStr_(today, -21), addDaysStr_(today, 21), 120);
  const days = readAll_('PracticeDays').filter((d) => d.date >= r.from && d.date <= r.to).map(parsePractice_);
  days.sort((x, y) => (x.date < y.date ? -1 : 1));
  return { days: days, today: today };
}

/** 一次儲存好幾天（通常是一整週）；類別空白＝刪除那天的安排 */
function savePracticeWeek_(ctx) {
  const a = ctx.actor;
  const list = Array.isArray(ctx.payload.days) ? ctx.payload.days : [];
  if (list.length === 0 || list.length > 14) throw apiError_('INVALID', '一次可以儲存 1～14 天。');
  const existing = readAll_('PracticeDays');
  const now = nowIso_();
  const seen = {};
  const toDelete = [];
  let saved = 0;
  list.forEach((d) => {
    if (!d || typeof d !== 'object') throw apiError_('INVALID', '練球資料格式不正確。');
    const date = dateStr_(d.date, '日期');
    if (seen[date]) throw apiError_('INVALID', date + ' 重複出現。');
    seen[date] = true;
    const old = existing.find((x) => x.date === date);
    if (!d.type) {
      if (old) toDelete.push(old._row);
      return;
    }
    if (PRACTICE_TYPES.indexOf(d.type) < 0) throw apiError_('INVALID', '請選擇「練球／休息／比賽／其他」。');
    const startTime = timeStr_(d.startTime, '開始時間');
    const endTime = timeStr_(d.endTime, '結束時間');
    if (startTime && endTime && endTime < startTime) throw apiError_('INVALID', date + ' 的結束時間不能早於開始時間。');
    const fields = {
      date: date, type: d.type, startTime: startTime, endTime: endTime, location: str_(d.location, '地點', { max: 40 }),
      content: str_(d.content, '練習內容', { max: 300 }), note: str_(d.note, '備註', { max: 200 }), updatedBy: a.displayName, updatedAt: now,
    };
    if (old) updateRow_('PracticeDays', old._row, Object.assign({}, old, fields));
    else appendRow_('PracticeDays', Object.assign({ id: newId_('PD'), createdById: a.id, createdAt: now }, fields));
    saved++;
  });
  toDelete.sort((x, y) => y - x).forEach((row) => deleteRow_('PracticeDays', row));
  return { saved: saved, cleared: toDelete.length };
}

/* ── 出缺席 ── */

function parseAttendance_(r) {
  return { id: r.id, date: r.date, playerId: r.playerId, status: r.status, reason: r.reason, updatedBy: r.updatedBy, updatedAt: r.updatedAt };
}

/** 出缺席紀錄：預設是最近 30 天，最多一次查一年 */
function listAttendance_(ctx) {
  const today = today_();
  const r = rangeArgs_(ctx.payload, addDaysStr_(today, -29), today, 400);
  return { records: readAll_('Attendance').filter((x) => x.date >= r.from && x.date <= r.to).map(parseAttendance_), today: today };
}

/** 點名：一天一次送出全隊；狀態空白＝取消那位球員那天的紀錄 */
function saveAttendance_(ctx) {
  const a = ctx.actor;
  const date = dateStr_(ctx.payload.date, '日期');
  const list = Array.isArray(ctx.payload.records) ? ctx.payload.records : [];
  if (list.length === 0 || list.length > 200) throw apiError_('INVALID', '請至少點名一位球員。');
  const players = readAll_('Players');
  const existing = readAll_('Attendance').filter((x) => x.date === date);
  const now = nowIso_();
  const seen = {};
  const toAdd = [];
  const toDelete = [];
  list.forEach((r) => {
    if (!r || typeof r !== 'object') throw apiError_('INVALID', '點名資料格式不正確。');
    const playerId = str_(r.playerId, '球員', { required: true, max: 20 });
    if (seen[playerId]) throw apiError_('INVALID', '同一位球員重複出現。');
    seen[playerId] = true;
    if (!players.some((x) => x.id === playerId)) throw apiError_('NOT_FOUND', '找不到指定的球員。');
    const old = existing.find((x) => x.playerId === playerId);
    if (!r.status) {
      if (old) toDelete.push(old._row);
      return;
    }
    if (ATTENDANCE_STATUSES.indexOf(r.status) < 0) throw apiError_('INVALID', '出缺席狀態不正確。');
    const fields = { status: r.status, reason: str_(r.reason, '原因', { max: 100 }), updatedBy: a.displayName, updatedAt: now };
    if (old) {
      if (old.status !== fields.status || old.reason !== fields.reason) updateRow_('Attendance', old._row, Object.assign({}, old, fields));
    } else toAdd.push(Object.assign({ id: newId_('AT'), date: date, playerId: playerId, createdAt: now }, fields));
  });
  appendRows_('Attendance', toAdd);
  toDelete.sort((x, y) => y - x).forEach((row) => deleteRow_('Attendance', row));
  return { date: date, records: readAll_('Attendance').filter((x) => x.date === date).map(parseAttendance_) };
}

/* ── 球員個人資料與通訊錄（只有教練看得到） ── */

const GUARDIAN_RELATIONS = ['母', '父', '隔代', '其他'];

const PROFILE_TEXT_FIELDS = [
  ['className', '班級', 20], ['batsThrows', '投打', 10], ['phone', '球員電話', 20], ['address', '地址', 100],
  ['guardianName', '監護人姓名', 30], ['guardianRelation', '監護人關係', 10], ['guardianPhone', '監護人電話', 20],
  ['guardian2Name', '第二聯絡人姓名', 30], ['guardian2Relation', '第二聯絡人關係', 10], ['guardian2Phone', '第二聯絡人電話', 20],
  ['medicalNote', '健康／過敏注意事項', 300], ['note', '備註', 300],
];

function parseProfile_(r) {
  const o = { playerId: r.playerId, birthday: r.birthday, height: r.height, weight: r.weight, updatedBy: r.updatedBy, updatedAt: r.updatedAt };
  PROFILE_TEXT_FIELDS.forEach((f) => (o[f[0]] = r[f[0]]));
  return o;
}

function listProfiles_() {
  return { profiles: readAll_('PlayerProfiles').map(parseProfile_), players: readAll_('Players').map(parsePlayer_) };
}

/** 生日要用西元年（避免輸入民國年變成 0101 年） */
function birthdayStr_(v) {
  const s = dateStr_(v, '生日');
  const y = Number(s.slice(0, 4));
  if (y < 1990 || s > today_()) throw apiError_('INVALID', '「生日」請用西元年，例如民國 101 年請填 2012 年。');
  return s;
}

function saveProfile_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const playerId = str_(p.playerId, '球員', { required: true, max: 20 });
  if (!readAll_('Players').some((x) => x.id === playerId)) throw apiError_('NOT_FOUND', '找不到這位球員。');
  const fields = {
    playerId: playerId,
    birthday: p.birthday ? birthdayStr_(p.birthday) : '',
    height: numStr_(p.height, '身高（公分）', 250),
    weight: numStr_(p.weight, '體重（公斤）', 200),
    updatedBy: a.displayName,
    updatedAt: nowIso_(),
  };
  PROFILE_TEXT_FIELDS.forEach((f) => (fields[f[0]] = str_(p[f[0]], f[1], { max: f[2] })));
  ['guardianRelation', 'guardian2Relation'].forEach((k) => {
    if (fields[k] && GUARDIAN_RELATIONS.indexOf(fields[k]) < 0) throw apiError_('INVALID', '關係請選擇「母／父／隔代／其他」。');
  });
  const old = readAll_('PlayerProfiles').find((x) => x.playerId === playerId);
  if (old) updateRow_('PlayerProfiles', old._row, fields);
  else appendRow_('PlayerProfiles', fields);
  audit_(a, '修改球員個人資料', playerId, '');
  return { profile: parseProfile_(stringify_(fields)) };
}

/* ── 預算管理 ── */

function parseBudgetItem_(r) {
  return { id: r.id, year: r.year, type: r.type, name: r.name, amount: Number(r.amount) || 0, note: r.note };
}

function parseTransaction_(r) {
  return { id: r.id, year: r.year, date: r.date, type: r.type, itemId: r.itemId, title: r.title, amount: Number(r.amount) || 0, handler: r.handler, note: r.note, createdBy: r.createdBy, updatedAt: r.updatedAt };
}

function yearStr_(v) {
  return str_(v, '年度', { required: true, max: 20 });
}

/** 一個年度的預算項目與收支；years 是所有出現過的年度（讓畫面可以切換） */
function listBudget_(ctx) {
  const items = readAll_('BudgetItems');
  const tx = readAll_('Transactions');
  const years = {};
  items.concat(tx).forEach((r) => (years[r.year] = true));
  const year = ctx.payload.year ? yearStr_(ctx.payload.year) : '';
  return {
    years: Object.keys(years).sort().reverse(),
    items: items.filter((r) => r.year === year).map(parseBudgetItem_),
    transactions: tx.filter((r) => r.year === year).map(parseTransaction_).sort((x, y) => (x.date === y.date ? (x.updatedAt < y.updatedAt ? 1 : -1) : x.date < y.date ? 1 : -1)),
  };
}

function saveBudgetItem_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  if (MONEY_TYPES.indexOf(p.type) < 0) throw apiError_('INVALID', '請選擇「收入」或「支出」。');
  const fields = {
    year: yearStr_(p.year), type: p.type, name: str_(p.name, '項目名稱', { required: true, max: 30 }),
    amount: intStr_(p.amount, '預算金額', 0, 100000000) || '0', note: str_(p.note, '備註', { max: 200 }), updatedAt: nowIso_(),
  };
  const all = readAll_('BudgetItems');
  if (all.some((x) => x.id !== p.id && x.year === fields.year && x.type === fields.type && x.name === fields.name)) throw apiError_('INVALID', '這個年度已經有同名的' + fields.type + '項目。');
  let row;
  if (p.id) {
    const old = all.find((x) => x.id === p.id);
    if (!old) throw apiError_('NOT_FOUND', '找不到這個預算項目。');
    if ((old.year !== fields.year || old.type !== fields.type) && readAll_('Transactions').some((t) => t.itemId === old.id)) throw apiError_('INVALID', '這個項目已經有收支紀錄，不能改年度或收支類別。');
    row = Object.assign({}, old, fields);
    updateRow_('BudgetItems', old._row, row);
  } else {
    row = Object.assign({ id: newId_('BI'), createdById: a.id, createdAt: fields.updatedAt }, fields);
    appendRow_('BudgetItems', row);
  }
  audit_(a, p.id ? '修改預算項目' : '新增預算項目', row.id, fields.year + ' ' + fields.type + ' ' + fields.name + ' ' + fields.amount + ' 元');
  return { item: parseBudgetItem_(stringify_(row)) };
}

function deleteBudgetItem_(ctx) {
  const a = ctx.actor;
  const r = readAll_('BudgetItems').find((x) => x.id === str_(ctx.payload.id, '預算項目', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這個預算項目。');
  const used = readAll_('Transactions').filter((t) => t.itemId === r.id).length;
  if (used) throw apiError_('INVALID', '這個項目還有 ' + used + ' 筆收支紀錄，請先把那些紀錄改到其他項目或刪除。');
  deleteRow_('BudgetItems', r._row);
  audit_(a, '刪除預算項目', r.id, r.year + ' ' + r.type + ' ' + r.name);
  return { deleted: r.id };
}

function saveTransaction_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  if (MONEY_TYPES.indexOf(p.type) < 0) throw apiError_('INVALID', '請選擇「收入」或「支出」。');
  const year = yearStr_(p.year);
  const itemId = str_(p.itemId, '預算項目', { max: 40 });
  if (itemId) {
    const item = readAll_('BudgetItems').find((x) => x.id === itemId);
    if (!item || item.year !== year || item.type !== p.type) throw apiError_('INVALID', '預算項目和年度或收支類別不相符。');
  }
  const amount = intStr_(p.amount, '金額', 1, 100000000);
  if (!amount) throw apiError_('INVALID', '請填寫「金額」。');
  const fields = {
    year: year, date: dateStr_(p.date, '日期'), type: p.type, itemId: itemId, title: str_(p.title, '摘要', { required: true, max: 60 }), amount: amount,
    handler: str_(p.handler, '經手人', { max: 20 }), note: str_(p.note, '備註', { max: 200 }), updatedAt: nowIso_(),
  };
  let row;
  if (p.id) {
    const old = readAll_('Transactions').find((x) => x.id === p.id);
    if (!old) throw apiError_('NOT_FOUND', '找不到這筆收支。');
    row = Object.assign({}, old, fields);
    updateRow_('Transactions', old._row, row);
  } else {
    row = Object.assign({ id: newId_('TX'), createdById: a.id, createdBy: a.displayName, createdAt: fields.updatedAt }, fields);
    appendRow_('Transactions', row);
  }
  audit_(a, p.id ? '修改收支' : '新增收支', row.id, fields.date + ' ' + fields.type + ' ' + fields.title + ' ' + fields.amount + ' 元');
  return { transaction: parseTransaction_(stringify_(row)) };
}

function deleteTransaction_(ctx) {
  const a = ctx.actor;
  const r = readAll_('Transactions').find((x) => x.id === str_(ctx.payload.id, '收支', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這筆收支。');
  deleteRow_('Transactions', r._row);
  audit_(a, '刪除收支', r.id, r.date + ' ' + r.type + ' ' + r.title + ' ' + r.amount + ' 元');
  return { deleted: r.id };
}

/* ── 賽事管理 ── */

function parseTournament_(r) {
  return {
    id: r.id, name: r.name, kind: r.kind, startDate: r.startDate, endDate: r.endDate, location: r.location, organizer: r.organizer,
    signupDeadline: r.signupDeadline, fee: Number(r.fee) || 0, result: r.result, playerIds: r.playerIds ? r.playerIds.split(',') : [], note: r.note, updatedAt: r.updatedAt,
  };
}

function parseGame_(r) {
  return {
    id: r.id, tournamentId: r.tournamentId, date: r.date, time: r.time, opponent: r.opponent, location: r.location, side: r.side,
    ourScore: r.ourScore === '' ? null : Number(r.ourScore), oppScore: r.oppScore === '' ? null : Number(r.oppScore), note: r.note,
  };
}

/** 全部賽事與每一場比賽；names 是參賽球員的姓名（球員、家長也看得到參賽名單） */
function listTournaments_() {
  const tournaments = readAll_('Tournaments').map(parseTournament_);
  tournaments.sort((x, y) => (x.startDate < y.startDate ? 1 : -1));
  const used = {};
  tournaments.forEach((t) => t.playerIds.forEach((id) => (used[id] = true)));
  const names = {};
  readAll_('Players').forEach((p) => {
    if (used[p.id]) names[p.id] = (p.number ? '#' + p.number + ' ' : '') + p.name;
  });
  const games = readAll_('Games').map(parseGame_);
  games.sort((x, y) => (x.date + x.time < y.date + y.time ? -1 : 1));
  return { tournaments: tournaments, games: games, names: names, today: today_() };
}

function saveTournament_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  if (TOURNAMENT_KINDS.indexOf(p.kind) < 0) throw apiError_('INVALID', '請選擇賽事類別。');
  const startDate = dateStr_(p.startDate, '開始日期');
  const endDate = p.endDate ? dateStr_(p.endDate, '結束日期') : startDate;
  if (endDate < startDate) throw apiError_('INVALID', '結束日期不能早於開始日期。');
  const fields = {
    name: str_(p.name, '賽事名稱', { required: true, max: 60 }), kind: p.kind, startDate: startDate, endDate: endDate,
    location: str_(p.location, '地點', { max: 60 }), organizer: str_(p.organizer, '主辦單位', { max: 60 }),
    signupDeadline: p.signupDeadline ? dateStr_(p.signupDeadline, '報名截止日') : '', fee: intStr_(p.fee, '報名費', 0, 10000000),
    result: str_(p.result, '成績', { max: 40 }), playerIds: requirePlayerIds_(p.playerIds).join(','), note: str_(p.note, '備註', { max: 500 }), updatedAt: nowIso_(),
  };
  let row;
  if (p.id) {
    const old = readAll_('Tournaments').find((x) => x.id === p.id);
    if (!old) throw apiError_('NOT_FOUND', '找不到這個賽事。');
    row = Object.assign({}, old, fields);
    updateRow_('Tournaments', old._row, row);
  } else {
    row = Object.assign({ id: newId_('TN'), createdById: a.id, createdAt: fields.updatedAt }, fields);
    appendRow_('Tournaments', row);
  }
  return { tournament: parseTournament_(stringify_(row)) };
}

/** 刪除賽事會連同它的每一場比賽一起刪除 */
function deleteTournament_(ctx) {
  const a = ctx.actor;
  const r = readAll_('Tournaments').find((x) => x.id === str_(ctx.payload.id, '賽事', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這個賽事。');
  const rows = readAll_('Games').filter((g) => g.tournamentId === r.id).map((g) => g._row).sort((x, y) => y - x);
  rows.forEach((row) => deleteRow_('Games', row));
  deleteRow_('Tournaments', r._row);
  audit_(a, '刪除賽事', r.id, r.name + '（比賽 ' + rows.length + ' 場）');
  return { deleted: r.id, games: rows.length };
}

function saveGame_(ctx) {
  const p = ctx.payload;
  const tournamentId = str_(p.tournamentId, '賽事', { required: true, max: 40 });
  if (!readAll_('Tournaments').some((x) => x.id === tournamentId)) throw apiError_('NOT_FOUND', '找不到這個賽事。');
  if (GAME_SIDES.indexOf(p.side || '') < 0) throw apiError_('INVALID', '請選擇先攻或後攻。');
  const ourScore = intStr_(p.ourScore, '我方得分', 0, 99);
  const oppScore = intStr_(p.oppScore, '對手得分', 0, 99);
  if ((ourScore === '') !== (oppScore === '')) throw apiError_('INVALID', '比分請兩邊都填，或兩邊都空白。');
  const fields = {
    tournamentId: tournamentId, date: dateStr_(p.date, '比賽日期'), time: timeStr_(p.time, '比賽時間'), opponent: str_(p.opponent, '對手', { required: true, max: 40 }),
    location: str_(p.location, '場地', { max: 60 }), side: p.side || '', ourScore: ourScore, oppScore: oppScore, note: str_(p.note, '備註', { max: 300 }), updatedAt: nowIso_(),
  };
  let row;
  if (p.id) {
    const old = readAll_('Games').find((x) => x.id === p.id);
    if (!old) throw apiError_('NOT_FOUND', '找不到這場比賽。');
    row = Object.assign({}, old, fields);
    updateRow_('Games', old._row, row);
  } else {
    row = Object.assign({ id: newId_('GM'), createdById: ctx.actor.id, createdAt: fields.updatedAt }, fields);
    appendRow_('Games', row);
  }
  return { game: parseGame_(stringify_(row)) };
}

function deleteGame_(ctx) {
  const r = readAll_('Games').find((x) => x.id === str_(ctx.payload.id, '比賽', { required: true, max: 40 }));
  if (!r) throw apiError_('NOT_FOUND', '找不到這場比賽。');
  deleteRow_('Games', r._row);
  return { deleted: r.id };
}

// ───────────────────────── 試算表存取 ─────────────────────────

/** 一次寫入多列（大量匯入時比逐列 appendRow 快很多） */
function appendRows_(name, objs) {
  if (!objs.length) return;
  delete READ_CACHE_[name];
  const sh = sheet_(name);
  const headers = SCHEMA[name];
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, headers.length).setValues(objs.map((o) => headers.map((h) => cell_(o[h]))));
}

/**
 * 球隊管理（練球、出缺席、通訊錄、預算、賽事）的資料放在「另一份」試算表，避免原本的資料庫越來越大。
 * 帳號與球員名單仍然在原本的試算表。
 */
const TEAM_SHEETS = ['PracticeDays', 'Attendance', 'PlayerProfiles', 'BudgetItems', 'Transactions', 'Tournaments', 'Games'];
const TEAM_DB_NAME = '東勢國中棒球隊｜球隊管理 資料庫';
const TEAM_DB_PROP = 'teamSpreadsheetId';
let TEAM_SS_ = null;

/** 球隊管理試算表；還沒有的話自動建立一份新的，並記住它的 ID */
function teamSpreadsheet_() {
  if (TEAM_SS_) return TEAM_SS_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(TEAM_DB_PROP);
  if (id) {
    try {
      TEAM_SS_ = SpreadsheetApp.openById(id);
      return TEAM_SS_;
    } catch (e) {
      throw apiError_('SETUP', '打不開球隊管理試算表（可能被刪除或移到垃圾桶），請在 Apps Script 執行 setupTeamDb()。');
    }
  }
  const ss = SpreadsheetApp.create(TEAM_DB_NAME);
  ss.setSpreadsheetTimeZone(TZ);
  props.setProperty(TEAM_DB_PROP, ss.getId());
  console.log('✅ 已建立新的球隊管理試算表：' + ss.getUrl());
  TEAM_SS_ = ss;
  return ss;
}

function spreadsheetFor_(name) {
  return TEAM_SHEETS.indexOf(name) >= 0 ? teamSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const ss = spreadsheetFor_(name);
  const sh = ss.getSheetByName(name);
  if (sh) return sh;
  // 新版本新增的工作表，第一次用到時自動建立
  if (SCHEMA[name]) return createSheet_(ss, name);
  throw apiError_('SETUP', '找不到工作表「' + name + '」，請先在 Apps Script 執行 setup()。');
}

/** 建立工作表並寫入欄位名稱，整張表設為純文字格式 */
function createSheet_(ss, name) {
  const headers = SCHEMA[name];
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#fff3c4');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  return sh;
}

/**
 * 同一次請求內的讀取快取：同一張表在一次請求中只向試算表讀一次（大幅減少讀取次數）。
 * 任何寫入都會清掉該表的快取；取得寫入鎖時清空全部，確保鎖內讀到的是最新資料。
 * 回傳的是複本，呼叫端修改物件不會影響快取。
 */
let READ_CACHE_ = {};

/** 讀取整張表（全部以文字讀出），每列附上 _row 行號 */
function readAll_(name) {
  if (!READ_CACHE_[name]) {
    const sh = sheet_(name);
    const lastRow = sh.getLastRow();
    const headers = SCHEMA[name];
    const out = [];
    if (lastRow >= 2) {
      sh.getRange(2, 1, lastRow - 1, headers.length)
        .getDisplayValues()
        .forEach((r, i) => {
          if (r[0] === '') return;
          const o = { _row: i + 2 };
          headers.forEach((h, j) => (o[h] = r[j]));
          out.push(o);
        });
    }
    READ_CACHE_[name] = out;
  }
  return READ_CACHE_[name].map((o) => Object.assign({}, o));
}

function appendRow_(name, obj) {
  delete READ_CACHE_[name];
  sheet_(name).appendRow(SCHEMA[name].map((h) => cell_(obj[h])));
}

function updateRow_(name, row, obj) {
  delete READ_CACHE_[name];
  const headers = SCHEMA[name];
  sheet_(name).getRange(row, 1, 1, headers.length).setValues([headers.map((h) => cell_(obj[h]))]);
}

function deleteRow_(name, row) {
  delete READ_CACHE_[name];
  sheet_(name).deleteRow(row);
}

/** 一律以文字寫入：前置單引號可避免日期被轉換，也避免「=」開頭的輸入被當成公式執行 */
function cell_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'boolean') v = v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') v = JSON.stringify(v);
  return "'" + String(v);
}

/** 把剛寫入的資料轉成「和從試算表讀出來一樣」的文字格式 */
function stringify_(obj) {
  const o = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    o[k] = v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
  });
  return o;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('BUSY', '目前使用人數較多，請稍後再試。');
  READ_CACHE_ = {}; // 拿到鎖之後重新讀取，避免用到等待期間別人已經修改過的舊資料
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function audit_(actor, action, target, detail) {
  appendRow_('AuditLogs', { id: newId_('AL'), at: nowIso_(), actorId: actor.id, actorName: actor.displayName, action: action, target: target, detail: detail });
}

// ───────────────────────── 工具 ─────────────────────────

function apiError_(code, message) {
  const e = new Error(message);
  e.apiCode = code;
  return e;
}

function str_(v, label, opts) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw apiError_('INVALID', '「' + label + '」格式不正確。');
  const s = String(v).trim();
  if (opts.required && !s) throw apiError_('INVALID', '請填寫「' + label + '」。');
  if (s.length > opts.max) throw apiError_('INVALID', '「' + label + '」最多 ' + opts.max + ' 字。');
  return s;
}

function dateStr_(v, label) {
  const s = str_(v, label, { required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw apiError_('INVALID', '「' + label + '」格式不正確。');
  const parts = s.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (d.getUTCFullYear() !== parts[0] || d.getUTCMonth() !== parts[1] - 1 || d.getUTCDate() !== parts[2]) throw apiError_('INVALID', '「' + label + '」不是正確的日期。');
  return s;
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowIso_() {
  return new Date().toISOString();
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function parseJson_(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}

function hashCode_(salt, code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + code, Utilities.Charset.UTF_8);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** 8 碼登入碼（排除容易混淆的 0/O、1/I/L） */
function randomCode_() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const hex = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[parseInt(hex.substr(i * 4, 4), 16) % alphabet.length];
  return code;
}

function json_(obj) {
  return text_(JSON.stringify(obj));
}

function text_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────── 在編輯器中手動執行的函式 ─────────────────────────

/** 建立所有工作表與欄位，並建立第一個教練帳號。可以重複執行，不會覆蓋既有資料。 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  if (ss.getName() === '未命名的試算表' || ss.getName() === 'Untitled spreadsheet') ss.rename('東勢國中棒球隊｜冒險訓練筆記本 資料庫');
  Object.keys(SCHEMA).forEach((name) => {
    if (TEAM_SHEETS.indexOf(name) < 0 && !ss.getSheetByName(name)) ss.insertSheet(name);
  });
  setupTeamDb();
  migrateSchema_();
  // 刪除預設的空白工作表
  ['工作表1', 'Sheet1'].forEach((n) => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  const hasCoach = readAll_('Users').some((u) => u.role === 'coach' && u.active === 'TRUE');
  if (!hasCoach) {
    const acc = createUser_({ loginId: 'coach', displayName: '教練', role: 'coach', playerId: '', childPlayerIds: '' });
    console.log('✅ 已建立教練帳號。帳號：' + acc.loginId + '　登入碼：' + acc.code);
    console.log('⚠️ 請把登入碼抄在安全的地方，之後無法再查看（忘記時可執行 resetCoachCode）。');
  } else {
    console.log('✅ 工作表檢查完成，已經有教練帳號，不重複建立。');
  }
}

/**
 * 檢查每張工作表的欄位名稱：空白表寫入欄位；新版本在最後面新增的欄位會自動補上（原有資料不動）。
 * 欄位順序和程式不同時停止，避免資料對錯欄。
 */
function migrateSchema_() {
  Object.keys(SCHEMA).forEach((name) => {
    const sh = spreadsheetFor_(name).getSheetByName(name);
    if (!sh) return; // 還沒有的表，第一次使用時會自動建立
    const headers = SCHEMA[name];
    const current = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    let used = current.length;
    while (used > 0 && current[used - 1] === '') used--;
    if (current.slice(0, used).join('|') !== headers.slice(0, used).join('|')) {
      throw new Error('工作表「' + name + '」的欄位和程式設定不同，請檢查第 1 列：' + current.join(', '));
    }
    if (used < headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#fff3c4');
      if (used === 0) sh.setFrozenRows(1);
      else console.log('✅ 工作表「' + name + '」新增欄位：' + headers.slice(used).join('、'));
    }
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
}

/** 建立（或檢查）球隊管理的獨立試算表與它的 7 張工作表，網址會顯示在執行記錄。可以重複執行。 */
function setupTeamDb() {
  const ss = teamSpreadsheet_();
  TEAM_SHEETS.forEach((name) => {
    if (!ss.getSheetByName(name)) createSheet_(ss, name);
  });
  ['工作表1', 'Sheet1'].forEach((n) => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  console.log('✅ 球隊管理試算表：' + ss.getUrl());
}

/** 教練忘記登入碼時，在編輯器執行，新的登入碼會顯示在執行記錄 */
function resetCoachCode() {
  const u = readAll_('Users').find((x) => x.loginId === 'coach');
  if (!u) throw new Error('找不到帳號 coach，請先執行 setup()。');
  const code = randomCode_();
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, Object.assign({}, u, { codeSalt: salt, codeHash: hashCode_(salt, code), active: 'TRUE', updatedAt: nowIso_() }));
  console.log('✅ 教練新登入碼：' + code + '（舊登入碼已失效）');
}

const BACKUP_FOLDER_NAME = '東勢國中棒球隊 資料庫備份';

/** 在雲端硬碟的「東勢國中棒球隊 資料庫備份」資料夾建立一份帶日期的備份 */
function backupNow() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  const list = [SpreadsheetApp.getActiveSpreadsheet()];
  if (PropertiesService.getScriptProperties().getProperty(TEAM_DB_PROP)) list.push(teamSpreadsheet_());
  list.forEach((ss) => {
    const name = ss.getName() + ' 備份 ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
    const copy = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
    console.log('✅ 已建立備份：' + copy.getName() + '（資料夾：' + BACKUP_FOLDER_NAME + '）');
  });
}

/** 設定每週一凌晨 3 點自動備份（重複執行不會建立第二個排程） */
function installWeeklyBackup() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'backupNow');
  if (exists) {
    console.log('✅ 每週自動備份已經設定過了，不需要重複設定。');
    return;
  }
  ScriptApp.newTrigger('backupNow').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).inTimezone(TZ).create();
  console.log('✅ 已設定每週一凌晨 3 點自動備份到雲端硬碟資料夾「' + BACKUP_FOLDER_NAME + '」。');
  backupNow();
}

// ───────────────────────── 自動測試 ─────────────────────────

/**
 * 自動測試：建立暫時的測試帳號，逐項測試登入、權限、跨球員資料保護、輸入驗證與防重複提交，
 * 測試完成後會刪除所有測試資料。在編輯器選擇 runSelfTests 並按「執行」。
 */
function runSelfTests() {
  const results = [];
  const call = (action, payload, token, requestId) => JSON.parse(handle_({ action: action, payload: payload, token: token, requestId: requestId }));
  const expectOk = (name, res) => results.push([res.ok, name, res.ok ? '' : res.error]);
  const expectFail = (name, res, code) => results.push([!res.ok && (!code || res.code === code), name, res.ok ? '應該失敗卻成功了' : res.code + '：' + res.error]);
  const today = today_();
  const created = { players: [], users: [], articles: [], announcements: [] };
  const savedGoalSettings = PropertiesService.getScriptProperties().getProperty('goalSettings');
  migrateSchema_(); // 更新程式後第一次執行時，補上新版本的欄位
  cleanupTestData_(created); // 先清掉上次測試中途被停止所留下的資料，避免干擾這次測試

  try {
    // 準備：暫時的教練、兩位球員、一位家長（直接寫入，不經過 API）
    const mk = (loginId, role, playerId, kids) => {
      const acc = createUser_({ loginId: loginId, displayName: '測試' + loginId, role: role, playerId: playerId || '', childPlayerIds: kids || '' });
      created.users.push(acc.id);
      return acc;
    };
    const now = nowIso_();
    ['TEST-PA', 'TEST-PB'].forEach((id) => {
      appendRow_('Players', { id: id, name: '測試球員' + id, number: '0', grade: '測試', position: '測試', active: 'TRUE', createdAt: now, updatedAt: now });
      created.players.push(id);
    });
    const coachAcc = mk('test-coach-' + Date.now(), 'coach');
    const paAcc = mk('test-pa-' + Date.now(), 'player', 'TEST-PA');
    const pbAcc = mk('test-pb-' + Date.now(), 'player', 'TEST-PB');
    const parentAcc = mk('test-parent-' + Date.now(), 'parent', '', 'TEST-PA');

    // 1. 登入
    expectFail('登入碼錯誤會被拒絕', call('login', { loginId: paAcc.loginId, code: 'WRONG123' }), 'AUTH');
    const tCoach = call('login', { loginId: coachAcc.loginId, code: coachAcc.code }).data.token;
    const tA = call('login', { loginId: paAcc.loginId, code: paAcc.code }).data.token;
    const tB = call('login', { loginId: pbAcc.loginId, code: pbAcc.code }).data.token;
    const tParent = call('login', { loginId: parentAcc.loginId, code: parentAcc.code }).data.token;
    const teacherAcc = mk('test-teacher-' + Date.now(), 'teacher', '', 'TEST-PA');
    const tTeacher = call('login', { loginId: teacherAcc.loginId, code: teacherAcc.code }).data.token;
    const officeAcc = mk('test-office-' + Date.now(), 'office');
    const tOffice = call('login', { loginId: officeAcc.loginId, code: officeAcc.code }).data.token;
    results.push([!!(tCoach && tA && tB && tParent), '正確登入碼可以登入', '']);
    expectFail('沒有 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }), 'AUTH');
    expectFail('偽造 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }, 'x'.repeat(64)), 'AUTH');

    // 1-1. 每個 API 的授權（依 ROUTES 自動產生，新增 API 時也會自動被檢查）
    const tokenOf = { coach: tCoach, player: tA, parent: tParent, teacher: tTeacher, office: tOffice };
    const roleName = { coach: '教練', player: '球員', parent: '家長', teacher: '老師', office: '學務處' };
    Object.keys(ROUTES).forEach((action) => {
      const route = ROUTES[action];
      if (route.public) return;
      if (!Array.isArray(route.roles)) {
        results.push([false, 'API 授權：' + action, '沒有宣告可使用的角色']);
        return;
      }
      const noToken = call(action, {});
      let ok = !noToken.ok && noToken.code === 'AUTH';
      const denied = ALL_ROLES.filter((r) => route.roles.indexOf(r) < 0);
      const problems = [];
      if (!ok) problems.push('未登入沒有被拒絕');
      denied.forEach((r) => {
        const res = call(action, {}, tokenOf[r]);
        if (res.ok || res.code !== 'FORBIDDEN') {
          ok = false;
          problems.push(roleName[r] + '沒有被拒絕');
        }
      });
      results.push([ok, 'API 授權：' + action + '（' + (denied.length ? '拒絕' + denied.map((r) => roleName[r]).join('、') : '所有登入者可用') + '）', problems.join('；')]);
    });

    // 2. 每日筆記
    const note = { playerId: 'TEST-PA', date: today, training: '=HYPERLINK("http://example.com")', learned: '學到', selfChecks: { onTime: true, hacked: true } };
    const r1 = call('saveNote', note, tA, Utilities.getUuid());
    expectOk('球員可以新增自己的筆記', r1);
    const r2 = call('saveNote', Object.assign({}, note, { learned: '更新後' }), tA, Utilities.getUuid());
    const notesA = call('listNotes', { playerId: 'TEST-PA' }, tA).data.notes;
    results.push([notesA.length === 1 && notesA[0].learned === '更新後' && r2.data.created === false, '同一天再次儲存只會更新同一筆', '筆數 ' + notesA.length]);
    results.push([notesA[0].training === note.training, '「=」開頭的內容以文字儲存，不會變成公式', notesA[0].training]);
    results.push([notesA[0].selfChecks.hacked === undefined, '不在清單內的自我檢查項目會被忽略', '']);
    expectFail('球員不能寫別人的筆記', call('saveNote', Object.assign({}, note, { playerId: 'TEST-PB' }), tA), 'FORBIDDEN');
    expectFail('球員不能讀別人的筆記', call('listNotes', { playerId: 'TEST-PB' }, tA), 'FORBIDDEN');
    expectFail('家長不能讀筆記', call('listNotes', { playerId: 'TEST-PA' }, tParent), 'FORBIDDEN');
    expectFail('教練不能代替球員寫筆記', call('saveNote', note, tCoach), 'FORBIDDEN');
    expectFail('必填欄位空白會被拒絕', call('saveNote', Object.assign({}, note, { training: '  ' }), tA), 'INVALID');
    expectFail('未來日期會被拒絕', call('saveNote', Object.assign({}, note, { date: '2999-01-01' }), tA), 'INVALID');
    expectFail('不存在的日期會被拒絕', call('saveNote', Object.assign({}, note, { date: '2026-02-30' }), tA), 'INVALID');
    expectOk('教練可以讀任何球員的筆記', call('listNotes', { playerId: 'TEST-PA' }, tCoach));
    expectOk('教練可以寫評語', call('commentNote', { noteId: notesA[0].id, comment: '很好' }, tCoach, Utilities.getUuid()));
    expectFail('球員不能寫評語', call('commentNote', { noteId: notesA[0].id, comment: '自己給自己好評' }, tA), 'FORBIDDEN');

    // 3. 防重複提交
    const rid = Utilities.getUuid();
    const d1 = call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20, note: '' }, tCoach, rid);
    const d2 = call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20, note: '' }, tCoach, rid);
    const fit = call('listFitness', { playerId: 'TEST-PA' }, tCoach).data.records;
    results.push([d1.ok && d2.ok && fit.length === 1, '相同 requestId 重複送出只會新增一筆', '筆數 ' + fit.length]);

    // 4. 體能檢測
    expectFail('球員不能新增體能檢測', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 99, note: '' }, tA), 'FORBIDDEN');
    expectFail('家長不能新增體能檢測', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 99, note: '' }, tParent), 'FORBIDDEN');
    expectFail('超出合理範圍的數值會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'run150', value: 99, note: '' }, tCoach), 'INVALID');
    expectFail('已停用的檢測項目（60 公尺）會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'run60', value: 8.5, note: '' }, tCoach), 'INVALID');
    expectFail('未知的檢測項目會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'flying', value: 1, note: '' }, tCoach), 'INVALID');
    expectFail('次數不能是小數', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20.5, note: '' }, tCoach), 'INVALID');
    expectOk('球員可以讀自己的體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tA));
    expectFail('球員不能讀別人的體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectFail('家長不能讀體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tParent), 'FORBIDDEN');
    expectOk('教練可以修改體能檢測', call('updateFitness', { id: fit[0].id, playerId: 'TEST-PA', date: today, item: 'pushup', value: 22, note: '修正' }, tCoach, Utilities.getUuid()));
    expectFail('球員不能刪除體能檢測', call('deleteFitness', { id: fit[0].id }, tA), 'FORBIDDEN');
    expectOk('教練可以刪除體能檢測', call('deleteFitness', { id: fit[0].id }, tCoach, Utilities.getUuid()));

    // 5. 名單與管理權限
    const plA = call('listPlayers', {}, tA).data.players;
    results.push([plA.length === 1 && plA[0].id === 'TEST-PA', '球員只看得到自己的球員資料', '筆數 ' + plA.length]);
    const plP = call('listPlayers', {}, tParent).data.players;
    results.push([plP.length === 1 && plP[0].id === 'TEST-PA', '家長只看得到自己的子女', '筆數 ' + plP.length]);
    expectFail('球員不能使用帳號管理', call('adminListUsers', {}, tA), 'FORBIDDEN');
    expectFail('球員不能查看操作紀錄', call('listAudit', {}, tA), 'FORBIDDEN');
    results.push([JSON.stringify(call('adminListUsers', {}, tCoach)).indexOf('codeHash') < 0, '帳號清單不會回傳登入碼雜湊值', '']);

    // 7. 目標：球員只能申請，教練核准後才計入
    const goalInput = { playerId: 'TEST-PA', term: 'short', content: '測試目標', criteria: '測試條件', startDate: today, dueDate: today, checkpoints: ['檢核一'] };
    const gRes = call('createGoal', goalInput, tA, Utilities.getUuid());
    expectOk('球員可以建立自己的目標', gRes);
    expectFail('球員不能幫別人建立目標', call('createGoal', Object.assign({}, goalInput, { playerId: 'TEST-PB' }), tA), 'FORBIDDEN');
    expectFail('期限早於開始日會被拒絕', call('createGoal', Object.assign({}, goalInput, { dueDate: '2000-01-01' }), tA), 'INVALID');
    const goalId = gRes.ok ? gRes.data.goal.id : '';
    expectFail('球員不能讀別人的目標', call('listGoals', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectFail('球員不能讀全隊目標', call('listGoals', {}, tA), 'FORBIDDEN');
    expectFail('別的球員不能替你申請檢核', call('submitCheckpoint', { goalId: goalId, checkpointId: 'C1' }, tB), 'FORBIDDEN');
    expectOk('球員可以申請完成檢核點', call('submitCheckpoint', { goalId: goalId, checkpointId: 'C1' }, tA, Utilities.getUuid()));
    const beforeReview = call('listGoals', { playerId: 'TEST-PA' }, tA).data.goals.find((g) => g.id === goalId);
    results.push([beforeReview && beforeReview.status === 'active' && beforeReview.checkpoints[0].state === 'submitted', '申請後尚未核准，目標不會變成完成', '']);
    const reviewed = call('reviewCheckpoint', { goalId: goalId, checkpointId: 'C1', approve: true }, tCoach, Utilities.getUuid());
    results.push([reviewed.ok && reviewed.data.goal.status === 'completed', '教練核准全部檢核點後，目標變成已達成', reviewed.ok ? '' : reviewed.error]);
    expectOk('教練可以讀全隊目標', call('listGoals', {}, tCoach));
    expectFail('預設天數超出範圍會被拒絕', call('updateGoalSettings', { settings: [{ term: 'short', label: '短期', periodHint: '一週', defaultDays: 999 }] }, tCoach, Utilities.getUuid()), 'INVALID');
    const setRes = call('updateGoalSettings', { settings: [{ term: 'short', label: '短期測試', periodHint: '測試', defaultDays: 5 }] }, tCoach, Utilities.getUuid());
    results.push([setRes.ok && call('getGoalSettings', {}, tA).data.settings[0].defaultDays === 5, '教練調整的期限設定，球員端會讀到新的設定', '']);

    // 8. 規章：只有教練能修改；待確認備註只給教練看
    appendRow_('Rules', { id: 'TEST-R', no: 999, title: '測試規章', content: '測試內容', category: '其他', version: 1, updatedAt: now, updatedBy: '測試', needsCoachReview: 'TRUE', reviewNote: '內部備註', isAnnouncement: 'FALSE' });
    const rulesForPlayer = call('listRules', {}, tA).data.rules.find((r) => r.id === 'TEST-R');
    results.push([rulesForPlayer && rulesForPlayer.reviewNote === '' && rulesForPlayer.needsCoachReview === false, '球員看不到「待教練確認」的內部備註', '']);
    const rulesForParent = call('listRules', {}, tParent);
    results.push([rulesForParent.ok && rulesForParent.data.rules.some((r) => r.id === 'TEST-R'), '家長可以閱讀規章', '']);
    const ruleEdit = { id: 'TEST-R', title: '測試規章', content: '修改後內容', category: '其他', isAnnouncement: true, needsCoachReview: false, reviewNote: '' };
    const ru = call('updateRule', ruleEdit, tCoach, Utilities.getUuid());
    results.push([ru.ok && ru.data.rule.version === 2 && ru.data.rule.isAnnouncement === true, '教練修改規章後版本 +1', ru.ok ? '' : ru.error]);
    expectFail('雲端已有規章時不會重複匯入', call('importRules', { rules: [{ no: 1, title: 'x', content: 'x', category: 'x' }] }, tCoach, Utilities.getUuid()), 'INVALID');

    // 9. 防護知識：草稿不公開；只開放給指定對象
    const art = { title: '測試文章', category: 'heat', audience: ['coach', 'player'], summary: '摘要', details: ['說明'], cautions: [], sources: ['來源'], reviewed: false, quiz: [{ question: '題目', options: ['甲', '乙'], answerIndex: 1, explanation: '' }] };
    expectFail('沒有參考來源的文章會被拒絕', call('upsertArticle', Object.assign({}, art, { sources: [] }), tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('答案超出選項範圍會被拒絕', call('upsertArticle', Object.assign({}, art, { quiz: [{ question: 'q', options: ['甲', '乙'], answerIndex: 5 }] }), tCoach, Utilities.getUuid()), 'INVALID');
    const artRes = call('upsertArticle', art, tCoach, Utilities.getUuid());
    const artId = artRes.ok ? artRes.data.article.id : '';
    if (artId) created.articles.push(artId);
    const seesArt = (t) => call('listArticles', {}, t).data.articles.some((x) => x.id === artId);
    results.push([artRes.ok && !seesArt(tA), '草稿文章球員看不到', '']);
    call('setArticleStatus', { id: artId, status: 'published' }, tCoach, Utilities.getUuid());
    results.push([seesArt(tA) && !seesArt(tParent), '發布後只有指定對象看得到（家長看不到只給球員的文章）', '']);
    const parentQuiz = call('submitQuiz', { articleId: artId, answers: [1] }, tParent, Utilities.getUuid());
    results.push([!parentQuiz.ok && parentQuiz.code === 'NOT_FOUND', '家長不能作答沒有開放給家長的文章', parentQuiz.code || '']);
    results.push([call('listArticles', {}, tCoach).data.articles.find((x) => x.id === artId).quiz[0].answerIndex === 1, '文章的測驗資料完整保存（教練看得到答案）', '']);

    // 10. 公告：草稿不公開；家長只看得到開放給家長的公告
    const annRes = call('upsertAnnouncement', { title: '測試公告', body: '內容', audience: ['player', 'coach'], pinned: false }, tCoach, Utilities.getUuid());
    const annId = annRes.ok ? annRes.data.announcement.id : '';
    if (annId) created.announcements.push(annId);
    const seesAnn = (t) => call('listAnnouncements', {}, t).data.announcements.some((x) => x.id === annId);
    results.push([annRes.ok && !seesAnn(tA), '草稿公告球員看不到', '']);
    call('setAnnouncementStatus', { id: annId, status: 'published' }, tCoach, Utilities.getUuid());
    results.push([seesAnn(tA) && !seesAnn(tParent), '只開放給球員的公告，家長看不到', '']);
    call('upsertAnnouncement', { id: annId, title: '測試公告', body: '內容', audience: ['player', 'parent', 'coach'], pinned: true }, tCoach, Utilities.getUuid());
    results.push([seesAnn(tParent), '開放給家長後，家長看得到', '']);

    // 11. 修改自己的登入碼：舊的登入狀態立即失效
    expectFail('目前的登入碼錯誤時不能修改', call('changeMyCode', { oldCode: 'WRONG', newCode: 'Abcd1234' }, tA), 'INVALID');
    expectFail('太簡單的新登入碼會被拒絕', call('changeMyCode', { oldCode: paAcc.code, newCode: '1234' }, tA), 'INVALID');
    const ch = call('changeMyCode', { oldCode: paAcc.code, newCode: 'NewCode2026' }, tA, Utilities.getUuid());
    results.push([ch.ok && call('me', {}, ch.data.token).ok, '修改登入碼後取得新的登入狀態', ch.ok ? '' : ch.error]);
    expectFail('修改登入碼後，舊的登入狀態失效', call('me', {}, tA), 'AUTH');
    results.push([call('login', { loginId: paAcc.loginId, code: 'NewCode2026' }).ok, '可以用新的登入碼登入', '']);

    // 12. 教練重設登入碼：被重設者的登入狀態立即失效
    const parentReset = call('adminResetCode', { userId: parentAcc.id }, tCoach, Utilities.getUuid());
    expectOk('教練可以重設家長的登入碼', parentReset);
    expectFail('重設後，舊的登入狀態失效', call('listAnnouncements', {}, tParent), 'AUTH');
    expectFail('教練不能修改球員帳號的對應資料（需從球員名單修改）', call('adminUpdateUser', { userId: paAcc.id, displayName: 'x' }, tCoach), 'INVALID');

    // 13. 遊戲：任務、獎勵、怪獸（使用暫時的測試怪獸與測試任務）
    // 球員 A 在第 11 段改過登入碼，舊的登入狀態已失效，這裡重新登入
    const tPA = call('login', { loginId: paAcc.loginId, code: 'NewCode2026' }).data.token;
    const mon = (id, dexNo, extra) => appendRow_('Monsters', Object.assign({ id: id, dexNo: dexNo, name: '測試獸' + dexNo, element: '熱血', rarity: 1, stage: 1, evolvesTo: '', evolveLevel: '', description: '測試', habitat: 'field', catchRate: 1, isStarter: false, inWild: false }, extra));
    mon('TEST-M1', 901, { evolvesTo: 'TEST-M2', evolveLevel: 2, isStarter: true });
    mon('TEST-M2', 902, { stage: 2 });
    mon('TEST-M3', 903, { inWild: true });
    const task = (id, extra) => appendRow_('Tasks', Object.assign({ id: id, title: '測試任務' + id, description: '', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 0, pointReward: 5, ballReward: 0, active: true }, extra));
    task('TEST-T1', { expReward: 100, pointReward: 40, ballReward: 1 });
    task('TEST-T2', { category: '每日筆記', verify: 'note_today' });
    task('TEST-T3', { category: '防護知識', repeat: 'weekly', verify: 'quiz_week' });
    const state = (t) => call('getGameState', {}, t).data.state;
    const setEncounter = (monsterId) => {
      const w = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
      updateRow_('Wallets', w._row, Object.assign({}, w, { encounterMonsterId: monsterId, encounterAreaId: 'field', encounterAt: now }));
    };

    expectFail('球員不能查看別人的遊戲資料', call('getGameState', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectOk('教練可以查看指定球員的遊戲資料', call('getGameState', { playerId: 'TEST-PA' }, tCoach));
    expectFail('不是初始夥伴的怪獸不能選', call('chooseStarter', { monsterId: 'TEST-M3' }, tPA, Utilities.getUuid()), 'INVALID');
    expectOk('球員可以選擇初始夥伴', call('chooseStarter', { monsterId: 'TEST-M1' }, tPA, Utilities.getUuid()));
    expectFail('初始夥伴只能選一次', call('chooseStarter', { monsterId: 'TEST-M1' }, tPA, Utilities.getUuid()), 'INVALID');

    const sub = call('submitTask', { taskId: 'TEST-T1' }, tPA, Utilities.getUuid());
    results.push([sub.ok && sub.data.status === 'submitted', '教練確認型任務回報後，狀態是「等待確認」', sub.ok ? '' : sub.error]);
    expectFail('同一期間不能重複回報任務', call('submitTask', { taskId: 'TEST-T1' }, tPA, Utilities.getUuid()), 'INVALID');
    const comp = state(tPA).completions.find((c) => c.taskId === 'TEST-T1');
    expectFail('教練尚未確認前不能領獎', call('claimReward', { completionId: comp.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能領別人的獎勵', call('claimReward', { completionId: comp.id }, tB, Utilities.getUuid()), 'FORBIDDEN');
    expectOk('教練可以核准任務', call('reviewCompletion', { completionId: comp.id, approve: true }, tCoach, Utilities.getUuid()));
    const claimRid = Utilities.getUuid();
    const c1 = call('claimReward', { completionId: comp.id }, tPA, claimRid);
    const c2 = call('claimReward', { completionId: comp.id }, tPA, claimRid);
    const afterClaim = state(tPA);
    const partner = afterClaim.playerMonsters.find((p) => p.partner);
    results.push([c1.ok && c2.ok && afterClaim.wallet.points === 40 && afterClaim.wallet.balls === 1, '同一個領獎請求重送兩次，獎勵只會發一次', '點數 ' + afterClaim.wallet.points]);
    results.push([partner && partner.level === 2 && partner.exp === 40, '經驗值發給夥伴並正確升級（100 經驗 → Lv.2）', partner ? 'Lv.' + partner.level + ' exp ' + partner.exp : '沒有夥伴']);
    expectFail('已領過的獎勵不能再領', call('claimReward', { completionId: comp.id }, tPA, Utilities.getUuid()), 'INVALID');

    expectFail('沒寫今日筆記，系統不讓筆記任務過關', call('submitTask', { taskId: 'TEST-T2' }, tB, Utilities.getUuid()), 'INVALID');
    const noteTask = call('submitTask', { taskId: 'TEST-T2' }, tPA, Utilities.getUuid());
    results.push([noteTask.ok && noteTask.data.status === 'approved', '有今日筆記時，系統自動確認筆記任務', noteTask.ok ? '' : noteTask.error]);

    expectFail('沒通過測驗，系統不讓測驗任務過關', call('submitTask', { taskId: 'TEST-T3' }, tPA, Utilities.getUuid()), 'INVALID');
    const playerArt = call('listArticles', {}, tPA).data.articles.find((x) => x.id === artId);
    results.push([playerArt && playerArt.quiz[0].answerIndex === undefined, '球員讀取文章時看不到測驗答案', '']);
    const wrong = call('submitQuiz', { articleId: artId, answers: [0] }, tPA, Utilities.getUuid());
    results.push([wrong.ok && wrong.data.passed === false, '答錯時不會記錄通過', '']);
    const right = call('submitQuiz', { articleId: artId, answers: [1] }, tPA, Utilities.getUuid());
    results.push([right.ok && right.data.passed === true, '伺服器批改，全部答對才記錄通過', '']);
    const quizTask = call('submitTask', { taskId: 'TEST-T3' }, tPA, Utilities.getUuid());
    results.push([quizTask.ok && quizTask.data.status === 'approved', '通過測驗後，系統自動確認測驗任務', quizTask.ok ? '' : quizTask.error]);

    expectOk('每日補給可以領取', call('claimDailySupply', {}, tPA, Utilities.getUuid()));
    expectFail('每日補給一天只能領一次', call('claimDailySupply', {}, tPA, Utilities.getUuid()), 'INVALID');
    let explored = 0;
    for (let i = 0; i < 3; i++) if (call('explore', { areaId: 'field' }, tPA, Utilities.getUuid()).ok) explored++;
    results.push([explored === 3, '每天可以探索 3 次', '成功 ' + explored + ' 次']);
    expectFail('探索次數用完後不能再探索', call('explore', { areaId: 'field' }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不存在的探索地點會被拒絕', call('explore', { areaId: 'moon' }, tPA, Utilities.getUuid()), 'INVALID');

    setEncounter('TEST-M3');
    const cap = call('capture', {}, tPA, Utilities.getUuid());
    results.push([cap.ok && cap.data.success && !cap.data.duplicate && cap.data.state.playerMonsters.length === 2, '捕捉成功後怪獸加入收藏', cap.ok ? '' : cap.error]);
    expectFail('沒有遭遇怪獸時不能捕捉', call('capture', {}, tPA, Utilities.getUuid()), 'INVALID');
    setEncounter('TEST-M1');
    const pointsBeforeDup = state(tPA).wallet.points;
    const dupCap = call('capture', {}, tPA, Utilities.getUuid());
    results.push([dupCap.ok && dupCap.data.duplicate && dupCap.data.state.wallet.points === pointsBeforeDup + 15, '捕捉到已擁有的怪獸會轉換為 15 點', '']);

    const tr = call('trainMonster', { playerMonsterId: partner.id, plan: 'light' }, tPA, Utilities.getUuid());
    results.push([tr.ok && tr.data.state.wallet.points === pointsBeforeDup + 15 - 10, '訓練會扣點數並增加經驗', tr.ok ? '' : tr.error]);
    expectFail('不能訓練別人的怪獸', call('trainMonster', { playerMonsterId: partner.id, plan: 'light' }, tB, Utilities.getUuid()), 'FORBIDDEN');
    const evo = call('evolveMonster', { playerMonsterId: partner.id }, tPA, Utilities.getUuid());
    results.push([evo.ok && evo.data.toId === 'TEST-M2' && evo.data.state.playerMonsters.find((p) => p.id === partner.id).level >= 2, '達到等級後可以進化，等級保留', evo.ok ? '' : evo.error]);
    expectFail('最終型態不能再進化', call('evolveMonster', { playerMonsterId: partner.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectOk('教練可以發放經驗值', call('grantExp', { playerMonsterId: partner.id, amount: 20, reason: '測試' }, tCoach, Utilities.getUuid()));
    expectFail('任務獎勵超出範圍會被拒絕', call('upsertTask', { title: 'x', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 9999, pointReward: 0, ballReward: 0 }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('雲端已有任務時不會重複匯入', call('importTasks', { tasks: [] }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('雲端已有怪獸時不會重複匯入', call('importMonsters', { monsters: [] }, tCoach, Utilities.getUuid()), 'INVALID');
    const final = state(tPA);
    results.push([final.playerMonsters.length === 2 && final.rewardLogs.length >= 4 && final.progress.length >= 3, '遊戲資料（收藏、獎勵紀錄、成長紀錄）都有保存下來', '']);

    // 14. 匯入舊體能資料的整理規則（不讀取外部檔案）
    const legacy = [
      { legacyId: 'X1', name: '測試球員TEST-PA', item: 'run1500', date: '2026/8/4', value: '388.1', detail: '{"term":"115上"}' },
      { legacyId: 'X2', name: '測試新同學', item: 'longjump', date: '2026-09-04', value: '225' },
      { legacyId: 'X3', name: '測試新同學', item: 'swing', date: '2026-09-08', value: '89.9' },
      { legacyId: 'X4', name: '測試新同學', item: 'pushup', date: '2026-09-04', value: '20.5' },
      { legacyId: 'X5', name: '測試新同學', item: 'flying', date: '2026-09-04', value: '1' },
      { legacyId: 'X6', name: '測試新同學', item: 'situp', date: '2999-01-01', value: '30' },
      { legacyId: 'DUP', name: '測試新同學', item: 'situp', date: '2026-09-04', value: '30' },
    ];
    const lp = planLegacyImport_(legacy, ['測試新同學', '只在名單上的同學'], [{ id: 'TEST-PA', name: '測試球員TEST-PA' }], { 'L-DUP': true });
    results.push([lp.rows.length === 3 && lp.rows[0].item === 'run1500' && lp.rows[0].note.indexOf('115上') >= 0, '舊資料：可匯入的紀錄正確轉換（含學期備註）', '可匯入 ' + lp.rows.length + ' 筆']);
    results.push([lp.rows[1].item === 'jump' && lp.rows[1].date === '2026-09-04' && lp.rows[2].item === 'swing', '舊資料：立定跳遠、揮棒速度與兩種日期格式都能對應', '']);
    results.push([lp.skipped.length === 3 && lp.duplicates === 1, '舊資料：不合理數值、不支援項目、未來日期會被略過；已匯入過的不重複', '略過 ' + lp.skipped.length + '、重複 ' + lp.duplicates]);
    results.push([lp.newNames.length === 2 && lp.newNames.indexOf('測試球員TEST-PA') < 0, '舊資料：已在名單上的球員沿用，不重複建立', '新球員 ' + lp.newNames.join('、')]);

    // 15. 為沒有帳號的球員建立帳號
    appendRow_('Players', { id: 'TEST-PC', name: '測試球員TEST-PC', number: '', grade: '', position: '', active: 'TRUE', createdAt: now, updatedAt: now });
    const acct = call('adminCreatePlayerAccount', { playerId: 'TEST-PC' }, tCoach, Utilities.getUuid());
    results.push([acct.ok && acct.data.code.length === 8 && call('login', { loginId: acct.data.loginId, code: acct.data.code }).ok, '教練可以為沒有帳號的球員建立帳號，球員可用新帳號登入', acct.ok ? '' : acct.error]);
    expectFail('已經有帳號的球員不能再建立一次', call('adminCreatePlayerAccount', { playerId: 'TEST-PC' }, tCoach, Utilities.getUuid()), 'INVALID');

    // 16. 段考成績：教練輸入；球員只看自己、家長只看子女
    const tPar = call('login', { loginId: parentAcc.loginId, code: parentReset.data.code }).data.token;
    const exam = { schoolYear: 115, semester: '上', examNo: 1, grade: 8 };
    const ex1 = call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 88, 數學: 92.5, 建教: '' } }, { playerId: 'TEST-PB', scores: { 英文: 70 } }] }), tCoach, Utilities.getUuid());
    results.push([ex1.ok && ex1.data.created === 2, '教練可以一次輸入多位球員的段考成績', ex1.ok ? '' : ex1.error]);
    const ex2 = call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 90 } }] }), tCoach, Utilities.getUuid());
    const examsA = call('listExamScores', { playerId: 'TEST-PA' }, tPA);
    results.push([ex2.ok && ex2.data.updated === 1 && examsA.ok && examsA.data.records.length === 1 && examsA.data.records[0].scores.國文 === 90, '同一次段考再次儲存只會更新，不會重複', examsA.ok ? '筆數 ' + examsA.data.records.length : examsA.error]);
    results.push([examsA.ok && examsA.data.records[0].scores.建教 === undefined, '空白的科目不會存成 0 分', '']);
    expectFail('不屬於該年級的科目會被拒絕（二年級沒有「社會」）', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 社會: 80 } }] }), tCoach), 'INVALID');
    expectFail('超過 100 分會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 101 } }] }), tCoach), 'INVALID');
    expectFail('超過一位小數會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 85.55 } }] }), tCoach), 'INVALID');
    expectFail('沒有輸入任何科目會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: {} }] }), tCoach), 'INVALID');
    expectFail('不存在的年級會被拒絕', call('saveExamScores', Object.assign({}, exam, { grade: 6, entries: [{ playerId: 'TEST-PA', scores: { 國文: 80 } }] }), tCoach), 'INVALID');
    expectFail('球員不能看別人的段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tPA), 'FORBIDDEN');
    expectFail('球員不能讀全隊段考成績', call('listExamScores', {}, tPA), 'FORBIDDEN');
    expectOk('家長可以看自己子女的段考成績', call('listExamScores', { playerId: 'TEST-PA' }, tPar));
    expectFail('家長不能看別人的段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tPar), 'FORBIDDEN');
    const allExams = call('listExamScores', {}, tCoach);
    results.push([allExams.ok && allExams.data.records.filter((r) => r.playerId.indexOf('TEST-') === 0).length === 2, '教練可以讀全隊段考成績', '']);
    expectOk('教練可以刪除段考成績', call('deleteExamScore', { id: examsA.data.records[0].id }, tCoach, Utilities.getUuid()));

    // 17. 道具、血量與對戰（結果由伺服器計算）
    const rng = (v) => () => v;
    const att = { name: 'A', element: '熱血', atk: 30, def: 20, crit: 0.08, atkUp: false, defUp: false, defending: false };
    const plant = { name: 'B', element: '成長', atk: 30, def: 20, crit: 0.08, atkUp: false, defUp: false, defending: false };
    const wind = Object.assign({}, plant, { element: '疾風' });
    const dAdv = battleDamage_(att, plant, 1, rng(0.5)).dmg;
    const dNormal = battleDamage_(att, wind, 1, rng(0.5)).dmg;
    const dGuard = battleDamage_(att, Object.assign({}, wind, { defending: true }), 1, rng(0.5)).dmg;
    results.push([dAdv > dNormal && dGuard < dNormal, '對戰：屬性相剋傷害較高、防守時傷害減半', dAdv + ' / ' + dNormal + ' / ' + dGuard]);
    const hpTest = currentHp_({ hp: '10', hpAt: new Date(Date.now() - 2 * 3600000).toISOString() }, 100, Date.now());
    results.push([hpTest === 60 && currentHp_({ hp: '' }, 100, Date.now()) === 100, '血量：空白代表滿血，受傷後每小時自然回復 25%', 'HP ' + hpTest]);

    const pmA = state(tPA).playerMonsters.find((p) => p.partner);
    results.push([pmA && pmA.hp === pmA.maxHp && pmA.maxHp > 0 && pmA.atk > 0, '遊戲資料包含怪獸的 HP 與能力值', pmA ? pmA.hp + '/' + pmA.maxHp : '']);
    expectFail('商店不販售捕捉球', call('buyItem', { itemId: 'ball', qty: 1 }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('購買數量不正確會被拒絕', call('buyItem', { itemId: 'potion', qty: 0 }, tPA, Utilities.getUuid()), 'INVALID');
    const pointsBeforeBuy = state(tPA).wallet.points;
    const buy = call('buyItem', { itemId: 'potion', qty: 2 }, tPA, Utilities.getUuid());
    results.push([buy.ok && buy.data.state.wallet.points === pointsBeforeBuy - 30 && buy.data.state.wallet.items.potion === 2, '用點數購買道具：扣點數、增加道具', buy.ok ? '' : buy.error]);
    expectFail('點數不足時不能購買', call('buyItem', { itemId: 'superPotion', qty: 10 }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('HP 是滿的時不能使用回復道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能對別人的怪獸使用道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tB, Utilities.getUuid()), 'FORBIDDEN');

    // 讓球員 B 有夥伴，才能被挑戰
    appendRow_('PlayerMonsters', { id: 'TEST-PMB', playerId: 'TEST-PB', monsterId: 'TEST-M3', nickname: '測試獸B', level: 3, exp: 0, partner: true, obtainedAt: now, obtainedBy: 'starter' });
    const bt = call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const battle = bt.ok && bt.data.state.battle;
    results.push([!!battle && battle.status === 'active' && battle.me.hp === pmA.hp, '可以開始野外對戰', bt.ok ? '' : bt.error]);
    expectFail('同時只能有一場對戰', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能操作別人的對戰', call('battleAction', { battleId: battle.id, action: 'attack' }, tB, Utilities.getUuid()), 'FORBIDDEN');
    expectFail('對戰中不能在外面使用回復道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不正確的行動會被拒絕', call('battleAction', { battleId: battle.id, action: 'win' }, tPA, Utilities.getUuid()), 'INVALID');
    const progressBefore = state(tPA).progress.length;
    let last = null;
    for (let i = 0; i < 40; i++) {
      last = call('battleAction', { battleId: battle.id, action: 'attack' }, tPA, Utilities.getUuid());
      if (!last.ok || last.data.ended) break;
    }
    const afterBattle = state(tPA);
    const pmAfter = afterBattle.playerMonsters.find((p) => p.id === pmA.id);
    const endedOk = last && last.ok && ['won', 'lost', 'draw'].indexOf(last.data.ended) >= 0;
    results.push([endedOk && afterBattle.battle === null, '對戰會在一方倒下（或回合用完）時結束', last && last.ok ? String(last.data.ended) : last && last.error]);
    results.push([endedOk && afterBattle.progress.length > progressBefore && (last.data.ended !== 'lost' || pmAfter.hp === 0), '對戰結束後發放經驗值，並把剩餘 HP 寫回怪獸', 'HP ' + (pmAfter && pmAfter.hp)]);
    expectFail('已結束的對戰不能再行動', call('battleAction', { battleId: battle.id, action: 'attack' }, tPA, Utilities.getUuid()), 'INVALID');

    const pmRow = () => readAll_('PlayerMonsters').find((x) => x.id === pmA.id);
    updateRow_('PlayerMonsters', pmRow()._row, Object.assign({}, pmRow(), { hp: 0, hpAt: nowIso_() }));
    expectFail('HP 為 0 的怪獸不能出戰', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const potionsBefore = state(tPA).wallet.items.potion; // 野外對戰獲勝可能掉落藥水，所以用前後比較
    const heal = call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const healed = heal.ok && heal.data.state.playerMonsters.find((p) => p.id === pmA.id);
    results.push([healed && healed.hp > 0 && heal.data.state.wallet.items.potion === potionsBefore - 1, '回復藥水可以回復 HP，並扣掉一個道具', heal.ok ? 'HP ' + healed.hp : heal.error]);

    const opp = call('listOpponents', {}, tPA);
    results.push([opp.ok && opp.data.opponents.some((o) => o.playerId === 'TEST-PB') && !opp.data.opponents.some((o) => o.playerId === 'TEST-PA'), '隊友挑戰名單不包含自己', '']);
    expectFail('不能挑戰自己', call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PA', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const pvp = call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PB', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const pvpB = pvp.ok && pvp.data.state.battle;
    results.push([!!pvpB && pvpB.foe.hp === pvpB.foe.maxHp && pvpB.foe.owner === '測試球員TEST-PB', '隊友挑戰：對手的夥伴以滿血出戰', pvp.ok ? '' : pvp.error]);
    const wTop = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wTop._row, Object.assign({}, wTop, { points: 100 }));
    const glove = call('buyItem', { itemId: 'powerGlove', qty: 1 }, tPA, Utilities.getUuid()).ok && call('battleAction', { battleId: pvpB.id, action: 'item', itemId: 'powerGlove' }, tPA, Utilities.getUuid());
    results.push([glove && glove.ok && (glove.data.ended || glove.data.state.battle.me.atkUp === true), '對戰中可以使用力量手套', glove && !glove.ok ? glove.error : '']);
    if (glove && glove.ok && !glove.data.ended) expectFail('同一場對戰不能重複使用力量手套', call('battleAction', { battleId: pvpB.id, action: 'item', itemId: 'powerGlove' }, tPA, Utilities.getUuid()), 'INVALID');
    const giveUp = glove && glove.ok && !glove.data.ended ? call('battleAction', { battleId: pvpB.id, action: 'flee' }, tPA, Utilities.getUuid()) : { ok: true, data: { ended: 'lost' } };
    results.push([giveUp.ok && giveUp.data.ended === 'lost', '隊友挑戰中逃跑視為投降（落敗）', giveUp.ok ? String(giveUp.data.ended) : giveUp.error]);
    expectFail('同一位隊友一天只能挑戰一次', call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PB', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const histB = call('getGameState', {}, tB).data.state.battleHistory;
    results.push([histB.some((h) => h.defense && h.status === 'won'), '被挑戰的隊友會看到防守紀錄（對方投降＝防守成功）', '']);
    const wA = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wA._row, Object.assign({}, wA, { pveCount: BATTLE.pveDaily }));
    // 18. 永久刪除球員：連同帳號與所有資料一起刪除
    appendRow_('Players', { id: 'TEST-PD', name: '測試刪除球員', number: '', grade: '', position: '', active: 'TRUE', createdAt: now, updatedAt: now });
    const pdAcc = mk('test-pd-' + Date.now(), 'player', 'TEST-PD');
    appendRow_('FitnessTests', { id: 'TEST-FD', playerId: 'TEST-PD', date: today, item: 'pushup', value: 10, unit: '次', note: '', createdBy: '測試', createdAt: now, updatedAt: now });
    call('saveExamScores', { schoolYear: 115, semester: '上', examNo: 3, grade: 7, entries: [{ playerId: 'TEST-PD', scores: { 國文: 70 } }] }, tCoach, Utilities.getUuid());
    const parRow = readAll_('Users').find((u) => u.id === parentAcc.id);
    updateRow_('Users', parRow._row, Object.assign({}, parRow, { childPlayerIds: 'TEST-PA,TEST-PD' }));
    const tPD = call('login', { loginId: pdAcc.loginId, code: pdAcc.code }).data.token;
    expectFail('姓名輸入錯誤時不會刪除球員', call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '別人' }, tCoach, Utilities.getUuid()), 'INVALID');
    const delP = call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '測試刪除球員' }, tCoach, Utilities.getUuid());
    const leftAny = ['Players', 'FitnessTests', 'ExamScores'].some((n) => readAll_(n).some((r) => r.id === 'TEST-PD' || r.playerId === 'TEST-PD'));
    results.push([delP.ok && !leftAny && !readAll_('Users').some((u) => u.id === pdAcc.id), '教練可以永久刪除球員，帳號、體能、段考資料一起刪除', delP.ok ? '' : delP.error]);
    results.push([readAll_('Users').find((u) => u.id === parentAcc.id).childPlayerIds === 'TEST-PA', '刪除球員後，家長的子女清單也會移除這位球員', '']);
    expectFail('被刪除球員的登入狀態立即失效', call('me', {}, tPD), 'AUTH');
    expectFail('找不到的球員不能刪除', call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '測試刪除球員' }, tCoach, Utilities.getUuid()), 'NOT_FOUND');

    // 19. 邀請碼：家長／老師自己設定帳號與密碼
    const inv = call('adminCreateInvite', { role: 'parent', playerIds: ['TEST-PA'], label: '測試邀請' }, tCoach, Utilities.getUuid());
    results.push([inv.ok && inv.data.code.length === 8, '教練可以產生家長邀請碼', inv.ok ? '' : inv.error]);
    expectFail('邀請碼只能給家長或老師', call('adminCreateInvite', { role: 'coach', playerIds: ['TEST-PA'] }, tCoach, Utilities.getUuid()), 'INVALID');
    const regLogin = 'test-reg-' + Date.now();
    const regBase = { inviteCode: inv.data.code, loginId: regLogin, displayName: '測試家長自訂', password: 'MyPass2026' };
    expectFail('錯誤的邀請碼不能註冊', call('register', Object.assign({}, regBase, { inviteCode: 'WRONG999' })), 'INVALID');
    expectFail('太簡單的密碼不能註冊', call('register', Object.assign({}, regBase, { password: '1234' })), 'INVALID');
    const reg = call('register', Object.assign({}, regBase, { inviteCode: inv.data.code.toLowerCase() }), undefined, Utilities.getUuid());
    results.push([reg.ok && reg.data.user.role === 'parent' && reg.data.user.childPlayerIds[0] === 'TEST-PA' && call('me', {}, reg.data.token).ok, '家長用邀請碼自己設定帳號密碼，註冊後直接登入', reg.ok ? '' : reg.error]);
    results.push([call('login', { loginId: regLogin, code: 'MyPass2026' }).ok, '可以用自己設定的帳號密碼登入', '']);
    expectFail('同一組邀請碼不能用第二次', call('register', Object.assign({}, regBase, { loginId: regLogin + 'x' })), 'INVALID');
    const inv2 = call('adminCreateInvite', { role: 'teacher', playerIds: ['TEST-PA'] }, tCoach, Utilities.getUuid());
    expectOk('教練可以作廢邀請碼', call('adminRevokeInvite', { id: inv2.data.invite.id }, tCoach, Utilities.getUuid()));
    expectFail('作廢的邀請碼不能註冊', call('register', Object.assign({}, regBase, { inviteCode: inv2.data.code, loginId: regLogin + 'y' })), 'INVALID');
    results.push([JSON.stringify(call('adminListInvites', {}, tCoach)).indexOf('codeHash') < 0, '邀請碼清單不會回傳邀請碼的雜湊值', '']);

    // 20. 三方平台：溝通區、在校表現、行程
    const msg = call('postMessage', { playerId: 'TEST-PA', body: '老師您好，這週有比賽' }, tPar, Utilities.getUuid());
    expectOk('家長可以在自己孩子的溝通區留言', msg);
    expectOk('老師可以在負責學生的溝通區留言', call('postMessage', { playerId: 'TEST-PA', body: '收到，會注意功課' }, tTeacher, Utilities.getUuid()));
    expectFail('家長不能在別人孩子的溝通區留言', call('postMessage', { playerId: 'TEST-PB', body: 'x' }, tPar), 'FORBIDDEN');
    expectFail('老師不能看不是自己負責的學生', call('hubSummary', { playerId: 'TEST-PB' }, tTeacher), 'FORBIDDEN');
    expectFail('學生本人看不到溝通區', call('hubSummary', { playerId: 'TEST-PA' }, tPA), 'FORBIDDEN');
    expectFail('不能刪除別人的留言', call('deleteMessage', { id: msg.data.message.id }, tTeacher, Utilities.getUuid()), 'FORBIDDEN');
    const sr = call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '上課表現', rating: '良好', content: '上課專心' }, tTeacher, Utilities.getUuid());
    expectOk('老師可以新增在校表現紀錄', sr);
    expectFail('家長不能新增在校表現紀錄', call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '上課表現', content: 'x' }, tPar), 'FORBIDDEN');
    expectFail('在校表現的類別不正確會被拒絕', call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '亂寫', content: 'x' }, tTeacher), 'INVALID');
    expectFail('老師不能幫不是自己負責的學生寫紀錄', call('saveSchoolRecord', { playerId: 'TEST-PB', date: today, category: '上課表現', content: 'x' }, tTeacher), 'FORBIDDEN');
    const evT = call('saveEvent', { title: '測試段考', date: addDaysStr_(today, 3), category: '考試', playerIds: [] }, tTeacher, Utilities.getUuid());
    results.push([evT.ok && evT.data.event.playerIds.join() === 'TEST-PA', '老師新增行程時，沒選學生＝自己負責的全部學生（不會變成全隊）', evT.ok ? evT.data.event.playerIds.join() : evT.error]);
    expectFail('老師不能為不是自己負責的學生新增行程', call('saveEvent', { title: 'x', date: today, category: '考試', playerIds: ['TEST-PB'] }, tTeacher), 'FORBIDDEN');
    expectFail('時間格式不正確會被拒絕', call('saveEvent', { title: 'x', date: today, startTime: '25:00', category: '練習' }, tCoach), 'INVALID');
    const evTeam = call('saveEvent', { title: '測試全隊練習', date: addDaysStr_(today, 1), startTime: '16:00', endTime: '18:00', category: '練習', playerIds: [] }, tCoach, Utilities.getUuid());
    expectOk('教練可以新增全隊行程', evTeam);
    expectFail('老師不能修改教練的行程', call('saveEvent', { id: evTeam.data.event.id, title: 'x', date: today, category: '練習' }, tTeacher), 'FORBIDDEN');
    const evB = call('saveEvent', { title: '測試B個人行程', date: addDaysStr_(today, 2), category: '其他', playerIds: ['TEST-PB'] }, tCoach, Utilities.getUuid());
    const evA = call('listEvents', {}, tPA).data.events.map((e) => e.id);
    results.push([evA.indexOf(evTeam.data.event.id) >= 0 && evA.indexOf(evT.data.event.id) >= 0 && evA.indexOf(evB.data.event.id) < 0, '學生看得到全隊與自己的行程，看不到別人的個人行程', '']);
    const hub = call('hubSummary', { playerId: 'TEST-PA' }, tPar);
    results.push([hub.ok && hub.data.messages.length === 2 && hub.data.schoolRecords.length === 1 && hub.data.notes.length >= 1 && hub.data.events.length >= 2, '家長的總覽看得到溝通、在校表現、棒球筆記與行程', hub.ok ? '' : hub.error]);
    expectOk('老師可以看負責學生的段考成績', call('listExamScores', { playerId: 'TEST-PA' }, tTeacher));
    expectFail('老師不能輸入段考成績', call('saveExamScores', { schoolYear: 115, semester: '上', examNo: 1, grade: 8, entries: [] }, tTeacher), 'FORBIDDEN');
    expectOk('教練可以刪除任何留言', call('deleteMessage', { id: msg.data.message.id }, tCoach, Utilities.getUuid()));

    // 21. 群發訊息與學務處
    const tParPB = (() => {
      const acc = mk('test-parent-' + (Date.now() + 1), 'parent', '', 'TEST-PB');
      return call('login', { loginId: acc.loginId, code: acc.code }).data.token;
    })();
    const tch2 = readAll_('Users').find((u) => u.id === teacherAcc.id);
    updateRow_('Users', tch2._row, Object.assign({}, tch2, { childPlayerIds: 'TEST-PA,TEST-PB' }));
    const bc = call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: '全班明天戶外教學' }, tTeacher, Utilities.getUuid());
    results.push([bc.ok && bc.data.sent === 2, '老師可以一次群發訊息給全班學生', bc.ok ? '' : bc.error]);
    const seenA = call('hubSummary', { playerId: 'TEST-PA' }, tPar).data.messages.some((m) => m.batchId && m.body === '全班明天戶外教學');
    const seenB = call('hubSummary', { playerId: 'TEST-PB' }, tParPB).data.messages.some((m) => m.batchId && m.batchSize === 2);
    results.push([seenA && seenB, '群發的訊息兩位學生的家長都看得到', '']);
    expectFail('家長不能群發給別人的孩子', call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: 'x' }, tPar), 'FORBIDDEN');
    expectFail('沒有選學生不能群發', call('postMessage', { playerIds: [], body: 'x' }, tTeacher), 'INVALID');
    const delB = call('deleteMessage', { id: bc.data.message.id, wholeBatch: true }, tTeacher, Utilities.getUuid());
    results.push([delB.ok && delB.data.count === 2 && !readAll_('Messages').some((m) => m.batchId && m.batchId === bc.data.messages[0].batchId), '群發的訊息可以一次從全部學生刪除', delB.ok ? '' : delB.error]);
    const offHub = call('hubSummary', { playerId: 'TEST-PB' }, tOffice);
    expectOk('學務處不用勾選，就看得到每位學生的平台資料', offHub);
    const offAll = call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: '學務處統一公告' }, tOffice, Utilities.getUuid());
    expectOk('學務處可以統一發布訊息', offAll);
    expectOk('學務處也可以單獨留言給一位學生', call('postMessage', { playerId: 'TEST-PA', body: '個別提醒' }, tOffice, Utilities.getUuid()));
    const offEv = call('saveEvent', { title: '測試全校活動', date: today, category: '學校活動', playerIds: [] }, tOffice, Utilities.getUuid());
    results.push([offEv.ok && offEv.data.event.playerIds.length === 0, '學務處可以新增全體行程', offEv.ok ? '' : offEv.error]);
    expectOk('學務處可以寫在校表現', call('saveSchoolRecord', { playerId: 'TEST-PB', date: today, category: '品德行為', content: '熱心服務' }, tOffice, Utilities.getUuid()));
    expectOk('學務處可以看段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tOffice));
    expectFail('學務處不能使用教練後台', call('adminListUsers', {}, tOffice), 'FORBIDDEN');
    const rosterT = call('hubRoster', {}, tTeacher);
    const rosterP = call('hubRoster', {}, tPar);
    const rosterO = call('hubRoster', {}, tOffice);
    results.push([rosterT.ok && rosterT.data.students.length === 2 && rosterP.ok && rosterP.data.students.length === 1 && rosterO.ok && rosterO.data.students.length >= 2, '全部學生一覽：老師看負責的、家長看自己孩子、學務處看全部', '']);
    const rA = rosterO.data.students.find((s) => s.playerId === 'TEST-PA');
    results.push([rA && rA.lastMessageBy === officeAcc.loginId.replace(/^/, '測試') && rA.notes14 >= 1, '全部學生一覽有最新留言與筆記次數', rA ? rA.lastMessageBy : '']);
    const swap = call('adminUpdateUser', { userId: teacherAcc.id, displayName: '測試轉學務處', role: 'office' }, tCoach, Utilities.getUuid());
    results.push([swap.ok && readAll_('Users').find((u) => u.id === teacherAcc.id).role === 'office', '教練可以把老師帳號改成學務處', swap.ok ? '' : swap.error]);
    expectFail('教練帳號不能被改成其他角色', call('adminUpdateUser', { userId: coachAcc.id, displayName: 'x', role: 'office' }, tCoach), 'INVALID');

    // 22. 與怪獸互動、親密度進化
    mon('TEST-M4', 904, { evolvesTo: 'TEST-M5', evolveLevel: 30, evolveAffection: 10 });
    mon('TEST-M5', 905, { stage: 2 });
    appendRow_('PlayerMonsters', { id: 'TEST-PM-CARE', playerId: 'TEST-PA', monsterId: 'TEST-M4', nickname: '測試獸904', level: 1, exp: 0, partner: false, obtainedAt: now, obtainedBy: 'capture', hp: 10, hpAt: now });
    const wCare = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wCare._row, Object.assign({}, wCare, { points: 7 }));
    const care = (kind, t) => call('careMonster', { playerMonsterId: 'TEST-PM-CARE', action: kind }, t || tPA, Utilities.getUuid());
    const careRow = () => readAll_('PlayerMonsters').find((x) => x.id === 'TEST-PM-CARE');
    expectFail('親密度還不夠時不能進化', call('evolveMonster', { playerMonsterId: 'TEST-PM-CARE' }, tPA, Utilities.getUuid()), 'INVALID');
    const pet1 = care('pet');
    results.push([pet1.ok && pet1.data.gained === 2 && pet1.data.affection === 2, '摸摸牠會增加親密度', pet1.ok ? '' : pet1.error]);
    care('pet');
    care('pet');
    expectFail('摸摸牠每天有次數上限', care('pet'), 'INVALID');
    const feed1 = care('feed');
    results.push([feed1.ok && feed1.data.healed > 0 && feed1.data.state.wallet.points === 2, '餵點心會扣點數並回復 HP', feed1.ok ? 'HP +' + feed1.data.healed + '、點數 ' + feed1.data.state.wallet.points : feed1.error]);
    expectFail('點數不足時不能餵點心', care('feed'), 'INVALID');
    const play1 = care('play');
    results.push([play1.ok && play1.data.exp === 5 && Number(careRow().exp) === 5, '一起玩球會增加經驗值', play1.ok ? '' : play1.error]);
    expectFail('不能和別人的怪獸互動', care('pet', tB), 'FORBIDDEN');
    expectFail('不存在的互動方式會被拒絕', care('dance'), 'INVALID');
    expectFail('特殊名稱的互動方式會被拒絕', care('__proto__'), 'INVALID');
    const affNow = Number(careRow().affection);
    results.push([affNow === 14, '親密度正確累積（摸 3 次＋餵 1 次＋玩 1 次＝14）', '親密度 ' + affNow]);
    const evoAff = call('evolveMonster', { playerMonsterId: 'TEST-PM-CARE' }, tPA, Utilities.getUuid());
    results.push([evoAff.ok && evoAff.data.toId === 'TEST-M5' && Number(careRow().affection) === 14 && Number(careRow().level) === 1, '親密度達到後，不看等級也能進化（親密度保留）', evoAff.ok ? '' : evoAff.error]);
    const cr1 = careRow();
    updateRow_('PlayerMonsters', cr1._row, Object.assign({}, cr1, { careDate: '2000-01-01' }));
    expectOk('隔天互動次數重新計算', care('pet'));
    const cr2 = careRow();
    updateRow_('PlayerMonsters', cr2._row, Object.assign({}, cr2, { affection: 99, careDate: '2000-01-01' }));
    const top = care('pet');
    results.push([top.ok && top.data.affection === 100 && top.data.gained === 1, '親密度最高 100', top.ok ? String(top.data.affection) : top.error]);
    const monList = call('listMonsters', {}, tPA).data.monsters;
    const mAff = (id) => (monList.find((x) => x.id === id) || {}).evolveAffection;
    results.push([mAff('TEST-M4') === 10 && mAff('TEST-M1') === 0, '圖鑑資料包含進化方式（親密度或等級）', mAff('TEST-M4') + ' / ' + mAff('TEST-M1')]);
    const editM = { id: 'TEST-M1', name: '測試獸901', description: '測試', catchRate: 0.5, inWild: false, evolveLevel: 2 };
    const updAff = call('updateMonster', Object.assign({ evolveAffection: 30 }, editM), tCoach, Utilities.getUuid());
    results.push([updAff.ok && updAff.data.monster.evolveAffection === 30, '教練可以把怪獸改成親密度進化', updAff.ok ? '' : updAff.error]);
    expectFail('親密度進化的數值超出範圍會被拒絕', call('updateMonster', Object.assign({ evolveAffection: 500 }, editM), tCoach), 'INVALID');

    expectFail('每天的野外對戰次數有上限', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');

    // 23. 球隊管理：練球通知、出缺席、通訊錄、預算、賽事（練球用 2099 年的日期，不會動到真正的練球安排）
    {
      const pd = (d) => '2099-01-0' + d;
      const pw = call('savePracticeWeek', { days: [{ date: pd(5), type: '練球', startTime: '16:00', endTime: '18:00', location: '校內球場', content: '打擊練習' }, { date: pd(6), type: '休息' }] }, tCoach, Utilities.getUuid());
      results.push([pw.ok && pw.data.saved === 2, '教練可以一次儲存一週練球（含休息日）', pw.ok ? '' : pw.error]);
      const lp = call('listPractice', { from: pd(1), to: pd(9) }, tPA);
      results.push([lp.ok && lp.data.days.length === 2 && lp.data.days[1].type === '休息', '球員看得到練球通知與休息日', lp.ok ? String(lp.data.days.length) : lp.error]);
      expectFail('球員不能修改練球通知', call('savePracticeWeek', { days: [{ date: pd(5), type: '休息' }] }, tPA), 'FORBIDDEN');
      expectFail('練球結束時間早於開始時間會被拒絕', call('savePracticeWeek', { days: [{ date: pd(7), type: '練球', startTime: '18:00', endTime: '16:00' }] }, tCoach), 'INVALID');
      expectFail('練球類別不正確會被拒絕', call('savePracticeWeek', { days: [{ date: pd(7), type: '放假囉' }] }, tCoach), 'INVALID');
      const pw2 = call('savePracticeWeek', { days: [{ date: pd(5), type: '練球', startTime: '15:30', endTime: '18:00' }, { date: pd(6), type: '' }] }, tCoach, Utilities.getUuid());
      const lp2 = call('listPractice', { from: pd(1), to: pd(9) }, tCoach);
      results.push([pw2.ok && lp2.data.days.length === 1 && lp2.data.days[0].startTime === '15:30', '可以修改練球時間、清空某一天的安排（不會重複）', pw2.ok ? '' : pw2.error]);

      const att = call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '出席' }, { playerId: 'TEST-PB', status: '事假', reason: '家裡有事' }] }, tCoach, Utilities.getUuid());
      results.push([att.ok && att.data.records.filter((r) => r.playerId.indexOf('TEST-') === 0).length === 2, '教練可以點名（出席、請假與原因）', att.ok ? '' : att.error]);
      const att2 = call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '遲到' }, { playerId: 'TEST-PB', status: '' }] }, tCoach, Utilities.getUuid());
      const la = call('listAttendance', { from: today, to: today }, tCoach).data.records.filter((r) => r.playerId.indexOf('TEST-') === 0);
      results.push([att2.ok && la.length === 1 && la[0].status === '遲到', '同一天再點名會更新、不會重複；空白＝取消紀錄', JSON.stringify(la)]);
      expectFail('出缺席狀態不正確會被拒絕', call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '翹課' }] }, tCoach), 'INVALID');
      expectFail('不存在的球員不能點名', call('saveAttendance', { date: today, records: [{ playerId: 'NOPE-1', status: '出席' }] }, tCoach), 'NOT_FOUND');
      expectFail('出缺席一次最多查詢一年多', call('listAttendance', { from: '2020-01-01', to: '2026-01-01' }, tCoach), 'INVALID');

      const prof = call('saveProfile', { playerId: 'TEST-PA', guardianName: '測試家長', guardianRelation: '母', guardianPhone: '0912-345-678', height: '165.5', birthday: '2012-05-01' }, tCoach, Utilities.getUuid());
      const lpf = call('listProfiles', {}, tCoach);
      results.push([prof.ok && lpf.ok && lpf.data.profiles.some((x) => x.playerId === 'TEST-PA' && x.guardianPhone === '0912-345-678' && x.height === '165.5'), '教練可以填寫球員個人資料與通訊錄', prof.ok ? '' : prof.error]);
      call('saveProfile', { playerId: 'TEST-PA', guardianName: '測試家長二', height: '166' }, tCoach, Utilities.getUuid());
      results.push([readAll_('PlayerProfiles').filter((x) => x.playerId === 'TEST-PA').length === 1, '再次儲存個人資料會更新同一列，不會重複', '']);
      expectFail('身高格式錯誤會被拒絕', call('saveProfile', { playerId: 'TEST-PA', height: 'abc' }, tCoach), 'INVALID');
      expectFail('生日格式錯誤會被拒絕', call('saveProfile', { playerId: 'TEST-PA', birthday: '2012/13/40' }, tCoach), 'INVALID');
      expectFail('家長關係只能選母、父、隔代、其他', call('saveProfile', { playerId: 'TEST-PA', guardianRelation: '舅舅' }, tCoach), 'INVALID');
      expectFail('生日填成民國年（0101 年）會被拒絕', call('saveProfile', { playerId: 'TEST-PA', birthday: '0101-01-25' }, tCoach), 'INVALID');

      const yr = 'TEST-年度';
      const bi = call('saveBudgetItem', { year: yr, type: '支出', name: '球具', amount: '10,000' }, tCoach, Utilities.getUuid());
      results.push([bi.ok && bi.data.item.amount === 10000, '教練可以新增預算項目（金額可以有逗號）', bi.ok ? '' : bi.error]);
      expectFail('同一年度不能有同名的預算項目', call('saveBudgetItem', { year: yr, type: '支出', name: '球具', amount: '1' }, tCoach), 'INVALID');
      const biIn = call('saveBudgetItem', { year: yr, type: '收入', name: '家長會補助', amount: '20000' }, tCoach, Utilities.getUuid());
      const biId = bi.ok ? bi.data.item.id : '';
      const tx1 = call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: '購買球棒', amount: 3500, handler: '教練' }, tCoach, Utilities.getUuid());
      expectOk('教練可以記一筆支出', tx1);
      expectOk('教練可以記一筆收入', call('saveTransaction', { year: yr, date: today, type: '收入', itemId: biIn.ok ? biIn.data.item.id : '', title: '家長會補助款', amount: 20000 }, tCoach, Utilities.getUuid()));
      expectFail('收入不能記到支出的預算項目', call('saveTransaction', { year: yr, date: today, type: '收入', itemId: biId, title: 'x', amount: 1 }, tCoach), 'INVALID');
      expectFail('金額必須大於 0', call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: 'x', amount: 0 }, tCoach), 'INVALID');
      expectFail('金額不能有小數', call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: 'x', amount: '10.5' }, tCoach), 'INVALID');
      const lb = call('listBudget', { year: yr }, tCoach);
      results.push([lb.ok && lb.data.years.indexOf(yr) >= 0 && lb.data.items.length === 2 && lb.data.transactions.length === 2, '可以依年度讀取預算項目與收支', lb.ok ? lb.data.items.length + ' / ' + lb.data.transactions.length : lb.error]);
      expectFail('還有收支紀錄的預算項目不能刪除', call('deleteBudgetItem', { id: biId }, tCoach), 'INVALID');
      const txId = tx1.ok ? tx1.data.transaction.id : '';
      expectOk('可以刪除一筆收支', call('deleteTransaction', { id: txId }, tCoach, Utilities.getUuid()));
      expectOk('沒有收支紀錄之後就能刪除預算項目', call('deleteBudgetItem', { id: biId }, tCoach, Utilities.getUuid()));
      const logs23 = readAll_('AuditLogs');
      results.push([logs23.some((l) => l.action === '新增收支' && l.target === txId) && logs23.some((l) => l.action === '刪除收支' && l.target === txId), '收支的新增與刪除都會寫入操作紀錄', '']);

      const tnIn = { name: '測試盃', kind: '盃賽', startDate: today, endDate: addDaysStr_(today, 2), location: '測試球場', fee: '1500', playerIds: ['TEST-PA', 'TEST-PB'] };
      const tn = call('saveTournament', tnIn, tCoach, Utilities.getUuid());
      expectOk('教練可以新增盃賽與參賽名單', tn);
      expectFail('賽事結束日期早於開始日期會被拒絕', call('saveTournament', Object.assign({}, tnIn, { endDate: addDaysStr_(today, -1) }), tCoach), 'INVALID');
      expectFail('不存在的球員不能加入參賽名單', call('saveTournament', Object.assign({}, tnIn, { playerIds: ['NOPE-1'] }), tCoach), 'INVALID');
      expectFail('球員不能新增賽事', call('saveTournament', tnIn, tPA), 'FORBIDDEN');
      const tnId = tn.ok ? tn.data.tournament.id : '';
      const gm = call('saveGame', { tournamentId: tnId, date: today, time: '09:00', opponent: '測試國中', side: '先攻', ourScore: '5', oppScore: '3' }, tCoach, Utilities.getUuid());
      expectOk('教練可以新增比賽與比分', gm);
      expectFail('比分只填一邊會被拒絕', call('saveGame', { tournamentId: tnId, date: today, opponent: 'x', ourScore: '5', oppScore: '' }, tCoach), 'INVALID');
      const lt = call('listTournaments', {}, tPA);
      const myT = lt.ok ? lt.data.tournaments.find((t) => t.id === tnId) : null;
      results.push([!!myT && myT.playerIds.length === 2 && !!lt.data.names['TEST-PA'] && lt.data.games.some((g) => gm.ok && g.id === gm.data.game.id && g.ourScore === 5), '球員看得到賽事、參賽名單與比分', lt.ok ? '' : lt.error]);
      const dt = call('deleteTournament', { id: tnId }, tCoach, Utilities.getUuid());
      results.push([dt.ok && dt.data.games === 1 && !readAll_('Games').some((g) => g.tournamentId === tnId), '刪除賽事會連同它的比賽一起刪除', dt.ok ? '' : dt.error]);
    }

    // 6. 停用帳號立即失效
    const ub = readAll_('Users').find((u) => u.id === pbAcc.id);
    updateRow_('Users', ub._row, Object.assign({}, ub, { active: 'FALSE' }));
    expectFail('停用的帳號無法再使用', call('listNotes', { playerId: 'TEST-PB' }, tB), 'AUTH');
  } catch (err) {
    results.push([false, '測試過程發生錯誤', String(err && err.stack ? err.stack : err)]);
  } finally {
    cleanupTestData_(created);
    // 還原測試前的目標期限設定
    const props = PropertiesService.getScriptProperties();
    if (savedGoalSettings === null) props.deleteProperty('goalSettings');
    else props.setProperty('goalSettings', savedGoalSettings);
  }

  const passed = results.filter((r) => r[0]).length;
  writeTestLog_(results, passed);
  results.forEach((r) => console.log((r[0] ? '✅ PASS ' : '❌ FAIL ') + r[1] + (r[0] || !r[2] ? '' : '（' + r[2] + '）')));
  console.log('──────── 結果：' + passed + ' / ' + results.length + ' 通過 ────────');
  if (passed !== results.length) throw new Error('有 ' + (results.length - passed) + ' 項測試失敗，請把執行記錄提供給開發者。');
}

/** 把測試結果寫到「自動測試結果」工作表（失敗的排在最前面），方便檢查；每次執行會覆蓋上一次 */
function writeTestLog_(results, passed) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(TEST_LOG_SHEET) || ss.insertSheet(TEST_LOG_SHEET);
    sh.clearContents();
    const at = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    const rows = [['結果', '測試項目', '說明', '版本 ' + API_VERSION + '・' + at + '・' + passed + ' / ' + results.length + ' 通過']];
    results.filter((r) => !r[0]).concat(results.filter((r) => r[0])).forEach((r) => rows.push([r[0] ? 'PASS' : 'FAIL', cell_(r[1]), cell_(String(r[2] || '').slice(0, 1000)), '']));
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
  } catch (e) {
    console.log('（無法寫入測試結果工作表：' + e + '）');
  }
}

const TEST_LOG_SHEET = '自動測試結果';

/**
 * 刪除測試資料。除了這次建立的，也會清掉「上次測試中途被停止」而留下的資料：
 * TEST- 開頭的資料、自動測試帳號（test-coach-數字 這類帳號）、自動測試的文章與公告。
 */
const TEST_LOGIN_PATTERN = /^test-(coach|pa|pb|pc|pd|parent|teacher|office|reg)-\d{10,}$/;

function cleanupTestData_(created) {
  const testUsers = created.users.concat(readAll_('Users').filter((u) => TEST_LOGIN_PATTERN.test(u.loginId)).map((u) => u.id));
  const ids = testUsers.concat(created.players, created.articles, created.announcements);
  const isTestTitle = (r) => (r.title === '測試文章' && r.summary === '摘要') || (r.title === '測試公告' && r.body === '內容');
  const isTest = (r) =>
    ids.indexOf(r.id) >= 0 ||
    String(r.id || '').indexOf('TEST-') === 0 ||
    String(r.playerId || '').indexOf('TEST-') === 0 ||
    String(r.target || '').indexOf('TEST-') === 0 ||
    ids.indexOf(r.target) >= 0 ||
    testUsers.indexOf(r.actorId) >= 0 ||
    testUsers.indexOf(r.createdById) >= 0 ||
    testUsers.indexOf(r.authorId) >= 0 ||
    isTestTitle(r);
  [
    'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements',
    'TaskCompletions', 'Tasks', 'PlayerMonsters', 'MonsterProgress', 'Monsters', 'Wallets', 'RewardLogs', 'QuizPasses',
    'ExamScores', 'Battles', 'Invites', 'Messages', 'SchoolRecords', 'Events',
    'PracticeDays', 'Attendance', 'PlayerProfiles', 'Transactions', 'BudgetItems', 'Games', 'Tournaments', 'AuditLogs', 'Users', 'Players',
  ].forEach((name) => {
    const rows = readAll_(name).filter(isTest).map((r) => r._row).sort((a, b) => b - a);
    rows.forEach((row) => deleteRow_(name, row));
  });
}
