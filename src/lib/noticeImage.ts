// 把表格畫成圖片（PNG），方便傳到 LINE 群組。全部在瀏覽器裡畫，不用上傳到任何地方。

export interface ImageCell {
  text: string;
  /** 放一張照片（例如大頭照），寬 72、高 90，照片會裁切填滿 */
  image?: CanvasImageSource & { width: number; height: number };
  /** 照片的大小（預設寬 72、高 90） */
  imageW?: number;
  imageH?: number;
  color?: string;
  bg?: string;
  bold?: boolean;
}

export interface TableImageSpec {
  title: string;
  subtitle?: string;
  /** 標題下方的一行摘要，例如「出席 20、事假 2」 */
  summary?: string;
  columns: { label: string; width: number }[];
  rows: ImageCell[][];
  /** 每一列的底色（例如休息日用灰色） */
  rowBg?: (index: number) => string | undefined;
  footer?: string;
  /** 表格下方的注意事項（會自動換行） */
  notes?: string;
}

const FONT = "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', sans-serif";
const PAD = 28;
const CELL_PAD = 12;
const FONT_SIZE = 21;
const LINE_H = 30;
const SCALE = 2; // 畫兩倍大，手機上看比較清楚

/** 依寬度換行（中文一個字一個字斷；英數字盡量不從中間斷） */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    const tokens = para.match(/[A-Za-z0-9:：.\-–~～/]+|./gu) ?? [];
    for (const t of tokens) {
      // 右括號、逗號、句號等標點不放在行首，稍微超出一點也接在上一行
      if (ctx.measureText(line + t).width <= maxWidth || line === '' || /^[）)、，。！？」』：；]/.test(t)) {
        line += t;
      } else {
        out.push(line);
        line = t.trimStart();
      }
    }
    out.push(line);
  }
  return out;
}

export function renderTableImage(spec: TableImageSpec): HTMLCanvasElement {
  const tableW = spec.columns.reduce((s, c) => s + c.width, 0);
  const W = tableW + PAD * 2;
  const measure = document.createElement('canvas').getContext('2d')!;
  const font = (size: number, bold = false) => `${bold ? 'bold ' : ''}${size}px ${FONT}`;

  // 先算每一列的高度
  measure.font = font(FONT_SIZE);
  const wrapped = spec.rows.map((row) => row.map((cell, j) => {
    measure.font = font(FONT_SIZE, cell.bold);
    return wrap(measure, cell.text || '—', spec.columns[j].width - CELL_PAD * 2);
  }));
  const rowH = wrapped.map((row, i) => Math.max(...row.map((lines) => lines.length * LINE_H), ...spec.rows[i].map((c) => (c.image ? (c.imageH ?? PHOTO_H) + 4 : 0))) + CELL_PAD * 2 - 8);
  const headH = 104 + (spec.subtitle ? 34 : 0);
  const summaryH = spec.summary ? 52 : 0;
  const theadH = 48;
  const footH = spec.footer ? 52 : 24;
  measure.font = font(20);
  const noteLines = spec.notes ? wrap(measure, spec.notes, tableW - 24) : [];
  const notesH = noteLines.length ? 64 + noteLines.length * 30 : 0;
  const H = headH + summaryH + PAD + theadH + rowH.reduce((s, h) => s + h, 0) + notesH + footH;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';

  // 背景與標題
  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#23263a';
  ctx.fillRect(0, 0, W, headH);
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(0, headH - 8, W, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(32, true);
  ctx.fillText(spec.title, PAD, 30);
  if (spec.subtitle) {
    ctx.font = font(22);
    ctx.fillStyle = '#ffe9a6';
    ctx.fillText(spec.subtitle, PAD, 78);
  }

  let y = headH;
  if (spec.summary) {
    ctx.font = font(21, true);
    ctx.fillStyle = '#23263a';
    ctx.fillText(spec.summary, PAD, y + 18);
    y += summaryH;
  } else y += 12;
  y += PAD - 12;

  // 表頭
  ctx.fillStyle = '#e8ebf2';
  ctx.fillRect(PAD, y, tableW, theadH);
  ctx.fillStyle = '#23263a';
  ctx.font = font(20, true);
  let x = PAD;
  spec.columns.forEach((c) => {
    ctx.fillText(c.label, x + CELL_PAD, y + 13);
    x += c.width;
  });
  y += theadH;

  // 每一列
  spec.rows.forEach((row, i) => {
    const h = rowH[i];
    const bg = spec.rowBg?.(i) ?? (i % 2 ? '#f7f8fb' : '#ffffff');
    ctx.fillStyle = bg;
    ctx.fillRect(PAD, y, tableW, h);
    x = PAD;
    row.forEach((cell, j) => {
      const lines = wrapped[i][j];
      if (cell.image) {
        drawCover(ctx, cell.image, x + CELL_PAD, y + CELL_PAD - 4, cell.imageW ?? PHOTO_W, cell.imageH ?? PHOTO_H);
        x += spec.columns[j].width;
        return;
      }
      ctx.font = font(FONT_SIZE, cell.bold);
      if (cell.bg && cell.text) {
        // 狀態用圓角色塊
        const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
        ctx.fillStyle = cell.bg;
        roundRect(ctx, x + CELL_PAD - 6, y + CELL_PAD - 7, tw + 12, lines.length * LINE_H + 2, 6);
      }
      ctx.fillStyle = cell.text ? cell.color ?? '#23263a' : '#9aa0b4';
      lines.forEach((l, k) => ctx.fillText(l, x + CELL_PAD, y + CELL_PAD - 3 + k * LINE_H));
      x += spec.columns[j].width;
    });
    ctx.strokeStyle = '#d5d9e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + h);
    ctx.lineTo(PAD + tableW, y + h);
    ctx.stroke();
    y += h;
  });
  ctx.strokeStyle = '#23263a';
  ctx.lineWidth = 3;
  ctx.strokeRect(PAD, y - rowH.reduce((s, v) => s + v, 0) - theadH, tableW, rowH.reduce((s, v) => s + v, 0) + theadH);

  if (noteLines.length) {
    y += 20;
    ctx.fillStyle = '#fff4cf';
    ctx.fillRect(PAD, y, tableW, notesH - 20);
    ctx.fillStyle = '#23263a';
    ctx.font = font(20, true);
    ctx.fillText('📌 注意事項', PAD + 12, y + 12);
    ctx.font = font(20);
    noteLines.forEach((l, k) => ctx.fillText(l, PAD + 12, y + 46 + k * 30));
    y += notesH - 20;
  }
  if (spec.footer) {
    ctx.font = font(17);
    ctx.fillStyle = '#5a5f78';
    ctx.fillText(spec.footer, PAD, y + 18);
  }
  return canvas;
}

const PHOTO_W = 72;
const PHOTO_H = 90;

/** 照片裁切成剛好填滿方框（像 CSS 的 object-fit: cover），加上圓角 */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, focusY = 0.5, radius = 6) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * focusY, sw, sh, x, y, w, h);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法產生圖片'))), 'image/png'));
}

/** 手機：叫出分享選單（可以選 LINE）；不支援的話就下載 */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canShareFiles(): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    return !!nav.share && !!nav.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export interface PhotoGridItem {
  label: string;
  image?: CanvasImageSource & { width: number; height: number };
  /** 沒有照片時，方框裡顯示的字 */
  placeholder?: string;
}

/** 照片牆：每格上方一行字、下方一張照片（例如「背號 10 周柏竣」＋大頭照） */
export function renderPhotoGrid(spec: { title: string; subtitle?: string; summary?: string; items: PhotoGridItem[]; perRow?: number; footer?: string }): HTMLCanvasElement {
  const perRow = spec.perRow ?? 5;
  const CARD_W = 214;
  const LABEL_H = 44;
  const PHOTO_W2 = CARD_W - 12;
  const PHOTO_H2 = 160;
  const CARD_H = LABEL_H + PHOTO_H2 + 6;
  const GAP = 0;
  const gridW = perRow * CARD_W + (perRow - 1) * GAP;
  const W = gridW + PAD * 2;
  const headH = 104 + (spec.subtitle ? 34 : 0);
  const summaryH = spec.summary ? 52 : 12;
  const rows = Math.max(1, Math.ceil(spec.items.length / perRow));
  const footH = spec.footer ? 52 : 24;
  const H = headH + summaryH + PAD - 12 + rows * CARD_H + footH;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';
  const font = (size: number, bold = false) => `${bold ? 'bold ' : ''}${size}px ${FONT}`;

  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#23263a';
  ctx.fillRect(0, 0, W, headH);
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(0, headH - 8, W, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(32, true);
  ctx.fillText(spec.title, PAD, 30);
  if (spec.subtitle) {
    ctx.font = font(22);
    ctx.fillStyle = '#ffe9a6';
    ctx.fillText(spec.subtitle, PAD, 78);
  }
  let y = headH;
  if (spec.summary) {
    ctx.font = font(21, true);
    ctx.fillStyle = '#23263a';
    ctx.fillText(spec.summary, PAD, y + 18);
  }
  y += summaryH + PAD - 12;

  spec.items.forEach((it, i) => {
    const cx = PAD + (i % perRow) * (CARD_W + GAP);
    const cy = y + Math.floor(i / perRow) * CARD_H;
    // 外框（像表格一樣一格一格）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx, cy, CARD_W, CARD_H);
    ctx.strokeStyle = '#23263a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, CARD_W, CARD_H);
    ctx.beginPath();
    ctx.moveTo(cx, cy + LABEL_H);
    ctx.lineTo(cx + CARD_W, cy + LABEL_H);
    ctx.stroke();
    // 上方的字（太長就縮小）
    let size = 21;
    ctx.font = font(size, true);
    while (ctx.measureText(it.label).width > CARD_W - 16 && size > 14) ctx.font = font(--size, true);
    ctx.fillStyle = '#23263a';
    ctx.fillText(it.label, cx + 8, cy + (LABEL_H - size) / 2);
    // 照片
    const px = cx + 6;
    const py = cy + LABEL_H + 3;
    if (it.image) drawCover(ctx, it.image, px, py, PHOTO_W2, PHOTO_H2, 0.3, 2);
    else {
      ctx.fillStyle = '#eef0f5';
      ctx.fillRect(px, py, PHOTO_W2, PHOTO_H2);
      ctx.fillStyle = '#9aa0b4';
      ctx.font = font(20);
      const t = it.placeholder ?? '（沒有照片）';
      ctx.fillText(t, px + (PHOTO_W2 - ctx.measureText(t).width) / 2, py + PHOTO_H2 / 2 - 10);
    }
  });

  if (spec.footer) {
    ctx.font = font(17);
    ctx.fillStyle = '#5a5f78';
    ctx.fillText(spec.footer, PAD, y + rows * CARD_H + 18);
  }
  return canvas;
}

/* ───────── 每週訓練課表圖片（組別 × 星期幾，像紙本課表） ───────── */

export interface WeekGridSpec {
  title: string;
  subtitle?: string;
  days: { date: string; weekday: string; time: string; off: boolean; note: string }[];
  groups: { name: string; members: string }[];
  /** 第 g 組、第 d 天的格子；沒有內容回傳 null */
  cell: (g: number, d: number) => { title: string; lines: { text: string; sub: boolean }[]; players: string } | null;
  footer?: string;
}

export function renderWeekGridImage(spec: WeekGridSpec): HTMLCanvasElement {
  const G = 18; // 格子內文字大小
  const GL = 26; // 行高
  const IN = 8; // 格子內距
  const groupW = 190;
  const colW = spec.days.map((d) => (d.off ? 96 : 210));
  const tableW = groupW + colW.reduce((s, w) => s + w, 0);
  const W = tableW + PAD * 2;
  const font = (size: number, bold = false) => `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  const m = document.createElement('canvas').getContext('2d')!;

  // 先排版：每一格要畫的東西與高度
  type Piece = { kind: 'title' | 'sub' | 'line' | 'players'; text: string };
  const layout = spec.groups.map((_, g) =>
    spec.days.map((day, d): Piece[] => {
      const c = day.off ? null : spec.cell(g, d);
      if (!c) return [];
      const width = colW[d] - IN * 2;
      const out: Piece[] = [];
      if (c.title) {
        m.font = font(19, true);
        wrap(m, c.title, width).forEach((t) => out.push({ kind: 'title', text: t }));
      }
      c.lines.forEach((l) => {
        m.font = font(G, l.sub);
        wrap(m, l.text, width).forEach((t) => out.push({ kind: l.sub ? 'sub' : 'line', text: t }));
      });
      if (c.players) {
        m.font = font(G, true);
        wrap(m, '👤 ' + c.players, width).forEach((t) => out.push({ kind: 'players', text: t }));
      }
      return out;
    }),
  );
  const groupLines = spec.groups.map((gr) => {
    m.font = font(17);
    return wrap(m, gr.members || '（全隊）', groupW - IN * 2);
  });
  const rowH = spec.groups.map((_, g) =>
    Math.max(44 + groupLines[g].length * 24 + IN, ...layout[g].map((pieces) => pieces.reduce((s, p) => s + (p.kind === 'title' ? 32 : GL), 0) + IN * 2), 60),
  );
  const notes = spec.days.map((d, i) => {
    m.font = font(16);
    return d.note && !d.off ? wrap(m, d.note, colW[i] - IN * 2) : [];
  });
  const notesH = notes.some((n) => n.length) ? Math.max(...notes.map((n) => n.length)) * 23 + IN * 2 + 4 : 0;
  const headH = 104 + (spec.subtitle ? 34 : 0);
  const theadH = 34 * 3;
  const footH = spec.footer ? 52 : 24;
  const bodyH = rowH.reduce((s, h) => s + h, 0);
  const H = headH + PAD + theadH + bodyH + notesH + footH;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#23263a';
  ctx.fillRect(0, 0, W, headH);
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(0, headH - 8, W, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(32, true);
  ctx.fillText(spec.title, PAD, 30);
  if (spec.subtitle) {
    ctx.font = font(22);
    ctx.fillStyle = '#ffe9a6';
    ctx.fillText(spec.subtitle, PAD, 78);
  }

  const top = headH + PAD;
  const xs: number[] = [];
  let x = PAD + groupW;
  colW.forEach((w) => {
    xs.push(x);
    x += w;
  });
  const center = (text: string, cx: number, y: number) => ctx.fillText(text, cx - ctx.measureText(text).width / 2, y);
  const line = (x1: number, y1: number, x2: number, y2: number, color = '#9aa0b4', width = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // 表頭：日期／星期／時間
  ctx.fillStyle = '#f3f4f8';
  ctx.fillRect(PAD, top, tableW, theadH);
  spec.days.forEach((d, i) => {
    const cx = xs[i] + colW[i] / 2;
    ctx.fillStyle = '#23263a';
    ctx.font = font(19, true);
    center(d.date, cx, top + 7);
    center(d.weekday, cx, top + 41);
    ctx.font = font(16, true);
    ctx.fillStyle = d.off ? '#9aa0b4' : '#b71c1c';
    center(d.off ? '休兵日' : d.time, cx, top + 76);
  });
  line(PAD, top + 34, PAD + tableW, top + 34, '#d5d9e4');
  line(PAD, top + 68, PAD + tableW, top + 68, '#d5d9e4');

  // 每一組
  let y = top + theadH;
  spec.groups.forEach((gr, g) => {
    const h = rowH[g];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(PAD, y, tableW, h);
    ctx.fillStyle = '#23263a';
    ctx.font = font(26, true);
    ctx.fillText(gr.name, PAD + IN + 4, y + 10);
    ctx.font = font(17);
    ctx.fillStyle = '#4a4f63';
    groupLines[g].forEach((t, k) => ctx.fillText(t, PAD + IN + 4, y + 46 + k * 24));
    spec.days.forEach((d, i) => {
      if (d.off) return;
      let cy = y + IN;
      layout[g][i].forEach((p) => {
        const cx = xs[i];
        if (p.kind === 'title') {
          ctx.fillStyle = '#ffc000';
          ctx.fillRect(cx + 1, cy - 2, colW[i] - 2, 30);
          ctx.fillStyle = '#23263a';
          ctx.font = font(19, true);
          center(p.text, cx + colW[i] / 2, cy + 3);
          cy += 32;
          return;
        }
        if (p.kind === 'sub') {
          ctx.fillStyle = '#d9d9d9';
          ctx.fillRect(cx + 1, cy - 1, colW[i] - 2, GL);
        }
        ctx.fillStyle = p.kind === 'players' ? '#1f5fb5' : '#23263a';
        ctx.font = font(G, p.kind !== 'line');
        center(p.text, cx + colW[i] / 2, cy + 3);
        cy += GL;
      });
    });
    line(PAD, y + h, PAD + tableW, y + h, '#23263a', 2);
    y += h;
  });
  // 休兵日：整欄合併
  spec.days.forEach((d, i) => {
    if (!d.off) return;
    ctx.fillStyle = '#f0f1f5';
    ctx.fillRect(xs[i] + 1, top + theadH + 1, colW[i] - 2, bodyH - 2);
    ctx.fillStyle = '#4a4f63';
    ctx.font = font(24, true);
    '休兵日'.split('').forEach((ch, k) => center(ch, xs[i] + colW[i] / 2, top + theadH + bodyH / 2 - 45 + k * 32));
  });
  // 當天備註（例如週六分段時間）
  if (notesH) {
    ctx.fillStyle = '#fff8e1';
    ctx.fillRect(PAD, y, tableW, notesH);
    ctx.fillStyle = '#23263a';
    ctx.font = font(20, true);
    ctx.fillText('📌 備註', PAD + IN + 4, y + IN + 2);
    ctx.font = font(16);
    notes.forEach((n, i) => n.forEach((t, k) => ctx.fillText(t, xs[i] + IN, y + IN + k * 23)));
    y += notesH;
  }
  // 格線
  line(PAD + groupW, top, PAD + groupW, y, '#23263a', 2);
  xs.slice(1).forEach((vx) => line(vx, top, vx, y, '#9aa0b4'));
  ctx.strokeStyle = '#23263a';
  ctx.lineWidth = 3;
  ctx.strokeRect(PAD, top, tableW, y - top);
  if (spec.footer) {
    ctx.font = font(17);
    ctx.fillStyle = '#5a5f78';
    ctx.fillText(spec.footer, PAD, y + 18);
  }
  return canvas;
}
