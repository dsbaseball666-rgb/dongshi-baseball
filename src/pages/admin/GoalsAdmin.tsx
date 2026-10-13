import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GoalTermSetting } from '../../types';
import { useTask } from '../../store/DemoStore';
import { useGoals, useGoalSettings, usePlayers } from '../../sources/hooks';
import { formatDateTime } from '../../lib/date';
import { goalProgress, GOAL_STATUS_LABELS } from '../../lib/progress';
import { ActionFeedback, Alert, Card, EmptyState, Field, LoadingState } from '../../components/UI';

function SettingsForm() {
  const { settings: saved, loading, save } = useGoalSettings();
  const task = useTask();
  const [settings, setSettings] = useState<GoalTermSetting[]>(saved);
  useEffect(() => setSettings(saved.map((s) => ({ ...s }))), [saved]);
  const edit = (i: number, patch: Partial<GoalTermSetting>) => setSettings((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  if (loading) return <LoadingState />;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        task.run(() => save(settings), '期限設定已儲存。');
      }}
    >
      {settings.map((s, i) => (
        <div key={s.term} className="grid-3 tight">
          <Field label="名稱">
            <input value={s.label} onChange={(e) => edit(i, { label: e.target.value })} maxLength={20} />
          </Field>
          <Field label="期限說明">
            <input value={s.periodHint} onChange={(e) => edit(i, { periodHint: e.target.value })} maxLength={40} />
          </Field>
          <Field label="預設天數（1～400）">
            <input type="number" min={1} max={400} value={s.defaultDays} onChange={(e) => edit(i, { defaultDays: Number(e.target.value) })} />
          </Field>
        </div>
      ))}
      <ActionFeedback action={task} />
      <button type="submit" className="btn btn-primary" disabled={task.pending}>
        儲存設定
      </button>
    </form>
  );
}

export default function GoalsAdmin() {
  const { goals, loading, error, reload, review } = useGoals(null);
  const { players } = usePlayers();
  const { settings } = useGoalSettings();
  const task = useTask();
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;
  const pending = goals.flatMap((g) => g.checkpoints.filter((c) => c.state === 'submitted').map((c) => ({ g, c })));

  return (
    <>
      {error && (
        <Alert kind="error">
          {error}{' '}
          <button type="button" className="btn btn-sm" onClick={reload}>
            重新讀取
          </button>
        </Alert>
      )}
      <Card title={`待核准的檢核點（${pending.length}）`} icon="📥">
        <ActionFeedback action={task} />
        {loading ? (
          <LoadingState />
        ) : pending.length === 0 ? (
          <EmptyState icon="✅" title="目前沒有待核准的檢核點" />
        ) : (
          <ul className="plain-list">
            {pending.map(({ g, c }) => (
              <li key={`${g.id}-${c.id}`} className="row-between">
                <span>
                  <strong>{name(g.playerId)}</strong>：{g.content} ／ {c.label}
                  <div className="muted small">申請於 {formatDateTime(c.submittedAt)}</div>
                </span>
                <span className="nowrap">
                  <button type="button" className="btn btn-sm btn-primary" disabled={task.pending} onClick={() => task.run(() => review(g.id, c.id, true), '已核准。')}>
                    核准
                  </button>{' '}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => task.run(() => review(g.id, c.id, false), '已退回。')}>
                    退回
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="目標期限設定" icon="⏳">
        <p className="muted small">球員建立目標時，會用這裡的預設天數自動帶入期限（仍可個別調整）。</p>
        <SettingsForm />
      </Card>
      <Card title="全隊目標總覽" icon="🎯">
        {loading ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState title="還沒有任何目標" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>球員</th>
                  <th>類型</th>
                  <th>目標</th>
                  <th>期限</th>
                  <th>進度</th>
                  <th>狀態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => {
                  const p = goalProgress(g);
                  return (
                    <tr key={g.id}>
                      <td className="nowrap">{name(g.playerId)}</td>
                      <td>{settings.find((s) => s.term === g.term)?.label}</td>
                      <td>{g.content}</td>
                      <td className="nowrap">{g.dueDate}</td>
                      <td>
                        {p.percent}%（{p.approved}/{p.total}）
                      </td>
                      <td>{GOAL_STATUS_LABELS[g.status]}</td>
                      <td>
                        <Link className="btn btn-sm" to={`/goals?player=${g.playerId}`}>
                          管理
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
