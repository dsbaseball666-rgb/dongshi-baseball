import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DailyNote } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import type { NoteInput } from '../store/actions';
import { useNotes, usePlayers } from '../sources/hooks';
import { SELF_CHECK_ITEMS } from '../data/selfChecks';
import { can } from '../lib/permissions';
import { formatDate, formatDateTime, todayStr } from '../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader } from '../components/UI';
import { TeamNotesView } from './TeamNotesView';

const TEXT_FIELDS: { key: keyof Omit<NoteInput, 'playerId' | 'date' | 'selfChecks'>; label: string; rows: number; required?: boolean; placeholder: string }[] = [
  { key: 'training', label: '當日訓練內容', rows: 3, required: true, placeholder: '例如：動態暖身、傳接球、打擊練習…' },
  { key: 'learned', label: '今日學到的事情', rows: 3, placeholder: '今天學到了什麼技巧或觀念？' },
  { key: 'improve', label: '今天需要改進的地方', rows: 3, placeholder: '哪裡還可以做得更好？' },
  { key: 'tomorrowPrep', label: '明日訓練準備', rows: 2, placeholder: '明天要帶什麼、要提早做什麼？' },
  { key: 'shortGoal', label: '短期目標', rows: 1, placeholder: '這週想達成的事' },
  { key: 'midGoal', label: '中期目標', rows: 1, placeholder: '這幾個月想達成的事' },
  { key: 'longGoal', label: '長期目標', rows: 1, placeholder: '這一季或更長期的目標' },
];

function emptyInput(playerId: string, date: string, note?: DailyNote): NoteInput {
  return {
    playerId,
    date,
    training: note?.training ?? '',
    learned: note?.learned ?? '',
    improve: note?.improve ?? '',
    tomorrowPrep: note?.tomorrowPrep ?? '',
    shortGoal: note?.shortGoal ?? '',
    midGoal: note?.midGoal ?? '',
    longGoal: note?.longGoal ?? '',
    selfChecks: { ...(note?.selfChecks ?? {}) },
  };
}

type NotesApi = ReturnType<typeof useNotes>;

function PlayerNoteForm({ playerId, date, note, source }: { playerId: string; date: string; note?: DailyNote; source: NotesApi }) {
  const { mode } = useStore();
  const task = useTask();
  const [form, setForm] = useState<NoteInput>(() => emptyInput(playerId, date, note));
  const set = (k: keyof NoteInput, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const where = mode === 'cloud' ? '已儲存到雲端' : '儲存在本機示範資料';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await task.run(() => source.save(form), note ? `筆記已更新（${where}）。` : `筆記已建立（${where}）。`);
  };

  return (
    <form onSubmit={submit} className="form">
      {note ? <Badge tone="green">這天已有筆記，可以繼續編輯</Badge> : <Badge tone="yellow">這天還沒有筆記</Badge>}
      {TEXT_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} required={f.required}>
          {f.rows > 1 ? (
            <textarea rows={f.rows} value={form[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} maxLength={1000} />
          ) : (
            <input value={form[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} maxLength={300} />
          )}
        </Field>
      ))}
      <fieldset className="checks">
        <legend>自我檢查項目</legend>
        {SELF_CHECK_ITEMS.map((i) => (
          <label key={i.key} className="check">
            <input
              type="checkbox"
              checked={!!form.selfChecks[i.key]}
              onChange={(e) => setForm((f) => ({ ...f, selfChecks: { ...f.selfChecks, [i.key]: e.target.checked } }))}
            />
            {i.label}
          </label>
        ))}
      </fieldset>
      <div className="coach-comment">
        <strong>💬 教練評語：</strong>
        {note?.coachComment ? (
          <span>
            {note.coachComment} <span className="muted small">— {note.coachCommentBy}</span>
          </span>
        ) : (
          <span className="muted">尚無評語</span>
        )}
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending}>
          {task.pending ? '儲存中…' : note ? '更新筆記' : '建立筆記'}
        </button>
      </div>
      {note && (
        <p className="muted small">
          建立：{formatDateTime(note.createdAt)}・最後更新：{formatDateTime(note.updatedAt)}
        </p>
      )}
    </form>
  );
}

function CoachNoteView({ note, source }: { note: DailyNote; source: NotesApi }) {
  const task = useTask();
  const [comment, setComment] = useState(note.coachComment);
  return (
    <div className="note-view">
      {TEXT_FIELDS.map((f) => (
        <div key={f.key} className="note-row">
          <span className="note-label">{f.label}</span>
          <p>{note[f.key] || <span className="muted">（未填寫）</span>}</p>
        </div>
      ))}
      <div className="note-row">
        <span className="note-label">自我檢查</span>
        <div className="chip-row">
          {SELF_CHECK_ITEMS.map((i) => (
            <Badge key={i.key} tone={note.selfChecks[i.key] ? 'green' : 'gray'}>
              {note.selfChecks[i.key] ? '✓' : '—'} {i.label}
            </Badge>
          ))}
        </div>
      </div>
      <p className="muted small">
        建立：{formatDateTime(note.createdAt)}・最後更新：{formatDateTime(note.updatedAt)}
      </p>
      <Field label="教練評語" hint="球員可以在自己的筆記中看到評語。">
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      </Field>
      <ActionFeedback action={task} />
      <button type="button" className="btn btn-primary" disabled={task.pending} onClick={() => task.run(() => source.comment(note.id, comment), '評語已儲存。')}>
        儲存評語
      </button>
    </div>
  );
}

export default function NotesPage() {
  const { user } = useStore();
  const [params, setParams] = useSearchParams();
  const isCoach = can(user, 'note.view.all');
  const { players, loading: playersLoading, error: playersError } = usePlayers();
  const activePlayers = players.filter((p) => p.active);
  const playerId = isCoach ? params.get('player') ?? activePlayers[0]?.id ?? '' : user?.playerId ?? '';
  const date = params.get('date') ?? todayStr();
  const [keyword, setKeyword] = useState('');
  // 教練預設看「全隊一覽」，一次看完每位球員這天寫了什麼
  const view = isCoach && params.get('view') !== 'player' ? 'team' : 'player';
  const source = useNotes(view === 'team' ? '' : playerId);

  const update = (next: { player?: string; date?: string; view?: 'team' | 'player' }) => {
    const p = new URLSearchParams(params);
    if (next.player !== undefined) p.set('player', next.player);
    if (next.date !== undefined) p.set('date', next.date);
    if (next.view !== undefined) p.set('view', next.view);
    setParams(p, { replace: true });
  };

  const note = source.notes.find((n) => n.playerId === playerId && n.date === date);
  const history = useMemo(() => {
    const kw = keyword.trim();
    return source.notes
      .filter((n) => !kw || [n.training, n.learned, n.improve, n.tomorrowPrep, n.coachComment].some((t) => t.includes(kw)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [source.notes, keyword]);

  return (
    <div className="page">
      <PageHeader icon="📒" title="每日棒球筆記本" subtitle={isCoach ? '查看球員筆記並撰寫評語' : '每天一筆，記錄訓練、心得與目標'} />
      {isCoach && (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'team'} className={`tab ${view === 'team' ? 'active' : ''}`} onClick={() => update({ view: 'team' })}>
            📋 全隊一覽
          </button>
          <button type="button" role="tab" aria-selected={view === 'player'} className={`tab ${view === 'player' ? 'active' : ''}`} onClick={() => update({ view: 'player' })}>
            👤 個別球員
          </button>
        </div>
      )}
      {view === 'team' ? (
        playersLoading ? (
          <Card>
            <LoadingState text="讀取球員名單…" />
          </Card>
        ) : (
          <>
            {playersError && <Alert kind="error">{playersError}</Alert>}
            <TeamNotesView players={activePlayers} date={date} onDate={(d) => update({ date: d })} onOpenPlayer={(id) => update({ player: id, view: 'player' })} />
          </>
        )
      ) : (
        <>
      {isCoach && (
        <Card>
          {playersError && <Alert kind="error">{playersError}</Alert>}
          {playersLoading ? (
            <LoadingState text="讀取球員名單…" />
          ) : (
            <Field label="選擇球員">
              <select value={playerId} onChange={(e) => update({ player: e.target.value })}>
                {activePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（#{p.number}）
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Card>
      )}
      {source.error && (
        <Alert kind="error">
          {source.error}{' '}
          <button type="button" className="btn btn-sm" onClick={source.reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {!playerId ? (
        !playersLoading && (
          <Card>
            <EmptyState title="沒有可顯示的球員" hint={isCoach ? '請先到教練後台新增球員。' : '此帳號沒有對應的球員資料，請聯絡教練。'} />
          </Card>
        )
      ) : source.loading ? (
        <Card>
          <LoadingState text="讀取筆記中…" />
        </Card>
      ) : (
        <div className="grid-2 notes-layout">
          <Card title={formatDate(date)} icon="🗓️" actions={<input type="date" aria-label="選擇日期" value={date} max={todayStr()} onChange={(e) => e.target.value && update({ date: e.target.value })} />}>
            {isCoach ? (
              note ? (
                <CoachNoteView key={note.id} note={note} source={source} />
              ) : (
                <EmptyState icon="📭" title="這位球員在這天沒有筆記" hint="可從右側的歷史紀錄選擇其他日期。" />
              )
            ) : (
              !source.error && <PlayerNoteForm key={`${playerId}-${date}`} playerId={playerId} date={date} note={note} source={source} />
            )}
          </Card>
          <Card title="歷史筆記" icon="📚">
            <Field label="搜尋關鍵字">
              <input value={keyword} placeholder="例如：牛棚、打擊" onChange={(e) => setKeyword(e.target.value)} />
            </Field>
            {history.length === 0 ? (
              <EmptyState icon="📭" title={keyword ? '找不到符合的筆記' : '還沒有任何筆記'} />
            ) : (
              <ul className="history-list">
                {history.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={`history-item ${n.date === date ? 'active' : ''}`} onClick={() => update({ date: n.date })}>
                      <strong>{formatDate(n.date)}</strong>
                      <span className="muted small ellipsis">{n.training}</span>
                      {n.coachComment && <Badge tone="blue">有評語</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
        </>
      )}
      {!isCoach && <Alert kind="info">同一天只會有一筆主紀錄，再次儲存會更新同一筆。教練評語只能由教練填寫。</Alert>}
    </div>
  );
}
