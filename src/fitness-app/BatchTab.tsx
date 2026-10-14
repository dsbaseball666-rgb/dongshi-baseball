import { useMemo, useRef, useState } from 'react';
import type { FitnessItemKey, FitnessTest, Player } from '../types';
import { useTask } from '../store/DemoStore';
import { todayStr } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem, parseFitnessInput, valueToInput } from '../lib/fitness';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field } from '../components/UI';
import { diffText, shortValue, sortRecords } from './stats';
import type { TeamFitness } from './useTeamFitness';

interface Row {
  player: Player;
  /** 這一天、這個項目已經有的紀錄（會改成修改這一筆） */
  existing?: FitnessTest;
  /** 這一天之前最近一次的成績（給教練對照） */
  before?: FitnessTest;
}

/** 整隊一次輸入：選日期與項目，整份名單一次填完，按一次「儲存」 */
export function BatchTab({ players, source }: { players: Player[]; source: TeamFitness }) {
  const save = useTask();
  const [date, setDate] = useState(todayStr());
  const [item, setItem] = useState<FitnessItemKey>('pushup');
  const [note, setNote] = useState('');
  // 只記錄教練改過的格子；沒改過的格子顯示當天已有的成績
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const def = getFitnessItem(item);

  const rows = useMemo<Row[]>(() => {
    const sorted = sortRecords(source.records.filter((r) => r.item === item));
    return players
      .filter((p) => p.active)
      .map((player) => {
        const mine = sorted.filter((r) => r.playerId === player.id);
        return { player, existing: mine.filter((r) => r.date === date).pop(), before: mine.filter((r) => r.date < date).pop() };
      });
  }, [players, source.records, item, date]);

  const shownValue = (r: Row) => drafts[r.player.id] ?? (r.existing ? valueToInput(item, r.existing.value) : '');
  const changed = rows.filter((r) => {
    const d = drafts[r.player.id];
    return d !== undefined && d.trim() !== '' && d.trim() !== (r.existing ? valueToInput(item, r.existing.value) : '');
  });
  const doneToday = rows.filter((r) => r.existing).length;

  const reset = () => {
    setDrafts({});
    setErrors({});
    save.clear();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const entries: { playerId: string; value: number; id?: string }[] = [];
    for (const r of changed) {
      try {
        entries.push({ playerId: r.player.id, value: parseFitnessInput(item, drafts[r.player.id]), id: r.existing?.id });
      } catch (err) {
        errs[r.player.id] = err instanceof Error ? err.message : String(err);
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (entries.length === 0) return;
    const fixes = entries.filter((x) => x.id).length;
    if (fixes && !window.confirm(`有 ${fixes} 位球員這一天已經有${def.label}成績，會改成新輸入的數值。確定儲存？`)) return;
    const res = await save.run(() => source.saveBatch({ date, item, note: note.trim(), entries }), `已儲存 ${entries.length} 位球員的${def.label}成績。`);
    if (res.ok) {
      setDrafts({});
      setErrors({});
    }
  };

  return (
    <form className="page" onSubmit={submit}>
      <Card title="檢測設定" icon="📝">
        <div className="fs-filters">
          <Field label="檢測日期">
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => {
                setDate(e.target.value);
                reset();
              }}
              required
            />
          </Field>
          <Field label="檢測項目">
            <select
              value={item}
              onChange={(e) => {
                setItem(e.target.value as FitnessItemKey);
                reset();
              }}
            >
              {FITNESS_ITEMS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.group}・{d.label}（{d.kind === 'time' ? '分:秒' : d.unit}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="備註（全部一起）">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="例如：雨天室內測驗" />
          </Field>
        </div>
        <p className="muted small">
          輸入方式：{def.inputHint}。輸入完按 <kbd>Enter</kbd> 會跳到下一位。空白的格子不會儲存（沒來的球員留白就好）。
        </p>
      </Card>

      <Card title={`${def.label}：全隊輸入`} icon="👥" actions={<Badge tone="blue">這一天已輸入 {doneToday} / {rows.length} 位</Badge>}>
        {rows.length === 0 ? (
          <EmptyState title="沒有啟用中的球員" hint="請先到冒險筆記本的教練後台新增球員。" />
        ) : (
          <div className="table-wrap">
            <table className="fs-batch">
              <thead>
                <tr>
                  <th className="hide-sm">背號</th>
                  <th>姓名</th>
                  <th className="hide-sm">上一次成績</th>
                  <th>這次成績（{def.kind === 'time' ? '分:秒' : def.unit}）</th>
                  <th>和上一次比</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const v = shownValue(r);
                  let preview: string | null = null;
                  if (r.before && v.trim()) {
                    try {
                      preview = diffText(item, r.before.value, parseFitnessInput(item, v));
                    } catch {
                      preview = null;
                    }
                  }
                  const err = errors[r.player.id];
                  const isChanged = changed.includes(r);
                  return (
                    <tr key={r.player.id} className={isChanged ? 'fs-changed' : ''}>
                      <td className="hide-sm">{r.player.number ? `#${r.player.number}` : ''}</td>
                      <td className="nowrap">
                        <strong>{r.player.name}</strong>
                      </td>
                      <td className="nowrap muted hide-sm">{r.before ? `${shortValue(item, r.before.value)}（${r.before.date.slice(5).replace('-', '/')}）` : '—'}</td>
                      <td>
                        <input
                          ref={(el) => (inputs.current[i] = el)}
                          className={`fs-input ${err ? 'fs-input-error' : ''}`}
                          value={v}
                          inputMode="decimal"
                          aria-label={`${r.player.name}的${def.label}成績`}
                          placeholder={def.kind === 'time' ? (def.min >= 60 ? '6:45' : '22.5') : ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.player.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              inputs.current[i + 1]?.focus();
                            }
                          }}
                        />
                        {r.existing && !isChanged && <Badge tone="green">已輸入</Badge>}
                        {r.existing && isChanged && <Badge tone="yellow">修改</Badge>}
                        {err && <div className="fs-error">{err}</div>}
                      </td>
                      <td className="nowrap">{preview ?? <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {Object.keys(errors).length > 0 && <Alert kind="error">有 {Object.keys(errors).length} 位球員的數值不正確（紅框），請修改後再儲存。都沒有儲存。</Alert>}
        <ActionFeedback action={save} />
        <div className="form-actions fs-save-bar">
          <button type="submit" className="btn btn-primary" disabled={save.pending || changed.length === 0}>
            💾 儲存 {changed.length} 位球員的成績
          </button>
          {changed.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={save.pending}>
              全部清除重填
            </button>
          )}
        </div>
      </Card>
    </form>
  );
}
