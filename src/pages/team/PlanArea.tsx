import { useSearchParams } from 'react-router-dom';
import { PlanTab } from './PlanTab';
import { MonthView } from './MonthView';

/** 練球安排：上方切換「每週安排（訓練課表）」與「每月行程（月曆）」 */
export function PlanArea({ coach, myIds }: { coach: boolean; myIds: string[] }) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'month' ? 'month' : 'week';
  const go = (v: 'week' | 'month') => {
    const next = new URLSearchParams(params);
    if (v === 'month') next.set('view', 'month');
    else next.delete('view');
    setParams(next, { replace: true });
  };
  return (
    <>
      <div className="tabs plan-switch" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'week'} className={`tab ${view === 'week' ? 'active' : ''}`} onClick={() => go('week')}>
          📋 每週安排
        </button>
        <button type="button" role="tab" aria-selected={view === 'month'} className={`tab ${view === 'month' ? 'active' : ''}`} onClick={() => go('month')}>
          📆 每月行程
        </button>
      </div>
      {view === 'week' ? <PlanTab coach={coach} myIds={myIds} /> : <MonthView coach={coach} />}
    </>
  );
}
