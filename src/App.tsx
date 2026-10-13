import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './types';
import { useStore } from './store/DemoStore';
import { Layout } from './components/Layout';
import { Card, EmptyState, LoadingState, NoAccess, PageHeader } from './components/UI';
import CloudHomePage from './pages/CloudHomePage';
import AccountPage from './pages/AccountPage';
import CloudAdminPage from './pages/admin/CloudAdminPage';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import NotesPage from './pages/NotesPage';
import GoalsPage from './pages/GoalsPage';
import FitnessPage from './pages/FitnessPage';
import TrainingPage from './pages/TrainingPage';
import ExplorePage from './pages/ExplorePage';
import ExamsPage from './pages/ExamsPage';
import BattlePage from './pages/BattlePage';
import ShopPage from './pages/ShopPage';
import DexPage from './pages/DexPage';
import RulesPage from './pages/RulesPage';
import KnowledgePage from './pages/KnowledgePage';
import KnowledgeArticlePage from './pages/KnowledgeArticlePage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import AdminPage from './pages/admin/AdminPage';

function Allow({ roles, children, cloud = false, cloudOnly = false }: { roles: Role[]; children: ReactNode; cloud?: boolean; cloudOnly?: boolean }) {
  const { user, mode } = useStore();
  if (!user) return <Navigate to="/login" replace />;
  if (mode === 'cloud' && !cloud) return <NotInCloud />;
  if (mode !== 'cloud' && cloudOnly) return <CloudOnly />;
  if (!roles.includes(user.role)) {
    const text = user.role === 'coach' ? '這是球員的遊戲頁面。教練請到「教練後台 → 怪獸與圖鑑」管理怪獸與任務。' : undefined;
    return <NoAccess text={text} />;
  }
  return <>{children}</>;
}

function NotInCloud() {
  return (
    <div className="page">
      <PageHeader icon="🚧" title="此功能尚未串接雲端" />
      <Card>
        <EmptyState icon="🚧" title="這個功能會在後續階段連線 Google 試算表" hint="目前可以登出後選擇「示範模式」先體驗這個功能。" />
      </Card>
    </div>
  );
}

function CloudOnly() {
  return (
    <div className="page">
      <PageHeader icon="☁️" title="這個功能需要雲端帳號" />
      <Card>
        <EmptyState icon="☁️" title="段考成績、對戰與道具商店只在雲端模式提供" hint="示範模式沒有這些功能。請登出後用教練給你的帳號與登入碼登入。" />
      </Card>
    </div>
  );
}

function Home() {
  const { mode } = useStore();
  return mode === 'cloud' ? <CloudHomePage /> : <HomePage />;
}

function Admin() {
  const { mode } = useStore();
  return mode === 'cloud' ? <CloudAdminPage /> : <AdminPage />;
}

const ALL: Role[] = ['coach', 'player', 'parent'];

export default function App() {
  const { ready, user } = useStore();
  if (!ready) {
    return (
      <div className="boot">
        <LoadingState text="正在準備冒險基地…" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Home />} />
        <Route path="notes" element={<Allow cloud roles={['coach', 'player']}><NotesPage /></Allow>} />
        <Route path="goals" element={<Allow cloud roles={['coach', 'player']}><GoalsPage /></Allow>} />
        <Route path="fitness" element={<Allow cloud roles={['coach', 'player']}><FitnessPage /></Allow>} />
        <Route path="exams" element={<Allow cloud cloudOnly roles={ALL}><ExamsPage /></Allow>} />
        <Route path="training" element={<Allow cloud roles={['player']}><TrainingPage /></Allow>} />
        <Route path="explore" element={<Allow cloud roles={['player']}><ExplorePage /></Allow>} />
        <Route path="battle" element={<Allow cloud cloudOnly roles={['player']}><BattlePage /></Allow>} />
        <Route path="shop" element={<Allow cloud cloudOnly roles={['player']}><ShopPage /></Allow>} />
        <Route path="dex" element={<Allow cloud roles={['coach', 'player']}><DexPage /></Allow>} />
        <Route path="rules" element={<Allow cloud roles={ALL}><RulesPage /></Allow>} />
        <Route path="knowledge" element={<Allow cloud roles={ALL}><KnowledgePage /></Allow>} />
        <Route path="knowledge/:id" element={<Allow cloud roles={ALL}><KnowledgeArticlePage /></Allow>} />
        <Route path="announcements" element={<Allow cloud roles={ALL}><AnnouncementsPage /></Allow>} />
        <Route path="account" element={<Allow cloud roles={ALL}><AccountPage /></Allow>} />
        <Route path="admin" element={<Allow cloud roles={['coach']}><Admin /></Allow>} />
        <Route path="*" element={<NoAccess text="找不到這個頁面。" />} />
      </Route>
    </Routes>
  );
}
