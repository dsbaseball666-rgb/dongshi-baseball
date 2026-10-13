import { useEffect, useRef, useState } from 'react';
import type { Monster } from '../types';
import type { CaptureResult } from '../store/actions';
import { MonsterSprite } from './MonsterSprite';

/**
 * 捕捉動畫：丟球 → 怪獸被吸進球裡 → 球搖晃 → 成功（星星）或掙脫。
 * 捕捉結果由 onThrow 取得（雲端模式由伺服器決定），動畫只負責呈現，不影響機率。
 */
type Phase = 'throw' | 'absorb' | 'shake' | 'caught' | 'escaped';

interface Props {
  monster: Monster;
  areaId: string;
  ballsLeft: number;
  /** 實際送出捕捉；失敗（例如網路錯誤）回傳 undefined */
  onThrow: () => Promise<CaptureResult | undefined>;
  onRetry: () => void;
  onClose: () => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const WOBBLE_MS = 750;

export function CaptureScene({ monster, areaId, ballsLeft, onThrow, onRetry, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('throw');
  const [wobbles, setWobbles] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // 確保每次開啟只送出一次捕捉（開發模式下 effect 可能執行兩次）
  const pendingRef = useRef<Promise<CaptureResult | undefined> | null>(null);

  useEffect(() => {
    let alive = true;
    const fast = reducedMotion();
    (async () => {
      if (!pendingRef.current) pendingRef.current = onThrow();
      const pending = pendingRef.current;
      await wait(fast ? 0 : 650);
      if (!alive) return;
      setPhase('absorb');
      await wait(fast ? 0 : 500);
      if (!alive) return;
      setPhase('shake');
      const [res] = await Promise.all([pending, wait(fast ? 0 : WOBBLE_MS)]);
      if (!alive) return;
      if (!res) return onClose(); // 送出失敗：關閉畫面，錯誤訊息由頁面顯示
      // 成功搖 3 下；掙脫則在第 1～3 下時破球而出
      const total = res.success ? 3 : 1 + Math.floor(Math.random() * 3);
      for (let i = 1; i < total; i++) {
        setWobbles(i);
        await wait(fast ? 0 : WOBBLE_MS);
        if (!alive) return;
      }
      setResult(res);
      setPhase(res.success ? 'caught' : 'escaped');
    })();
    return () => {
      alive = false;
    };
    // 只在開啟時跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = phase === 'caught' || phase === 'escaped';
  useEffect(() => {
    if (done) closeRef.current?.focus();
  }, [done]);

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-label={`捕捉 ${monster.name}`}>
      <div className={`capture-stage capture-${areaId} phase-${phase}`}>
        <div className="capture-grass" aria-hidden />
        <div className="capture-monster" aria-hidden>
          <MonsterSprite monster={monster} size={128} />
        </div>
        <div className="capture-ball-wrap" aria-hidden>
          <div key={phase === 'shake' ? `w${wobbles}` : phase} className="capture-ball">
            <span className="seam seam-l" />
            <span className="seam seam-r" />
          </div>
        </div>
        {phase === 'caught' && (
          <div className="capture-stars" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ ['--a' as string]: `${i * 45}deg` }}>
                ✦
              </span>
            ))}
          </div>
        )}
        {phase === 'escaped' && <div className="capture-burst" aria-hidden>💥</div>}
        <p className="capture-caption" aria-live="polite">
          {phase === 'throw' && '去吧！捕捉球！'}
          {phase === 'absorb' && '收進去了…'}
          {phase === 'shake' && ['搖晃中…', '再一下…', '快抓到了…'][Math.min(wobbles, 2)]}
          {phase === 'caught' && '咔嚓！捕捉成功！'}
          {phase === 'escaped' && `${monster.name} 掙脫了！`}
        </p>
      </div>

      {done && result && (
        <div className={`capture-result ${result.success ? 'is-win' : 'is-lose'}`}>
          {result.success ? (
            <>
              <MonsterSprite monster={monster} size={96} className="bounce" />
              <h2>🎉 抓到 {result.monsterName} 了！</h2>
              <p>{result.duplicate ? '你已經有這隻怪獸，轉換為 15 點 🪙' : '已加入你的收藏圖鑑 📖'}</p>
            </>
          ) : (
            <>
              <h2>可惜！差一點點</h2>
              <p>{monster.name} 還在附近，可以再丟一次。剩下捕捉球 ×{ballsLeft}</p>
            </>
          )}
          <div className="form-actions">
            {!result.success && ballsLeft > 0 && (
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                ⚾ 再丟一次
              </button>
            )}
            <button ref={closeRef} type="button" className={result.success ? 'btn btn-gold' : 'btn btn-ghost'} onClick={onClose}>
              {result.success ? '太棒了！' : '先停一下'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
