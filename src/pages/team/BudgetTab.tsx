import { useState, type ReactNode } from 'react';
import type { BudgetItem, MoneyType, Transaction } from '../../types';
import { useTask } from '../../store/DemoStore';
import { money, schoolYearOf, shortDate, useBudget, type BudgetItemInput, type TransactionInput } from '../../sources/team';
import { todayStr } from '../../lib/date';
import { downloadCsv } from '../../lib/csv';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingCard, ProgressBar } from '../../components/UI';

type Budget = ReturnType<typeof useBudget>;

function ItemForm({ budget, year, editing, onDone }: { budget: Budget; year: string; editing: BudgetItem | null; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState<BudgetItemInput>(
    editing ? { id: editing.id, year, type: editing.type, name: editing.name, amount: String(editing.amount), note: editing.note } : { year, type: '支出', name: '', amount: '', note: '' },
  );
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => budget.saveItem({ ...f, year }), editing ? '已修改預算項目。' : '已新增預算項目。');
        if (r.ok) onDone();
      }}
    >
      <div className="grid-4">
        <Field label="收支">
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as MoneyType })}>
            <option value="支出">支出（要花的錢）</option>
            <option value="收入">收入（預計收到的錢）</option>
          </select>
        </Field>
        <Field label="項目名稱" required>
          <input value={f.name} maxLength={30} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.type === '支出' ? '例如：球具、交通、比賽報名費' : '例如：學校補助、家長會、捐款'} />
        </Field>
        <Field label={f.type === '支出' ? '預算金額（元）' : '預計金額（元）'} required>
          <input value={f.amount} inputMode="numeric" maxLength={12} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="例如：30000" />
        </Field>
        <Field label="備註">
          <input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending || !f.name.trim() || !f.amount.trim()}>
          💾 {editing ? '儲存修改' : '新增項目'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

function TxForm({ budget, year, editing, onDone }: { budget: Budget; year: string; editing: Transaction | null; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState<TransactionInput>(
    editing
      ? { id: editing.id, year, date: editing.date, type: editing.type, itemId: editing.itemId, title: editing.title, amount: String(editing.amount), handler: editing.handler, note: editing.note }
      : { year, date: todayStr(), type: '支出', itemId: '', title: '', amount: '', handler: '', note: '' },
  );
  const items = budget.items.filter((i) => i.type === f.type);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => budget.saveTransaction({ ...f, year }), editing ? '已修改這筆收支。' : '已記下這筆收支。');
        if (r.ok) {
          if (editing) onDone();
          else setF({ ...f, title: '', amount: '', note: '' });
        }
      }}
    >
      <div className="grid-4">
        <Field label="日期" required>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="收支">
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as MoneyType, itemId: '' })}>
            <option value="支出">支出</option>
            <option value="收入">收入</option>
          </select>
        </Field>
        <Field label="預算項目">
          <select value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })}>
            <option value="">（未分類）</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="金額（元）" required>
          <input value={f.amount} inputMode="numeric" maxLength={12} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
      </div>
      <div className="grid-3 tight">
        <Field label="摘要" required>
          <input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.type === '支出' ? '例如：購買比賽用球 2 打' : '例如：家長會補助款'} />
        </Field>
        <Field label="經手人">
          <input value={f.handler} maxLength={20} onChange={(e) => setF({ ...f, handler: e.target.value })} />
        </Field>
        <Field label="備註（收據編號等）">
          <input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending || !f.title.trim() || !f.amount.trim()}>
          💾 {editing ? '儲存修改' : '記一筆'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

function usage(spent: number, amount: number): { tone: 'goal' | 'exp' | 'hp'; badge: ReactNode } {
  if (amount <= 0) return { tone: spent > 0 ? 'hp' : 'goal', badge: spent > 0 ? <Badge tone="red">沒有預算</Badge> : null };
  const pct = spent / amount;
  if (pct > 1) return { tone: 'hp', badge: <Badge tone="red">超支 {money(spent - amount)} 元</Badge> };
  if (pct >= 0.8) return { tone: 'exp', badge: <Badge tone="yellow">已用 {Math.round(pct * 100)}%</Badge> };
  return { tone: 'goal', badge: null };
}

export function BudgetTab() {
  const current = schoolYearOf(todayStr());
  const [year, setYear] = useState(current);
  const [newYear, setNewYear] = useState('');
  const budget = useBudget(year);
  const itemTask = useTask();
  const txTask = useTask();
  const [itemForm, setItemForm] = useState<BudgetItem | 'new' | null>(null);
  const [txEdit, setTxEdit] = useState<Transaction | null>(null);
  const [itemFilter, setItemFilter] = useState('');
  const years = Array.from(new Set([current, year, ...budget.years])).sort().reverse();

  const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amount, 0);
  const income = sum(budget.transactions.filter((t) => t.type === '收入'));
  const expense = sum(budget.transactions.filter((t) => t.type === '支出'));
  const expenseItems = budget.items.filter((i) => i.type === '支出');
  const incomeItems = budget.items.filter((i) => i.type === '收入');
  const expenseBudget = expenseItems.reduce((s, i) => s + i.amount, 0);
  const spentOf = (id: string) => sum(budget.transactions.filter((t) => t.itemId === id));
  const unclassified = (type: MoneyType) => sum(budget.transactions.filter((t) => t.type === type && !t.itemId));
  const itemName = Object.fromEntries(budget.items.map((i) => [i.id, i.name]));
  const shownTx = budget.transactions.filter((t) => !itemFilter || (itemFilter === '-' ? !t.itemId : t.itemId === itemFilter));

  const exportCsv = () =>
    downloadCsv(
      `收支明細-${year}.csv`,
      [...budget.transactions]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((t) => ({ 日期: t.date, 收支: t.type, 預算項目: itemName[t.itemId] ?? '未分類', 摘要: t.title, 收入: t.type === '收入' ? t.amount : '', 支出: t.type === '支出' ? t.amount : '', 經手人: t.handler, 備註: t.note })),
    );
  const exportSummary = () =>
    downloadCsv(`預算執行-${year}.csv`, [
      ...budget.items.map((i) => ({ 收支: i.type, 項目: i.name, 預算: i.amount, 實際: spentOf(i.id), 差額: i.amount - spentOf(i.id), 備註: i.note })),
      { 收支: '支出', 項目: '未分類', 預算: 0, 實際: unclassified('支出'), 差額: -unclassified('支出'), 備註: '' },
      { 收支: '收入', 項目: '未分類', 預算: 0, 實際: unclassified('收入'), 差額: -unclassified('收入'), 備註: '' },
    ]);

  return (
    <>
      <Card>
        <div className="grid-3 tight align-end">
          <Field label="年度">
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </Field>
          <Field label="新增其他年度" hint="例如：116學年度、2027 年">
            <input value={newYear} maxLength={20} onChange={(e) => setNewYear(e.target.value)} />
          </Field>
          <button
            type="button"
            className="btn"
            disabled={!newYear.trim()}
            onClick={() => {
              setYear(newYear.trim());
              setNewYear('');
            }}
          >
            切換到這個年度
          </button>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span>💵 收入合計</span>
            <strong className="money-in">{money(income)}</strong>
          </div>
          <div className="stat-card">
            <span>🧾 支出合計</span>
            <strong className="money-out">{money(expense)}</strong>
          </div>
          <div className={`stat-card ${income - expense < 0 ? 'warn' : ''}`}>
            <span>🏦 結餘（收入－支出）</span>
            <strong>{money(income - expense)}</strong>
          </div>
          <div className={`stat-card ${expense > expenseBudget && expenseBudget > 0 ? 'warn' : ''}`}>
            <span>📊 支出預算剩餘</span>
            <strong>{money(expenseBudget - expense)}</strong>
            <span className="muted small">預算 {money(expenseBudget)}</span>
          </div>
        </div>
      </Card>
      {budget.error && <Alert kind="error">{budget.error}</Alert>}
      {budget.loading ? (
        <LoadingCard text="讀取預算…" />
      ) : (
        <>
          <Card
            title="各項目預算控管"
            icon="📊"
            actions={
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setItemForm('new')}>
                ＋ 新增預算項目
              </button>
            }
          >
            {itemForm && <ItemForm key={itemForm === 'new' ? 'new' : itemForm.id} budget={budget} year={year} editing={itemForm === 'new' ? null : itemForm} onDone={() => setItemForm(null)} />}
            <ActionFeedback action={itemTask} />
            {budget.items.length === 0 && !itemForm ? (
              <EmptyState icon="💰" title={`${year} 還沒有預算項目`} hint="先新增支出項目（例如球具、交通、報名費）和各自的預算，記帳時選項目，系統會自動算出用了多少、還剩多少。" />
            ) : (
              <>
                {[
                  { type: '支出' as MoneyType, list: expenseItems, title: '支出項目', col: '已支出' },
                  { type: '收入' as MoneyType, list: incomeItems, title: '收入項目', col: '已收到' },
                ].map(({ type, list, title, col }) =>
                  list.length === 0 && unclassified(type) === 0 ? null : (
                    <div key={type}>
                      <h3 className="section-title">{title}</h3>
                      <div className="table-wrap">
                        <table className="budget-table">
                          <thead>
                            <tr>
                              <th>項目</th>
                              <th className="num">{type === '支出' ? '預算' : '預計'}</th>
                              <th className="num">{col}</th>
                              <th className="num">{type === '支出' ? '剩餘' : '還差'}</th>
                              <th>{type === '支出' ? '使用率' : '達成率'}</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((i) => {
                              const spent = spentOf(i.id);
                              const u = type === '支出' ? usage(spent, i.amount) : { tone: 'goal' as const, badge: null };
                              return (
                                <tr key={i.id}>
                                  <td>
                                    <strong>{i.name}</strong>
                                    {i.note && <div className="muted small">{i.note}</div>}
                                  </td>
                                  <td className="num">{money(i.amount)}</td>
                                  <td className="num">{money(spent)}</td>
                                  <td className={`num ${i.amount - spent < 0 && type === '支出' ? 'danger-text' : ''}`}>{money(i.amount - spent)}</td>
                                  <td className="usage-cell">
                                    <ProgressBar value={spent} max={i.amount || 1} tone={u.tone} label={i.amount ? `${Math.round((spent / i.amount) * 100)}%` : '—'} />
                                    {u.badge}
                                  </td>
                                  <td className="nowrap">
                                    <button type="button" className="btn btn-sm" onClick={() => setItemForm(i)}>
                                      修改
                                    </button>{' '}
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-ghost"
                                      disabled={itemTask.pending}
                                      onClick={() => window.confirm(`確定刪除預算項目「${i.name}」？`) && itemTask.run(() => budget.deleteItem(i.id), '已刪除預算項目。')}
                                    >
                                      刪除
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {unclassified(type) > 0 && (
                              <tr>
                                <td className="muted">（未分類）</td>
                                <td className="num muted">—</td>
                                <td className="num">{money(unclassified(type))}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ),
                )}
              </>
            )}
          </Card>

          <div id="tx-form" />
          <Card title={txEdit ? '修改收支' : '記一筆收支'} icon="✍️">
            <TxForm key={txEdit?.id ?? 'new-' + year} budget={budget} year={year} editing={txEdit} onDone={() => setTxEdit(null)} />
          </Card>

          <Card
            title={`收支明細（${shownTx.length} 筆）`}
            icon="📒"
            actions={
              <>
                <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={budget.transactions.length === 0}>
                  ⬇️ 下載明細
                </button>{' '}
                <button type="button" className="btn btn-sm" onClick={exportSummary} disabled={budget.items.length === 0}>
                  ⬇️ 下載預算執行表
                </button>
              </>
            }
          >
            <ActionFeedback action={txTask} />
            {budget.transactions.length === 0 ? (
              <EmptyState icon="📒" title="這個年度還沒有收支紀錄" />
            ) : (
              <>
                <div className="grid-3 tight">
                  <Field label="只看某個項目">
                    <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
                      <option value="">全部</option>
                      {budget.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.type}：{i.name}
                        </option>
                      ))}
                      <option value="-">（未分類）</option>
                    </select>
                  </Field>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>項目</th>
                        <th>摘要</th>
                        <th className="num">金額</th>
                        <th>經手人</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownTx.map((t) => (
                        <tr key={t.id}>
                          <td className="nowrap">{shortDate(t.date)}</td>
                          <td className="nowrap">
                            <Badge tone={t.type === '收入' ? 'green' : 'red'}>{t.type}</Badge> {itemName[t.itemId] ?? <span className="muted">未分類</span>}
                          </td>
                          <td>
                            {t.title}
                            {t.note && <div className="muted small">{t.note}</div>}
                          </td>
                          <td className={`num ${t.type === '收入' ? 'money-in' : 'money-out'}`}>
                            {t.type === '收入' ? '+' : '−'}
                            {money(t.amount)}
                          </td>
                          <td>{t.handler}</td>
                          <td className="nowrap">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setTxEdit(t);
                                document.getElementById('tx-form')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                            >
                              修改
                            </button>{' '}
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              disabled={txTask.pending}
                              onClick={() => window.confirm(`確定刪除「${t.title}」${money(t.amount)} 元？`) && txTask.run(() => budget.deleteTransaction(t.id), '已刪除。')}
                            >
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
