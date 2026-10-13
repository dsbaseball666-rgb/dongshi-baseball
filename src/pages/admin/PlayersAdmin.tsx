import { useState } from 'react';
import type { Player, Role, User } from '../../types';
import { useAction, useStore } from '../../store/DemoStore';
import { setPlayerActive, setUserActive, upsertPlayer, upsertUser, type PlayerInput, type UserInput } from '../../store/actions';
import { ALL_ROLES, PERMISSION_LABELS, ROLE_LABELS, rolePermissions, type Permission } from '../../lib/permissions';
import { ActionFeedback, Alert, Badge, Card, Field } from '../../components/UI';

function PlayerForm({ editing, onDone }: { editing: Player | null; onDone: () => void }) {
  const { user } = useStore();
  const action = useAction();
  const [form, setForm] = useState<PlayerInput>(editing ? { ...editing } : { name: '', number: '', grade: '七年級', position: '' });
  const set = (k: keyof PlayerInput, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(editing ? '修改球員' : '新增球員', (d) => upsertPlayer(d, user, form), editing ? '球員資料已更新。' : '已新增球員。');
        if (r.ok) {
          if (editing) onDone();
          else setForm({ name: '', number: '', grade: '七年級', position: '' });
        }
      }}
    >
      <div className="grid-4 tight">
        <Field label="姓名" required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={30} />
        </Field>
        <Field label="背號">
          <input value={form.number} onChange={(e) => set('number', e.target.value)} maxLength={4} />
        </Field>
        <Field label="年級">
          <select value={form.grade} onChange={(e) => set('grade', e.target.value)}>
            {['七年級', '八年級', '九年級'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="守備位置">
          <input value={form.position} onChange={(e) => set('position', e.target.value)} maxLength={20} />
        </Field>
      </div>
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          {editing ? '儲存修改' : '＋ 新增球員'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

function UserForm({ editing, onDone }: { editing: User | null; onDone: () => void }) {
  const { db, user } = useStore();
  const action = useAction();
  const blank: UserInput = { displayName: '', role: 'player', playerId: db.players[0]?.id, childPlayerIds: [] };
  const [form, setForm] = useState<UserInput>(editing ? { ...editing } : blank);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(editing ? '修改帳號' : '新增帳號', (d) => upsertUser(d, user, form), editing ? '帳號已更新。' : '已新增帳號。');
        if (r.ok) {
          if (editing) onDone();
          else setForm(blank);
        }
      }}
    >
      <div className="grid-2 tight">
        <Field label="顯示名稱" required>
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={30} />
        </Field>
        <Field label="角色">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {form.role === 'player' && (
        <Field label="對應球員">
          <select value={form.playerId ?? ''} onChange={(e) => setForm({ ...form, playerId: e.target.value })}>
            {db.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {form.role === 'parent' && (
        <fieldset className="checks">
          <legend>對應子女</legend>
          {db.players.map((p) => (
            <label key={p.id} className="check">
              <input
                type="checkbox"
                checked={form.childPlayerIds.includes(p.id)}
                onChange={(e) => setForm({ ...form, childPlayerIds: e.target.checked ? [...form.childPlayerIds, p.id] : form.childPlayerIds.filter((x) => x !== p.id) })}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          {editing ? '儲存修改' : '＋ 新增帳號'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

export default function PlayersAdmin() {
  const { db, user } = useStore();
  const action = useAction();
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const allPerms = Object.keys(PERMISSION_LABELS) as Permission[];

  return (
    <>
      <Card title={editPlayer ? `修改球員：${editPlayer.name}` : '新增球員'} icon="👤">
        <PlayerForm key={editPlayer?.id ?? 'new'} editing={editPlayer} onDone={() => setEditPlayer(null)} />
      </Card>
      <Card title="球員名單" icon="👥">
        <ActionFeedback action={action} />
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
              {db.players.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'row-off'}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.number}</td>
                  <td>{p.grade}</td>
                  <td>{p.position}</td>
                  <td>{p.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}</td>
                  <td className="nowrap">
                    <button type="button" className="btn btn-sm" onClick={() => setEditPlayer(p)}>
                      修改
                    </button>{' '}
                    <button type="button" className="btn btn-sm btn-ghost" disabled={action.pending} onClick={() => action.run(p.active ? '停用球員' : '啟用球員', (d) => setPlayerActive(d, user, p.id, !p.active), p.active ? `已停用 ${p.name}（同時停用其球員帳號）。` : `已啟用 ${p.name}。`)}>
                      {p.active ? '停用' : '啟用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={editUser ? `修改帳號：${editUser.displayName}` : '新增帳號'} icon="🔑">
        <Alert kind="info">第一階段不建立密碼。正式帳號登入方式（例如學校 Google 帳號）會在第三階段設定，並由後端驗證角色。</Alert>
        <UserForm key={editUser?.id ?? 'new'} editing={editUser} onDone={() => setEditUser(null)} />
      </Card>
      <Card title="帳號與角色" icon="🧾">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名稱</th>
                <th>角色</th>
                <th>對應球員</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'row-off'}>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`role-chip role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td>{u.role === 'player' ? db.players.find((p) => p.id === u.playerId)?.name : u.role === 'parent' ? u.childPlayerIds.map((id) => db.players.find((p) => p.id === id)?.name).join('、') : '—'}</td>
                  <td>{u.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}</td>
                  <td className="nowrap">
                    <button type="button" className="btn btn-sm" onClick={() => setEditUser(u)}>
                      修改
                    </button>{' '}
                    {u.id !== user?.id && (
                      <button type="button" className="btn btn-sm btn-ghost" disabled={action.pending} onClick={() => action.run(u.active ? '停用帳號' : '啟用帳號', (d) => setUserActive(d, user, u.id, !u.active), u.active ? '帳號已停用。' : '帳號已啟用。')}>
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
      <Card title="角色權限對照表" icon="🛡️">
        <p className="muted small">此表說明各角色的權限設計。正式上線時，每一個 API 都會在 Apps Script 後端依此表再次驗證，不依賴前端判斷。</p>
        <div className="table-wrap">
          <table className="perm-table">
            <thead>
              <tr>
                <th>權限</th>
                {ALL_ROLES.map((r) => (
                  <th key={r}>{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPerms.map((p) => (
                <tr key={p}>
                  <td>{PERMISSION_LABELS[p]}</td>
                  {ALL_ROLES.map((r) => (
                    <td key={r} className="center">
                      {rolePermissions(r).includes(p) ? '✅' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
