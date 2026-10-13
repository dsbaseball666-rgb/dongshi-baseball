import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Goal, GoalStatus, GoalTerm, GoalTermSetting } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { dueDateFor, useGoals, useGoalSettings, usePlayers } from '../sources/hooks';
import { can } from '../lib/permissions';
import { formatDate, todayStr } from '../lib/date';
import { goalProgress, GOAL_STATUS_LABELS, GOAL_TERM_ICON } from '../lib/progress';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader, ProgressBar } from '../components/UI';

type GoalsApi = ReturnType<typeof useGoals>;

const STATE_BADGE = {
  todo: <Badge tone="gray">未完成</Badge>,
  submitted: <Badge tone="yellow">待教練確認</Badge>,
  approved: <Badge tone="green">✓ 已核准</Badge>,
};

function GoalCard({ goal, isCoach, settings, source }: { goal: Goal; isCoach: boolean; settings: GoalTermSetting[]; source: GoalsApi }) {
  const task = useTask();
  const setting = settings.find((s) => s.term === goal.term);
  const prog = goalProgress(goal);
  const overdue = goal.status === 'active' && goal.dueDate < todayStr();
  return (
    <article className="goal-card">
      <div className="goal-head">
        <span className="goal-term">
          {GOAL_TERM_ICON[goal.term]} {setting?.label}
        </span>
        <Badge tone={goal.status === 'completed' ? 'green' : goal.status === 'active' ? 'blue' : 'gray'}>{GOAL_STATUS_LABELS[goal.status]}</Badge>
        {overdue && <Badge tone="red">已過期限</Badge>}
      </div>
      <h3>{goal.content}</h3>
      <p className="small">
        <strong>完成條件：</strong>
        {goal.criteria}
      </p>
      <p className="muted small">
        期間：{formatDate(goal.startDate)} ～ {formatDate(goal.dueDate)}・建立者：{goal.createdBy}
      </p>
      <ProgressBar tone="goal" value={prog.approved} max={prog.total} label={`進度 ${prog.percent}%（已核准 ${prog.approved}/${prog.total}）`} />
      <ul className="checkpoint-list">
        {goal.checkpoints.map((cp) => (
          <li key={cp.id}>
            <span>{cp.label}</span>
            <span className="cp-actions">
              {STATE_BADGE[cp.state]}
              {!isCoach && cp.state === 'todo' && goal.status === 'active' && (
                <button type="button" className="btn btn-sm" disabled={task.pending} onClick={() => task.run(() => source.submit(goal.id, cp.id), '已送出申請，等待教練確認。')}>
                  申請完成
                </button>
              )}
              {isCoach && cp.state === 'submitted' && (
                <>
                  <button type="button" className="btn btn-sm btn-primary" disabled={task.pending} onClick={() => task.run(() => source.review(goal.id, cp.id, true), '已核准。')}>
                    核准
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => task.run(() => source.review(goal.id, cp.id, false), '已退回。')}>
                    退回
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {isCoach && (
        <Field label="目標狀態（教練評核）">
          <select value={goal.status} disabled={task.pending} onChange={(e) => task.run(() => source.setStatus(goal.id, e.target.value as GoalStatus), '狀態已更新。')}>
            {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <ActionFeedback action={task} />
    </article>
  );
}

function NewGoalForm({ playerId, settings, source, onDone }: { playerId: string; settings: GoalTermSetting[]; source: GoalsApi; onDone: () => void }) {
  const task = useTask();
  const today = todayStr();
  const [term, setTerm] = useState<GoalTerm>('short');
  const [content, setContent] = useState('');
  const [criteria, setCriteria] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => dueDateFor(settings, 'short', today));
  const [checkpoints, setCheckpoints] = useState('');

  const changeTerm = (t: GoalTerm) => {
    setTerm(t);
    setDueDate(dueDateFor(settings, t, startDate));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await task.run(() => source.create({ playerId, term, content, criteria, startDate, dueDate, checkpoints: checkpoints.split('\n') }), '目標已建立。');
    if (res.ok) onDone();
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="目標類型">
        <select value={term} onChange={(e) => changeTerm(e.target.value as GoalTerm)}>
          {settings.map((s) => (
            <option key={s.term} value={s.term}>
              {s.label}（{s.periodHint}，預設 {s.defaultDays} 天）
            </option>
          ))}
        </select>
      </Field>
      <Field label="目標內容" required>
        <input value={content} onChange={(e) => setContent(e.target.value)} maxLength={200} placeholder="例如：本週牛棚好球率達到六成" />
      </Field>
      <Field label="完成條件" required hint="寫清楚怎樣才算達成，方便教練評核。">
        <textarea rows={2} value={criteria} onChange={(e) => setCriteria(e.target.value)} maxLength={300} />
      </Field>
      <div className="grid-2 tight">
        <Field label="開始日">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="期限" hint="依教練設定的預設天數帶入，可調整。">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <Field label="檢核點（每行一個）" required hint="進度條只計算教練核准的檢核點。">
        <textarea rows={3} value={checkpoints} onChange={(e) => setCheckpoints(e.target.value)} placeholder={'第 1 次牛棚達標\n第 2 次牛棚達標\n第 3 次牛棚達標'} />
      </Field>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending}>
          建立目標
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

export default function GoalsPage() {
  const { user } = useStore();
  const [params, setParams] = useSearchParams();
  const isCoach = can(user, 'goal.manage');
  const { players, loading: playersLoading, error: playersError } = usePlayers();
  const activePlayers = players.filter((p) => p.active);
  const playerId = isCoach ? params.get('player') ?? activePlayers[0]?.id ?? '' : user?.playerId ?? '';
  const [filter, setFilter] = useState<GoalTerm | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const source = useGoals(playerId);
  const { settings, error: settingsError } = useGoalSettings();

  const goals = source.goals
    .filter((g) => g.playerId === playerId && (filter === 'all' || g.term === filter))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="page">
      <PageHeader
        icon="🎯"
        title="目標管理與進度"
        subtitle="短期・中期・長期目標，進度依教練核准的檢核點計算"
        actions={
          !creating && playerId ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              ＋ 新增目標
            </button>
          ) : undefined
        }
      />
      {isCoach && (
        <Card>
          {playersError && <Alert kind="error">{playersError}</Alert>}
          {playersLoading ? (
            <LoadingState text="讀取球員名單…" />
          ) : (
            <Field label="選擇球員">
              <select
                value={playerId}
                onChange={(e) => {
                  setParams({ player: e.target.value }, { replace: true });
                  setCreating(false);
                }}
              >
                {activePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（#{p.number}）
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Card>
      )}
      {!isCoach && <Alert kind="info">球員可以建立目標並「申請完成」檢核點，但不能自己把進度改成完成，需要教練核准。</Alert>}
      {settingsError && <Alert kind="warn">讀取期限設定失敗，暫時使用預設值：{settingsError}</Alert>}
      {source.error && (
        <Alert kind="error">
          {source.error}{' '}
          <button type="button" className="btn btn-sm" onClick={source.reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {creating && playerId && (
        <Card title="新增目標" icon="✏️">
          <NewGoalForm playerId={playerId} settings={settings} source={source} onDone={() => setCreating(false)} />
        </Card>
      )}
      <div className="tabs" role="tablist">
        {(['all', 'short', 'mid', 'long'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={filter === t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t === 'all' ? '全部' : `${GOAL_TERM_ICON[t]} ${settings.find((s) => s.term === t)?.label}`}
          </button>
        ))}
      </div>
      {source.loading ? (
        <Card>
          <LoadingState text="讀取目標中…" />
        </Card>
      ) : !playerId ? (
        !playersLoading && (
          <Card>
            <EmptyState title="沒有可顯示的球員" hint={isCoach ? '請先到教練後台新增球員。' : '此帳號沒有對應的球員資料，請聯絡教練。'} />
          </Card>
        )
      ) : goals.length === 0 ? (
        !source.error && (
          <Card>
            <EmptyState icon="🎯" title="還沒有目標" hint="點右上角「新增目標」開始設定。" />
          </Card>
        )
      ) : (
        <div className="goal-grid">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} isCoach={isCoach} settings={settings} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
