import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// ---------- icons (hand-tuned 24px strokes) ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  card: 'M4 4h16v16H4zM4 9h16M9 9v11M14 9v11',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a2.5 2.5 0 0 0 3.5 4.3M16 6h3.5a2.5 2.5 0 0 1-3.5 4.3M12 13v4M8 21h8M9 17h6',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.2c0-1 1.1-1.7 2.5-1.7s2.6.7 2.6 1.8c0 2.6-5.1 1.4-5.1 4.1 0 1.1 1.1 1.8 2.5 1.8s2.6-.7 2.6-1.7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  flag: 'M6 21V4M6 4c4-2 7 2 12 0v9c-5 2-8-2-12 0',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chev: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  swap: 'M7 16V4M7 4 3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  sub: 'M17 11a4 4 0 1 0-8 0M3 21a6 6 0 0 1 9-5.2M16 15v6M13 18h6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  cloud: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  tee: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 10h6l-2 2v9h-2v-9z',
  fairway: 'M3 20c4-6 6-14 9-16 3 2 5 10 9 16M8 14h8',
  bunker: 'M3 17c3-4 6-4 9-2s6 2 9-2M5 13c2-3 5-3 7-1',
  water: 'M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  green: 'M12 3v11M12 3l6 3-6 3M4 18c0-2 3.6-3.5 8-3.5s8 1.5 8 3.5-3.6 3-8 3-8-1-8-3z',
  lost: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5h.01',
  unplayable: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bag: 'M7 8V6a5 5 0 0 1 10 0v2M4 8h16l-1 13H5z',
  screen: 'M3 4h18v12H3zM7 20h10M12 16v4M12 7v3l2 1',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  out: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  play: 'M7 4v16l13-8z',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
};
export function Icon({ name, size = 20, stroke = 1.8, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      <path d={P[name] || P.info} />
    </svg>
  );
}

export function BrandMark({ size = 34 }) {
  const gid = 'bm' + useId().replace(/:/g, '');
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="1"><stop offset="0" stopColor="#4fe3c1" /><stop offset="1" stopColor="#c6f36d" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="var(--surface-2)" stroke="var(--line-2)" />
      <path d="M7 31 C 12 8, 26 4, 33 22" stroke={`url(#${gid})`} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="22" r="3.2" fill="#fff" />
      <path d="M5 33h30" stroke="var(--line-2)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ league }) {
  return (
    <div className="brand">
      <BrandMark />
      <div className="brand-text">
        <div className="brand-name">Carry</div>
        <div className="brand-sub">{league ? `${league.name}` : 'Golf league'}</div>
      </div>
    </div>
  );
}

export const initials = (name = '') =>
  name.replace(/".*?"/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export const fmtIdx = (i) => (i == null ? '–' : i < 0 ? `+${Math.abs(i).toFixed(1)}` : i.toFixed(1));
export const fmtHcp = (h) => (h < 0 ? `+${-h}` : `${h}`);
export const money = (m) => `$${(Math.round(m * 100) / 100).toFixed(m % 1 ? 2 : 0)}`;
export const shortName = (name = '') => {
  const clean = name.replace(/".*?"\s*/g, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : clean;
};
export const nick = (name = '') => (name.match(/"(.*?)"/)?.[1]) || name.split(/\s+/)[0];

export function Avatar({ name, color, sub, size = '' }) {
  return <div className={`av ${size} ${sub ? 'sub' : ''}`} style={{ '--c': color }} aria-hidden="true">{sub ? 'S' : initials(name)}</div>;
}

export function Sparkline({ values, width = 84, height = 28, color = 'var(--aqua)', invert = true, dots = true, className = 'spark' }) {
  const id = useRef('g' + Math.random().toString(36).slice(2, 7)).current;
  const v = values.filter((x) => x != null);
  if (v.length < 2) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = values.map((x, i) => (x == null ? null : [
    3 + (i * (width - 6)) / (values.length - 1),
    invert ? 3 + ((x - min) / span) * (height - 6) : height - 3 - ((x - min) / span) * (height - 6),
  ])).filter(Boolean);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="draw" style={{ '--len': 400 }} />
      {dots && <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />}
    </svg>
  );
}

export function Sheet({ open, onClose, title, subtitle, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title ellipsis">{title}</div>
            {subtitle && <div className="muted" style={{ fontSize: 13 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Seg({ options, value, onChange }) {
  const ref = useRef();
  const [thumb, setThumb] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('button.on');
    if (el) setThumb({ x: el.offsetLeft - 3, w: el.offsetWidth });
  }, [value, options.length]);
  return (
    <div className="seg" ref={ref} role="tablist">
      <span className="thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)`, left: 3 }} />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

/** FLIP: animate children with data-flip keys to their new positions after a reorder. */
export function useFlip(containerRef, deps) {
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nodes = [...el.querySelectorAll('[data-flip]')];
    const next = new Map(nodes.map((n) => [n.dataset.flip, n.getBoundingClientRect().top]));
    nodes.forEach((n) => {
      const before = prev.current.get(n.dataset.flip);
      const after = next.get(n.dataset.flip);
      if (before != null && before !== after) {
        n.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
    prev.current = next;
  }, deps); // eslint-disable-line
}

export function scoreClass(score, par) {
  if (!Number.isFinite(score) || score <= 0) return 'blank';
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';
}
export const scoreWord = (d) => ({ '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double', 3: 'Triple' }[d] ?? (d < -3 ? 'Ace!' : `+${d}`));

export function Strip({ holes, course, skins = [], strokes = [] }) {
  return (
    <div className="strip" role="list">
      {course.holes.map((h, i) => {
        const s = holes?.[i];
        return (
          <div key={i} role="listitem" className={`cell ${scoreClass(s, h.par)} ${skins.includes(i) ? 'skin' : ''}`} title={`Hole ${i + 1} · par ${h.par}`}>
            {Number.isFinite(s) && s > 0 ? s : '·'}
            {strokes[i] > 0 && <span className="dotk" />}
          </div>
        );
      })}
    </div>
  );
}

export function Empty({ icon = 'flag', title, children, action }) {
  return (
    <div className="card empty rise">
      <div style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--accent)' }}>
        <Icon name={icon} size={30} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch {} }
