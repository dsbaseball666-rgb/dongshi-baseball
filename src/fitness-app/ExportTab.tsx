import { useMemo, useState } from 'react';
import type { Player } from '../types';
import { todayStr } from '../lib/date';
import { downloadCsv } from '../lib/csv';
import { Alert, Card } from '../components/UI';
import { detailRows, filterByDate, latestTable, summaryRows } from './stats';
import { DateRange } from './OverviewTab';
import type { TeamFitness } from './useTeamFitness';

/** 匯出成 CSV（Excel 可以直接打開，中文不會亂碼） */
export function ExportTab({ players, source }: { players: Player[]; source: TeamFitness }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const records = useMemo(() => filterByDate(source.records, from, to), [source.records, from, to]);
  const shown = players.filter((p) => showInactive || p.active);
  const shownIds = new Set(shown.map((p) => p.id));
  const suffix = `${from || '最早'}到${to || todayStr()}`;

  return (
    <Card title="匯出 Excel" icon="📤">
      <p className="muted">下載的是 CSV 檔，用 Excel 或 Google 試算表都可以直接打開。檔案裡有學生姓名與成績，請不要上傳到公開的地方。</p>
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <label className="fs-check">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 也包含已停用的球員（例如畢業生）
      </label>
      <div className="fs-export">
        <div>
          <h3>📋 最新成績總表</h3>
          <p className="muted small">每位球員一列，各項目的最新成績、檢測日期、和上一次比較。適合開會、交給學校。</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={shown.length === 0}
            onClick={() => {
              downloadCsv(`體能最新成績總表_${suffix}.csv`, summaryRows(shown, latestTable(records)));
              setDone(`已下載最新成績總表（${shown.length} 位球員）。`);
            }}
          >
            ⬇️ 下載總表（{shown.length} 位）
          </button>
        </div>
        <div>
          <h3>📚 全部紀錄明細</h3>
          <p className="muted small">每一次檢測一列（日期、姓名、項目、成績、備註），可以在 Excel 自己篩選、做圖表。</p>
          {(() => {
            const list = records.filter((r) => shownIds.has(r.playerId));
            return (
              <button
                type="button"
                className="btn btn-primary"
                disabled={list.length === 0}
                onClick={() => {
                  downloadCsv(`體能檢測明細_${suffix}.csv`, detailRows(list, players));
                  setDone(`已下載全部紀錄明細（${list.length} 筆）。`);
                }}
              >
                ⬇️ 下載明細（{list.length} 筆）
              </button>
            );
          })()}
        </div>
      </div>
      {done && <Alert kind="success">{done}</Alert>}
    </Card>
  );
}
