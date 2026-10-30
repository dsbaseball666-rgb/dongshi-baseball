import { describe, expect, it } from 'vitest';
import { EXAM_SUBJECTS, currentTerm, examAverage, examChange, examOrder, examTotal, gradeFromText, parseRank, parseScore, previousExam, trendOf } from './exam';
import { battlesLeft } from './battle';
import type { Wallet } from '../types';

describe('段考成績', () => {
  it('各年級科目依教練提供的清單', () => {
    expect(EXAM_SUBJECTS[7]).toEqual(['國文', '數學', '英文', '社會', '自然', '建教', '作文']);
    expect(EXAM_SUBJECTS[8]).toHaveLength(9);
    expect(EXAM_SUBJECTS[9]).toContain('作文');
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

describe('段考進步／退步', () => {
  const base = { schoolYear: 115, semester: '上' as const, grade: 8 as const, note: '', createdBy: '', createdAt: '', updatedAt: '', classRank: null, schoolRank: null };
  const r1 = { ...base, id: 'a', playerId: 'P1', examNo: 1, scores: { 國文: 70, 數學: 80 }, classRank: 10, schoolRank: 150 };
  const r2 = { ...base, id: 'b', playerId: 'P1', examNo: 2, scores: { 國文: 80, 數學: 82 }, classRank: 6, schoolRank: 160 };
  const other = { ...base, id: 'c', playerId: 'P2', examNo: 1, scores: { 國文: 99 } };

  it('找同一位球員的上一次段考', () => {
    expect(previousExam([r1, r2, other], r2)?.id).toBe('a');
    expect(previousExam([r1, r2, other], r1)).toBeUndefined();
  });

  it('平均、總分、排名的變化（排名數字變小＝進步）', () => {
    expect(examChange(r2, r1)).toEqual({ avg: 6, total: 12, classRank: 4, schoolRank: -10 });
  });

  it('年級不同（科目數不同）時不比較總分', () => {
    expect(examChange({ ...r2, grade: 9 }, r1).total).toBeNull();
  });

  it('差距在門檻內算持平', () => {
    expect(trendOf(0.5, 1)).toBe('flat');
    expect(trendOf(1.5, 1)).toBe('up');
    expect(trendOf(-2, 1)).toBe('down');
    expect(trendOf(null)).toBeNull();
  });

  it('排名必須是 1 以上的整數', () => {
    expect(parseRank('', 'x')).toBeNull();
    expect(parseRank('12', 'x')).toBe(12);
    expect(() => parseRank('0', '班排名')).toThrow();
    expect(() => parseRank('2.5', '班排名')).toThrow();
  });
});
