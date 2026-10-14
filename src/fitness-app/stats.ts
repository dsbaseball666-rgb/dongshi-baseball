import type { FitnessItemKey, FitnessTest, Player } from '../types';
import { FITNESS_ITEMS, formatRunTime, getFitnessItem, improvement } from '../lib/fitness';

// 體能檢測系統的計算（純函式，方便測試）：最新成績、進步幅度、排行、匯出

export interface LatestCell {
  record: FitnessTest;
  /** 同一項目的上一次紀錄 */
  prev?: FitnessTest;
  /** 和上一次比較：正數代表進步；沒有上一次為 null */
  diff: number | null;
  /** 這個項目總共測過幾次 */
  count: number;
}

export type LatestTable = Record<string, Partial<Record<FitnessItemKey, LatestCell>>>;

/** 依檢測日期排序（同一天依建立時間） */
export function sortRecords(records: FitnessTest[]): FitnessTest[] {
  return [...records].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** 只留下日期在 from～to 之間的紀錄（空白代表不限） */
export function filterByDate(records: FitnessTest[], from: string, to: string): FitnessTest[] {
  return records.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
}

/** 每位球員、每個項目的最新成績與上一次成績 */
export function latestTable(records: FitnessTest[]): LatestTable {
  const out: LatestTable = {};
  for (const r of sortRecords(records)) {
    const row = (out[r.playerId] ??= {});
    const old = row[r.item];
    row[r.item] = { record: r, prev: old?.record, diff: old ? improvement(r.item, old.record.value, r.value) : null, count: (old?.count ?? 0) + 1 };
  }
  return out;
}

export type RankMode = 'latest' | 'progress';

export interface RankRow {
  player: Player;
  cell: LatestCell;
  /** 名次；成績相同時名次相同（例如 1、2、2、4） */
  rank: number;
}

/** 某個項目的排行：latest＝最新成績；progress＝和上一次比的進步幅度（只列有兩次以上紀錄的球員） */
export function rankItem(players: Player[], table: LatestTable, item: FitnessItemKey, mode: RankMode): RankRow[] {
  const def = getFitnessItem(item);
  const score = (c: LatestCell) => (mode === 'progress' ? (c.diff ?? 0) : def.better === 'higher' ? c.record.value : -c.record.value);
  const list = players
    .map((player) => ({ player, cell: table[player.id]?.[item] }))
    .filter((x): x is { player: Player; cell: LatestCell } => !!x.cell && (mode === 'latest' || x.cell.diff !== null))
    .sort((a, b) => score(b.cell) - score(a.cell) || a.player.name.localeCompare(b.player.name, 'zh-Hant'));
  return list.map((x, i) => {
    let rank = i + 1;
    // 和前一位成績一樣就同名次
    for (let j = i - 1; j >= 0 && score(list[j].cell) === score(x.cell); j--) rank = j + 1;
    return { ...x, rank };
  });
}

/** 簡短顯示成績（表格用）：跑步顯示「分:秒」，其他顯示數值與單位 */
export function shortValue(item: FitnessItemKey, value: number): string {
  const def = getFitnessItem(item);
  if (def.kind === 'time') return formatRunTime(value);
  return `${Math.round(value * 10) / 10} ${def.unit}`;
}

/** 和上一次比較的文字，例如「+3 次」「快 2.10 秒」「持平」 */
export function diffText(item: FitnessItemKey, prev: number, next: number): string {
  const def = getFitnessItem(item);
  const raw = Math.round((next - prev) * 100) / 100;
  if (raw === 0) return '持平';
  if (def.kind === 'time') return `${raw < 0 ? '快' : '慢'} ${Math.abs(raw).toFixed(2)} 秒`;
  return `${raw > 0 ? '+' : '−'}${Math.round(Math.abs(raw) * 10) / 10} ${def.unit}`;
}

const playerLabel = (p: Player | undefined) => p?.name ?? '（已刪除的球員）';

/** 匯出：每一筆紀錄一列 */
export function detailRows(records: FitnessTest[], players: Player[]): Record<string, unknown>[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return sortRecords(records).map((r) => {
    const def = getFitnessItem(r.item);
    const p = byId.get(r.playerId);
    return {
      日期: r.date,
      背號: p?.number ?? '',
      姓名: playerLabel(p),
      年級: p?.grade ?? '',
      項目: def.label,
      成績: r.value,
      單位: def.unit,
      '成績（顯示）': def.kind === 'time' ? formatRunTime(r.value) : r.value,
      備註: r.note,
      建立者: r.createdBy,
    };
  });
}

/** 匯出：每位球員一列，各項目的最新成績 */
export function summaryRows(players: Player[], table: LatestTable): Record<string, unknown>[] {
  return players.map((p) => {
    const row: Record<string, unknown> = { 背號: p.number, 姓名: p.name, 年級: p.grade, 守備位置: p.position };
    for (const def of FITNESS_ITEMS) {
      const c = table[p.id]?.[def.key];
      const unit = def.kind === 'time' ? '分:秒' : def.unit;
      row[`${def.label}（${unit}）`] = c ? (def.kind === 'time' ? formatRunTime(c.record.value) : c.record.value) : '';
      row[`${def.label} 日期`] = c?.record.date ?? '';
      row[`${def.label} 和上次比`] = c?.prev ? diffText(def.key, c.prev.value, c.record.value) : '';
    }
    return row;
  });
}
