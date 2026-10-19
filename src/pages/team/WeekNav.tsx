import { addDays, todayStr } from '../../lib/date';
import { mondayOf, shortDate } from '../../sources/team';

/** 「← 上一週／本週／下一週 →」與這一週的日期範圍（一週練球、練球安排共用） */
export function WeekNav({ monday, onMove }: { monday: string; onMove: (monday: string) => void }) {
  const thisWeek = mondayOf(todayStr());
  return (
    <div className="row-between">
      <div className="tabs">
        <button type="button" className="btn btn-sm" onClick={() => onMove(addDays(monday, -7))}>
          ← 上一週
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onMove(thisWeek)} disabled={monday === thisWeek}>
          本週
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onMove(addDays(monday, 7))}>
          下一週 →
        </button>
      </div>
      <strong>
        {shortDate(monday)}～{shortDate(addDays(monday, 6))}
      </strong>
    </div>
  );
}
