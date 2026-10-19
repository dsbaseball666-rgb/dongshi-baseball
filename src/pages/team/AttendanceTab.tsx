import { useEffect, useMemo, useState } from 'react';
import type { AttendanceStatus, Player } from '../../types';
import { useTask } from '../../store/DemoStore';
import { usePlayers } from '../../sources/hooks';
import { byNumber, ATTENDANCE_STATUSES, ATTENDANCE_TONE, PRACTICE_ICONS, PRESENT_STATUSES, shortDate, useAttendance, usePractice } from '../../sources/team';
import { addDays, todayStr } from '../../lib/date';
import { downloadCsv } from '../../lib/csv';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingCard, LoadingState } from '../../components/UI';
import { LineImageButton } from '../../components/LineImage';
import { attendanceImage } from './images';

type Draft = Record<string, { status: AttendanceStatus | ''; reason: string }>;


/* ───────── 點名 ───────── */
function RollCall({ players, onSaved }: { players: Player[]; onSaved: () => void }) {
  const [date, setDate] = useState(todayStr());
  const att = useAttendance(date, date);
  const practice = usePractice(date, date);
  const task = useTask();
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState(false);
  const [showReason, setShowReason] = useState(false);
  useEffect(() => {
    const d: Draft = {};
    att.records.forEach((r) => (d[r.playerId] = { status: r.status, reason: r.reason }));
    setDraft(d);
    setDirty(false);
  }, [att.records]);
  const set = (playerId: string, patch: Partial<Draft[string]>) => {
    setDraft((d) => ({ ...d, [playerId]: { ...(d[playerId] ?? { status: '', reason: '' }), ...patch } }));
    setDirty(true);
  };
  const allPresent = () => {
    setDraft((d) => {
      const next = { ...d };
      players.forEach((p) => {
        if (!next[p.id]?.status) next[p.id] = { status: '出席', reason: '' };
      });
      return next;
    });
    setDirty(true);
  };
  const day = practice.days[0];
  const counts = ATTENDANCE_STATUSES.map((s) => [s, players.filter((p) => draft[p.id]?.status === s).length] as const).filter(([, n]) => n > 0);
  const unmarked = players.filter((p) => !draft[p.id]?.status).length;

  return (
    <Card title="點名" icon="✅">
      <div className="grid-3 tight">
        <Field label="日期">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (dirty && !window.confirm('這一天的點名還沒儲存，確定要換日期嗎？')) return;
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </Field>
      </div>
      {day && (
        <p className="small">
          這天的安排：{PRACTICE_ICONS[day.type]} <strong>{day.type}</strong>
          {day.startTime && ` ${day.startTime}${day.endTime ? '–' + day.endTime : ''}`}
          {day.type === '休息' && <span className="warn-text">（休息日，通常不用點名）</span>}
        </p>
      )}
      {att.error && <Alert kind="error">{att.error}</Alert>}
      {att.loading ? (
        <LoadingState text="讀取點名紀錄…" />
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const records = players.map((p) => ({ playerId: p.id, status: draft[p.id]?.status ?? '', reason: draft[p.id]?.status && draft[p.id].status !== '出席' ? draft[p.id].reason : '' }));
            const r = await task.run(() => att.save(date, records), `已儲存 ${shortDate(date)} 的點名。`);
            if (r.ok) onSaved();
          }}
        >
          <div className="check-tools">
            <button type="button" className="btn btn-sm" onClick={allPresent}>
              ✅ 還沒點的全部設為出席
            </button>
            <span className="muted small">
              {counts.map(([s, n]) => `${s} ${n}`).join('、') || '還沒點名'}
              {unmarked > 0 && counts.length > 0 && `、未點 ${unmarked}`}
            </span>
          </div>
          <div className="roll-list">
            {players.map((p) => {
              const cur = draft[p.id] ?? { status: '', reason: '' };
              return (
                <div key={p.id} className={`roll-row ${cur.status ? '' : 'unmarked'}`}>
                  <div className="roll-name">
                    {p.number && <span className="muted">#{p.number} </span>}
                    <strong>{p.name}</strong>
                  </div>
                  <div className="roll-status" role="radiogroup" aria-label={`${p.name} 的出缺席`}>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={cur.status === s}
                        className={`status-btn ${cur.status === s ? 'on tone-' + ATTENDANCE_TONE[s] : ''}`}
                        onClick={() => set(p.id, { status: cur.status === s ? '' : s })}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {cur.status && cur.status !== '出席' && (
                    <input className="roll-reason" value={cur.reason} maxLength={100} placeholder="原因（可不填）" aria-label={`${p.name} 的原因`} onChange={(e) => set(p.id, { reason: e.target.value })} />
                  )}
                </div>
              );
            })}
          </div>
          <ActionFeedback action={task} />
          <button type="submit" className="btn btn-primary" disabled={task.pending || !dirty}>
            💾 儲存點名{dirty ? '' : '（沒有變更）'}
          </button>
          <div className="form-actions line-share">
            <LineImageButton
              key={date}
              make={() => attendanceImage(date, players, draft, showReason)}
              filename={`出缺席-${date}.png`}
              title={`出缺席紀錄 ${shortDate(date)}`}
              label={dirty ? '🖼️ 產生 LINE 圖片（請先儲存）' : '🖼️ 產生 LINE 圖片'}
              disabled={dirty || att.records.length === 0}
            />
            <label className="check">
              <input type="checkbox" checked={showReason} onChange={(e) => setShowReason(e.target.checked)} />
              圖片上顯示請假原因
            </label>
          </div>
        </form>
      )}
    </Card>
  );
}

/* ───────── 出席統計 ───────── */
function Stats({ players, version }: { players: Player[]; version: number }) {
  const today = todayStr();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const att = useAttendance(from, to);
  useEffect(() => {
    if (version) att.reload();
  }, [version]);
  const rows = useMemo(
    () =>
      players.map((p) => {
        const mine = att.records.filter((r) => r.playerId === p.id);
        const c = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, mine.filter((r) => r.status === s).length])) as Record<AttendanceStatus, number>;
        const present = mine.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
        return { p, c, total: mine.length, rate: mine.length ? Math.round((present / mine.length) * 100) : null };
      }),
    [players, att.records],
  );
  const days = new Set(att.records.map((r) => r.date)).size;
  const exportCsv = () =>
    downloadCsv(
      `出缺席統計-${from}-${to}.csv`,
      rows.map(({ p, c, total, rate }) => ({ 背號: p.number, 姓名: p.name, 年級: p.grade, ...c, 點名次數: total, 出席率: rate === null ? '' : rate + '%' })),
    );
  const exportDetail = () => {
    const name = Object.fromEntries(players.map((p) => [p.id, p.name]));
    downloadCsv(
      `出缺席明細-${from}-${to}.csv`,
      [...att.records].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ 日期: r.date, 姓名: name[r.playerId] ?? r.playerId, 狀態: r.status, 原因: r.reason, 點名者: r.updatedBy })),
    );
  };
  const quick = (n: number) => {
    setFrom(addDays(today, -(n - 1)));
    setTo(today);
  };

  return (
    <Card title="出席統計" icon="📊">
      <div className="check-tools">
        <button type="button" className="btn btn-sm" onClick={() => quick(7)}>
          近 7 天
        </button>
        <button type="button" className="btn btn-sm" onClick={() => quick(30)}>
          近 30 天
        </button>
        <button type="button" className="btn btn-sm" onClick={() => quick(90)}>
          近 90 天
        </button>
      </div>
      <div className="grid-3 tight">
        <Field label="從">
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label="到">
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
      </div>
      {att.error && <Alert kind="error">{att.error}</Alert>}
      {att.loading ? (
        <LoadingState text="計算中…" />
      ) : days === 0 ? (
        <EmptyState icon="📊" title="這段期間還沒有點名紀錄" />
      ) : (
        <>
          <p className="muted small">這段期間共點名 {days} 天。出席率＝（出席＋遲到＋早退）÷ 點名次數；請假也算在點名次數內。</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>球員</th>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th>出席率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, c, rate }) => (
                  <tr key={p.id}>
                    <td className="nowrap">
                      {p.number && <span className="muted">#{p.number} </span>}
                      {p.name}
                    </td>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <td key={s} className={c[s] && s !== '出席' ? 'strong' : 'muted'}>
                        {c[s] || '·'}
                      </td>
                    ))}
                    <td>{rate === null ? <span className="muted">—</span> : <Badge tone={rate >= 90 ? 'green' : rate >= 75 ? 'yellow' : 'red'}>{rate}%</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-sm" onClick={exportCsv}>
              ⬇️ 下載統計（Excel 可開）
            </button>
            <button type="button" className="btn btn-sm" onClick={exportDetail}>
              ⬇️ 下載每天明細
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

export function AttendanceTab() {
  const { players, loading, error } = usePlayers();
  const [version, setVersion] = useState(0);
  const active = useMemo(() => players.filter((p) => p.active).sort(byNumber), [players]);
  if (loading)
    return (
      <LoadingCard text="讀取球員名單…" />
    );
  if (error) return <Alert kind="error">{error}</Alert>;
  if (active.length === 0)
    return (
      <Card>
        <EmptyState icon="👥" title="還沒有在隊的球員" hint="請先到「教練後台 → 球員與帳號」新增球員。" />
      </Card>
    );
  return (
    <>
      <RollCall players={active} onSaved={() => setVersion((v) => v + 1)} />
      <Stats players={active} version={version} />
    </>
  );
}
