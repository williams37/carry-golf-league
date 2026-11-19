import { useEffect, useState } from 'react';
import { Icon } from '../components/ui.jsx';

/** Full-screen viewer for a stored card photo (works over a sheet). */
export function PhotoLightbox({ path, photoUrl, title, onClose, onRemove }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!path) return;
    let alive = true, made = null;
    setUrl(null); setErr(null);
    photoUrl(path).then((u) => { if (!alive) return; if (!u) setErr('This photo is no longer available.'); else { setUrl(u); if (u.startsWith('blob:')) made = u; } })
      .catch((e) => alive && setErr(e.message));
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { alive = false; window.removeEventListener('keydown', k); if (made) URL.revokeObjectURL(made); };
  }, [path]); // eslint-disable-line
  if (!path) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Card photo" onClick={onClose} data-testid="lightbox">
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <div className="grow ellipsis"><div className="eyebrow">Card photo</div><div style={{ fontWeight: 700 }}>{title}</div></div>
        {onRemove && <button className="btn sm ghost" onClick={onRemove}><Icon name="trash" size={15} /> Remove</button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
      </div>
      <div className="lightbox-img" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt={`Scorecard photo for ${title}`} /> : err ? <div className="muted">{err}</div> : <div className="spinner" />}
      </div>
    </div>
  );
}

/** Small thumbnail that loads a stored photo lazily. */
export function PhotoThumb({ path, photoUrl, size = 34 }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, made = null;
    photoUrl(path).then((u) => { if (alive && u) { setUrl(u); if (u.startsWith('blob:')) made = u; } }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]); // eslint-disable-line
  return <span className="photo-thumb" style={{ width: size, height: size }}>{url ? <img src={url} alt="" /> : <Icon name="image" size={16} />}</span>;
}
