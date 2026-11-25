import { useMemo, useState } from 'react';
import type { FitnessItemKey, Player } from '../types';
import { formatDate } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem } from '../lib/fitness';
import { Card, EmptyState, Field } from '../components/UI';
import { TRACK_LENGTHS } from './groupSession';
import { latestTable, shortValue } from './stats';
import { sheetColumns, sheetHint, sortGrades } from './printSheet';
import type { TeamFitness } from './useTeamFitness';

/** 列印紙本：選項目、球員，印出 A4 空白記錄表帶到球場手寫（每個項目一張） */
export function PrintTab({ players, source }: { players: Player[]; source: TeamFitness }) {
  const [items, setItems] = useState<FitnessItemKey[]>(['pushup']);
  const [date, setDate] = useState('');
  const [grade, setGrade] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [showLast, setShowLast] = useState(true);
  const [extraRows, setExtraRows] = useState(3);
  const [track, setTrack] = useState(0);

  const active = players.filter((p) => p.active);
  const grades = sortGrades(active.map((p) => p.grade));
  const inGrade = active.filter((p) => !grade || p.grade === grade);
  const list = inGrade.filter((p) => !skipped.includes(p.id));
  const table = useMemo(() => latestTable(source.records), [source.records]);
  const toggleItem = (k: FitnessItemKey) => setItems((l) => (l.includes(k) ? l.filter((x) => x !== k) : FITNESS_ITEMS.map((d) => d.key).filter((x) => x === k || l.includes(x))));
  const toggleSkip = (id: string) => setSkipped((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <>
      <div className="no-print">
        <Card title="① 要印哪些項目？（每個項目一張 A4）" icon="📋">
          <div className="gt-chips">
            {FITNESS_ITEMS.map((d) => (
              <button key={d.key} type="button" className={`gt-chip ${items.includes(d.key) ? 'active' : ''}`} aria-pressed={items.includes(d.key)} onClick={() => toggleItem(d.key)}>
                {items.includes(d.key) ? '☑️' : '⬜'} {d.label}
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-sm" onClick={() => setItems(FITNESS_ITEMS.map((d) => d.key))}>
              全部項目
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems([])} disabled={!items.length}>
              全部取消
            </button>
          </div>
          {items.includes('run1500') && (
            <Field label="1500 公尺要不要留圈數格？">
              <div className="gt-chips">
                {TRACK_LENGTHS.map((t) => (
                  <button key={t} type="button" className={`gt-chip ${track === t ? 'active' : ''}`} onClick={() => setTrack(t)}>
                    {t === 0 ? '不用，只寫時間' : `${t} 公尺跑道`}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </Card>

        <Card title={`② 名單（${list.length} 位）`} icon="👥">
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
          <p className="muted small">預設印全部啟用中的球員；點名字可以拿掉不印的人。</p>
          <div className="gt-pick">
            {inGrade.map((p) => (
              <button key={p.id} type="button" className={`gt-pick-btn ${skipped.includes(p.id) ? '' : 'active'}`} aria-pressed={!skipped.includes(p.id)} onClick={() => toggleSkip(p.id)}>
                {skipped.includes(p.id) ? '⬜' : '☑️'} {p.number ? `#${p.number} ` : ''}
                {p.name}
              </button>
            ))}
          </div>
        </Card>

        <Card title="③ 其他設定" icon="⚙️">
          <div className="fs-filters">
            <Field label="檢測日期（空白＝印出來再手寫）">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="最後多留幾列空白（給新同學）">
              <select value={extraRows} onChange={(e) => setExtraRows(Number(e.target.value))}>
                {[0, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} 列
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="fs-check">
            <input type="checkbox" checked={showLast} onChange={(e) => setShowLast(e.target.checked)} /> 印上每位球員「上一次的成績」方便對照
          </label>
        </Card>

        <div className="gt-bottom">
          <button type="button" className="btn btn-primary gt-big" disabled={!items.length || (!list.length && !extraRows)} onClick={() => window.print()}>
            🖨️ 列印（{items.length} 張）
          </button>
          <p className="muted small print-tip">按下去後選印表機；手機可以選「儲存為 PDF」再傳到 LINE。下面是預覽。</p>
        </div>
      </div>

      {!items.length ? (
        <Card className="no-print">
          <EmptyState icon="🖨️" title="請先選要印的項目" />
        </Card>
      ) : (
        <div className="print-area">
          {items.map((key) => {
            const def = getFitnessItem(key);
            const t = key === 'run1500' ? track : 0;
            const cols = sheetColumns(key, t);
            const base = 6 + 16 + (showLast ? 14 : 0);
            const total = base + cols.reduce((s, c) => s + c.width, 0);
            const pct = (w: number) => `${(w / total) * 100}%`;
            const rows: (Player | null)[] = [...list, ...Array.from({ length: extraRows }, () => null)];
            return (
              <section key={key} className="print-sheet">
                <header className="ps-head">
                  <div>
                    <div className="ps-team">東勢國中棒球隊・體能檢測記錄表</div>
                    <h2>
                      {def.label}
                      <small>
                        （{def.group}・{def.kind === 'time' ? '分:秒' : def.unit}）
                      </small>
                    </h2>
                  </div>
                  <div className="ps-meta">
                    <span>日期：{date ? formatDate(date) : '＿＿＿＿年＿＿月＿＿日'}</span>
                    <span>測量者：＿＿＿＿＿＿</span>
                    <span>天氣：＿＿＿＿　{grade || '全部年級'}・{list.length} 人</span>
                  </div>
                </header>
                <p className="ps-hint">{sheetHint(key, t)}</p>
                <table className="ps-table">
                  <colgroup>
                    <col style={{ width: pct(6) }} />
                    <col style={{ width: pct(16) }} />
                    {showLast && <col style={{ width: pct(14) }} />}
                    {cols.map((c, i) => (
                      <col key={i} style={{ width: pct(c.width) }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>背號</th>
                      <th>姓名</th>
                      {showLast && <th>上次成績</th>}
                      {cols.map((c, i) => (
                        <th key={i} className={c.small ? 'ps-small' : ''}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => {
                      const last = p ? table[p.id]?.[key] : undefined;
                      return (
                        <tr key={p?.id ?? `blank-${i}`}>
                          <td>{p?.number ?? ''}</td>
                          <td className="ps-name">{p?.name ?? ''}</td>
                          {showLast && <td className="ps-last">{last ? `${shortValue(key, last.record.value)}（${last.record.date.slice(5).replace('-', '/')}）` : ''}</td>}
                          {cols.map((_, j) => (
                            <td key={j} />
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <footer className="ps-foot">寫完後到「體能檢測系統 → ✍️ 全隊輸入」輸入，或交給教練。</footer>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
