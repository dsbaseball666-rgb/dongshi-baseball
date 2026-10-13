import type { ExploreAreaId, Monster } from '../types';

export const MAX_LEVEL = 30;

/** 升到下一級需要的經驗值 */
export function expToNext(level: number): number {
  return 40 + level * 20;
}

/** 加入經驗值並處理升級 */
export function applyExp(level: number, exp: number, gain: number): { level: number; exp: number; levelsGained: number } {
  let lv = level;
  let xp = exp + Math.max(0, gain);
  let gained = 0;
  while (lv < MAX_LEVEL && xp >= expToNext(lv)) {
    xp -= expToNext(lv);
    lv += 1;
    gained += 1;
  }
  if (lv >= MAX_LEVEL) xp = 0;
  return { level: lv, exp: xp, levelsGained: gained };
}

export const RARITY_WEIGHT: Record<1 | 2 | 3, number> = { 1: 60, 2: 30, 3: 10 };

/** 依稀有度加權抽出遭遇的怪獸；rng 可在測試中替換 */
export function pickEncounter(monsters: Monster[], areaId: ExploreAreaId, rng: () => number): Monster | null {
  const pool = monsters.filter((m) => m.habitat === areaId && m.inWild);
  if (pool.length === 0) return null;
  const total = pool.reduce((s, m) => s + RARITY_WEIGHT[m.rarity], 0);
  let roll = rng() * total;
  for (const m of pool) {
    roll -= RARITY_WEIGHT[m.rarity];
    if (roll < 0) return m;
  }
  return pool[pool.length - 1];
}

export const EXPLORE_AREAS: { id: ExploreAreaId; name: string; icon: string; description: string }[] = [
  { id: 'field', name: '草地球場', icon: '⚾', description: '球場邊的草叢，常有活潑的怪獸出沒。' },
  { id: 'riverside', name: '河堤跑道', icon: '🏃', description: '大甲溪畔的跑道，速度型怪獸的棲息地。' },
  { id: 'orchard', name: '山城果園', icon: '🍐', description: '東勢山城的果園小徑，據說有稀有怪獸。' },
];

export const TRAIN_PLANS = [
  { id: 'light', label: '基礎練習', cost: 10, exp: 15, description: '花 10 點，獲得 15 經驗值' },
  { id: 'focus', label: '專項特訓', cost: 30, exp: 50, description: '花 30 點，獲得 50 經驗值' },
] as const;

export type TrainPlanId = (typeof TRAIN_PLANS)[number]['id'];

/** 取得完整進化路線（由第 1 階段排到最終型態） */
export function evolutionChain(monsters: Monster[], monsterId: string): Monster[] {
  const byId = new Map(monsters.map((m) => [m.id, m]));
  let base = byId.get(monsterId);
  if (!base) return [];
  for (let guard = 0; guard < 5; guard++) {
    const prev = monsters.find((m) => m.evolvesTo === base!.id);
    if (!prev) break;
    base = prev;
  }
  const chain: Monster[] = [];
  let cur: Monster | undefined = base;
  while (cur && chain.length < 5) {
    chain.push(cur);
    cur = cur.evolvesTo ? byId.get(cur.evolvesTo) : undefined;
  }
  return chain;
}

/** 怪獸是否已達進化條件 */
export function canEvolve(monster: Monster | undefined, level: number): boolean {
  return !!monster?.evolvesTo && !!monster.evolveLevel && level >= monster.evolveLevel;
}

export const STAGE_LABELS: Record<1 | 2 | 3, string> = { 1: '幼年型', 2: '成長型', 3: '最終型' };

export function rarityStars(r: 1 | 2 | 3): string {
  return '★'.repeat(r) + '☆'.repeat(3 - r);
}
