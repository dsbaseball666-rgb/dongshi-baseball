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

const API_VERSION = '5.0.0';
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
  Monsters: ['id', 'dexNo', 'name', 'element', 'rarity', 'stage', 'evolvesTo', 'evolveLevel', 'description', 'habitat', 'catchRate', 'isStarter', 'inWild'],
  PlayerMonsters: ['id', 'playerId', 'monsterId', 'nickname', 'level', 'exp', 'partner', 'obtainedAt', 'obtainedBy'],
  MonsterProgress: ['id', 'playerId', 'playerMonsterId', 'expGain', 'levelAfter', 'reason', 'at'],
  Rules: ['id', 'no', 'title', 'content', 'category', 'version', 'updatedAt', 'updatedBy', 'needsCoachReview', 'reviewNote', 'isAnnouncement'],
  KnowledgeArticles: ['id', 'title', 'category', 'audience', 'summary', 'details', 'cautions', 'sources', 'updatedAt', 'status', 'reviewed', 'quiz'],
  Announcements: ['id', 'title', 'body', 'audience', 'pinned', 'status', 'publishedAt', 'createdBy', 'updatedAt'],
  AuditLogs: ['id', 'at', 'actorId', 'actorName', 'action', 'target', 'detail'],
  // 第四階段：遊戲（第一次使用時自動建立）
  Wallets: ['playerId', 'points', 'balls', 'exploreDate', 'exploreCount', 'supplyDate', 'seenMonsterIds', 'encounterMonsterId', 'encounterAreaId', 'encounterAt', 'updatedAt'],
  RewardLogs: ['id', 'playerId', 'source', 'detail', 'exp', 'points', 'balls', 'at'],
  QuizPasses: ['id', 'playerId', 'articleId', 'date', 'at'],
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
};

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

const ALL_ROLES = ['coach', 'player', 'parent'];
const COACH = ['coach'];
const COACH_PLAYER = ['coach', 'player'];

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
  adminSetUserActive: { roles: COACH, write: true, fn: adminSetUserActive_ },
  listAudit: { roles: COACH, fn: listAudit_ },
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
  const newCode = str_(ctx.payload.newCode, '新的登入碼', { required: true, max: 40 });
  if (hashCode_(a.codeSalt, oldCode) !== a.codeHash) throw apiError_('INVALID', '目前的登入碼不正確。');
  if (newCode.length < 8 || !/[A-Za-z]/.test(newCode) || !/[0-9]/.test(newCode)) throw apiError_('INVALID', '新的登入碼至少 8 個字，並且要同時包含英文字母與數字。');
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
  if (a.role === 'coach') return { players: all };
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
  sheet_('FitnessTests').deleteRow(rec._row);
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
  };
}

function parsePM_(r) {
  return {
    id: r.id, playerId: r.playerId, monsterId: r.monsterId, nickname: r.nickname, level: Number(r.level) || 1, exp: Number(r.exp) || 0,
    partner: r.partner === 'TRUE', obtainedAt: r.obtainedAt, obtainedBy: r.obtainedBy,
  };
}

function parseWallet_(r) {
  return {
    playerId: r.playerId, points: Number(r.points) || 0, balls: Number(r.balls) || 0, exploreDate: r.exploreDate || '',
    exploreCount: Number(r.exploreCount) || 0, supplyDate: r.supplyDate || '',
    seenMonsterIds: r.seenMonsterIds ? r.seenMonsterIds.split(',').filter(String) : [],
    encounter: r.encounterMonsterId ? { monsterId: r.encounterMonsterId, areaId: r.encounterAreaId, at: r.encounterAt } : null,
  };
}

/** 讀取球員錢包（還沒有時先給預設值，存檔時才寫入） */
function loadWallet_(playerId) {
  const r = readAll_('Wallets').find((x) => x.playerId === playerId);
  return r || { playerId: playerId, points: '0', balls: '0', exploreDate: '', exploreCount: '0', supplyDate: '', seenMonsterIds: '', encounterMonsterId: '', encounterAreaId: '', encounterAt: '' };
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
  return {
    today: today,
    wallet: parseWallet_(loadWallet_(playerId)),
    playerMonsters: readAll_('PlayerMonsters').filter((x) => x.playerId === playerId).map(parsePM_),
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

/** 進化：達到該怪獸設定的等級才能進化，等級與經驗值保留 */
function evolveMonster_(ctx) {
  const pm = findOwnPM_(ctx.actor, ctx.payload.playerMonsterId);
  const monsters = readAll_('Monsters');
  const m = monsters.find((x) => x.id === pm.monsterId);
  if (!m) throw apiError_('NOT_FOUND', '怪獸資料不存在。');
  if (!m.evolvesTo || !m.evolveLevel) throw apiError_('INVALID', m.name + ' 已經是最終型態，無法再進化。');
  if (Number(pm.level) < Number(m.evolveLevel)) throw apiError_('INVALID', pm.nickname + ' 需要達到 Lv.' + m.evolveLevel + ' 才能進化（目前 Lv.' + pm.level + '）。');
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
    return {
      id: m.id, dexNo: Number(m.dexNo), name: str_(m.name, '怪獸名稱', { required: true, max: 12 }), element: m.element, rarity: rarity, stage: stage,
      evolvesTo: m.evolvesTo || '', evolveLevel: lv, description: str_(m.description, '圖鑑說明', { required: true, max: 120 }), habitat: m.habitat,
      catchRate: rate, isStarter: m.isStarter === true, inWild: m.inWild === true,
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
  const row = Object.assign({}, m, changes);
  updateRow_('Monsters', m._row, row);
  audit_(a, '修改怪獸資料', id, changes.name + '（捕捉率 ' + Math.round(changes.catchRate * 100) + '%' + (changes.evolveLevel ? '、Lv.' + changes.evolveLevel + ' 進化' : '') + '）');
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
  if (role !== 'coach' && role !== 'parent') throw apiError_('INVALID', '這裡只能建立教練或家長帳號；球員帳號請用「新增球員」。');
  const loginId = str_(p.loginId, '帳號', { required: true, max: 30 }).toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(loginId)) throw apiError_('INVALID', '帳號只能使用 3～30 個英文小寫、數字或 _ . -。');
  const displayName = str_(p.displayName, '顯示名稱', { required: true, max: 30 });
  let kids = '';
  if (role === 'parent') {
    const ids = Array.isArray(p.childPlayerIds) ? p.childPlayerIds.map(String) : [];
    const players = readAll_('Players');
    if (ids.length === 0 || ids.some((id) => !players.some((x) => x.id === id))) throw apiError_('INVALID', '家長帳號必須對應至少一位存在的球員。');
    kids = ids.join(',');
  }
  const account = createUser_({ loginId: loginId, displayName: displayName, role: role, playerId: '', childPlayerIds: kids });
  audit_(a, '新增帳號', account.id, displayName + '（' + role + '）');
  return { userId: account.id, loginId: account.loginId, code: account.code };
}

/** 修改教練或家長帳號的顯示名稱，以及家長對應的子女 */
function adminUpdateUser_(ctx) {
  const a = ctx.actor;
  const p = ctx.payload;
  const id = str_(p.userId, '帳號', { required: true, max: 40 });
  const u = readAll_('Users').find((x) => x.id === id);
  if (!u) throw apiError_('NOT_FOUND', '找不到這個帳號。');
  if (u.role === 'player') throw apiError_('INVALID', '球員帳號請在球員名單中修改。');
  const changes = { displayName: str_(p.displayName, '顯示名稱', { required: true, max: 30 }), updatedAt: nowIso_() };
  if (u.role === 'parent') {
    const ids = Array.isArray(p.childPlayerIds) ? p.childPlayerIds.map(String) : [];
    const players = readAll_('Players');
    if (ids.length === 0 || ids.some((x) => !players.some((pl) => pl.id === x))) throw apiError_('INVALID', '家長帳號必須對應至少一位存在的球員。');
    changes.childPlayerIds = ids.join(',');
  }
  updateRow_('Users', u._row, Object.assign({}, u, changes));
  audit_(a, '修改帳號', u.id, changes.displayName + (changes.childPlayerIds ? '（子女：' + changes.childPlayerIds + '）' : ''));
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

function createUser_(u) {
  const users = readAll_('Users');
  if (users.some((x) => x.loginId.toLowerCase() === u.loginId)) throw apiError_('INVALID', '帳號「' + u.loginId + '」已經有人使用。');
  const code = randomCode_();
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

// ───────────────────────── 試算表存取 ─────────────────────────

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

/** 讀取整張表（全部以文字讀出），每列附上 _row 行號 */
function readAll_(name) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  const headers = SCHEMA[name];
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  const out = [];
  values.forEach((r, i) => {
    if (r[0] === '') return;
    const o = { _row: i + 2 };
    headers.forEach((h, j) => (o[h] = r[j]));
    out.push(o);
  });
  return out;
}

function appendRow_(name, obj) {
  sheet_(name).appendRow(SCHEMA[name].map((h) => cell_(obj[h])));
}

function updateRow_(name, row, obj) {
  const headers = SCHEMA[name];
  sheet_(name).getRange(row, 1, 1, headers.length).setValues([headers.map((h) => cell_(obj[h]))]);
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

/** 建立 14 張工作表與欄位，並建立第一個教練帳號。可以重複執行，不會覆蓋既有資料。 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  if (ss.getName() === '未命名的試算表' || ss.getName() === 'Untitled spreadsheet') ss.rename('東勢國中棒球隊｜冒險訓練筆記本 資料庫');
  Object.keys(SCHEMA).forEach((name) => {
    const headers = SCHEMA[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const current = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (current.join('') === '') {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#fff3c4');
      sh.setFrozenRows(1);
    } else if (current.join('|') !== headers.join('|')) {
      throw new Error('工作表「' + name + '」的欄位和程式設定不同，請檢查第 1 列：' + current.join(', '));
    }
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  const name = ss.getName() + ' 備份 ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
  const copy = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  console.log('✅ 已建立備份：' + copy.getName() + '（資料夾：' + BACKUP_FOLDER_NAME + '）');
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
    results.push([!!(tCoach && tA && tB && tParent), '正確登入碼可以登入', '']);
    expectFail('沒有 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }), 'AUTH');
    expectFail('偽造 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }, 'x'.repeat(64)), 'AUTH');

    // 1-1. 每個 API 的授權（依 ROUTES 自動產生，新增 API 時也會自動被檢查）
    const tokenOf = { coach: tCoach, player: tA, parent: tParent };
    const roleName = { coach: '教練', player: '球員', parent: '家長' };
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
    expectOk('教練可以重設家長的登入碼', call('adminResetCode', { userId: parentAcc.id }, tCoach, Utilities.getUuid()));
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
  results.forEach((r) => console.log((r[0] ? '✅ PASS ' : '❌ FAIL ') + r[1] + (r[0] || !r[2] ? '' : '（' + r[2] + '）')));
  console.log('──────── 結果：' + passed + ' / ' + results.length + ' 通過 ────────');
  if (passed !== results.length) throw new Error('有 ' + (results.length - passed) + ' 項測試失敗，請把執行記錄提供給開發者。');
}

function cleanupTestData_(created) {
  const ids = created.users.concat(created.players, created.articles, created.announcements);
  const isTest = (r) =>
    ids.indexOf(r.id) >= 0 ||
    String(r.id || '').indexOf('TEST-') === 0 ||
    String(r.playerId || '').indexOf('TEST-') === 0 ||
    String(r.target || '').indexOf('TEST-') === 0 ||
    ids.indexOf(r.target) >= 0 ||
    created.users.indexOf(r.actorId) >= 0;
  [
    'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements',
    'TaskCompletions', 'Tasks', 'PlayerMonsters', 'MonsterProgress', 'Monsters', 'Wallets', 'RewardLogs', 'QuizPasses',
    'AuditLogs', 'Users', 'Players',
  ].forEach((name) => {
    const rows = readAll_(name).filter(isTest).map((r) => r._row).sort((a, b) => b - a);
    rows.forEach((row) => sheet_(name).deleteRow(row));
  });
}
