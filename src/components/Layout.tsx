import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../types';
import { useStore } from '../store/DemoStore';
import { ROLE_LABELS } from '../lib/permissions';
import { CLOUD_ONLY_PATHS, CLOUD_READY_PATHS } from '../config';
import { Alert, LoadingState } from './UI';

export const NAV_ITEMS: { to: string; label: string; icon: string; roles: Role[] }[] = [
  { to: '/', label: '冒險基地', icon: '🏕️', roles: ['coach', 'player', 'parent', 'teacher'] },
  { to: '/hub', label: '親師平台', icon: '🤝', roles: ['coach', 'parent', 'teacher'] },
  { to: '/notes', label: '棒球筆記', icon: '📒', roles: ['coach', 'player'] },
  { to: '/goals', label: '目標進度', icon: '🎯', roles: ['coach', 'player'] },
  { to: '/fitness', label: '體能檢測', icon: '💪', roles: ['coach', 'player'] },
  { to: '/exams', label: '段考成績', icon: '📝', roles: ['coach', 'player', 'parent', 'teacher'] },
  { to: '/training', label: '怪獸訓練', icon: '🥚', roles: ['player'] },
  { to: '/explore', label: '野外探索', icon: '🌿', roles: ['player'] },
  { to: '/battle', label: '對戰競技場', icon: '⚔️', roles: ['player'] },
  { to: '/shop', label: '道具商店', icon: '🎒', roles: ['player'] },
  { to: '/dex', label: '怪獸圖鑑', icon: '📖', roles: ['coach', 'player'] },
  { to: '/rules', label: '球隊規章', icon: '📜', roles: ['coach', 'player', 'parent', 'teacher'] },
  { to: '/knowledge', label: '防護知識', icon: '⛑️', roles: ['coach', 'player', 'parent'] },
  { to: '/announcements', label: '球隊公告', icon: '📣', roles: ['coach', 'player', 'parent', 'teacher'] },
  { to: '/admin', label: '教練後台', icon: '🛠️', roles: ['coach'] },
  { to: '/account', label: '我的帳號', icon: '🔑', roles: ['coach', 'player', 'parent', 'teacher'] },
];

export function Layout() {
  const { user, mode, logout, loadWarning, simulateFailure } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role) && (mode === 'cloud' ? CLOUD_READY_PATHS.includes(i.to) : !CLOUD_ONLY_PATHS.includes(i.to)));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-ball" aria-hidden />
          <div>
            <strong>東勢國中棒球隊</strong>
            <small>冒險訓練筆記本</small>
          </div>
        </div>
        <div className="topbar-user">
          <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
          <span className={`mode-chip mode-${mode}`}>{mode === 'cloud' ? '☁️ 雲端' : '🧪 示範'}</span>
          <span className="user-name">{user.displayName}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
            登出
          </button>
          <button type="button" className="btn btn-sm menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? '✕ 關閉' : '☰ 選單'}
          </button>
        </div>
      </header>

      {mode === 'cloud' ? (
        <div className="demo-banner cloud-banner" role="note">
          ☁️ 雲端模式：所有資料都儲存在球隊的 Google 試算表。
        </div>
      ) : (
        <div className="demo-banner" role="note">
          🧪 示範模式：所有資料都是<strong>示範資料</strong>，只儲存在這台裝置的瀏覽器中，<strong>不會同步到雲端</strong>。
          {simulateFailure && <strong className="danger-text">（目前開啟「模擬連線失敗」）</strong>}
        </div>
      )}

      <div className="app-body">
        <nav id="main-nav" className={`sidenav ${menuOpen ? 'open' : ''}`} aria-label="主要導覽">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
              <span className="nav-icon" aria-hidden>
                {i.icon}
              </span>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <main className="main" key={location.pathname}>
          {loadWarning && <Alert kind="warn">{loadWarning}</Alert>}
          <Suspense fallback={<LoadingState text="載入頁面…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
