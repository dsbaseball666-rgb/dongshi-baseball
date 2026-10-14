import { useMemo, useState } from 'react';
import type { FitnessItemKey, Player } from '../types';
import { formatDate } from '../lib/date';
import { FITNESS_ITEMS, getFitnessItem } from '../lib/fitness';
import { Badge, Card, EmptyState, Field } from '../components/UI';
import { LineImageButton } from '../components/LineImage';
import { diffText, filterByDate, latestTable, rankItem, shortValue, type RankMode } from './stats';
import { rankingImage } from './images';
import type { TeamFitness } from './useTeamFitness';

const MEDALS = ['🥇', '🥈', '🥉'];

export function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="fs-filters">
      <Field label="從（日期）">
        <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label="到（日期）">
        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </Field>
      {(from || to) && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          清除日期（看全部）
        </button>
      )}
    </div>
  );
}

export const rangeText = (from: string, to: string) => (from || to ? `${from ? formatDate(from) : '最早'} ～ ${to ? formatDate(to) : '最新'}` : '全部紀錄');

/** 全隊總覽：每位球員各項目的最新成績；排行：單一項目的名次或進步幅度 */
export function OverviewTab({ players, source, onOpenPlayer }: { players: Player[]; source: TeamFitness; onOpenPlayer: (id: string) => void }) {
  const [view, setView] = useState<'table' | 'rank'>('table');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [item, setItem] = useState<FitnessItemKey>('pushup');
  const [rankMode, setRankMode] = useState<RankMode>('latest');

  const records = useMemo(() => filterByDate(source.records, from, to), [source.records, from, to]);
  const table = useMemo(() => latestTable(records), [records]);
  const shown = useMemo(() => players.filter((p) => showInactive || p.active), [players, showInactive]);
  const ranking = useMemo(() => rankItem(shown, table, item, rankMode), [shown, table, item, rankMode]);
  const lastDate = records.reduce((m, r) => (r.date > m ? r.date : m), '');
  const testedPlayers = shown.filter((p) => table[p.id]).length;
  const def = getFitnessItem(item);

  return (
    <>
      <Card>
        <div className="fs-stats">
          <div>
            <strong>{records.length}</strong>
            <span className="muted small">筆檢測紀錄</span>
          </div>
          <div>
            <strong>
              {testedPlayers} / {shown.length}
            </strong>
            <span className="muted small">位球員有紀錄</span>
          </div>
          <div>
            <strong>{lastDate ? formatDate(lastDate) : '—'}</strong>
            <span className="muted small">最近一次檢測</span>
          </div>
        </div>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <label className="fs-check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 也顯示已停用的球員（例如畢業生）
        </label>
      </Card>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'table'} className={`tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>
          📋 全隊總表
        </button>
        <button type="button" role="tab" aria-selected={view === 'rank'} className={`tab ${view === 'rank' ? 'active' : ''}`} onClick={() => setView('rank')}>
          🏅 項目排行
        </button>
      </div>

      {view === 'table' ? (
        <Card title="全隊最新成績" icon="📋">
          <p className="muted small">每格是這段期間「最新一次」的成績；▲ 綠色代表比上一次進步、▼ 紅色代表退步。點姓名可以看個人紀錄。</p>
          {shown.length === 0 ? (
            <EmptyState title="沒有球員" hint="請先到冒險筆記本的教練後台新增球員。" />
          ) : (
            <div className="table-wrap fs-table-wrap">
              <table className="fs-table">
                <thead>
                  <tr>
                    <th>背號</th>
                    <th>姓名</th>
                    {FITNESS_ITEMS.map((d) => (
                      <th key={d.key}>
                        {d.label}
                        <span className="muted small">（{d.kind === 'time' ? '分:秒' : d.unit}）</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number ? `#${p.number}` : ''}</td>
                      <td className="nowrap">
                        <button type="button" className="link-btn" onClick={() => onOpenPlayer(p.id)}>
                          {p.name}
                        </button>
                        {!p.active && <Badge>停用</Badge>}
                      </td>
                      {FITNESS_ITEMS.map((d) => {
                        const c = table[p.id]?.[d.key];
                        if (!c) return <td key={d.key} className="muted">—</td>;
                        const tone = c.diff === null || c.diff === 0 ? '' : c.diff > 0 ? 'fs-up' : 'fs-down';
                        return (
                          <td key={d.key} className={`nowrap ${tone}`} title={`${c.record.date}${c.prev ? `｜上一次 ${shortValue(d.key, c.prev.value)}（${diffText(d.key, c.prev.value, c.record.value)}）` : ''}`}>
                            {shortValue(d.key, c.record.value).replace(` ${d.unit}`, '')}
                            {c.diff !== null && c.diff !== 0 && <span className="fs-arrow">{c.diff > 0 ? '▲' : '▼'}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* 手機：一位球員一張卡片，不用左右滑表格 */}
          <div className="fs-cards">
            {shown.map((p) => (
              <button key={p.id} type="button" className="fs-card" onClick={() => onOpenPlayer(p.id)}>
                <span className="fs-card-name">
                  {p.number ? `#${p.number} ` : ''}
                  {p.name}
                  {!p.active && <Badge>停用</Badge>}
                  <span className="fs-card-go">看個人 ›</span>
                </span>
                <span className="fs-card-grid">
                  {FITNESS_ITEMS.map((d) => {
                    const c = table[p.id]?.[d.key];
                    const tone = !c || c.diff === null || c.diff === 0 ? '' : c.diff > 0 ? 'fs-up' : 'fs-down';
                    return (
                      <span key={d.key} className={`fs-card-cell ${tone}`}>
                        <small>{d.label}</small>
                        {c ? (
                          <b>
                            {shortValue(d.key, c.record.value)}
                            {c.diff !== null && c.diff !== 0 && <span className="fs-arrow">{c.diff > 0 ? '▲' : '▼'}</span>}
                          </b>
                        ) : (
                          <b className="muted">—</b>
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card
          title={`${def.label}${rankMode === 'progress' ? ' 進步排行' : ' 排行榜'}`}
          icon="🏅"
        >
          <div className="grid-2 tight">
            <Field label="檢測項目">
              <select value={item} onChange={(e) => setItem(e.target.value as FitnessItemKey)}>
                {FITNESS_ITEMS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.group}・{d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="排行方式">
              <select value={rankMode} onChange={(e) => setRankMode(e.target.value as RankMode)}>
                <option value="latest">最新成績（{def.better === 'higher' ? '越高越前面' : '越快越前面'}）</option>
                <option value="progress">進步幅度（和自己上一次比）</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <LineImageButton key={`${item}-${rankMode}-${from}-${to}`} make={() => rankingImage(item, rankMode, ranking, rangeText(from, to))} filename={`${def.label}排行.png`} title={`${def.label}排行`} disabled={ranking.length === 0} />
          </div>
          {ranking.length === 0 ? (
            <EmptyState icon="📭" title={rankMode === 'progress' ? '這段期間沒有人測過兩次以上，還不能比較進步' : '這段期間沒有這個項目的紀錄'} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>名次</th>
                    <th className="hide-sm">背號</th>
                    <th>姓名</th>
                    <th>成績</th>
                    <th className="hide-sm">日期</th>
                    <th>和上一次比</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.player.id} className={r.rank === 1 ? 'fs-first' : ''}>
                      <td className="nowrap">
                        <strong>
                          {r.rank <= 3 ? `${MEDALS[r.rank - 1]} ` : ''}
                          {r.rank}
                        </strong>
                      </td>
                      <td className="hide-sm">{r.player.number ? `#${r.player.number}` : ''}</td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => onOpenPlayer(r.player.id)}>
                          {r.player.name}
                        </button>
                      </td>
                      <td className="nowrap">{shortValue(item, r.cell.record.value)}</td>
                      <td className="nowrap hide-sm">{r.cell.record.date}</td>
                      <td className="nowrap">
                        {r.cell.prev ? (
                          <Badge tone={r.cell.diff! > 0 ? 'green' : r.cell.diff! < 0 ? 'red' : 'gray'}>{diffText(item, r.cell.prev.value, r.cell.record.value)}</Badge>
                        ) : (
                          <span className="muted small">第一次</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
