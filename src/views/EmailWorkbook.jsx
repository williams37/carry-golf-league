import { useEffect, useMemo, useState } from 'react';
import { Sheet, Icon, Avatar } from '../components/ui.jsx';
import { leagueSummary, mailtoUrl, workbookName, withAttachNote } from '../lib/share.js';
import { download } from './League.jsx';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * "Email" next to every Excel export.
 * The workbook starts building as soon as the sheet opens, so the Send tap is a fresh user
 * gesture: navigator.share() needs one, and a long build would otherwise use it up.
 *  - Share sheet (phones, Windows Chrome/Edge): the file is attached by the OS / mail app.
 *  - Otherwise: download the file and open a prefilled mailto: with a note to attach it.
 * Commissioners in cloud leagues can prefill recipients from the member list (RLS: members only).
 */
export function EmailWorkbookSheet({ ctx, open, onClose }) {
  const { league, mode, isCommissioner, authState, toast } = ctx;
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const me = (authState?.session?.user?.email || '').toLowerCase();
  const people = useMemo(() => (mode === 'cloud' && isCommissioner ? (league.members || []) : [])
    .filter((m) => m.email && m.email.toLowerCase() !== me)
    .map((m) => ({ email: m.email, name: m.display_name || league.players.find((p) => p.id === m.player_id)?.name || m.email })), [league.members, mode, isCommissioner, me]); // eslint-disable-line
  const [to, setTo] = useState(new Set());
  useEffect(() => { if (open) setTo(new Set(people.map((p) => p.email))); }, [open, people.length]); // eslint-disable-line
  const summary = useMemo(() => (open ? leagueSummary(league) : null), [open, league]);
  const name = workbookName(league);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFile(null); setErr(null);
    (async () => {
      try {
        const { buildWorkbook } = await import('../lib/excel.js');
        const blob = await buildWorkbook(league);
        if (alive) setFile(new File([blob], name, { type: XLSX }));
      } catch (e) { if (alive) setErr(e.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [open]); // eslint-disable-line

  const canShareFile = !!(file && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch { return false; } })());
  const recipients = [...to];

  const viaMail = () => {
    download(name, file);
    window.location.href = mailtoUrl({ to: recipients, subject: summary.subject, body: withAttachNote(summary.body, name) });
    toast(`Workbook downloaded. Attach ${name} to the email that just opened.`);
    onClose();
  };
  const viaShare = async () => {
    try {
      await navigator.share({ files: [file], title: summary.subject, text: summary.body });
      toast('Workbook shared');
      onClose();
    } catch (e) {
      if (e?.name === 'AbortError') return; // user closed the share sheet
      viaMail(); // NotAllowedError / TypeError etc: fall back
    }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(recipients.join(', ')); toast('Addresses copied'); } catch { prompt('Copy these addresses', recipients.join(', ')); } };

  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Email the workbook" subtitle={summary?.subject}
      footer={(
        <>
          {!canShareFile && <button className="btn ghost" onClick={onClose}>Cancel</button>}
          {canShareFile && <button className="btn" disabled={!file} onClick={viaMail} title="Download the file and open your email app"><Icon name="mail" size={16} /> Email app</button>}
          <button className="btn primary grow" disabled={!file} onClick={canShareFile ? viaShare : viaMail} data-testid="email-send">
            <Icon name={canShareFile ? 'upload' : 'mail'} size={17} /> {!file ? 'Building…' : canShareFile ? 'Share file' : 'Download & open email'}
          </button>
        </>
      )}>
      {err && <div className="banner err"><Icon name="info" size={18} />{err}</div>}
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', flex: 'none', background: 'color-mix(in oklab, var(--lime) 16%, var(--surface))' }}><Icon name="download" size={20} style={{ color: 'var(--lime)' }} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 650 }}>{name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · 7 sheets` : 'Building…'}</div>
        </div>
      </div>
      <div className="h2" style={{ marginTop: 16 }}>Message</div>
      <pre className="card flat" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: 13.5, lineHeight: 1.5, margin: 0, color: 'var(--text-2)' }}>{summary?.body}</pre>
      {people.length > 0 && (
        <>
          <div className="row spread" style={{ marginTop: 16 }}>
            <div className="h2" style={{ margin: 0 }}>To</div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn xs ghost" onClick={() => setTo(to.size === people.length ? new Set() : new Set(people.map((p) => p.email)))}>{to.size === people.length ? 'None' : 'All'}</button>
              {canShareFile && recipients.length > 0 && <button className="btn xs ghost" onClick={copy}><Icon name="copy" size={14} /> Copy</button>}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {people.map((p) => {
              const on = to.has(p.email);
              return (
                <button key={p.email} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} title={p.email}
                  onClick={() => { const n = new Set(to); on ? n.delete(p.email) : n.add(p.email); setTo(n); }}>
                  <Avatar name={p.name} color="var(--aqua)" size="sm" /> {p.name}{on && <Icon name="check" size={14} />}
                </button>
              );
            })}
          </div>
          {canShareFile && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>The share sheet can't prefill recipients. Pick them in your mail app (Copy puts the addresses on the clipboard), or use <b>Email app</b> to prefill them.</p>}
        </>
      )}
      {!canShareFile && file && <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>This browser can't attach files to email directly, so Carry downloads the workbook and opens your email app with the message filled in. Attach the file from Downloads.</p>}
    </Sheet>
  );
}
