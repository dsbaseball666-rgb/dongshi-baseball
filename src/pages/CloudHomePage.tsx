import { Link } from 'react-router-dom';
import { useStore } from '../store/DemoStore';
import { useAnnouncements, useNotes } from '../sources/hooks';
import { ROLE_LABELS } from '../lib/permissions';
import { formatDate, formatDateTime, todayStr } from '../lib/date';
import { Alert, Badge, Card, EmptyState, LoadingState, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { TaskBoard } from '../components/TaskBoard';
import { useGame } from '../sources/game';
import { exploresLeft } from '../store/actions';
import { canEvolve, expToNext } from '../lib/monster';

/** 球員首頁：夥伴、點數與任務板（共用一次讀取的遊戲資料） */
function PlayerGame() {
  const game = useGame();
  const state = game.state;
  const partner = state?.playerMonsters.find((m) => m.partner);
  const mon = partner && game.monsters.find((m) => m.id === partner.monsterId);
  return (
    <>
      {state && (
        <section className="hero">
          <div className="hero-text">
            <h2>我的冒險</h2>
            <div className="stat-row">
              <div className="stat">
                <span>🪙 點數</span>
                <strong>{state.wallet.points}</strong>
              </div>
              <div className="stat">
                <span>⚾ 捕捉球</span>
                <strong>{state.wallet.balls}</strong>
              </div>
              <div className="stat">
                <span>🌿 今日探索</span>
                <strong>{exploresLeft(state.wallet, state.today)}</strong>
              </div>
            </div>
          </div>
          <div className="hero-monster">
            <Link to="/training" className="partner-card">
              {partner && mon ? (
                <>
                  <MonsterSprite monster={mon} size={120} className="bounce" />
                  <strong>
                    {partner.nickname} <Badge tone="purple">Lv.{partner.level}</Badge>
                  </strong>
                  <ProgressBar value={partner.exp} max={expToNext(partner.level)} label={`EXP ${partner.exp} / ${expToNext(partner.level)}`} />
                  {canEvolve(mon, partner.level) && <Badge tone="yellow">✨ 可以進化了！</Badge>}
                </>
              ) : (
                <>
                  <div className="egg" aria-hidden>
                    🥚
                  </div>
                  <strong>選擇你的初始夥伴！</strong>
                  <span className="muted small">前往怪獸訓練中心</span>
                </>
              )}
            </Link>
          </div>
        </section>
      )}
      <TaskBoard game={game} />
    </>
  );
}

function TodayNote({ playerId }: { playerId: string }) {
  const { notes, loading, error } = useNotes(playerId);
  const today = todayStr();
  const note = notes.find((n) => n.date === today);
  return (
    <Card title="今天的棒球筆記" icon="📒">
      {loading ? (
        <LoadingState text="讀取中…" />
      ) : error ? (
        <Alert kind="error">{error}</Alert>
      ) : note ? (
        <>
          <Badge tone="green">✓ 今天已寫筆記</Badge>
          <p className="muted small">最後更新：{formatDateTime(note.updatedAt)}</p>
          <Link to="/notes" className="btn btn-sm">
            繼續編輯
          </Link>
        </>
      ) : (
        <EmptyState icon="✏️" title="今天還沒寫筆記" action={<Link to="/notes" className="btn btn-primary btn-sm">開始寫筆記</Link>} />
      )}
    </Card>
  );
}

function LatestAnnouncements() {
  const { user } = useStore();
  const { announcements, loading, error } = useAnnouncements();
  const list = announcements
    .filter((a) => a.status === 'published' && user && a.audience.includes(user.role))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 3);
  return (
    <Card title="最新公告" icon="📣" actions={<Link to="/announcements" className="btn btn-sm btn-ghost">全部公告 →</Link>}>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <Alert kind="error">{error}</Alert>
      ) : list.length === 0 ? (
        <EmptyState icon="📭" title="目前沒有公告" />
      ) : (
        <ul className="plain-list">
          {list.map((a) => (
            <li key={a.id}>
              {a.pinned && <Badge tone="red">置頂</Badge>} <strong>{a.title}</strong>
              <div className="muted small">{formatDateTime(a.publishedAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CloudHomePage() {
  const { user } = useStore();
  if (!user) return null;
  const links = [
    ...(user.role !== 'parent'
      ? [
          { to: '/notes', icon: '📒', label: '每日筆記' },
          { to: '/goals', icon: '🎯', label: '目標進度' },
          { to: '/fitness', icon: '💪', label: '體能檢測' },
        ]
      : []),
    ...(user.role === 'player'
      ? [
          { to: '/training', icon: '🥚', label: '怪獸訓練' },
          { to: '/explore', icon: '🌿', label: '野外探索' },
        ]
      : []),
    ...(user.role !== 'parent' ? [{ to: '/dex', icon: '📖', label: '怪獸圖鑑' }] : []),
    { to: '/rules', icon: '📜', label: '球隊規章' },
    { to: '/knowledge', icon: '⛑️', label: '防護知識' },
    { to: '/announcements', icon: '📣', label: '球隊公告' },
    ...(user.role === 'coach' ? [{ to: '/admin', icon: '🛠️', label: '教練後台' }] : []),
    { to: '/account', icon: '🔑', label: '我的帳號' },
  ];
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <p className="muted">{formatDate(todayStr())}</p>
          <h1>歡迎，{user.displayName}！</h1>
          <p>
            <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span> 帳號：{user.loginId}
          </p>
          {user.role === 'parent' && <p className="muted small">家長可閱讀球隊規章、防護知識與開放給家長的公告；無法修改球員的體能資料、遊戲獎勵或管理設定。</p>}
        </div>
      </section>
      {user.role === 'player' && user.playerId && <PlayerGame />}
      <div className="grid-2">
        {user.role === 'player' && user.playerId && <TodayNote playerId={user.playerId} />}
        <LatestAnnouncements />
      </div>
      <Card title="快速前往" icon="🧭">
        <div className="quick-grid">
          {links.map((i) => (
            <Link key={i.to} to={i.to} className="quick-tile">
              <span className="quick-icon" aria-hidden>
                {i.icon}
              </span>
              {i.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
