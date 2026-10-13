import { useState } from 'react';
import { useStore, useTask } from '../store/DemoStore';
import { ROLE_LABELS, rolePermissions, PERMISSION_LABELS } from '../lib/permissions';
import { usePlayers } from '../sources/hooks';
import { ActionFeedback, Alert, Card, Field, PageHeader } from '../components/UI';

export default function AccountPage() {
  const { user, mode, changeMyCode } = useStore();
  const { players } = usePlayers();
  const task = useTask();
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newCode !== confirm) {
      setLocalError('兩次輸入的新登入碼不一樣。');
      return;
    }
    if (newCode.length < 8 || !/[A-Za-z]/.test(newCode) || !/[0-9]/.test(newCode)) {
      setLocalError('新的登入碼至少 8 個字，並且要同時包含英文字母與數字。');
      return;
    }
    const r = await task.run(() => changeMyCode(oldCode, newCode), '登入碼已更新。其他裝置上的登入狀態都已失效，需要用新的登入碼重新登入。');
    if (r.ok) {
      setOldCode('');
      setNewCode('');
      setConfirm('');
    }
  };

  return (
    <div className="page">
      <PageHeader icon="🔑" title="我的帳號" subtitle="查看帳號資訊與修改登入碼" />
      <Card title="帳號資訊" icon="👤">
        <ul className="plain-list">
          <li className="row-between">
            <span className="muted">名稱</span>
            <strong>{user.displayName}</strong>
          </li>
          {user.loginId && (
            <li className="row-between">
              <span className="muted">帳號</span>
              <code>{user.loginId}</code>
            </li>
          )}
          <li className="row-between">
            <span className="muted">角色</span>
            <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
          </li>
          {user.role !== 'coach' && (
            <li className="row-between">
              <span className="muted">{user.role === 'parent' ? '對應子女' : user.role === 'teacher' ? '負責的學生' : '對應球員'}</span>
              <span>{players.map((p) => p.name).join('、') || '—'}</span>
            </li>
          )}
        </ul>
        <details className="perm-details">
          <summary>我可以做的事</summary>
          <ul className="bullet-list small">
            {rolePermissions(user.role).map((p) => (
              <li key={p}>{PERMISSION_LABELS[p]}</li>
            ))}
          </ul>
        </details>
      </Card>
      {mode === 'cloud' ? (
        <Card title="修改登入碼" icon="🔒">
          <Alert kind="info">建議把教練給你的初始登入碼改成自己記得住的。修改後，其他裝置上的登入狀態都會失效。</Alert>
          <form className="form" onSubmit={submit}>
            <Field label="目前的登入碼" required>
              <input type="password" value={oldCode} onChange={(e) => setOldCode(e.target.value)} autoComplete="current-password" maxLength={40} />
            </Field>
            <div className="grid-2 tight">
              <Field label="新的登入碼" required hint="至少 8 個字，包含英文字母與數字">
                <input type="password" value={newCode} onChange={(e) => setNewCode(e.target.value)} autoComplete="new-password" maxLength={40} />
              </Field>
              <Field label="再輸入一次新的登入碼" required>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={40} />
              </Field>
            </div>
            {localError && <Alert kind="error">{localError}</Alert>}
            <ActionFeedback action={task} />
            <button type="submit" className="btn btn-primary" disabled={task.pending || !oldCode || !newCode || !confirm}>
              更新登入碼
            </button>
          </form>
        </Card>
      ) : (
        <Alert kind="info">示範模式不需要登入碼。使用雲端登入時，可以在這裡修改自己的登入碼。</Alert>
      )}
    </div>
  );
}
