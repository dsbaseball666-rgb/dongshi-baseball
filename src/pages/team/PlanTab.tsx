import { useMemo, useState } from 'react';
import type { PlanSession, Player } from '../../types';
import { useTask } from '../../store/DemoStore';
import { usePlayers } from '../../sources/hooks';
import { byNumber, mondayOf, participantText, PLAN_ITEMS, PLAN_LOCATIONS, PLAN_SLOTS, TIME_OPTIONS, usePlan, type PlanInput } from '../../sources/team';
import { addDays, todayStr } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingCard } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';
import { WeekNav } from './WeekNav';
import { planImage } from './images';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 快速選人的群組（依年級、守備位置） */
const GROUPS: { label: string; test: (p: Player) => boolean }[] = [
  { label: '七年級', test: (p) => p.grade.includes('七') },
  { label: '八年級', test: (p) => p.grade.includes('八') },
  { label: '九年級', test: (p) => p.grade.includes('九') },
  { label: '投手', test: (p) => p.position.includes('投手') },
  { label: '捕手', test: (p) => p.position.includes('捕手') },
  { label: '內野', test: (p) => p.position.includes('內野') },
  { label: '外野', test: (p) => p.position.includes('外野') },
];

const byTime = (a: PlanInput, b: PlanInput) => (a.date + a.startTime < b.date + b.startTime ? -1 : 1);
const dayLabel = (date: string, monday: string) => {
  const i = Math.round((Date.parse(date) - Date.parse(monday)) / 86400000);
  return `週${WEEKDAYS[i] ?? ''} ${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
};
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** 同一天裡被排進兩個時段的球員（全隊也算）；回傳球員編號 */
export function dayDuplicates(list: PlanInput[]): string[] {
  if (list.length > 1 && list.some((s) => s.playerIds.length === 0)) return ['全隊'];
  const seen = new Set<string>();
  const dup = new Set<string>();
  list.forEach((s) => s.playerIds.forEach((id) => (seen.has(id) ? dup.add(id) : seen.add(id))));
  return Array.from(dup);
}

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const options = value && !TIME_OPTIONS.includes(value) ? [value, ...TIME_OPTIONS] : TIME_OPTIONS;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">—</option>
      {options.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

/* ───────── 一天的安排：所有時段在同一個畫面勾選、填好 ───────── */

interface Row {
  key: string;
  on: boolean;
  slot: string;
  startTime: string;
  endTime: string;
  items: string[];
  allTeam: boolean;
  playerIds: string[];
  location: string;
  note: string;
}

let rowSeq = 0;
const blankRow = (slot: string, startTime: string, endTime: string): Row => ({
  key: `r${++rowSeq}`, on: false, slot, startTime, endTime, items: [], allTeam: false, playerIds: [], location: '校內球場', note: '',
});
const fromSession = (s: PlanInput): Row => ({
  key: `r${++rowSeq}`, on: true, slot: s.slot || '自訂', startTime: s.startTime, endTime: s.endTime, items: s.items,
  allTeam: s.playerIds.length === 0, playerIds: s.playerIds, location: s.location, note: s.note,
});

/** 常用時段一定列出來（沒排的先不勾）；這天原本就有的時段直接帶入 */
function initialRows(sessions: PlanInput[]): Row[] {
  const rest = sessions.slice().sort(byTime);
  const rows = PLAN_SLOTS.map((p) => {
    const i = rest.findIndex((s) => s.slot === p.slot);
    return i >= 0 ? fromSession(rest.splice(i, 1)[0]) : blankRow(p.slot, p.startTime, p.endTime);
  });
  return [...rows, ...rest.map(fromSession)].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
}

function RowEditor({ row, players, taken, teamSlot, othersBusy, onChange, onRemove }: {
  row: Row;
  players: Player[];
  /** 已經排在其他時段的球員 → 時段名稱 */
  taken: Map<string, string>;
  /** 其他時段已經排「全隊」時的時段名稱 */
  teamSlot: string | null;
  /** 其他時段已經有人 */
  othersBusy: boolean;
  /** 傳入修改內容，或用目前這列算出修改內容（連續快速點選時不會漏掉） */
  onChange: (patch: Partial<Row> | ((r: Row) => Partial<Row>)) => void;
  onRemove?: () => void;
}) {
  const free = players.filter((p) => !taken.has(p.id));
  const set = onChange;
  const groupState = (g: (typeof GROUPS)[number]) => {
    const ids = free.filter(g.test).map((p) => p.id);
    return { ids, on: ids.length > 0 && ids.every((id) => row.playerIds.includes(id)) };
  };
  return (
    <div className={`day-row ${row.on ? 'on' : ''}`}>
      <div className="day-row-head">
        <label className="check day-row-toggle">
          <input
            type="checkbox"
            checked={row.on}
            onChange={(e) => set({ on: e.target.checked, allTeam: e.target.checked && !row.playerIds.length ? !othersBusy && !teamSlot : row.allTeam })}
          />
          <strong>{row.slot}</strong>
        </label>
        <span className="time-pair">
          <TimeSelect label={`${row.slot} 開始時間`} value={row.startTime} onChange={(v) => set({ startTime: v, on: true })} />
          <span>到</span>
          <TimeSelect label={`${row.slot} 結束時間`} value={row.endTime} onChange={(v) => set({ endTime: v, on: true })} />
        </span>
        {row.on && (
          <span className="small muted">
            {row.allTeam ? '👥 全隊' : `👥 ${row.playerIds.length} 人`}
            {row.items.length > 0 && `・${row.items.join('、')}`}
          </span>
        )}
        {onRemove && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onRemove}>
            移除
          </button>
        )}
      </div>
      {row.on && (
        <div className="day-row-body">
          <div className="field">
            <span className="field-label">訓練內容（可複選）</span>
            <div className="roll-status">
              {PLAN_ITEMS.map((i) => (
                <button key={i} type="button" className={`status-btn ${row.items.includes(i) ? 'on tone-yellow' : ''}`} aria-pressed={row.items.includes(i)} onClick={() => set((r) => ({ items: toggle(r.items, i) }))}>
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">參加人員{!row.allTeam && `（已選 ${row.playerIds.length} 人）`}</span>
            {teamSlot ? (
              <Alert kind="warn">「{teamSlot}」已經排了全隊，這天沒有其他球員可以排。要分組的話，先把「{teamSlot}」改成指定球員。</Alert>
            ) : (
              <>
                <div className="roll-status">
                  <button
                    type="button"
                    className={`status-btn ${row.allTeam ? 'on tone-red' : ''}`}
                    aria-pressed={row.allTeam}
                    disabled={othersBusy}
                    title={othersBusy ? '其他時段已經有球員，不能再選全隊' : undefined}
                    onClick={() => set({ allTeam: true, playerIds: [] })}
                  >
                    👥 全隊
                  </button>
                  <button type="button" className={`status-btn ${!row.allTeam ? 'on tone-red' : ''}`} aria-pressed={!row.allTeam} onClick={() => set({ allTeam: false })}>
                    指定球員
                  </button>
                  {othersBusy && <span className="muted small">其他時段已經有人，不能選全隊</span>}
                </div>
                {!row.allTeam && (
                  <>
                    <div className="roll-status group-row">
                      <span className="muted small">快速選：</span>
                      {GROUPS.map((g) => {
                        const st = groupState(g);
                        if (st.ids.length === 0) return null;
                        return (
                          <button
                            key={g.label}
                            type="button"
                            className={`status-btn ${st.on ? 'on tone-purple' : ''}`}
                            aria-pressed={st.on}
                            onClick={() => set((r) => ({ playerIds: st.on ? r.playerIds.filter((id) => !st.ids.includes(id)) : Array.from(new Set([...r.playerIds, ...st.ids])) }))}
                          >
                            {g.label}（{st.ids.length}）
                          </button>
                        );
                      })}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ playerIds: free.map((p) => p.id) })}>
                        還沒排的全部選
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ playerIds: [] })}>
                        全部取消
                      </button>
                    </div>
                    <div className="player-chips">
                      {players.map((p) => {
                        const other = taken.get(p.id);
                        const on = row.playerIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`status-btn ${on ? 'on tone-blue' : ''} ${other ? 'taken' : ''}`}
                            aria-pressed={on}
                            disabled={!!other}
                            title={other ? `已排在「${other}」` : undefined}
                            onClick={() => set((r) => ({ playerIds: toggle(r.playerIds, p.id) }))}
                          >
                            {p.number && <span className="chip-no">#{p.number}</span>}
                            {p.name}
                            {other && <span className="chip-taken">（{other}）</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="field">
            <span className="field-label">地點</span>
            <div className="roll-status">
              {PLAN_LOCATIONS.map((l) => (
                <button key={l} type="button" className={`status-btn ${row.location === l ? 'on tone-gray' : ''}`} onClick={() => set({ location: l })}>
                  {l}
                </button>
              ))}
              <input className="inline-input" value={row.location} maxLength={40} onChange={(e) => set({ location: e.target.value })} placeholder="或自己輸入" aria-label={`${row.slot} 地點`} />
            </div>
          </div>
          <input value={row.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} placeholder="備註（例如：投手組每人 40 球、請帶捕手裝備）" aria-label={`${row.slot} 備註`} />
        </div>
      )}
    </div>
  );
}

function DayEditor({ date, monday, players, sessions, draft, onSave, onCancel }: {
  date: string;
  monday: string;
  players: Player[];
  sessions: PlanInput[];
  draft: PlanInput[];
  onSave: (list: PlanInput[], copyTo: string[], next: boolean) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(sessions));
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dates = WEEKDAYS.map((_, i) => addDays(monday, i));
  const nextDate = dates[dates.indexOf(date) + 1];
  const patch = (key: string, p: Partial<Row> | ((r: Row) => Partial<Row>)) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)));

  const context = (row: Row) => {
    const taken = new Map<string, string>();
    let teamSlot: string | null = null;
    rows.forEach((o) => {
      if (o.key === row.key || !o.on) return;
      if (o.allTeam) teamSlot = o.slot;
      else o.playerIds.forEach((id) => taken.set(id, o.slot));
    });
    return { taken, teamSlot, othersBusy: taken.size > 0 || teamSlot !== null };
  };

  const submit = (next: boolean) => {
    const on = rows.filter((r) => r.on);
    for (const r of on) {
      if (!r.startTime || !r.endTime) return setError(`「${r.slot}」請選開始和結束時間。`);
      if (r.endTime <= r.startTime) return setError(`「${r.slot}」的結束時間要晚於開始時間。`);
      if (!r.allTeam && r.playerIds.length === 0) return setError(`「${r.slot}」還沒選參加人員。`);
    }
    const list: PlanInput[] = on.map((r) => ({
      date, startTime: r.startTime, endTime: r.endTime, slot: r.slot, items: PLAN_ITEMS.filter((i) => r.items.includes(i)),
      playerIds: r.allTeam ? [] : players.filter((p) => r.playerIds.includes(p.id)).map((p) => p.id), location: r.location.trim(), note: r.note.trim(),
    }));
    if (dayDuplicates(list).length) return setError('同一天有球員被排進兩個時段，請檢查。');
    const overwrite = copyTo.filter((d) => draft.some((s) => s.date === d));
    if (overwrite.length && !window.confirm(`${overwrite.map((d) => dayLabel(d, monday)).join('、')} 原本已經有安排，要換成這一天的內容嗎？`)) return;
    onSave(list, copyTo, next);
  };

  const onCount = rows.filter((r) => r.on).length;
  return (
    <Card title={`安排 ${dayLabel(date, monday)}`} icon="✏️" className="plan-editor">
      <p className="muted small">勾選這天要練的時段，直接在下面填好內容和人員。同一天每位球員只能排在一個時段，已經排過的人會變灰色。</p>
      <div className="day-rows">
        {rows.map((r) => {
          const c = context(r);
          return (
            <RowEditor
              key={r.key}
              row={r}
              players={players}
              taken={c.taken}
              teamSlot={c.teamSlot}
              othersBusy={c.othersBusy}
              onChange={(p) => patch(r.key, p)}
              onRemove={PLAN_SLOTS.some((s) => s.slot === r.slot) ? undefined : () => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          );
        })}
      </div>
      <button type="button" className="btn btn-sm" onClick={() => setRows((rs) => [...rs, { ...blankRow('自訂', '', ''), on: true }])}>
        ＋ 加一個自訂時段（例如同時段分組）
      </button>

      <div className="field copy-to">
        <span className="field-label">也套用到其他天（相同的安排）</span>
        <div className="roll-status">
          {dates
            .filter((d) => d !== date)
            .map((d) => (
              <button key={d} type="button" className={`status-btn ${copyTo.includes(d) ? 'on tone-blue' : ''}`} aria-pressed={copyTo.includes(d)} onClick={() => setCopyTo((x) => toggle(x, d))}>
                {dayLabel(d, monday)}
                {draft.some((s) => s.date === d) && ' •'}
              </button>
            ))}
        </div>
        <span className="muted small">有「•」的日子原本已經有安排，套用後會被換掉。</span>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={() => submit(false)}>
          ✔ 完成這一天（{onCount} 個時段{copyTo.length ? `，另外套用 ${copyTo.length} 天` : ''}）
        </button>
        {nextDate && (
          <button type="button" className="btn" onClick={() => submit(true)}>
            ✔ 完成，接著排 {dayLabel(nextDate, monday)} →
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
      <p className="muted small">完成後會先放在下面的週表，最後記得按「💾 儲存這一週」。</p>
    </Card>
  );
}

/* ───────── 一個時段卡片 ───────── */
function SessionCard({ s, names, highlight }: { s: PlanInput; names: Record<string, string>; highlight?: boolean }) {
  return (
    <div className={`plan-session ${highlight ? 'mine' : ''}`}>
      <div className="plan-time">
        <strong>
          {s.startTime}–{s.endTime}
        </strong>{' '}
        {s.slot && <Badge tone="green">{s.slot}</Badge>}
      </div>
      {s.items.length > 0 && <div className="small">🏋️ {s.items.join('、')}</div>}
      <div className="small">👥 {participantText(s.playerIds, names)}</div>
      {s.location && <div className="small muted">📍 {s.location}</div>}
      {s.note && <div className="small muted">💬 {s.note}</div>}
    </div>
  );
}

const toInput = (s: PlanSession): PlanInput => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, slot: s.slot, items: s.items, playerIds: s.playerIds, location: s.location, note: s.note });

export function PlanTab({ coach, myIds = [] }: { coach: boolean; myIds?: string[] }) {
  const today = todayStr();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const plan = usePlan(addDays(monday, -7), addDays(monday, 6));
  const { players } = usePlayers();
  const active = useMemo(() => players.filter((p) => p.active).sort(byNumber), [players]);
  const task = useTask();
  const [draft, setDraft] = useState<PlanInput[] | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const editing = draft !== null;

  const week = plan.sessions.filter((s) => s.date >= monday).map(toInput);
  const lastWeek = plan.sessions.filter((s) => s.date < monday).map(toInput);
  const shown = (draft ?? week).slice().sort(byTime);
  // 教練編輯時，用目前的球員名單顯示姓名
  const names = useMemo(() => ({ ...plan.names, ...Object.fromEntries(players.map((p) => [p.id, p.name])) }), [plan.names, players]);
  const dates = WEEKDAYS.map((_, i) => addDays(monday, i));

  const openDay = (date: string | null) => {
    setEditDate(date);
    if (date) setTimeout(() => document.querySelector('.plan-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const moveTo = (m: string) => {
    if (editing && !window.confirm('這一週的安排還沒儲存，確定要離開嗎？')) return;
    setDraft(null);
    setEditDate(null);
    setMonday(m);
  };
  const copyLastWeek = () => {
    if (draft && draft.length && !window.confirm('要用上週的安排取代目前這週的內容嗎？')) return;
    setDraft(lastWeek.map((s) => ({ ...s, date: addDays(s.date, 7) })));
  };
  const applyDay = (list: PlanInput[], copyTo: string[], next: boolean) => {
    if (!draft || !editDate) return;
    const days = [editDate, ...copyTo];
    const copies = copyTo.flatMap((d) => list.map((s) => ({ ...s, date: d })));
    setDraft([...draft.filter((s) => !days.includes(s.date)), ...list, ...copies]);
    openDay(next ? dates[dates.indexOf(editDate) + 1] ?? null : null);
  };
  const save = async () => {
    if (!draft) return;
    const r = await task.run(() => plan.saveWeek(monday, draft), '已儲存這一週的練球安排。');
    if (r.ok) {
      setDraft(null);
      setEditDate(null);
    }
  };
  const badDays = dates.filter((d) => dayDuplicates(shown.filter((s) => s.date === d)).length > 0);

  return (
    <>
      <Card>
        <WeekNav monday={monday} onMove={moveTo} />
        {coach && !editing && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setDraft(week)} disabled={plan.loading}>
              ✏️ 安排這一週
            </button>
            <LineImageButton key={monday} make={() => planImage(monday, week, names)} filename={`練球安排-${monday}.png`} title="一週練球安排" disabled={week.length === 0} />
          </div>
        )}
        {editing && (
          <>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => openDay(dates[0])}>
                ✏️ 從週一開始排
              </button>
              <button type="button" className="btn" onClick={copyLastWeek} disabled={lastWeek.length === 0}>
                📄 複製上週（{lastWeek.length} 個時段）
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => draft.length && window.confirm('確定清空這一週的全部時段？') && setDraft([])}>
                清空這週
              </button>
            </div>
            <Alert kind={badDays.length ? 'error' : 'warn'}>
              正在編輯：共 {draft.length} 個時段。點每一天的「安排這天」修改。
              {badDays.length > 0 && ` ${badDays.map((d) => dayLabel(d, monday)).join('、')} 有球員被排進兩個時段，請修正後再儲存。`}
            </Alert>
          </>
        )}
        {!coach && <p className="muted small">這裡只會顯示全隊，以及有{myIds.length > 1 ? '你的孩子（學生）' : '你'}參加的時段。</p>}
      </Card>

      {editing && editDate && (
        <DayEditor
          key={editDate}
          date={editDate}
          monday={monday}
          players={active}
          sessions={draft.filter((s) => s.date === editDate)}
          draft={draft}
          onSave={applyDay}
          onCancel={() => setEditDate(null)}
        />
      )}

      {plan.error && <Alert kind="error">{plan.error}</Alert>}
      {plan.loading ? (
        <LoadingCard text="讀取練球安排…" />
      ) : !editing && week.length === 0 ? (
        <Card>
          <EmptyState icon="🗓️" title="這一週還沒有練球安排" hint={coach ? '按「安排這一週」開始，一天一個畫面排好所有時段，也可以複製上週。' : '教練還沒有排這一週。'} />
        </Card>
      ) : (
        <div className="plan-week">
          {dates.map((date) => {
            const list = shown.filter((s) => s.date === date);
            return (
              <section key={date} className={`plan-day ${date === today ? 'is-today' : ''} ${date === editDate ? 'is-editing' : ''}`}>
                <div className="day-head">
                  <strong>{dayLabel(date, monday)}</strong>
                  {date === today && <Badge tone="red">今天</Badge>}
                </div>
                {list.length === 0 && <div className="muted small">（沒有安排）</div>}
                {list.map((s, i) => (
                  <SessionCard key={`${s.date}-${s.startTime}-${s.slot}-${i}`} s={s} names={names} highlight={!coach && s.playerIds.some((id) => myIds.includes(id))} />
                ))}
                {badDays.includes(date) && <div className="small danger-text">⚠️ 有球員被排進兩個時段</div>}
                {editing && (
                  <button type="button" className="btn btn-sm" onClick={() => openDay(date)}>
                    ✏️ 安排這天
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <Card>
          <ActionFeedback action={task} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={task.pending || badDays.length > 0}>
              💾 儲存這一週（{draft.length} 個時段）
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={task.pending}
              onClick={() => {
                if (window.confirm('放棄這次的修改？')) {
                  setDraft(null);
                  setEditDate(null);
                }
              }}
            >
              放棄修改
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
