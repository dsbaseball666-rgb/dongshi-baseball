import type { FitnessItemKey } from '../types';

export interface FitnessItemDef {
  key: FitnessItemKey;
  label: string;
  group: string;
  unit: string;
  kind: 'count' | 'distance' | 'weight' | 'time' | 'speed';
  better: 'higher' | 'lower';
  min: number;
  max: number;
  inputHint: string;
}

// 跑步時間一律以「秒」儲存，畫面統一顯示為「分:秒.百分秒」
export const FITNESS_ITEMS: FitnessItemDef[] = [
  { key: 'pushup', label: '伏地挺身', group: '肌耐力', unit: '次', kind: 'count', better: 'higher', min: 0, max: 200, inputHint: '輸入次數，例如 25' },
  { key: 'situp', label: '仰臥起坐', group: '肌耐力', unit: '次', kind: 'count', better: 'higher', min: 0, max: 200, inputHint: '輸入次數，例如 32' },
  { key: 'jump', label: '立定跳遠', group: '爆發力', unit: '公分', kind: 'distance', better: 'higher', min: 1, max: 400, inputHint: '輸入公分，例如 200' },
  { key: 'run1500', label: '1500 公尺', group: '心肺耐力', unit: '秒', kind: 'time', better: 'lower', min: 180, max: 1800, inputHint: '輸入「分:秒」，例如 6:45 或 6:45.30' },
  { key: 'run150', label: '150 公尺', group: '速度', unit: '秒', kind: 'time', better: 'lower', min: 12, max: 90, inputHint: '輸入秒數，例如 22.5' },
  { key: 'grip', label: '慣用手握力', group: '握力', unit: '公斤', kind: 'weight', better: 'higher', min: 1, max: 100, inputHint: '輸入公斤，例如 28.5' },
  { key: 'swing', label: '揮棒速度', group: '棒球專項', unit: 'km/h', kind: 'speed', better: 'higher', min: 20, max: 200, inputHint: '輸入 km/h，例如 95.5' },
  { key: 'pitch', label: '投球球速', group: '棒球專項', unit: 'km/h', kind: 'speed', better: 'higher', min: 20, max: 180, inputHint: '輸入 km/h，例如 92.4' },
];

export function getFitnessItem(key: FitnessItemKey): FitnessItemDef {
  const item = FITNESS_ITEMS.find((i) => i.key === key);
  // 項目調整前留下的舊紀錄（例如 60 公尺）仍可顯示，不會讓頁面出錯
  return item ?? { key, label: `${key}（已停用項目）`, group: '已停用', unit: '', kind: 'count', better: 'higher', min: 0, max: Number.MAX_SAFE_INTEGER, inputHint: '' };
}

/** 秒數 → 「分:秒.百分秒」，例如 405 → 6:45.00、8.45 → 0:08.45 */
export function formatRunTime(seconds: number): string {
  const totalCs = Math.round(seconds * 100);
  const min = Math.floor(totalCs / 6000);
  const restCs = totalCs - min * 6000;
  const sec = Math.floor(restCs / 100);
  const cs = restCs % 100;
  return `${min}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatFitnessValue(key: FitnessItemKey, value: number): string {
  const item = getFitnessItem(key);
  if (item.kind === 'time') return `${formatRunTime(value)}（分:秒）`;
  const shown = item.kind === 'weight' || item.kind === 'speed' ? String(Math.round(value * 10) / 10) : String(value);
  return `${shown} ${item.unit}`;
}

/** 解析使用者輸入，失敗時丟出中文錯誤訊息 */
export function parseFitnessInput(key: FitnessItemKey, raw: string): number {
  const item = getFitnessItem(key);
  const text = raw.trim();
  if (!text) throw new Error('請輸入檢測數值。');
  let value: number;
  if (item.kind === 'time' && text.includes(':')) {
    const parts = text.split(':');
    if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d{1,2}(\.\d{1,2})?$/.test(parts[1])) {
      throw new Error('時間格式不正確，請輸入「分:秒」，例如 6:45。');
    }
    const sec = Number(parts[1]);
    if (sec >= 60) throw new Error('秒數必須小於 60。');
    value = Number(parts[0]) * 60 + sec;
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('請輸入正確的數字（最多兩位小數）。');
    value = Number(text);
  }
  if (item.kind === 'count' && !Number.isInteger(value)) throw new Error('次數必須是整數。');
  if (value < item.min || value > item.max) {
    const range = item.kind === 'time' ? `${formatRunTime(item.min)} ～ ${formatRunTime(item.max)}` : `${item.min} ～ ${item.max} ${item.unit}`;
    throw new Error(`數值超出合理範圍（${range}），請再確認。`);
  }
  return Math.round(value * 100) / 100;
}

/** 數值在表單中重新編輯時的顯示 */
export function valueToInput(key: FitnessItemKey, value: number): string {
  const item = getFitnessItem(key);
  if (item.kind === 'time' && value >= 60) return formatRunTime(value);
  return String(value);
}

/** 比較兩次成績：正數代表進步 */
export function improvement(key: FitnessItemKey, prev: number, next: number): number {
  const item = getFitnessItem(key);
  const diff = Math.round((next - prev) * 100) / 100;
  return item.better === 'higher' ? diff : -diff;
}
