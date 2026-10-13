import { Link } from 'react-router-dom';
import { useStore } from '../store/DemoStore';
import { NAV_ITEMS } from '../components/Layout';
import { Badge, Card, DemoTag, EmptyState, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { TaskBoard } from '../components/TaskBoard';
import { useGame } from '../sources/game';
import { canEvolve, expToNext } from '../lib/monster';
import { formatDate, formatDateTime, todayStr } from '../lib/date';
import { exploresLeft } from '../store/actions';
import { ROLE_LABELS } from '../lib/permissions';

function AnnouncementPreview() {
  const { db, user } = useStore();
  if (!user) return null;
  const list = db.announcements
    .filter((a) => a.status === 'published' && a.audience.includes(user.role))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 3);
  return (
    <Card title="最新公告" icon="📣" actions={<Link to="/announcements" className="btn btn-sm btn-ghost">全部公告 →</Link>}>
      {list.length === 0 ? (
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

function QuickLinks() {
  const { user } = useStore();
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => i.to !== '/' && i.roles.includes(user.role));
  return (
    <Card title="快速前往" icon="🧭">
      <div className="quick-grid">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="quick-tile">
            <span className="quick-icon" aria-hidden>
              {i.icon}
            </span>
            {i.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function PlayerHome() {
  const { db, user } = useStore();
  const game = useGame();
  const playerId = user?.playerId ?? '';
  const player = db.players.find((p) => p.id === playerId);
  const partner = db.playerMonsters.find((m) => m.playerId === playerId && m.partner);
  const mon = partner && db.monsters.find((m) => m.id === partner.monsterId);
  const wallet = db.wallets.find((w) => w.playerId === playerId);
  const today = todayStr();
  const noteToday = db.notes.find((n) => n.playerId === playerId && n.date === today);

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="muted">{formatDate(today)}</p>
          <h1>歡迎回到冒險基地，{player?.name ?? user?.displayName}！</h1>
          <p>
            背號 {player?.number ?? '—'}・{player?.position ?? '—'}・{player?.grade ?? '—'} <DemoTag />
          </p>
          <div className="stat-row">
            <div className="stat">
              <span>🪙 點數</span>
              <strong>{wallet?.points ?? 0}</strong>
            </div>
            <div className="stat">
              <span>⚾ 捕捉球</span>
              <strong>{wallet?.balls ?? 0}</strong>
            </div>
            <div className="stat">
              <span>🌿 今日探索</span>
              <strong>{exploresLeft(wallet, today)}</strong>
            </div>
          </div>
        </div>
        <div className="hero-monster">
          {partner && mon ? (
            <Link to="/training" className="partner-card">
              <MonsterSprite monster={mon} size={120} className="bounce" />
              <strong>
                {partner.nickname} <Badge tone="purple">Lv.{partner.level}</Badge>
              </strong>
              <ProgressBar value={partner.exp} max={expToNext(partner.level)} label={`EXP ${partner.exp} / ${expToNext(partner.level)}`} />
              {canEvolve(mon, partner.level, partner.affection ?? 0) &&<Badge tone="yellow">✨ 可以進化了！</Badge>}
            </Link>
          ) : (
            <Link to="/training" className="partner-card">
              <div className="egg" aria-hidden>
                🥚
              </div>
              <strong>選擇你的初始夥伴！</strong>
              <span className="muted small">前往怪獸訓練中心</span>
            </Link>
          )}
        </div>
      </section>

      <div className="grid-2">
        <Card title="今天的棒球筆記" icon="📒">
          {noteToday ? (
            <>
              <Badge tone="green">✓ 今天已寫筆記</Badge>
              <p className="muted small">最後更新：{formatDateTime(noteToday.updatedAt)}</p>
              <Link to="/notes" className="btn btn-sm">
                繼續編輯
              </Link>
            </>
          ) : (
            <EmptyState icon="✏️" title="今天還沒寫筆記" hint="寫完筆記可以完成任務、獲得經驗值。" action={<Link to="/notes" className="btn btn-primary btn-sm">開始寫筆記</Link>} />
          )}
        </Card>
        <AnnouncementPreview />
      </div>
      <TaskBoard game={game} />
      <QuickLinks />
    </>
  );
}

function CoachHome() {
  const { db, user } = useStore();
  const today = todayStr();
  const active = db.players.filter((p) => p.active);
  const notesToday = db.notes.filter((n) => n.date === today && active.some((p) => p.id === n.playerId)).length;
  const pendingTasks = db.completions.filter((c) => c.status === 'submitted').length;
  const pendingCps = db.goals.reduce((s, g) => s + g.checkpoints.filter((c) => c.state === 'submitted').length, 0);
  const reviewRules = db.rules.filter((r) => r.needsCoachReview).length;
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="muted">{formatDate(today)}</p>
          <h1>教練您好，{user?.displayName}</h1>
          <p>
            {ROLE_LABELS.coach}・球隊總覽 <DemoTag />
          </p>
        </div>
      </section>
      <div className="stat-grid">
        <Link to="/admin?tab=players" className="stat-card">
          <span>👥 啟用中球員</span>
          <strong>{active.length}</strong>
        </Link>
        <Link to="/admin?tab=notes" className="stat-card">
          <span>📒 今日筆記</span>
          <strong>
            {notesToday} / {active.length}
          </strong>
        </Link>
        <Link to="/admin?tab=tasks" className="stat-card">
          <span>📋 待確認任務</span>
          <strong>{pendingTasks}</strong>
        </Link>
        <Link to="/admin?tab=goals" className="stat-card">
          <span>🎯 待核准檢核點</span>
          <strong>{pendingCps}</strong>
        </Link>
        <Link to="/admin?tab=rules" className="stat-card warn">
          <span>📜 待確認規章</span>
          <strong>{reviewRules}</strong>
        </Link>
      </div>
      <div className="grid-2">
        <AnnouncementPreview />
        <Card title="最近操作紀錄" icon="🗂️" actions={<Link to="/admin?tab=logs" className="btn btn-sm btn-ghost">全部 →</Link>}>
          {db.auditLogs.length === 0 ? (
            <EmptyState title="尚無操作紀錄" />
          ) : (
            <ul className="plain-list">
              {db.auditLogs.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <strong>{l.action}</strong> <span className="muted">{l.detail}</span>
                  <div className="muted small">
                    {formatDateTime(l.at)}・{l.actorName}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <QuickLinks />
    </>
  );
}

function ParentHome() {
  const { db, user } = useStore();
  const children = db.players.filter((p) => user?.childPlayerIds.includes(p.id));
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>家長您好，{user?.displayName}</h1>
          <p>
            關聯球員：{children.map((c) => c.name).join('、') || '—'} <DemoTag />
          </p>
          <p className="muted small">家長可閱讀球隊規章、防護知識與教練開放給家長的公告；無法修改體能資料、遊戲獎勵或管理設定。</p>
        </div>
      </section>
      <AnnouncementPreview />
      <QuickLinks />
    </>
  );
}

export default function HomePage() {
  const { user } = useStore();
  return (
    <div className="page">
      {user?.role === 'player' && <PlayerHome />}
      {user?.role === 'coach' && <CoachHome />}
      {user?.role === 'parent' && <ParentHome />}
    </div>
  );
}
