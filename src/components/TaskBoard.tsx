import type { Task, TaskCompletion } from '../types';
import { useTask } from '../store/DemoStore';
import type { useGame } from '../sources/game';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingState } from './UI';

const REPEAT_LABEL = { daily: '每日', weekly: '每週', once: '一次' } as const;
const VERIFY_LABEL = { coach: '教練確認', note_today: '系統檢查筆記', quiz_week: '系統檢查測驗' } as const;

/** 本期的回報：有效的優先，沒有的話取最後一筆（可能是被退回的） */
function currentFor(completions: TaskCompletion[], taskId: string): TaskCompletion | undefined {
  const list = completions.filter((c) => c.taskId === taskId);
  return list.find((c) => c.status !== 'rejected') ?? list[list.length - 1];
}

/** 遊戲資料由頁面讀取後傳入，避免同一頁重複讀取 */
export function TaskBoard({ game }: { game: ReturnType<typeof useGame> }) {
  const action = useTask();
  const state = game.state;

  const renderButton = (task: Task) => {
    const c = state && currentFor(state.completions, task.id);
    if (!c || c.status === 'rejected') {
      return (
        <>
          {c?.status === 'rejected' && <Badge tone="red">上次未通過，可重新回報</Badge>}
          <button type="button" className="btn btn-sm btn-primary" disabled={action.pending} onClick={() => action.run(() => game.submitTask(task), task.verify === 'coach' ? '已送出，等待教練確認。' : '系統確認完成！可以領取獎勵了。')}>
            {task.verify === 'coach' ? '回報完成' : '檢查並完成'}
          </button>
        </>
      );
    }
    if (c.status === 'submitted') return <Badge tone="yellow">等待教練確認</Badge>;
    if (c.status === 'approved')
      return (
        <button type="button" className="btn btn-sm btn-gold" disabled={action.pending} onClick={() => action.run(() => game.claimReward(c.id), `領取成功！獲得經驗 ${task.expReward}、點數 ${task.pointReward}${task.ballReward ? `、捕捉球 ${task.ballReward}` : ''}。`)}>
          🎁 領取獎勵
        </button>
      );
    return <Badge tone="green">✓ 已領取</Badge>;
  };

  return (
    <Card title="今日任務板" icon="📋" actions={<span className="muted small">獎勵由系統檢查，同一期間不可重複領取</span>}>
      <ActionFeedback action={action} />
      {game.error && <Alert kind="error">{game.error}</Alert>}
      {game.loading || !state ? (
        !game.error && <LoadingState text="讀取任務中…" />
      ) : state.tasks.length === 0 ? (
        <EmptyState icon="📭" title="目前沒有開放的任務" hint="教練開放任務後會出現在這裡。" />
      ) : (
        <ul className="task-list">
          {state.tasks.map((t) => (
            <li key={t.id} className="task-item">
              <div className="task-main">
                <div className="task-title">
                  <Badge tone="blue">{t.category}</Badge> <strong>{t.title}</strong>
                </div>
                <p className="muted small">{t.description}</p>
                <div className="task-meta small">
                  <span>🔁 {REPEAT_LABEL[t.repeat]}</span>
                  <span>🔍 {VERIFY_LABEL[t.verify]}</span>
                  <span className="reward">⭐ 經驗 {t.expReward}</span>
                  <span className="reward">🪙 點數 {t.pointReward}</span>
                  {t.ballReward > 0 && <span className="reward">⚾ 捕捉球 {t.ballReward}</span>}
                </div>
              </div>
              <div className="task-action">{renderButton(t)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
