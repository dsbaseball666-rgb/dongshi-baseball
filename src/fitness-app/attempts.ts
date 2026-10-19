import type { FitnessItemKey } from '../types';
import { parseFitnessInput } from '../lib/fitness';

// 揮棒速度、投球球速：每位球員測多次（最多 10 次），成績存平均值；每一次的數值與最高值寫在備註裡

export const ATTEMPT_ITEMS: FitnessItemKey[] = ['swing', 'pitch'];
export const MAX_ATTEMPTS = 10;

export const usesAttempts = (item: FitnessItemKey) => ATTEMPT_ITEMS.includes(item);

/** 平均值（四捨五入到小數一位） */
export function average(list: number[]): number {
  if (!list.length) return 0;
  return Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10;
}

/** 把一格裡的多個數字（用空白、逗號、頓號隔開）拆開並逐一檢查，例如「95 96.5 97」 */
export function parseAttempts(item: FitnessItemKey, raw: string): number[] {
  const parts = raw.split(/[\s,，、]+/).filter(Boolean);
  if (!parts.length) throw new Error('請輸入檢測數值。');
  if (parts.length > MAX_ATTEMPTS) throw new Error(`最多輸入 ${MAX_ATTEMPTS} 次（目前 ${parts.length} 次）。`);
  return parts.map((p, i) => {
    try {
      return parseFitnessInput(item, p);
    } catch (e) {
      throw new Error(`第 ${i + 1} 次：${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

/** 存到備註的文字，例如「10 次平均（最高 98.2）：95.1、96…」；只有一次時不寫 */
export function attemptsNote(list: number[], extra = ''): string {
  const parts = [];
  if (list.length > 1) parts.push(`${list.length} 次平均（最高 ${Math.max(...list)}）：${list.join('、')}`);
  if (extra.trim()) parts.push(extra.trim());
  return parts.join('｜').slice(0, 200);
}
