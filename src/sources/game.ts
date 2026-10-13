import { useCallback, useMemo } from 'react';
import type { Battle, BattleMode, BattleSummary, ExploreAreaId, ItemId, KnowledgeArticle, Monster, MonsterProgress, Opponent, PlayerMonster, RewardLog, Task, TaskCompletion, Wallet } from '../types';
import { useStore } from '../store/DemoStore';
import {
  capture,
  careMonster,
  chooseStarter,
  claimDailySupply,
  claimReward,
  currentCompletion,
  evolveMonster,
  explore,
  grantExp,
  leaveEncounter,
  recordQuizPass,
  reviewCompletion,
  setPartner,
  setTaskActive,
  submitTask,
  trainMonster,
  updateMonster,
  upsertTask,
  type CaptureResult,
  type CareResult,
  type EvolveResult,
  type MonsterEdit,
  type TaskInput,
} from '../store/actions';
import { SEED_MONSTERS } from '../data/monsters';
import { createSeed } from '../data/seed';
import { todayStr } from '../lib/date';
import type { CareActionId, TrainPlanId } from '../lib/monster';
import { useCloudQuery } from './hooks';

// 遊戲資料來源：示範模式讀寫瀏覽器資料；雲端模式由 Apps Script 決定所有結果（探索、捕捉、領獎、測驗批改）。

export interface GameState {
  today: string;
  wallet: Wallet;
  playerMonsters: PlayerMonster[];
  progress: MonsterProgress[];
  rewardLogs: RewardLog[];
  tasks: Task[];
  completions: TaskCompletion[];
  quizPassedArticleIds: string[];
  /** 以下只有雲端模式提供 */
  battle?: Battle | null;
  battleHistory?: BattleSummary[];
}

export type BattleAction = 'attack' | 'skill' | 'defend' | 'item' | 'flee';
export interface BattleStart {
  mode: BattleMode;
  playerMonsterId: string;
  areaId?: ExploreAreaId;
  opponentPlayerId?: string;
}
export interface BattleTurnResult {
  ended: Exclude<Battle['status'], 'active'> | null;
  result: Battle['result'];
  battle: Battle;
}

type ServerMonster = Omit<Monster, 'shape' | 'accessories' | 'palette'>;

// 雲端只存遊戲數值；外觀（像素圖）由網頁內建資料提供
const LOCAL = new Map(SEED_MONSTERS.map((m) => [m.id, m]));
function withSprite(m: ServerMonster): Monster {
  const local = LOCAL.get(m.id);
  return {
    ...m,
    shape: local?.shape ?? 'round',
    accessories: local?.accessories ?? ['none'],
    palette: local?.palette ?? { body: '#bdbdbd', belly: '#eeeeee', accent: '#757575', outline: '#424242' },
  };
}

const emptyWallet = (playerId: string): Wallet => ({ playerId, points: 0, balls: 0, exploreDate: '', exploreCount: 0, supplyDate: '', seenMonsterIds: [], encounter: null });

export function useMonsters() {
  const { mode, db, user, api } = useStore();
  const cloud = mode === 'cloud' && user?.role !== 'parent';
  const q = useCloudQuery<Monster[]>(cloud, 'monsters', () => api<{ monsters: ServerMonster[] }>('listMonsters', {}, '讀取怪獸圖鑑').then((r) => r.monsters.map(withSprite)), []);
  if (!cloud) return { monsters: db.monsters, loading: false, error: null as string | null, reload: () => undefined };
  return { monsters: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload };
}

/** 球員自己的遊戲狀態與操作 */
export function useGame() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const playerId = user?.playerId ?? '';
  const isPlayer = user?.role === 'player' && !!playerId;
  const q = useCloudQuery<GameState | null>(cloud && isPlayer, `game-${user?.id}`, () => api<{ state: GameState }>('getGameState', {}, '讀取遊戲資料').then((r) => r.state), null);
  const monsters = useMonsters();

  const demoState = useMemo<GameState>(() => {
    const today = todayStr();
    const tasks = db.tasks.filter((t) => t.active);
    return {
      today,
      wallet: db.wallets.find((w) => w.playerId === playerId) ?? emptyWallet(playerId),
      playerMonsters: db.playerMonsters.filter((m) => m.playerId === playerId),
      progress: db.monsterProgress.filter((p) => p.playerId === playerId).slice(0, 15),
      rewardLogs: db.rewardLogs.filter((l) => l.playerId === playerId).slice(0, 15),
      tasks,
      completions: tasks.map((t) => currentCompletion(db, t, playerId, today)).filter((c): c is TaskCompletion => !!c),
      quizPassedArticleIds: Array.from(new Set(db.quizPasses.filter((x) => x.playerId === playerId).map((x) => x.articleId))),
    };
  }, [db, playerId]);

  const apply = useCallback((s: GameState | null) => s && q.setState((st) => ({ ...st, data: s })), [q.setState]);
  const call = useCallback(
    async <R extends { state: GameState | null }>(action: string, payload: object, label: string): Promise<R> => {
      const r = await api<R>(action, payload, label);
      apply(r.state);
      return r;
    },
    [api, apply],
  );

  const ops = useMemo(
    () => ({
      async submitTask(task: Task): Promise<'submitted' | 'approved'> {
        if (!cloud) {
          await perform('回報任務', (d) => submitTask(d, user, task.id));
          return task.verify === 'coach' ? 'submitted' : 'approved';
        }
        return (await call<{ status: 'submitted' | 'approved'; state: GameState }>('submitTask', { taskId: task.id }, '回報任務')).status;
      },
      async claimReward(completionId: string) {
        if (!cloud) return void (await perform('領取獎勵', (d) => claimReward(d, user, completionId)));
        await call('claimReward', { completionId }, '領取獎勵');
      },
      async chooseStarter(monsterId: string) {
        if (!cloud) return void (await perform('選擇初始夥伴', (d) => chooseStarter(d, user, monsterId)));
        await call('chooseStarter', { monsterId }, '選擇初始夥伴');
      },
      async setPartner(pmId: string) {
        if (!cloud) return void (await perform('設定夥伴', (d) => setPartner(d, user, pmId)));
        await call('setPartner', { playerMonsterId: pmId }, '設定夥伴');
      },
      async train(pmId: string, plan: TrainPlanId) {
        if (!cloud) return void (await perform('怪獸訓練', (d) => trainMonster(d, user, pmId, plan)));
        await call('trainMonster', { playerMonsterId: pmId, plan }, '怪獸訓練');
      },
      async supply() {
        if (!cloud) return void (await perform('領取每日補給', (d) => claimDailySupply(d, user)));
        await call('claimDailySupply', {}, '領取每日補給');
      },
      async explore(areaId: string) {
        if (!cloud) return void (await perform('野外探索', (d) => explore(d, user, areaId as Parameters<typeof explore>[2], Math.random)));
        await call('explore', { areaId }, '野外探索');
      },
      async leave() {
        if (!cloud) return void (await perform('離開遭遇', (d) => leaveEncounter(d, user)));
        await call('leaveEncounter', {}, '離開遭遇');
      },
      async capture(): Promise<CaptureResult | undefined> {
        if (!cloud) return perform('捕捉怪獸', (d) => capture(d, user, Math.random));
        return call<CaptureResult & { state: GameState }>('capture', {}, '捕捉怪獸');
      },
      async care(pmId: string, kind: CareActionId): Promise<CareResult | undefined> {
        if (!cloud) return perform('與怪獸互動', (d) => careMonster(d, user, pmId, kind));
        return call<CareResult & { state: GameState }>('careMonster', { playerMonsterId: pmId, action: kind }, '與怪獸互動');
      },
      async evolve(pmId: string): Promise<EvolveResult | undefined> {
        if (!cloud) return perform('怪獸進化', (d) => evolveMonster(d, user, pmId));
        return call<EvolveResult & { state: GameState }>('evolveMonster', { playerMonsterId: pmId }, '怪獸進化');
      },
      // 道具與對戰只在雲端模式提供（結果由伺服器計算）
      async buyItem(itemId: ItemId, qty: number) {
        await call('buyItem', { itemId, qty }, '購買道具');
      },
      async useItem(itemId: ItemId, pmId: string): Promise<number> {
        return (await call<{ healed: number; state: GameState }>('useItem', { itemId, playerMonsterId: pmId }, '使用道具')).healed;
      },
      async startBattle(input: BattleStart) {
        await call('startBattle', input, '開始對戰');
      },
      async battleAction(battleId: string, action: BattleAction, itemId?: ItemId): Promise<BattleTurnResult> {
        return call<BattleTurnResult & { state: GameState }>('battleAction', { battleId, action, itemId }, '對戰行動');
      },
    }),
    [cloud, perform, user, call],
  );

  const base = { monsters: monsters.monsters, monstersLoading: monsters.loading, monstersError: monsters.error, ...ops };
  if (!cloud) return { ...base, state: isPlayer ? demoState : null, loading: false, error: null as string | null, reload: () => undefined };
  return { ...base, state: q.state.data, loading: q.state.loading || monsters.loading, error: q.state.error, reload: q.reload };
}

/** 隊友挑戰的對手名單（雲端模式） */
export function useOpponents(enabled: boolean) {
  const { mode, api, user } = useStore();
  const q = useCloudQuery<Opponent[]>(mode === 'cloud' && enabled, `opponents-${user?.id}`, () => api<{ opponents: Opponent[] }>('listOpponents', {}, '讀取隊友名單').then((r) => r.opponents), []);
  return { opponents: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload };
}

export interface QuizResult {
  passed: boolean;
  results: { correct: boolean; answerIndex: number; explanation: string }[];
}

/** 防護知識測驗：雲端由伺服器批改；示範模式在本機批改 */
export function useQuizSubmit() {
  const { mode, user, api, perform } = useStore();
  return useCallback(
    async (article: KnowledgeArticle, answers: number[]): Promise<QuizResult> => {
      if (mode === 'cloud') return api<QuizResult>('submitQuiz', { articleId: article.id, answers }, '送出測驗');
      const results = article.quiz.map((q, i) => ({ correct: answers[i] === q.answerIndex, answerIndex: q.answerIndex, explanation: q.explanation }));
      const passed = results.every((r) => r.correct);
      if (passed && user?.role === 'player') await perform('記錄測驗結果', (d) => recordQuizPass(d, user, article.id));
      return { passed, results };
    },
    [mode, user, api, perform],
  );
}

/** 教練：任務設定與待確認的回報 */
export function useTaskAdmin() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<{ tasks: Task[]; pending: TaskCompletion[] }>(cloud, 'task-admin', () => api('adminListTasks', {}, '讀取任務'), { tasks: [], pending: [] });
  const demo = useMemo(() => ({ tasks: db.tasks, pending: db.completions.filter((c) => c.status === 'submitted') }), [db.tasks, db.completions]);
  const ops = useMemo(
    () => ({
      async upsert(input: TaskInput) {
        if (!cloud) return void (await perform(input.id ? '修改任務' : '新增任務', (d) => upsertTask(d, user, input)));
        await api('upsertTask', input, input.id ? '修改任務' : '新增任務');
        q.reload();
      },
      async setActive(id: string, active: boolean) {
        if (!cloud) return void (await perform(active ? '開放任務' : '關閉任務', (d) => setTaskActive(d, user, id, active)));
        await api('setTaskActive', { id, active }, active ? '開放任務' : '關閉任務');
        q.reload();
      },
      async review(completionId: string, approve: boolean) {
        if (!cloud) return void (await perform(approve ? '核准任務' : '退回任務', (d) => reviewCompletion(d, user, completionId, approve)));
        await api('reviewCompletion', { completionId, approve }, approve ? '核准任務' : '退回任務');
        q.reload();
      },
      /** 雲端任務表是空的時候，匯入 6 個預設任務 */
      async importDefaults() {
        const tasks = createSeed().tasks.map(({ title, description, category, repeat, verify, expReward, pointReward, ballReward }) => ({ title, description, category, repeat, verify, expReward, pointReward, ballReward }));
        await api('importTasks', { tasks }, '匯入預設任務');
        q.reload();
      },
    }),
    [cloud, perform, user, api, q.reload],
  );
  if (!cloud) return { ...demo, loading: false, error: null as string | null, ...ops };
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, ...ops };
}

/** 教練：怪獸資料與全隊收藏 */
export function useMonsterAdmin() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const monsters = useMonsters();
  const q = useCloudQuery<PlayerMonster[]>(cloud, 'game-overview', () => api<{ playerMonsters: PlayerMonster[] }>('adminGameOverview', {}, '讀取全隊怪獸').then((r) => r.playerMonsters), []);
  const ops = useMemo(
    () => ({
      async update(id: string, input: MonsterEdit) {
        if (!cloud) return void (await perform('修改怪獸資料', (d) => updateMonster(d, user, id, input)));
        await api('updateMonster', { id, ...input }, '修改怪獸資料');
        monsters.reload();
      },
      async grantExp(pmId: string, amount: number, reason: string) {
        if (!cloud) return void (await perform('發放經驗值', (d) => grantExp(d, user, pmId, amount, reason)));
        await api('grantExp', { playerMonsterId: pmId, amount, reason }, '發放經驗值');
        q.reload();
      },
      /** 雲端怪獸表是空的時候，匯入 75 隻原創怪獸的遊戲數值 */
      async importDefaults() {
        const list = SEED_MONSTERS.map(({ id, dexNo, name, element, rarity, stage, evolvesTo, evolveLevel, evolveAffection, description, habitat, catchRate, isStarter, inWild }) => ({
          id, dexNo, name, element, rarity, stage, evolvesTo, evolveLevel, evolveAffection, description, habitat, catchRate, isStarter, inWild,
        }));
        await api('importMonsters', { monsters: list }, '匯入怪獸圖鑑');
        monsters.reload();
      },
    }),
    [cloud, perform, user, api, monsters.reload, q.reload],
  );
  if (!cloud) return { monsters: db.monsters, playerMonsters: db.playerMonsters, loading: false, error: null as string | null, ...ops };
  return { monsters: monsters.monsters, playerMonsters: q.state.data, loading: monsters.loading || q.state.loading, error: monsters.error ?? q.state.error, ...ops };
}
