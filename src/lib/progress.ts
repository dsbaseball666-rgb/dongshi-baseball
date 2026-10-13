import type { Goal, GoalStatus, GoalTerm } from '../types';

/** 進度只計算「教練已核准」的檢核點，球員無法自行把進度改成 100% */
export function goalProgress(goal: Goal): { approved: number; submitted: number; total: number; percent: number } {
  const total = goal.checkpoints.length;
  const approved = goal.checkpoints.filter((c) => c.state === 'approved').length;
  const submitted = goal.checkpoints.filter((c) => c.state === 'submitted').length;
  return { approved, submitted, total, percent: total > 0 ? Math.round((approved / total) * 100) : 0 };
}

export const GOAL_TERM_ICON: Record<GoalTerm, string> = { short: '🌱', mid: '🌿', long: '🌳' };

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: '進行中',
  completed: '已達成',
  not_met: '未達成',
  cancelled: '已取消',
};
