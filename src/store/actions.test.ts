import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import type { DemoDB, User } from '../types';
import { todayStr } from '../lib/date';
import {
  addFitness,
  capture,
  chooseStarter,
  claimDailySupply,
  claimReward,
  createGoal,
  evolveMonster,
  explore,
  updateMonster,
  reviewCheckpoint,
  saveNote,
  submitCheckpoint,
  submitTask,
  updateRule,
  type NoteInput,
} from './actions';

const NOW = new Date().toISOString();
const TODAY = todayStr(new Date(NOW));

function setup() {
  const db = createSeed(new Date(NOW));
  const u = (id: string) => db.users.find((x) => x.id === id) as User;
  return { db, coach: u('U-C01'), p1: u('U-P001'), p2: u('U-P002'), p3: u('U-P003'), parent: u('U-F001') };
}

const note = (playerId: string, date = TODAY): NoteInput => ({
  playerId, date, training: '傳接球', learned: '', improve: '', tomorrowPrep: '', shortGoal: '', midGoal: '', longGoal: '', selfChecks: { onTime: true },
});

describe('規章', () => {
  it('完整建立 17 條，第 3、10、13 條標示待教練確認', () => {
    const { db } = setup();
    expect(db.rules).toHaveLength(17);
    expect(db.rules.filter((r) => r.needsCoachReview).map((r) => r.no)).toEqual([3, 10, 13]);
    expect(db.rules.every((r) => r.content.length > 0 && !r.content.includes('尚未輸入'))).toBe(true);
    expect(db.rules[0].content).toBe('進出任何球場，需要向球場敬禮');
    expect(db.rules[16].content).toBe('不抽菸不喝酒不打架不鬧事，在校代表棒球隊，校外代表學校');
  });
  it('只有教練能編輯，編輯後版本 +1', () => {
    const { db, coach, p1 } = setup();
    const edit = { title: '第 1 條', content: '測試內容', category: '其他', isAnnouncement: false, needsCoachReview: false, reviewNote: '' };
    expect(() => updateRule(db, p1, 'R01', edit, NOW)).toThrow('權限不足');
    const next = updateRule(db, coach, 'R01', edit, NOW);
    expect(next.rules.find((r) => r.id === 'R01')?.version).toBe(2);
    expect(next.auditLogs[0].action).toBe('修改球隊規章');
  });
});

describe('每日筆記', () => {
  it('同一球員同一天只保留一筆主紀錄', () => {
    const { db, p1 } = setup();
    let next = saveNote(db, p1, note('P001'), NOW);
    next = saveNote(next, p1, { ...note('P001'), training: '打擊練習' }, NOW);
    const today = next.notes.filter((n) => n.playerId === 'P001' && n.date === TODAY);
    expect(today).toHaveLength(1);
    expect(today[0].training).toBe('打擊練習');
  });
  it('不能寫別人的筆記，必填欄位不可空白', () => {
    const { db, p1, p2 } = setup();
    expect(() => saveNote(db, p2, note('P001'), NOW)).toThrow('只能操作自己的資料');
    expect(() => saveNote(db, p1, { ...note('P001'), training: '  ' }, NOW)).toThrow('當日訓練內容');
  });
  it('家長不能寫筆記', () => {
    const { db, parent } = setup();
    expect(() => saveNote(db, parent, note('P001'), NOW)).toThrow('權限不足');
  });
});

describe('目標進度', () => {
  it('球員只能申請，教練核准後才計入進度', () => {
    const { db, p1, coach } = setup();
    let next = createGoal(db, p1, { playerId: 'P001', term: 'short', content: '測試', criteria: '條件', startDate: TODAY, dueDate: TODAY, checkpoints: ['A'] }, NOW);
    const goal = next.goals[next.goals.length - 1];
    next = submitCheckpoint(next, p1, goal.id, 'C1', NOW);
    expect(next.goals.find((g) => g.id === goal.id)?.checkpoints[0].state).toBe('submitted');
    expect(() => reviewCheckpoint(next, p1, goal.id, 'C1', true, NOW)).toThrow('權限不足');
    next = reviewCheckpoint(next, coach, goal.id, 'C1', true, NOW);
    const done = next.goals.find((g) => g.id === goal.id);
    expect(done?.checkpoints[0].state).toBe('approved');
    expect(done?.status).toBe('completed');
  });
});

describe('體能檢測', () => {
  it('只有教練能新增，且會驗證數值範圍', () => {
    const { db, coach, p1 } = setup();
    const input = { playerId: 'P003', date: TODAY, item: 'run150' as const, value: 22.5, note: '' };
    expect(() => addFitness(db, p1, input, NOW)).toThrow('權限不足');
    expect(() => addFitness(db, coach, { ...input, value: 99 }, NOW)).toThrow('超出合理範圍');
    const next = addFitness(db, coach, input, NOW);
    expect(next.fitness.filter((f) => f.playerId === 'P003')).toHaveLength(1);
  });
});

describe('任務獎勵防重複', () => {
  it('同一期間不能重複提交，也不能重複領獎', () => {
    const { db, p1 } = setup();
    let next: DemoDB = saveNote(db, p1, note('P001'), NOW);
    next = submitTask(next, p1, 'T01', NOW);
    expect(() => submitTask(next, p1, 'T01', NOW)).toThrow('不能重複提交');
    const c = next.completions[next.completions.length - 1];
    expect(c.status).toBe('approved');
    const pointsBefore = next.wallets.find((w) => w.playerId === 'P001')!.points;
    next = claimReward(next, p1, c.id, NOW);
    expect(next.wallets.find((w) => w.playerId === 'P001')!.points).toBe(pointsBefore + 10);
    expect(() => claimReward(next, p1, c.id, NOW)).toThrow('不能重複領取');
  });
  it('沒有今日筆記時，系統不讓筆記任務過關', () => {
    const { db, p2 } = setup();
    expect(() => submitTask(db, p2, 'T01', NOW)).toThrow('今天的棒球筆記');
  });
  it('教練確認型任務未核准前不能領獎；不能領別人的獎勵', () => {
    const { db, p1, p2 } = setup();
    const pending = db.completions.find((c) => c.id === 'TC-demo-2')!;
    expect(() => claimReward(db, p1, pending.id, NOW)).toThrow('尚未通過確認');
    expect(() => claimReward(db, p2, pending.id, NOW)).toThrow('只能領取自己的獎勵');
  });
});

describe('怪獸遊戲', () => {
  it('初始夥伴只能選一次', () => {
    const { db, p3 } = setup();
    const next = chooseStarter(db, p3, 'M001', NOW);
    expect(() => chooseStarter(next, p3, 'M003', NOW)).toThrow('只能選一次');
  });
  it('每日補給一天只能領一次，捕捉會消耗捕捉球', () => {
    const { db, p3 } = setup();
    let next = chooseStarter(db, p3, 'M004', NOW);
    next = claimDailySupply(next, p3, NOW);
    expect(() => claimDailySupply(next, p3, NOW)).toThrow('已經領過');
    const ex = explore(next, p3, 'field', () => 0, NOW);
    next = ex.db;
    const res = capture(next, p3, () => 0, NOW);
    expect(res.result.success).toBe(true);
    expect(res.db.wallets.find((w) => w.playerId === 'P003')!.balls).toBe(1);
    expect(res.db.playerMonsters.filter((m) => m.playerId === 'P003')).toHaveLength(2);
  });
  it('每日探索次數用完後不能再探索', () => {
    const { db, p1 } = setup();
    let next = db;
    for (let i = 0; i < 3; i++) next = explore(next, p1, 'riverside', () => 0.5, NOW).db;
    expect(() => explore(next, p1, 'riverside', () => 0.5, NOW)).toThrow('探索次數已用完');
  });
  it('達到等級才能進化，進化後保留等級並登錄圖鑑', () => {
    const { db, p1, p2 } = setup();
    // 示範資料：小安的焰尾狐（M001）已 Lv.6
    const out = evolveMonster(db, p1, 'PM-demo-1', NOW);
    const pm = out.db.playerMonsters.find((m) => m.id === 'PM-demo-1')!;
    expect(pm.monsterId).toBe('M002');
    expect(pm.level).toBe(6);
    expect(out.result.to).toBe('烈焰狐');
    expect(out.db.wallets.find((w) => w.playerId === 'P001')!.seenMonsterIds).toContain('M002');
    // 第 2 階段需要 Lv.14
    expect(() => evolveMonster(out.db, p1, 'PM-demo-1', NOW)).toThrow('Lv.14');
    // 小勇的芽芽獸只有 Lv.2；也不能讓別人的怪獸進化
    expect(() => evolveMonster(db, p2, 'PM-demo-3', NOW)).toThrow('Lv.6');
    expect(() => evolveMonster(db, p2, 'PM-demo-1', NOW)).toThrow('只能讓自己的怪獸進化');
  });
  it('最終型態不能再進化', () => {
    const { db, p1 } = setup();
    db.playerMonsters[0].monsterId = 'M003';
    expect(() => evolveMonster(db, p1, 'PM-demo-1', NOW)).toThrow('最終型態');
  });
  it('教練可以調整進化等級', () => {
    const { db, coach, p2 } = setup();
    const m = db.monsters.find((x) => x.id === 'M004')!;
    const next = updateMonster(db, coach, 'M004', { name: m.name, description: m.description, catchRate: m.catchRate, inWild: true, evolveLevel: 2 }, NOW);
    expect(evolveMonster(next, p2, 'PM-demo-3', NOW).result.to).toBe('綠葉獸');
  });
  it('教練不能代替球員玩遊戲', () => {
    const { db, coach } = setup();
    expect(() => explore(db, coach, 'field', () => 0, NOW)).toThrow('權限不足');
  });
});
