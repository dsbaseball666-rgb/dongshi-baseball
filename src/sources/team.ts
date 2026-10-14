import { useCallback } from 'react';
import type { AttendanceRecord, AttendanceStatus, BudgetItem, Game, Player, PlayerProfile, PracticeDay, PracticeType, Tournament, Transaction } from '../types';
import { useStore } from '../store/DemoStore';
import { useCloudQuery } from './hooks';
import { addDays } from '../lib/date';

// 球隊管理：練球通知、出缺席、通訊錄、預算、賽事（只在雲端模式提供；權限由 Apps Script 檢查）

export const PRACTICE_TYPES: PracticeType[] = ['練球', '休息', '比賽', '其他'];
export const PRACTICE_ICONS: Record<string, string> = { 練球: '⚾', 休息: '😴', 比賽: '🏆', 其他: '📌' };
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['出席', '遲到', '早退', '事假', '病假', '公假', '缺席'];
export const ATTENDANCE_TONE: Record<AttendanceStatus, 'green' | 'yellow' | 'blue' | 'purple' | 'red' | 'gray'> = {
  出席: 'green', 遲到: 'yellow', 早退: 'yellow', 事假: 'blue', 病假: 'purple', 公假: 'gray', 缺席: 'red',
};
/** 算出席率時當成「有到」的狀態 */
export const PRESENT_STATUSES: AttendanceStatus[] = ['出席', '遲到', '早退'];
export const TOURNAMENT_KINDS = ['盃賽', '聯賽', '友誼賽', '其他'] as const;

export type PracticeInput = Pick<PracticeDay, 'date' | 'startTime' | 'endTime' | 'location' | 'content' | 'note'> & { type: PracticeType | '' };
export type ProfileInput = Omit<PlayerProfile, 'updatedBy' | 'updatedAt'>;
export type BudgetItemInput = Omit<BudgetItem, 'id' | 'amount'> & { id?: string; amount: string };
export type TransactionInput = Pick<Transaction, 'year' | 'date' | 'type' | 'itemId' | 'title' | 'handler' | 'note'> & { id?: string; amount: string };
export type TournamentInput = Omit<Tournament, 'id' | 'fee' | 'updatedAt'> & { id?: string; fee: string };
export type GameInput = Omit<Game, 'id' | 'ourScore' | 'oppScore'> & { id?: string; ourScore: string; oppScore: string };

/** 這個日期所在那一週的星期一 */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay() || 7;
  return addDays(dateStr, 1 - day);
}

/** 學年度（8 月開始），例如 2026-10-14 → 「115學年度」 */
export function schoolYearOf(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${(m >= 8 ? y : y - 1) - 1911}學年度`;
}

export function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
}

export function money(n: number): string {
  return n.toLocaleString('zh-TW');
}

/** 可以直接貼到 LINE 群組的一週練球通知 */
export function practiceNoticeText(monday: string, days: PracticeDay[]): string {
  const lines = [`⚾ 東勢國中棒球隊 一週練球通知（${shortDate(monday)}～${shortDate(addDays(monday, 6))}）`, ''];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const d = days.find((x) => x.date === date);
    if (!d) {
      lines.push(`${shortDate(date)}　（未安排）`);
      continue;
    }
    const time = d.startTime ? ` ${d.startTime}${d.endTime ? '–' + d.endTime : ''}` : '';
    const parts = [`${shortDate(date)}　${PRACTICE_ICONS[d.type]} ${d.type}${time}`];
    if (d.location) parts.push(`📍${d.location}`);
    lines.push(parts.join('　'));
    if (d.content) lines.push(`　　內容：${d.content}`);
    if (d.note) lines.push(`　　備註：${d.note}`);
  }
  return lines.join('\n');
}

export function gameResult(g: Pick<Game, 'ourScore' | 'oppScore'>): '勝' | '敗' | '和' | '' {
  if (g.ourScore === null || g.oppScore === null) return '';
  return g.ourScore > g.oppScore ? '勝' : g.ourScore < g.oppScore ? '敗' : '和';
}

/** 賽事目前的狀態（依日期自動判斷） */
export function tournamentStatus(t: Pick<Tournament, 'startDate' | 'endDate'>, today: string): { label: string; tone: 'blue' | 'green' | 'gray' } {
  if (today < t.startDate) return { label: '即將開始', tone: 'blue' };
  if (today <= (t.endDate || t.startDate)) return { label: '進行中', tone: 'green' };
  return { label: '已結束', tone: 'gray' };
}

export function usePractice(from: string, to: string) {
  const { mode, api } = useStore();
  const q = useCloudQuery<PracticeDay[]>(mode === 'cloud', `practice-${from}-${to}`, () => api<{ days: PracticeDay[] }>('listPractice', { from, to }, '讀取練球通知').then((r) => r.days), []);
  const save = useCallback(
    async (days: PracticeInput[]) => {
      await api('savePracticeWeek', { days }, '儲存練球通知');
      q.reload();
    },
    [api, q.reload],
  );
  return { days: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save };
}

export function useAttendance(from: string, to: string) {
  const { mode, api } = useStore();
  const q = useCloudQuery<AttendanceRecord[]>(mode === 'cloud', `attendance-${from}-${to}`, () => api<{ records: AttendanceRecord[] }>('listAttendance', { from, to }, '讀取出缺席').then((r) => r.records), []);
  const save = useCallback(
    async (date: string, records: { playerId: string; status: AttendanceStatus | ''; reason: string }[]) => {
      const r = await api<{ records: AttendanceRecord[] }>('saveAttendance', { date, records }, '儲存點名');
      q.setState((st) => ({ ...st, data: [...st.data.filter((x) => x.date !== date), ...r.records] }));
    },
    [api, q.setState],
  );
  return { records: q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save };
}

export function useProfiles() {
  const { mode, api } = useStore();
  const q = useCloudQuery<{ profiles: PlayerProfile[]; players: Player[] }>(
    mode === 'cloud',
    'profiles',
    () => api<{ profiles: PlayerProfile[]; players: Player[] }>('listProfiles', {}, '讀取通訊錄'),
    { profiles: [], players: [] },
  );
  const save = useCallback(
    async (input: ProfileInput) => {
      const r = await api<{ profile: PlayerProfile }>('saveProfile', input, '儲存個人資料');
      q.setState((st) => ({ ...st, data: { ...st.data, profiles: [...st.data.profiles.filter((x) => x.playerId !== r.profile.playerId), r.profile] } }));
    },
    [api, q.setState],
  );
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save };
}

interface BudgetData {
  years: string[];
  items: BudgetItem[];
  transactions: Transaction[];
}

export function useBudget(year: string) {
  const { mode, api } = useStore();
  const q = useCloudQuery<BudgetData>(mode === 'cloud', `budget-${year}`, () => api<BudgetData>('listBudget', { year }, '讀取預算'), { years: [], items: [], transactions: [] });
  const after = useCallback(
    <T,>(p: Promise<T>) =>
      p.then((r) => {
        q.reload();
        return r;
      }),
    [q.reload],
  );
  const saveItem = useCallback((input: BudgetItemInput) => after(api('saveBudgetItem', input, '儲存預算項目')), [api, after]);
  const deleteItem = useCallback((id: string) => after(api('deleteBudgetItem', { id }, '刪除預算項目')), [api, after]);
  const saveTransaction = useCallback((input: TransactionInput) => after(api('saveTransaction', input, '儲存收支')), [api, after]);
  const deleteTransaction = useCallback((id: string) => after(api('deleteTransaction', { id }, '刪除收支')), [api, after]);
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, saveItem, deleteItem, saveTransaction, deleteTransaction };
}

interface TournamentData {
  tournaments: Tournament[];
  games: Game[];
  names: Record<string, string>;
  today: string;
}

export function useTournaments() {
  const { mode, api } = useStore();
  const q = useCloudQuery<TournamentData>(mode === 'cloud', 'tournaments', () => api<TournamentData>('listTournaments', {}, '讀取賽事'), { tournaments: [], games: [], names: {}, today: '' });
  const after = useCallback(
    <T,>(p: Promise<T>) =>
      p.then((r) => {
        q.reload();
        return r;
      }),
    [q.reload],
  );
  const saveTournament = useCallback((input: TournamentInput) => after(api<{ tournament: Tournament }>('saveTournament', input, '儲存賽事')), [api, after]);
  const deleteTournament = useCallback((id: string) => after(api('deleteTournament', { id }, '刪除賽事')), [api, after]);
  const saveGame = useCallback((input: GameInput) => after(api('saveGame', input, '儲存比賽')), [api, after]);
  const deleteGame = useCallback((id: string) => after(api('deleteGame', { id }, '刪除比賽')), [api, after]);
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, saveTournament, deleteTournament, saveGame, deleteGame };
}
