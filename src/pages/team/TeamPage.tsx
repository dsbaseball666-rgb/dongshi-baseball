import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/DemoStore';
import { PageHeader } from '../../components/UI';
import { useCloudQuery } from '../../sources/hooks';
import { PracticeTab } from './PracticeTab';
import { PlanTab } from './PlanTab';
import { AttendanceTab } from './AttendanceTab';
import { ProfilesTab } from './ProfilesTab';
import { BudgetTab } from './BudgetTab';
import { TournamentsTab } from './TournamentsTab';

type Tab = 'practice' | 'plan' | 'attendance' | 'profiles' | 'budget' | 'games';

const TABS: { id: Tab; label: string; coachOnly: boolean }[] = [
  { id: 'practice', label: '📅 一週練球', coachOnly: false },
  { id: 'plan', label: '🗓️ 練球安排', coachOnly: false },
  { id: 'attendance', label: '✅ 出缺席', coachOnly: true },
  { id: 'profiles', label: '👥 球員通訊錄', coachOnly: true },
  { id: 'budget', label: '💰 預算管理', coachOnly: true },
  { id: 'games', label: '🏆 賽事管理', coachOnly: false },
];

/** 球隊管理：教練看到全部分頁；球員、家長、老師只看得到練球通知、練球安排與賽事 */
export default function TeamPage() {
  const { user, api } = useStore();
  const coach = user?.role === 'coach';
  // 球隊管理的資料放在另一份獨立的試算表（避免原本的資料庫太大），教練可以直接打開
  const db = useCloudQuery<string>(coach, 'team-db-url', () => api<{ url: string }>('teamDbUrl', {}, '讀取試算表網址').then((r) => r.url), '');
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => coach || !t.coachOnly);
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'practice';
  return (
    <div className="page">
      <PageHeader
        icon="📋"
        title={coach ? '球隊管理' : '練球與賽事'}
        subtitle={coach ? '練球通知、點名、通訊錄、預算、賽事，資料存在另一份「球隊管理」Google 試算表' : '每週練球時間、休息日與比賽賽程'}
        actions={
          coach && db.state.data ? (
            <a className="btn btn-sm" href={db.state.data} target="_blank" rel="noreferrer">
              📂 打開球隊管理試算表
            </a>
          ) : undefined
        }
      />
      <div className="tabs view-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setParams({ tab: t.id }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'practice' && <PracticeTab coach={coach} />}
      {tab === 'plan' && <PlanTab coach={coach} myIds={user?.role === 'player' && user.playerId ? [user.playerId] : user?.childPlayerIds ?? []} />}
      {tab === 'attendance' && coach && <AttendanceTab />}
      {tab === 'profiles' && coach && <ProfilesTab />}
      {tab === 'budget' && coach && <BudgetTab />}
      {tab === 'games' && <TournamentsTab coach={coach} />}
    </div>
  );
}
