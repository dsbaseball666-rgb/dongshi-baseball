import { useCallback, useMemo } from 'react';
import type { FitnessItemKey, FitnessTest } from '../types';
import { useStore } from '../store/DemoStore';
import { useCloudQuery } from '../sources/hooks';
import { addFitness, deleteFitness, updateFitness, type FitnessInput } from '../store/actions';

export interface BatchInput {
  date: string;
  item: FitnessItemKey;
  note: string;
  /** 有 id 代表修改那一筆（當天已經輸入過），沒有 id 就新增；note 是這一位球員自己的備註（例如揮棒速度 10 次明細），沒有就用整批共用的 note */
  entries: { playerId: string; value: number; id?: string; note?: string }[];
}

const upsert = (list: FitnessTest[], recs: FitnessTest[]) => {
  const ids = new Set(recs.map((r) => r.id));
  return [...list.filter((r) => !ids.has(r.id)), ...recs];
};

/**
 * 體能檢測系統的資料：教練讀全隊紀錄（listTeamFitness），球員只讀自己的（listFitness）。
 * 資料就是原本試算表 FitnessTests 工作表裡的紀錄（含從舊系統匯入的），和冒險筆記本的體能頁面共用。
 */
export function useTeamFitness() {
  const { mode, db, user, api, perform } = useStore();
  const cloud = mode === 'cloud';
  const coach = user?.role === 'coach';
  const ownId = user?.playerId ?? '';
  const q = useCloudQuery<FitnessTest[]>(
    cloud && (coach || !!ownId),
    `team-fitness-${user?.id}`,
    () =>
      coach
        ? api<{ records: FitnessTest[] }>('listTeamFitness', {}, '讀取全隊體能檢測').then((r) => r.records)
        : api<{ records: FitnessTest[] }>('listFitness', { playerId: ownId }, '讀取體能檢測').then((r) => r.records),
    [],
  );
  const setRecords = q.setState;

  const saveBatch = useCallback(
    async (input: BatchInput) => {
      if (!cloud) {
        await perform('整隊輸入體能檢測', (d) =>
          input.entries.reduce((acc, e) => {
            const fi: FitnessInput = { playerId: e.playerId, date: input.date, item: input.item, value: e.value, note: e.note ?? input.note };
            return e.id ? updateFitness(acc, user, e.id, fi) : addFitness(acc, user, fi);
          }, d),
        );
        return;
      }
      const r = await api<{ records: FitnessTest[] }>('saveFitnessBatch', input, '整隊輸入體能檢測');
      setRecords((s) => ({ ...s, data: upsert(s.data, r.records) }));
    },
    [cloud, perform, user, api, setRecords],
  );

  const add = useCallback(
    async (input: FitnessInput) => {
      if (!cloud) return void (await perform('新增體能檢測', (d) => addFitness(d, user, input)));
      const r = await api<{ record: FitnessTest }>('addFitness', input, '新增體能檢測');
      setRecords((s) => ({ ...s, data: upsert(s.data, [r.record]) }));
    },
    [cloud, perform, user, api, setRecords],
  );

  const update = useCallback(
    async (id: string, input: FitnessInput) => {
      if (!cloud) return void (await perform('修改體能檢測', (d) => updateFitness(d, user, id, input)));
      const r = await api<{ record: FitnessTest }>('updateFitness', { id, ...input }, '修改體能檢測');
      setRecords((s) => ({ ...s, data: upsert(s.data, [r.record]) }));
    },
    [cloud, perform, user, api, setRecords],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!cloud) return void (await perform('刪除體能檢測', (d) => deleteFitness(d, user, id)));
      await api('deleteFitness', { id }, '刪除體能檢測');
      setRecords((s) => ({ ...s, data: s.data.filter((r) => r.id !== id) }));
    },
    [cloud, perform, user, api, setRecords],
  );

  const demoRecords = useMemo(() => (coach ? db.fitness : db.fitness.filter((f) => f.playerId === ownId)), [coach, db.fitness, ownId]);
  const base = { saveBatch, add, update, remove };
  if (!cloud) return { records: demoRecords, loading: false, error: null, reload: () => undefined, ...base };
  return { records: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, ...base };
}

export type TeamFitness = ReturnType<typeof useTeamFitness>;
