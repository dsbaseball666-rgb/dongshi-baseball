import { describe, expect, it } from 'vitest';
import { formatRunTime, parseFitnessInput, improvement } from './fitness';
import { applyExp, canEvolve, evolutionChain, expToNext, pickEncounter } from './monster';
import { buildSprite, SHAPES, ACCESSORIES, SPRITE_SIZE } from './sprite';
import { isoWeekKey, isValidDateStr, addDays } from './date';
import { goalProgress } from './progress';
import { toCsv } from './csv';
import { can } from './permissions';
import { SEED_MONSTERS } from '../data/monsters';
import type { Goal } from '../types';

describe('體能格式', () => {
  it('跑步時間統一為 分:秒.百分秒', () => {
    expect(formatRunTime(405)).toBe('6:45.00');
    expect(formatRunTime(8.45)).toBe('0:08.45');
  });
  it('解析輸入並驗證範圍', () => {
    expect(parseFitnessInput('run1500', '6:45')).toBe(405);
    expect(parseFitnessInput('run150', '22.45')).toBe(22.45);
    expect(() => parseFitnessInput('run150', '8')).toThrow('合理範圍');
    expect(parseFitnessInput('pushup', '25')).toBe(25);
    expect(() => parseFitnessInput('pushup', '25.5')).toThrow('整數');
    expect(() => parseFitnessInput('run1500', '6:75')).toThrow();
    expect(() => parseFitnessInput('grip', '')).toThrow('請輸入');
  });
  it('時間越短代表進步', () => {
    expect(improvement('run150', 25, 23.5)).toBeGreaterThan(0);
    expect(improvement('pushup', 20, 25)).toBeGreaterThan(0);
  });
});

describe('怪獸等級', () => {
  it('經驗值足夠時升級', () => {
    expect(applyExp(1, 0, expToNext(1))).toEqual({ level: 2, exp: 0, levelsGained: 1 });
    expect(applyExp(1, 0, 10).level).toBe(1);
  });
  it('遭遇只會出現該區域的怪獸', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickEncounter(SEED_MONSTERS, 'orchard', () => r)?.habitat).toBe('orchard');
    }
  });
});

describe('像素怪獸', () => {
  it('所有形狀與配件都是 12×12', () => {
    for (const s of Object.values(SHAPES)) {
      expect(s.rows).toHaveLength(SPRITE_SIZE);
      s.rows.forEach((r) => expect(r).toHaveLength(SPRITE_SIZE));
    }
    for (const a of Object.values(ACCESSORIES)) Object.values(a).forEach((r) => expect(r).toHaveLength(SPRITE_SIZE));
    for (const m of SEED_MONSTERS) {
      const g = buildSprite(m.shape, m.accessories);
      expect(g).toHaveLength(SPRITE_SIZE);
      expect(g.flat().includes('o')).toBe(true);
    }
  });
});

describe('圖鑑與進化路線', () => {
  it('共 75 隻，編號與名稱不重複', () => {
    expect(SEED_MONSTERS).toHaveLength(75);
    expect(new Set(SEED_MONSTERS.map((m) => m.name)).size).toBe(75);
    expect(SEED_MONSTERS.map((m) => m.dexNo)).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
  });
  it('每條路線都是 3 個階段，最終型態只能進化取得', () => {
    for (const m of SEED_MONSTERS.filter((x) => x.stage === 1)) {
      const chain = evolutionChain(SEED_MONSTERS, m.id);
      expect(chain.map((c) => c.stage)).toEqual([1, 2, 3]);
      expect(chain[2].inWild).toBe(false);
      expect(evolutionChain(SEED_MONSTERS, chain[2].id).map((c) => c.id)).toEqual(chain.map((c) => c.id));
    }
    expect(SEED_MONSTERS.filter((m) => m.isStarter)).toHaveLength(3);
  });
  it('達到等級才可進化', () => {
    const m = SEED_MONSTERS[0];
    expect(canEvolve(m, 5)).toBe(false);
    expect(canEvolve(m, 6)).toBe(true);
    expect(canEvolve(SEED_MONSTERS[2], 30)).toBe(false);
  });
});

describe('日期與其他工具', () => {
  it('週次與日期驗證', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('進度只計算已核准的檢核點', () => {
    const g = { checkpoints: [{ state: 'approved' }, { state: 'submitted' }, { state: 'todo' }, { state: 'approved' }] } as Goal;
    expect(goalProgress(g)).toMatchObject({ approved: 2, total: 4, percent: 50 });
  });
  it('CSV 會跳脫逗號與引號', () => {
    expect(toCsv([{ a: '1,2', b: '說"好"' }])).toBe('﻿a,b\r\n"1,2","說""好"""');
  });
  it('家長沒有修改權限，停用帳號沒有任何權限', () => {
    expect(can({ role: 'parent', active: true }, 'fitness.write')).toBe(false);
    expect(can({ role: 'parent', active: true }, 'rules.read')).toBe(true);
    expect(can({ role: 'coach', active: false }, 'rules.read')).toBe(false);
  });
});
