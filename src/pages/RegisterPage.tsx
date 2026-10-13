import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, useTask } from '../store/DemoStore';
import { isCloudConfigured } from '../config';
import { ActionFeedback, Alert, Field } from '../components/UI';

/** 家長／老師用教練給的邀請碼，自己設定帳號、顯示名稱與密碼 */
export default function RegisterPage() {
  const { cloudRegister } = useStore();
  const task = useTask();
  const [form, setForm] = useState({ inviteCode: '', displayName: '', loginId: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const loginId = form.loginId.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,30}$/.test(loginId)) return setError('帳號請用 3～30 個英文小寫、數字或 _ . -（例如 wang.mom）。');
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) return setError('密碼至少 8 個字，並且要同時有英文字母和數字。');
    if (form.password !== form.confirm) return setError('兩次輸入的密碼不一樣。');
    task.run(() => cloudRegister({ inviteCode: form.inviteCode.trim(), loginId, displayName: form.displayName.trim(), password: form.password }));
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-hero">
          <span className="brand-ball big" aria-hidden />
          <h1>東勢國中棒球隊</h1>
          <p className="login-sub">家長／老師建立帳號</p>
        </div>
        {!isCloudConfigured ? (
          <Alert kind="warn">這個網站還沒有連線雲端，無法建立帳號。</Alert>
        ) : (
          <form className="form" onSubmit={submit}>
            <Alert kind="info">請輸入教練給你的<strong>邀請碼</strong>，然後自己設定帳號和密碼。一組邀請碼只能建立一個帳號，14 天內有效。</Alert>
            <Field label="邀請碼" required hint="8 個英文字母或數字，大小寫都可以">
              <input value={form.inviteCode} onChange={set('inviteCode')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} />
            </Field>
            <Field label="顯示名稱" required hint="其他人會看到的名字，例如：王小明媽媽、林老師">
              <input value={form.displayName} onChange={set('displayName')} maxLength={30} />
            </Field>
            <Field label="帳號" required hint="登入時使用，3～30 個英文小寫、數字或 _ . -">
              <input value={form.loginId} onChange={set('loginId')} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} />
            </Field>
            <div className="grid-2 tight">
              <Field label="密碼" required hint="至少 8 個字，要有英文字母和數字">
                <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" maxLength={40} />
              </Field>
              <Field label="再輸入一次密碼" required>
                <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" maxLength={40} />
              </Field>
            </div>
            {error && <Alert kind="error">{error}</Alert>}
            <ActionFeedback action={task} />
            <button type="submit" className="btn btn-primary" disabled={task.pending || !form.inviteCode.trim() || !form.displayName.trim()}>
              {task.pending ? '建立中…' : '建立帳號並登入'}
            </button>
          </form>
        )}
        <Link to="/login" className="btn btn-ghost">
          ← 回到登入頁
        </Link>
      </div>
    </div>
  );
}
