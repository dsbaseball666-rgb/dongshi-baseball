// 所有資料修改的「規則」集中在這裡，寫成純函式，方便測試。
// 第一階段在瀏覽器執行；第二～四階段會把相同規則搬到 Apps Script 後端執行，
// 前端的檢查只是使用體驗，正式的權限與防重複領獎必須以後端為準。

import type {
  Announcement,
  DemoDB,
  ExploreAreaId,
  FitnessItemKey,
  GoalStatus,
  GoalTerm,
  GoalTermSetting,
  KnowledgeArticle,
  Outcome,
  Player,
  PublishStatus,
  Role,
  Task,
  User,
  Wallet,
} from '../types';
import { can, type Permission } from '../lib/permissions';
import { isoWeekKey, isValidDateStr, todayStr } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem } from '../lib/fitness';
import { applyExp, MAX_LEVEL, pickEncounter, TRAIN_PLANS, type TrainPlanId } from '../lib/monster';
import { config } from '../config';

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

function fail(message: string): never {
  throw new ActionError(message);
}

function check(cond: unknown, message: string): asserts cond {
  if (!cond) fail(message);
}

export function requirePermission(actor: User | null | undefined, perm: Permission): asserts actor is User {
  check(actor, '尚未登入，無法執行此操作。');
  check(actor.active, '此帳號已停用，無法執行此操作。');
  check(can(actor, perm), '權限不足，無法執行此操作。');
}

function requireOwnPlayer(actor: User | null | undefined, perm: Permission, playerId: string): asserts actor is User {
  requirePermission(actor, perm);
  check(actor.playerId === playerId, '只能操作自己的資料。');
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clone(db: DemoDB): DemoDB {
  return structuredClone(db);
}

function cleanText(value: string, field: string, opts: { required?: boolean; max: number }): string {
  const v = (value ?? '').trim();
  if (opts.required) check(v.length > 0, `請填寫「${field}」。`);
  check(v.length <= opts.max, `「${field}」最多 ${opts.max} 字。`);
  return v;
}

function cleanInt(value: number, field: string, min: number, max: number): number {
  check(Number.isInteger(value) && value >= min && value <= max, `「${field}」必須是 ${min}～${max} 的整數。`);
  return value;
}

function audit(db: DemoDB, actor: User, action: string, target: string, detail: string, now: string): void {
  db.auditLogs.unshift({ id: uid('AL'), at: now, actorId: actor.id, actorName: actor.displayName, action, target, detail });
}

function getWallet(db: DemoDB, playerId: string): Wallet {
  let w = db.wallets.find((x) => x.playerId === playerId);
  if (!w) {
    w = { playerId, points: 0, balls: 0, exploreDate: '', exploreCount: 0, supplyDate: '', seenMonsterIds: [], encounter: null };
    db.wallets.push(w);
  }
  return w;
}

const nowIso = () => new Date().toISOString();
const localToday = (now: string) => todayStr(new Date(now));

// ───────────────────────── 每日筆記 ─────────────────────────

export interface NoteInput {
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
}

/** 同一球員同一天只有一筆主紀錄：已存在就更新，不存在才新增 */
export function saveNote(db0: DemoDB, actor: User | null, input: NoteInput, now = nowIso()): DemoDB {
  requireOwnPlayer(actor, 'note.write.own', input.playerId);
  check(isValidDateStr(input.date), '日期格式不正確。');
  check(input.date <= localToday(now), '不能建立未來日期的筆記。');
  const fields = {
    training: cleanText(input.training, '當日訓練內容', { required: true, max: 1000 }),
    learned: cleanText(input.learned, '今日學到的事情', { max: 1000 }),
    improve: cleanText(input.improve, '需要改進的地方', { max: 1000 }),
    tomorrowPrep: cleanText(input.tomorrowPrep, '明日訓練準備', { max: 1000 }),
    shortGoal: cleanText(input.shortGoal, '短期目標', { max: 300 }),
    midGoal: cleanText(input.midGoal, '中期目標', { max: 300 }),
    longGoal: cleanText(input.longGoal, '長期目標', { max: 300 }),
  };
  const db = clone(db0);
  const validKeys = new Set(db.selfCheckItems.map((i) => i.key));
  const selfChecks = Object.fromEntries(
    Object.entries(input.selfChecks).filter(([k]) => validKeys.has(k)).map(([k, v]) => [k, !!v]),
  );
  const existing = db.notes.find((n) => n.playerId === input.playerId && n.date === input.date);
  if (existing) {
    Object.assign(existing, fields, { selfChecks, updatedAt: now });
  } else {
    db.notes.push({ id: uid('N'), playerId: input.playerId, date: input.date, ...fields, selfChecks, coachComment: '', createdAt: now, updatedAt: now });
  }
  return db;
}

export function commentNote(db0: DemoDB, actor: User | null, noteId: string, comment: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'note.comment');
  const text = cleanText(comment, '教練評語', { max: 500 });
  const db = clone(db0);
  const note = db.notes.find((n) => n.id === noteId);
  check(note, '找不到這筆筆記。');
  note.coachComment = text;
  note.coachCommentBy = actor.displayName;
  note.updatedAt = now;
  audit(db, actor, '撰寫筆記評語', note.id, `${note.playerId} ${note.date}`, now);
  return db;
}

// ───────────────────────── 目標 ─────────────────────────

export interface GoalInput {
  playerId: string;
  term: GoalTerm;
  content: string;
  criteria: string;
  startDate: string;
  dueDate: string;
  checkpoints: string[];
}

export function createGoal(db0: DemoDB, actor: User | null, input: GoalInput, now = nowIso()): DemoDB {
  check(actor && actor.active, '尚未登入或帳號已停用。');
  const isCoach = can(actor, 'goal.manage');
  if (!isCoach) {
    check(can(actor, 'goal.write.own') && actor.playerId === input.playerId, '只能為自己建立目標。');
  }
  check(['short', 'mid', 'long'].includes(input.term), '目標類型不正確。');
  check(isValidDateStr(input.startDate) && isValidDateStr(input.dueDate), '請選擇正確的開始日與期限。');
  check(input.dueDate >= input.startDate, '期限不能早於開始日。');
  const labels = input.checkpoints.map((c) => c.trim()).filter(Boolean);
  check(labels.length >= 1 && labels.length <= 10, '請設定 1～10 個檢核點，進度會依檢核點計算。');
  labels.forEach((l) => cleanText(l, '檢核點', { max: 100 }));
  const db = clone(db0);
  check(db.players.some((p) => p.id === input.playerId && p.active), '找不到這位球員或球員已停用。');
  db.goals.push({
    id: uid('G'),
    playerId: input.playerId,
    term: input.term,
    content: cleanText(input.content, '目標內容', { required: true, max: 200 }),
    criteria: cleanText(input.criteria, '完成條件', { required: true, max: 300 }),
    startDate: input.startDate,
    dueDate: input.dueDate,
    status: 'active',
    checkpoints: labels.map((label, i) => ({ id: `C${i + 1}`, label, state: 'todo' })),
    createdBy: actor.displayName,
    createdAt: now,
    updatedAt: now,
  });
  if (isCoach) audit(db, actor, '建立球員目標', input.playerId, input.content, now);
  return db;
}

/** 球員只能「申請」完成檢核點，不能自己把進度改成完成 */
export function submitCheckpoint(db0: DemoDB, actor: User | null, goalId: string, cpId: string, now = nowIso()): DemoDB {
  const db = clone(db0);
  const goal = db.goals.find((g) => g.id === goalId);
  check(goal, '找不到這個目標。');
  requireOwnPlayer(actor, 'goal.write.own', goal.playerId);
  check(goal.status === 'active', '這個目標已結束，無法再申請。');
  const cp = goal.checkpoints.find((c) => c.id === cpId);
  check(cp, '找不到檢核點。');
  check(cp.state === 'todo', cp.state === 'submitted' ? '已送出申請，請等待教練確認。' : '此檢核點已核准。');
  cp.state = 'submitted';
  cp.submittedAt = now;
  goal.updatedAt = now;
  return db;
}

export function reviewCheckpoint(db0: DemoDB, actor: User | null, goalId: string, cpId: string, approve: boolean, now = nowIso()): DemoDB {
  requirePermission(actor, 'goal.manage');
  const db = clone(db0);
  const goal = db.goals.find((g) => g.id === goalId);
  check(goal, '找不到這個目標。');
  const cp = goal.checkpoints.find((c) => c.id === cpId);
  check(cp, '找不到檢核點。');
  check(cp.state === 'submitted', '此檢核點目前不需要審核。');
  cp.state = approve ? 'approved' : 'todo';
  cp.reviewedBy = actor.displayName;
  cp.reviewedAt = now;
  if (goal.checkpoints.every((c) => c.state === 'approved')) goal.status = 'completed';
  goal.updatedAt = now;
  audit(db, actor, approve ? '核准目標檢核點' : '退回目標檢核點', goal.id, `${goal.content}／${cp.label}`, now);
  return db;
}

export function setGoalStatus(db0: DemoDB, actor: User | null, goalId: string, status: GoalStatus, now = nowIso()): DemoDB {
  requirePermission(actor, 'goal.manage');
  const db = clone(db0);
  const goal = db.goals.find((g) => g.id === goalId);
  check(goal, '找不到這個目標。');
  goal.status = status;
  goal.updatedAt = now;
  audit(db, actor, '變更目標狀態', goal.id, `${goal.content} → ${status}`, now);
  return db;
}

export function updateGoalSettings(db0: DemoDB, actor: User | null, settings: GoalTermSetting[], now = nowIso()): DemoDB {
  requirePermission(actor, 'goal.manage');
  const db = clone(db0);
  db.goalSettings = db.goalSettings.map((s) => {
    const next = settings.find((x) => x.term === s.term);
    if (!next) return s;
    return {
      term: s.term,
      label: cleanText(next.label, '目標名稱', { required: true, max: 20 }),
      periodHint: cleanText(next.periodHint, '期限說明', { required: true, max: 40 }),
      defaultDays: cleanInt(next.defaultDays, '預設天數', 1, 400),
    };
  });
  audit(db, actor, '調整目標期限設定', 'goalSettings', db.goalSettings.map((s) => `${s.label}${s.defaultDays}天`).join('、'), now);
  return db;
}


// ───────────────────────── 體能檢測 ─────────────────────────

export interface FitnessInput {
  playerId: string;
  date: string;
  item: FitnessItemKey;
  value: number;
  note: string;
}

function validateFitness(input: FitnessInput, now: string): void {
  check(isValidDateStr(input.date), '檢測日期格式不正確。');
  check(input.date <= localToday(now), '檢測日期不能是未來日期。');
  check(FITNESS_ITEMS.some((i) => i.key === input.item), '未知的檢測項目。');
  const item = getFitnessItem(input.item);
  check(Number.isFinite(input.value) && input.value >= item.min && input.value <= item.max, `${item.label}的數值超出合理範圍。`);
  if (item.kind === 'count') check(Number.isInteger(input.value), '次數必須是整數。');
}

export function addFitness(db0: DemoDB, actor: User | null, input: FitnessInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'fitness.write');
  validateFitness(input, now);
  const db = clone(db0);
  check(db.players.some((p) => p.id === input.playerId), '找不到這位球員。');
  const item = getFitnessItem(input.item);
  db.fitness.push({
    id: uid('F'),
    playerId: input.playerId,
    date: input.date,
    item: input.item,
    value: input.value,
    unit: item.unit,
    note: cleanText(input.note, '備註', { max: 200 }),
    createdBy: actor.displayName,
    createdAt: now,
    updatedAt: now,
  });
  audit(db, actor, '新增體能檢測', input.playerId, `${item.label} ${input.value}${item.unit}（${input.date}）`, now);
  return db;
}

export function updateFitness(db0: DemoDB, actor: User | null, id: string, input: FitnessInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'fitness.write');
  validateFitness(input, now);
  const db = clone(db0);
  const rec = db.fitness.find((f) => f.id === id);
  check(rec, '找不到這筆檢測紀錄。');
  const before = `${rec.value}${rec.unit}`;
  const item = getFitnessItem(input.item);
  Object.assign(rec, { date: input.date, item: input.item, value: input.value, unit: item.unit, note: cleanText(input.note, '備註', { max: 200 }), updatedAt: now });
  audit(db, actor, '修改體能檢測', rec.playerId, `${item.label}：${before} → ${input.value}${item.unit}`, now);
  return db;
}

export function deleteFitness(db0: DemoDB, actor: User | null, id: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'fitness.write');
  const db = clone(db0);
  const rec = db.fitness.find((f) => f.id === id);
  check(rec, '找不到這筆檢測紀錄。');
  db.fitness = db.fitness.filter((f) => f.id !== id);
  audit(db, actor, '刪除體能檢測', rec.playerId, `${getFitnessItem(rec.item).label} ${rec.value}${rec.unit}（${rec.date}）`, now);
  return db;
}

// ───────────────────────── 任務與獎勵 ─────────────────────────

export function periodKeyFor(task: Task, today: string): string {
  if (task.repeat === 'daily') return today;
  if (task.repeat === 'weekly') return isoWeekKey(today);
  return 'ONCE';
}

export function currentCompletion(db: DemoDB, task: Task, playerId: string, today: string) {
  const key = periodKeyFor(task, today);
  const list = db.completions.filter((c) => c.taskId === task.id && c.playerId === playerId && c.periodKey === key);
  return list.find((c) => c.status !== 'rejected') ?? list[list.length - 1];
}

/** 回報任務：同一期間只能有一筆有效回報，避免重複領獎 */
export function submitTask(db0: DemoDB, actor: User | null, taskId: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  const playerId = actor.playerId;
  check(playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  const task = db.tasks.find((t) => t.id === taskId);
  check(task && task.active, '此任務目前未開放。');
  const today = localToday(now);
  const key = periodKeyFor(task, today);
  const dup = db.completions.some((c) => c.taskId === taskId && c.playerId === playerId && c.periodKey === key && c.status !== 'rejected');
  check(!dup, '這個任務在本期已經回報過了，不能重複提交。');

  let status: 'submitted' | 'approved' = 'submitted';
  if (task.verify === 'note_today') {
    check(db.notes.some((n) => n.playerId === playerId && n.date === today && n.training.trim()), '系統沒有找到你今天的棒球筆記，請先完成今日筆記。');
    status = 'approved';
  } else if (task.verify === 'quiz_week') {
    const week = isoWeekKey(today);
    check(db.quizPasses.some((q) => q.playerId === playerId && isoWeekKey(q.date) === week), '本週還沒有通過防護知識測驗，請先到防護知識庫完成測驗。');
    status = 'approved';
  }
  db.completions.push({ id: uid('TC'), taskId, playerId, periodKey: key, status, submittedAt: now, ...(status === 'approved' ? { reviewedBy: '系統檢查', reviewedAt: now } : {}) });
  return db;
}

export function reviewCompletion(db0: DemoDB, actor: User | null, completionId: string, approve: boolean, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.manage');
  const db = clone(db0);
  const c = db.completions.find((x) => x.id === completionId);
  check(c, '找不到這筆任務回報。');
  check(c.status === 'submitted', '這筆回報已處理過。');
  c.status = approve ? 'approved' : 'rejected';
  c.reviewedBy = actor.displayName;
  c.reviewedAt = now;
  const task = db.tasks.find((t) => t.id === c.taskId);
  audit(db, actor, approve ? '核准任務' : '退回任務', c.playerId, task?.title ?? c.taskId, now);
  return db;
}

function grantExpToPartner(db: DemoDB, playerId: string, exp: number, reason: string, now: string): void {
  if (exp <= 0) return;
  const pm = db.playerMonsters.find((m) => m.playerId === playerId && m.partner);
  check(pm, '請先到怪獸訓練中心選擇你的初始夥伴，才能領取經驗值。');
  const r = applyExp(pm.level, pm.exp, exp);
  pm.level = r.level;
  pm.exp = r.exp;
  db.monsterProgress.unshift({ id: uid('MP'), playerId, playerMonsterId: pm.id, expGain: exp, levelAfter: r.level, reason, at: now });
}

/** 領取獎勵：只有「已核准且未領取」可以領，領過就不能再領 */
export function claimReward(db0: DemoDB, actor: User | null, completionId: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  const db = clone(db0);
  const c = db.completions.find((x) => x.id === completionId);
  check(c, '找不到這筆任務紀錄。');
  check(c.playerId === actor.playerId, '只能領取自己的獎勵。');
  check(c.status !== 'claimed', '這個獎勵已經領取過了，不能重複領取。');
  check(c.status === 'approved', '任務尚未通過確認，還不能領取獎勵。');
  const task = db.tasks.find((t) => t.id === c.taskId);
  check(task, '找不到任務設定。');
  grantExpToPartner(db, c.playerId, task.expReward, `任務獎勵：${task.title}`, now);
  const w = getWallet(db, c.playerId);
  w.points += task.pointReward;
  w.balls += task.ballReward;
  c.status = 'claimed';
  c.claimedAt = now;
  db.rewardLogs.unshift({ id: uid('RL'), playerId: c.playerId, source: '任務', detail: task.title, exp: task.expReward, points: task.pointReward, balls: task.ballReward, at: now });
  return db;
}

// ───────────────────────── 怪獸 ─────────────────────────

export function chooseStarter(db0: DemoDB, actor: User | null, monsterId: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  const playerId = actor.playerId;
  check(playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  check(!db.playerMonsters.some((m) => m.playerId === playerId), '你已經有夥伴了，初始夥伴只能選一次。');
  const mon = db.monsters.find((m) => m.id === monsterId && m.isStarter);
  check(mon, '這隻怪獸不是可選的初始夥伴。');
  db.playerMonsters.push({ id: uid('PM'), playerId, monsterId, nickname: mon.name, level: 1, exp: 0, partner: true, obtainedAt: now, obtainedBy: 'starter' });
  const w = getWallet(db, playerId);
  if (!w.seenMonsterIds.includes(monsterId)) w.seenMonsterIds.push(monsterId);
  db.rewardLogs.unshift({ id: uid('RL'), playerId, source: '初始夥伴', detail: `與 ${mon.name} 成為夥伴`, exp: 0, points: 0, balls: 0, at: now });
  return db;
}

export function setPartner(db0: DemoDB, actor: User | null, pmId: string): DemoDB {
  requirePermission(actor, 'game.play');
  const db = clone(db0);
  const pm = db.playerMonsters.find((m) => m.id === pmId);
  check(pm && pm.playerId === actor.playerId, '只能設定自己的怪獸。');
  db.playerMonsters.forEach((m) => {
    if (m.playerId === pm.playerId) m.partner = m.id === pmId;
  });
  return db;
}

export function trainMonster(db0: DemoDB, actor: User | null, pmId: string, planId: TrainPlanId, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  const db = clone(db0);
  const pm = db.playerMonsters.find((m) => m.id === pmId);
  check(pm && pm.playerId === actor.playerId, '只能訓練自己的怪獸。');
  const plan = TRAIN_PLANS.find((p) => p.id === planId);
  check(plan, '訓練方式不正確。');
  const w = getWallet(db, pm.playerId);
  check(w.points >= plan.cost, `點數不足，需要 ${plan.cost} 點（目前 ${w.points} 點）。完成任務可以獲得點數。`);
  w.points -= plan.cost;
  const r = applyExp(pm.level, pm.exp, plan.exp);
  pm.level = r.level;
  pm.exp = r.exp;
  db.monsterProgress.unshift({ id: uid('MP'), playerId: pm.playerId, playerMonsterId: pm.id, expGain: plan.exp, levelAfter: r.level, reason: `${plan.label}（消耗 ${plan.cost} 點）`, at: now });
  return db;
}

/** 每日補給：所有球員每天都能領，不因成績或受傷休養而不同 */
export function claimDailySupply(db0: DemoDB, actor: User | null, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  check(actor.playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  const w = getWallet(db, actor.playerId);
  const today = localToday(now);
  check(w.supplyDate !== today, '今天的補給已經領過了，明天再來吧！');
  w.supplyDate = today;
  w.balls += config.dailySupplyBalls;
  db.rewardLogs.unshift({ id: uid('RL'), playerId: actor.playerId, source: '每日補給', detail: `捕捉球 ×${config.dailySupplyBalls}`, exp: 0, points: 0, balls: config.dailySupplyBalls, at: now });
  return db;
}

export function exploresLeft(w: Wallet | undefined, today: string): number {
  if (!w) return config.dailyExplores;
  return w.exploreDate === today ? Math.max(0, config.dailyExplores - w.exploreCount) : config.dailyExplores;
}

export function explore(db0: DemoDB, actor: User | null, areaId: ExploreAreaId, rng: () => number, now = nowIso()): Outcome<{ monsterId: string }> {
  requirePermission(actor, 'game.play');
  check(actor.playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  const w = getWallet(db, actor.playerId);
  const today = localToday(now);
  check(exploresLeft(w, today) > 0, '今天的探索次數已用完，明天再來探索吧！');
  const mon = pickEncounter(db.monsters, areaId, rng);
  check(mon, '這個區域目前沒有怪獸出沒。');
  if (w.exploreDate !== today) {
    w.exploreDate = today;
    w.exploreCount = 0;
  }
  w.exploreCount += 1;
  if (!w.seenMonsterIds.includes(mon.id)) w.seenMonsterIds.push(mon.id);
  w.encounter = { monsterId: mon.id, areaId, at: now };
  return { db, result: { monsterId: mon.id } };
}

export function leaveEncounter(db0: DemoDB, actor: User | null): DemoDB {
  requirePermission(actor, 'game.play');
  check(actor.playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  getWallet(db, actor.playerId).encounter = null;
  return db;
}

export type CaptureResult = { success: boolean; duplicate: boolean; monsterName: string };

/** 捕捉：必須有遭遇中的怪獸，消耗 1 顆捕捉球（捕捉球只能從任務與每日補給取得，無法用金錢購買） */
export function capture(db0: DemoDB, actor: User | null, rng: () => number, now = nowIso()): Outcome<CaptureResult> {
  requirePermission(actor, 'game.play');
  const playerId = actor.playerId;
  check(playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  const w = getWallet(db, playerId);
  check(w.encounter, '目前沒有遭遇中的怪獸。');
  check(w.balls >= 1, '捕捉球不足。可以領取每日補給或完成任務來獲得捕捉球。');
  const mon = db.monsters.find((m) => m.id === w.encounter?.monsterId);
  check(mon, '怪獸資料不存在。');
  w.balls -= 1;
  const success = rng() < mon.catchRate;
  let duplicate = false;
  if (success) {
    w.encounter = null;
    duplicate = db.playerMonsters.some((m) => m.playerId === playerId && m.monsterId === mon.id);
    if (duplicate) {
      w.points += 15;
      db.rewardLogs.unshift({ id: uid('RL'), playerId, source: '捕捉', detail: `再次捕捉 ${mon.name}，轉換為 15 點`, exp: 0, points: 15, balls: 0, at: now });
    } else {
      const hasPartner = db.playerMonsters.some((m) => m.playerId === playerId && m.partner);
      db.playerMonsters.push({ id: uid('PM'), playerId, monsterId: mon.id, nickname: mon.name, level: 1, exp: 0, partner: !hasPartner, obtainedAt: now, obtainedBy: 'capture' });
      db.rewardLogs.unshift({ id: uid('RL'), playerId, source: '捕捉', detail: `成功捕捉 ${mon.name}`, exp: 0, points: 0, balls: 0, at: now });
    }
  }
  return { db, result: { success, duplicate, monsterName: mon.name } };
}

export type EvolveResult = { from: string; to: string; toId: string };

/** 進化：達到該怪獸設定的等級才能進化，等級與經驗值保留 */
export function evolveMonster(db0: DemoDB, actor: User | null, pmId: string, now = nowIso()): Outcome<EvolveResult> {
  requirePermission(actor, 'game.play');
  const db = clone(db0);
  const pm = db.playerMonsters.find((m) => m.id === pmId);
  check(pm && pm.playerId === actor.playerId, '只能讓自己的怪獸進化。');
  const mon = db.monsters.find((m) => m.id === pm.monsterId);
  check(mon, '怪獸資料不存在。');
  check(mon.evolvesTo && mon.evolveLevel, `${mon.name} 已經是最終型態，無法再進化。`);
  check(pm.level >= mon.evolveLevel, `${pm.nickname} 需要達到 Lv.${mon.evolveLevel} 才能進化（目前 Lv.${pm.level}）。`);
  const next = db.monsters.find((m) => m.id === mon.evolvesTo);
  check(next, '找不到進化後的怪獸資料。');
  if (pm.nickname === mon.name) pm.nickname = next.name;
  pm.monsterId = next.id;
  const w = getWallet(db, pm.playerId);
  if (!w.seenMonsterIds.includes(next.id)) w.seenMonsterIds.push(next.id);
  db.monsterProgress.unshift({ id: uid('MP'), playerId: pm.playerId, playerMonsterId: pm.id, expGain: 0, levelAfter: pm.level, reason: `進化：${mon.name} → ${next.name}`, at: now });
  db.rewardLogs.unshift({ id: uid('RL'), playerId: pm.playerId, source: '進化', detail: `${mon.name} 進化成 ${next.name}`, exp: 0, points: 0, balls: 0, at: now });
  return { db, result: { from: mon.name, to: next.name, toId: next.id } };
}

export function recordQuizPass(db0: DemoDB, actor: User | null, articleId: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.play');
  check(actor.playerId, '此帳號沒有對應的球員資料。');
  const db = clone(db0);
  check(db.articles.some((a) => a.id === articleId && a.status === 'published'), '找不到這篇文章。');
  const today = localToday(now);
  if (!db.quizPasses.some((q) => q.playerId === actor.playerId && q.articleId === articleId && q.date === today)) {
    db.quizPasses.push({ id: uid('QP'), playerId: actor.playerId, articleId, date: today, at: now });
  }
  return db;
}

// ───────────────────────── 管理後台 ─────────────────────────

export interface PlayerInput {
  id?: string;
  name: string;
  number: string;
  grade: string;
  position: string;
}

export function upsertPlayer(db0: DemoDB, actor: User | null, input: PlayerInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'users.manage');
  const fields = {
    name: cleanText(input.name, '姓名', { required: true, max: 30 }),
    number: cleanText(input.number, '背號', { max: 4 }),
    grade: cleanText(input.grade, '年級', { max: 10 }),
    position: cleanText(input.position, '守備位置', { max: 20 }),
  };
  const db = clone(db0);
  if (input.id) {
    const p = db.players.find((x) => x.id === input.id);
    check(p, '找不到這位球員。');
    Object.assign(p, fields);
    audit(db, actor, '修改球員資料', p.id, fields.name, now);
  } else {
    const next = db.players.reduce((max, p) => Math.max(max, Number(p.id.replace(/\D/g, '')) || 0), 0) + 1;
    const player: Player = { id: `P${String(next).padStart(3, '0')}`, ...fields, active: true, createdAt: now };
    db.players.push(player);
    db.wallets.push({ playerId: player.id, points: 0, balls: 0, exploreDate: '', exploreCount: 0, supplyDate: '', seenMonsterIds: [], encounter: null });
    audit(db, actor, '新增球員', player.id, fields.name, now);
  }
  return db;
}

export function setPlayerActive(db0: DemoDB, actor: User | null, playerId: string, active: boolean, now = nowIso()): DemoDB {
  requirePermission(actor, 'users.manage');
  const db = clone(db0);
  const p = db.players.find((x) => x.id === playerId);
  check(p, '找不到這位球員。');
  p.active = active;
  db.users.forEach((u) => {
    if (u.role === 'player' && u.playerId === playerId) u.active = active;
  });
  audit(db, actor, active ? '啟用球員' : '停用球員', p.id, p.name, now);
  return db;
}

export interface UserInput {
  id?: string;
  displayName: string;
  role: Role;
  playerId?: string;
  childPlayerIds: string[];
}

export function upsertUser(db0: DemoDB, actor: User | null, input: UserInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'users.manage');
  const displayName = cleanText(input.displayName, '顯示名稱', { required: true, max: 30 });
  const db = clone(db0);
  if (input.role === 'player') check(input.playerId && db.players.some((p) => p.id === input.playerId), '球員帳號必須對應一位球員。');
  if (input.role === 'parent') check(input.childPlayerIds.length > 0, '家長帳號至少要對應一位子女。');
  const shaped = {
    displayName,
    role: input.role,
    playerId: input.role === 'player' ? input.playerId : undefined,
    childPlayerIds: input.role === 'parent' ? input.childPlayerIds : [],
  };
  if (input.id) {
    const u = db.users.find((x) => x.id === input.id);
    check(u, '找不到這個帳號。');
    if (u.role === 'coach' && input.role !== 'coach') {
      check(db.users.filter((x) => x.role === 'coach' && x.active && x.id !== u.id).length > 0, '至少要保留一位啟用中的教練，避免無人可以管理。');
    }
    Object.assign(u, shaped);
    audit(db, actor, '修改帳號角色', u.id, `${displayName}（${input.role}）`, now);
  } else {
    const user: User = { id: uid('U'), ...shaped, active: true, createdAt: now };
    db.users.push(user);
    audit(db, actor, '新增帳號', user.id, `${displayName}（${input.role}）`, now);
  }
  return db;
}

export function setUserActive(db0: DemoDB, actor: User | null, userId: string, active: boolean, now = nowIso()): DemoDB {
  requirePermission(actor, 'users.manage');
  const db = clone(db0);
  const u = db.users.find((x) => x.id === userId);
  check(u, '找不到這個帳號。');
  check(u.id !== actor.id, '不能停用自己的帳號。');
  u.active = active;
  audit(db, actor, active ? '啟用帳號' : '停用帳號', u.id, u.displayName, now);
  return db;
}

export type TaskInput = Omit<Task, 'id' | 'active'> & { id?: string };

export function upsertTask(db0: DemoDB, actor: User | null, input: TaskInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.manage');
  const fields = {
    title: cleanText(input.title, '任務名稱', { required: true, max: 40 }),
    description: cleanText(input.description, '任務說明', { max: 200 }),
    category: input.category,
    repeat: input.repeat,
    verify: input.verify,
    expReward: cleanInt(input.expReward, '經驗值', 0, 500),
    pointReward: cleanInt(input.pointReward, '點數', 0, 500),
    ballReward: cleanInt(input.ballReward, '捕捉球', 0, 10),
  };
  const db = clone(db0);
  if (input.id) {
    const t = db.tasks.find((x) => x.id === input.id);
    check(t, '找不到這個任務。');
    Object.assign(t, fields);
    audit(db, actor, '修改任務與獎勵', t.id, `${fields.title}（經驗 ${fields.expReward}／點數 ${fields.pointReward}／球 ${fields.ballReward}）`, now);
  } else {
    const t: Task = { id: uid('T'), ...fields, active: true };
    db.tasks.push(t);
    audit(db, actor, '新增任務', t.id, fields.title, now);
  }
  return db;
}

export function setTaskActive(db0: DemoDB, actor: User | null, taskId: string, active: boolean, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.manage');
  const db = clone(db0);
  const t = db.tasks.find((x) => x.id === taskId);
  check(t, '找不到這個任務。');
  t.active = active;
  audit(db, actor, active ? '開放任務' : '關閉任務', t.id, t.title, now);
  return db;
}

export interface MonsterEdit {
  name: string;
  description: string;
  catchRate: number;
  inWild: boolean;
  evolveLevel?: number;
}

export function updateMonster(db0: DemoDB, actor: User | null, monsterId: string, input: MonsterEdit, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.manage');
  check(input.catchRate >= 0.05 && input.catchRate <= 0.95, '捕捉率必須介於 5% 到 95%。');
  const db = clone(db0);
  const m = db.monsters.find((x) => x.id === monsterId);
  check(m, '找不到這隻怪獸。');
  m.name = cleanText(input.name, '怪獸名稱', { required: true, max: 12 });
  m.description = cleanText(input.description, '圖鑑說明', { required: true, max: 120 });
  m.catchRate = Math.round(input.catchRate * 100) / 100;
  m.inWild = input.inWild;
  if (m.evolvesTo && input.evolveLevel !== undefined) m.evolveLevel = cleanInt(input.evolveLevel, '進化等級', 2, MAX_LEVEL);
  audit(db, actor, '修改怪獸資料', m.id, `${m.name}（捕捉率 ${Math.round(m.catchRate * 100)}%${m.evolveLevel ? `、Lv.${m.evolveLevel} 進化` : ''}）`, now);
  return db;
}

export function grantExp(db0: DemoDB, actor: User | null, pmId: string, amount: number, reason: string, now = nowIso()): DemoDB {
  requirePermission(actor, 'game.manage');
  cleanInt(amount, '經驗值', 1, 500);
  const why = cleanText(reason, '發放原因', { required: true, max: 60 });
  const db = clone(db0);
  const pm = db.playerMonsters.find((m) => m.id === pmId);
  check(pm, '找不到這隻怪獸。');
  const r = applyExp(pm.level, pm.exp, amount);
  pm.level = r.level;
  pm.exp = r.exp;
  db.monsterProgress.unshift({ id: uid('MP'), playerId: pm.playerId, playerMonsterId: pm.id, expGain: amount, levelAfter: r.level, reason: `教練發放：${why}`, at: now });
  db.rewardLogs.unshift({ id: uid('RL'), playerId: pm.playerId, source: '教練發放', detail: why, exp: amount, points: 0, balls: 0, at: now });
  audit(db, actor, '發放經驗值', pm.playerId, `${pm.nickname} +${amount}（${why}）`, now);
  return db;
}

export interface RuleEdit {
  title: string;
  content: string;
  category: string;
  isAnnouncement: boolean;
  needsCoachReview: boolean;
  reviewNote: string;
}

export function updateRule(db0: DemoDB, actor: User | null, ruleId: string, input: RuleEdit, now = nowIso()): DemoDB {
  requirePermission(actor, 'rules.edit');
  const db = clone(db0);
  const r = db.rules.find((x) => x.id === ruleId);
  check(r, '找不到這條規章。');
  r.title = cleanText(input.title, '標題', { required: true, max: 40 });
  r.content = cleanText(input.content, '規章內容', { required: true, max: 1000 });
  r.category = cleanText(input.category, '分類', { required: true, max: 20 });
  r.isAnnouncement = input.isAnnouncement;
  r.needsCoachReview = input.needsCoachReview;
  r.reviewNote = cleanText(input.reviewNote, '確認備註', { max: 200 });
  r.version += 1;
  r.updatedAt = now;
  r.updatedBy = actor.displayName;
  audit(db, actor, '修改球隊規章', r.id, `第 ${r.no} 條 → 第 ${r.version} 版`, now);
  return db;
}

export type ArticleInput = Omit<KnowledgeArticle, 'id' | 'updatedAt' | 'status'> & { id?: string };

export function upsertArticle(db0: DemoDB, actor: User | null, input: ArticleInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'knowledge.edit');
  check(input.audience.length > 0, '請至少選擇一個適用對象。');
  const lines = (arr: string[], field: string) => arr.map((s) => s.trim()).filter(Boolean).map((s) => cleanText(s, field, { max: 300 }));
  const fields = {
    title: cleanText(input.title, '標題', { required: true, max: 60 }),
    category: input.category,
    audience: input.audience,
    summary: cleanText(input.summary, '內容摘要', { required: true, max: 300 }),
    details: lines(input.details, '詳細說明'),
    cautions: lines(input.cautions, '注意事項'),
    sources: lines(input.sources, '參考來源'),
    reviewed: input.reviewed,
    quiz: input.quiz,
  };
  check(fields.details.length > 0, '請至少填寫一段詳細說明。');
  check(fields.sources.length > 0, '健康與防護內容必須註明參考來源。');
  const db = clone(db0);
  const today = localToday(now);
  if (input.id) {
    const a = db.articles.find((x) => x.id === input.id);
    check(a, '找不到這篇文章。');
    Object.assign(a, fields, { updatedAt: today });
    audit(db, actor, '修改防護知識', a.id, a.title, now);
  } else {
    const a: KnowledgeArticle = { id: uid('K'), ...fields, updatedAt: today, status: 'draft' };
    db.articles.push(a);
    audit(db, actor, '新增防護知識（草稿）', a.id, a.title, now);
  }
  return db;
}

export function setArticleStatus(db0: DemoDB, actor: User | null, id: string, status: PublishStatus, now = nowIso()): DemoDB {
  requirePermission(actor, 'knowledge.edit');
  const db = clone(db0);
  const a = db.articles.find((x) => x.id === id);
  check(a, '找不到這篇文章。');
  a.status = status;
  audit(db, actor, status === 'published' ? '發布防護知識' : status === 'archived' ? '下架防護知識' : '防護知識改為草稿', a.id, a.title, now);
  return db;
}

export type AnnouncementInput = Pick<Announcement, 'title' | 'body' | 'audience' | 'pinned'> & { id?: string };

export function upsertAnnouncement(db0: DemoDB, actor: User | null, input: AnnouncementInput, now = nowIso()): DemoDB {
  requirePermission(actor, 'announcement.edit');
  check(input.audience.length > 0, '請至少選擇一個可閱讀的對象。');
  const fields = {
    title: cleanText(input.title, '公告標題', { required: true, max: 60 }),
    body: cleanText(input.body, '公告內容', { required: true, max: 2000 }),
    audience: input.audience,
    pinned: input.pinned,
  };
  const db = clone(db0);
  if (input.id) {
    const a = db.announcements.find((x) => x.id === input.id);
    check(a, '找不到這則公告。');
    Object.assign(a, fields, { updatedAt: now });
    audit(db, actor, '修改公告', a.id, a.title, now);
  } else {
    const a: Announcement = { id: uid('A'), ...fields, status: 'draft', createdBy: actor.displayName, updatedAt: now };
    db.announcements.push(a);
    audit(db, actor, '新增公告（草稿）', a.id, a.title, now);
  }
  return db;
}

export function setAnnouncementStatus(db0: DemoDB, actor: User | null, id: string, status: PublishStatus, now = nowIso()): DemoDB {
  requirePermission(actor, 'announcement.edit');
  const db = clone(db0);
  const a = db.announcements.find((x) => x.id === id);
  check(a, '找不到這則公告。');
  a.status = status;
  if (status === 'published') a.publishedAt = now;
  a.updatedAt = now;
  audit(db, actor, status === 'published' ? '發布公告' : status === 'archived' ? '下架公告' : '公告改為草稿', a.id, a.title, now);
  return db;
}

export function resolveSyncError(db0: DemoDB, actor: User | null, id: string): DemoDB {
  requirePermission(actor, 'admin.access');
  const db = clone(db0);
  const e = db.syncErrors.find((x) => x.id === id);
  check(e, '找不到這筆錯誤紀錄。');
  e.resolved = true;
  return db;
}
