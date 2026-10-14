import { describe, expect, it } from 'vitest';
import type { FitnessItemKey, FitnessTest, Player } from '../types';
import { detailRows, diffText, filterByDate, latestTable, rankItem, summaryRows } from './stats';

const player = (id: string, name: string): Player => ({ id, name, number: id.slice(1), grade: '八年級', position: '', active: true, createdAt: '' });
const rec = (playerId: string, item: FitnessItemKey, date: string, value: number, createdAt = date): FitnessTest => ({
  id: `${playerId}-${item}-${date}-${value}`,
  playerId,
  date,
  item,
  value,
  unit: '',
  note: '',
  createdBy: '教練',
  createdAt,
  updatedAt: createdAt,
});

const players = [player('P1', '小安'), player('P2', '小勇'), player('P3', '小晴')];
const records = [
  rec('P1', 'pushup', '2026-09-01', 20),
  rec('P1', 'pushup', '2026-10-01', 25),
  rec('P2', 'pushup', '2026-10-01', 30),
  rec('P3', 'pushup', '2026-10-01', 25),
  rec('P1', 'run1500', '2026-09-01', 420),
  rec('P1', 'run1500', '2026-10-01', 400),
  rec('P2', 'run1500', '2026-09-01', 380),
  rec('P2', 'run1500', '2026-10-01', 390),
];

describe('體能檢測系統計算', () => {
  it('每位球員每個項目取最新一次，並和上一次比較', () => {
    const t = latestTable(records);
    expect(t.P1.pushup?.record.value).toBe(25);
    expect(t.P1.pushup?.diff).toBe(5);
    expect(t.P1.pushup?.count).toBe(2);
    expect(t.P2.pushup?.diff).toBeNull();
    // 跑步時間越短越好：420 → 400 是進步
    expect(t.P1.run1500?.diff).toBe(20);
    expect(t.P2.run1500?.diff).toBe(-10);
  });

  it('同一天有兩筆時，以後建立的為最新', () => {
    const t = latestTable([rec('P1', 'grip', '2026-10-01', 30, '2026-10-01T08:00'), rec('P1', 'grip', '2026-10-01', 31, '2026-10-01T09:00')]);
    expect(t.P1.grip?.record.value).toBe(31);
  });

  it('排行：成績相同名次相同；跑步時間越短排越前面', () => {
    const t = latestTable(records);
    const push = rankItem(players, t, 'pushup', 'latest');
    expect(push.map((r) => [r.player.name, r.rank])).toEqual([
      ['小勇', 1],
      ['小安', 2],
      ['小晴', 2],
    ]);
    const run = rankItem(players, t, 'run1500', 'latest');
    expect(run.map((r) => r.player.name)).toEqual(['小勇', '小安']);
  });

  it('進步排行只列有兩次以上紀錄的球員', () => {
    const t = latestTable(records);
    const prog = rankItem(players, t, 'run1500', 'progress');
    expect(prog.map((r) => [r.player.name, r.cell.diff])).toEqual([
      ['小安', 20],
      ['小勇', -10],
    ]);
    expect(rankItem(players, t, 'pushup', 'progress').map((r) => r.player.name)).toEqual(['小安']);
  });

  it('日期範圍篩選', () => {
    expect(filterByDate(records, '2026-10-01', '').length).toBe(5);
    expect(filterByDate(records, '', '2026-09-30').length).toBe(3);
  });

  it('和上一次比較的文字', () => {
    expect(diffText('pushup', 20, 25)).toBe('+5 次');
    expect(diffText('grip', 30.5, 29.2)).toBe('−1.3 公斤');
    expect(diffText('run1500', 420, 401.5)).toBe('快 18.50 秒');
    expect(diffText('run150', 22, 22.4)).toBe('慢 0.40 秒');
    expect(diffText('jump', 200, 200)).toBe('持平');
  });

  it('匯出明細與總表', () => {
    const d = detailRows(records, players);
    expect(d[0]).toMatchObject({ 日期: '2026-09-01', 姓名: '小安', 項目: '伏地挺身', 成績: 20 });
    expect(d.find((r) => r.項目 === '1500 公尺')?.['成績（顯示）']).toBe('7:00.00');
    const s = summaryRows(players, latestTable(records));
    expect(s[0]).toMatchObject({ 姓名: '小安', '伏地挺身（次）': 25, '伏地挺身 和上次比': '+5 次', '1500 公尺（分:秒）': '6:40.00' });
    expect(s[2]['1500 公尺（分:秒）']).toBe('');
  });
});
