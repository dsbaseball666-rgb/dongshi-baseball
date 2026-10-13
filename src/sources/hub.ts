import { useCallback } from 'react';
import type { DailyNote, ExamScore, FitnessTest, Goal, HubMessage, Player, SchoolRecord, TeamEvent } from '../types';
import { useStore } from '../store/DemoStore';
import { useCloudQuery } from './hooks';

// 家長、老師、教練三方平台（只在雲端模式提供；權限由 Apps Script 檢查）

export interface HubSummary {
  today: string;
  player: Player;
  events: TeamEvent[];
  messages: HubMessage[];
  schoolRecords: SchoolRecord[];
  notes: DailyNote[];
  goals: Goal[];
  fitness: FitnessTest[];
  exams: ExamScore[];
}

export type SchoolRecordInput = Pick<SchoolRecord, 'playerId' | 'date' | 'category' | 'rating' | 'content'> & { id?: string };
export type EventInput = Pick<TeamEvent, 'title' | 'date' | 'startTime' | 'endTime' | 'location' | 'category' | 'playerIds' | 'note'> & { id?: string };

export const SCHOOL_CATEGORIES = ['上課表現', '作業繳交', '學習態度', '出缺席', '品德行為', '其他'];
export const SCHOOL_RATINGS = ['優良', '良好', '普通', '待加強'];
export const EVENT_CATEGORIES = ['練習', '比賽', '考試', '學校活動', '集合出發', '其他'];
export const EVENT_ICONS: Record<string, string> = { 練習: '⚾', 比賽: '🏆', 考試: '📝', 學校活動: '🏫', 集合出發: '🚌', 其他: '📌' };

/** 一位學生的總覽（一次讀完） */
export function useHub(playerId: string) {
  const { mode, api } = useStore();
  const q = useCloudQuery<HubSummary | null>(mode === 'cloud' && !!playerId, `hub-${playerId}`, () => api<HubSummary>('hubSummary', { playerId }, '讀取親師平台'), null);
  const patch = useCallback((fn: (s: HubSummary) => HubSummary) => q.setState((st) => ({ ...st, data: st.data ? fn(st.data) : st.data })), [q.setState]);

  const postMessage = useCallback(
    async (body: string) => {
      const r = await api<{ message: HubMessage }>('postMessage', { playerId, body }, '送出留言');
      patch((s) => ({ ...s, messages: [...s.messages, r.message] }));
    },
    [api, playerId, patch],
  );
  const deleteMessage = useCallback(
    async (id: string) => {
      await api('deleteMessage', { id }, '刪除留言');
      patch((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }));
    },
    [api, patch],
  );
  const saveRecord = useCallback(
    async (input: SchoolRecordInput) => {
      const r = await api<{ record: SchoolRecord }>('saveSchoolRecord', input, '儲存在校表現');
      patch((s) => ({ ...s, schoolRecords: [r.record, ...s.schoolRecords.filter((x) => x.id !== r.record.id)].sort((a, b) => (a.date < b.date ? 1 : -1)) }));
    },
    [api, patch],
  );
  const deleteRecord = useCallback(
    async (id: string) => {
      await api('deleteSchoolRecord', { id }, '刪除在校表現');
      patch((s) => ({ ...s, schoolRecords: s.schoolRecords.filter((x) => x.id !== id) }));
    },
    [api, patch],
  );
  const saveEvent = useCallback(
    async (input: EventInput) => {
      await api('saveEvent', input, '儲存行程');
      q.reload();
    },
    [api, q.reload],
  );
  const deleteEvent = useCallback(
    async (id: string) => {
      await api('deleteEvent', { id }, '刪除行程');
      patch((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }));
    },
    [api, patch],
  );

  return { data: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, postMessage, deleteMessage, saveRecord, deleteRecord, saveEvent, deleteEvent };
}

/** 自己看得到的行程（首頁「最近行程」用） */
export function useEvents() {
  const { mode, api, user } = useStore();
  const q = useCloudQuery<TeamEvent[]>(mode === 'cloud', `events-${user?.id}`, () => api<{ events: TeamEvent[] }>('listEvents', {}, '讀取行程').then((r) => r.events), []);
  return { events: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload };
}

/** 「10/15（三）16:00–18:00」 */
export function formatEventTime(e: Pick<TeamEvent, 'date' | 'startTime' | 'endTime'>): string {
  const [y, m, d] = e.date.split('-').map(Number);
  const w = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  const time = e.startTime ? ` ${e.startTime}${e.endTime ? '–' + e.endTime : ''}` : '';
  return `${m}/${d}（${w}）${time}`;
}
