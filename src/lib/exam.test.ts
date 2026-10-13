import { describe, expect, it } from 'vitest';
import { currentTerm, EXAM_SUBJECTS, examAverage, examOrder, examTotal, gradeFromText, parseScore } from './exam';
import { battlesLeft } from './battle';
import type { Wallet } from '../types';

describe('段考成績', () => {
  it('各年級科目依教練提供的清單', () => {
    expect(EXAM_SUBJECTS[7]).toEqual(['國文', '數學', '英文', '社會', '自然', '建教']);
    expect(EXAM_SUBJECTS[8]).toHaveLength(8);
    expect(EXAM_SUBJECTS[9]).toContain('地科生物');
  });
  it('依日期推算學年度與學期', () => {
    expect(currentTerm(new Date(2026, 9, 13))).toEqual({ schoolYear: 115, semester: '上' });
    expect(currentTerm(new Date(2027, 0, 20))).toEqual({ schoolYear: 115, semester: '上' });
    expect(currentTerm(new Date(2027, 2, 1))).toEqual({ schoolYear: 115, semester: '下' });
  });
  it('從年級文字判斷 7／8／9', () => {
    expect(gradeFromText('七年級')).toBe(7);
    expect(gradeFromText('二年級')).toBe(8);
    expect(gradeFromText('國三')).toBe(9);
    expect(gradeFromText('')).toBeNull();
  });
  it('平均只算有成績的科目', () => {
    expect(examAverage({ 國文: 80, 數學: 91 })).toBe(85.5);
    expect(examAverage({})).toBeNull();
    expect(examTotal({ 國文: 80.5, 數學: 91 })).toBe(171.5);
  });
  it('分數驗證：空白、範圍、小數位數', () => {
    expect(parseScore(' ', '國文')).toBeNull();
    expect(parseScore('88.5', '國文')).toBe(88.5);
    expect(() => parseScore('101', '國文')).toThrow('0～100');
    expect(() => parseScore('85.55', '國文')).toThrow('一位小數');
    expect(() => parseScore('abc', '國文')).toThrow();
  });
  it('段考排序：學年 → 上下學期 → 第幾次', () => {
    const list = [
      { schoolYear: 115, semester: '下' as const, examNo: 1 },
      { schoolYear: 114, semester: '上' as const, examNo: 3 },
      { schoolYear: 115, semester: '上' as const, examNo: 2 },
    ].sort((a, b) => examOrder(a) - examOrder(b));
    expect(list.map((e) => `${e.schoolYear}${e.semester}${e.examNo}`)).toEqual(['114上3', '115上2', '115下1']);
  });
});

describe('對戰次數', () => {
  const w = (extra: Partial<Wallet>): Wallet => ({ playerId: 'P', points: 0, balls: 0, exploreDate: '', exploreCount: 0, supplyDate: '', seenMonsterIds: [], encounter: null, ...extra });
  it('新的一天次數重新計算', () => {
    expect(battlesLeft(w({ battleDate: '2026-10-12', pveCount: 5, pvpCount: 3 }), '2026-10-13')).toEqual({ pve: 5, pvp: 3 });
    expect(battlesLeft(w({ battleDate: '2026-10-13', pveCount: 2, pvpCount: 3 }), '2026-10-13')).toEqual({ pve: 3, pvp: 0 });
  });
});
