import type { SelfCheckItem } from '../types';

// 與 apps-script/Code.gs 的 SELF_CHECK_KEYS 必須一致
export const SELF_CHECK_ITEMS: SelfCheckItem[] = [
  { key: 'onTime', label: '準時到場' },
  { key: 'warmup', label: '確實完成暖身' },
  { key: 'gear', label: '整理好個人與球隊器材' },
  { key: 'water', label: '有定時補水' },
  { key: 'report', label: '身體不適有主動回報' },
  { key: 'teamwork', label: '有幫助或鼓勵隊友' },
];
