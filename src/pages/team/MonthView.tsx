import { useMemo, useState } from 'react';
import type { Game, PracticeDay, TeamEvent, Tournament, TrainingWeek } from '../../types';
import { useTask } from '../../store/DemoStore';
import { mondayOf, monthWeeks, PRACTICE_ICONS, shortDate, useEventsRange, useMonthTraining, usePractice, useTournaments } from '../../sources/team';
import { EVENT_CATEGORIES, EVENT_ICONS } from '../../sources/hub';
import { addDays, formatDateTime, nowIso, todayStr } from '../../lib/date';
import { renderCalendar, type CalendarCell } from '../../lib/noticeImage';
import { ActionFeedback, Alert, Badge, Card, Field, LoadingCard } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

type Tone = 'train' | 'off' | 'game' | 'event';
interface DayItem {
  icon: string;
  text: string;
  tone: Tone;
  /** 行程才有：可以刪除 */
  eventId?: string;
}
const TONE_COLOR: Record<Tone, string> = { train: '#1b5e20', off: '#5a5f78', game: '#8a5300', event: '#1f5fb5' };

/** 一天要顯示的全部東西：練球／休兵（只寫「練球」，不列時間和訓練內容）、賽事與比賽、行程 */
function dayItems(date: string, src: { weeks: Record<string, TrainingWeek | null>; practice: PracticeDay[]; tournaments: Tournament[]; games: Game[]; events: TeamEvent[] }): DayItem[] {
  const items: DayItem[] = [];
  const tw = src.weeks[mondayOf(date)];
  const day = tw?.days.find((d) => d.date === date);
  if (day) {
    if (day.off) items.push({ icon: '😴', text: '休兵', tone: 'off' });
    else items.push({ icon: '⚾', text: '練球', tone: 'train' });
  } else {
    // 這週還沒排訓練課表時，看「一週練球」
    const p = src.practice.find((x) => x.date === date);
    if (p) items.push({ icon: PRACTICE_ICONS[p.type] ?? '📌', text: p.type, tone: p.type === '休息' ? 'off' : 'train' });
  }
  // 賽事：有排比賽場次的，只在有比賽的那幾天顯示；聯賽一定只看場次（期間很長，不整段標）；
  // 還沒排場次的盃賽等，才用開始～結束日期顯示
  src.tournaments
    .filter((t) => {
      const games = src.games.filter((g) => g.tournamentId === t.id);
      if (games.length > 0 || t.kind === '聯賽') return games.some((g) => g.date === date);
      return t.startDate <= date && date <= (t.endDate || t.startDate);
    })
    .forEach((t) => items.push({ icon: '🏆', text: t.name, tone: 'game' }));
  src.games.filter((g) => g.date === date).forEach((g) => items.push({ icon: '⚾', text: `${g.time ? g.time + ' ' : ''}對 ${g.opponent}`, tone: 'game' }));
  src.events
    .filter((e) => e.date === date)
    .forEach((e) => items.push({ icon: EVENT_ICONS[e.category] ?? '📌', text: `${e.startTime ? e.startTime + ' ' : ''}${e.title}`, tone: 'event', eventId: e.id }));
  return items;
}

const monthLabel = (month: string) => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月`;
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 教練在某一天新增行程（例如段考、集訓、學校活動） */
function EventForm({ date, save, onDone }: { date: string; save: ReturnType<typeof useEventsRange>['saveEvent']; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState({ title: '', category: '其他', startTime: '', endTime: '', location: '', note: '' });
  return (
    <form
      className="form month-event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => save({ ...f, date, playerIds: [] }), '已新增行程。');
        if (r.ok) onDone();
      }}
    >
      <div className="grid-3 tight">
        <Field label="行程名稱" required>
          <input value={f.title} maxLength={40} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="例如：第二次段考、寒訓、校慶" />
        </Field>
        <Field label="類別">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EVENT_ICONS[c]} {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="地點">
          <input value={f.location} maxLength={40} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <Field label="開始時間（可不填）">
          <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </Field>
        <Field label="結束時間（可不填）">
          <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </Field>
        <Field label="備註">
          <input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending || !f.title.trim()}>
          💾 新增行程
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

export function MonthView({ coach }: { coach: boolean }) {
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const delTask = useTask();
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const from = weeks[0];
  const to = addDays(weeks[weeks.length - 1], 6);
  const training = useMonthTraining(month);
  const practice = usePractice(from, to);
  const tours = useTournaments();
  const events = useEventsRange(from, to);
  const loading = training.loading || practice.loading || tours.loading || events.loading;
  const error = training.error || practice.error || tours.error || events.error;

  const src = { weeks: training.weeks, practice: practice.days, tournaments: tours.tournaments, games: tours.games, events: events.events };
  const items = (date: string) => dayItems(date, src);
  const inMonth = (date: string) => date.slice(0, 7) === month;
  const move = (n: number) => {
    setMonth((m) => (n === 0 ? today.slice(0, 7) : shiftMonth(m, n)));
    setPicked(null);
    setAdding(false);
  };
  const pick = (date: string) => {
    setPicked(date);
    setAdding(false);
    setTimeout(() => document.querySelector('.month-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // 本月統計
  const monthDays = weeks.flatMap((w) => WEEKDAYS.map((_, i) => addDays(w, i))).filter(inMonth);
  const trainDays = monthDays.filter((d) => items(d).some((x) => x.tone === 'train' && x.icon !== '·')).length;
  const offDays = monthDays.filter((d) => items(d).some((x) => x.tone === 'off')).length;
  const gameDays = monthDays.filter((d) => items(d).some((x) => x.tone === 'game')).length;

  const makeImage = () => {
    const cal: CalendarCell[][] = weeks.map((w) =>
      WEEKDAYS.map((_, i) => {
        const date = addDays(w, i);
        const list = items(date);
        return {
          date,
          day: Number(date.slice(8)),
          inMonth: inMonth(date),
          muted: list.some((x) => x.tone === 'off'),
          lines: list.map((x) => ({ text: x.icon === '·' ? `・${x.text}` : `${x.icon} ${x.text}`, color: TONE_COLOR[x.tone], bold: x.tone === 'game' })),
        };
      }),
    );
    return renderCalendar({
      title: '📆 每月行程',
      subtitle: `東勢國中棒球隊　${monthLabel(month)}`,
      summary: `練球 ${trainDays} 天、休兵 ${offDays} 天${gameDays ? `、比賽 ${gameDays} 天` : ''}`,
      weeks: cal,
      footer: `東勢國中棒球隊・${formatDateTime(nowIso())} 產生`,
    });
  };

  const detail = picked ? items(picked) : [];
  return (
    <>
      <Card>
        <div className="row-between">
          <div className="tabs">
            <button type="button" className="btn btn-sm" onClick={() => move(-1)}>
              ← 上個月
            </button>
            <button type="button" className="btn btn-sm" onClick={() => move(0)} disabled={month === today.slice(0, 7)}>
              本月
            </button>
            <button type="button" className="btn btn-sm" onClick={() => move(1)}>
              下個月 →
            </button>
          </div>
          <strong className="month-title">{monthLabel(month)}</strong>
        </div>
        {!loading && (
          <p className="muted small">
            這個月：練球 {trainDays} 天、休兵 {offDays} 天{gameDays > 0 && `、比賽 ${gameDays} 天`}。{coach ? '點某一天可以看詳細內容、新增行程。' : '點某一天可以看詳細內容。'}
          </p>
        )}
        <div className="form-actions">
          <LineImageButton key={month + loading} make={makeImage} filename={`每月行程-${month}.png`} title={`${monthLabel(month)} 每月行程`} disabled={loading} />
        </div>
        <p className="muted small">每天的練球時間、休兵和各組訓練主題來自「每週安排」的訓練課表；比賽來自「賽事管理」。</p>
      </Card>
      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <LoadingCard text="讀取這個月的行程…" />
      ) : (
        <>
          {/* 電腦：月曆 */}
          <div className="month-grid" role="grid" aria-label={`${monthLabel(month)} 月曆`}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`month-dow ${i >= 5 ? 'weekend' : ''}`} role="columnheader">
                {d}
              </div>
            ))}
            {weeks.flatMap((w) =>
              WEEKDAYS.map((_, i) => {
                const date = addDays(w, i);
                const list = items(date);
                const off = list.some((x) => x.tone === 'off');
                return (
                  <button
                    key={date}
                    type="button"
                    role="gridcell"
                    className={`month-cell ${inMonth(date) ? '' : 'other'} ${off ? 'off' : ''} ${date === today ? 'today' : ''} ${date === picked ? 'picked' : ''} ${i >= 5 ? 'weekend' : ''}`}
                    onClick={() => pick(date)}
                    aria-label={`${shortDate(date)} ${list.map((x) => x.text).join('、')}`}
                  >
                    <span className="month-day">{Number(date.slice(8))}</span>
                    {inMonth(date) &&
                      list.slice(0, 5).map((x, k) => (
                        <span key={k} className={`month-item tone-${x.tone}`}>
                          {x.icon === '·' ? '・' : x.icon + ' '}
                          {x.text}
                        </span>
                      ))}
                    {inMonth(date) && list.length > 5 && <span className="month-item muted">…還有 {list.length - 5} 項</span>}
                  </button>
                );
              }),
            )}
          </div>
          {/* 手機：每天一列 */}
          <div className="month-agenda">
            {monthDays.map((date) => {
              const list = items(date);
              return (
                <button key={date} type="button" className={`agenda-day ${date === today ? 'today' : ''} ${list.some((x) => x.tone === 'off') ? 'off' : ''}`} onClick={() => pick(date)}>
                  <strong className="agenda-date">{shortDate(date)}</strong>
                  <span className="agenda-items">
                    {list.length === 0 ? (
                      <span className="muted small">—</span>
                    ) : (
                      list.map((x, k) => (
                        <span key={k} className={`month-item tone-${x.tone}`}>
                          {x.icon === '·' ? '・' : x.icon + ' '}
                          {x.text}
                        </span>
                      ))
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {picked && (
        <Card title={shortDate(picked)} icon="📌" className="month-detail">
          {detail.length === 0 ? (
            <p className="muted">這一天沒有安排。</p>
          ) : (
            <ul className="plain-list">
              {detail.map((x, k) => (
                <li key={k} className={`month-item tone-${x.tone}`}>
                  {x.icon === '·' ? '・' : x.icon + ' '}
                  {x.text}
                  {coach && x.eventId && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={delTask.pending}
                      onClick={() => window.confirm(`刪除行程「${x.text}」？`) && delTask.run(() => events.deleteEvent(x.eventId!), '已刪除行程。')}
                    >
                      刪除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {events.events
            .filter((e) => e.date === picked && (e.location || e.note))
            .map((e) => (
              <p key={e.id} className="small muted">
                {e.title}：{[e.location && `📍${e.location}`, e.note].filter(Boolean).join('　')}
              </p>
            ))}
          <ActionFeedback action={delTask} />
          {coach &&
            (adding ? (
              <EventForm date={picked} save={events.saveEvent} onDone={() => setAdding(false)} />
            ) : (
              <div className="form-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                  ＋ 新增行程
                </button>
                <Badge tone="gray">練球時間和訓練內容請到「每週安排」修改</Badge>
              </div>
            ))}
        </Card>
      )}
    </>
  );
}
