import { Fragment, useState } from 'react';
import type { MonsterElement } from '../types';
import { useStore } from '../store/DemoStore';
import { useGame } from '../sources/game';
import { can } from '../lib/permissions';
import { evolutionChain, evolveAffectionOf, EXPLORE_AREAS, rarityStars, STAGE_LABELS } from '../lib/monster';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader, ProgressBar } from '../components/UI';
import { MonsterSprite } from '../components/MonsterSprite';

type DexState = 'owned' | 'seen' | 'unknown';
const ELEMENTS: MonsterElement[] = ['熱血', '疾風', '堅守', '成長', '智慧', '團結'];

export default function DexPage() {
  const { user } = useStore();
  const game = useGame();
  const isCoach = can(user, 'game.manage');
  if (game.monstersError || (!isCoach && game.error)) {
    return (
      <div className="page">
        <PageHeader icon="📖" title="怪獸收藏圖鑑" />
        <Alert kind="error">{game.monstersError ?? game.error}</Alert>
      </div>
    );
  }
  if (game.monstersLoading || (!isCoach && game.loading)) {
    return (
      <div className="page">
        <PageHeader icon="📖" title="怪獸收藏圖鑑" />
        <Card>
          <LoadingState text="讀取圖鑑中…" />
        </Card>
      </div>
    );
  }
  return <DexContent game={game} isCoach={isCoach} />;
}

function DexContent({ game, isCoach }: { game: ReturnType<typeof useGame>; isCoach: boolean }) {
  const all = game.monsters;
  const ownedIds = new Set((game.state?.playerMonsters ?? []).map((p) => p.monsterId));
  // 進化前的型態也算收藏：把每隻擁有怪獸在進化路線中「前面的型態」一併算入
  const collected = new Set<string>();
  for (const id of ownedIds) {
    const chain = evolutionChain(all, id);
    chain.slice(0, chain.findIndex((c) => c.id === id) + 1).forEach((c) => collected.add(c.id));
  }
  const seenIds = new Set([...(game.state?.wallet.seenMonsterIds ?? []), ...collected]);
  const monsters = [...all].sort((a, b) => a.dexNo - b.dexNo);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'owned' | 'missing'>('all');
  const [element, setElement] = useState<MonsterElement | 'all'>('all');

  const stateOf = (id: string): DexState => (isCoach || collected.has(id) ? 'owned' : seenIds.has(id) ? 'seen' : 'unknown');
  // 屬性篩選時不顯示未解鎖的怪獸，避免提前洩漏牠的屬性
  const matchElement = (id: string, el: MonsterElement) => element === 'all' || (stateOf(id) !== 'unknown' && el === element);
  const matchView = (id: string) => view === 'all' || (view === 'owned') === (stateOf(id) === 'owned');
  const list = monsters.filter((m) => matchElement(m.id, m.element) && matchView(m.id));
  const sel = monsters.find((m) => m.id === selected);
  const selState = sel ? stateOf(sel.id) : 'unknown';
  const area = (id: string) => EXPLORE_AREAS.find((a) => a.id === id)?.name ?? id;
  const chain = sel ? evolutionChain(all, sel.id) : [];

  return (
    <div className="page">
      <PageHeader icon="📖" title="怪獸收藏圖鑑" subtitle={isCoach ? `教練檢視：顯示全部 ${monsters.length} 隻怪獸資料` : `收集 ${monsters.length} 隻原創怪獸，完成你的圖鑑！`} />
      {!isCoach && (
        <Card>
          <ProgressBar tone="goal" value={collected.size} max={monsters.length} label={`已收藏 ${collected.size} / ${monsters.length}・已遇見 ${seenIds.size}`} />
          <p className="muted small">最終型態只能透過進化取得。進化前的型態也會保留在圖鑑紀錄中。</p>
        </Card>
      )}
      <div className="dex-filters">
        <div className="tabs" role="tablist">
          {(
            [
              ['all', '全部'],
              ['owned', '已收藏'],
              ['missing', '未收藏'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <select aria-label="屬性篩選" value={element} onChange={(e) => setElement(e.target.value as MonsterElement | 'all')}>
          <option value="all">全部屬性</option>
          {ELEMENTS.map((el) => (
            <option key={el} value={el}>
              {el}
            </option>
          ))}
        </select>
      </div>
      <div className="dex-layout">
        <div>
          {list.length === 0 ? (
            <Card>
              {all.length === 0 ? (
                <EmptyState icon="🥚" title="怪獸還沒有來到球場" hint="教練匯入怪獸圖鑑後就會出現在這裡（教練後台 → 怪獸與圖鑑）。" />
              ) : (
                <EmptyState icon="🔍" title="沒有符合條件的怪獸" />
              )}
            </Card>
          ) : (
            <div className="dex-grid">
              {list.map((m) => {
                const st = stateOf(m.id);
                return (
                  <button key={m.id} type="button" className={`dex-cell dex-${st} ${selected === m.id ? 'active' : ''}`} onClick={() => setSelected(m.id)}>
                    <span className="dex-no">No.{String(m.dexNo).padStart(3, '0')}</span>
                    <MonsterSprite monster={m} size={64} silhouette={st !== 'owned'} />
                    <span className="dex-name">{st === 'unknown' ? '？？？' : m.name}</span>
                    {st === 'seen' && <Badge tone="gray">已遇見</Badge>}
                    {st === 'unknown' && <Badge tone="gray">未解鎖</Badge>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Card title="圖鑑資料" icon="🔍" className="dex-detail">
          {!sel ? (
            <p className="muted">點選左側的怪獸查看資料。</p>
          ) : (
            <>
              <MonsterSprite monster={sel} size={128} silhouette={selState !== 'owned'} className={selState === 'owned' ? 'bounce' : ''} />
              <h3>
                No.{String(sel.dexNo).padStart(3, '0')} {selState === 'unknown' ? '？？？' : sel.name}
              </h3>
              {selState === 'owned' && (
                <>
                  <p>
                    <Badge tone="purple">{sel.element}</Badge> <Badge tone="blue">{STAGE_LABELS[sel.stage]}</Badge> <span className="stars">{rarityStars(sel.rarity)}</span>
                  </p>
                  <p>{sel.description}</p>
                  <p className="muted small">{sel.inWild ? `出沒地點：${area(sel.habitat)}` : '只能透過進化取得'}</p>
                  {isCoach && <p className="muted small">捕捉率：{Math.round(sel.catchRate * 100)}%・{sel.inWild ? '野外出沒中' : '不在野外出沒'}</p>}
                </>
              )}
              {selState === 'seen' && <p className="muted">已經遇見過 {sel.name}，但還沒收藏。{sel.inWild ? `出沒地點：${area(sel.habitat)}` : ''}</p>}
              {selState === 'unknown' && <p className="muted">{sel.inWild ? `尚未解鎖。據說會在「${area(sel.habitat)}」出沒…` : '尚未解鎖。據說是某隻怪獸進化後的樣子…'}</p>}
              {chain.length > 1 && (
                <div className="evo-chain">
                  <h4>進化路線</h4>
                  <div className="evo-row">
                    {chain.map((c, i) => {
                      const st = stateOf(c.id);
                      return (
                        <Fragment key={c.id}>
                          {i > 0 && <span className="evo-arrow">→<small>{evolveAffectionOf(chain[i - 1]) > 0 ? `❤${evolveAffectionOf(chain[i - 1])}` : `Lv.${chain[i - 1].evolveLevel}`}</small></span>}
                          <button type="button" className={`evo-step ${c.id === sel.id ? 'active' : ''}`} onClick={() => setSelected(c.id)}>
                            <MonsterSprite monster={c} size={44} silhouette={st !== 'owned'} />
                            <small>{st === 'unknown' ? '？？？' : c.name}</small>
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
