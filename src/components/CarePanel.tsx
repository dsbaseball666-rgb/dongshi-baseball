import { useState } from 'react';
import type { Monster, PlayerMonster } from '../types';
import type { CareResult } from '../store/actions';
import type { TaskState } from '../store/DemoStore';
import { affectionTitle, CARE_ACTIONS, careUsed, evolveAffectionOf, MAX_AFFECTION, type CareActionId } from '../lib/monster';
import { Badge, Card, ProgressBar } from './UI';
import { MonsterSprite } from './MonsterSprite';

const LINES: Record<CareActionId, string[]> = {
  pet: ['{n} 開心地蹭了蹭你的手 💕', '{n} 舒服地瞇起眼睛～', '{n} 翻過身來，要你摸摸肚子！', '{n} 發出呼嚕呼嚕的聲音。'],
  feed: ['{n} 大口吃掉點心，滿足地拍拍肚子 😋', '{n} 吃得津津有味，精神都來了！', '{n} 吃完還舔舔嘴巴，好像還想再吃。'],
  play: ['你們一起練傳接球，{n} 接得超準！⚾', '{n} 追著球跑來跑去，玩得好開心！', '{n} 學你做投球動作，有模有樣！'],
};
const FX: Record<CareActionId, string[]> = { pet: ['💗', '💕', '💗'], feed: ['🍙'], play: ['⚾'] };

interface Props {
  pm: PlayerMonster;
  monster: Monster;
  today: string;
  points: number;
  action: TaskState;
  onCare: (kind: CareActionId) => Promise<CareResult | undefined>;
}

/** 與怪獸互動：摸摸牠、餵點心、一起玩球，增加親密度 */
export function CarePanel({ pm, monster, today, points, action, onCare }: Props) {
  const [react, setReact] = useState<{ key: number; kind: CareActionId; line: string; float: string } | null>(null);
  const affection = pm.affection ?? 0;
  const need = evolveAffectionOf(monster);

  const doCare = async (kind: CareActionId) => {
    const res = await onCare(kind);
    if (!res) return;
    const pool = LINES[kind];
    let line = pool[Math.floor(Math.random() * pool.length)].replace('{n}', pm.nickname);
    if (need > 0 && affection < need && res.affection >= need) line = `✨ ${pm.nickname} 好像有什麼變化…可以進化了！`;
    const bits = [res.gained > 0 ? `❤ +${res.gained}` : '❤ 已滿', res.exp ? `EXP +${res.exp}` : '', res.healed ? `HP +${res.healed}` : ''].filter(Boolean);
    setReact({ key: Date.now(), kind, line, float: bits.join('  ') });
  };

  return (
    <Card title={`和 ${pm.nickname} 互動`} icon="💕" className="care-card" actions={<span className="stat-inline">🪙 {points} 點</span>}>
      <div key={react?.key ?? 0} className={`care-room ${react ? `react-${react.kind}` : ''}`}>
        {react && <p className="care-bubble" aria-live="polite">{react.line}</p>}
        <div className="care-mon">
          <MonsterSprite monster={monster} size={120} className={react ? '' : 'bounce'} />
        </div>
        {react && (
          <>
            <div className="care-fx" aria-hidden>
              {FX[react.kind].map((f, i) => (
                <span key={i} style={{ ['--i' as string]: i, ['--x' as string]: (i - 1) * 34 - 12 }}>
                  {f}
                </span>
              ))}
            </div>
            <span className="care-float" aria-hidden>
              {react.float}
            </span>
          </>
        )}
      </div>

      <div className="affection-row">
        <ProgressBar value={affection} max={MAX_AFFECTION} tone="heart" label={`❤ 親密度 ${affection} / ${MAX_AFFECTION}`} />
        <span className="small">
          <Badge tone="red">{affectionTitle(affection)}</Badge>{' '}
          {need > 0 && (affection >= need ? <strong>✨ 親密度已達 {need}，可以進化了！</strong> : <span className="muted">這隻怪獸靠親密度進化：達到 {need} 就能進化（還差 {need - affection}）</span>)}
        </span>
      </div>

      <div className="care-actions">
        {CARE_ACTIONS.map((a) => {
          const left = a.daily - careUsed(pm, today, a.id);
          const poor = a.cost > points;
          return (
            <button key={a.id} type="button" className="btn care-btn" disabled={action.pending || left <= 0 || poor} onClick={() => doCare(a.id)}>
              <strong>
                {a.icon} {a.label}
              </strong>
              <span className="small">{a.hint}</span>
              <span className="care-left">{left <= 0 ? '今天次數用完了' : poor ? `點數不足（需要 ${a.cost} 點）` : `今天還可以 ${left} 次`}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
