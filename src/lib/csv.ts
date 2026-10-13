/** 轉成 CSV 文字（含 BOM，讓 Excel 正確顯示中文） */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '﻿';
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: unknown): string => {
    const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))];
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
