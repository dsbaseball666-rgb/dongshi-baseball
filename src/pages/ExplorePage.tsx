import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTask } from '../store/DemoStore';
import { useGame } from '../sources/game';
import { exploresLeft, type CaptureResult } from '../store/actions';
import { EXPLORE_AREAS, rarityStars } from '../lib/monster';
import { config } from '../config';
import { ActionFeedback, Alert, Badge, Card, PageHeader } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { GameGate } from '../components/GameGate';

function ExploreContent({ game }: { game: ReturnType<typeof useGame> }) {
  const action = useTask();
  const [result, setResult] = useState<CaptureResult | null>(null);
  const state = game.state!;
  const wallet = state.wallet;
  const today = state.today;
  const left = exploresLeft(wallet, today);
  const encounter = wallet.encounter;
  const mon = encounter && game.monsters.find((m) => m.id === encounter.monsterId);
  const owned = mon && state.playerMonsters.some((p) => p.monsterId === mon.id);
  const supplied = wallet.supplyDate === today;
  const hasMonsters = state.playerMonsters.length > 0;

  const doExplore = async (areaId: string) => {
    setResult(null);
    await action.run(() => game.explore(areaId));
  };
  const doCapture = async () => {
    const res = await action.run(() => game.capture());
    if (res.ok && res.result) setResult(res.result);
  };

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <span>🌿 今日探索</span>
          <strong>
            {left} / {config.dailyExplores}
          </strong>
        </div>
        <div className="stat">
          <span>⚾ 捕捉球</span>
          <strong>{wallet.balls}</strong>
        </div>
        <button type="button" className="btn btn-gold" disabled={supplied || action.pending} onClick={() => action.run(() => game.supply(), `領到捕捉球 ×${config.dailySupplyBalls}！`)}>
          {supplied ? '✓ 今日補給已領取' : `🎒 領取每日補給（捕捉球 ×${config.dailySupplyBalls}）`}
        </button>
      </div>
      <Alert kind="info">遊戲道具只能透過任務與每日補給取得，<strong>不能用真實金錢購買</strong>。每位球員每天的探索次數與補給都相同。</Alert>
      {!hasMonsters && (
        <Alert kind="warn">
          你還沒有夥伴，建議先到 <Link to="/training">怪獸訓練中心</Link> 選擇初始夥伴。
        </Alert>
      )}
      <ActionFeedback action={action} />

      {result && (
        <Alert kind={result.success ? 'success' : 'warn'}>
          {result.success
            ? result.duplicate
              ? `成功捕捉 ${result.monsterName}！你已經有這隻怪獸，轉換為 15 點。`
              : `成功捕捉 ${result.monsterName}！已加入你的收藏圖鑑。`
            : `${result.monsterName} 掙脫了捕捉球！牠還在附近，可以再試一次或離開。`}
        </Alert>
      )}

      {encounter && mon ? (
        <Card title="野生怪獸出現了！" icon="❗" className="encounter">
          <div className="encounter-body">
            <MonsterSprite monster={mon} size={160} className="bounce" />
            <div>
              <h3>
                No.{String(mon.dexNo).padStart(3, '0')} {mon.name}
              </h3>
              <p>
                <Badge tone="purple">{mon.element}</Badge> <span className="stars">{rarityStars(mon.rarity)}</span> {owned && <Badge tone="green">已收藏</Badge>}
              </p>
              <p className="muted">{mon.description}</p>
              <div className="form-actions">
                <button type="button" className="btn btn-primary" disabled={action.pending || wallet.balls < 1} onClick={doCapture}>
                  ⚾ 丟出捕捉球
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={action.pending}
                  onClick={async () => {
                    const r = await action.run(() => game.leave());
                    if (r.ok) setResult(null);
                  }}
                >
                  離開
                </button>
              </div>
              {wallet.balls < 1 && <p className="muted small">捕捉球用完了，可以領取每日補給或完成任務獲得。</p>}
            </div>
          </div>
        </Card>
      ) : (
        <div className="area-grid">
          {EXPLORE_AREAS.map((a) => (
            <Card key={a.id} className={`area-card area-${a.id}`}>
              <div className="area-icon" aria-hidden>
                {a.icon}
              </div>
              <h3>{a.name}</h3>
              <p className="muted small">{a.description}</p>
              <button type="button" className="btn btn-primary" disabled={left <= 0 || action.pending} onClick={() => doExplore(a.id)}>
                {left <= 0 ? '今日次數已用完' : '出發探索'}
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function ExplorePage() {
  const game = useGame();
  return (
    <div className="page">
      <PageHeader icon="🌿" title="野外探索與捕捉" subtitle="每天都有免費探索次數，捕捉球可從任務與每日補給取得" />
      <GameGate game={game}>
        <ExploreContent game={game} />
      </GameGate>
    </div>
  );
}
