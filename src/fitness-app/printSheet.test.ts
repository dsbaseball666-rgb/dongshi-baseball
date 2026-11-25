import { describe, expect, it } from 'vitest';
import { sheetColumns, sheetHint, sortGrades } from './printSheet';

describe('紙本空白記錄表', () => {
  it('年級依七、八、九排列', () => {
    expect(sortGrades(['九年級', '七年級', '', '八年級', '七年級'])).toEqual(['七年級', '八年級', '九年級']);
  });

  it('揮棒速度、投球球速：10 格＋平均＋最高', () => {
    const cols = sheetColumns('swing', 0);
    expect(cols.map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '平均', '最高']);
  });

  it('1500 公尺記圈：圈數格＋完成時間；不記圈就是一般成績格', () => {
    expect(sheetColumns('run1500', 400).map((c) => c.label)).toEqual(['1', '2', '3', '4', '完成時間（分:秒）']);
    expect(sheetColumns('run1500', 150).length).toBe(11);
    expect(sheetColumns('run1500', 0).map((c) => c.label)).toEqual(['這次成績（分:秒）', '備註']);
  });

  it('其他項目：這次成績（單位）＋備註', () => {
    expect(sheetColumns('pushup', 0).map((c) => c.label)).toEqual(['這次成績（次）', '備註']);
    expect(sheetColumns('run150', 0)[0].label).toBe('這次成績（分:秒）');
  });

  it('填寫說明', () => {
    expect(sheetHint('pitch', 0)).toContain('平均');
    expect(sheetHint('run1500', 400)).toContain('共 4 格');
    expect(sheetHint('run150', 0)).toContain('秒數');
  });
});
