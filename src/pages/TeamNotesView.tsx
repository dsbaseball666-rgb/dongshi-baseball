import { useMemo, useState } from 'react';
import type { DailyNote, Player } from '../types';
import { useTask } from '../store/DemoStore';
import { useTeamNotes } from '../sources/hooks';
import { SELF_CHECK_ITEMS } from '../data/selfChecks';
import { addDays, formatDate, todayStr } from '../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingState } from '../components/UI';

/** 筆記的文字欄位（順序與球員填寫畫面相同） */
export const NOTE_FIELDS: { key: 'training' | 'learned' | 'improve' | 'tomorrowPrep' | 'shortGoal' | 'midGoal' | 'longGoal'; label: string }[] = [
  { key: 'training', label: '當日訓練內容' },
  { key: 'learned', label: '今日學到的事情' },
  { key: 'improve', label: '今天需要改進的地方' },
  { key: 'tomorrowPrep', label: '明日訓練準備' },
  { key: 'shortGoal', label: '短期目標' },
  { key: 'midGoal', label: '中期目標' },
  { key: 'longGoal', label: '長期目標' },
];

type Status = 'done' | 'partial' | 'none';
const STATUS: Record<Status, { label: string; tone: 'green' | 'yellow' | 'red'; dot: string }> = {
  done: { label: '✅ 寫完', tone: 'green', dot: '●' },
  partial: { label: '✏️ 沒寫完', tone: 'yellow', dot: '◐' },
  none: { label: '❌ 沒寫', tone: 'red', dot: '○' },
};

function missingOf(note: DailyNote): string[] {
  return NOTE_FIELDS.filter((f) => !String(note[f.key] ?? '').trim()).map((f) => f.label);
}
function statusOf(note: DailyNote | undefined): Status {
  if (!note) return 'none';
  return missingOf(note).length === 0 ? 'done' : 'partial';
}
const byNumber = (a: Player, b: Player) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name);

type Filter = 'all' | Status | 'noComment';
type TeamNotesApi = ReturnType<typeof useTeamNotes>;

function CommentBox({ note, source }: { note: DailyNote; source: TeamNotesApi }) {
  const task = useTask();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note.coachComment);
  return (
    <div className="team-note-comment">
      <div>
        <strong>💬 教練評語：</strong>
        {note.coachComment ? note.coachComment : <span className="muted">尚無評語</span>}{' '}
        {!open && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
            ✏️ {note.coachComment ? '修改評語' : '寫評語'}
          </button>
        )}
      </div>
      {open && (
        <>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} aria-label="教練評語" autoFocus />
          <ActionFeedback action={task} />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={task.pending}
              onClick={async () => {
                const r = await task.run(() => source.comment(note.id, text), '評語已儲存。');
                if (r.ok) setOpen(false);
              }}
            >
              儲存評語
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** 教練：一次列出全隊某一天的筆記內容，馬上看出誰寫完、誰沒寫 */
export function TeamNotesView({ players, date, onDate, onOpenPlayer }: { players: Player[]; date: string; onDate: (d: string) => void; onOpenPlayer: (id: string) => void }) {
  const from = addDays(date, -6);
  const source = useTeamNotes(from, date);
  const [filter, setFilter] = useState<Filter>('all');
  const [compact, setCompact] = useState(false);
  const today = todayStr();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)), [date]);
  const noteOf = useMemo(() => {
    const m = new Map<string, DailyNote>();
    source.notes.forEach((n) => m.set(`${n.playerId}|${n.date}`, n));
    return (pid: string, d: string) => m.get(`${pid}|${d}`);
  }, [source.notes]);

  const rows = [...players].sort(byNumber).map((p) => {
    const note = noteOf(p.id, date);
    return { p, note, status: statusOf(note) };
  });
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const commented = rows.filter((r) => r.note?.coachComment).length;
  const shown = rows.filter((r) => filter === 'all' || (filter === 'noComment' ? r.note && !r.note.coachComment : r.status === filter));

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: `全部（${rows.length}）` },
    { id: 'none', label: `❌ 沒寫（${count('none')}）` },
    { id: 'partial', label: `✏️ 沒寫完（${count('partial')}）` },
    { id: 'done', label: `✅ 寫完（${count('done')}）` },
    { id: 'noComment', label: `💬 還沒評語（${rows.length - count('none') - commented}）` },
  ];

  return (
    <>
      <Card
        title={`${formatDate(date)} 全隊筆記`}
        icon="📋"
        actions={
          <div className="team-note-date">
            <button type="button" className="btn btn-sm" onClick={() => onDate(addDays(date, -1))} aria-label="前一天">
              ◀ 前一天
            </button>
            <input type="date" aria-label="選擇日期" value={date} max={today} onChange={(e) => e.target.value && onDate(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={date >= today} onClick={() => onDate(addDays(date, 1))} aria-label="後一天">
              後一天 ▶
            </button>
            {date !== today && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onDate(today)}>
                今天
              </button>
            )}
          </div>
        }
      >
        <div className="stat-row">
          <div className="stat">
            <span>✅ 寫完</span>
            <strong>{count('done')}</strong>
          </div>
          <div className="stat">
            <span>✏️ 沒寫完</span>
            <strong>{count('partial')}</strong>
          </div>
          <div className="stat">
            <span>❌ 沒寫</span>
            <strong>{count('none')}</strong>
          </div>
          <div className="stat">
            <span>💬 已評語</span>
            <strong>{commented}</strong>
          </div>
        </div>
        <div className="tabs team-note-filters" role="tablist">
          {filters.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
          精簡顯示（只看是否寫完）
        </label>
        <p className="muted small">「寫完」＝ 7 個欄位都有填。右上角的 7 個點是最近 7 天：● 寫完　◐ 沒寫完　○ 沒寫。</p>
      </Card>

      {source.error && (
        <Alert kind="error">
          {source.error}{' '}
          <button type="button" className="btn btn-sm" onClick={source.reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {source.loading ? (
        <Card>
          <LoadingState text="讀取全隊筆記中…" />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon="🎉" title="沒有符合的球員" />
        </Card>
      ) : (
        <div className={`team-notes ${compact ? 'is-compact' : ''}`}>
          {shown.map(({ p, note, status }) => {
            const missing = note ? missingOf(note) : [];
            return (
              <article key={p.id} className={`team-note status-${status}`}>
                <header className="team-note-head">
                  <button type="button" className="team-note-name" onClick={() => onOpenPlayer(p.id)} title="看這位球員的歷史筆記">
                    #{p.number} {p.name}
                  </button>
                  {p.grade && <span className="muted small">{p.grade}</span>}
                  <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                  <span className="team-note-dots" aria-label="最近 7 天">
                    {days.map((d) => {
                      const s = statusOf(noteOf(p.id, d));
                      return (
                        <span key={d} className={`dot dot-${s}`} title={`${formatDate(d)}：${STATUS[s].label}`}>
                          {STATUS[s].dot}
                        </span>
                      );
                    })}
                  </span>
                </header>
                {!note ? (
                  <p className="muted">這天沒有寫筆記。</p>
                ) : compact ? (
                  <p className="small">
                    {missing.length > 0 ? <span className="team-note-missing">缺：{missing.join('、')}</span> : '全部欄位都有填'}
                    {note.coachComment && ' ・💬 已評語'}
                  </p>
                ) : (
                  <>
                    <dl className="team-note-fields">
                      {NOTE_FIELDS.map((f) => (
                        <div key={f.key} className={String(note[f.key] ?? '').trim() ? '' : 'is-empty'}>
                          <dt>{f.label}</dt>
                          <dd>{String(note[f.key] ?? '').trim() || '（未填寫）'}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="chip-row">
                      {SELF_CHECK_ITEMS.map((i) => (
                        <Badge key={i.key} tone={note.selfChecks[i.key] ? 'green' : 'gray'}>
                          {note.selfChecks[i.key] ? '✓' : '—'} {i.label}
                        </Badge>
                      ))}
                    </div>
                    <CommentBox key={note.id + note.coachComment} note={note} source={source} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
