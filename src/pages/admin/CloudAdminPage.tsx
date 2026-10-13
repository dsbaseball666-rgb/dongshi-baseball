import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AuditLog, Player, Role, User } from '../../types';
import { useStore, useTask } from '../../store/DemoStore';
import { ROLE_LABELS } from '../../lib/permissions';
import { formatDateTime } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader } from '../../components/UI';
import GoalsAdmin from './GoalsAdmin';
import TasksAdmin from './TasksAdmin';
import MonstersAdmin from './MonstersAdmin';
import RulesAdmin from './RulesAdmin';
import KnowledgeAdmin from './KnowledgeAdmin';
import AnnouncementsAdmin from './AnnouncementsAdmin';

// 雲端模式的教練後台：帳號與球員管理、操作紀錄、同步錯誤。
// 所有操作都由 Apps Script 後端再次驗證教練身分。

interface IssuedCode {
  title: string;
  loginId: string;
  code: string;
}

function CodeBox({ issued, onClose }: { issued: IssuedCode; onClose: () => void }) {
  return (
    <div className="code-box" role="status">
      <strong>🔑 {issued.title}</strong>
      <div className="code-pair">
        <span>
          帳號：<code>{issued.loginId}</code>
        </span>
        <span>
          登入碼：<code>{issued.code}</code>
        </span>
      </div>
      <p className="small">請把這組帳號與登入碼交給本人。關閉後就無法再查看，忘記時只能重設。</p>
      <button type="button" className="btn btn-sm" onClick={onClose}>
        我已記下，關閉
      </button>
    </div>
  );
}

function AccountsTab() {
  const { api, user } = useStore();
  const [data, setData] = useState<{ users: User[]; players: Player[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const task = useTask();
  const playerTask = useTask();
  const userTask = useTask();
  const [pForm, setPForm] = useState({ name: '', number: '', grade: '七年級', position: '' });
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [uForm, setUForm] = useState<{ loginId: string; displayName: string; role: Role; childPlayerIds: string[] }>({ loginId: '', displayName: '', role: 'parent', childPlayerIds: [] });
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const resetUserForm = () => {
    setEditingUser(null);
    setUForm({ loginId: '', displayName: '', role: 'parent', childPlayerIds: [] });
  };

  const load = useCallback(() => {
    setLoadError(null);
    api<{ users: User[]; players: Player[] }>('adminListUsers', {}, '讀取帳號清單')
      .then(setData)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  if (loadError)
    return (
      <Alert kind="error">
        {loadError}{' '}
        <button type="button" className="btn btn-sm" onClick={load}>
          重新讀取
        </button>
      </Alert>
    );
  if (!data) return <LoadingState text="讀取帳號清單…" />;

  const savePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlayer) {
      const r = await playerTask.run(() => api('adminUpdatePlayer', { id: editingPlayer, ...pForm }, '修改球員'), '球員資料已更新。');
      if (r.ok) {
        setEditingPlayer(null);
        setPForm({ name: '', number: '', grade: '七年級', position: '' });
        load();
      }
      return;
    }
    const r = await playerTask.run(() => api<{ player: Player; loginId: string; code: string }>('adminCreatePlayer', pForm, '新增球員'), '已新增球員並建立帳號。');
    if (r.ok && r.result) {
      setIssued({ title: `${r.result.player.name} 的球員帳號`, loginId: r.result.loginId, code: r.result.code });
      setPForm({ name: '', number: '', grade: '七年級', position: '' });
      load();
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      const r = await userTask.run(() => api('adminUpdateUser', { userId: editingUser, displayName: uForm.displayName, childPlayerIds: uForm.childPlayerIds }, '修改帳號'), '帳號已更新。');
      if (r.ok) {
        resetUserForm();
        load();
      }
      return;
    }
    const r = await userTask.run(() => api<{ loginId: string; code: string }>('adminCreateUser', uForm, '新增帳號'), '已建立帳號。');
    if (r.ok && r.result) {
      setIssued({ title: `${uForm.displayName}（${ROLE_LABELS[uForm.role]}）的帳號`, loginId: r.result.loginId, code: r.result.code });
      resetUserForm();
      load();
    }
  };

  const resetCode = async (u: User) => {
    if (!window.confirm(`確定要重設「${u.displayName}」的登入碼嗎？舊的登入碼會立即失效。`)) return;
    const r = await task.run(() => api<{ loginId: string; code: string }>('adminResetCode', { userId: u.id }, '重設登入碼'));
    if (r.ok && r.result) setIssued({ title: `${u.displayName} 的新登入碼`, loginId: r.result.loginId, code: r.result.code });
  };

  const playerName = (id?: string) => data.players.find((p) => p.id === id)?.name ?? id ?? '—';

  return (
    <>
      {issued && <CodeBox issued={issued} onClose={() => setIssued(null)} />}
      <Card title={editingPlayer ? '修改球員資料' : '新增球員（同時建立球員帳號）'} icon="👤">
        <form className="form" onSubmit={savePlayer}>
          <div className="grid-4 tight">
            <Field label="姓名" required>
              <input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} maxLength={30} />
            </Field>
            <Field label="背號">
              <input value={pForm.number} onChange={(e) => setPForm({ ...pForm, number: e.target.value })} maxLength={4} />
            </Field>
            <Field label="年級">
              <select value={pForm.grade} onChange={(e) => setPForm({ ...pForm, grade: e.target.value })}>
                {['七年級', '八年級', '九年級'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="守備位置">
              <input value={pForm.position} onChange={(e) => setPForm({ ...pForm, position: e.target.value })} maxLength={20} />
            </Field>
          </div>
          <ActionFeedback action={playerTask} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={playerTask.pending}>
              {editingPlayer ? '儲存修改' : '＋ 新增球員'}
            </button>
            {editingPlayer && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditingPlayer(null);
                  setPForm({ name: '', number: '', grade: '七年級', position: '' });
                }}
              >
                取消
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title={`球員名單（${data.players.length}）`} icon="👥">
        <ActionFeedback action={task} />
        {data.players.length === 0 ? (
          <EmptyState icon="👥" title="還沒有球員" hint="使用上方表單新增第一位球員。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>編號</th>
                  <th>姓名</th>
                  <th>背號</th>
                  <th>年級</th>
                  <th>位置</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'row-off'}>
                    <td>{p.id}</td>
                    <td>{p.name}</td>
                    <td>{p.number}</td>
                    <td>{p.grade}</td>
                    <td>{p.position}</td>
                    <td>{p.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}</td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setEditingPlayer(p.id);
                          setPForm({ name: p.name, number: p.number, grade: p.grade || '七年級', position: p.position });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        修改
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={task.pending}
                        onClick={async () => {
                          const r = await task.run(() => api('adminSetPlayerActive', { playerId: p.id, active: !p.active }, p.active ? '停用球員' : '啟用球員'), p.active ? `已停用 ${p.name}（同時停用其帳號）。` : `已啟用 ${p.name}。`);
                          if (r.ok) load();
                        }}
                      >
                        {p.active ? '停用' : '啟用'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={editingUser ? `修改帳號：${uForm.loginId}` : '新增教練或家長帳號'} icon="🔑">
        <form className="form" onSubmit={createUser}>
          <div className="grid-3 tight">
            <Field label="帳號" required hint={editingUser ? '帳號建立後不能修改' : '英文小寫、數字或 _ . -，3～30 字'}>
              <input value={uForm.loginId} disabled={!!editingUser} onChange={(e) => setUForm({ ...uForm, loginId: e.target.value.toLowerCase() })} maxLength={30} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="顯示名稱" required>
              <input value={uForm.displayName} onChange={(e) => setUForm({ ...uForm, displayName: e.target.value })} maxLength={30} />
            </Field>
            <Field label="角色">
              <select value={uForm.role} disabled={!!editingUser} onChange={(e) => setUForm({ ...uForm, role: e.target.value as Role })}>
                <option value="parent">{ROLE_LABELS.parent}</option>
                <option value="coach">{ROLE_LABELS.coach}</option>
              </select>
            </Field>
          </div>
          {uForm.role === 'parent' && (
            <fieldset className="checks">
              <legend>對應子女</legend>
              {data.players.length === 0 && <span className="muted">請先新增球員。</span>}
              {data.players.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    checked={uForm.childPlayerIds.includes(p.id)}
                    onChange={(e) => setUForm({ ...uForm, childPlayerIds: e.target.checked ? [...uForm.childPlayerIds, p.id] : uForm.childPlayerIds.filter((x) => x !== p.id) })}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          )}
          <ActionFeedback action={userTask} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={userTask.pending}>
              {editingUser ? '儲存修改' : '＋ 建立帳號'}
            </button>
            {editingUser && (
              <button type="button" className="btn btn-ghost" onClick={resetUserForm}>
                取消
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title={`帳號清單（${data.users.length}）`} icon="🧾">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>帳號</th>
                <th>名稱</th>
                <th>角色</th>
                <th>對應球員</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'row-off'}>
                  <td>
                    <code>{u.loginId}</code>
                  </td>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`role-chip role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td>{u.role === 'player' ? playerName(u.playerId) : u.role === 'parent' ? u.childPlayerIds.map(playerName).join('、') : '—'}</td>
                  <td>{u.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}</td>
                  <td className="nowrap">
                    {u.role !== 'player' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setEditingUser(u.id);
                            setUForm({ loginId: u.loginId ?? '', displayName: u.displayName, role: u.role, childPlayerIds: [...u.childPlayerIds] });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          修改
                        </button>{' '}
                      </>
                    )}
                    <button type="button" className="btn btn-sm" disabled={task.pending} onClick={() => resetCode(u)}>
                      重設登入碼
                    </button>{' '}
                    {u.id !== user?.id && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={task.pending}
                        onClick={async () => {
                          const r = await task.run(() => api('adminSetUserActive', { userId: u.id, active: !u.active }, u.active ? '停用帳號' : '啟用帳號'), u.active ? '帳號已停用。' : '帳號已啟用。');
                          if (r.ok) load();
                        }}
                      >
                        {u.active ? '停用' : '啟用'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function AuditTab() {
  const { api } = useStore();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    setLogs(null);
    api<{ logs: AuditLog[] }>('listAudit', {}, '讀取操作紀錄')
      .then((r) => setLogs(r.logs))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);
  return (
    <Card
      title="重要操作紀錄（雲端）"
      icon="🗂️"
      actions={
        <button type="button" className="btn btn-sm" onClick={load}>
          重新整理
        </button>
      }
    >
      {error ? (
        <Alert kind="error">{error}</Alert>
      ) : !logs ? (
        <LoadingState />
      ) : logs.length === 0 ? (
        <EmptyState title="尚無操作紀錄" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>操作者</th>
                <th>動作</th>
                <th>對象</th>
                <th>內容</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{formatDateTime(l.at)}</td>
                  <td className="nowrap">{l.actorName}</td>
                  <td className="nowrap">{l.action}</td>
                  <td>{l.target}</td>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SyncTab() {
  const { cloudErrors, resolveCloudError } = useStore();
  return (
    <Card title={`同步錯誤紀錄（未處理 ${cloudErrors.filter((e) => !e.resolved).length}）`} icon="🧯">
      <p className="muted small">記錄這台裝置上連線雲端失敗的操作（例如網路中斷、登入過期）。失敗的操作都沒有被儲存，需要重新操作一次。</p>
      {cloudErrors.length === 0 ? (
        <EmptyState icon="✅" title="沒有同步錯誤" />
      ) : (
        <ul className="plain-list">
          {cloudErrors.map((e) => (
            <li key={e.id} className="row-between">
              <span>
                {e.resolved ? <Badge tone="gray">已處理</Badge> : <Badge tone="red">未處理</Badge>} <strong>{e.operation}</strong>：{e.message}
                <div className="muted small">{formatDateTime(e.at)}</div>
              </span>
              {!e.resolved && (
                <button type="button" className="btn btn-sm" onClick={() => resolveCloudError(e.id)}>
                  標記已處理
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const TABS = [
  { id: 'accounts', label: '👥 球員與帳號', el: <AccountsTab /> },
  { id: 'tasks', label: '📋 任務與獎勵', el: <TasksAdmin /> },
  { id: 'monsters', label: '🐾 怪獸與圖鑑', el: <MonstersAdmin /> },
  { id: 'goals', label: '🎯 目標與進度', el: <GoalsAdmin /> },
  { id: 'rules', label: '📜 球隊規章', el: <RulesAdmin /> },
  { id: 'knowledge', label: '⛑️ 防護知識', el: <KnowledgeAdmin /> },
  { id: 'announcements', label: '📣 公告', el: <AnnouncementsAdmin /> },
  { id: 'logs', label: '🗂️ 操作紀錄', el: <AuditTab /> },
  { id: 'sync', label: '🔌 同步錯誤', el: <SyncTab /> },
];

export default function CloudAdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  return (
    <div className="page">
      <PageHeader icon="🛠️" title="教練管理後台" subtitle="雲端模式：資料儲存在 Google 試算表" />
      <Alert kind="info">
        體能檢測的輸入請到 <Link to="/fitness">體能檢測中心</Link>；球員筆記與評語請到 <Link to="/notes">每日筆記</Link>。
      </Alert>
      <div className="tabs admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab.id === t.id} className={`tab ${tab.id === t.id ? 'active' : ''}`} onClick={() => setParams({ tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab.id}>{tab.el}</div>
    </div>
  );
}
