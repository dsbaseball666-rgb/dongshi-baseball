import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './types';
import { useStore } from './store/DemoStore';
import { Layout } from './components/Layout';
import { Card, EmptyState, LoadingState, NoAccess, PageHeader } from './components/UI';

// 各頁面在第一次打開時才下載（手機第一次開網站時要下載的檔案比較小、比較快）
const CloudHomePage = lazy(() => import('./pages/CloudHomePage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const CloudAdminPage = lazy(() => import('./pages/admin/CloudAdminPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const FitnessPage = lazy(() => import('./pages/FitnessPage'));
const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const HubPage = lazy(() => import('./pages/HubPage'));
const BattlePage = lazy(() => import('./pages/BattlePage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const DexPage = lazy(() => import('./pages/DexPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const KnowledgeArticlePage = lazy(() => import('./pages/KnowledgeArticlePage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));

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
        <EmptyState icon="☁️" title="段考成績、親師平台、對戰與道具商店只在雲端模式提供" hint="示範模式沒有這些功能。請登出後用你的帳號與登入碼登入。" />
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

const ALL: Role[] = ['coach', 'player', 'parent', 'teacher', 'office'];
const GROWN_UPS: Role[] = ['coach', 'parent', 'teacher', 'office'];

const pageLoading = (
  <div className="boot">
    <LoadingState text="載入頁面…" />
  </div>
);

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
    <Suspense fallback={pageLoading}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
        <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Home />} />
          <Route path="hub" element={<Allow cloud cloudOnly roles={GROWN_UPS}><HubPage /></Allow>} />
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
    </Suspense>
  );
}
