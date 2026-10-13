import type { Role, User } from '../types';

// 注意：這裡的權限判斷只用來決定「畫面要顯示什麼」。
// 正式上線時，所有資料修改都必須由 Apps Script 後端再驗證一次（第三階段）。

export type Permission =
  | 'note.write.own'
  | 'note.view.own'
  | 'note.view.all'
  | 'note.comment'
  | 'goal.write.own'
  | 'goal.manage'
  | 'fitness.view.own'
  | 'fitness.view.all'
  | 'fitness.write'
  | 'game.play'
  | 'game.manage'
  | 'rules.read'
  | 'rules.edit'
  | 'knowledge.read'
  | 'knowledge.edit'
  | 'announcement.read'
  | 'announcement.edit'
  | 'admin.access'
  | 'users.manage'
  | 'audit.view'
  | 'data.export';

export const PERMISSION_LABELS: Record<Permission, string> = {
  'note.write.own': '撰寫自己的每日筆記',
  'note.view.own': '查看自己的筆記',
  'note.view.all': '查看全隊筆記',
  'note.comment': '撰寫教練評語',
  'goal.write.own': '建立自己的目標、申請檢核',
  'goal.manage': '核准目標檢核、調整期限設定',
  'fitness.view.own': '查看自己的體能紀錄',
  'fitness.view.all': '查看全隊體能紀錄',
  'fitness.write': '新增／修改／刪除體能檢測',
  'game.play': '執行任務、訓練與捕捉怪獸',
  'game.manage': '管理任務、獎勵與怪獸',
  'rules.read': '閱讀球隊規章',
  'rules.edit': '編輯球隊規章',
  'knowledge.read': '閱讀防護知識',
  'knowledge.edit': '管理防護知識文章',
  'announcement.read': '閱讀公告',
  'announcement.edit': '發布公告',
  'admin.access': '進入管理後台',
  'users.manage': '管理帳號與角色',
  'audit.view': '查看操作紀錄',
  'data.export': '匯出球隊紀錄',
};

const MATRIX: Record<Role, Permission[]> = {
  coach: [
    'note.view.all',
    'note.comment',
    'goal.manage',
    'fitness.view.all',
    'fitness.write',
    'game.manage',
    'rules.read',
    'rules.edit',
    'knowledge.read',
    'knowledge.edit',
    'announcement.read',
    'announcement.edit',
    'admin.access',
    'users.manage',
    'audit.view',
    'data.export',
  ],
  player: [
    'note.write.own',
    'note.view.own',
    'goal.write.own',
    'fitness.view.own',
    'game.play',
    'rules.read',
    'knowledge.read',
    'announcement.read',
  ],
  parent: ['rules.read', 'knowledge.read', 'announcement.read'],
};

export const ROLE_LABELS: Record<Role, string> = {
  coach: '管理者／教練',
  player: '球員',
  parent: '家長',
};

export const ALL_ROLES: Role[] = ['coach', 'player', 'parent'];

export function rolePermissions(role: Role): Permission[] {
  return MATRIX[role];
}

export function can(user: Pick<User, 'role' | 'active'> | null | undefined, perm: Permission): boolean {
  return !!user && user.active && MATRIX[user.role].includes(perm);
}
