import { useCallback } from 'react';
import type { ExamScore } from '../types';
import { useStore } from '../store/DemoStore';
import { useCloudQuery } from './hooks';

// 段考成績只在雲端模式提供（示範模式不顯示這個功能）。權限由 Apps Script 檢查：
// 教練讀寫全隊；球員只讀自己；家長只讀子女。

export interface ExamBatch {
  schoolYear: number;
  semester: '上' | '下';
  examNo: number;
  grade: 7 | 8 | 9;
  entries: { playerId: string; scores: Record<string, number>; note: string }[];
}

/** playerId 為 null 時讀取全隊（只有教練可以） */
export function useExamScores(playerId: string | null) {
  const { mode, api } = useStore();
  const enabled = mode === 'cloud' && playerId !== '';
  const q = useCloudQuery<ExamScore[]>(enabled, `exams-${playerId ?? 'all'}`, () => api<{ records: ExamScore[] }>('listExamScores', playerId ? { playerId } : {}, '讀取段考成績').then((r) => r.records), []);

  const save = useCallback(
    async (batch: ExamBatch) => {
      const r = await api<{ created: number; updated: number; records: ExamScore[] }>('saveExamScores', batch, '儲存段考成績');
      q.setState((s) => ({ ...s, data: [...s.data.filter((x) => !r.records.some((n) => n.id === x.id)), ...r.records] }));
      return r;
    },
    [api, q.setState],
  );

  const remove = useCallback(
    async (id: string) => {
      await api('deleteExamScore', { id }, '刪除段考成績');
      q.setState((s) => ({ ...s, data: s.data.filter((x) => x.id !== id) }));
    },
    [api, q.setState],
  );

  return { records: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save, remove };
}
