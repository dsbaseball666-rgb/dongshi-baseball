import type { BattleStatus, ItemId, MonsterElement, Wallet } from '../types';

// 畫面顯示用的規則說明；實際的數值與結果一律由 Apps Script 後端計算（apps-script/Code.gs 的 BATTLE、ITEMS）

export const BATTLE_RULES = {
  pveDaily: 5,
  pvpDaily: 3,
  regenPercentPerHour: 25,
  skillCooldown: 3,
  maxTurns: 30,
};

export const ITEM_INFO: { id: ItemId; label: string; icon: string; price: number; description: string; inBattleOnly: boolean }[] = [
  { id: 'potion', label: '回復藥水', icon: '🧃', price: 15, description: '回復 40% 最大 HP', inBattleOnly: false },
  { id: 'superPotion', label: '高級回復藥', icon: '🍯', price: 40, description: 'HP 全部回復', inBattleOnly: false },
  { id: 'powerGlove', label: '力量手套', icon: '🧤', price: 20, description: '這場對戰攻擊力 +30%（只能在對戰中使用）', inBattleOnly: true },
  { id: 'guardGear', label: '防護護具', icon: '🛡️', price: 20, description: '這場對戰防禦力 +30%（只能在對戰中使用）', inBattleOnly: true },
];

export const ITEM_MAX_HOLD = 20;

/** 屬性相剋：左邊剋右邊 */
export const ELEMENT_BEATS: Record<MonsterElement, MonsterElement> = { 熱血: '成長', 成長: '堅守', 堅守: '疾風', 疾風: '智慧', 智慧: '團結', 團結: '熱血' };

export const ELEMENT_TRAITS: Record<MonsterElement, string> = {
  熱血: '攻擊力 +10%',
  疾風: '速度 +10%（較容易先出手）',
  堅守: '防禦力 +10%',
  成長: '最大 HP +10%',
  智慧: '會心一擊機率較高',
  團結: '攻擊、防禦各 +5%',
};

export const STATUS_LABELS: Record<BattleStatus, string> = { active: '進行中', won: '獲勝', lost: '落敗', draw: '平手', fled: '逃跑' };

export function itemCount(w: Wallet, id: ItemId): number {
  return w.items?.[id] ?? 0;
}

/** 今天剩下的對戰次數（日期不是今天時代表還沒開始計算） */
export function battlesLeft(w: Wallet, today: string): { pve: number; pvp: number } {
  const same = w.battleDate === today;
  return {
    pve: Math.max(0, BATTLE_RULES.pveDaily - (same ? w.pveCount ?? 0 : 0)),
    pvp: Math.max(0, BATTLE_RULES.pvpDaily - (same ? w.pvpCount ?? 0 : 0)),
  };
}
