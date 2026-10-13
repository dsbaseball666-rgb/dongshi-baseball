import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActionState } from '../store/DemoStore';

export function PageHeader({ icon, title, subtitle, actions }: { icon: string; title: string; subtitle?: string; actions?: ReactNode }) {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <header className="page-header">
      <button type="button" className="btn btn-ghost btn-sm back-btn" onClick={goBack} aria-label="返回上一頁">
        ← 返回
      </button>
      <div className="page-title">
        <span className="page-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, icon, actions, children, className = '' }: { title?: ReactNode; icon?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && (
            <h2>
              {icon && <span aria-hidden>{icon} </span>}
              {title}
            </h2>
          )}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ value, max, label, tone = 'exp' }: { value: number; max: number; label?: string; tone?: 'exp' | 'goal' | 'hp' | 'heart' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `${pct}%`}>
      <div className={`progress-fill tone-${tone}`} style={{ width: `${pct}%` }} />
      <span className="progress-text">{label ?? `${pct}%`}</span>
    </div>
  );
}

export function EmptyState({ icon = '🌱', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <p className="empty-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ text = '載入中…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-ball" aria-hidden />
      {text}
    </div>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  const icon = { error: '⚠️', success: '✅', info: 'ℹ️', warn: '🔔' }[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span aria-hidden>{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function ActionFeedback({ action }: { action: Pick<ActionState, 'error' | 'message' | 'pending'> }) {
  if (action.pending) return <LoadingState text="處理中…" />;
  if (action.error) return <Alert kind="error">{action.error}</Alert>;
  if (action.message) return <Alert kind="success">{action.message}</Alert>;
  return null;
}

export function DemoTag({ text = '示範資料' }: { text?: string }) {
  return <span className="demo-tag">{text}</span>;
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function NoAccess({ text = '你的角色沒有權限查看這個頁面。' }: { text?: string }) {
  return (
    <div className="page">
      <PageHeader icon="🔒" title="沒有權限" />
      <Card>
        <EmptyState icon="🔒" title={text} hint="如果你認為這是錯誤，請聯絡教練。" />
      </Card>
    </div>
  );
}
