// 把表格畫成圖片（PNG），方便傳到 LINE 群組。全部在瀏覽器裡畫，不用上傳到任何地方。

export interface ImageCell {
  text: string;
  /** 放一張照片（例如大頭照），寬 72、高 90，照片會裁切填滿 */
  image?: CanvasImageSource & { width: number; height: number };
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
  const rowH = wrapped.map((row, i) => Math.max(...row.map((lines) => lines.length * LINE_H), spec.rows[i].some((c) => c.image) ? PHOTO_H + 4 : 0) + CELL_PAD * 2 - 8);
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
        drawCover(ctx, cell.image, x + CELL_PAD, y + CELL_PAD - 4, PHOTO_W, PHOTO_H);
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
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 6, y);
  ctx.arcTo(x + w, y, x + w, y + h, 6);
  ctx.arcTo(x + w, y + h, x, y + h, 6);
  ctx.arcTo(x, y + h, x, y, 6);
  ctx.arcTo(x, y, x + w, y, 6);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
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
