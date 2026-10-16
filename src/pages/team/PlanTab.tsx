import { useMemo, useState } from 'react';
import type { PlanSession, Player } from '../../types';
import { useTask } from '../../store/DemoStore';
import { usePlayers } from '../../sources/hooks';
import { mondayOf, participantText, PLAN_ITEMS, PLAN_LOCATIONS, PLAN_SLOTS, shortDate, TIME_OPTIONS, usePlan, type PlanInput } from '../../sources/team';
import { addDays, todayStr } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';
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
const byNumber = (a: Player, b: Player) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name, 'zh-TW');

/** 同一天、時間重疊、而且有相同球員的時段 */
function conflictsOf(s: PlanInput, all: PlanInput[]): PlanInput[] {
  return all.filter(
    (o) =>
      o !== s &&
      o.date === s.date &&
      o.startTime < s.endTime &&
      s.startTime < o.endTime &&
      (o.playerIds.length === 0 || s.playerIds.length === 0 || o.playerIds.some((id) => s.playerIds.includes(id))),
  );
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

/* ───────── 新增／修改一個時段 ───────── */
function SessionEditor({ monday, players, initial, onSave, onCancel }: { monday: string; players: Player[]; initial: PlanInput | null; onSave: (list: PlanInput[]) => void; onCancel: () => void }) {
  const [days, setDays] = useState<string[]>(initial ? [initial.date] : []);
  const [slot, setSlot] = useState(initial?.slot ?? '下午');
  const [startTime, setStart] = useState(initial?.startTime ?? '16:00');
  const [endTime, setEnd] = useState(initial?.endTime ?? '18:00');
  const [items, setItems] = useState<string[]>(initial?.items ?? []);
  const [allTeam, setAllTeam] = useState(initial ? initial.playerIds.length === 0 : true);
  const [picked, setPicked] = useState<string[]>(initial?.playerIds ?? []);
  const [location, setLocation] = useState(initial?.location ?? '校內球場');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const dates = WEEKDAYS.map((_, i) => addDays(monday, i));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const groupState = (g: (typeof GROUPS)[number]) => {
    const ids = players.filter(g.test).map((p) => p.id);
    return { ids, on: ids.length > 0 && ids.every((id) => picked.includes(id)) };
  };

  const submit = () => {
    if (days.length === 0) return setError('請至少選一天。');
    if (!startTime || !endTime) return setError('請選開始和結束時間。');
    if (endTime <= startTime) return setError('結束時間要晚於開始時間。');
    if (!allTeam && picked.length === 0) return setError('請選參加人員，或點「全隊」。');
    const base = { startTime, endTime, slot, items: PLAN_ITEMS.filter((i) => items.includes(i)), playerIds: allTeam ? [] : players.filter((p) => picked.includes(p.id)).map((p) => p.id), location: location.trim(), note: note.trim() };
    onSave(days.sort().map((date) => ({ ...base, date })));
  };

  return (
    <Card title={initial ? `修改時段：${shortDate(initial.date)}` : '新增時段'} icon="✏️" className="plan-editor">
      <div className="form">
        {!initial && (
          <div className="field">
            <span className="field-label">哪幾天（可以選很多天，會一次排好）</span>
            <div className="roll-status">
              {dates.map((d, i) => (
                <button key={d} type="button" className={`status-btn ${days.includes(d) ? 'on tone-blue' : ''}`} aria-pressed={days.includes(d)} onClick={() => setDays((x) => toggle(x, d))}>
                  週{WEEKDAYS[i]} {Number(d.slice(5, 7))}/{Number(d.slice(8))}
                </button>
              ))}
            </div>
            <div className="check-tools">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDays(dates.slice(0, 5))}>
                週一～五
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDays(dates.slice(5))}>
                週末
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDays(dates)}>
                整週
              </button>
            </div>
          </div>
        )}

        <div className="field">
          <span className="field-label">時段</span>
          <div className="roll-status">
            {PLAN_SLOTS.map((s) => (
              <button
                key={s.slot}
                type="button"
                className={`status-btn ${slot === s.slot ? 'on tone-green' : ''}`}
                aria-pressed={slot === s.slot}
                onClick={() => {
                  setSlot(s.slot);
                  setStart(s.startTime);
                  setEnd(s.endTime);
                }}
              >
                {s.slot} {s.startTime}–{s.endTime}
              </button>
            ))}
            <button type="button" className={`status-btn ${!PLAN_SLOTS.some((s) => s.slot === slot) ? 'on tone-green' : ''}`} onClick={() => setSlot('自訂')}>
              自訂
            </button>
          </div>
          <div className="time-pair">
            <TimeSelect label="開始時間" value={startTime} onChange={setStart} />
            <span>到</span>
            <TimeSelect label="結束時間" value={endTime} onChange={setEnd} />
          </div>
        </div>

        <div className="field">
          <span className="field-label">訓練內容（可複選）</span>
          <div className="roll-status">
            {PLAN_ITEMS.map((i) => (
              <button key={i} type="button" className={`status-btn ${items.includes(i) ? 'on tone-yellow' : ''}`} aria-pressed={items.includes(i)} onClick={() => setItems((x) => toggle(x, i))}>
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">參加人員{!allTeam && `（已選 ${picked.length} 人）`}</span>
          <div className="roll-status">
            <button type="button" className={`status-btn ${allTeam ? 'on tone-red' : ''}`} aria-pressed={allTeam} onClick={() => setAllTeam(true)}>
              👥 全隊
            </button>
            <button type="button" className={`status-btn ${!allTeam ? 'on tone-red' : ''}`} aria-pressed={!allTeam} onClick={() => setAllTeam(false)}>
              指定球員
            </button>
          </div>
          {!allTeam && (
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
                      onClick={() => setPicked((x) => (st.on ? x.filter((id) => !st.ids.includes(id)) : Array.from(new Set([...x, ...st.ids]))))}
                    >
                      {g.label}（{st.ids.length}）
                    </button>
                  );
                })}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked([])}>
                  全部取消
                </button>
              </div>
              <div className="player-chips">
                {players.map((p) => (
                  <button key={p.id} type="button" className={`status-btn ${picked.includes(p.id) ? 'on tone-blue' : ''}`} aria-pressed={picked.includes(p.id)} onClick={() => setPicked((x) => toggle(x, p.id))}>
                    {p.number && <span className="chip-no">#{p.number}</span>}
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="field">
          <span className="field-label">地點</span>
          <div className="roll-status">
            {PLAN_LOCATIONS.map((l) => (
              <button key={l} type="button" className={`status-btn ${location === l ? 'on tone-gray' : ''}`} onClick={() => setLocation(l)}>
                {l}
              </button>
            ))}
          </div>
          <input value={location} maxLength={40} onChange={(e) => setLocation(e.target.value)} placeholder="也可以自己輸入" aria-label="地點" />
        </div>
        <Field label="備註">
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例如：投手組每人 40 球、請帶捕手裝備" />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={submit}>
            {initial ? '✔ 修改這個時段' : `✔ 加入${days.length > 1 ? ` ${days.length} 天` : ''}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        </div>
        <p className="muted small">加入後會先放在下面的週表，最後記得按「💾 儲存這一週」。</p>
      </div>
    </Card>
  );
}

/* ───────── 一個時段卡片 ───────── */
function SessionCard({ s, all, names, onEdit, onRemove, highlight }: { s: PlanInput; all: PlanInput[]; names: Record<string, string>; onEdit?: () => void; onRemove?: () => void; highlight?: boolean }) {
  const conflicts = conflictsOf(s, all);
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
      {conflicts.length > 0 && onEdit && <div className="small warn-text">⚠️ 和 {conflicts.map((c) => `${c.startTime} ${c.slot}`).join('、')} 時間重疊，有相同的球員</div>}
      {(onEdit || onRemove) && (
        <div className="plan-actions">
          {onEdit && (
            <button type="button" className="btn btn-sm" onClick={onEdit}>
              修改
            </button>
          )}
          {onRemove && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onRemove}>
              刪除
            </button>
          )}
        </div>
      )}
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
  const [editor, setEditor] = useState<{ index: number | null } | null>(null);
  const editing = draft !== null;
  // 打開編輯框時捲到編輯框（修改下面的時段時才看得到）
  const openEditor = (e: { index: number | null }) => {
    setEditor(e);
    setTimeout(() => document.querySelector('.plan-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const week = plan.sessions.filter((s) => s.date >= monday).map(toInput);
  const lastWeek = plan.sessions.filter((s) => s.date < monday).map(toInput);
  const shown = (draft ?? week).slice().sort(byTime);
  // 教練編輯時，用目前的球員名單顯示姓名
  const names = useMemo(() => ({ ...plan.names, ...Object.fromEntries(players.map((p) => [p.id, p.name])) }), [plan.names, players]);
  const dates = WEEKDAYS.map((_, i) => addDays(monday, i));

  const moveTo = (m: string) => {
    if (editing && !window.confirm('這一週的安排還沒儲存，確定要離開嗎？')) return;
    setDraft(null);
    setEditor(null);
    setMonday(m);
  };
  const startEdit = () => setDraft(week);
  const copyLastWeek = () => {
    if (draft && draft.length && !window.confirm('要用上週的安排取代目前這週的內容嗎？')) return;
    setDraft(lastWeek.map((s) => ({ ...s, date: addDays(s.date, 7) })));
  };
  const applyEditor = (list: PlanInput[]) => {
    if (!draft || !editor) return;
    setDraft(editor.index === null ? [...draft, ...list] : draft.map((s, i) => (i === editor.index ? list[0] : s)));
    setEditor(null);
  };
  const save = async () => {
    if (!draft) return;
    const r = await task.run(() => plan.saveWeek(monday, draft), '已儲存這一週的練球安排。');
    if (r.ok) setDraft(null);
  };
  const conflictCount = shown.filter((s) => conflictsOf(s, shown).length > 0).length;

  return (
    <>
      <Card>
        <div className="row-between">
          <div className="tabs">
            <button type="button" className="btn btn-sm" onClick={() => moveTo(addDays(monday, -7))}>
              ← 上一週
            </button>
            <button type="button" className="btn btn-sm" onClick={() => moveTo(mondayOf(today))} disabled={monday === mondayOf(today)}>
              本週
            </button>
            <button type="button" className="btn btn-sm" onClick={() => moveTo(addDays(monday, 7))}>
              下一週 →
            </button>
          </div>
          <strong>
            {shortDate(monday)}～{shortDate(addDays(monday, 6))}
          </strong>
        </div>
        {coach && !editing && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={startEdit} disabled={plan.loading}>
              ✏️ 安排這一週
            </button>
            <LineImageButton key={monday} make={() => planImage(monday, week, names)} filename={`練球安排-${monday}.png`} title="一週練球安排" disabled={week.length === 0} />
          </div>
        )}
        {editing && (
          <>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => openEditor({ index: null })}>
                ＋ 新增時段
              </button>
              <button type="button" className="btn" onClick={copyLastWeek} disabled={lastWeek.length === 0}>
                📄 複製上週（{lastWeek.length} 個時段）
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => draft.length && window.confirm('確定清空這一週的全部時段？') && setDraft([])}>
                清空這週
              </button>
            </div>
            <Alert kind="warn">
              正在編輯：共 {draft.length} 個時段{conflictCount > 0 && `，其中 ${conflictCount} 個時間重疊`}。改完記得按下面的「💾 儲存這一週」。
            </Alert>
          </>
        )}
        {!coach && <p className="muted small">這裡只會顯示全隊，以及有{myIds.length > 1 ? '你的孩子（學生）' : '你'}參加的時段。</p>}
      </Card>

      {editing && editor && (
        <SessionEditor
          key={`${editor.index ?? 'new'}-${monday}`}
          monday={monday}
          players={active}
          initial={editor.index === null ? null : draft[editor.index]}
          onSave={applyEditor}
          onCancel={() => setEditor(null)}
        />
      )}

      {plan.error && <Alert kind="error">{plan.error}</Alert>}
      {plan.loading ? (
        <Card>
          <LoadingState text="讀取練球安排…" />
        </Card>
      ) : !editing && week.length === 0 ? (
        <Card>
          <EmptyState icon="🗓️" title="這一週還沒有練球安排" hint={coach ? '按「安排這一週」開始，可以一次選好幾天，也可以複製上週。' : '教練還沒有排這一週。'} />
        </Card>
      ) : (
        <div className="plan-week">
          {dates.map((date, i) => {
            const list = shown.filter((s) => s.date === date);
            return (
              <section key={date} className={`plan-day ${date === today ? 'is-today' : ''}`}>
                <div className="day-head">
                  <strong>
                    週{WEEKDAYS[i]} {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                  </strong>
                  {date === today && <Badge tone="red">今天</Badge>}
                </div>
                {list.length === 0 && <div className="muted small">（沒有安排）</div>}
                {list.map((s) => {
                  const idx = draft ? draft.indexOf(s) : -1;
                  return (
                    <SessionCard
                      key={`${s.date}-${s.startTime}-${idx}-${s.slot}`}
                      s={s}
                      all={shown}
                      names={names}
                      highlight={!coach && s.playerIds.some((id) => myIds.includes(id))}
                      onEdit={editing ? () => openEditor({ index: idx }) : undefined}
                      onRemove={editing ? () => setDraft(draft!.filter((x) => x !== s)) : undefined}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <Card>
          <ActionFeedback action={task} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={task.pending}>
              💾 儲存這一週（{draft.length} 個時段）
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={task.pending}
              onClick={() => {
                if (window.confirm('放棄這次的修改？')) {
                  setDraft(null);
                  setEditor(null);
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
