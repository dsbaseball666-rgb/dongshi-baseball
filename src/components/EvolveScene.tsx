import { useEffect, useRef, useState } from 'react';
import type { Monster } from '../types';
import type { EvolveResult } from '../store/actions';
import { MonsterSprite } from './MonsterSprite';

/**
 * 進化動畫：發光 → 新舊剪影快速交替 → 白光 → 新型態登場。
 * 是否能進化由 onEvolve 決定（雲端模式由伺服器檢查），動畫只負責呈現。
 */
type Phase = 'intro' | 'morph' | 'flash' | 'done';

interface Props {
  from: Monster;
  to: Monster;
  nickname: string;
  /** 實際送出進化；失敗回傳 undefined */
  onEvolve: () => Promise<EvolveResult | undefined>;
  onClose: () => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function EvolveScene({ from, to, nickname, onEvolve, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState<EvolveResult | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // 確保每次開啟只送出一次（開發模式下 effect 可能執行兩次）
  const pendingRef = useRef<Promise<EvolveResult | undefined> | null>(null);

  useEffect(() => {
    let alive = true;
    const fast = reducedMotion();
    (async () => {
      if (!pendingRef.current) pendingRef.current = onEvolve();
      const pending = pendingRef.current;
      await wait(fast ? 0 : 1300);
      if (!alive) return;
      setPhase('morph');
      const [res] = await Promise.all([pending, wait(fast ? 0 : 2600)]);
      if (!alive) return;
      if (!res) return onClose(); // 送出失敗：關閉畫面，錯誤訊息由頁面顯示
      setPhase('flash');
      await wait(fast ? 0 : 450);
      if (!alive) return;
      setResult(res);
      setPhase('done');
    })();
    return () => {
      alive = false;
    };
    // 只在開啟時跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'done') closeRef.current?.focus();
  }, [phase]);

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-label={`${nickname} 進化中`}>
      <div className={`capture-stage evolve-stage evo-${phase}`}>
        <div className="evo-rays" aria-hidden />
        <div className="evo-mons" aria-hidden>
          <div className="evo-old">
            <MonsterSprite monster={from} size={144} />
          </div>
          <div className="evo-new">
            <MonsterSprite monster={to} size={144} />
          </div>
        </div>
        {phase === 'flash' && <div className="evo-flash" aria-hidden />}
        {phase === 'done' && (
          <div className="capture-stars" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ ['--a' as string]: `${i * 36}deg` }}>
                ✦
              </span>
            ))}
          </div>
        )}
        <p className="capture-caption" aria-live="polite">
          {phase === 'intro' && `咦？${nickname} 的樣子…！`}
          {phase === 'morph' && `${nickname} 正在進化！`}
          {phase === 'flash' && '✨✨✨'}
          {phase === 'done' && `恭喜！進化成 ${to.name}！`}
        </p>
      </div>

      {phase === 'done' && result && (
        <div className="capture-result is-win">
          <h2>
            🎉 {result.from} 進化成 {result.to}！
          </h2>
          <p className="muted">{to.description}</p>
          <p className="small">已登錄到怪獸圖鑑。等級、經驗值和親密度都會保留。</p>
          <div className="form-actions">
            <button ref={closeRef} type="button" className="btn btn-gold" onClick={onClose}>
              太棒了！
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
