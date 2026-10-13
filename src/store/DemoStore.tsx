import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DemoDB, Outcome, SyncError, User } from '../types';
import { createSeed, SEED_VERSION } from '../data/seed';
import { config, isCloudConfigured } from '../config';
import { ApiError, callApi } from '../api/client';

// 兩種模式：
//   demo  ─ 示範模式：資料只存在這台電腦的瀏覽器（localStorage）。
//   cloud ─ 雲端模式：登入、每日筆記、體能檢測、帳號管理透過 Apps Script 存取 Google 試算表，
//           使用者身分與角色一律以伺服器回傳為準。

const DB_KEY = 'dongshi-baseball-demo-db';
const SESSION_KEY = 'dongshi-baseball-session';
const CLOUD_ERRORS_KEY = 'dongshi-baseball-cloud-errors';

type Mutator<R> = (db: DemoDB) => DemoDB | Outcome<R>;
export type Mode = 'demo' | 'cloud';

type Session = { mode: 'demo'; userId: string } | { mode: 'cloud'; token: string; user: User };

interface StoreValue {
  ready: boolean;
  mode: Mode | null;
  db: DemoDB;
  user: User | null;
  loadWarning: string | null;
  login: (userId: string) => void;
  cloudLogin: (loginId: string, code: string) => Promise<void>;
  /** 修改自己的登入碼（舊的登入狀態會失效，改用伺服器發的新 token） */
  changeMyCode: (oldCode: string, newCode: string) => Promise<void>;
  logout: () => void;
  perform: <R = void>(label: string, fn: Mutator<R>) => Promise<R | undefined>;
  /** 呼叫雲端 API（自動帶入 token、記錄錯誤、登入過期時自動登出） */
  api: <T>(action: string, payload: object, label?: string) => Promise<T>;
  cloudErrors: SyncError[];
  resolveCloudError: (id: string) => void;
  simulateFailure: boolean;
  setSimulateFailure: (v: boolean) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function isOutcome<R>(x: DemoDB | Outcome<R>): x is Outcome<R> {
  return 'result' in x && 'db' in x;
}

function persist(db: DemoDB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new Error('瀏覽器本機儲存失敗（可能是無痕模式或儲存空間已滿），這次的變更沒有被保存。');
  }
}

function loadInitial(): { db: DemoDB; warning: string | null } {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDB;
      if (parsed.version === SEED_VERSION) return { db: parsed, warning: null };
      return { db: createSeed(), warning: '示範資料格式已更新，已重新載入新的示範資料。' };
    }
  } catch {
    return { db: createSeed(), warning: '讀取瀏覽器中的示範資料失敗，已改用全新的示範資料。' };
  }
  return { db: createSeed(), warning: null };
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* 無法記住登入狀態時，仍允許本次使用 */
  }
}

function readCloudErrors(): SyncError[] {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_ERRORS_KEY) ?? '[]') as SyncError[];
  } catch {
    return [];
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [db, setDb] = useState<DemoDB>(() => createSeed());
  const [session, setSession] = useState<Session | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [cloudErrors, setCloudErrors] = useState<SyncError[]>([]);
  const dbRef = useRef(db);
  const simRef = useRef(simulateFailure);
  simRef.current = simulateFailure;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const { db: initial, warning } = loadInitial();
    dbRef.current = initial;
    setDb(initial);
    setLoadWarning(warning);
    setCloudErrors(readCloudErrors());
    try {
      persist(initial);
    } catch (e) {
      setLoadWarning(e instanceof Error ? e.message : String(e));
    }
    const saved = readSession();
    if (saved?.mode === 'cloud' && isCloudConfigured) {
      // 重新整理頁面時，向伺服器確認登入仍然有效
      callApi<{ user: User }>('me', {}, saved.token)
        .then((r) => {
          const s: Session = { mode: 'cloud', token: saved.token, user: r.user };
          writeSession(s);
          setSession(s);
        })
        .catch((e: unknown) => {
          writeSession(null);
          setLoadWarning(e instanceof ApiError && e.code === 'AUTH' ? '登入已過期，請重新登入。' : '無法確認登入狀態，請重新登入。');
        })
        .finally(() => setReady(true));
      return;
    }
    if (saved?.mode === 'demo') setSession(saved);
    setReady(true);
  }, []);

  const commit = useCallback((next: DemoDB) => {
    persist(next);
    dbRef.current = next;
    setDb(next);
  }, []);

  const recordCloudError = useCallback((operation: string, message: string) => {
    setCloudErrors((prev) => {
      const next = [{ id: `CE-${Date.now()}`, at: new Date().toISOString(), operation, message, resolved: false }, ...prev].slice(0, 100);
      try {
        localStorage.setItem(CLOUD_ERRORS_KEY, JSON.stringify(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });
  }, []);

  const resolveCloudError = useCallback((id: string) => {
    setCloudErrors((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, resolved: true } : e));
      try {
        localStorage.setItem(CLOUD_ERRORS_KEY, JSON.stringify(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    const s = sessionRef.current;
    if (s?.mode === 'cloud') callApi('logout', {}, s.token).catch(() => undefined);
    writeSession(null);
    setSession(null);
  }, []);

  const api = useCallback(
    async <T,>(action: string, payload: object, label?: string): Promise<T> => {
      const s = sessionRef.current;
      try {
        return await callApi<T>(action, payload, s?.mode === 'cloud' ? s.token : undefined);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('ERROR', String(e));
        // 權限不足與輸入錯誤屬於正常回應，不記為同步錯誤
        if (!['FORBIDDEN', 'INVALID', 'NOT_FOUND'].includes(err.code)) recordCloudError(label ?? action, err.message);
        if (err.code === 'AUTH' && s?.mode === 'cloud') {
          writeSession(null);
          setSession(null);
          setLoadWarning(err.message);
        }
        throw err;
      }
    },
    [recordCloudError],
  );

  const cloudLogin = useCallback(async (loginId: string, code: string) => {
    const r = await callApi<{ token: string; user: User }>('login', { loginId, code });
    const s: Session = { mode: 'cloud', token: r.token, user: r.user };
    writeSession(s);
    setLoadWarning(null);
    setSession(s);
  }, []);

  const changeMyCode = useCallback(
    async (oldCode: string, newCode: string) => {
      const s = sessionRef.current;
      if (s?.mode !== 'cloud') throw new Error('示範模式沒有登入碼。');
      const r = await api<{ token: string }>('changeMyCode', { oldCode, newCode }, '修改登入碼');
      const next: Session = { mode: 'cloud', token: r.token, user: s.user };
      writeSession(next);
      setSession(next);
    },
    [api],
  );

  const perform = useCallback(
    async <R,>(label: string, fn: Mutator<R>): Promise<R | undefined> => {
      await delay(config.demoLatencyMs);
      if (simRef.current) {
        const failed: DemoDB = {
          ...dbRef.current,
          syncErrors: [
            { id: `SE-${Date.now()}`, at: new Date().toISOString(), operation: label, message: '模擬連線失敗：資料未儲存', resolved: false },
            ...dbRef.current.syncErrors,
          ],
        };
        try {
          commit(failed);
        } catch {
          /* 記錄錯誤本身失敗時不再處理 */
        }
        throw new Error(`「${label}」失敗：無法連線（教練後台開啟了「模擬連線失敗」）。資料沒有被儲存，請稍後再試。`);
      }
      const out = fn(dbRef.current);
      const next = isOutcome(out) ? out.db : out;
      commit(next);
      return isOutcome(out) ? out.result : undefined;
    },
    [commit],
  );

  const login = useCallback((id: string) => {
    const s: Session = { mode: 'demo', userId: id };
    writeSession(s);
    setLoadWarning(null);
    setSession(s);
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = createSeed();
    commit(fresh);
    setLoadWarning(null);
  }, [commit]);

  const user = useMemo(() => {
    if (!session) return null;
    if (session.mode === 'cloud') return session.user;
    return db.users.find((u) => u.id === session.userId && u.active) ?? null;
  }, [db.users, session]);

  const value: StoreValue = {
    ready,
    mode: session?.mode ?? null,
    db,
    user,
    loadWarning,
    login,
    cloudLogin,
    changeMyCode,
    logout,
    perform,
    api,
    cloudErrors,
    resolveCloudError,
    simulateFailure,
    setSimulateFailure,
    resetDemo,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必須在 DemoStoreProvider 內使用');
  return ctx;
}

export interface ActionState {
  pending: boolean;
  error: string | null;
  message: string | null;
  run: <R = void>(label: string, fn: Mutator<R>, successMessage?: string) => Promise<{ ok: boolean; result?: R }>;
  clear: () => void;
}

/** 包裝一次示範資料操作的「處理中／成功／失敗」狀態，失敗時一定顯示錯誤，不假裝成功 */
export function useAction(): ActionState {
  const { perform } = useStore();
  const task = useTask();
  const run = useCallback(
    <R,>(label: string, fn: Mutator<R>, successMessage?: string) => task.run(() => perform<R>(label, fn), successMessage),
    [perform, task.run],
  );
  return { pending: task.pending, error: task.error, message: task.message, run, clear: task.clear };
}

export interface TaskState {
  pending: boolean;
  error: string | null;
  message: string | null;
  run: <R>(fn: () => Promise<R>, successMessage?: string) => Promise<{ ok: boolean; result?: R }>;
  clear: () => void;
}

/** 任何非同步操作（示範或雲端）的「處理中／成功／失敗」狀態 */
export function useTask(): TaskState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>, successMessage?: string) => {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (successMessage) setMessage(successMessage);
      return { ok: true, result };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return { ok: false };
    } finally {
      setPending(false);
    }
  }, []);
  const clear = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);
  return { pending, error, message, run, clear };
}
