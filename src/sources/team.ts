import { useCallback, useMemo } from 'react';
import type { AttendanceRecord, AttendanceStatus, BudgetItem, Game, Player, PlayerProfile, PracticeDay, PracticeType, Tournament, TrainingWeek, Transaction } from '../types';
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
export type TournamentInput = Omit<Tournament, 'id' | 'fee' | 'updatedAt' | 'jerseys'> & { id?: string; fee: string };
export type GameInput = Omit<Game, 'id' | 'ourScore' | 'oppScore'> & { id?: string; ourScore: string; oppScore: string };

/** 依背號排序（沒有背號的排最後），背號相同再依姓名 */
export const byNumber = (a: Player, b: Player) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name, 'zh-TW');

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

/** 包住一個寫入動作：成功後重新讀取資料 */
const thenReload =
  (reload: () => void) =>
  <T,>(p: Promise<T>) =>
    p.then((r) => {
      reload();
      return r;
    });

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
  const after = useMemo(() => thenReload(q.reload), [q.reload]);
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
  const after = useMemo(() => thenReload(q.reload), [q.reload]);
  const saveTournament = useCallback((input: TournamentInput) => after(api<{ tournament: Tournament }>('saveTournament', input, '儲存賽事')), [api, after]);
  const deleteTournament = useCallback((id: string) => after(api('deleteTournament', { id }, '刪除賽事')), [api, after]);
  const saveGame = useCallback((input: GameInput) => after(api('saveGame', input, '儲存比賽')), [api, after]);
  const deleteGame = useCallback((id: string) => after(api('deleteGame', { id }, '刪除比賽')), [api, after]);
  const saveJerseys = useCallback((tournamentId: string, jerseys: Record<string, string>) => after(api('saveJerseys', { tournamentId, jerseys }, '儲存球衣號碼')), [api, after]);
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, saveTournament, deleteTournament, saveGame, deleteGame, saveJerseys };
}

/* ───────── 教練練球安排 ───────── */

/** 06:00～21:30，每 15 分鐘一格 */
export const TIME_OPTIONS = Array.from({ length: 63 }, (_, i) => {
  const m = 6 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

/* ───────── 每週訓練課表（組別 × 星期幾） ───────── */

/** 每天預設的練球時間（星期一～日）：一二三五 17:00–18:00、四 15:00–17:00、六 13:30–18:00、日休兵 */
export const WEEK_DAY_DEFAULTS: { off: boolean; startTime: string; endTime: string; note: string }[] = [
  { off: false, startTime: '17:00', endTime: '18:00', note: '' },
  { off: false, startTime: '17:00', endTime: '18:00', note: '' },
  { off: false, startTime: '17:00', endTime: '18:00', note: '' },
  { off: false, startTime: '15:00', endTime: '17:00', note: '' },
  { off: false, startTime: '17:00', endTime: '18:00', note: '' },
  {
    off: false,
    startTime: '13:30',
    endTime: '18:00',
    note: '熱身階段 13:30-14:10\n第一階段 14:15-14:45\n第二階段 14:50-15:40\n第三階段 15:50-16:40\n整理場地 16:40-16:50\n第四階段 16:50-17:20\n收操 17:20-18:00',
  },
  { off: true, startTime: '', endTime: '', note: '' },
];
export const DEFAULT_GROUPS = ['投手組', '內野手組', '打擊組'];
/** 常用的訓練主題（也可以自己打） */
export const CELL_TITLES = ['練球日', '重訓日', '投球訓練', '牛棚日', '放鬆日', '敏捷訓練', '守備練習', '守備訓練', '打擊練習', '打擊訓練', '體能訓練', '比賽'];

interface TrainingWeekData {
  week: TrainingWeek | null;
  /** 上一週（教練才有，可以複製） */
  last: TrainingWeek | null;
  names: Record<string, string>;
  today: string;
}

export function useTrainingWeek(weekStart: string) {
  const { mode, api } = useStore();
  const q = useCloudQuery<TrainingWeekData>(mode === 'cloud', `training-week-${weekStart}`, () => api<TrainingWeekData>('getTrainingWeek', { weekStart }, '讀取訓練課表'), {
    week: null,
    last: null,
    names: {},
    today: '',
  });
  const save = useCallback(
    async (week: TrainingWeek) => {
      await api('saveTrainingWeek', { weekStart: week.weekStart, groups: week.groups, days: week.days, cells: week.cells }, '儲存訓練課表');
      q.reload();
    },
    [api, q.reload],
  );
  return { ...q.state.data, loading: q.state.loading, error: q.state.error, reload: q.reload, save };
}

/** 一週的空白課表：預設時間與三個組別 */
export function blankTrainingWeek(weekStart: string): TrainingWeek {
  return {
    weekStart,
    groups: DEFAULT_GROUPS.map((name, i) => ({ id: `g${i + 1}`, name, playerIds: [] })),
    days: WEEK_DAY_DEFAULTS.map((d, i) => ({ date: addDays(weekStart, i), ...d })),
    cells: [],
  };
}

/** 把上一週的課表搬到這一週（日期往後 7 天） */
export function shiftTrainingWeek(w: TrainingWeek, weekStart: string): TrainingWeek {
  const move = (date: string) => addDays(date, 7);
  return {
    weekStart,
    groups: w.groups.map((g) => ({ ...g, playerIds: [...g.playerIds] })),
    days: w.days.map((d) => ({ ...d, date: move(d.date) })),
    cells: w.cells.map((c) => ({ ...c, date: move(c.date), playerIds: [...c.playerIds] })),
  };
}

/* ───────── 球衣號碼（只在賽事用） ───────── */

/** 可以選的號碼：0、00、1～99 */
export const JERSEY_NUMBERS = ['0', '00', ...Array.from({ length: 99 }, (_, i) => String(i + 1))];
/** 號碼排序：0、00、1、2…99 */
export const jerseyOrder = (no: string) => (no === '00' ? 0.5 : Number(no));

/* ───────── 球員大頭照（全隊看得到，教練可以更換） ───────── */

export function usePhotos(enabled = true) {
  const { mode, api } = useStore();
  const q = useCloudQuery<Record<string, string>>(mode === 'cloud' && enabled, 'photos', () => api<{ photos: Record<string, string> }>('listPhotos', {}, '讀取大頭照').then((r) => r.photos), {});
  const savePhoto = useCallback(
    async (playerId: string, image: string) => {
      const r = await api<{ playerId: string; photo: string }>('savePhoto', { playerId, image }, '上傳大頭照');
      q.setState((st) => ({ ...st, data: { ...st.data, [r.playerId]: r.photo } }));
    },
    [api, q.setState],
  );
  const deletePhoto = useCallback(
    async (playerId: string) => {
      await api('deletePhoto', { playerId }, '刪除大頭照');
      q.setState((st) => {
        const data = { ...st.data };
        delete data[playerId];
        return { ...st, data };
      });
    },
    [api, q.setState],
  );
  // 從雲端硬碟資料夾匯入用
  const listSources = useCallback(() => api<{ folders: { id: string; name: string }[] }>('listPhotoSources', {}, '讀取雲端資料夾').then((r) => r.folders), [api]);
  const listFolder = useCallback((folderId: string) => api<{ files: { id: string; name: string }[] }>('listPhotoFolder', { folderId }, '讀取資料夾裡的照片').then((r) => r.files), [api]);
  const getFile = useCallback((folderId: string, fileId: string) => api<{ image: string }>('getPhotoFile', { folderId, fileId }, '讀取照片').then((r) => r.image), [api]);
  return { photos: q.state.data, loading: q.state.loading, error: q.state.error, savePhoto, deletePhoto, listSources, listFolder, getFile };
}
