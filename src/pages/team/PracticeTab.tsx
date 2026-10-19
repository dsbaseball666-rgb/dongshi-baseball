import { useState } from 'react';
import type { PracticeDay } from '../../types';
import { useTask } from '../../store/DemoStore';
import { addDays, todayStr } from '../../lib/date';
import { mondayOf, practiceNoticeText, PRACTICE_ICONS, PRACTICE_TYPES, shortDate, usePractice, type PracticeInput } from '../../sources/team';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingCard } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';
import { WeekNav } from './WeekNav';
import { practiceImage } from './images';

const TYPE_TONE: Record<string, 'green' | 'gray' | 'yellow' | 'blue'> = { 練球: 'green', 休息: 'gray', 比賽: 'yellow', 其他: 'blue' };

const blank = (date: string): PracticeInput => ({ date, type: '', startTime: '', endTime: '', location: '', content: '', note: '' });
const toInput = (date: string, d?: PracticeDay): PracticeInput =>
  d ? { date, type: d.type, startTime: d.startTime, endTime: d.endTime, location: d.location, content: d.content, note: d.note } : blank(date);

function WeekEditor({ monday, days, save, onDone }: { monday: string; days: PracticeDay[]; save: (d: PracticeInput[]) => Promise<void>; onDone: () => void }) {
  const task = useTask();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [rows, setRows] = useState<PracticeInput[]>(() => dates.map((d) => toInput(d, days.find((x) => x.date === d))));
  const set = (i: number, patch: Partial<PracticeInput>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const lastWeek = days.filter((d) => d.date < monday);
  const copyLastWeek = () => setRows(dates.map((d) => toInput(d, lastWeek.find((x) => x.date === addDays(d, -7)))));
  const template = () =>
    setRows(dates.map((d, i) => (i < 5 ? { ...blank(d), type: '練球', startTime: '16:00', endTime: '18:00', location: '校內球場' } : { ...blank(d), type: '休息' })));
  return (
    <Card title={`編輯 ${shortDate(monday)}～${shortDate(addDays(monday, 6))}`} icon="✏️">
      <div className="check-tools">
        <button type="button" className="btn btn-sm" onClick={copyLastWeek} disabled={lastWeek.length === 0}>
          📄 複製上週的安排
        </button>
        <button type="button" className="btn btn-sm" onClick={template}>
          ⚡ 快速填入：週一～五練球 16:00–18:00、週末休息
        </button>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task.run(() => save(rows), '已儲存這一週的練球通知。');
          if (r.ok) onDone();
        }}
      >
        {rows.map((r, i) => (
          <fieldset key={r.date} className="practice-edit">
            <legend>
              <strong>{shortDate(r.date)}</strong>
            </legend>
            <div className="practice-edit-grid">
              <label className="field">
                <span className="field-label">安排</span>
                <select value={r.type} onChange={(e) => set(i, { type: e.target.value as PracticeInput['type'] })}>
                  <option value="">（未安排）</option>
                  {PRACTICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PRACTICE_ICONS[t]} {t}
                    </option>
                  ))}
                </select>
              </label>
              {r.type && r.type !== '休息' && (
                <>
                  <label className="field">
                    <span className="field-label">開始</span>
                    <input type="time" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">結束</span>
                    <input type="time" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">地點</span>
                    <input value={r.location} maxLength={40} onChange={(e) => set(i, { location: e.target.value })} placeholder="例如：校內球場" />
                  </label>
                  <label className="field practice-wide">
                    <span className="field-label">練習內容</span>
                    <input value={r.content} maxLength={300} onChange={(e) => set(i, { content: e.target.value })} placeholder="例如：守備、打擊、體能" />
                  </label>
                </>
              )}
              {r.type && (
                <label className="field practice-wide">
                  <span className="field-label">備註</span>
                  <input value={r.note} maxLength={200} onChange={(e) => set(i, { note: e.target.value })} placeholder={r.type === '休息' ? '例如：段考週、颱風假' : '例如：請帶釘鞋、穿白色練習褲'} />
                </label>
              )}
            </div>
          </fieldset>
        ))}
        <ActionFeedback action={task} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={task.pending}>
            💾 儲存這一週
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone} disabled={task.pending}>
            取消
          </button>
        </div>
      </form>
    </Card>
  );
}

export function PracticeTab({ coach }: { coach: boolean }) {
  const today = todayStr();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // 多讀上一週，讓「複製上週的安排」可以直接使用
  const practice = usePractice(addDays(monday, -7), addDays(monday, 6));
  const week = practice.days.filter((d) => d.date >= monday);
  const moveTo = (m: string) => {
    setEditing(false);
    setCopied(null);
    setMonday(m);
  };
  const copy = async () => {
    const text = practiceNoticeText(monday, week);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('✅ 已複製，可以直接貼到 LINE 群組。');
    } catch {
      setCopied(text);
    }
  };
  const restDays = week.filter((d) => d.type === '休息').length;
  const practiceDays = week.filter((d) => d.type === '練球').length;

  return (
    <>
      <Card>
        <WeekNav monday={monday} onMove={moveTo} />
        {!practice.loading && week.length > 0 && (
          <p className="muted small">
            這週練球 {practiceDays} 天、休息 {restDays} 天
          </p>
        )}
        {coach && !editing && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)} disabled={practice.loading}>
              ✏️ 編輯這一週
            </button>
            <button type="button" className="btn" onClick={copy} disabled={week.length === 0}>
              📋 複製 LINE 通知文字
            </button>
            <LineImageButton key={monday} make={() => practiceImage(monday, week)} filename={`一週練球通知-${monday}.png`} title="一週練球通知" disabled={week.length === 0} />
          </div>
        )}
        {copied &&
          (copied.startsWith('✅') ? (
            <Alert kind="success">{copied.slice(2)}</Alert>
          ) : (
            <textarea className="notice-text" readOnly value={copied} rows={10} onFocus={(e) => e.target.select()} aria-label="練球通知文字（請全選後複製）" />
          ))}
      </Card>
      {practice.error && <Alert kind="error">{practice.error}</Alert>}
      {practice.loading ? (
        <LoadingCard text="讀取練球通知…" />
      ) : editing ? (
        <WeekEditor monday={monday} days={practice.days} save={practice.save} onDone={() => setEditing(false)} />
      ) : week.length === 0 ? (
        <Card>
          <EmptyState icon="📅" title="這一週還沒有練球通知" hint={coach ? '按「編輯這一週」開始安排，可以複製上週或快速填入。' : '教練還沒有公布這一週的安排。'} />
        </Card>
      ) : (
        <div className="week-grid">
          {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
            const d = week.find((x) => x.date === date);
            return (
              <section key={date} className={`day-card ${date === today ? 'is-today' : ''} ${d ? 'type-' + d.type : 'type-none'}`}>
                <div className="day-head">
                  <strong>{shortDate(date)}</strong>
                  {date === today && <Badge tone="red">今天</Badge>}
                </div>
                {d ? (
                  <>
                    <div className="day-type">
                      <span aria-hidden>{PRACTICE_ICONS[d.type]}</span> <Badge tone={TYPE_TONE[d.type]}>{d.type}</Badge>
                      {d.startTime && (
                        <span className="nowrap">
                          {' '}
                          {d.startTime}
                          {d.endTime && `–${d.endTime}`}
                        </span>
                      )}
                    </div>
                    {d.location && <div className="small">📍 {d.location}</div>}
                    {d.content && <div className="small">📝 {d.content}</div>}
                    {d.note && <div className="small muted">💬 {d.note}</div>}
                  </>
                ) : (
                  <div className="muted small">（未安排）</div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
