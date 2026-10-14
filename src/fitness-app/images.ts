import type { FitnessItemKey, Player } from '../types';
import { formatDateTime, nowIso } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem } from '../lib/fitness';
import { renderTableImage, type ImageCell } from '../lib/noticeImage';
import { diffText, shortValue, type LatestTable, type RankMode, type RankRow } from './stats';

const footer = () => `東勢國中棒球隊・體能檢測系統・${formatDateTime(nowIso())} 產生`;
const UP = { color: '#1b5e20', bg: '#d7f0d2' };
const DOWN = { color: '#b71c1c', bg: '#fbd5d3' };
const MEDALS = ['🥇', '🥈', '🥉'];

const unitLabel = (key: FitnessItemKey) => {
  const d = getFitnessItem(key);
  return d.kind === 'time' ? '分:秒' : d.unit;
};

function diffCell(key: FitnessItemKey, prev: number | undefined, next: number, diff: number | null): ImageCell {
  if (prev === undefined || diff === null) return { text: '第一次', color: '#9aa0b4' };
  const text = diffText(key, prev, next);
  return diff > 0 ? { text: `▲ ${text}`, ...UP, bold: true } : diff < 0 ? { text: `▼ ${text}`, ...DOWN, bold: true } : { text };
}

/** 個人體能報告：每個項目的最新成績、和上次比、（教練才有）隊內排名 */
export function personalReportImage(player: Player, table: LatestTable, ranks: Partial<Record<FitnessItemKey, { rank: number; total: number }>> | null): HTMLCanvasElement {
  const row = table[player.id] ?? {};
  const tested = FITNESS_ITEMS.filter((d) => row[d.key]);
  const up = tested.filter((d) => (row[d.key]?.diff ?? 0) > 0).length;
  const columns = [
    { label: '項目', width: 240 },
    { label: '最新成績', width: 160 },
    { label: '檢測日期', width: 120 },
    { label: '上一次', width: 140 },
    { label: '和上一次比', width: 180 },
    ...(ranks ? [{ label: '隊內排名', width: 130 }] : []),
  ];
  return renderTableImage({
    title: '💪 個人體能檢測報告',
    subtitle: `${player.name}${player.number ? `（#${player.number}）` : ''}${player.grade ? `・${player.grade}` : ''}`,
    summary: `已檢測 ${tested.length} / ${FITNESS_ITEMS.length} 項${up ? `｜比上一次進步 ${up} 項 👍` : ''}`,
    columns,
    rows: FITNESS_ITEMS.map((d): ImageCell[] => {
      const c = row[d.key];
      const cells: ImageCell[] = [{ text: `${d.label}（${unitLabel(d.key)}）`, bold: true }];
      if (!c) {
        cells.push({ text: '尚未檢測', color: '#9aa0b4' }, { text: '' }, { text: '' }, { text: '' });
        if (ranks) cells.push({ text: '' });
        return cells;
      }
      cells.push(
        { text: shortValue(d.key, c.record.value), bold: true },
        { text: c.record.date.slice(5).replace('-', '/') },
        { text: c.prev ? shortValue(d.key, c.prev.value) : '' },
        diffCell(d.key, c.prev?.value, c.record.value, c.diff),
      );
      if (ranks) {
        const r = ranks[d.key];
        cells.push(r ? { text: `${r.rank <= 3 ? MEDALS[r.rank - 1] + ' ' : ''}${r.rank} / ${r.total}`, bold: r.rank <= 3 } : { text: '' });
      }
      return cells;
    }),
    rowBg: (i) => (row[FITNESS_ITEMS[i].key] ? undefined : '#f0f1f5'),
    footer: footer(),
  });
}

/** 某個項目的排行榜圖片 */
export function rankingImage(item: FitnessItemKey, mode: RankMode, rows: RankRow[], range: string): HTMLCanvasElement {
  const d = getFitnessItem(item);
  return renderTableImage({
    title: `🏅 ${d.label}${mode === 'progress' ? ' 進步排行' : ' 排行榜'}`,
    subtitle: range,
    summary: mode === 'progress' ? '和自己上一次比較，進步越多排越前面' : d.better === 'higher' ? `最新成績，${d.unit}數越高排越前面` : '最新成績，時間越短排越前面',
    columns: [
      { label: '名次', width: 100 },
      { label: '背號', width: 90 },
      { label: '姓名', width: 170 },
      { label: `成績（${unitLabel(item)}）`, width: 180 },
      { label: '日期', width: 110 },
      { label: '和上一次比', width: 190 },
    ],
    rows: rows.map((r): ImageCell[] => [
      { text: r.rank <= 3 ? `${MEDALS[r.rank - 1]} ${r.rank}` : String(r.rank), bold: r.rank <= 3 },
      { text: r.player.number ? `#${r.player.number}` : '' },
      { text: r.player.name, bold: true },
      { text: shortValue(item, r.cell.record.value), bold: mode === 'latest' },
      { text: r.cell.record.date.slice(5).replace('-', '/') },
      diffCell(item, r.cell.prev?.value, r.cell.record.value, r.cell.diff),
    ]),
    rowBg: (i) => (rows[i].rank === 1 ? '#fff8e1' : undefined),
    footer: footer(),
  });
}
