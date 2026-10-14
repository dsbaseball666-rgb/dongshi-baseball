import { describe, expect, it } from 'vitest';
import { type GroupSession, clearPlayer, clock, finishOrder, isFinished, newSession, nextHeat, secondsToInput, tap, tapsNeeded, undoTap } from './groupSession';
import { parseFitnessInput } from '../lib/fitness';

const T0 = 1_000_000;
const at = (sec: number) => T0 + sec * 1000;

describe('團體檢測碼表', () => {
  it('要按幾下：不記圈 1 下；400 公尺跑道 4 下、300 公尺 5 下、200 公尺 8 下；150 公尺不記圈', () => {
    expect(tapsNeeded(newSession('2026-10-14', 'run1500', [], 0))).toBe(1);
    expect(tapsNeeded(newSession('2026-10-14', 'run1500', [], 400))).toBe(4);
    expect(tapsNeeded(newSession('2026-10-14', 'run1500', [], 300))).toBe(5);
    expect(tapsNeeded(newSession('2026-10-14', 'run1500', [], 200))).toBe(8);
    expect(tapsNeeded(newSession('2026-10-14', 'run150', [], 400))).toBe(1);
  });

  it('還沒起跑按了沒反應；起跑後按終點記下時間，存成可以儲存的格式', () => {
    let s: GroupSession = newSession('2026-10-14', 'run150', ['A', 'B']);
    expect(tap(s, 'A', at(5))).toBe(s);
    s = { ...s, startedAt: T0 };
    s = tap(s, 'A', at(22.456));
    expect(s.values.A).toBe('22.46');
    expect(parseFitnessInput('run150', s.values.A)).toBe(22.46);
    // 已經跑完的人再按一次不會改時間
    expect(tap(s, 'A', at(30)).values.A).toBe('22.46');
  });

  it('1500 公尺記圈：最後一圈才算完成，時間是「分:秒」', () => {
    let s: GroupSession = { ...newSession('2026-10-14', 'run1500', ['A'], 400), startedAt: T0 };
    s = tap(s, 'A', at(80));
    s = tap(s, 'A', at(180));
    s = tap(s, 'A', at(280));
    expect(isFinished(s, 'A')).toBe(false);
    expect(s.taps.A).toEqual([80, 180, 280]);
    s = tap(s, 'A', at(385.3));
    expect(s.values.A).toBe('6:25.30');
    expect(parseFitnessInput('run1500', s.values.A)).toBe(385.3);
  });

  it('撤銷上一下：按錯人可以取消', () => {
    let s: GroupSession = { ...newSession('2026-10-14', 'run150', ['A', 'B']), startedAt: T0 };
    s = tap(s, 'A', at(21));
    s = tap(s, 'B', at(23));
    s = undoTap(s);
    expect(isFinished(s, 'B')).toBe(false);
    expect(s.values.A).toBe('21.00');
    expect(finishOrder(s)).toEqual(['A']);
  });

  it('下一組：碼表歸零，跑完的成績保留，沒跑完的可以下一組再跑', () => {
    let s: GroupSession = { ...newSession('2026-10-14', 'run150', ['A', 'B']), startedAt: T0 };
    s = tap(s, 'B', at(20));
    s = nextHeat(s);
    expect(s.startedAt).toBeNull();
    expect(s.heat).toBe(2);
    s = { ...s, startedAt: at(100) };
    s = tap(s, 'A', at(124));
    expect(s.values).toEqual({ B: '20.00', A: '24.00' });
    expect(finishOrder(s)).toEqual(['B', 'A']);
  });

  it('重測：清掉某位球員的成績與圈數', () => {
    let s: GroupSession = { ...newSession('2026-10-14', 'run150', ['A']), startedAt: T0 };
    s = clearPlayer(tap(s, 'A', at(20)), 'A');
    expect(isFinished(s, 'A')).toBe(false);
    expect(s.taps.A).toBeUndefined();
  });

  it('碼表顯示與秒數轉換', () => {
    expect(clock(0)).toBe('0:00.00');
    expect(clock(385.299)).toBe('6:25.29');
    expect(secondsToInput('run150', 9.999)).toBe('10.00');
    expect(secondsToInput('run1500', 59.5)).toBe('59.50');
  });
});
