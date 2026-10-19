import type { AttendanceStatus, Game, PracticeDay, Player, Tournament } from '../../types';
import { addDays, formatDateTime, nowIso } from '../../lib/date';
import { renderTableImage, type ImageCell } from '../../lib/noticeImage';
import { loadImage } from '../../lib/photo';
import { ATTENDANCE_STATUSES, jerseyOrder, PRACTICE_ICONS, participantText, PRESENT_STATUSES, shortDate, type PlanInput } from '../../sources/team';

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

/** 一週練球安排圖片（每個時段一列） */
export function planImage(monday: string, sessions: PlanInput[], names: Record<string, string>): HTMLCanvasElement {
  const list = sessions.slice().sort((a, b) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1));
  const days = new Set(list.map((s) => s.date)).size;
  return renderTableImage({
    title: '🗓️ 一週練球安排',
    subtitle: `${shortDate(monday)} ～ ${shortDate(addDays(monday, 6))}`,
    summary: `共 ${days} 天、${list.length} 個時段`,
    columns: [
      { label: '日期', width: 140 },
      { label: '時段', width: 170 },
      { label: '訓練內容', width: 230 },
      { label: '參加人員', width: 260 },
      { label: '地點／備註', width: 200 },
    ],
    rows: list.map((s, i): ImageCell[] => [
      // 同一天的第二個時段起，日期留白（空字串會顯示「—」，所以用全形空白）
      { text: i > 0 && list[i - 1].date === s.date ? '　' : shortDate(s.date), bold: true },
      { text: `${s.startTime}–${s.endTime}${s.slot ? '\n' + s.slot : ''}`, bold: true },
      { text: s.items.join('、') },
      { text: participantText(s.playerIds, names, 12), color: s.playerIds.length === 0 ? '#b71c1c' : undefined, bold: s.playerIds.length === 0 },
      { text: [s.location, s.note && `※ ${s.note}`].filter(Boolean).join('\n') },
    ]),
    // 同一天的時段用同一個底色，方便分辨
    rowBg: (i) => {
      const order = Array.from(new Set(list.map((s) => s.date)));
      return order.indexOf(list[i].date) % 2 ? '#f3f6fb' : '#ffffff';
    },
    footer: footer(),
  });
}

/** 賽事的球員號碼名單圖片（依號碼排，沒號碼的放最後） */
export async function jerseyImage(t: Tournament, players: Player[], names: Record<string, string>, photos: Record<string, string> = {}): Promise<HTMLCanvasElement> {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const ids = t.playerIds.slice().sort((a, b) => {
    const na = t.jerseys[a], nb = t.jerseys[b];
    if (na && nb) return jerseyOrder(na) - jerseyOrder(nb);
    return na ? -1 : nb ? 1 : 0;
  });
  const dates = t.endDate && t.endDate !== t.startDate ? `${shortDate(t.startDate)}～${shortDate(t.endDate)}` : shortDate(t.startDate);
  // 先把大頭照載入（讀不出來的就不放）
  const imgs: Record<string, HTMLImageElement> = {};
  await Promise.all(ids.filter((id) => photos[id]).map((id) => loadImage(photos[id]).then((img) => (imgs[id] = img)).catch(() => undefined)));
  const withPhotos = Object.keys(imgs).length > 0;
  return renderTableImage({
    title: '👕 球員號碼名單',
    subtitle: t.name,
    summary: [dates, t.location && `📍${t.location}`, `共 ${ids.length} 人`].filter(Boolean).join('｜'),
    columns: [
      { label: '號碼', width: 110 },
      ...(withPhotos ? [{ label: '照片', width: 100 }] : []),
      { label: '姓名', width: 220 },
      { label: '年級', width: 130 },
      { label: '守備位置', width: 260 },
    ],
    rows: ids.map((id): ImageCell[] => {
      const p = byId[id];
      const no = t.jerseys[id];
      return [
        no ? { text: no, bold: true, color: '#ffffff', bg: '#23263a' } : { text: '未編號', color: '#9aa0b4' },
        ...(withPhotos ? [imgs[id] ? { text: '', image: imgs[id] } : { text: '' }] : []),
        { text: names[id] ?? p?.name ?? '', bold: true },
        { text: p?.grade ?? '' },
        { text: p?.position ?? '' },
      ];
    }),
    footer: footer(),
  });
}

/** 給家長的行前通知：每場比賽的集合時間、集合地點、出發時間與比賽資訊；賽事備註放在下方「注意事項」 */
export function parentNoticeImage(t: Tournament, games: Game[], today: string): HTMLCanvasElement {
  // 只放還沒比的；都比完了就全部放
  const upcoming = games.filter((g) => g.date >= today);
  const list = (upcoming.length ? upcoming : games).slice().sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  const dates = t.endDate && t.endDate !== t.startDate ? `${shortDate(t.startDate)}～${shortDate(t.endDate)}` : shortDate(t.startDate);
  return renderTableImage({
    title: '📣 比賽行前通知',
    subtitle: t.name,
    summary: [dates, t.location && `📍${t.location}`].filter(Boolean).join('｜'),
    columns: [
      { label: '日期', width: 140 },
      { label: '集合', width: 250 },
      { label: '出發', width: 100 },
      { label: '比賽', width: 230 },
      { label: '場地', width: 200 },
    ],
    rows: list.map((g, i): ImageCell[] => [
      { text: i > 0 && list[i - 1].date === g.date ? '\u3000' : shortDate(g.date), bold: true },
      g.meetTime || g.meetPlace ? { text: [g.meetTime, g.meetPlace].filter(Boolean).join('\n'), bold: true, color: '#b71c1c' } : { text: '' },
      { text: g.departTime, bold: true },
      { text: [g.time && `${g.time} 開打`, `對 ${g.opponent}`, g.side].filter(Boolean).join('\n') },
      { text: g.location },
    ]),
    rowBg: (i) => {
      const order = Array.from(new Set(list.map((g) => g.date)));
      return order.indexOf(list[i].date) % 2 ? '#f3f6fb' : '#ffffff';
    },
    notes: t.note || undefined,
    footer: footer(),
  });
}
