import { useState } from 'react';
import type { Role } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { ROLE_LABELS } from '../lib/permissions';
import { isCloudConfigured } from '../config';
import { ActionFeedback, Alert, Field } from '../components/UI';

const ROLE_DESC: Record<Role, string> = {
  coach: '管理球員、任務、規章、知識庫、公告，並查看筆記與體能資料。',
  player: '寫每日筆記、設定目標、查看自己的體能紀錄、執行任務並培養怪獸。',
  parent: '閱讀球隊規章、防護知識與開放給家長的公告。',
};

function CloudLogin() {
  const { cloudLogin, loadWarning } = useStore();
  const task = useTask();
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  return (
    <section className="login-group cloud-login">
      <h2>☁️ 雲端登入</h2>
      <p className="muted">使用教練發給你的帳號與登入碼。資料會儲存在球隊的 Google 試算表。</p>
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
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} placeholder="例如：p001" />
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
      <p className="muted small">忘記登入碼請找教練重設。連續輸入錯誤 5 次會暫停登入 10 分鐘。</p>
    </section>
  );
}

export default function LoginPage() {
  const { db, login } = useStore();
  const roles: Role[] = ['player', 'coach', 'parent'];
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-hero">
          <span className="brand-ball big" aria-hidden />
          <h1>東勢國中棒球隊</h1>
          <p className="login-sub">冒險訓練筆記本</p>
        </div>
        {isCloudConfigured && <CloudLogin />}
        <details className="demo-login" open={!isCloudConfigured}>
          <summary>🧪 示範模式（不需帳號，資料只存在這台裝置）</summary>
          <Alert kind="info">示範模式使用虛構的示範資料，可以體驗所有功能，包含尚未串接雲端的怪獸遊戲與目標進度。</Alert>
          {roles.map((role) => {
            const users = db.users.filter((u) => u.role === role && u.active);
            return (
              <section key={role} className="login-group">
                <h2>
                  <span className={`role-chip role-${role}`}>{ROLE_LABELS[role]}</span>
                </h2>
                <p className="muted">{ROLE_DESC[role]}</p>
                <div className="login-users">
                  {users.length === 0 && <p className="muted">目前沒有啟用中的示範帳號。</p>}
                  {users.map((u) => (
                    <button key={u.id} type="button" className="btn login-user" onClick={() => login(u.id)}>
                      以「{u.displayName}」進入
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </details>
      </div>
    </div>
  );
}
