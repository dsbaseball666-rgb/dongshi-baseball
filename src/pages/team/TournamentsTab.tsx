import { useMemo, useState } from 'react';
import type { Game, Player, Tournament, TournamentKind } from '../../types';
import { useTask } from '../../store/DemoStore';
import { usePlayers } from '../../sources/hooks';
import { gameResult, money, shortDate, TOURNAMENT_KINDS, tournamentStatus, useTournaments, type GameInput, type TournamentInput } from '../../sources/team';
import { todayStr } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

type Data = ReturnType<typeof useTournaments>;

const KIND_TONE: Record<string, 'yellow' | 'blue' | 'green' | 'gray'> = { 盃賽: 'yellow', 聯賽: 'blue', 友誼賽: 'green', 其他: 'gray' };
const RESULT_TONE = { 勝: 'green', 敗: 'red', 和: 'gray' } as const;

const byNumber = (a: Player, b: Player) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name, 'zh-TW');

function record(games: Game[]) {
  const r = { 勝: 0, 敗: 0, 和: 0 };
  games.forEach((g) => {
    const x = gameResult(g);
    if (x) r[x]++;
  });
  return r;
}

function recordText(r: { 勝: number; 敗: number; 和: number }) {
  return `${r.勝} 勝 ${r.敗} 敗${r.和 ? ` ${r.和} 和` : ''}`;
}

function TournamentForm({ data, editing, onDone }: { data: Data; editing: Tournament | null; onDone: (id?: string) => void }) {
  const task = useTask();
  const { players } = usePlayers();
  const roster = useMemo(() => players.filter((p) => p.active || editing?.playerIds.includes(p.id)).sort(byNumber), [players, editing]);
  const [f, setF] = useState<TournamentInput>(
    editing
      ? { ...editing, fee: editing.fee ? String(editing.fee) : '' }
      : { name: '', kind: '盃賽', startDate: todayStr(), endDate: '', location: '', organizer: '', signupDeadline: '', fee: '', result: '', playerIds: [], note: '' },
  );
  const toggle = (id: string, on: boolean) => setF((x) => ({ ...x, playerIds: on ? [...x.playerIds, id] : x.playerIds.filter((v) => v !== id) }));
  return (
    <Card title={editing ? `修改賽事：${editing.name}` : '新增賽事'} icon="✏️">
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task.run(() => data.saveTournament(f), '已儲存賽事。');
          if (r.ok) onDone(r.result?.tournament.id);
        }}
      >
        <div className="grid-3 tight">
          <Field label="賽事名稱" required>
            <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例如：115 年度全國國中棒球聯賽" />
          </Field>
          <Field label="類別">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TournamentKind })}>
              {TOURNAMENT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="主辦單位">
            <input value={f.organizer} maxLength={60} onChange={(e) => setF({ ...f, organizer: e.target.value })} />
          </Field>
          <Field label="開始日期" required>
            <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
          <Field label="結束日期" hint="只有一天可以不填">
            <input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </Field>
          <Field label="地點">
            <input value={f.location} maxLength={60} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </Field>
          <Field label="報名截止日">
            <input type="date" value={f.signupDeadline} onChange={(e) => setF({ ...f, signupDeadline: e.target.value })} />
          </Field>
          <Field label="報名費（元）">
            <input value={f.fee} inputMode="numeric" maxLength={10} onChange={(e) => setF({ ...f, fee: e.target.value })} />
          </Field>
          <Field label="最後成績" hint="比賽結束後填，例如：冠軍、八強">
            <input value={f.result} maxLength={40} onChange={(e) => setF({ ...f, result: e.target.value })} />
          </Field>
        </div>
        <Field label="備註" hint="例如：集合時間、交通方式、要帶的裝備">
          <textarea value={f.note} rows={2} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <fieldset className="checks">
          <legend>參賽名單（已選 {f.playerIds.length} 位）</legend>
          <div className="check-tools">
            <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, playerIds: roster.filter((p) => p.active).map((p) => p.id) })}>
              ✅ 全隊
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setF({ ...f, playerIds: [] })}>
              全部取消
            </button>
          </div>
          {roster.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={f.playerIds.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
              {p.number && `#${p.number} `}
              {p.name}
            </label>
          ))}
        </fieldset>
        <ActionFeedback action={task} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={task.pending || !f.name.trim()}>
            💾 儲存賽事
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onDone()}>
            取消
          </button>
        </div>
      </form>
    </Card>
  );
}

function GameForm({ data, t, editing, onDone }: { data: Data; t: Tournament; editing: Game | null; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState<GameInput>(
    editing
      ? { ...editing, ourScore: editing.ourScore === null ? '' : String(editing.ourScore), oppScore: editing.oppScore === null ? '' : String(editing.oppScore) }
      : { tournamentId: t.id, date: todayStr() >= t.startDate && todayStr() <= t.endDate ? todayStr() : t.startDate, time: '', opponent: '', location: t.location, side: '', ourScore: '', oppScore: '', note: '' },
  );
  return (
    <form
      className="form game-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => data.saveGame(f), editing ? '已修改比賽。' : '已新增比賽。');
        if (r.ok) onDone();
      }}
    >
      <div className="grid-4">
        <Field label="日期" required>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="時間">
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
        <Field label="對手" required>
          <input value={f.opponent} maxLength={40} onChange={(e) => setF({ ...f, opponent: e.target.value })} />
        </Field>
        <Field label="場地">
          <input value={f.location} maxLength={60} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <Field label="先攻／後攻">
          <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as GameInput['side'] })}>
            <option value="">—</option>
            <option>先攻</option>
            <option>後攻</option>
          </select>
        </Field>
        <Field label="我方得分" hint="比賽後再填">
          <input value={f.ourScore} inputMode="numeric" maxLength={2} onChange={(e) => setF({ ...f, ourScore: e.target.value })} />
        </Field>
        <Field label="對手得分">
          <input value={f.oppScore} inputMode="numeric" maxLength={2} onChange={(e) => setF({ ...f, oppScore: e.target.value })} />
        </Field>
        <Field label="備註">
          <input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="例如：5 局提前結束" />
        </Field>
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending || !f.opponent.trim()}>
          💾 {editing ? '儲存比賽' : '新增比賽'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

function TournamentDetail({ data, t, coach, onEdit }: { data: Data; t: Tournament; coach: boolean; onEdit: () => void }) {
  const task = useTask();
  const [gameForm, setGameForm] = useState<Game | 'new' | null>(null);
  const games = data.games.filter((g) => g.tournamentId === t.id);
  const st = tournamentStatus(t, data.today || todayStr());
  const rec = record(games);
  return (
    <Card
      title={t.name}
      icon="🏆"
      actions={
        coach && (
          <>
            <button type="button" className="btn btn-sm" onClick={onEdit}>
              修改賽事
            </button>{' '}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={task.pending}
              onClick={() => window.confirm(`確定刪除「${t.name}」？\n它的 ${games.length} 場比賽紀錄也會一起刪除。`) && task.run(() => data.deleteTournament(t.id))}
            >
              刪除
            </button>
          </>
        )
      }
    >
      <div className="chip-row">
        <Badge tone={KIND_TONE[t.kind]}>{t.kind}</Badge>
        <Badge tone={st.tone}>{st.label}</Badge>
        {t.result && <Badge tone="purple">🏅 {t.result}</Badge>}
        {games.some((g) => gameResult(g)) && <Badge tone="gray">{recordText(rec)}</Badge>}
      </div>
      <ul className="plain-list tournament-info">
        <li>
          📅 {shortDate(t.startDate)}
          {t.endDate && t.endDate !== t.startDate && `～${shortDate(t.endDate)}`}
        </li>
        {t.location && <li>📍 {t.location}</li>}
        {t.organizer && <li>🏛️ 主辦：{t.organizer}</li>}
        {t.signupDeadline && (
          <li>
            📝 報名截止：{shortDate(t.signupDeadline)}
            {(data.today || todayStr()) <= t.signupDeadline && st.label === '即將開始' && <Badge tone="red">還沒截止</Badge>}
          </li>
        )}
        {coach && t.fee > 0 && <li>💰 報名費：{money(t.fee)} 元</li>}
      </ul>
      {t.note && <p className="pre-line small">{t.note}</p>}
      <h3 className="section-title">參賽名單（{t.playerIds.length} 位）</h3>
      {t.playerIds.length === 0 ? (
        <p className="muted small">還沒有設定參賽名單。</p>
      ) : (
        <div className="chip-row">
          {t.playerIds.map((id) => (
            <span key={id} className="badge badge-gray">
              {data.names[id] ?? '（已刪除的球員）'}
            </span>
          ))}
        </div>
      )}
      <div className="row-between">
        <h3 className="section-title">賽程與比分</h3>
        {coach && !gameForm && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setGameForm('new')}>
            ＋ 新增比賽
          </button>
        )}
      </div>
      {gameForm && <GameForm key={gameForm === 'new' ? 'new' : gameForm.id} data={data} t={t} editing={gameForm === 'new' ? null : gameForm} onDone={() => setGameForm(null)} />}
      <ActionFeedback action={task} />
      {games.length === 0 ? (
        <p className="muted small">還沒有比賽。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>對手</th>
                <th>比分</th>
                <th>場地</th>
                {coach && <th></th>}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const res = gameResult(g);
                return (
                  <tr key={g.id}>
                    <td className="nowrap">
                      {shortDate(g.date)}
                      {g.time && <div className="muted small">{g.time}</div>}
                    </td>
                    <td>
                      <strong>{g.opponent}</strong>
                      {g.side && <div className="muted small">{g.side}</div>}
                    </td>
                    <td className="nowrap">
                      {res ? (
                        <>
                          <Badge tone={RESULT_TONE[res]}>{res}</Badge> {g.ourScore} : {g.oppScore}
                        </>
                      ) : (
                        <span className="muted">尚未比賽</span>
                      )}
                      {g.note && <div className="muted small">{g.note}</div>}
                    </td>
                    <td>{g.location}</td>
                    {coach && (
                      <td className="nowrap">
                        <button type="button" className="btn btn-sm" onClick={() => setGameForm(g)}>
                          修改
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={task.pending}
                          onClick={() => window.confirm(`確定刪除對 ${g.opponent} 的比賽？`) && task.run(() => data.deleteGame(g.id))}
                        >
                          刪除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function TournamentsTab({ coach }: { coach: boolean }) {
  const data = useTournaments();
  const [kind, setKind] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Tournament | 'new' | null>(null);
  const today = data.today || todayStr();
  const list = data.tournaments.filter((t) => !kind || t.kind === kind);
  const all = record(data.games.filter((g) => list.some((t) => t.id === g.tournamentId)));
  const open = data.tournaments.find((t) => t.id === openId);

  if (data.loading)
    return (
      <Card>
        <LoadingState text="讀取賽事…" />
      </Card>
    );
  return (
    <>
      {data.error && <Alert kind="error">{data.error}</Alert>}
      {form && (
        <TournamentForm
          key={form === 'new' ? 'new' : form.id}
          data={data}
          editing={form === 'new' ? null : form}
          onDone={(id) => {
            setForm(null);
            if (id) setOpenId(id);
          }}
        />
      )}
      {open && !form && <TournamentDetail key={open.id} data={data} t={open} coach={coach} onEdit={() => setForm(open)} />}
      <Card
        title="全部賽事"
        icon="🗓️"
        actions={
          coach && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm('new')}>
              ＋ 新增賽事
            </button>
          )
        }
      >
        <div className="check-tools">
          {['', ...TOURNAMENT_KINDS].map((k) => (
            <button key={k || 'all'} type="button" className={`tab ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
              {k || '全部'}
            </button>
          ))}
          {all.勝 + all.敗 + all.和 > 0 && <span className="muted small">累計戰績：{recordText(all)}</span>}
        </div>
        {list.length === 0 ? (
          <EmptyState icon="🏆" title="還沒有賽事" hint={coach ? '按「新增賽事」把盃賽、聯賽加進來，再一場一場新增賽程與比分。' : undefined} />
        ) : (
          <div className="tournament-list">
            {list.map((t) => {
              const st = tournamentStatus(t, today);
              const games = data.games.filter((g) => g.tournamentId === t.id);
              const r = record(games);
              const next = games.find((g) => !gameResult(g) && g.date >= today);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tournament-item ${openId === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setForm(null);
                    setOpenId(openId === t.id ? null : t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <div className="row-between">
                    <strong>{t.name}</strong>
                    <span className="chip-row">
                      <Badge tone={KIND_TONE[t.kind]}>{t.kind}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </span>
                  </div>
                  <div className="muted small">
                    📅 {shortDate(t.startDate)}
                    {t.endDate !== t.startDate && `～${shortDate(t.endDate)}`}
                    {t.location && `　📍 ${t.location}`}
                  </div>
                  <div className="small">
                    {games.length > 0 ? `${games.length} 場・${recordText(r)}` : '還沒有賽程'}
                    {t.result && `　🏅 ${t.result}`}
                    {next && `　下一場：${shortDate(next.date)}${next.time ? ' ' + next.time : ''} 對 ${next.opponent}`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
