import type { FitnessItemKey } from '../types';
import { getFitnessItem } from '../lib/fitness';
import { MAX_ATTEMPTS, usesAttempts } from './attempts';
import { tapsNeeded } from './groupSession';

// 紙本空白記錄表：每個項目一張 A4，依項目決定要留哪些手寫格子

export interface SheetColumn {
  label: string;
  /** 欄寬（相對比例，列印時換成百分比） */
  width: number;
  /** 小格子（圈數打勾、每一次的數值） */
  small?: boolean;
}

/** 年級依一、二…九排列（中文數字直接排序會變成七、九、八） */
export function gradeRank(g: string): number {
  const i = '一二三四五六七八九'.indexOf(g.charAt(0));
  return i < 0 ? 99 : i;
}

export function sortGrades(grades: string[]): string[] {
  return Array.from(new Set(grades.filter(Boolean))).sort((a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b));
}

/** 這一張表要留的手寫欄位（背號、姓名、上次成績之外） */
export function sheetColumns(item: FitnessItemKey, trackLength: number): SheetColumn[] {
  const def = getFitnessItem(item);
  if (usesAttempts(item)) {
    return [...Array.from({ length: MAX_ATTEMPTS }, (_, i) => ({ label: String(i + 1), width: 6, small: true })), { label: '平均', width: 9 }, { label: '最高', width: 8 }];
  }
  if (item === 'run1500' && trackLength) {
    const laps = tapsNeeded({ item, trackLength });
    // 圈數多時格子窄一點，總寬固定
    const w = Math.max(3.5, Math.min(7, 50 / laps));
    return [...Array.from({ length: laps }, (_, i) => ({ label: `${i + 1}`, width: w, small: true })), { label: '完成時間（分:秒）', width: 18 }];
  }
  const unit = def.kind === 'time' ? '分:秒' : def.unit;
  return [
    { label: `這次成績（${unit}）`, width: 22 },
    { label: '備註', width: 30 },
  ];
}

/** 表頭的填寫說明 */
export function sheetHint(item: FitnessItemKey, trackLength: number): string {
  const def = getFitnessItem(item);
  if (usesAttempts(item)) return `每一次的 ${def.unit} 寫在 1～${MAX_ATTEMPTS} 格，最後算平均（輸入系統時，可以把 ${MAX_ATTEMPTS} 次用空白隔開一次打進去，系統會自動算平均）。`;
  if (item === 'run1500' && trackLength) return `${trackLength} 公尺跑道，每經過終點線一次就在下一格打 ✓（共 ${tapsNeeded({ item, trackLength })} 格），最後寫完成時間，例如 6:45.30。`;
  if (def.kind === 'time') return def.min >= 60 ? '時間寫「分:秒」，例如 6:45.30。' : '時間寫秒數，例如 22.50。';
  return `${def.inputHint}。${def.better === 'higher' ? '數值越高越好' : '越少越好'}。`;
}
