import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FitnessItemKey, Player } from '../types';
import { useTask } from '../store/DemoStore';
import { todayStr } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem, parseFitnessInput } from '../lib/fitness';
import { ActionFeedback, Alert, Card, EmptyState, Field } from '../components/UI';
import { sortRecords } from './stats';
import {
  clearPlayer,
  clock,
  elapsed,
  finishOrder,
  isFinished,
  isTimed,
  loadSession,
  newSession,
  nextHeat,
  saveSession,
  tap,
  tapsNeeded,
  TRACK_LENGTHS,
  undoTap,
  type GroupSession,
} from './groupSession';
import type { TeamFitness } from './useTeamFitness';

const ITEM_ICONS: Record<FitnessItemKey, string> = { pushup: '💪', situp: '🧘', jump: '🦘', run1500: '🏃', run150: '⚡', grip: '✊', swing: '🏏', pitch: '⚾' };
const playerLabel = (p: Player | undefined) => (p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : '（已刪除）');

/** 團體檢測：選一組球員一起測；1500／150 公尺用碼表按終點 */
export function GroupTab({ players, source }: { players: Player[]; source: TeamFitness }) {
  const [session, setSessionState] = useState<GroupSession | null>(() => loadSession());
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const update = useCallback((fn: (s: GroupSession) => GroupSession | null) => {
    setSessionState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveSession(next);
      return next;
    });
  }, []);
  const start = (s: GroupSession) => {
    saveSession(s);
    setSessionState(s);
    setSavedMsg(null);
  };
  const quit = (msg: string | null) => {
    saveSession(null);
    setSessionState(null);
    setSavedMsg(msg);
  };
  if (!session) return <Setup players={players} onStart={start} savedMsg={savedMsg} />;
  return <Run players={players} source={source} session={session} update={update} onQuit={quit} />;
}

function Setup({ players, onStart, savedMsg }: { players: Player[]; onStart: (s: GroupSession) => void; savedMsg: string | null }) {
  const [date, setDate] = useState(todayStr());
  const [item, setItem] = useState<FitnessItemKey>('run1500');
  const [track, setTrack] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [grade, setGrade] = useState('');
  const active = players.filter((p) => p.active);
  const grades = Array.from(new Set(active.map((p) => p.grade).filter(Boolean))).sort();
  const shown = active.filter((p) => !grade || p.grade === grade);
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const def = getFitnessItem(item);

  return (
    <>
      {savedMsg && <Alert kind="success">{savedMsg}</Alert>}
      <Card title="① 選檢測項目" icon="📋">
        <div className="gt-items">
          {FITNESS_ITEMS.map((d) => (
            <button key={d.key} type="button" className={`gt-item ${item === d.key ? 'active' : ''}`} onClick={() => setItem(d.key)}>
              <span aria-hidden>{ITEM_ICONS[d.key]}</span>
              {d.label}
              {d.kind === 'time' && <small>⏱️ 碼表</small>}
            </button>
          ))}
        </div>
        <Field label="檢測日期">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {item === 'run1500' && (
          <Field label="要不要記圈數？" hint="記圈：每次跑過終點線就按一下他的名字，系統會告訴你誰還剩幾圈，最後一圈的時間就是成績。">
            <div className="gt-chips">
              {TRACK_LENGTHS.map((t) => (
                <button key={t} type="button" className={`gt-chip ${track === t ? 'active' : ''}`} onClick={() => setTrack(t)}>
                  {t === 0 ? '只按終點' : `${t} 公尺跑道（按 ${Math.ceil(1500 / t)} 下）`}
                </button>
              ))}
            </div>
          </Field>
        )}
      </Card>

      <Card title={`② 選這一組的球員（已選 ${picked.length} 位）`} icon="👥">
        {grades.length > 1 && (
          <div className="gt-chips">
            <button type="button" className={`gt-chip ${grade === '' ? 'active' : ''}`} onClick={() => setGrade('')}>
              全部年級
            </button>
            {grades.map((g) => (
              <button key={g} type="button" className={`gt-chip ${grade === g ? 'active' : ''}`} onClick={() => setGrade(g)}>
                {g}
              </button>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-sm" onClick={() => setPicked((l) => Array.from(new Set([...l, ...shown.map((p) => p.id)])))}>
            ✅ 全選{grade ? `（${grade}）` : ''}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked([])} disabled={picked.length === 0}>
            全部取消
          </button>
        </div>
        {shown.length === 0 ? (
          <EmptyState title="沒有啟用中的球員" />
        ) : (
          <div className="gt-pick">
            {shown.map((p) => (
              <button key={p.id} type="button" className={`gt-pick-btn ${picked.includes(p.id) ? 'active' : ''}`} aria-pressed={picked.includes(p.id)} onClick={() => toggle(p.id)}>
                {picked.includes(p.id) ? '☑️' : '⬜'} {playerLabel(p)}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="gt-bottom">
        <button
          type="button"
          className="btn btn-primary gt-big"
          disabled={picked.length === 0 || !date}
          onClick={() => onStart(newSession(date, item, active.filter((p) => picked.includes(p.id)).map((p) => p.id), track))}
        >
          ③ 開始檢測：{def.label}（{picked.length} 人）
        </button>
      </div>
    </>
  );
}

/** 碼表跑的時候讓手機螢幕不要自動變暗、鎖定 */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    request();
    const again = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', again);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', again);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}

function Run({ players, source, session, update, onQuit }: { players: Player[]; source: TeamFitness; session: GroupSession; update: (fn: (s: GroupSession) => GroupSession | null) => void; onQuit: (msg: string | null) => void }) {
  const save = useTask();
  const [now, setNow] = useState(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const def = getFitnessItem(session.item);
  const timed = isTimed(session.item);
  const running = timed && session.startedAt !== null;
  const need = tapsNeeded(session);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const group = session.playerIds.filter((id) => byId.has(id));
  const done = group.filter((id) => isFinished(session, id));
  const order = finishOrder(session);
  const raf = useRef(0);

  useWakeLock(running);
  // 這一組的人全部跑完，碼表自動停
  const allDone = done.length === group.length;
  useEffect(() => {
    if (running && allDone) update((s) => ({ ...s, startedAt: null }));
  }, [running, allDone, update]);
  useEffect(() => {
    if (!running) return;
    const loop = () => {
      setNow(Date.now());
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);

  // 同一天、同一項目已經有紀錄的球員：儲存時改成修改那一筆
  const existing = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of sortRecords(source.records)) if (r.item === session.item && r.date === session.date) out[r.playerId] = r.id;
    return out;
  }, [source.records, session.item, session.date]);

  const setValue = (pid: string, v: string) => update((s) => (v.trim() === '' ? clearPlayer(s, pid) : { ...s, values: { ...s.values, [pid]: v } }));

  const submit = async () => {
    const errs: Record<string, string> = {};
    const entries: { playerId: string; value: number; id?: string }[] = [];
    for (const pid of done) {
      try {
        entries.push({ playerId: pid, value: parseFitnessInput(session.item, session.values[pid]), id: existing[pid] });
      } catch (e) {
        errs[pid] = e instanceof Error ? e.message : String(e);
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length || entries.length === 0) return;
    const left = group.length - entries.length;
    const fixes = entries.filter((e) => e.id).length;
    const msg = [`儲存 ${entries.length} 位球員的${def.label}成績？`, left ? `（還有 ${left} 位沒有成績，不會儲存）` : '', fixes ? `其中 ${fixes} 位這一天已經有成績，會改成這次的。` : ''].filter(Boolean).join('\n');
    if (!window.confirm(msg)) return;
    const res = await save.run(() => source.saveBatch({ date: session.date, item: session.item, note: '團體檢測', entries }));
    if (res.ok) onQuit(`已儲存 ${entries.length} 位球員的${def.label}成績（${session.date}）。`);
  };

  return (
    <>
      <Card>
        <div className="gt-head">
          <div>
            <strong>
              {ITEM_ICONS[session.item]} {def.label}
            </strong>
            <span className="muted small">
              {session.date}・{group.length} 人・已完成 {done.length}
              {timed && need > 1 ? `・每人按 ${need} 下` : ''}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              if (done.length === 0 || window.confirm('放棄這次團體檢測？還沒儲存的成績會清除。')) onQuit(null);
            }}
          >
            ✕ 放棄
          </button>
        </div>
      </Card>

      {timed ? (
        <>
          <div className={`gt-watch ${running ? 'running' : ''}`}>
            <div className="gt-heat">第 {session.heat} 組</div>
            <div className="gt-clock" aria-live="off">
              {clock(elapsed(session, running ? now : 0))}
            </div>
            {!running ? (
              <button type="button" className="btn btn-primary gt-big" disabled={done.length === group.length} onClick={() => update((s) => ({ ...s, startedAt: Date.now() }))}>
                ▶ 起跑（開始計時）
              </button>
            ) : (
              <div className="gt-watch-actions">
                <button type="button" className="btn" disabled={session.tapLog.length === 0} onClick={() => update(undoTap)}>
                  ↩️ 撤銷上一下
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    const left = group.filter((id) => !isFinished(session, id)).length;
                    if (!left || window.confirm(`還有 ${left} 位沒跑完，確定結束這一組？（沒跑完的可以排下一組）`)) update(nextHeat);
                  }}
                >
                  ⏹ 結束這一組
                </button>
              </div>
            )}
          </div>
          <p className="muted small gt-tip">{running ? (need > 1 ? '球員每次經過終點線，就按一下他的名字。' : '球員到終點，就按他的名字。') : '全部準備好後按「起跑」；同一組一起跑。按錯人可以按「撤銷上一下」。'}</p>
          <div className="gt-runners">
            {group.map((id) => {
              const p = byId.get(id);
              const taps = session.taps[id] ?? [];
              const fin = isFinished(session, id);
              const place = order.indexOf(id) + 1;
              const last = taps[taps.length - 1];
              return (
                <button
                  key={id}
                  type="button"
                  className={`gt-runner ${fin ? 'done' : ''} ${taps.length && !fin ? 'lapping' : ''}`}
                  disabled={!running || fin}
                  onClick={() => update((s) => tap(s, id, Date.now()))}
                >
                  <span className="gt-runner-name">{playerLabel(p)}</span>
                  {fin ? (
                    <span className="gt-runner-time">
                      ✅ {session.values[id]}
                      {place > 0 && <small>第 {place} 名</small>}
                    </span>
                  ) : need > 1 ? (
                    <span className="gt-runner-lap">
                      {taps.length === 0 ? `0 / ${need}` : `${taps.length} / ${need}・${clock(last)}`}
                      {taps.length > 1 && <small>這圈 {(last - taps[taps.length - 2]).toFixed(1)} 秒</small>}
                    </span>
                  ) : (
                    <span className="gt-runner-lap">{running ? '到終點按我' : '等待起跑'}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="gt-counts">
          {group.map((id) => {
            const v = session.values[id] ?? '';
            const n = Number(v);
            const step = (d: number) => setValue(id, String(Math.max(0, (Number.isFinite(n) && v !== '' ? n : 0) + d)));
            return (
              <div key={id} className={`gt-count ${v ? 'done' : ''}`}>
                <span className="gt-runner-name">{playerLabel(byId.get(id))}</span>
                <div className="gt-count-row">
                  {def.kind === 'count' && (
                    <button type="button" className="btn gt-step" onClick={() => step(-1)} aria-label="減 1">
                      −
                    </button>
                  )}
                  <input className="gt-count-input" value={v} inputMode="decimal" placeholder={def.unit} aria-label={`${byId.get(id)?.name}的${def.label}`} onChange={(e) => setValue(id, e.target.value)} />
                  {def.kind === 'count' && (
                    <button type="button" className="btn gt-step" onClick={() => step(1)} aria-label="加 1">
                      ＋
                    </button>
                  )}
                </div>
                {errors[id] && <div className="fs-error">{errors[id]}</div>}
              </div>
            );
          })}
        </div>
      )}

      {timed && done.length > 0 && (
        <Card title="成績（可以手動修正）" icon="📝">
          <ul className="gt-results">
            {[...order, ...done.filter((id) => !order.includes(id))].map((id, i) => (
              <li key={id}>
                <span className="gt-place">{i + 1}</span>
                <span className="gt-runner-name">{playerLabel(byId.get(id))}</span>
                <input className={`fs-input ${errors[id] ? 'fs-input-error' : ''}`} value={session.values[id] ?? ''} inputMode="decimal" onChange={(e) => setValue(id, e.target.value)} aria-label={`${byId.get(id)?.name}的成績`} />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm(`清除 ${byId.get(id)?.name} 的成績，讓他重測？`) && update((s) => clearPlayer(s, id))}>
                  重測
                </button>
                {errors[id] && <div className="fs-error">{errors[id]}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {Object.keys(errors).length > 0 && <Alert kind="error">有 {Object.keys(errors).length} 位球員的成績不合理（紅框），請修正後再儲存。都沒有儲存。</Alert>}
      <ActionFeedback action={save} />
      <div className="gt-bottom">
        <button type="button" className="btn btn-primary gt-big" disabled={save.pending || done.length === 0 || running} onClick={submit}>
          {running ? '⏱️ 計時中…結束這一組後才能儲存' : `💾 儲存 ${done.length} 位球員的成績`}
        </button>
      </div>
    </>
  );
}
