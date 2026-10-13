import { useState } from 'react';
import { useAction, useStore } from '../../store/DemoStore';
import { resolveSyncError } from '../../store/actions';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime, todayStr } from '../../lib/date';
import { getFitnessItem } from '../../lib/fitness';
import { goalProgress } from '../../lib/progress';
import { Alert, Badge, Card, EmptyState, ActionFeedback } from '../../components/UI';

export function LogsAdmin() {
  const { db } = useStore();
  const [kw, setKw] = useState('');
  const logs = db.auditLogs.filter((l) => !kw || `${l.action}${l.detail}${l.actorName}${l.target}`.includes(kw));
  return (
    <Card title="重要操作紀錄" icon="🗂️" actions={<input aria-label="搜尋紀錄" placeholder="搜尋…" value={kw} onChange={(e) => setKw(e.target.value)} />}>
      {logs.length === 0 ? (
        <EmptyState title="沒有符合的操作紀錄" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>操作者</th>
                <th>動作</th>
                <th>對象</th>
                <th>內容</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{formatDateTime(l.at)}</td>
                  <td className="nowrap">{l.actorName}</td>
                  <td className="nowrap">{l.action}</td>
                  <td>{l.target}</td>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ExportAdmin() {
  const { db } = useStore();
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? pid;
  const stamp = todayStr();
  const exports = [
    { label: '球員名單', file: 'players', rows: () => db.players.map((p) => ({ 編號: p.id, 姓名: p.name, 背號: p.number, 年級: p.grade, 位置: p.position, 狀態: p.active ? '啟用' : '停用' })) },
    {
      label: '每日筆記',
      file: 'daily-notes',
      rows: () => db.notes.map((n) => ({ 球員: name(n.playerId), 日期: n.date, 訓練內容: n.training, 學到: n.learned, 改進: n.improve, 明日準備: n.tomorrowPrep, 短期目標: n.shortGoal, 中期目標: n.midGoal, 長期目標: n.longGoal, 教練評語: n.coachComment, 建立時間: n.createdAt, 更新時間: n.updatedAt })),
    },
    {
      label: '目標與進度',
      file: 'goals',
      rows: () => db.goals.map((g) => ({ 球員: name(g.playerId), 類型: g.term, 目標: g.content, 完成條件: g.criteria, 開始: g.startDate, 期限: g.dueDate, 狀態: g.status, 進度百分比: goalProgress(g).percent })),
    },
    {
      label: '體能檢測',
      file: 'fitness-tests',
      rows: () => db.fitness.map((f) => ({ 球員: name(f.playerId), 日期: f.date, 項目: getFitnessItem(f.item).label, 數值: f.value, 單位: f.unit, 備註: f.note, 建立者: f.createdBy, 建立時間: f.createdAt })),
    },
    {
      label: '任務完成紀錄',
      file: 'task-completions',
      rows: () => db.completions.map((c) => ({ 球員: name(c.playerId), 任務: db.tasks.find((t) => t.id === c.taskId)?.title, 期間: c.periodKey, 狀態: c.status, 回報: c.submittedAt, 審核者: c.reviewedBy, 領取: c.claimedAt })),
    },
    { label: '操作紀錄', file: 'audit-logs', rows: () => db.auditLogs.map((l) => ({ 時間: l.at, 操作者: l.actorName, 動作: l.action, 對象: l.target, 內容: l.detail })) },
  ];
  return (
    <Card title="匯出球隊紀錄（CSV）" icon="📤">
      <Alert kind="warn">匯出的檔案包含球員個人資料，請妥善保管，不要上傳到公開的地方。目前匯出的是本機示範資料。</Alert>
      <div className="quick-grid">
        {exports.map((x) => (
          <button key={x.file} type="button" className="quick-tile" onClick={() => downloadCsv(`${x.file}-${stamp}.csv`, x.rows())}>
            <span className="quick-icon" aria-hidden>
              📄
            </span>
            {x.label}
          </button>
        ))}
      </div>
      <p className="muted small">CSV 檔可以用 Excel 或 Google 試算表開啟。</p>
    </Card>
  );
}

export function SyncAdmin() {
  const { db, user, simulateFailure, setSimulateFailure, resetDemo } = useStore();
  const action = useAction();
  const errors = db.syncErrors;
  return (
    <>
      <Card title="連線狀態" icon="🔌">
        <p>
          目前模式：<Badge tone="yellow">示範模式（未連線）</Badge>。第二階段設定 Apps Script 網址後，這裡會顯示真正的同步錯誤。
        </p>
        <label className="check">
          <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
          模擬連線失敗（測試用：開啟後所有儲存操作都會失敗並顯示錯誤，資料不會被改變）
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('確定要把所有示範資料恢復成初始狀態嗎？你在這台裝置上做的變更都會被清除。')) resetDemo();
            }}
          >
            重設示範資料
          </button>
        </div>
      </Card>
      <Card title={`同步錯誤紀錄（未處理 ${errors.filter((e) => !e.resolved).length}）`} icon="🧯">
        <ActionFeedback action={action} />
        {errors.length === 0 ? (
          <EmptyState icon="✅" title="沒有同步錯誤" hint="可以開啟上方「模擬連線失敗」來測試錯誤畫面。" />
        ) : (
          <ul className="plain-list">
            {errors.map((e) => (
              <li key={e.id} className="row-between">
                <span>
                  {e.resolved ? <Badge tone="gray">已處理</Badge> : <Badge tone="red">未處理</Badge>} <strong>{e.operation}</strong>：{e.message}
                  <div className="muted small">{formatDateTime(e.at)}</div>
                </span>
                {!e.resolved && (
                  <button type="button" className="btn btn-sm" disabled={action.pending} onClick={() => action.run('標記錯誤已處理', (d) => resolveSyncError(d, user, e.id), '已標記為處理完成。')}>
                    標記已處理
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
