import { describe, expect, it } from 'vitest';
import { blankTrainingWeek, shiftTrainingWeek } from './team';
import { cellLines } from '../pages/team/images';

describe('每週訓練課表', () => {
  it('空白課表帶入固定時間：一二三五 17:00–18:00、四 15:00–17:00、六 13:30–18:00、日休兵', () => {
    const w = blankTrainingWeek('2026-11-09');
    expect(w.days.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(w.days.map((d) => (d.off ? '休' : `${d.startTime}-${d.endTime}`))).toEqual(['17:00-18:00', '17:00-18:00', '17:00-18:00', '15:00-17:00', '17:00-18:00', '13:30-18:00', '休']);
    expect(w.days[5].note).toContain('熱身階段 13:30-14:10');
    expect(w.groups.map((g) => g.name)).toEqual(['投手組', '內野手組', '打擊組']);
  });
  it('複製上週：日期往後 7 天，分組與內容保留', () => {
    const last = blankTrainingWeek('2026-11-02');
    last.groups[0].playerIds = ['P1'];
    last.cells = [{ groupId: last.groups[0].id, date: '2026-11-07', title: '練球日', lines: 'x', playerIds: ['P2'] }];
    const w = shiftTrainingWeek(last, '2026-11-09');
    expect(w.weekStart).toBe('2026-11-09');
    expect(w.days[0].date).toBe('2026-11-09');
    expect(w.cells[0].date).toBe('2026-11-14');
    expect(w.groups[0].playerIds).toEqual(['P1']);
    w.groups[0].playerIds.push('P3');
    expect(last.groups[0].playerIds).toEqual(['P1']);
  });
  it('訓練項目一行一項，行首 # 是灰色小標題', () => {
    expect(cellLines('#訓練階段\n肩關節重訓\n\n ＃ 做完兩組交換 ')).toEqual([
      { text: '訓練階段', sub: true },
      { text: '肩關節重訓', sub: false },
      { text: '做完兩組交換', sub: true },
    ]);
  });
});
