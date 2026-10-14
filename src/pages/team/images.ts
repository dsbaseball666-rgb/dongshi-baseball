import type { AttendanceStatus, PracticeDay, Player } from '../../types';
import { addDays, formatDateTime, nowIso } from '../../lib/date';
import { renderTableImage, type ImageCell } from '../../lib/noticeImage';
import { ATTENDANCE_STATUSES, PRACTICE_ICONS, PRESENT_STATUSES, shortDate } from '../../sources/team';

const TYPE_COLORS: Record<string, { color: string; bg: string; row?: string }> = {
  練球: { color: '#1b5e20', bg: '#d7f0d2' },
  休息: { color: '#4a4f63', bg: '#e1e4ec', row: '#f0f1f5' },
  比賽: { color: '#8a5300', bg: '#ffe7a3', row: '#fff8e1' },
  其他: { color: '#1f5fb5', bg: '#d9e8fb' },
};

export const STATUS_COLORS: Record<AttendanceStatus, { color: string; bg: string }> = {
  出席: { color: '#1b5e20', bg: '#d7f0d2' },
  遲到: { color: '#8a5300', bg: '#ffe7a3' },
  早退: { color: '#8a5300', bg: '#ffe7a3' },
  事假: { color: '#1f5fb5', bg: '#d9e8fb' },
  病假: { color: '#5b3a9e', bg: '#e8defa' },
  公假: { color: '#4a4f63', bg: '#e1e4ec' },
  缺席: { color: '#b71c1c', bg: '#fbd5d3' },
};

const footer = () => `東勢國中棒球隊・${formatDateTime(nowIso())} 產生`;

/** 一週練球通知圖片 */
export function practiceImage(monday: string, days: PracticeDay[]): HTMLCanvasElement {
  const list = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, d: days.find((x) => x.date === date) };
  });
  const practice = list.filter((x) => x.d?.type === '練球').length;
  const rest = list.filter((x) => x.d?.type === '休息').length;
  const games = list.filter((x) => x.d?.type === '比賽').length;
  return renderTableImage({
    title: '⚾ 一週練球通知',
    subtitle: `${shortDate(monday)} ～ ${shortDate(addDays(monday, 6))}`,
    summary: `練球 ${practice} 天、休息 ${rest} 天${games ? `、比賽 ${games} 天` : ''}`,
    columns: [
      { label: '日期', width: 150 },
      { label: '安排', width: 120 },
      { label: '時間', width: 150 },
      { label: '地點', width: 170 },
      { label: '內容／備註', width: 330 },
    ],
    rows: list.map(({ date, d }): ImageCell[] => {
      if (!d) return [{ text: shortDate(date), bold: true }, { text: '未安排', color: '#9aa0b4' }, { text: '' }, { text: '' }, { text: '' }];
      const c = TYPE_COLORS[d.type];
      const time = d.startTime ? `${d.startTime}${d.endTime ? '–' + d.endTime : ''}` : '';
      const detail = [d.content, d.note && `※ ${d.note}`].filter(Boolean).join('\n');
      return [
        { text: shortDate(date), bold: true },
        { text: `${PRACTICE_ICONS[d.type]} ${d.type}`, color: c.color, bg: c.bg, bold: true },
        { text: d.type === '休息' ? '' : time },
        { text: d.location },
        { text: detail },
      ];
    }),
    rowBg: (i) => TYPE_COLORS[list[i].d?.type ?? '']?.row,
    footer: footer(),
  });
}

/** 某一天的出缺席圖片；showReason=false 時不顯示原因（例如病假原因不想公開） */
export function attendanceImage(date: string, players: Player[], records: Record<string, { status: AttendanceStatus | ''; reason: string }>, showReason: boolean): HTMLCanvasElement {
  const marked = players.filter((p) => records[p.id]?.status);
  const counts = ATTENDANCE_STATUSES.map((s) => [s, marked.filter((p) => records[p.id].status === s).length] as const).filter(([, n]) => n > 0);
  const present = marked.filter((p) => PRESENT_STATUSES.includes(records[p.id].status as AttendanceStatus)).length;
  const unmarked = players.length - marked.length;
  const columns = [
    { label: '背號', width: 80 },
    { label: '姓名', width: 170 },
    { label: '狀態', width: 120 },
    ...(showReason ? [{ label: '原因', width: 330 }] : []),
  ];
  return renderTableImage({
    title: '✅ 出缺席紀錄',
    subtitle: shortDate(date),
    summary:
      `應到 ${players.length} 人、實到 ${present} 人` +
      (counts.length ? `｜${counts.map(([s, n]) => `${s} ${n}`).join('、')}` : '') +
      (unmarked ? `｜未點名 ${unmarked}` : ''),
    columns,
    rows: players.map((p): ImageCell[] => {
      const r = records[p.id];
      const status = r?.status ? { text: r.status, ...STATUS_COLORS[r.status], bold: true } : { text: '未點名', color: '#9aa0b4' };
      const row: ImageCell[] = [{ text: p.number ? `#${p.number}` : '' }, { text: p.name, bold: true }, status];
      if (showReason) row.push({ text: r?.status && r.status !== '出席' ? r.reason : '' });
      return row;
    }),
    rowBg: (i) => {
      const s = records[players[i].id]?.status;
      return s && s !== '出席' ? '#fff8e1' : undefined;
    },
    footer: footer(),
  });
}
