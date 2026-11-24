import { fmtIdx } from '../components/ui.jsx';

/**
 * Handicap history: the league index carried into each week (line), with that week's differential (dot;
 * filled bright when it's one of the rounds counting toward today's index). Lower is better, so the axis runs down.
 */
export default function HandicapChart({ points, color = 'var(--aqua)', height = 210 }) {
  const W = 640, H = height, L = 38, R = 14, T = 14, B = 28;
  if (points.length < 2) return <p className="muted" style={{ fontSize: 13 }}>The chart fills in once a few weeks are played.</p>;
  const vals = points.flatMap((p) => [p.index, p.diff]).filter((v) => v != null);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (hi - lo < 4) { hi += 2; lo -= 2; }
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((v - lo) / (hi - lo)) * (H - T - B); // low index at the top
  const step = Math.max(1, Math.ceil((hi - lo) / 5));
  const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.index).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const every = Math.ceil(points.length / 10);
  return (
    <svg className="hchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Handicap history: ${points.map((p) => `${p.label} ${fmtIdx(p.index)}`).join(', ')}`} data-testid="handicap-chart">
      <g className="grid">
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
      </g>
      <path className="area" d={area} fill={color} />
      <path className="line draw" d={line} stroke={color} style={{ '--len': 1400 }} />
      {points.map((p, i) => p.diff != null && (
        <circle key={'d' + p.key} className={`diff ${p.used ? 'used' : ''}`} cx={x(i)} cy={y(p.diff)} r="4.5"><title>{`${p.label}: differential ${p.diff.toFixed(1)}${p.used ? ' (counts)' : ''}${p.gross ? ` · gross ${p.gross}` : ''}${p.course ? ` · ${p.course}` : ''}`}</title></circle>
      ))}
      {points.map((p, i) => (
        <g key={p.key}>
          <circle className="dot" cx={x(i)} cy={y(p.index)} r={p.now ? 6 : 4} fill={color}><title>{`${p.label}: index ${fmtIdx(p.index)}`}</title></circle>
          {(i % every === 0 || p.now) && <text x={x(i)} y={H - 8} textAnchor="middle" className="ax" style={{ fill: 'var(--muted)', fontSize: 11 }}>{p.label}</text>}
        </g>
      ))}
      <text x={x(points.length - 1)} y={y(points[points.length - 1].index) - 12} textAnchor="end" style={{ fill: 'var(--text)', fontSize: 13, fontWeight: 700 }}>{fmtIdx(points[points.length - 1].index)}</text>
    </svg>
  );
}
