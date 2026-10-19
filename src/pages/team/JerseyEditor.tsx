import { useState } from 'react';
import type { Player, Tournament } from '../../types';
import { useTask } from '../../store/DemoStore';
import { JERSEY_NUMBERS, jerseyOrder } from '../../sources/team';
import { ActionFeedback, Card } from '../../components/UI';

const GRADE_ORDER = ['九', '八', '七'];
const gradeRank = (p?: Player) => {
  const i = GRADE_ORDER.findIndex((g) => p?.grade.includes(g));
  return i < 0 ? 9 : i;
};

/**
 * 自動產生號碼：已經有號碼的不動；沒有的先沿用這位球員最近一場比賽的號碼（沒被別人用的話），
 * 剩下的依年級（九→七）給還沒人用的最小號碼（1～99，最後才用 0、00）。
 */
export function autoJerseys(t: Tournament, current: Record<string, string>, all: Tournament[], players: Player[]): Record<string, string> {
  const out = { ...current };
  const used = new Set(Object.values(out).filter(Boolean));
  const need = t.playerIds.filter((id) => !out[id]);
  // 比這場早（或同一天）的賽事，越近的越優先
  const previous = all.filter((x) => x.id !== t.id && x.startDate <= t.startDate).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  need.forEach((id) => {
    const last = previous.find((x) => x.jerseys?.[id])?.jerseys[id];
    if (last && !used.has(last)) {
      out[id] = last;
      used.add(last);
    }
  });
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const rest = need.filter((id) => !out[id]).sort((a, b) => gradeRank(byId[a]) - gradeRank(byId[b]) || (byId[a]?.name ?? '').localeCompare(byId[b]?.name ?? '', 'zh-TW'));
  const order = [...JERSEY_NUMBERS.slice(2), '0', '00'];
  rest.forEach((id) => {
    const no = order.find((n) => !used.has(n));
    if (no) {
      out[id] = no;
      used.add(no);
    }
  });
  return out;
}

export function JerseyEditor({ t, all, players, names, save, onDone }: {
  t: Tournament;
  all: Tournament[];
  players: Player[];
  names: Record<string, string>;
  save: (jerseys: Record<string, string>) => Promise<unknown>;
  onDone: () => void;
}) {
  const task = useTask();
  const [map, setMap] = useState<Record<string, string>>(() => ({ ...t.jerseys }));
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const ownerOf = (no: string) => Object.keys(map).find((id) => map[id] === no);
  // 打開時排一次（有號碼的依號碼，沒號碼的依年級排後面）；選號碼時列表不會跳動
  const [rows] = useState(() => t.playerIds.slice().sort((a, b) => {
    const na = t.jerseys[a], nb = t.jerseys[b];
    if (na && nb) return jerseyOrder(na) - jerseyOrder(nb);
    if (na || nb) return na ? -1 : 1;
    return gradeRank(byId[a]) - gradeRank(byId[b]);
  }));
  const done = t.playerIds.filter((id) => map[id]).length;

  return (
    <Card title="👕 安排球衣號碼" className="jersey-editor">
      <p className="muted small">
        號碼只用在這場賽事，平常的頁面不會出現。每個號碼只能給一位球員，已經被選走的號碼會標出是誰。已編號 {done} / {t.playerIds.length} 位。
      </p>
      <div className="check-tools">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setMap((m) => autoJerseys(t, m, all, players))}>
          ⚡ 自動產生號碼（沒號碼的才會產生）
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm('清除這場賽事全部的號碼？') && setMap({})}>
          清除全部
        </button>
      </div>
      <div className="jersey-list">
        {rows.map((id) => {
          const p = byId[id];
          return (
            <label key={id} className={`jersey-row ${map[id] ? 'has-no' : ''}`}>
              <select value={map[id] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [id]: e.target.value }))} aria-label={`${names[id] ?? p?.name ?? ''} 的球衣號碼`}>
                <option value="">— 號碼</option>
                {JERSEY_NUMBERS.map((no) => {
                  const owner = ownerOf(no);
                  const other = owner && owner !== id;
                  return (
                    <option key={no} value={no} disabled={!!other}>
                      {no}
                      {other ? `（${names[owner] ?? byId[owner]?.name ?? ''}）` : ''}
                    </option>
                  );
                })}
              </select>
              <span className="jersey-name">
                <strong>{names[id] ?? p?.name ?? '（已刪除的球員）'}</strong>
                {p && (
                  <span className="muted small">
                    {' '}
                    {[p.grade, p.position].filter(Boolean).join('・')}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={task.pending}
          onClick={async () => {
            const r = await task.run(() => save(map), '已儲存球衣號碼。');
            if (r.ok) onDone();
          }}
        >
          💾 儲存號碼
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={task.pending}>
          取消
        </button>
      </div>
    </Card>
  );
}
