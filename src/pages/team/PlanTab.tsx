import { useMemo, useState } from 'react';
import type { Player, TrainingCell, TrainingGroup, TrainingWeek } from '../../types';
import { useTask } from '../../store/DemoStore';
import { usePlayers } from '../../sources/hooks';
import { blankTrainingWeek, byNumber, CELL_TITLES, mondayOf, shiftTrainingWeek, TIME_OPTIONS, useTrainingWeek, WEEK_DAY_DEFAULTS } from '../../sources/team';
import { todayStr } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingCard } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';
import { WeekNav } from './WeekNav';
import { cellLines, trainingWeekImage, WEEKDAY_NAMES } from './images';

/** 快速選人（依年級、守備位置） */
const QUICK: { label: string; test: (p: Player) => boolean }[] = [
  { label: '投手', test: (p) => p.position.includes('投手') },
  { label: '捕手', test: (p) => p.position.includes('捕手') },
  { label: '內野', test: (p) => p.position.includes('內野') },
  { label: '外野', test: (p) => p.position.includes('外野') },
  { label: '七年級', test: (p) => p.grade.includes('七') },
  { label: '八年級', test: (p) => p.grade.includes('八') },
  { label: '九年級', test: (p) => p.grade.includes('九') },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const cellOf = (w: TrainingWeek, groupId: string, date: string) => w.cells.find((c) => c.groupId === groupId && c.date === date);
let groupSeq = 0;
const newGroupId = () => `g${Date.now().toString(36)}${++groupSeq}`;

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

/** 選球員的按鈕群（已經在別組的人會變灰色並標出組名） */
function PlayerPicker({ players, selected, taken, onChange }: { players: Player[]; selected: string[]; taken?: Map<string, string>; onChange: (ids: string[] | ((ids: string[]) => string[])) => void }) {
  const free = players.filter((p) => !taken?.has(p.id));
  return (
    <>
      <div className="roll-status group-row">
        <span className="muted small">快速選：</span>
        {QUICK.map((g) => {
          const ids = free.filter(g.test).map((p) => p.id);
          if (ids.length === 0) return null;
          const on = ids.every((id) => selected.includes(id));
          return (
            <button
              key={g.label}
              type="button"
              className={`status-btn ${on ? 'on tone-purple' : ''}`}
              aria-pressed={on}
              onClick={() => onChange((cur) => (on ? cur.filter((id) => !ids.includes(id)) : Array.from(new Set([...cur, ...ids]))))}
            >
              {g.label}（{ids.length}）
            </button>
          );
        })}
        {taken && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(free.map((p) => p.id))}>
            還沒分組的全部選
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([])}>
          全部取消
        </button>
      </div>
      <div className="player-chips">
        {players.map((p) => {
          const other = taken?.get(p.id);
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`status-btn ${on ? 'on tone-blue' : ''} ${other ? 'taken' : ''}`}
              aria-pressed={on}
              disabled={!!other}
              title={other ? `已經在「${other}」` : undefined}
              onClick={() => onChange((cur) => toggle(cur, p.id))}
            >
              {p.number && <span className="chip-no">#{p.number}</span>}
              {p.name}
              {other && <span className="chip-taken">（{other}）</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ───────── 課表（組別 × 星期幾） ───────── */
function WeekGrid({ week, names, myIds, pick, selected }: {
  week: TrainingWeek;
  names: Record<string, string>;
  myIds: string[];
  /** 編輯時點格子 */
  pick?: (groupId: string, date: string) => void;
  selected?: { groupId: string; date: string } | null;
}) {
  const today = todayStr();
  const nameList = (ids: string[]) => ids.map((id) => names[id] ?? '（已刪除）').join('、');
  const hasNotes = week.days.some((d) => !d.off && d.note);
  return (
    <div className="tw-wrap">
      <table className="tw-grid">
        <thead>
          <tr>
            <th className="tw-corner" rowSpan={3}>
              {md(week.weekStart)} 這週
            </th>
            {week.days.map((d) => (
              <th key={d.date} className={`${d.off ? 'tw-off' : ''} ${d.date === today ? 'tw-today' : ''}`}>
                {Number(d.date.slice(5, 7))}月{Number(d.date.slice(8))}日
              </th>
            ))}
          </tr>
          <tr>
            {week.days.map((d, i) => (
              <th key={d.date} className={d.off ? 'tw-off' : ''}>
                禮拜{WEEKDAY_NAMES[i]}
                {d.date === today && <Badge tone="red">今天</Badge>}
              </th>
            ))}
          </tr>
          <tr>
            {week.days.map((d) => (
              <th key={d.date} className={`tw-time ${d.off ? 'tw-off' : ''}`}>
                {d.off ? '休兵日' : `${d.startTime}–${d.endTime}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.groups.map((g, gi) => (
            <tr key={g.id} className={g.playerIds.some((id) => myIds.includes(id)) ? 'tw-mine' : ''}>
              <th className="tw-group" scope="row">
                <strong>{g.name}</strong>
                <span className="small">{g.playerIds.length ? nameList(g.playerIds) : '（全隊）'}</span>
              </th>
              {week.days.map((d) => {
                if (d.off) {
                  return gi === 0 ? (
                    <td key={d.date} className="tw-off tw-rest" rowSpan={week.groups.length}>
                      休兵日
                    </td>
                  ) : null;
                }
                const c = cellOf(week, g.id, d.date);
                const isSel = selected?.groupId === g.id && selected.date === d.date;
                const body = c ? (
                  <>
                    {c.title && <div className="tw-title">{c.title}</div>}
                    {cellLines(c.lines).map((l, k) => (
                      <div key={k} className={l.sub ? 'tw-sub' : 'tw-line'}>
                        {l.text}
                      </div>
                    ))}
                    {c.playerIds.length > 0 && <div className={`tw-players ${c.playerIds.some((id) => myIds.includes(id)) ? 'is-mine' : ''}`}>👤 {nameList(c.playerIds)}</div>}
                  </>
                ) : (
                  <div className="muted small tw-empty">{pick ? '＋ 點這裡填寫' : '—'}</div>
                );
                return (
                  <td key={d.date} className={`${isSel ? 'tw-selected' : ''} ${d.date === today ? 'tw-today' : ''}`}>
                    {pick ? (
                      <button type="button" className="tw-cell-btn" onClick={() => pick(g.id, d.date)} aria-label={`編輯 ${g.name} ${md(d.date)}`}>
                        {body}
                      </button>
                    ) : (
                      body
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {hasNotes && (
            <tr className="tw-notes">
              <th scope="row">📌 備註</th>
              {week.days.map((d) => (d.off ? null : <td key={d.date}>{d.note}</td>))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── 編輯：組別與組員 ───────── */
function GroupsEditor({ groups, players, onChange }: { groups: TrainingGroup[]; players: Player[]; onChange: (g: TrainingGroup[]) => void }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.id ?? null);
  const patch = (id: string, p: Partial<TrainingGroup> | ((g: TrainingGroup) => Partial<TrainingGroup>)) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...(typeof p === 'function' ? p(g) : p) } : g)));
  return (
    <Card title="① 分組與組員" icon="👥">
      <p className="muted small">每一組勾選組員（跟以前一樣點選球員）。同一位球員一週只能在一個組別；沒有勾任何人的組別代表全隊。</p>
      <div className="tw-groups">
        {groups.map((g) => {
          const taken = new Map<string, string>();
          groups.forEach((o) => o.id !== g.id && o.playerIds.forEach((id) => taken.set(id, o.name)));
          return (
            <div key={g.id} className={`day-row ${open === g.id ? 'on' : ''}`}>
              <div className="day-row-head">
                <input className="inline-input tw-group-name" value={g.name} maxLength={12} onChange={(e) => patch(g.id, { name: e.target.value })} aria-label="組別名稱" />
                <span className="small muted">{g.playerIds.length ? `${g.playerIds.length} 人` : '全隊'}</span>
                <button type="button" className="btn btn-sm" onClick={() => setOpen(open === g.id ? null : g.id)}>
                  {open === g.id ? '收起' : '選組員'}
                </button>
                {groups.length > 1 && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm(`刪除「${g.name}」？這一組的課表內容也會一起刪除。`) && onChange(groups.filter((x) => x.id !== g.id))}>
                    刪除
                  </button>
                )}
              </div>
              {open === g.id && (
                <div className="day-row-body">
                  <PlayerPicker players={players} selected={g.playerIds} taken={taken} onChange={(v) => patch(g.id, (cur) => ({ playerIds: typeof v === 'function' ? v(cur.playerIds) : v }))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {groups.length < 10 && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const id = newGroupId();
            onChange([...groups, { id, name: `第${groups.length + 1}組`, playerIds: [] }]);
            setOpen(id);
          }}
        >
          ＋ 新增組別
        </button>
      )}
    </Card>
  );
}

/* ───────── 編輯：每天時間 ───────── */
function DaysEditor({ week, onChange }: { week: TrainingWeek; onChange: (w: TrainingWeek) => void }) {
  const set = (i: number, p: Partial<TrainingWeek['days'][number]>) => onChange({ ...week, days: week.days.map((d, k) => (k === i ? { ...d, ...p } : d)) });
  return (
    <Card title="② 每天時間" icon="⏰">
      <p className="muted small">已經帶入固定時間：一、二、三、五 17:00–18:00，四 15:00–17:00，六 13:30–18:00，日休兵。放假或改時間時在這裡調整。</p>
      <div className="tw-days">
        {week.days.map((d, i) => (
          <div key={d.date} className={`tw-day-row ${d.off ? 'is-off' : ''}`}>
            <strong>
              禮拜{WEEKDAY_NAMES[i]} {md(d.date)}
            </strong>
            <label className="check">
              <input type="checkbox" checked={d.off} onChange={(e) => set(i, e.target.checked ? { off: true } : { off: false, startTime: d.startTime || WEEK_DAY_DEFAULTS[i].startTime || '17:00', endTime: d.endTime || WEEK_DAY_DEFAULTS[i].endTime || '18:00' })} />
              休兵日
            </label>
            {!d.off && (
              <span className="time-pair">
                <TimeSelect label={`禮拜${WEEKDAY_NAMES[i]} 開始`} value={d.startTime} onChange={(v) => set(i, { startTime: v })} />
                <span>到</span>
                <TimeSelect label={`禮拜${WEEKDAY_NAMES[i]} 結束`} value={d.endTime} onChange={(v) => set(i, { endTime: v })} />
              </span>
            )}
            {!d.off && <textarea rows={d.note ? Math.min(7, d.note.split('\n').length) : 1} value={d.note} maxLength={300} onChange={(e) => set(i, { note: e.target.value })} placeholder="當天備註（可空白），例如分段時間" aria-label={`禮拜${WEEKDAY_NAMES[i]} 備註`} />}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm('把每天的時間和備註恢復成預設值？') && onChange({ ...week, days: WEEK_DAY_DEFAULTS.map((d, i) => ({ ...d, date: week.days[i].date })) })}>
        恢復預設時間
      </button>
    </Card>
  );
}

/* ───────── 編輯：一格的內容 ───────── */
function CellEditor({ week, groupId, date, players, onDone, onCancel }: {
  week: TrainingWeek;
  groupId: string;
  date: string;
  players: Player[];
  onDone: (cells: TrainingCell[]) => void;
  onCancel: () => void;
}) {
  const group = week.groups.find((g) => g.id === groupId)!;
  const di = week.days.findIndex((d) => d.date === date);
  const old = cellOf(week, groupId, date);
  const [title, setTitle] = useState(old?.title ?? '');
  const [lines, setLines] = useState(old?.lines ?? '');
  const [ids, setIds] = useState<string[]>(old?.playerIds ?? []);
  const [showPlayers, setShowPlayers] = useState((old?.playerIds.length ?? 0) > 0);
  const [copyDays, setCopyDays] = useState<string[]>([]);
  const [copyGroups, setCopyGroups] = useState<string[]>([]);
  const otherDays = week.days.filter((d) => d.date !== date && !d.off);
  const otherGroups = week.groups.filter((g) => g.id !== groupId);

  const finish = () => {
    const cell = { title: title.trim(), lines: lines.replace(/\s+$/, ''), playerIds: players.filter((p) => ids.includes(p.id)).map((p) => p.id) };
    const targets = [{ groupId, date }, ...copyDays.map((d) => ({ groupId, date: d })), ...copyGroups.map((g) => ({ groupId: g, date }))];
    const overwrite = targets.slice(1).filter((t) => cellOf(week, t.groupId, t.date));
    if (overwrite.length && !window.confirm(`有 ${overwrite.length} 格原本已經有內容，要換成這一格的內容嗎？`)) return;
    const keep = week.cells.filter((c) => !targets.some((t) => t.groupId === c.groupId && t.date === c.date));
    const empty = !cell.title && !cell.lines.trim() && cell.playerIds.length === 0;
    onDone(empty ? keep : [...keep, ...targets.map((t) => ({ ...t, ...cell }))]);
  };

  return (
    <Card title={`③ ${group.name}・禮拜${WEEKDAY_NAMES[di]} ${md(date)}`} icon="✏️" className="tw-cell-editor">
      <div className="field">
        <span className="field-label">訓練主題（黃色標題）</span>
        <div className="roll-status">
          {CELL_TITLES.map((t) => (
            <button key={t} type="button" className={`status-btn ${title === t ? 'on tone-yellow' : ''}`} onClick={() => setTitle(title === t ? '' : t)}>
              {t}
            </button>
          ))}
        </div>
        <input value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} placeholder="或自己輸入，例如：投球訓練(操場)" aria-label="訓練主題" />
      </div>
      <div className="field">
        <span className="field-label">訓練項目（一行一項）</span>
        <textarea rows={8} value={lines} maxLength={1500} onChange={(e) => setLines(e.target.value)} placeholder={'#訓練階段(6人一起執行)\n肩關節重訓(配合槓片)\n爆發分腿蹲(配合啞鈴)\n#做完兩組交換\n農夫走路(雙邊平衡)'} aria-label="訓練項目" />
        <span className="muted small">行首加「#」會變成灰色小標題（例如「#熱身階段」）。</span>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={showPlayers} onChange={(e) => setShowPlayers(e.target.checked)} />
          這一格另外指定球員（例如：特守 江柏丞＋劉玟德＋曾昱翔）
        </label>
        {showPlayers && <PlayerPicker players={players} selected={ids} onChange={(v) => setIds((cur) => (typeof v === 'function' ? v(cur) : v))} />}
      </div>
      {(otherDays.length > 0 || otherGroups.length > 0) && (
        <div className="field copy-to">
          <span className="field-label">相同內容也套用到</span>
          <div className="roll-status">
            {otherDays.map((d) => (
              <button key={d.date} type="button" className={`status-btn ${copyDays.includes(d.date) ? 'on tone-blue' : ''}`} aria-pressed={copyDays.includes(d.date)} onClick={() => setCopyDays((x) => toggle(x, d.date))}>
                {group.name} 禮拜{WEEKDAY_NAMES[week.days.indexOf(d)]}
                {cellOf(week, groupId, d.date) && ' •'}
              </button>
            ))}
            {otherGroups.map((g) => (
              <button key={g.id} type="button" className={`status-btn ${copyGroups.includes(g.id) ? 'on tone-purple' : ''}`} aria-pressed={copyGroups.includes(g.id)} onClick={() => setCopyGroups((x) => toggle(x, g.id))}>
                {g.name} 這天
                {cellOf(week, g.id, date) && ' •'}
              </button>
            ))}
          </div>
          <span className="muted small">有「•」的格子原本已經有內容，套用後會被換掉。</span>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={finish}>
          ✔ 完成這一格{copyDays.length + copyGroups.length ? `（另外套用 ${copyDays.length + copyGroups.length} 格）` : ''}
        </button>
        {old && (
          <button type="button" className="btn btn-ghost" onClick={() => window.confirm('清空這一格？') && onDone(week.cells.filter((c) => c !== old))}>
            清空這一格
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
      <p className="muted small">完成後會先放在上面的課表，最後記得按「💾 儲存這一週」。</p>
    </Card>
  );
}

export function PlanTab({ coach, myIds = [] }: { coach: boolean; myIds?: string[] }) {
  const today = todayStr();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const data = useTrainingWeek(monday);
  const { players } = usePlayers();
  const active = useMemo(() => players.filter((p) => p.active).sort(byNumber), [players]);
  const task = useTask();
  const [draft, setDraft] = useState<TrainingWeek | null>(null);
  const [cell, setCell] = useState<{ groupId: string; date: string } | null>(null);
  const editing = draft !== null;
  const names = useMemo(() => ({ ...data.names, ...Object.fromEntries(players.map((p) => [p.id, p.name])) }), [data.names, players]);
  const week = data.week;
  const shown = draft ?? week;

  const moveTo = (m: string) => {
    if (editing && !window.confirm('這一週的課表還沒儲存，確定要離開嗎？')) return;
    setDraft(null);
    setCell(null);
    setMonday(m);
  };
  const openCell = (groupId: string, date: string) => {
    setCell({ groupId, date });
    setTimeout(() => document.querySelector('.tw-cell-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const setGroups = (groups: TrainingGroup[]) => {
    if (!draft) return;
    const ids = groups.map((g) => g.id);
    setDraft({ ...draft, groups, cells: draft.cells.filter((c) => ids.includes(c.groupId)) });
    if (cell && !ids.includes(cell.groupId)) setCell(null);
  };
  const copyLast = () => {
    if (!data.last) return;
    if (draft && draft.cells.length && !window.confirm('要用上一週的課表（分組、時間、內容）取代目前這週嗎？')) return;
    setDraft(shiftTrainingWeek(data.last, monday));
    setCell(null);
  };
  const save = async () => {
    if (!draft) return;
    const bad = draft.groups.find((g) => !g.name.trim());
    if (bad) return window.alert('有組別沒有名稱。');
    const r = await task.run(() => data.save({ ...draft, groups: draft.groups.map((g) => ({ ...g, name: g.name.trim() })) }), '已儲存這一週的訓練課表。');
    if (r.ok) {
      setDraft(null);
      setCell(null);
    }
  };

  return (
    <>
      <Card>
        <WeekNav monday={monday} onMove={moveTo} />
        {coach && !editing && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setDraft(week ?? blankTrainingWeek(monday))} disabled={data.loading}>
              ✏️ {week ? '編輯這一週' : '安排這一週'}
            </button>
            {!week && data.last && (
              <button type="button" className="btn" onClick={copyLast}>
                📄 複製上週的課表
              </button>
            )}
            <LineImageButton key={monday} make={() => trainingWeekImage(week!, names)} filename={`訓練課表-${monday}.png`} title="每週訓練課表" disabled={!week} />
          </div>
        )}
        {editing && (
          <>
            <div className="form-actions">
              {data.last && (
                <button type="button" className="btn" onClick={copyLast}>
                  📄 複製上週（分組、時間、內容）
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => window.confirm('清空這一週的課表內容（分組和時間保留）？') && setDraft({ ...draft, cells: [] })}>
                清空課表內容
              </button>
            </div>
            <Alert kind="warn">正在編輯：先分好組、確認每天時間，再點課表上的格子填寫內容，最後按「💾 儲存這一週」。</Alert>
          </>
        )}
        {!coach && <p className="muted small">這裡只會顯示有{myIds.length > 1 ? '你的孩子（學生）' : '你'}的組別。</p>}
      </Card>

      {editing && <GroupsEditor groups={draft.groups} players={active} onChange={setGroups} />}
      {editing && <DaysEditor week={draft} onChange={setDraft} />}

      {data.error && <Alert kind="error">{data.error}</Alert>}
      {data.loading ? (
        <LoadingCard text="讀取訓練課表…" />
      ) : !shown ? (
        <Card>
          <EmptyState icon="🗓️" title="這一週還沒有訓練課表" hint={coach ? '按「安排這一週」開始：分組、每天時間已經帶好，點格子填寫內容就可以了。' : '教練還沒有排這一週。'} />
        </Card>
      ) : (
        <Card title={editing ? '③ 點格子填寫內容' : '每週訓練課表'} icon="🗓️">
          <WeekGrid week={shown} names={names} myIds={coach ? [] : myIds} pick={editing ? openCell : undefined} selected={cell} />
          {!editing && week?.updatedBy && <p className="muted small">最後更新：{week.updatedBy}</p>}
        </Card>
      )}

      {editing && cell && draft.groups.some((g) => g.id === cell.groupId) && (
        <CellEditor
          key={`${cell.groupId}-${cell.date}`}
          week={draft}
          groupId={cell.groupId}
          date={cell.date}
          players={active}
          onDone={(cells) => {
            setDraft({ ...draft, cells });
            setCell(null);
          }}
          onCancel={() => setCell(null)}
        />
      )}

      {editing && (
        <Card>
          <ActionFeedback action={task} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={task.pending}>
              💾 儲存這一週（{draft.groups.length} 組、{draft.cells.length} 格）
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={task.pending}
              onClick={() => {
                if (window.confirm('放棄這次的修改？')) {
                  setDraft(null);
                  setCell(null);
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
