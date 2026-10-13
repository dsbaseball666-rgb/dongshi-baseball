import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ItemId } from '../types';
import { useTask } from '../store/DemoStore';
import { useGame } from '../sources/game';
import { BATTLE_RULES, ITEM_INFO, ITEM_MAX_HOLD, itemCount } from '../lib/battle';
import { ActionFeedback, Alert, Badge, Card, EmptyState, PageHeader, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { GameGate } from '../components/GameGate';

type Game = ReturnType<typeof useGame>;

function ShopContent({ game }: { game: Game }) {
  const action = useTask();
  const state = game.state!;
  const wallet = state.wallet;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [healMsg, setHealMsg] = useState<string | null>(null);
  const inBattle = !!state.battle;
  const heals = ITEM_INFO.filter((i) => !i.inBattleOnly);

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <span>🪙 點數</span>
          <strong>{wallet.points}</strong>
        </div>
        {ITEM_INFO.map((i) => (
          <div key={i.id} className="stat">
            <span>
              {i.icon} {i.label}
            </span>
            <strong>{itemCount(wallet, i.id)}</strong>
          </div>
        ))}
      </div>
      <Alert kind="info">道具只能用<strong>遊戲點數</strong>購買（完成任務、對戰獲得），<strong>不能用真實金錢購買</strong>。捕捉球不在商店販售，請透過任務與每日補給取得。</Alert>
      <ActionFeedback action={action} />
      {healMsg && !action.pending && !action.error && <Alert kind="success">{healMsg}</Alert>}

      <Card title="道具商店" icon="🏪">
        <div className="shop-grid">
          {ITEM_INFO.map((i) => {
            const n = qty[i.id] ?? 1;
            const have = itemCount(wallet, i.id);
            const cost = i.price * n;
            const full = have + n > ITEM_MAX_HOLD;
            return (
              <div key={i.id} className="shop-item">
                <div className="shop-icon" aria-hidden>
                  {i.icon}
                </div>
                <strong>{i.label}</strong>
                <span className="small">{i.description}</span>
                <span className="muted small">
                  {i.price} 點・持有 {have} / {ITEM_MAX_HOLD}
                </span>
                <div className="shop-buy">
                  <select aria-label={`${i.label} 數量`} value={n} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))}>
                    {[1, 2, 3, 5].map((v) => (
                      <option key={v} value={v}>
                        ×{v}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-gold"
                    disabled={action.pending || wallet.points < cost || full}
                    onClick={() => {
                      setHealMsg(null);
                      action.run(() => game.buyItem(i.id as ItemId, n), `買到 ${i.label} ×${n}！`);
                    }}
                  >
                    購買（{cost} 點）
                  </button>
                </div>
                {wallet.points < cost && <span className="muted small">點數不足</span>}
                {full && <span className="muted small">已達持有上限</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="幫怪獸回復 HP" icon="💖">
        {inBattle && (
          <Alert kind="warn">
            你有一場進行中的對戰，請到 <Link to="/battle">對戰競技場</Link> 完成，或在對戰中使用道具。
          </Alert>
        )}
        <p className="muted small">HP 會自然回復：每小時回復最大 HP 的 {BATTLE_RULES.regenPercentPerHour}%（大約 4 小時回滿）。急著出戰時可以使用回復道具。</p>
        {state.playerMonsters.length === 0 ? (
          <EmptyState title="你還沒有怪獸" hint="先到怪獸訓練中心選擇初始夥伴。" />
        ) : (
          <div className="monster-grid">
            {state.playerMonsters.map((pm) => {
              const m = game.monsters.find((x) => x.id === pm.monsterId);
              if (!m || !pm.maxHp) return null;
              const hp = pm.hp ?? pm.maxHp;
              const fullHp = hp >= pm.maxHp;
              return (
                <div key={pm.id} className={`mini-monster ${pm.partner ? 'is-partner' : ''}`}>
                  <MonsterSprite monster={m} size={64} />
                  <strong>{pm.nickname}</strong>
                  <span className="muted small">Lv.{pm.level}</span>
                  <ProgressBar value={hp} max={pm.maxHp} tone="hp" label={`HP ${hp} / ${pm.maxHp}`} />
                  {fullHp ? (
                    <Badge tone="green">體力充足</Badge>
                  ) : (
                    heals.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        className="btn btn-sm"
                        disabled={action.pending || inBattle || itemCount(wallet, i.id) < 1}
                        onClick={async () => {
                          setHealMsg(null);
                          const r = await action.run(() => game.useItem(i.id, pm.id));
                          if (r.ok) setHealMsg(`${pm.nickname} 回復了 ${r.result} HP！`);
                        }}
                      >
                        {i.icon} {i.label}（{itemCount(wallet, i.id)}）
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

export default function ShopPage() {
  const game = useGame();
  return (
    <div className="page">
      <PageHeader icon="🎒" title="道具商店" subtitle="用遊戲點數購買道具，幫怪獸回復體力" />
      <GameGate game={game}>
        <ShopContent game={game} />
      </GameGate>
    </div>
  );
}
