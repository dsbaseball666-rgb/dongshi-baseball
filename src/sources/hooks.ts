import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Announcement, DailyNote, FitnessTest, Goal, GoalStatus, GoalTermSetting, KnowledgeArticle, Player, PublishStatus, Rule } from '../types';
import { useStore } from '../store/DemoStore';
import {
  addFitness,
  commentNote,
  createGoal,
  deleteFitness,
  reviewCheckpoint,
  saveNote,
  setAnnouncementStatus,
  setArticleStatus,
  setGoalStatus,
  submitCheckpoint,
  updateFitness,
  updateGoalSettings,
  updateRule,
  upsertAnnouncement,
  upsertArticle,
  type AnnouncementInput,
  type ArticleInput,
  type FitnessInput,
  type GoalInput,
  type NoteInput,
  type RuleEdit,
} from '../store/actions';
import { createSeedRules } from '../data/rules';
import { createSeedArticles } from '../data/knowledge';
import { todayStr } from '../lib/date';

// 頁面透過這些 hook 讀寫資料，不需要知道目前是示範模式還是雲端模式。
// 示範模式：讀寫瀏覽器中的示範資料。雲端模式：呼叫 Apps Script API。

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/** 雲端模式下讀取一份資料；key 改變或 reload() 時重新讀取 */
export function useCloudQuery<T>(enabled: boolean, key: string, load: () => Promise<T>, empty: T) {
  const [state, setState] = useState<Loadable<T>>({ data: empty, loading: enabled, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => !cancelled && setState({ data: empty, loading: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
    // load 由 key 決定，所以依賴只放 key，避免每次 render 重新讀取
  }, [enabled, key, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, setState, reload };
}

export function usePlayers() {
  const { mode, db, user, api } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<Player[]>(cloud, `players-${user?.id}`, () => api<{ players: Player[] }>('listPlayers', {}, '讀取球員名單').then((r) => r.players), []);
  const demoPlayers = useMemo(() => {
    if (!user) return [];
    if (user.role === 'coach') return db.players;
    if (user.role === 'player') return db.players.filter((p) => p.id === user.playerId);
    return db.players.filter((p) => user.childPlayerIds.includes(p.id));
  }, [db.players, user]);
  if (!cloud) return { players: demoPlayers, loading: false, error: null, reload: () => undefined };
  return { players: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload };
}

const upsertById = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function useNotes(playerId: string) {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<DailyNote[]>(cloud && !!playerId, `notes-${playerId}`, () => api<{ notes: DailyNote[] }>('listNotes', { playerId }, '讀取每日筆記').then((r) => r.notes), []);

  const save = useCallback(
    async (input: NoteInput): Promise<{ created: boolean }> => {
      if (!cloud) {
        const existed = db.notes.some((n) => n.playerId === input.playerId && n.date === input.date);
        await perform('儲存每日筆記', (d) => saveNote(d, user, input));
        return { created: !existed };
      }
      const r = await api<{ note: DailyNote; created: boolean }>('saveNote', input, '儲存每日筆記');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.note) }));
      return { created: r.created };
    },
    [cloud, db.notes, perform, user, api, q.setState],
  );

  const comment = useCallback(
    async (noteId: string, text: string) => {
      if (!cloud) {
        await perform('儲存教練評語', (d) => commentNote(d, user, noteId, text));
        return;
      }
      const r = await api<{ note: DailyNote }>('commentNote', { noteId, comment: text }, '儲存教練評語');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.note) }));
    },
    [cloud, perform, user, api, q.setState],
  );

  const demoNotes = useMemo(() => db.notes.filter((n) => n.playerId === playerId), [db.notes, playerId]);
  if (!cloud) return { notes: demoNotes, loading: false, error: null, reload: () => undefined, save, comment };
  return { notes: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save, comment };
}

export function useFitness(playerId: string) {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<FitnessTest[]>(cloud && !!playerId, `fitness-${playerId}`, () => api<{ records: FitnessTest[] }>('listFitness', { playerId }, '讀取體能檢測').then((r) => r.records), []);

  const add = useCallback(
    async (input: FitnessInput) => {
      if (!cloud) {
        await perform('新增體能檢測', (d) => addFitness(d, user, input));
        return;
      }
      const r = await api<{ record: FitnessTest }>('addFitness', input, '新增體能檢測');
      q.setState((s) => ({ ...s, data: [...s.data, r.record] }));
    },
    [cloud, perform, user, api, q.setState],
  );

  const update = useCallback(
    async (id: string, input: FitnessInput) => {
      if (!cloud) {
        await perform('修改體能檢測', (d) => updateFitness(d, user, id, input));
        return;
      }
      const r = await api<{ record: FitnessTest }>('updateFitness', { id, ...input }, '修改體能檢測');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.record) }));
    },
    [cloud, perform, user, api, q.setState],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!cloud) {
        await perform('刪除體能檢測', (d) => deleteFitness(d, user, id));
        return;
      }
      await api('deleteFitness', { id }, '刪除體能檢測');
      q.setState((s) => ({ ...s, data: s.data.filter((x) => x.id !== id) }));
    },
    [cloud, perform, user, api, q.setState],
  );

  const demoRecords = useMemo(() => db.fitness.filter((f) => f.playerId === playerId), [db.fitness, playerId]);
  if (!cloud) return { records: demoRecords, loading: false, error: null, reload: () => undefined, add, update, remove };
  return { records: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, add, update, remove };
}

/** playerId 為 null 時讀取全隊目標（只有教練可以） */
export function useGoals(playerId: string | null) {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const enabled = cloud && playerId !== '';
  const q = useCloudQuery<Goal[]>(enabled, `goals-${playerId ?? 'all'}`, () => api<{ goals: Goal[] }>('listGoals', playerId ? { playerId } : {}, '讀取目標').then((r) => r.goals), []);
  const apply = useCallback((g: Goal) => q.setState((s) => ({ ...s, data: upsertById(s.data, g) })), [q.setState]);

  const create = useCallback(
    async (input: GoalInput) => {
      if (!cloud) return void (await perform('建立目標', (d) => createGoal(d, user, input)));
      apply((await api<{ goal: Goal }>('createGoal', input, '建立目標')).goal);
    },
    [cloud, perform, user, api, apply],
  );
  const submit = useCallback(
    async (goalId: string, checkpointId: string) => {
      if (!cloud) return void (await perform('申請檢核', (d) => submitCheckpoint(d, user, goalId, checkpointId)));
      apply((await api<{ goal: Goal }>('submitCheckpoint', { goalId, checkpointId }, '申請檢核')).goal);
    },
    [cloud, perform, user, api, apply],
  );
  const review = useCallback(
    async (goalId: string, checkpointId: string, approve: boolean) => {
      if (!cloud) return void (await perform('審核檢核點', (d) => reviewCheckpoint(d, user, goalId, checkpointId, approve)));
      apply((await api<{ goal: Goal }>('reviewCheckpoint', { goalId, checkpointId, approve }, '審核檢核點')).goal);
    },
    [cloud, perform, user, api, apply],
  );
  const setStatus = useCallback(
    async (goalId: string, status: GoalStatus) => {
      if (!cloud) return void (await perform('變更目標狀態', (d) => setGoalStatus(d, user, goalId, status)));
      apply((await api<{ goal: Goal }>('setGoalStatus', { goalId, status }, '變更目標狀態')).goal);
    },
    [cloud, perform, user, api, apply],
  );

  const demoGoals = useMemo(() => db.goals.filter((g) => playerId === null || g.playerId === playerId), [db.goals, playerId]);
  const base = { create, submit, review, setStatus };
  if (!cloud) return { goals: demoGoals, loading: false, error: null as string | null, reload: () => undefined, ...base };
  return { goals: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, ...base };
}

const FALLBACK_GOAL_SETTINGS: GoalTermSetting[] = [
  { term: 'short', label: '短期目標', periodHint: '每週或指定日期範圍', defaultDays: 7 },
  { term: 'mid', label: '中期目標', periodHint: '數週至數月', defaultDays: 60 },
  { term: 'long', label: '長期目標', periodHint: '整季或指定長期期限', defaultDays: 180 },
];

export function useGoalSettings() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud' && user?.role !== 'parent';
  const q = useCloudQuery<GoalTermSetting[]>(cloud, 'goal-settings', () => api<{ settings: GoalTermSetting[] }>('getGoalSettings', {}, '讀取目標期限設定').then((r) => r.settings), FALLBACK_GOAL_SETTINGS);
  const save = useCallback(
    async (settings: GoalTermSetting[]) => {
      if (!cloud) return void (await perform('調整目標期限設定', (d) => updateGoalSettings(d, user, settings)));
      const r = await api<{ settings: GoalTermSetting[] }>('updateGoalSettings', { settings }, '調整目標期限設定');
      q.setState((s) => ({ ...s, data: r.settings }));
    },
    [cloud, perform, user, api, q.setState],
  );
  if (!cloud) return { settings: db.goalSettings, loading: false, error: null as string | null, save };
  return { settings: q.state.data, loading: q.state.loading, error: q.state.error, save };
}

export function useRules() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<Rule[]>(cloud, `rules-${user?.id}`, () => api<{ rules: Rule[] }>('listRules', {}, '讀取球隊規章').then((r) => r.rules), []);
  const update = useCallback(
    async (id: string, edit: RuleEdit) => {
      if (!cloud) return void (await perform('修改球隊規章', (d) => updateRule(d, user, id, edit)));
      const r = await api<{ rule: Rule }>('updateRule', { id, ...edit }, '修改球隊規章');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.rule) }));
    },
    [cloud, perform, user, api, q.setState],
  );
  /** 雲端規章是空的時候，匯入依規章圖片輸入的 17 條 */
  const importDefaults = useCallback(async () => {
    const rules = createSeedRules(new Date().toISOString()).map(({ no, title, content, category, needsCoachReview, reviewNote, isAnnouncement }) => ({ no, title, content, category, needsCoachReview, reviewNote, isAnnouncement }));
    await api('importRules', { rules }, '匯入球隊規章');
    q.reload();
  }, [api, q.reload]);
  if (!cloud) return { rules: db.rules, loading: false, error: null as string | null, reload: () => undefined, update, importDefaults };
  return { rules: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, update, importDefaults };
}

export function useArticles() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<KnowledgeArticle[]>(cloud, `articles-${user?.id}`, () => api<{ articles: KnowledgeArticle[] }>('listArticles', {}, '讀取防護知識').then((r) => r.articles), []);
  const upsert = useCallback(
    async (input: ArticleInput) => {
      if (!cloud) return void (await perform(input.id ? '修改防護知識' : '新增防護知識', (d) => upsertArticle(d, user, input)));
      const r = await api<{ article: KnowledgeArticle }>('upsertArticle', input, input.id ? '修改防護知識' : '新增防護知識');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.article) }));
    },
    [cloud, perform, user, api, q.setState],
  );
  const setStatus = useCallback(
    async (id: string, status: PublishStatus) => {
      if (!cloud) return void (await perform('變更文章狀態', (d) => setArticleStatus(d, user, id, status)));
      const r = await api<{ article: KnowledgeArticle }>('setArticleStatus', { id, status }, '變更文章狀態');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.article) }));
    },
    [cloud, perform, user, api, q.setState],
  );
  /** 雲端知識庫是空的時候，匯入 6 篇示範文章（雲端一律存成草稿，審閱後再發布） */
  const importDefaults = useCallback(async () => {
    const articles = createSeedArticles(todayStr()).map(({ id: _id, status: _s, updatedAt: _u, ...rest }) => rest);
    await api('importArticles', { articles }, '匯入防護知識');
    q.reload();
  }, [api, q.reload]);
  if (!cloud) return { articles: db.articles, loading: false, error: null as string | null, reload: () => undefined, upsert, setStatus, importDefaults };
  return { articles: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, upsert, setStatus, importDefaults };
}

export function useAnnouncements() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const q = useCloudQuery<Announcement[]>(cloud, `announcements-${user?.id}`, () => api<{ announcements: Announcement[] }>('listAnnouncements', {}, '讀取公告').then((r) => r.announcements), []);
  const upsert = useCallback(
    async (input: AnnouncementInput) => {
      if (!cloud) return void (await perform(input.id ? '修改公告' : '新增公告', (d) => upsertAnnouncement(d, user, input)));
      const r = await api<{ announcement: Announcement }>('upsertAnnouncement', input, input.id ? '修改公告' : '新增公告');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.announcement) }));
    },
    [cloud, perform, user, api, q.setState],
  );
  const setStatus = useCallback(
    async (id: string, status: PublishStatus) => {
      if (!cloud) return void (await perform('變更公告狀態', (d) => setAnnouncementStatus(d, user, id, status)));
      const r = await api<{ announcement: Announcement }>('setAnnouncementStatus', { id, status }, '變更公告狀態');
      q.setState((s) => ({ ...s, data: upsertById(s.data, r.announcement) }));
    },
    [cloud, perform, user, api, q.setState],
  );
  if (!cloud) return { announcements: db.announcements, loading: false, error: null as string | null, reload: () => undefined, upsert, setStatus };
  return { announcements: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, upsert, setStatus };
}

/** 依目標類型的預設天數計算期限 */
export function dueDateFor(settings: GoalTermSetting[], term: Goal['term'], start: string): string {
  const days = settings.find((s) => s.term === term)?.defaultDays ?? 7;
  const [y, m, d] = start.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}
