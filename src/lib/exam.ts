import type { ExamScore } from '../types';

// 與後端 apps-script/Code.gs 的 EXAM_SUBJECTS 相同（7＝一年級、8＝二年級、9＝三年級）
export const EXAM_SUBJECTS: Record<7 | 8 | 9, string[]> = {
  7: ['國文', '數學', '英文', '社會', '自然', '建教'],
  8: ['國文', '數學', '英文', '地理', '歷史', '公民', '理化', '建教'],
  9: ['國文', '數學', '英文', '地理', '歷史', '公民', '理化', '地科生物'],
};

export const GRADE_LABELS: Record<7 | 8 | 9, string> = { 7: '一年級', 8: '二年級', 9: '三年級' };

/** 依日期推算學年度與學期：8 月～隔年 1 月是上學期，2～7 月是下學期 */
export function currentTerm(date = new Date()): { schoolYear: number; semester: '上' | '下' } {
  const y = date.getFullYear() - 1911;
  const m = date.getMonth() + 1;
  if (m >= 8) return { schoolYear: y, semester: '上' };
  if (m === 1) return { schoolYear: y - 1, semester: '上' };
  return { schoolYear: y - 1, semester: '下' };
}

/** 從球員資料的年級文字推算 7／8／9（例如「八年級」「二年級」「8」）；看不出來時回傳 null */
export function gradeFromText(text: string): 7 | 8 | 9 | null {
  const t = text.trim();
  if (/七|^7|國一|一年/.test(t)) return 7;
  if (/八|^8|國二|二年/.test(t)) return 8;
  if (/九|^9|國三|三年/.test(t)) return 9;
  return null;
}

export function examLabel(e: Pick<ExamScore, 'schoolYear' | 'semester' | 'examNo'>): string {
  return `${e.schoolYear}${e.semester} 第${e.examNo}次段考`;
}

/** 排序用：學年 → 學期（上在前）→ 第幾次 */
export function examOrder(e: Pick<ExamScore, 'schoolYear' | 'semester' | 'examNo'>): number {
  return e.schoolYear * 100 + (e.semester === '上' ? 0 : 10) + e.examNo;
}

/** 平均分數（只算有成績的科目），四捨五入到小數一位；沒有成績時回傳 null */
export function examAverage(scores: Record<string, number>): number | null {
  const v = Object.values(scores);
  if (v.length === 0) return null;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

export function examTotal(scores: Record<string, number>): number {
  return Math.round(Object.values(scores).reduce((s, x) => s + x, 0) * 10) / 10;
}

/** 解析表格中輸入的分數：空白回傳 null；不合理時丟出錯誤訊息 */
export function parseScore(raw: string, label: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label}的成績必須是 0～100。`);
  if (Math.round(n * 10) / 10 !== n) throw new Error(`${label}的成績最多一位小數。`);
  return n;
}
