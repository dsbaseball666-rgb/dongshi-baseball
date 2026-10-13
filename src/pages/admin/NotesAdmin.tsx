import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/DemoStore';
import { todayStr } from '../../lib/date';
import { Badge, Card, EmptyState, Field } from '../../components/UI';

export default function NotesAdmin() {
  const { db } = useStore();
  const [playerId, setPlayerId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyNoComment, setOnlyNoComment] = useState(false);
  const today = todayStr();
  const active = db.players.filter((p) => p.active);
  const missingToday = active.filter((p) => !db.notes.some((n) => n.playerId === p.id && n.date === today));

  const notes = db.notes
    .filter((n) => playerId === 'all' || n.playerId === playerId)
    .filter((n) => (!from || n.date >= from) && (!to || n.date <= to))
    .filter((n) => !onlyNoComment || !n.coachComment)
    .sort((a, b) => b.date.localeCompare(a.date));
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? pid;

  return (
    <>
      <Card title="今日尚未寫筆記" icon="⏰">
        {missingToday.length === 0 ? (
          <p>🎉 今天所有啟用中的球員都寫了筆記。</p>
        ) : (
          <div className="chip-row">
            {missingToday.map((p) => (
              <Badge key={p.id} tone="yellow">
                {p.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>
      <Card title="查看球員筆記" icon="📒">
        <div className="grid-4 tight">
          <Field label="球員">
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="all">全部球員</option>
              {db.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="起始日期">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="結束日期">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <label className="check align-end">
            <input type="checkbox" checked={onlyNoComment} onChange={(e) => setOnlyNoComment(e.target.checked)} />
            只看尚未評語
          </label>
        </div>
        {notes.length === 0 ? (
          <EmptyState icon="📭" title="沒有符合條件的筆記" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>球員</th>
                  <th>訓練內容</th>
                  <th>評語</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td className="nowrap">{n.date}</td>
                    <td className="nowrap">{name(n.playerId)}</td>
                    <td className="ellipsis-cell">{n.training}</td>
                    <td>{n.coachComment ? <Badge tone="green">已評語</Badge> : <Badge tone="yellow">未評語</Badge>}</td>
                    <td>
                      <Link className="btn btn-sm" to={`/notes?player=${n.playerId}&date=${n.date}`}>
                        查看／評語
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
