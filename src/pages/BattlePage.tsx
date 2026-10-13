import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Battle, Combatant, ItemId, Monster, PlayerMonster } from '../types';
import { useTask } from '../store/DemoStore';
import { useGame, useOpponents, type BattleAction } from '../sources/game';
import { EXPLORE_AREAS } from '../lib/monster';
import { BATTLE_RULES, battlesLeft, ELEMENT_BEATS, ELEMENT_TRAITS, ITEM_INFO, itemCount, STATUS_LABELS } from '../lib/battle';
import { formatDateTime } from '../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingState, PageHeader, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';
import { GameGate } from '../components/GameGate';

type Game = ReturnType<typeof useGame>;

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  return <ProgressBar value={hp} max={maxHp} tone="hp" label={`HP ${hp} / ${maxHp}`} />;
}

function Fighter({ c, monster, side }: { c: Combatant; monster?: Monster; side: 'me' | 'foe' }) {
  return (
    <div className={`fighter fighter-${side} ${c.hp <= 0 ? 'fainted' : ''}`}>
      {monster && <MonsterSprite monster={monster} size={side === 'me' ? 120 : 110} className={c.hp > 0 ? 'bounce' : ''} />}
      <div className="fighter-info">
        <strong>
          {c.name} <Badge tone="purple">Lv.{c.level}</Badge>
        </strong>
        <span className="muted small">
          {c.element}・{side === 'foe' ? c.owner : '我的怪獸'}
        </span>
        <HpBar hp={c.hp} maxHp={c.maxHp} />
        <div className="chip-row">
          {c.atkUp && <Badge tone="red">攻擊 ↑</Badge>}
          {c.defUp && <Badge tone="blue">防禦 ↑</Badge>}
          {side === 'me' && (c.cd > 0 ? <Badge>必殺技冷卻 {c.cd}</Badge> : <Badge tone="yellow">必殺技可使用</Badge>)}
        </div>
      </div>
    </div>
  );
}

function BattleLog({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);
  return (
    <div ref={ref} className="battle-log" aria-live="polite">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

/** 對戰畫面（進行中或剛結束） */
function Arena({ game, battle, finished, onClose }: { game: Game; battle: Battle; finished: boolean; onClose: () => void }) {
  const action = useTask();
  const [showItems, setShowItems] = useState(false);
  const wallet = game.state!.wallet;
  const monOf = (id: string) => game.monsters.find((m) => m.id === id);
  const busy = action.pending || finished;
  const pvp = battle.mode === 'pvp';

  const act = async (a: BattleAction, itemId?: ItemId) => {
    setShowItems(false);
    if (a === 'flee' && pvp && !window.confirm('隊友挑戰中離開會算投降（落敗），確定嗎？')) return;
    await action.run(() => game.battleAction(battle.id, a, itemId));
  };
  const usable = ITEM_INFO.filter((i) => itemCount(wallet, i.id) > 0);

  return (
    <Card className={`arena arena-${battle.mode}`}>
      <div className="arena-head">
        <Badge tone={pvp ? 'red' : 'green'}>{pvp ? '🤝 隊友挑戰' : '🌿 野外對戰'}</Badge>
        <span className="muted small">第 {Math.min(battle.turn, BATTLE_RULES.maxTurns)} 回合</span>
      </div>
      <div className="arena-field">
        <Fighter c={battle.foe} monster={monOf(battle.foe.monsterId)} side="foe" />
        <Fighter c={battle.me} monster={monOf(battle.me.monsterId)} side="me" />
      </div>
      <BattleLog lines={battle.log} />
      <ActionFeedback action={action} />
      {finished ? (
        <div className={`battle-result result-${battle.status}`}>
          <h3>{battle.status === 'won' ? '🏆 勝利！' : battle.status === 'lost' ? '💪 下次再加油！' : battle.status === 'draw' ? '🤝 平手！' : '🏃 已離開對戰'}</h3>
          {battle.result && (battle.result.exp > 0 || battle.result.points > 0 || battle.result.drop) && (
            <p>
              {battle.result.exp > 0 && `經驗值 +${battle.result.exp}　`}
              {battle.result.points > 0 && `點數 +${battle.result.points}　`}
              {battle.result.drop && '獲得回復藥水 ×1'}
            </p>
          )}
          {battle.me.hp <= 0 && <p className="muted small">{battle.me.name} 需要休息：每小時會自然回復 {BATTLE_RULES.regenPercentPerHour}% HP，也可以到道具商店使用回復藥水。</p>}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            回到競技場
          </button>
        </div>
      ) : (
        <>
          <div className="battle-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('attack')}>
              ⚔️ 攻擊
            </button>
            <button type="button" className="btn btn-gold" disabled={busy || battle.me.cd > 0} onClick={() => act('skill')}>
              💥 必殺技{battle.me.cd > 0 ? `（${battle.me.cd}）` : ''}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => act('defend')}>
              🛡️ 防守
            </button>
            <button type="button" className="btn" disabled={busy || usable.length === 0} aria-expanded={showItems} onClick={() => setShowItems((v) => !v)}>
              🎒 道具
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act('flee')}>
              {pvp ? '🏳️ 投降' : '🏃 逃跑'}
            </button>
          </div>
          {showItems && (
            <div className="item-pick">
              {usable.map((i) => (
                <button key={i.id} type="button" className="btn btn-sm" disabled={busy} onClick={() => act('item', i.id)}>
                  {i.icon} {i.label} ×{itemCount(wallet, i.id)}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">防守、道具、逃跑會優先行動；攻擊時速度快的一方先出手。使用道具也會用掉這一回合。</p>
        </>
      )}
    </Card>
  );
}

function MonsterPicker({ game, value, onChange }: { game: Game; value: string; onChange: (id: string) => void }) {
  const mine = game.state!.playerMonsters;
  return (
    <div className="monster-grid">
      {mine.map((pm: PlayerMonster) => {
        const m = game.monsters.find((x) => x.id === pm.monsterId);
        if (!m) return null;
        const hp = pm.hp ?? 0;
        const fainted = hp <= 0;
        return (
          <button key={pm.id} type="button" className={`mini-monster pick ${value === pm.id ? 'is-picked' : ''}`} disabled={fainted} aria-pressed={value === pm.id} onClick={() => onChange(pm.id)}>
            <MonsterSprite monster={m} size={64} />
            <strong>{pm.nickname}</strong>
            <span className="muted small">
              Lv.{pm.level}・{m.element}
              {pm.partner && '・夥伴'}
            </span>
            {pm.maxHp ? <HpBar hp={hp} maxHp={pm.maxHp} /> : null}
            {fainted && <Badge tone="red">需要休息</Badge>}
          </button>
        );
      })}
    </div>
  );
}

function Lobby({ game }: { game: Game }) {
  const action = useTask();
  const state = game.state!;
  const mine = state.playerMonsters;
  const left = battlesLeft(state.wallet, state.today);
  const firstReady = mine.find((p) => p.partner && (p.hp ?? 0) > 0) ?? mine.find((p) => (p.hp ?? 0) > 0);
  const [pmId, setPmId] = useState(firstReady?.id ?? '');
  const [tab, setTab] = useState<'pve' | 'pvp'>('pve');
  const opponents = useOpponents(tab === 'pvp');
  const picked = mine.find((p) => p.id === pmId && (p.hp ?? 0) > 0);

  if (mine.length === 0)
    return (
      <Card>
        <EmptyState icon="🥚" title="你還沒有夥伴" hint="先到怪獸訓練中心選擇初始夥伴，就可以開始對戰。" action={<Link to="/training" className="btn btn-primary">前往怪獸訓練中心</Link>} />
      </Card>
    );

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <span>🌿 野外對戰</span>
          <strong>
            {left.pve} / {BATTLE_RULES.pveDaily}
          </strong>
        </div>
        <div className="stat">
          <span>🤝 隊友挑戰</span>
          <strong>
            {left.pvp} / {BATTLE_RULES.pvpDaily}
          </strong>
        </div>
        <div className="stat">
          <span>🪙 點數</span>
          <strong>{state.wallet.points}</strong>
        </div>
        <Link to="/shop" className="btn btn-gold">
          🎒 道具商店
        </Link>
      </div>
      <ActionFeedback action={action} />
      <Card title="1. 選擇出戰的怪獸" icon="🐾">
        <MonsterPicker game={game} value={pmId} onChange={setPmId} />
        {!firstReady && (
          <Alert kind="warn">
            所有怪獸都需要休息。每小時會自然回復 {BATTLE_RULES.regenPercentPerHour}% HP，也可以到 <Link to="/shop">道具商店</Link> 使用回復藥水。
          </Alert>
        )}
      </Card>
      <Card title="2. 選擇對手" icon="⚔️">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'pve'} className={`tab ${tab === 'pve' ? 'active' : ''}`} onClick={() => setTab('pve')}>
            🌿 野外對戰（PVE）
          </button>
          <button type="button" role="tab" aria-selected={tab === 'pvp'} className={`tab ${tab === 'pvp' ? 'active' : ''}`} onClick={() => setTab('pvp')}>
            🤝 隊友挑戰（PVP）
          </button>
        </div>
        {tab === 'pve' ? (
          <>
            <p className="muted small">和野生怪獸對戰，對手等級會接近你的怪獸。獲勝可以得到經驗值、點數，有機會撿到回復藥水。</p>
            <div className="area-grid">
              {EXPLORE_AREAS.map((a) => (
                <div key={a.id} className={`area-card area-${a.id} card`}>
                  <div className="area-icon" aria-hidden>
                    {a.icon}
                  </div>
                  <h3>{a.name}</h3>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!picked || left.pve <= 0 || action.pending}
                    onClick={() => action.run(() => game.startBattle({ mode: 'pve', areaId: a.id, playerMonsterId: pmId }))}
                  >
                    {left.pve <= 0 ? '今日次數已用完' : '開始對戰'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted small">挑戰隊友的夥伴。對方由電腦操控、以滿血出戰（不是即時連線），對方的怪獸不會受傷。每位隊友每天可以挑戰一次。</p>
            {opponents.loading ? (
              <LoadingState text="讀取隊友名單…" />
            ) : opponents.error ? (
              <Alert kind="error">{opponents.error}</Alert>
            ) : opponents.opponents.length === 0 ? (
              <EmptyState title="目前沒有可以挑戰的隊友" hint="隊友選好夥伴後就會出現在這裡。" />
            ) : (
              <ul className="opponent-list">
                {opponents.opponents.map((o) => {
                  const m = game.monsters.find((x) => x.id === o.monsterId);
                  return (
                    <li key={o.playerId} className="opponent">
                      {m && <MonsterSprite monster={m} size={56} />}
                      <div>
                        <strong>{o.name}</strong>
                        <div className="muted small">
                          {o.nickname}・Lv.{o.level}・{o.element}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={!picked || left.pvp <= 0 || o.challengedToday || action.pending}
                        onClick={() => action.run(() => game.startBattle({ mode: 'pvp', opponentPlayerId: o.playerId, playerMonsterId: pmId }))}
                      >
                        {o.challengedToday ? '今天已挑戰' : '挑戰'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {!picked && <p className="muted small">請先在上方選擇一隻有體力的怪獸。</p>}
      </Card>
      <div className="grid-2">
        <Card title="對戰規則" icon="📘">
          <ul className="bullet-list">
            <li>⚔️ 攻擊：一般傷害。💥 必殺技：約 1.7 倍傷害，用完要等 {BATTLE_RULES.skillCooldown} 回合。🛡️ 防守：這回合受到的傷害減半。</li>
            <li>屬性相剋：剋制對手時傷害 ×1.3，被剋時 ×0.8。</li>
            <li>對戰結束後，怪獸剩下的 HP 會保留；HP 歸零就要休息，每小時自然回復 {BATTLE_RULES.regenPercentPerHour}%。</li>
            <li>超過 {BATTLE_RULES.maxTurns} 回合依剩餘 HP 比例判定勝負。</li>
            <li>每天：野外對戰 {BATTLE_RULES.pveDaily} 次、隊友挑戰 {BATTLE_RULES.pvpDaily} 次，每位球員都一樣。</li>
          </ul>
        </Card>
        <Card title="屬性相剋表" icon="🔄">
          <table className="element-table">
            <thead>
              <tr>
                <th>屬性</th>
                <th>剋制</th>
                <th>特色</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ELEMENT_BEATS) as (keyof typeof ELEMENT_BEATS)[]).map((e) => (
                <tr key={e}>
                  <td>{e}</td>
                  <td>{ELEMENT_BEATS[e]}</td>
                  <td className="small">{ELEMENT_TRAITS[e]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="最近的對戰" icon="📜">
        {(state.battleHistory ?? []).length === 0 ? (
          <EmptyState title="還沒有對戰紀錄" />
        ) : (
          <ul className="plain-list">
            {(state.battleHistory ?? []).map((h) => (
              <li key={h.id}>
                <Badge tone={h.status === 'won' ? 'green' : h.status === 'lost' ? 'red' : 'gray'}>{STATUS_LABELS[h.status]}</Badge>{' '}
                {h.defense ? `🛡️ ${h.opponentName} 挑戰你：${h.myMonster} 對上 ${h.foeMonster}` : `${h.mode === 'pvp' ? '🤝' : '🌿'} ${h.myMonster} 對上 ${h.opponentName}${h.mode === 'pvp' ? ` 的 ${h.foeMonster}` : ''}`}
                <div className="muted small">{formatDateTime(h.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function BattleContent({ game }: { game: Game }) {
  const [ended, setEnded] = useState<Battle | null>(null);
  const active = game.state!.battle ?? null;
  const original = game.battleAction;
  // 包一層：對戰結束時記下最後的戰況，讓球員看完結果再回到競技場
  const wrapped: Game = {
    ...game,
    battleAction: async (...args: Parameters<Game['battleAction']>) => {
      const r = await original(...args);
      if (r.ended) setEnded(r.battle);
      return r;
    },
  };
  if (ended) return <Arena game={wrapped} battle={ended} finished onClose={() => setEnded(null)} />;
  if (active) return <Arena game={wrapped} battle={active} finished={false} onClose={() => undefined} />;
  return <Lobby game={game} />;
}

export default function BattlePage() {
  const game = useGame();
  return (
    <div className="page">
      <PageHeader icon="⚔️" title="對戰競技場" subtitle="野外對戰（PVE）與隊友挑戰（PVP）" />
      <Alert kind="info">對戰是遊戲機制，怪獸的強弱<strong>不代表你真實的球技或體能</strong>。所有對戰結果都由雲端伺服器計算。</Alert>
      <GameGate game={game}>
        <BattleContent game={game} />
      </GameGate>
    </div>
  );
}
