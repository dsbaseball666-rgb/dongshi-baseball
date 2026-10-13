import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DailyNote, Role, SchoolRecord, TeamEvent } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { usePlayers } from '../sources/hooks';
import { EVENT_CATEGORIES, EVENT_ICONS, formatEventTime, SCHOOL_CATEGORIES, SCHOOL_RATINGS, useHub, useRoster, type EventInput, type HubSummary } from '../sources/hub';
import { addDays, formatDate, formatDateTime, todayStr } from '../lib/date';
import { formatFitnessValue, getFitnessItem } from '../lib/fitness';
import { goalProgress, GOAL_STATUS_LABELS } from '../lib/progress';
import { examAverage, examLabel, examOrder, GRADE_LABELS } from '../lib/exam';
import { SELF_CHECK_ITEMS } from '../data/selfChecks';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader, ProgressBar } from '../components/UI';

type Hub = ReturnType<typeof useHub>;
type Tab = 'overview' | 'messages' | 'school' | 'notes' | 'study' | 'events';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '📋 總覽' },
  { id: 'messages', label: '💬 溝通區' },
  { id: 'school', label: '🏫 在校表現' },
  { id: 'notes', label: '📒 棒球筆記' },
  { id: 'study', label: '📝 課業' },
  { id: 'events', label: '📅 行程' },
];

const RATING_TONE: Record<string, 'green' | 'blue' | 'gray' | 'red'> = { 優良: 'green', 良好: 'blue', 普通: 'gray', 待加強: 'red' };
const ROLE_SHORT: Record<Role, string> = { coach: '教練', parent: '家長', teacher: '老師', player: '球員', office: '學務處' };
const ROLE_TONE: Record<Role, 'yellow' | 'blue' | 'purple' | 'green' | 'red'> = { coach: 'yellow', parent: 'blue', teacher: 'purple', player: 'green', office: 'red' };

function RoleBadge({ role, name }: { role: Role; name: string }) {
  return (
    <span className="author">
      <Badge tone={ROLE_TONE[role]}>{ROLE_SHORT[role]}</Badge> <strong>{name}</strong>
    </span>
  );
}

/* ───────── 溝通區 ───────── */
function Messages({ hub, data, compact = false }: { hub: Hub; data: HubSummary; compact?: boolean }) {
  const { user } = useStore();
  const [body, setBody] = useState('');
  const task = useTask();
  const listRef = useRef<HTMLDivElement>(null);
  const list = compact ? data.messages.slice(-3) : data.messages;
  useEffect(() => {
    if (listRef.current && !compact) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [list.length, compact]);
  return (
    <>
      {list.length === 0 ? (
        <EmptyState icon="💬" title="還沒有留言" hint={compact ? undefined : '家長、老師、教練都可以在這裡留言；學生本人看不到。'} />
      ) : (
        <div ref={listRef} className={`chat ${compact ? 'compact' : ''}`}>
          {list.map((m) => {
            const mine = m.authorId === user?.id;
            return (
              <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
                <div className="bubble-head">
                  <RoleBadge role={m.authorRole} name={m.authorName} />
                  <span className="muted small">{formatDateTime(m.createdAt)}</span>
                </div>
                {m.batchId && <span className="batch-tag">📢 群發給 {m.batchSize} 位學生</span>}
                <p className="bubble-body">{m.body}</p>
                {!compact && (mine || user?.role === 'coach') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={task.pending}
                    onClick={() => {
                      if (m.batchId) {
                        if (!window.confirm(`這是群發給 ${m.batchSize} 位學生的訊息。\n\n按「確定」：從所有學生的溝通區一起刪除\n按「取消」：不刪除`)) return;
                        task.run(() => hub.deleteMessage(m.id, true));
                      } else if (window.confirm('確定刪除這則留言？')) task.run(() => hub.deleteMessage(m.id));
                    }}
                  >
                    刪除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!compact && (
        <form
          className="form chat-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await task.run(() => hub.postMessage(body.trim()));
            if (r.ok) setBody('');
          }}
        >
          <Field label="寫留言" hint="家長、老師、教練看得到；學生本人看不到。最多 1000 字。">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} />
          </Field>
          <ActionFeedback action={task} />
          <button type="submit" className="btn btn-primary" disabled={task.pending || !body.trim()}>
            送出留言
          </button>
        </form>
      )}
    </>
  );
}

/* ───────── 在校表現 ───────── */
function RecordForm({ hub, playerId, editing, onDone }: { hub: Hub; playerId: string; editing: SchoolRecord | null; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState({ date: editing?.date ?? todayStr(), category: editing?.category ?? SCHOOL_CATEGORIES[0], rating: editing?.rating ?? '', content: editing?.content ?? '' });
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => hub.saveRecord({ ...f, playerId, id: editing?.id }), editing ? '已修改紀錄。' : '已新增紀錄。');
        if (r.ok) {
          setF({ ...f, content: '', rating: '' });
          onDone();
        }
      }}
    >
      <div className="grid-3 tight">
        <Field label="日期">
          <input type="date" value={f.date} max={todayStr()} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="類別">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {SCHOOL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="評等（可不選）">
          <select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>
            <option value="">—</option>
            {SCHOOL_RATINGS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="內容" required>
        <textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={3} maxLength={500} placeholder="例如：本週數學作業都有準時繳交，上課發言踴躍。" />
      </Field>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending || !f.content.trim()}>
          {editing ? '儲存修改' : '新增紀錄'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

function RecordList({ hub, records, canEdit, onEdit }: { hub: Hub; records: SchoolRecord[]; canEdit: (r: SchoolRecord) => boolean; onEdit?: (r: SchoolRecord) => void }) {
  const task = useTask();
  if (records.length === 0) return <EmptyState icon="🏫" title="還沒有在校表現紀錄" />;
  return (
    <>
      <ActionFeedback action={task} />
      <ul className="record-list">
        {records.map((r) => (
          <li key={r.id} className="record">
            <div className="record-head">
              <span className="nowrap">{formatDate(r.date)}</span> <Badge tone="purple">{r.category}</Badge> {r.rating && <Badge tone={RATING_TONE[r.rating] ?? 'gray'}>{r.rating}</Badge>}
            </div>
            <p>{r.content}</p>
            <div className="muted small">
              {ROLE_SHORT[r.authorRole]} {r.authorName}
              {onEdit && canEdit(r) && (
                <>
                  {' '}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(r)}>
                    修改
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => window.confirm('確定刪除這筆紀錄？') && task.run(() => hub.deleteRecord(r.id))}>
                    刪除
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ───────── 棒球筆記 ───────── */
function NoteItem({ n }: { n: DailyNote }) {
  const rows: [string, string][] = [
    ['當日訓練內容', n.training],
    ['今日學到的事情', n.learned],
    ['需要改進的地方', n.improve],
    ['明日訓練準備', n.tomorrowPrep],
  ];
  const checks = SELF_CHECK_ITEMS.filter((c) => n.selfChecks[c.key]).map((c) => c.label);
  return (
    <details className="note-item">
      <summary>
        <strong>{formatDate(n.date)}</strong> <span className="muted small">{n.training.slice(0, 30)}</span> {n.coachComment && <Badge tone="yellow">教練評語</Badge>}
      </summary>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <p key={k}>
            <span className="note-label">{k}</span>
            <br />
            {v}
          </p>
        ))}
      {checks.length > 0 && <p className="muted small">自我檢查：{checks.join('、')}</p>}
      {n.coachComment && (
        <div className="coach-comment">
          <span className="note-label">教練評語</span>
          <br />
          {n.coachComment}
        </div>
      )}
    </details>
  );
}

/* ───────── 行程 ───────── */
function EventForm({ hub, playerId, playerName, onDone }: { hub: Hub; playerId: string; playerName: string; onDone: () => void }) {
  const { user } = useStore();
  const task = useTask();
  const isCoach = user?.role === 'coach' || user?.role === 'office';
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [f, setF] = useState<EventInput>({ title: '', date: todayStr(), startTime: '', endTime: '', location: '', category: isCoach ? '練習' : '考試', playerIds: [], note: '' });
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => hub.saveEvent({ ...f, playerIds: scope === 'one' ? [playerId] : [] }), '已新增行程。');
        if (r.ok) {
          setF({ ...f, title: '', note: '', location: '' });
          onDone();
        }
      }}
    >
      <div className="grid-2 tight">
        <Field label="行程名稱" required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={40} placeholder="例如：第二次段考、縣賽" />
        </Field>
        <Field label="類別">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid-3 tight">
        <Field label="日期" required>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="開始時間">
          <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </Field>
        <Field label="結束時間">
          <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </Field>
      </div>
      <div className="grid-2 tight">
        <Field label="地點">
          <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={40} />
        </Field>
        <Field label="給誰看">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'one' | 'all')}>
            <option value="one">只有 {playerName}</option>
            <option value="all">{user?.role === 'office' ? '全體學生' : isCoach ? '全隊' : '我負責的全部學生'}</option>
          </select>
        </Field>
      </div>
      <Field label="備註">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} placeholder="例如：請攜帶球具、穿著隊服" />
      </Field>
      <ActionFeedback action={task} />
      <button type="submit" className="btn btn-primary" disabled={task.pending || !f.title.trim() || !f.date}>
        新增行程
      </button>
    </form>
  );
}

function EventList({ hub, events, today, limit }: { hub: Hub; events: TeamEvent[]; today: string; limit?: number }) {
  const { user } = useStore();
  const task = useTask();
  const upcoming = events.filter((e) => e.date >= today);
  const list = limit ? upcoming.slice(0, limit) : events;
  if (list.length === 0) return <EmptyState icon="📅" title="近期沒有行程" />;
  return (
    <>
      <ActionFeedback action={task} />
      <ul className="event-list">
        {list.map((e) => (
          <li key={e.id} className={`event ${e.date < today ? 'past' : ''} ${e.date === today ? 'today' : ''}`}>
            <span className="event-icon" aria-hidden>
              {EVENT_ICONS[e.category] ?? '📌'}
            </span>
            <div>
              <strong>{e.title}</strong> {e.date === today && <Badge tone="red">今天</Badge>} {e.playerIds.length === 0 && <Badge tone="green">全隊</Badge>}
              <div className="small">
                {formatEventTime(e)}
                {e.location && `・${e.location}`}
              </div>
              {e.note && <div className="muted small">{e.note}</div>}
              {!limit && (
                <div className="muted small">
                  {e.createdBy}
                  {(user?.role === 'coach' || e.createdById === user?.id) && (
                    <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => window.confirm(`確定刪除「${e.title}」？`) && task.run(() => hub.deleteEvent(e.id))}>
                      刪除
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ───────── 頁面 ───────── */
function HubContent({ playerId }: { playerId: string }) {
  const { user } = useStore();
  const hub = useHub(playerId);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<SchoolRecord | null>(null);
  const canWrite = user?.role === 'coach' || user?.role === 'teacher' || user?.role === 'office';
  const data = hub.data;

  const notesRecent = useMemo(() => (data ? data.notes.filter((n) => n.date >= addDays(data.today, -13)).length : 0), [data]);
  const exams = useMemo(() => (data ? [...data.exams].sort((a, b) => examOrder(b) - examOrder(a)) : []), [data]);

  if (hub.loading)
    return (
      <Card>
        <LoadingState text="讀取中…" />
      </Card>
    );
  if (hub.error || !data)
    return (
      <Alert kind="error">
        {hub.error ?? '讀取失敗'}{' '}
        <button type="button" className="btn btn-sm" onClick={hub.reload}>
          重新讀取
        </button>
      </Alert>
    );

  const latestComment = data.notes.find((n) => n.coachComment);
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const latestExam = exams[0];
  const canEditRecord = (r: SchoolRecord) => user?.role === 'coach' || r.authorId === user?.id;

  return (
    <>
      <div className="tabs hub-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'messages' && data.messages.length > 0 && <span className="tab-count">{data.messages.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="hub-grid">
          <Card title="最近行程" icon="📅" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('events')}>全部 →</button>}>
            <EventList hub={hub} events={data.events} today={data.today} limit={4} />
          </Card>
          <Card title="溝通區" icon="💬" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('messages')}>留言 →</button>}>
            <Messages hub={hub} data={data} compact />
          </Card>
          <Card title="在校表現" icon="🏫" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('school')}>全部 →</button>}>
            <RecordList hub={hub} records={data.schoolRecords.slice(0, 3)} canEdit={() => false} />
          </Card>
          <Card title="課業" icon="📝" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('study')}>全部 →</button>}>
            {latestExam ? (
              <>
                <p>
                  <strong>{examLabel(latestExam)}</strong> <Badge tone="blue">{GRADE_LABELS[latestExam.grade]}</Badge>
                </p>
                <div className="stat-row">
                  <div className="stat">
                    <span>平均</span>
                    <strong>{examAverage(latestExam.scores) ?? '—'}</strong>
                  </div>
                  {exams[1] && (
                    <div className="stat">
                      <span>上一次平均</span>
                      <strong>{examAverage(exams[1].scores) ?? '—'}</strong>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState icon="📝" title="還沒有段考成績" />
            )}
          </Card>
          <Card title="棒球學習" icon="⚾" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('notes')}>筆記 →</button>}>
            <div className="stat-row">
              <div className="stat">
                <span>近 14 天寫筆記</span>
                <strong>{notesRecent} 天</strong>
              </div>
              <div className="stat">
                <span>進行中的目標</span>
                <strong>{activeGoals.length}</strong>
              </div>
            </div>
            {latestComment ? (
              <div className="coach-comment">
                <span className="note-label">最新教練評語（{formatDate(latestComment.date)}）</span>
                <br />
                {latestComment.coachComment}
              </div>
            ) : (
              <p className="muted small">目前還沒有教練評語。</p>
            )}
          </Card>
          <Card title="體能最新成績" icon="💪">
            {data.fitness.length === 0 ? (
              <EmptyState icon="💪" title="還沒有體能紀錄" />
            ) : (
              <ul className="plain-list compact-list">
                {data.fitness.map((f) => (
                  <li key={f.id}>
                    {getFitnessItem(f.item).label}：<strong>{formatFitnessValue(f.item, f.value)}</strong> <span className="muted small">{formatDate(f.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'messages' && (
        <Card title={`${data.player.name} 的溝通區`} icon="💬">
          <Messages hub={hub} data={data} />
        </Card>
      )}

      {tab === 'school' && (
        <>
          {canWrite && (
            <Card title={editing ? '修改在校表現紀錄' : '新增在校表現紀錄'} icon="✏️">
              <RecordForm key={editing?.id ?? 'new'} hub={hub} playerId={playerId} editing={editing} onDone={() => setEditing(null)} />
            </Card>
          )}
          <Card title="在校表現紀錄" icon="🏫">
            <RecordList hub={hub} records={data.schoolRecords} canEdit={canEditRecord} onEdit={(r) => setEditing(r)} />
          </Card>
        </>
      )}

      {tab === 'notes' && (
        <>
          <Card title="目標進度" icon="🎯">
            {data.goals.length === 0 ? (
              <EmptyState title="還沒有設定目標" />
            ) : (
              <ul className="plain-list">
                {data.goals.map((g) => {
                  const pg = goalProgress(g);
                  return (
                    <li key={g.id}>
                      <strong>{g.content}</strong> <Badge tone={g.status === 'completed' ? 'green' : g.status === 'active' ? 'blue' : 'gray'}>{GOAL_STATUS_LABELS[g.status]}</Badge>
                      <div className="muted small">期限：{formatDate(g.dueDate)}</div>
                      <ProgressBar value={pg.approved} max={pg.total} tone="goal" label={`檢核點 ${pg.approved} / ${pg.total}`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="棒球筆記（最近 30 篇）" icon="📒">
            {data.notes.length === 0 ? <EmptyState icon="📒" title="還沒有筆記" /> : data.notes.map((n) => <NoteItem key={n.id} n={n} />)}
          </Card>
        </>
      )}

      {tab === 'study' && (
        <Card title="段考成績" icon="📝" actions={<Link to={`/exams?player=${playerId}`} className="btn btn-sm">看圖表 →</Link>}>
          {exams.length === 0 ? (
            <EmptyState icon="📝" title="還沒有段考成績" hint="教練輸入後會顯示在這裡。" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>段考</th>
                    <th>各科成績</th>
                    <th>平均</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{examLabel(r)}</td>
                      <td>
                        <div className="chip-row">
                          {Object.entries(r.scores).map(([k, v]) => (
                            <span key={k} className="score-chip">
                              {k} <strong>{v}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{examAverage(r.scores) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'events' && (
        <>
          {canWrite && (
            <Card title="新增行程" icon="➕">
              <EventForm hub={hub} playerId={playerId} playerName={data.player.name} onDone={() => undefined} />
            </Card>
          )}
          <Card title="行程（3 天前～60 天後）" icon="📅">
            <EventList hub={hub} events={data.events} today={data.today} />
          </Card>
        </>
      )}
    </>
  );
}

/* ───────── 全部學生一覽 ───────── */
function RosterView({ roster, onOpen }: { roster: ReturnType<typeof useRoster>; onOpen: (playerId: string) => void }) {
  const [filter, setFilter] = useState('');
  if (roster.loading)
    return (
      <Card>
        <LoadingState text="讀取全部學生…" />
      </Card>
    );
  if (roster.error) return <Alert kind="error">{roster.error}</Alert>;
  const rows = roster.students.filter((s) => !filter || s.name.includes(filter) || s.grade.includes(filter));
  return (
    <Card title={`全部學生一覽（${roster.students.length} 位）`} icon="👥" actions={<input className="roster-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋姓名或年級" aria-label="搜尋學生" />}>
      <p className="muted small">點學生姓名可以看他的完整資料（溝通區、在校表現、筆記、課業、行程）。</p>
      <div className="table-wrap">
        <table className="roster-table">
          <thead>
            <tr>
              <th>學生</th>
              <th>最新留言</th>
              <th>在校表現</th>
              <th>近 14 天筆記</th>
              <th>最近段考</th>
              <th>7 天內行程</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.playerId}>
                <th scope="row">
                  <button type="button" className="link-btn" onClick={() => onOpen(s.playerId)}>
                    {s.name}
                  </button>
                  {s.grade && <div className="muted small">{s.grade}</div>}
                </th>
                <td className="small">{s.lastMessageAt ? `${formatDateTime(s.lastMessageAt)}・${s.lastMessageBy}` : '—'}</td>
                <td className="small">
                  {s.lastRecord ? (
                    <>
                      {formatDate(s.lastRecord.date)} {s.lastRecord.category} {s.lastRecord.rating && <Badge tone={RATING_TONE[s.lastRecord.rating] ?? 'gray'}>{s.lastRecord.rating}</Badge>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <Badge tone={s.notes14 >= 7 ? 'green' : s.notes14 > 0 ? 'yellow' : 'red'}>{s.notes14} 天</Badge>
                </td>
                <td className="small">{s.latestExam ? `${s.latestExam.label}・平均 ${s.latestExam.average ?? '—'}` : '—'}</td>
                <td>{s.upcomingEvents || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────── 群發訊息 ───────── */
function BroadcastView({ roster }: { roster: ReturnType<typeof useRoster> }) {
  const { user } = useStore();
  const task = useTask();
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [body, setBody] = useState('');
  const shown = roster.students.filter((s) => !filter || s.name.includes(filter) || s.grade.includes(filter));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? Array.from(new Set([...p, id])) : p.filter((x) => x !== id)));
  if (roster.loading)
    return (
      <Card>
        <LoadingState text="讀取學生名單…" />
      </Card>
    );
  return (
    <Card title="群發訊息" icon="📢">
      <p className="muted small">
        同一則訊息會一次放進每位勾選學生的溝通區，{user?.role === 'teacher' ? '全班家長' : '每位學生的家長、老師'}和教練都看得到；學生本人看不到。
      </p>
      <fieldset className="checks">
        <legend>
          發給哪些學生（已選 {picked.length} 位）
        </legend>
        <div className="check-tools">
          <input className="check-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋姓名或年級，例如：八年級" aria-label="搜尋學生" />
          <button type="button" className="btn btn-sm" onClick={() => setPicked((p) => Array.from(new Set([...p, ...shown.map((s) => s.playerId)])))}>
            ✅ 全選{filter ? '搜尋結果' : ''}（{shown.length}）
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked([])}>
            全部取消
          </button>
        </div>
        {shown.map((s) => (
          <label key={s.playerId} className="check">
            <input type="checkbox" checked={picked.includes(s.playerId)} onChange={(e) => toggle(s.playerId, e.target.checked)} />
            {s.name}
            {s.grade && <span className="muted small">（{s.grade}）</span>}
          </label>
        ))}
      </fieldset>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!window.confirm(`確定把這則訊息發給 ${picked.length} 位學生的溝通區？`)) return;
          const r = await task.run(() => roster.broadcast(picked, body.trim()), `已發送給 ${picked.length} 位學生的溝通區。`);
          if (r.ok) {
            setBody('');
            setPicked([]);
          }
        }}
      >
        <Field label="訊息內容" hint="最多 1000 字">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} placeholder="例如：本週五下午停課，請家長留意接送時間。" />
        </Field>
        <ActionFeedback action={task} />
        <button type="submit" className="btn btn-primary" disabled={task.pending || picked.length === 0 || !body.trim()}>
          📢 發送給 {picked.length} 位學生
        </button>
      </form>
    </Card>
  );
}

type View = 'roster' | 'broadcast' | 'student';

export default function HubPage() {
  const { user } = useStore();
  const [params, setParams] = useSearchParams();
  const { players, loading, error } = usePlayers();
  const list = players.filter((p) => p.active || user?.role !== 'coach');
  const multi = list.length > 1;
  const playerId = params.get('player') ?? list[0]?.id ?? '';
  const view: View = !multi ? 'student' : ((params.get('view') as View | null) ?? (params.get('player') ? 'student' : 'roster'));
  const roster = useRoster(multi && view !== 'student');
  const go = (v: View, pid?: string) => setParams(pid ? { view: v, player: pid } : { view: v }, { replace: true });
  const subtitle =
    user?.role === 'parent' ? '和老師、教練一起關心孩子' : user?.role === 'teacher' ? '和家長、教練一起關心學生' : user?.role === 'office' ? '查看全體學生狀況，統一發布訊息' : '和家長、老師一起關心球員';
  return (
    <div className="page">
      <PageHeader icon="🤝" title="親師平台" subtitle={subtitle} />
      <Alert kind="info">🔒 這裡的溝通區與在校表現，只有這位學生的<strong>家長、老師、學務處和教練</strong>看得到，學生本人看不到。</Alert>
      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <Card>
          <LoadingState text="讀取名單…" />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title="目前沒有對應的學生" hint="請聯絡教練設定你負責（或你孩子）的學生。" />
        </Card>
      ) : (
        <>
          {multi && (
            <div className="tabs view-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={view === 'roster'} className={`tab ${view === 'roster' ? 'active' : ''}`} onClick={() => go('roster')}>
                👥 全部學生一覽
              </button>
              {user?.role !== 'parent' && (
                <button type="button" role="tab" aria-selected={view === 'broadcast'} className={`tab ${view === 'broadcast' ? 'active' : ''}`} onClick={() => go('broadcast')}>
                  📢 群發訊息
                </button>
              )}
              <button type="button" role="tab" aria-selected={view === 'student'} className={`tab ${view === 'student' ? 'active' : ''}`} onClick={() => go('student', playerId)}>
                👤 個別學生
              </button>
            </div>
          )}
          {view === 'roster' && <RosterView roster={roster} onOpen={(pid) => go('student', pid)} />}
          {view === 'broadcast' && <BroadcastView roster={roster} />}
          {view === 'student' && multi && (
            <Card>
              <Field label={user?.role === 'parent' ? '選擇孩子' : '選擇學生'}>
                <select value={playerId} onChange={(e) => go('student', e.target.value)}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.grade ? `（${p.grade}）` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>
          )}
          {view === 'student' && playerId && <HubContent key={playerId} playerId={playerId} />}
        </>
      )}
    </div>
  );
}
