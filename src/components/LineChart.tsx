interface Point {
  date: string;
  value: number;
}

interface Props {
  data: Point[];
  format: (v: number) => string;
  better: 'higher' | 'lower';
  label: string;
}

/** 簡易折線圖（純 SVG），顯示個人歷次變化 */
export function LineChart({ data, format, better, label }: Props) {
  if (data.length === 0) return null;
  const W = 600;
  const H = 240;
  const pad = { l: 64, r: 20, t: 20, b: 44 };
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.15;
  max += span * 0.15;
  const x = (i: number) => (data.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (data.length - 1));
  const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ');
  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}歷次變化折線圖`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {format(t)}
            </text>
          </g>
        ))}
        <path d={path} className="chart-line" fill="none" />
        {data.map((d, i) => (
          <g key={`${d.date}-${i}`}>
            <rect x={x(i) - 5} y={y(d.value) - 5} width={10} height={10} className="chart-dot">
              <title>{`${d.date}：${format(d.value)}`}</title>
            </rect>
            <text x={x(i)} y={H - pad.b + 18} textAnchor="middle" className="chart-axis">
              {d.date.slice(5).replace('-', '/')}
            </text>
            <text x={x(i)} y={y(d.value) - 10} textAnchor="middle" className="chart-value">
              {format(d.value)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="muted">{better === 'higher' ? '數值越高越好' : '時間越短越好'}・滑鼠移到點上可看日期</figcaption>
    </figure>
  );
}
