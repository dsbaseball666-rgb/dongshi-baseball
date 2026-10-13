import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/DemoStore';
import { Card, PageHeader } from '../../components/UI';
import PlayersAdmin from './PlayersAdmin';
import TasksAdmin from './TasksAdmin';
import NotesAdmin from './NotesAdmin';
import GoalsAdmin from './GoalsAdmin';
import MonstersAdmin from './MonstersAdmin';
import RulesAdmin from './RulesAdmin';
import KnowledgeAdmin from './KnowledgeAdmin';
import AnnouncementsAdmin from './AnnouncementsAdmin';
import { ExportAdmin, LogsAdmin, SyncAdmin } from './SystemAdmin';

function FitnessAdmin() {
  const { db } = useStore();
  const counts = db.players.map((p) => ({ p, n: db.fitness.filter((f) => f.playerId === p.id).length }));
  return (
    <Card title="體能檢測" icon="💪">
      <p>體能檢測的輸入、修改、刪除與圖表都在「體能檢測中心」（教練模式）中操作。</p>
      <ul className="plain-list">
        {counts.map(({ p, n }) => (
          <li key={p.id} className="row-between">
            <span>
              {p.name} {p.active ? '' : '（已停用）'}
            </span>
            <span>
              <span className="muted small">{n} 筆紀錄</span>{' '}
              <Link className="btn btn-sm" to={`/fitness?player=${p.id}`}>
                前往輸入／檢視
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const TABS = [
  { id: 'players', label: '👥 帳號與角色', el: <PlayersAdmin /> },
  { id: 'tasks', label: '📋 任務與獎勵', el: <TasksAdmin /> },
  { id: 'notes', label: '📒 球員筆記', el: <NotesAdmin /> },
  { id: 'goals', label: '🎯 目標與進度', el: <GoalsAdmin /> },
  { id: 'fitness', label: '💪 體能檢測', el: <FitnessAdmin /> },
  { id: 'monsters', label: '🐾 怪獸與圖鑑', el: <MonstersAdmin /> },
  { id: 'rules', label: '📜 球隊規章', el: <RulesAdmin /> },
  { id: 'knowledge', label: '⛑️ 防護知識', el: <KnowledgeAdmin /> },
  { id: 'announcements', label: '📣 公告', el: <AnnouncementsAdmin /> },
  { id: 'logs', label: '🗂️ 操作紀錄', el: <LogsAdmin /> },
  { id: 'export', label: '📤 匯出紀錄', el: <ExportAdmin /> },
  { id: 'sync', label: '🔌 同步錯誤', el: <SyncAdmin /> },
];

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  return (
    <div className="page">
      <PageHeader icon="🛠️" title="教練管理後台" subtitle="第一階段：操作只會改變本機示範資料，尚未連線 Apps Script" />
      <div className="tabs admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab.id === t.id} className={`tab ${tab.id === t.id ? 'active' : ''}`} onClick={() => setParams({ tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab.id}>{tab.el}</div>
    </div>
  );
}
