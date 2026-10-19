import { describe, expect, it } from 'vitest';
import { attemptsNote, average, parseAttempts, usesAttempts } from './attempts';

describe('揮棒速度、投球球速多次平均', () => {
  it('只有揮棒速度、投球球速使用多次平均', () => {
    expect(usesAttempts('swing')).toBe(true);
    expect(usesAttempts('pitch')).toBe(true);
    expect(usesAttempts('pushup')).toBe(false);
  });

  it('平均四捨五入到小數一位', () => {
    expect(average([95, 96.5, 97])).toBe(96.2);
    expect(average([90, 91])).toBe(90.5);
    expect(average([])).toBe(0);
  });

  it('一格可以用空白、逗號、頓號隔開多個數字', () => {
    expect(parseAttempts('swing', '95 96.5,97、98')).toEqual([95, 96.5, 97, 98]);
    expect(parseAttempts('pitch', '  88  ')).toEqual([88]);
  });

  it('其中一次不合理時，說出是第幾次；最多 10 次', () => {
    expect(() => parseAttempts('swing', '95 999')).toThrow('第 2 次');
    expect(() => parseAttempts('swing', '90 '.repeat(11))).toThrow('最多輸入 10 次');
    expect(() => parseAttempts('swing', ' ')).toThrow('請輸入');
  });

  it('備註記下每一次與最高值，長度不超過 200 字', () => {
    expect(attemptsNote([95, 98.2, 96])).toBe('3 次平均（最高 98.2）：95、98.2、96');
    expect(attemptsNote([95], '雨天')).toBe('雨天');
    expect(attemptsNote([95, 96], '團體檢測')).toBe('2 次平均（最高 96）：95、96｜團體檢測');
    expect(attemptsNote(Array(10).fill(123.45), 'x'.repeat(200)).length).toBe(200);
  });
});
