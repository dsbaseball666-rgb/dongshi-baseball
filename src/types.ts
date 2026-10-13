// 資料型別：欄位設計對應第二階段要建立的 Google 試算表工作表

export type Role = 'coach' | 'player' | 'parent' | 'teacher' | 'office';

/** Users 工作表：使用者及角色對應 */
export interface User {
  id: string;
  /** 雲端模式的登入帳號 */
  loginId?: string;
  displayName: string;
  role: Role;
  /** 角色為球員時，對應 Players.id */
  playerId?: string;
  /** 角色為家長時，對應的子女 Players.id */
  childPlayerIds: string[];
  active: boolean;
  createdAt: string;
}

/** Players 工作表：球員名單 */
export interface Player {
  id: string;
  name: string;
  number: string;
  grade: string;
  position: string;
  active: boolean;
  createdAt: string;
}

export interface SelfCheckItem {
  key: string;
  label: string;
}

/** DailyNotes 工作表：每日筆記（同一球員同一天一筆主紀錄） */
export interface DailyNote {
  id: string;
  playerId: string;
  date: string;
  training: string;
  learned: string;
  improve: string;
  tomorrowPrep: string;
  shortGoal: string;
  midGoal: string;
  longGoal: string;
  selfChecks: Record<string, boolean>;
  coachComment: string;
  coachCommentBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalTerm = 'short' | 'mid' | 'long';
export type GoalStatus = 'active' | 'completed' | 'not_met' | 'cancelled';
export type CheckpointState = 'todo' | 'submitted' | 'approved';

export interface GoalCheckpoint {
  id: string;
  label: string;
  state: CheckpointState;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/** Goals 工作表：目標及進度 */
export interface Goal {
  id: string;
  playerId: string;
  term: GoalTerm;
  content: string;
  criteria: string;
  startDate: string;
  dueDate: string;
  status: GoalStatus;
  checkpoints: GoalCheckpoint[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 目標期限設定（由教練調整，不寫死） */
export interface GoalTermSetting {
  term: GoalTerm;
  label: string;
  periodHint: string;
  defaultDays: number;
}

export type FitnessItemKey = 'pushup' | 'situp' | 'jump' | 'run1500' | 'run150' | 'grip' | 'swing' | 'pitch';

/** FitnessTests 工作表：體能檢測。跑步時間一律以「秒」儲存 */
export interface FitnessTest {
  id: string;
  playerId: string;
  date: string;
  item: FitnessItemKey;
  value: number;
  unit: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskCategory = '每日筆記' | '紀律' | '防護知識' | '團隊合作' | '持續進步' | '訓練' | '休養參與';
export type TaskRepeat = 'daily' | 'weekly' | 'once';
/** coach：教練確認；note_today：系統檢查今日筆記；quiz_week：系統檢查本週知識測驗 */
export type TaskVerify = 'coach' | 'note_today' | 'quiz_week';

/** Tasks 工作表：任務設定 */
export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  repeat: TaskRepeat;
  verify: TaskVerify;
  expReward: number;
  pointReward: number;
  ballReward: number;
  active: boolean;
}

export type CompletionStatus = 'submitted' | 'approved' | 'rejected' | 'claimed';

/** TaskCompletions 工作表：任務完成及獎勵紀錄（taskId + playerId + periodKey 唯一） */
export interface TaskCompletion {
  id: string;
  taskId: string;
  playerId: string;
  periodKey: string;
  status: CompletionStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  claimedAt?: string;
}

export type MonsterElement = '熱血' | '疾風' | '堅守' | '成長' | '智慧' | '團結';
export type SpriteShape = 'small' | 'round' | 'bird' | 'shell' | 'tall' | 'big';
export type SpriteAccessory = 'none' | 'ears' | 'horn' | 'leaf' | 'flame' | 'cap' | 'stitch' | 'wings' | 'crown' | 'tail' | 'spikes' | 'antenna' | 'fins';
export type ExploreAreaId = 'field' | 'riverside' | 'orchard';

export interface SpritePalette {
  body: string;
  belly: string;
  accent: string;
  outline: string;
}

/** Monsters 工作表：怪獸基本資料（原創） */
export interface Monster {
  id: string;
  dexNo: number;
  name: string;
  element: MonsterElement;
  rarity: 1 | 2 | 3;
  /** 進化階段：1 幼年、2 成長、3 最終 */
  stage: 1 | 2 | 3;
  /** 進化後的怪獸 id（最終型態沒有） */
  evolvesTo?: string;
  /** 需要達到的等級才能進化（由教練調整） */
  evolveLevel?: number;
  /** 大於 0 時改用親密度進化（不看等級）；沒有值時使用預設 */
  evolveAffection?: number;
  description: string;
  habitat: ExploreAreaId;
  catchRate: number;
  isStarter: boolean;
  inWild: boolean;
  shape: SpriteShape;
  accessories: SpriteAccessory[];
  palette: SpritePalette;
}

/** PlayerMonsters 工作表：球員的怪獸收藏 */
export interface PlayerMonster {
  id: string;
  playerId: string;
  monsterId: string;
  nickname: string;
  level: number;
  exp: number;
  partner: boolean;
  obtainedAt: string;
  obtainedBy: 'starter' | 'capture';
  /** 雲端模式由伺服器計算：目前 HP（含自然回復）與能力值 */
  hp?: number;
  maxHp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  /** 親密度 0～100；careDate／careCounts 是當天各種互動的次數 */
  affection?: number;
  careDate?: string;
  careCounts?: Partial<Record<'pet' | 'feed' | 'play', number>>;
}

export type ItemId = 'potion' | 'superPotion' | 'powerGlove' | 'guardGear';

/** 對戰中的一方（建立對戰時的快照） */
export interface Combatant {
  pmId: string;
  monsterId: string;
  name: string;
  level: number;
  element: MonsterElement;
  owner: string;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  cd: number;
  atkUp: boolean;
  defUp: boolean;
}

export type BattleMode = 'pve' | 'pvp';
export type BattleStatus = 'active' | 'won' | 'lost' | 'draw' | 'fled';

/** Battles 工作表：一場對戰 */
export interface Battle {
  id: string;
  mode: BattleMode;
  status: BattleStatus;
  opponentName: string;
  turn: number;
  me: Combatant;
  foe: Combatant;
  log: string[];
  result: { exp: number; points: number; drop: string } | null;
  createdAt: string;
}

export interface BattleSummary {
  id: string;
  mode: BattleMode;
  /** true：別人挑戰我（防守紀錄） */
  defense: boolean;
  status: BattleStatus;
  myMonster: string;
  foeMonster: string;
  opponentName: string;
  createdAt: string;
}

export interface Opponent {
  playerId: string;
  name: string;
  nickname: string;
  monsterId: string;
  element: MonsterElement;
  level: number;
  challengedToday: boolean;
}

/** Invites 工作表：教練產生的邀請碼（邀請碼本身只在產生時顯示一次） */
export interface Invite {
  id: string;
  role: 'parent' | 'teacher' | 'office';
  playerIds: string[];
  label: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy: string;
  usedAt: string;
}

/** Messages 工作表：三方平台溝通區（學生本人看不到） */
export interface HubMessage {
  id: string;
  playerId: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
  /** 群發的訊息有相同的 batchId；batchSize＝當時發給幾位學生 */
  batchId: string;
  batchSize: number;
}

/** SchoolRecords 工作表：在校表現紀錄（老師、教練填寫） */
export interface SchoolRecord {
  id: string;
  playerId: string;
  date: string;
  category: string;
  rating: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
  updatedAt: string;
}

/** Events 工作表：行程（playerIds 空白＝全隊） */
export interface TeamEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  category: string;
  playerIds: string[];
  note: string;
  createdById: string;
  createdBy: string;
  updatedAt: string;
}

/** ExamScores 工作表：段考成績（同一球員同一次段考一筆） */
export interface ExamScore {
  id: string;
  playerId: string;
  schoolYear: number;
  semester: '上' | '下';
  examNo: number;
  /** 7＝一年級、8＝二年級、9＝三年級 */
  grade: 7 | 8 | 9;
  scores: Record<string, number>;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** MonsterProgress 工作表：怪獸經驗與成長紀錄 */
export interface MonsterProgress {
  id: string;
  playerId: string;
  playerMonsterId: string;
  expGain: number;
  levelAfter: number;
  reason: string;
  at: string;
}

export interface Encounter {
  monsterId: string;
  areaId: ExploreAreaId;
  at: string;
}

/** 球員遊戲錢包：點數、捕捉球、每日探索次數（正式版併入後端資料） */
export interface Wallet {
  playerId: string;
  points: number;
  balls: number;
  exploreDate: string;
  exploreCount: number;
  supplyDate: string;
  seenMonsterIds: string[];
  encounter: Encounter | null;
  /** 以下為雲端模式的道具與對戰次數 */
  items?: Partial<Record<ItemId, number>>;
  battleDate?: string;
  pveCount?: number;
  pvpCount?: number;
}

export interface RewardLog {
  id: string;
  playerId: string;
  source: string;
  detail: string;
  exp: number;
  points: number;
  balls: number;
  at: string;
}

export interface QuizPass {
  id: string;
  playerId: string;
  articleId: string;
  date: string;
  at: string;
}

/** Rules 工作表：球隊規章 */
export interface Rule {
  id: string;
  no: number;
  title: string;
  content: string;
  category: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  needsCoachReview: boolean;
  reviewNote: string;
  isAnnouncement: boolean;
}

export type KnowledgeCategory = 'warmup' | 'arm' | 'batting' | 'heat' | 'injury' | 'recovery';
export type PublishStatus = 'draft' | 'published' | 'archived';

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/** KnowledgeArticles 工作表：防護知識文章 */
export interface KnowledgeArticle {
  id: string;
  title: string;
  category: KnowledgeCategory;
  audience: Role[];
  summary: string;
  details: string[];
  cautions: string[];
  sources: string[];
  updatedAt: string;
  status: PublishStatus;
  reviewed: boolean;
  quiz: QuizQuestion[];
}

/** Announcements 工作表：公告 */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Role[];
  pinned: boolean;
  status: PublishStatus;
  publishedAt?: string;
  createdBy: string;
  updatedAt: string;
}

/** AuditLogs 工作表：重要管理操作紀錄 */
export interface AuditLog {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  detail: string;
}

export interface SyncError {
  id: string;
  at: string;
  operation: string;
  message: string;
  resolved: boolean;
}

/** 第一階段的示範資料庫（只存在瀏覽器） */
export interface DemoDB {
  version: number;
  players: Player[];
  users: User[];
  selfCheckItems: SelfCheckItem[];
  notes: DailyNote[];
  goals: Goal[];
  goalSettings: GoalTermSetting[];
  fitness: FitnessTest[];
  tasks: Task[];
  completions: TaskCompletion[];
  monsters: Monster[];
  playerMonsters: PlayerMonster[];
  monsterProgress: MonsterProgress[];
  wallets: Wallet[];
  rewardLogs: RewardLog[];
  quizPasses: QuizPass[];
  rules: Rule[];
  articles: KnowledgeArticle[];
  announcements: Announcement[];
  auditLogs: AuditLog[];
  syncErrors: SyncError[];
}

export interface Outcome<R> {
  db: DemoDB;
  result: R;
}
