import { useEffect, useState } from 'react';
import { useStore, useTask } from '../store/DemoStore';
import { usePlayers } from '../sources/hooks';
import { isCloudConfigured } from '../config';
import { ROLE_LABELS } from '../lib/permissions';
import { ActionFeedback, Alert, Card, EmptyState, Field, LoadingState } from '../components/UI';
import { useTeamFitness } from './useTeamFitness';
import { OverviewTab } from './OverviewTab';
import { BatchTab } from './BatchTab';
import { PersonalTab } from './PersonalTab';
import { ExportTab } from './ExportTab';
import { GroupTab } from './GroupTab';

// 體能檢測系統：獨立的網頁（fitness.html），和冒險筆記本共用同一個帳號與同一份資料（FitnessTests 工作表）

type Tab = 'overview' | 'group' | 'batch' | 'personal' | 'export';

// short：手機下方分頁列用的短名稱
const TABS: { id: Tab; icon: string; label: string; short: string; coachOnly: boolean }[] = [
  { id: 'overview', icon: '📊', label: '全隊總覽／排行', short: '總覽', coachOnly: true },
  { id: 'group', icon: '⏱️', label: '團體檢測（碼表）', short: '團體檢測', coachOnly: true },
  { id: 'batch', icon: '✍️', label: '全隊輸入', short: '全隊輸入', coachOnly: true },
  { id: 'personal', icon: '👤', label: '個人紀錄', short: '個人', coachOnly: false },
  { id: 'export', icon: '📤', label: '匯出 Excel', short: '匯出', coachOnly: true },
];

const MAIN_SITE = './';

function Login() {
  const { cloudLogin, login, db, loadWarning } = useStore();
  const task = useTask();
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const demoUsers = db.users.filter((u) => u.active && (u.role === 'coach' || u.role === 'player'));
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-hero">
          <span className="brand-ball big" aria-hidden />
          <h1>東勢國中棒球隊</h1>
          <p className="login-sub">體能檢測系統</p>
        </div>
        {isCloudConfigured && (
          <section className="login-group cloud-login">
            <h2>☁️ 登入</h2>
            <p className="muted">使用冒險訓練筆記本的同一個帳號與登入碼。教練可以輸入與查看全隊；球員可以看自己的紀錄。</p>
            {loadWarning && <Alert kind="warn">{loadWarning}</Alert>}
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                task.run(() => cloudLogin(loginId.trim(), code.trim()));
              }}
            >
              <div className="grid-2 tight">
                <Field label="帳號">
                  <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} />
                </Field>
                <Field label="登入碼">
                  <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" autoCapitalize="characters" maxLength={40} />
                </Field>
              </div>
              <ActionFeedback action={task} />
              <button type="submit" className="btn btn-primary" disabled={task.pending || !loginId.trim() || !code.trim()}>
                {task.pending ? '登入中…' : '登入'}
              </button>
            </form>
            <p className="muted small">忘記登入碼請找教練重設。</p>
          </section>
        )}
        <details className="demo-login" open={!isCloudConfigured}>
          <summary>🧪 示範模式（虛構資料，只存在這台裝置）</summary>
          <div className="login-users">
            {demoUsers.map((u) => (
              <button key={u.id} type="button" className="btn login-user" onClick={() => login(u.id)}>
                以「{u.displayName}」進入
              </button>
            ))}
          </div>
        </details>
        <a className="btn btn-ghost" href={MAIN_SITE}>
          ← 回冒險訓練筆記本
        </a>
      </div>
    </div>
  );
}

function readTab(): Tab | null {
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? (h as Tab) : null;
}

function System() {
  const { user, mode, logout, loadWarning } = useStore();
  const coach = user?.role === 'coach';
  const { players, loading: playersLoading, error: playersError, reload: reloadPlayers } = usePlayers();
  const source = useTeamFitness();
  const tabs = TABS.filter((t) => coach || !t.coachOnly);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = readTab();
    return t && tabs.some((x) => x.id === t) ? t : tabs[0].id;
  });
  const [playerId, setPlayerId] = useState('');
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, '', `#${t}`);
  };
  // 預設選第一位啟用中的球員（球員帳號就是自己）
  const selected = coach ? (players.some((p) => p.id === playerId) ? playerId : players.find((p) => p.active)?.id ?? players[0]?.id ?? '') : user?.playerId ?? '';
  useEffect(() => {
    document.title = '東勢國中棒球隊｜體能檢測系統';
  }, []);
  if (!user) return null;
  const allowed = user.role === 'coach' || user.role === 'player';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-ball" aria-hidden />
          <div>
            <strong>東勢國中棒球隊</strong>
            <small>💪 體能檢測系統</small>
          </div>
        </div>
        <div className="topbar-user">
          <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
          <span className={`mode-chip mode-${mode}`}>{mode === 'cloud' ? '☁️ 雲端' : '🧪 示範'}</span>
          <span className="user-name">{user.displayName}</span>
          <a className="btn btn-sm btn-ghost" href={MAIN_SITE}>
            ⚾ 冒險筆記本
          </a>
          <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
            登出
          </button>
        </div>
      </header>
      {mode === 'cloud' ? (
        <div className="demo-banner cloud-banner" role="note">
          ☁️ 資料就是球隊 Google 試算表裡原本的體能檢測紀錄（含舊系統匯入的），和冒險筆記本的「體能檢測」是同一份。
        </div>
      ) : (
        <div className="demo-banner" role="note">
          🧪 示範模式：顯示的是<strong>虛構的示範資料</strong>，只存在這台裝置。
        </div>
      )}
      <main className={`main fs-main ${coach ? 'fs-has-tabs' : ''}`}>
        <div className="page">
          {loadWarning && <Alert kind="warn">{loadWarning}</Alert>}
          {!allowed ? (
            <Card>
              <EmptyState icon="🔒" title="體能檢測系統只開放教練與球員使用" hint="家長可以在冒險筆記本的親師平台看到孩子的最新體能成績。" />
            </Card>
          ) : (
            <>
              {tabs.length > 1 && (
                <nav className="tabs view-tabs fs-tabs" role="tablist" aria-label="體能檢測系統分頁">
                  {tabs.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                      <span aria-hidden>{t.icon}</span>
                      <span className="fs-tab-long"> {t.label}</span>
                      <span className="fs-tab-short">{t.short}</span>
                    </button>
                  ))}
                </nav>
              )}
              {(source.error || playersError) && (
                <Alert kind="error">
                  {source.error ?? playersError}{' '}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      source.reload();
                      reloadPlayers();
                    }}
                  >
                    重新讀取
                  </button>
                </Alert>
              )}
              {source.loading || playersLoading ? (
                <Card>
                  <LoadingState text="讀取體能檢測資料…" />
                </Card>
              ) : (
                <>
                  {tab === 'overview' && coach && (
                    <OverviewTab
                      players={players}
                      source={source}
                      onOpenPlayer={(id) => {
                        setPlayerId(id);
                        setTab('personal');
                        window.scrollTo({ top: 0 });
                      }}
                    />
                  )}
                  {tab === 'group' && coach && <GroupTab players={players} source={source} />}
                  {tab === 'batch' && coach && <BatchTab players={players} source={source} />}
                  {tab === 'personal' && <PersonalTab players={players} source={source} coach={coach} playerId={selected} setPlayerId={setPlayerId} />}
                  {tab === 'export' && coach && <ExportTab players={players} source={source} />}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function FitnessApp() {
  const { ready, user } = useStore();
  if (!ready) {
    return (
      <div className="boot">
        <LoadingState text="正在準備體能檢測系統…" />
      </div>
    );
  }
  return user ? <System /> : <Login />;
}
