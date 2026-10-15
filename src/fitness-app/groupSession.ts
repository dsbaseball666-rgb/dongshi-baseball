import type { FitnessItemKey } from '../types';
import { getFitnessItem, valueToInput } from '../lib/fitness';

// 團體檢測：一組球員一起測。跑步項目用碼表（同一聲起跑，誰到終點就按誰），其他項目逐一輸入。
// 整個過程存在這台手機的瀏覽器裡，不小心重新整理或關掉畫面，碼表和成績都還在。

export interface GroupSession {
  date: string;
  item: FitnessItemKey;
  playerIds: string[];
  /** 每位球員的成績（和「全隊輸入」一樣是輸入文字，儲存時再檢查） */
  values: Record<string, string>;
  /** 碼表起跑時間（Date.now()）；null 代表還沒起跑 */
  startedAt: number | null;
  /** 第幾組（150 公尺通常分好幾組跑） */
  heat: number;
  /** 每位球員通過終點線的時間（秒）；1500 公尺記圈時一圈一筆 */
  taps: Record<string, number[]>;
  /** 按的順序，用來「撤銷上一下」 */
  tapLog: string[];
  /** 跑道一圈幾公尺；0 代表只按終點、不記圈 */
  trackLength: number;
}

export const STORAGE_KEY = 'dongshi-fitness-group-session';
export const TRACK_LENGTHS = [0, 150, 200, 250, 300, 400];
const DISTANCE: Partial<Record<FitnessItemKey, number>> = { run1500: 1500, run150: 150 };

export const isTimed = (item: FitnessItemKey) => getFitnessItem(item).kind === 'time';

export function newSession(date: string, item: FitnessItemKey, playerIds: string[], trackLength = 0): GroupSession {
  return { date, item, playerIds, values: {}, startedAt: null, heat: 1, taps: {}, tapLog: [], trackLength: item === 'run1500' ? trackLength : 0 };
}

/** 要按幾下才算跑完：不記圈＝1 下；記圈＝經過終點線的次數（例如 400 公尺跑道跑 1500 公尺＝4 下） */
export function tapsNeeded(s: Pick<GroupSession, 'item' | 'trackLength'>): number {
  const dist = DISTANCE[s.item];
  if (!dist || !s.trackLength) return 1;
  return Math.ceil(dist / s.trackLength);
}

/** 碼表目前的秒數 */
export function elapsed(s: Pick<GroupSession, 'startedAt'>, now: number): number {
  return s.startedAt === null ? 0 : Math.max(0, (now - s.startedAt) / 1000);
}

/** 秒數 → 儲存用的輸入文字（四捨五入到百分之一秒） */
export function secondsToInput(item: FitnessItemKey, sec: number): string {
  const v = Math.round(sec * 100) / 100;
  return getFitnessItem(item).kind === 'time' && v >= 60 ? valueToInput(item, v) : v.toFixed(2);
}

export const isFinished = (s: GroupSession, playerId: string) => (s.values[playerId] ?? '').trim() !== '';

/** 按一下某位球員：記一圈；最後一圈就是完成時間 */
export function tap(s: GroupSession, playerId: string, now: number): GroupSession {
  if (s.startedAt === null || isFinished(s, playerId) || !s.playerIds.includes(playerId)) return s;
  const t = Math.round(elapsed(s, now) * 100) / 100;
  const list = [...(s.taps[playerId] ?? []), t];
  const values = list.length >= tapsNeeded(s) ? { ...s.values, [playerId]: secondsToInput(s.item, t) } : s.values;
  return { ...s, taps: { ...s.taps, [playerId]: list }, tapLog: [...s.tapLog, playerId], values };
}

/** 撤銷上一下（按錯人時用） */
export function undoTap(s: GroupSession): GroupSession {
  const pid = s.tapLog[s.tapLog.length - 1];
  if (!pid) return s;
  const list = (s.taps[pid] ?? []).slice(0, -1);
  const values = { ...s.values };
  delete values[pid];
  return { ...s, taps: { ...s.taps, [pid]: list }, tapLog: s.tapLog.slice(0, -1), values };
}

/** 結束這一組：碼表歸零；還沒跑完的人圈數清掉，可以排到下一組 */
export function nextHeat(s: GroupSession): GroupSession {
  const taps: Record<string, number[]> = {};
  for (const pid of s.playerIds) if (isFinished(s, pid)) taps[pid] = s.taps[pid] ?? [];
  return { ...s, startedAt: null, heat: s.heat + 1, taps, tapLog: [] };
}

/** 清掉某位球員的成績（重測） */
export function clearPlayer(s: GroupSession, playerId: string): GroupSession {
  const values = { ...s.values };
  delete values[playerId];
  const taps = { ...s.taps };
  delete taps[playerId];
  return { ...s, values, taps, tapLog: s.tapLog.filter((p) => p !== playerId) };
}

/** 完成名次：依完成時間排序 */
export function finishOrder(s: GroupSession): string[] {
  return s.playerIds
    .filter((p) => isFinished(s, p) && (s.taps[p]?.length ?? 0) > 0)
    .sort((a, b) => s.taps[a][s.taps[a].length - 1] - s.taps[b][s.taps[b].length - 1]);
}

/** 碼表顯示：分:秒.百分秒 */
export function clock(sec: number): string {
  const cs = Math.floor(sec * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export function loadSession(): GroupSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GroupSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: GroupSession | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 無痕模式等情況存不了，仍然可以用，只是重新整理後會不見 */
  }
}
