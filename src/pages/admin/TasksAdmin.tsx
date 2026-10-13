import { useState } from 'react';
import type { Task, TaskCategory, TaskRepeat, TaskVerify } from '../../types';
import { useStore, useTask } from '../../store/DemoStore';
import { useTaskAdmin } from '../../sources/game';
import { usePlayers } from '../../sources/hooks';
import type { TaskInput } from '../../store/actions';
import { formatDateTime } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

type TaskAdminApi = ReturnType<typeof useTaskAdmin>;

const CATEGORIES: TaskCategory[] = ['每日筆記', '紀律', '防護知識', '團隊合作', '持續進步', '訓練', '休養參與'];
const REPEAT: Record<TaskRepeat, string> = { daily: '每日', weekly: '每週', once: '僅一次' };
const VERIFY: Record<TaskVerify, string> = { coach: '教練確認', note_today: '系統檢查今日筆記', quiz_week: '系統檢查本週測驗' };

const blank: TaskInput = { title: '', description: '', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 20, pointReward: 10, ballReward: 0 };

function TaskForm({ editing, source, onDone }: { editing: Task | null; source: TaskAdminApi; onDone: () => void }) {
  const action = useTask();
  const [f, setF] = useState<TaskInput>(() =>
    editing
      ? { id: editing.id, title: editing.title, description: editing.description, category: editing.category, repeat: editing.repeat, verify: editing.verify, expReward: editing.expReward, pointReward: editing.pointReward, ballReward: editing.ballReward }
      : blank,
  );
  const num = (k: 'expReward' | 'pointReward' | 'ballReward', v: string) => setF({ ...f, [k]: v === '' ? 0 : Number(v) });
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(() => source.upsert(f), editing ? '任務已更新。' : '已新增任務。');
        if (r.ok) {
          if (editing) onDone();
          else setF(blank);
        }
      }}
    >
      <Field label="任務名稱" required>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={40} />
      </Field>
      <Field label="任務說明">
        <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} />
      </Field>
      <div className="grid-3 tight">
        <Field label="分類">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TaskCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="可領取頻率">
          <select value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value as TaskRepeat })}>
            {Object.entries(REPEAT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="完成驗證方式">
          <select value={f.verify} onChange={(e) => setF({ ...f, verify: e.target.value as TaskVerify })}>
            {Object.entries(VERIFY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid-3 tight">
        <Field label="經驗值（0～500）">
          <input type="number" min={0} max={500} value={f.expReward} onChange={(e) => num('expReward', e.target.value)} />
        </Field>
        <Field label="點數（0～500）">
          <input type="number" min={0} max={500} value={f.pointReward} onChange={(e) => num('pointReward', e.target.value)} />
        </Field>
        <Field label="捕捉球（0～10）">
          <input type="number" min={0} max={10} value={f.ballReward} onChange={(e) => num('ballReward', e.target.value)} />
        </Field>
      </div>
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          {editing ? '儲存修改' : '＋ 新增任務'}
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

export default function TasksAdmin() {
  const { mode } = useStore();
  const source = useTaskAdmin();
  const { players } = usePlayers();
  const action = useTask();
  const [editing, setEditing] = useState<Task | null>(null);
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;
  const title = (tid: string) => source.tasks.find((t) => t.id === tid)?.title ?? tid;

  if (source.loading) return <LoadingState text="讀取任務中…" />;
  if (source.error) return <Alert kind="error">{source.error}</Alert>;

  return (
    <>
      {mode === 'cloud' && source.tasks.length === 0 && (
        <Card title="匯入預設任務" icon="📥">
          <EmptyState
            icon="📋"
            title="雲端還沒有任務"
            hint="可以先匯入 6 個預設任務（每日筆記、紀律、防護知識測驗、團隊合作、休養參與、持續進步），之後再依球隊需要修改獎勵或新增任務。"
            action={
              <button type="button" className="btn btn-primary" disabled={action.pending} onClick={() => action.run(() => source.importDefaults(), '已匯入 6 個預設任務。')}>
                匯入 6 個預設任務
              </button>
            }
          />
        </Card>
      )}
      <Card title={`待確認的任務回報（${source.pending.length}）`} icon="📥">
        <ActionFeedback action={action} />
        {source.pending.length === 0 ? (
          <EmptyState icon="✅" title="目前沒有待確認的任務" />
        ) : (
          <ul className="plain-list">
            {source.pending.map((c) => (
              <li key={c.id} className="row-between">
                <span>
                  <strong>{name(c.playerId)}</strong>：{title(c.taskId)}
                  <div className="muted small">
                    期間 {c.periodKey}・回報於 {formatDateTime(c.submittedAt)}
                  </div>
                </span>
                <span className="nowrap">
                  <button type="button" className="btn btn-sm btn-primary" disabled={action.pending} onClick={() => action.run(() => source.review(c.id, true), '已核准，球員可以領取獎勵。')}>
                    核准
                  </button>{' '}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={action.pending} onClick={() => action.run(() => source.review(c.id, false), '已退回。')}>
                    退回
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={editing ? `修改任務：${editing.title}` : '新增任務'} icon="✏️">
        <Alert kind="info">任務可包含筆記、紀律、防護知識、團隊合作、持續進步與休養參與，讓受傷或暫時無法訓練的球員也能參與。</Alert>
        <TaskForm key={editing?.id ?? 'new'} editing={editing} source={source} onDone={() => setEditing(null)} />
      </Card>
      <Card title="任務與獎勵設定" icon="📋">
        {source.tasks.length === 0 ? (
          <EmptyState title="還沒有任務" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>任務</th>
                  <th>分類</th>
                  <th>頻率</th>
                  <th>驗證</th>
                  <th>獎勵</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {source.tasks.map((t) => (
                  <tr key={t.id} className={t.active ? '' : 'row-off'}>
                    <td>{t.title}</td>
                    <td>{t.category}</td>
                    <td>{REPEAT[t.repeat]}</td>
                    <td>{VERIFY[t.verify]}</td>
                    <td className="small">
                      經驗 {t.expReward}／點數 {t.pointReward}／球 {t.ballReward}
                    </td>
                    <td>{t.active ? <Badge tone="green">開放</Badge> : <Badge tone="gray">關閉</Badge>}</td>
                    <td className="nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(t)}>
                        修改
                      </button>{' '}
                      <button type="button" className="btn btn-sm btn-ghost" disabled={action.pending} onClick={() => action.run(() => source.setActive(t.id, !t.active), t.active ? '任務已關閉。' : '任務已開放。')}>
                        {t.active ? '關閉' : '開放'}
                      </button>
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
