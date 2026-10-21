import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AuditLog, Invite, Player, Role, User } from '../../types';
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
  const bulkTask = useTask();
  const [pForm, setPForm] = useState({ name: '', number: '', grade: '七年級', position: '' });
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [uForm, setUForm] = useState<{ loginId: string; displayName: string; role: Role; childPlayerIds: string[] }>({ loginId: '', displayName: '', role: 'parent', childPlayerIds: [] });
  const [editingUser, setEditingUser] = useState<string | null>(null);
  // 帳號清單勾選（一次刪除多個帳號）
  const [selected, setSelected] = useState<string[]>([]);
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
      const r = await userTask.run(() => api('adminUpdateUser', { userId: editingUser, displayName: uForm.displayName, role: uForm.role, childPlayerIds: uForm.childPlayerIds }, '修改帳號'), '帳號已更新。');
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

  const canDelete = (u: User) => u.role !== 'player' && u.id !== user?.id;
  const deletable = data.users.filter(canDelete);
  // 快速勾選會加進目前的勾選（例如先按「家長」再按「老師」＝兩種都勾）
  const pick = (match: (u: User) => boolean) => setSelected((s) => Array.from(new Set([...s, ...deletable.filter(match).map((u) => u.id)])));
  const deleteSelected = async () => {
    const list = data.users.filter((u) => selected.includes(u.id));
    if (list.length === 0) return;
    const names = list.map((u) => `・${u.displayName}（${u.loginId}，${ROLE_LABELS[u.role]}）`);
    const shownNames = names.length > 15 ? [...names.slice(0, 15), `…另外 ${names.length - 15} 個`] : names;
    const typed = window.prompt(
      `⚠️ 永久刪除 ${list.length} 個帳號：\n${shownNames.join('\n')}\n\n刪除後這些人就不能再登入，無法復原（只想暫時不讓他登入，建議按「停用」）。他們以前在溝通區的留言會保留。\n\n確定要刪除，請輸入「刪除」兩個字：`,
    );
    if (typed === null) return;
    if (typed.trim() !== '刪除') {
      window.alert('沒有輸入「刪除」，帳號都沒有被刪除。');
      return;
    }
    const r = await bulkTask.run(() => api<{ deleted: number }>('adminDeleteUsers', { userIds: list.map((u) => u.id) }, '刪除帳號'), `已刪除 ${list.length} 個帳號。`);
    if (r.ok) {
      setSelected([]);
      if (editingUser && selected.includes(editingUser)) resetUserForm();
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
                    <td>
                      {p.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}{' '}
                      {!data.users.some((u) => u.role === 'player' && u.playerId === p.id) && <Badge tone="yellow">尚無帳號</Badge>}
                    </td>
                    <td className="nowrap">
                      {p.active && !data.users.some((u) => u.role === 'player' && u.playerId === p.id) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={task.pending}
                            onClick={async () => {
                              const r = await task.run(() => api<{ loginId: string; code: string }>('adminCreatePlayerAccount', { playerId: p.id }, '建立球員帳號'));
                              if (r.ok && r.result) {
                                setIssued({ title: `${p.name} 的球員帳號`, loginId: r.result.loginId, code: r.result.code });
                                load();
                              }
                            }}
                          >
                            建立帳號
                          </button>{' '}
                        </>
                      )}
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
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={task.pending}
                        onClick={async () => {
                          const typed = window.prompt(
                            `⚠️ 永久刪除「${p.name}」\n\n會一起刪除：球員帳號、每日筆記、體能檢測、目標、段考成績、怪獸與遊戲紀錄。刪除後無法復原（只能從每週備份找回）。\n\n只是暫時不參加，建議按「停用」就好。\n\n確定要刪除，請輸入球員姓名：`,
                          );
                          if (typed === null) return;
                          if (typed.trim() !== p.name) {
                            window.alert('輸入的姓名不同，沒有刪除。');
                            return;
                          }
                          const r = await task.run(() => api('adminDeletePlayer', { playerId: p.id, confirmName: typed.trim() }, '刪除球員'), `已永久刪除 ${p.name}。`);
                          if (r.ok) load();
                        }}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={editingUser ? `修改帳號：${uForm.loginId}` : '新增教練、家長、老師或學務處帳號'} icon="🔑">
        <form className="form" onSubmit={createUser}>
          <div className="grid-3 tight">
            <Field label="帳號" required hint={editingUser ? '帳號建立後不能修改' : '英文小寫、數字或 _ . -，3～30 字'}>
              <input value={uForm.loginId} disabled={!!editingUser} onChange={(e) => setUForm({ ...uForm, loginId: e.target.value.toLowerCase() })} maxLength={30} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="顯示名稱" required>
              <input value={uForm.displayName} onChange={(e) => setUForm({ ...uForm, displayName: e.target.value })} maxLength={30} />
            </Field>
            <Field label="角色">
              <select value={uForm.role} disabled={!!editingUser && uForm.role === 'coach'} onChange={(e) => setUForm({ ...uForm, role: e.target.value as Role })}>
                <option value="parent">{ROLE_LABELS.parent}</option>
                <option value="teacher">{ROLE_LABELS.teacher}</option>
                <option value="office">{ROLE_LABELS.office}（自動看得到全部學生）</option>
                {(!editingUser || uForm.role === 'coach') && <option value="coach">{ROLE_LABELS.coach}</option>}
              </select>
            </Field>
          </div>
          {uForm.role === 'office' && <p className="muted small">學務處帳號不用勾選學生，會自動看得到全部在籍學生（之後新增的學生也會自動加入），可以群發訊息、新增全體行程，也可以單獨留言。</p>}
          {(uForm.role === 'parent' || uForm.role === 'teacher') && (
            <fieldset className="checks">
              <legend>{uForm.role === 'teacher' ? '負責的學生' : '對應子女'}</legend>
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
        <div className="bulk-bar">
          <span className="small">快速勾選：</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => pick(() => true)}>
            全部可刪除的
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => pick((u) => u.role === 'parent')}>
            家長
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => pick((u) => u.role === 'teacher')}>
            老師
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => pick((u) => !u.active)}>
            停用中的
          </button>
          {selected.length > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>
              清除勾選
            </button>
          )}
          <button type="button" className="btn btn-sm btn-danger" disabled={selected.length === 0 || bulkTask.pending} onClick={deleteSelected}>
            🗑️ 刪除勾選的帳號（{selected.length}）
          </button>
        </div>
        <ActionFeedback action={bulkTask} />
        <p className="muted small">球員帳號不能在這裡刪除（請到上方「球員名單」按「刪除」，才會連同筆記、成績一起處理）；自己的帳號也不能刪除。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全選可刪除的帳號"
                    checked={deletable.length > 0 && deletable.every((u) => selected.includes(u.id))}
                    onChange={(e) => setSelected(e.target.checked ? deletable.map((u) => u.id) : [])}
                  />
                </th>
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
                <tr key={u.id} className={`${u.active ? '' : 'row-off'} ${selected.includes(u.id) ? 'row-selected' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`勾選 ${u.displayName}`}
                      disabled={!canDelete(u)}
                      title={u.role === 'player' ? '球員帳號請到球員名單刪除' : u.id === user?.id ? '不能刪除自己的帳號' : ''}
                      checked={selected.includes(u.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))}
                    />
                  </td>
                  <td>
                    <code>{u.loginId}</code>
                  </td>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`role-chip role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td>{u.role === 'player' ? playerName(u.playerId) : u.role === 'parent' || u.role === 'teacher' ? u.childPlayerIds.map(playerName).join('、') : '—'}</td>
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

const INVITE_STATUS: Record<Invite['status'], [string, 'green' | 'gray' | 'red' | 'yellow']> = {
  active: ['可使用', 'green'],
  used: ['已使用', 'gray'],
  revoked: ['已作廢', 'red'],
  expired: ['已過期', 'yellow'],
};

/** 邀請碼：家長或老師拿到後，到網站「建立帳號」自己設定帳號和密碼 */
function InvitesTab() {
  const { api } = useStore();
  const [players, setPlayers] = useState<Player[]>([]);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<{ role: 'parent' | 'teacher' | 'office'; playerIds: string[]; label: string }>({ role: 'parent', playerIds: [], label: '' });
  const [issued, setIssued] = useState<{ code: string; invite: Invite } | null>(null);
  const [filter, setFilter] = useState('');
  const task = useTask();

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([api<{ players: Player[] }>('listPlayers', {}, '讀取球員名單'), api<{ invites: Invite[] }>('adminListInvites', {}, '讀取邀請碼')])
      .then(([p, i]) => {
        setPlayers(p.players.filter((x) => x.active));
        setInvites(i.invites);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!invites) return <LoadingState text="讀取邀請碼…" />;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const shown = players.filter((p) => !filter || p.name.includes(filter) || p.grade.includes(filter));
  const registerUrl = `${window.location.origin}${window.location.pathname}#/register`;

  return (
    <>
      {issued && (
        <div className="code-box" role="status">
          <strong>✉️ 邀請碼（{ROLE_LABELS[issued.invite.role]}{issued.invite.label ? `：${issued.invite.label}` : ''}）</strong>
          <div className="code-pair">
            <span>
              邀請碼：<code>{issued.code}</code>
            </span>
          </div>
          <p className="small">
            請把邀請碼和網址交給對方：<br />
            <code>{registerUrl}</code>
            <br />
            對方打開網址後輸入邀請碼，就能自己設定帳號和密碼。一組邀請碼只能用一次，{new Date(issued.invite.expiresAt).toLocaleDateString('zh-TW')} 前有效。關閉後就看不到這組邀請碼了。
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setIssued(null)}>
            我已記下，關閉
          </button>
        </div>
      )}
      <Card title="產生邀請碼" icon="✉️">
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await task.run(() => api<{ code: string; invite: Invite }>('adminCreateInvite', form, '產生邀請碼'));
            if (r.ok && r.result) {
              setIssued(r.result);
              setForm({ ...form, playerIds: [], label: '' });
              load();
            }
          }}
        >
          <div className="grid-2 tight">
            <Field label="給誰">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'parent' | 'teacher' | 'office' })}>
                <option value="parent">家長</option>
                <option value="teacher">老師</option>
                <option value="office">學務處（自動看得到全部學生）</option>
              </select>
            </Field>
            <Field label="備註（方便自己辨認）">
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={40} placeholder={form.role === 'teacher' ? '例如：八年三班導師' : '例如：周柏竣的媽媽'} />
            </Field>
          </div>
          {form.role === 'office' ? (
            <p className="muted small">學務處不用選學生，會自動看得到全部在籍學生。</p>
          ) : (
          <fieldset className="checks">
            <legend>
              {form.role === 'teacher' ? '這位老師負責的學生' : '這位家長的孩子'}（已選 {form.playerIds.length} 位）
            </legend>
            <input className="check-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋姓名或年級" aria-label="搜尋學生" />
            {shown.map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={form.playerIds.includes(p.id)}
                  onChange={(e) => setForm({ ...form, playerIds: e.target.checked ? [...form.playerIds, p.id] : form.playerIds.filter((x) => x !== p.id) })}
                />
                {p.name}
              </label>
            ))}
            {form.role === 'teacher' && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm({ ...form, playerIds: Array.from(new Set([...form.playerIds, ...shown.map((p) => p.id)])) })}>
                全選目前顯示的學生
              </button>
            )}
          </fieldset>
          )}
          <ActionFeedback action={task} />
          <button type="submit" className="btn btn-primary" disabled={task.pending || (form.role !== 'office' && form.playerIds.length === 0)}>
            產生邀請碼
          </button>
        </form>
      </Card>
      <Card title={`邀請碼紀錄（${invites.length}）`} icon="🧾">
        {invites.length === 0 ? (
          <EmptyState icon="✉️" title="還沒有產生過邀請碼" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>對象</th>
                  <th>備註</th>
                  <th>學生</th>
                  <th>狀態</th>
                  <th>有效期限</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>{ROLE_LABELS[i.role]}</td>
                    <td>{i.label || '—'}</td>
                    <td>{i.role === 'office' ? '全部學生' : i.playerIds.map(nameOf).join('、')}</td>
                    <td>
                      <Badge tone={INVITE_STATUS[i.status][1]}>{INVITE_STATUS[i.status][0]}</Badge>
                    </td>
                    <td className="nowrap">{formatDateTime(i.expiresAt)}</td>
                    <td>
                      {i.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={task.pending}
                          onClick={async () => {
                            if (!window.confirm('確定作廢這組邀請碼？作廢後就不能用來註冊。')) return;
                            const r = await task.run(() => api('adminRevokeInvite', { id: i.id }, '作廢邀請碼'), '已作廢。');
                            if (r.ok) load();
                          }}
                        >
                          作廢
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

interface LegacyPreview {
  title: string;
  totalRecords: number;
  importable: number;
  duplicates: number;
  skipped: { line: number; reason: string }[];
  skippedCount: number;
  items: Record<string, number>;
  dateFrom: string;
  dateTo: string;
  newPlayers: number;
  students: { name: string; isNew: boolean; records: number }[];
}

/** 匯入舊的體能檢測資料：先預覽（不寫入），確認後才寫入 */
function LegacyImportTab() {
  const { api } = useStore();
  const previewTask = useTask();
  const runTask = useTask();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<LegacyPreview | null>(null);
  const [done, setDone] = useState<{ newPlayers: number; imported: number; duplicates: number; skippedCount: number } | null>(null);

  const doPreview = async () => {
    setPreview(null);
    setDone(null);
    const r = await previewTask.run(() => api<{ preview: LegacyPreview }>('adminPreviewLegacyImport', { sheetUrl: url.trim() }, '預覽舊資料'));
    if (r.ok && r.result) setPreview(r.result.preview);
  };
  const doImport = async () => {
    if (!preview || !window.confirm(`確定要匯入 ${preview.importable} 筆紀錄${preview.newPlayers ? `，並新增 ${preview.newPlayers} 位球員` : ''}嗎？`)) return;
    const r = await runTask.run(() => api<{ newPlayers: number; imported: number; duplicates: number; skippedCount: number }>('adminRunLegacyImport', { sheetUrl: url.trim() }, '匯入舊資料'));
    if (r.ok && r.result) {
      setDone(r.result);
      setPreview(null);
    }
  };

  return (
    <>
      <Card title="匯入舊的體能檢測資料" icon="📥">
        <p className="small">
          貼上舊檔案的 Google 試算表網址。舊檔案需要有「紀錄」工作表（欄位：記錄ID、姓名、檢測項目、日期、數值），「名單」工作表可有可無。
        </p>
        <ul className="bullet-list small">
          <li>先按「預覽」：只會讀取舊檔案，<strong>不會寫入任何資料</strong>，也不會修改舊檔案。</li>
          <li>姓名和網站名單相同的學生會直接沿用；沒有的會新增為球員（不含帳號，之後在「球員與帳號」按「建立帳號」）。</li>
          <li>同一筆舊紀錄匯入兩次也不會重複。</li>
        </ul>
        <Field label="舊檔案網址">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
        </Field>
        <ActionFeedback action={previewTask} />
        <button type="button" className="btn btn-primary" disabled={previewTask.pending || !url.trim()} onClick={doPreview}>
          {previewTask.pending ? '讀取中…' : '預覽'}
        </button>
      </Card>

      {done && (
        <Alert kind="success">
          匯入完成！新增球員 {done.newPlayers} 位、匯入紀錄 {done.imported} 筆
          {done.duplicates > 0 && `（${done.duplicates} 筆之前已匯入過，已略過）`}
          {done.skippedCount > 0 && `，${done.skippedCount} 筆格式不合格未匯入`}。可以到「體能檢測中心」查看每位學生的歷次變化。
        </Alert>
      )}

      {preview && (
        <Card title={`預覽：${preview.title}`} icon="🔍">
          <div className="stat-grid">
            <div className="stat-card">
              <span>可匯入的紀錄</span>
              <strong>{preview.importable}</strong>
            </div>
            <div className="stat-card">
              <span>將新增的球員</span>
              <strong>{preview.newPlayers}</strong>
            </div>
            <div className="stat-card">
              <span>已匯入過（略過）</span>
              <strong>{preview.duplicates}</strong>
            </div>
            <div className={`stat-card ${preview.skippedCount ? 'warn' : ''}`}>
              <span>格式不合格（略過）</span>
              <strong>{preview.skippedCount}</strong>
            </div>
          </div>
          {preview.importable > 0 && (
            <p className="small">
              日期範圍：{preview.dateFrom} ～ {preview.dateTo}
            </p>
          )}
          <h3 className="section-title">各項目筆數</h3>
          <div className="chip-row">
            {Object.entries(preview.items).map(([label, n]) => (
              <Badge key={label} tone="blue">
                {label} {n} 筆
              </Badge>
            ))}
            {Object.keys(preview.items).length === 0 && <span className="muted">沒有可匯入的紀錄</span>}
          </div>
          <h3 className="section-title">學生（{preview.students.length} 位）</h3>
          <div className="chip-row">
            {preview.students.map((s) => (
              <Badge key={s.name} tone={s.isNew ? 'yellow' : 'green'}>
                {s.name}・{s.records} 筆{s.isNew ? '・新增' : ''}
              </Badge>
            ))}
          </div>
          <p className="muted small">黃色：網站名單還沒有，匯入時會新增；綠色：已在網站名單上。</p>
          {preview.skippedCount > 0 && (
            <>
              <h3 className="section-title">不會匯入的紀錄（{preview.skippedCount} 筆）</h3>
              <ul className="bullet-list small">
                {preview.skipped.map((s, i) => (
                  <li key={i}>
                    {s.line > 0 ? `第 ${s.line} 列：` : ''}
                    {s.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <ActionFeedback action={runTask} />
          <button type="button" className="btn btn-primary" disabled={runTask.pending || preview.importable === 0} onClick={doImport}>
            {runTask.pending ? '匯入中…' : `確認匯入 ${preview.importable} 筆`}
          </button>
        </Card>
      )}
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
  { id: 'invites', label: '✉️ 邀請碼', el: <InvitesTab /> },
  { id: 'tasks', label: '📋 任務與獎勵', el: <TasksAdmin /> },
  { id: 'monsters', label: '🐾 怪獸與圖鑑', el: <MonstersAdmin /> },
  { id: 'goals', label: '🎯 目標與進度', el: <GoalsAdmin /> },
  { id: 'rules', label: '📜 球隊規章', el: <RulesAdmin /> },
  { id: 'knowledge', label: '⛑️ 防護知識', el: <KnowledgeAdmin /> },
  { id: 'announcements', label: '📣 公告', el: <AnnouncementsAdmin /> },
  { id: 'import', label: '📥 匯入舊資料', el: <LegacyImportTab /> },
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
