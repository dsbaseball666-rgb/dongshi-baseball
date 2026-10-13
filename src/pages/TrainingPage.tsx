import { useState } from 'react';
import type { PlayerMonster } from '../types';
import { useTask } from '../store/DemoStore';
import { useGame } from '../sources/game';
import type { EvolveResult } from '../store/actions';
import { canEvolve, expToNext, MAX_LEVEL, rarityStars, STAGE_LABELS, TRAIN_PLANS } from '../lib/monster';
import { formatDateTime } from '../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, PageHeader, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { GameGate } from '../components/GameGate';

function TrainingContent({ game }: { game: ReturnType<typeof useGame> }) {
  const action = useTask();
  const state = game.state!;
  const monsters = game.monsters;
  const mine = state.playerMonsters;
  const partner = mine.find((m) => m.partner);
  const partnerMon = partner && monsters.find((m) => m.id === partner.monsterId);
  const wallet = state.wallet;
  const seen = new Set(wallet.seenMonsterIds);
  const [evolved, setEvolved] = useState<EvolveResult | null>(null);
  const evolvedMon = evolved && monsters.find((m) => m.id === evolved.toId);

  const doEvolve = async (pm: PlayerMonster) => {
    setEvolved(null);
    const r = await action.run(() => game.evolve(pm.id));
    if (r.ok && r.result) setEvolved(r.result);
  };

  const evolveInfo = (pm: PlayerMonster) => {
    const m = monsters.find((x) => x.id === pm.monsterId);
    if (!m?.evolvesTo || !m.evolveLevel) return <Badge tone="purple">最終型態</Badge>;
    const next = monsters.find((x) => x.id === m.evolvesTo);
    const nextName = next && seen.has(next.id) ? next.name : '？？？';
    if (canEvolve(m, pm.level))
      return (
        <button type="button" className="btn btn-sm btn-gold evolve-btn" disabled={action.pending} onClick={() => doEvolve(pm)}>
          ✨ 進化！
        </button>
      );
    return (
      <span className="muted small">
        Lv.{m.evolveLevel} 可進化為 {nextName}
      </span>
    );
  };

  if (mine.length === 0) {
    const starters = monsters.filter((m) => m.isStarter);
    return (
      <>
        <ActionFeedback action={action} />
        {starters.length === 0 ? (
          <Card>
            <EmptyState title="目前沒有可選的初始夥伴" hint="請教練在怪獸資料中設定初始夥伴。" />
          </Card>
        ) : (
          <div className="monster-grid">
            {starters.map((m) => (
              <Card key={m.id} className="monster-card">
                <MonsterSprite monster={m} size={112} className="bounce" />
                <h3>
                  No.{String(m.dexNo).padStart(3, '0')} {m.name}
                </h3>
                <Badge tone="purple">{m.element}</Badge>
                <p className="muted small">{m.description}</p>
                <button type="button" className="btn btn-primary" disabled={action.pending} onClick={() => action.run(() => game.chooseStarter(m.id), `${m.name} 成為你的夥伴了！`)}>
                  選擇牠
                </button>
              </Card>
            ))}
          </div>
        )}
        <Alert kind="info">初始夥伴只能選一次。之後可以在野外探索中捕捉更多怪獸。</Alert>
      </>
    );
  }

  return (
    <>
      <Alert kind="info">怪獸的等級與能力是遊戲機制，<strong>不代表你真實的體能表現</strong>。受傷休養時也能透過筆記、防護知識與觀察任務繼續冒險。</Alert>
      <ActionFeedback action={action} />
      {evolved && evolvedMon && (
        <Card className="evolve-card">
          <div className="evolve-body">
            <MonsterSprite monster={evolvedMon} size={140} className="evolve-flash" />
            <div>
              <h2>🎉 恭喜！{evolved.from} 進化成 {evolved.to}！</h2>
              <p className="muted">{evolvedMon.description}</p>
              <p className="small">已登錄到怪獸圖鑑。等級與經驗值都會保留。</p>
              <button type="button" className="btn btn-sm" onClick={() => setEvolved(null)}>
                太棒了！
              </button>
            </div>
          </div>
        </Card>
      )}
      <div className="grid-2">
        <Card title="目前夥伴" icon="⭐">
          {partner && partnerMon ? (
            <div className="partner-detail">
              <MonsterSprite monster={partnerMon} size={140} className="bounce" />
              <div>
                <h3>
                  {partner.nickname} <Badge tone="purple">Lv.{partner.level}</Badge>
                </h3>
                <p className="muted small">
                  No.{String(partnerMon.dexNo).padStart(3, '0')} {partnerMon.name}・{STAGE_LABELS[partnerMon.stage]}・{partnerMon.element}・{rarityStars(partnerMon.rarity)}
                </p>
                {partner.maxHp ? <ProgressBar value={partner.hp ?? partner.maxHp} max={partner.maxHp} tone="hp" label={`HP ${partner.hp ?? partner.maxHp} / ${partner.maxHp}`} /> : null}
                {partner.atk ? (
                  <p className="muted small">
                    攻擊 {partner.atk}・防禦 {partner.def}・速度 {partner.spd}
                  </p>
                ) : null}
                {partner.level >= MAX_LEVEL ? (
                  <Badge tone="yellow">已達最高等級</Badge>
                ) : (
                  <ProgressBar value={partner.exp} max={expToNext(partner.level)} label={`EXP ${partner.exp} / ${expToNext(partner.level)}`} />
                )}
                <div className="evolve-row">{evolveInfo(partner)}</div>
              </div>
            </div>
          ) : (
            <EmptyState title="尚未設定夥伴" hint="從下方收藏中選一隻設為夥伴。" />
          )}
        </Card>
        <Card title="訓練" icon="🏋️" actions={<span className="stat-inline">🪙 {wallet.points} 點</span>}>
          {partner ? (
            <div className="train-options">
              {TRAIN_PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn train-btn"
                  disabled={action.pending || wallet.points < p.cost || partner.level >= MAX_LEVEL}
                  onClick={() => action.run(() => game.train(partner.id, p.id), `${partner.nickname} 獲得 ${p.exp} 經驗值！`)}
                >
                  <strong>{p.label}</strong>
                  <span className="small">{p.description}</span>
                </button>
              ))}
              {wallet.points < TRAIN_PLANS[0].cost && <p className="muted small">點數不足。完成每日任務可以獲得點數。</p>}
            </div>
          ) : (
            <EmptyState title="請先設定夥伴" />
          )}
        </Card>
      </div>
      <Card title={`我的收藏（${mine.length}）`} icon="🎒">
        <div className="monster-grid">
          {mine.map((pm) => {
            const m = monsters.find((x) => x.id === pm.monsterId);
            if (!m) return null;
            return (
              <div key={pm.id} className={`mini-monster ${pm.partner ? 'is-partner' : ''}`}>
                <MonsterSprite monster={m} size={72} />
                <strong>{pm.nickname}</strong>
                <span className="muted small">
                  Lv.{pm.level}・{STAGE_LABELS[m.stage]}
                </span>
                {pm.maxHp ? <ProgressBar value={pm.hp ?? pm.maxHp} max={pm.maxHp} tone="hp" label={`HP ${pm.hp ?? pm.maxHp}/${pm.maxHp}`} /> : null}
                {evolveInfo(pm)}
                {pm.partner ? (
                  <Badge tone="yellow">夥伴</Badge>
                ) : (
                  <button type="button" className="btn btn-sm" disabled={action.pending} onClick={() => action.run(() => game.setPartner(pm.id), `${pm.nickname} 成為新的夥伴！`)}>
                    設為夥伴
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid-2">
        <Card title="獎勵獲得紀錄" icon="🎁">
          {state.rewardLogs.length === 0 ? (
            <EmptyState title="還沒有獎勵紀錄" />
          ) : (
            <ul className="plain-list">
              {state.rewardLogs.slice(0, 10).map((l) => (
                <li key={l.id}>
                  <Badge tone="blue">{l.source}</Badge> {l.detail}
                  <div className="muted small">
                    {formatDateTime(l.at)}
                    {l.exp > 0 && `・經驗 +${l.exp}`}
                    {l.points > 0 && `・點數 +${l.points}`}
                    {l.points < 0 && `・點數 ${l.points}`}
                    {l.balls > 0 && `・捕捉球 +${l.balls}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="成長紀錄" icon="📈">
          {state.progress.length === 0 ? (
            <EmptyState title="還沒有成長紀錄" />
          ) : (
            <ul className="plain-list">
              {state.progress.slice(0, 10).map((p) => (
                <li key={p.id}>
                  {p.reason}：經驗 +{p.expGain} → Lv.{p.levelAfter}
                  <div className="muted small">{formatDateTime(p.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export default function TrainingPage() {
  const game = useGame();
  const hasMonsters = (game.state?.playerMonsters.length ?? 0) > 0;
  return (
    <div className="page">
      <PageHeader icon="🥚" title="怪獸訓練中心" subtitle={hasMonsters ? '用任務獲得的點數訓練夥伴' : '選擇一隻初始夥伴，開始你的冒險！'} />
      <GameGate game={game}>
        <TrainingContent game={game} />
      </GameGate>
    </div>
  );
}
