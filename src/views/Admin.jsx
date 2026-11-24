import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, Sheet, Seg, Avatar, fmtIdx, shortName, Empty } from '../components/ui.jsx';
import { computeHandicaps, sortedWeeks, weekEntrants, courseForWeek, HOLES } from '../lib/golf.js';
import { fmtDate } from '../lib/helpers.js';

/**
 * Owner-only admin. What you can see and do is enforced in Supabase (supabase/admin.sql): admins get read access
 * to every league, and every change goes through an audited security-definer function. This screen is just the UI.
 */
const ago = (iso) => {
  if (!iso) return 'never';
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};
const ACTION = {
  confirm_user: 'Confirmed email', delete_user: 'Deleted account', add_member: 'Added to league', set_member: 'Changed member',
  remove_member: 'Removed member', set_score: 'Corrected card', delete_score: 'Deleted card', update_player: 'Edited player',
  send_reset: 'Sent password reset', open_league: 'Opened league',
};

export default function Admin({ ctx }) {
  const { store, isAdmin, toast, go, mode } = ctx;
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('leagues');
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try { setErr(null); setData(await store.admin('admin_overview')); } catch (e) { setErr(e.message); }
  }, [store]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (mode !== 'cloud' || !isAdmin) {
    return <><div className="page-head"><h1 className="page-title">Admin</h1></div><Empty icon="lock" title="Admins only">This page is for the Carry owner. Sign in with the admin account to use it.</Empty></>;
  }
  const act = async (label, fn) => { try { await fn(); toast(label); await load(); } catch (e) { toast(e.message); } };
  const users = data?.users || [], leagues = data?.leagues || [], audit = data?.audit || [];
  const stuck = users.filter((u) => !u.leagues.length || !u.last_sign_in_at || !u.confirmed);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow"><Icon name="shield" size={13} style={{ verticalAlign: '-2px' }} /> Owner tools · every change is logged</div><h1 className="page-title">Admin</h1></div>
        <button className="btn sm" onClick={load}><Icon name="rotate" size={15} /> Refresh</button>
      </div>
      {err && <div className="banner err"><Icon name="info" size={18} />{err}</div>}
      <div className="admin-tiles" data-testid="admin-tiles">
        {[[leagues.length, 'Leagues'], [users.length, 'Accounts'], [leagues.reduce((a, l) => a + (Number(l.cards) || 0), 0), 'Cards'], [stuck.length, 'Need a look']].map(([v, k]) => (
          <div key={k} className="card flat stat" style={{ background: 'var(--surface-2)' }}><div className="v num display" style={{ fontSize: 30 }}>{data ? v : '–'}</div><div className="k">{k}</div></div>
        ))}
      </div>
      <div style={{ margin: '16px 0 10px' }}><Seg value={tab} onChange={setTab} options={[{ value: 'leagues', label: 'Leagues' }, { value: 'users', label: 'Accounts' }, { value: 'audit', label: 'Audit log' }]} /></div>

      {tab === 'leagues' && <section className="card admin-list" data-testid="admin-leagues">
        {!leagues.length && <p className="muted">No leagues yet.</p>}
        {leagues.map((l) => (
          <div key={l.id} className="admin-row">
            <div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{l.name}</b><div className="sub ellipsis">{l.season || 'No season'} · owner {l.owner_email || '?'} · code {l.invite_code}</div></div>
            <div className="sub">{l.members} member{l.members === 1 ? '' : 's'} · {l.players} players · {l.weeks} wks · {l.cards} cards{l.pending ? ` · ${l.pending} pending` : ''}{l.seasons ? ` · ${l.seasons} past season${l.seasons > 1 ? 's' : ''}` : ''}<br />updated {ago(l.updated_at)}</div>
            <button className="btn sm" onClick={() => setOpen(l)}>Open <Icon name="chev" size={14} /></button>
          </div>
        ))}
      </section>}

      {tab === 'users' && <section className="card admin-list" data-testid="admin-users">
        {users.map((u) => {
          const flags = [!u.confirmed && 'email not confirmed', !u.last_sign_in_at && 'never signed in', !u.leagues.length && 'in no league', !u.has_password && 'no password (email-code account)'].filter(Boolean);
          return (
            <div key={u.id} className="admin-row">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}><b className="ellipsis">{u.email}</b>{u.admin && <span className="badge admin">Admin</span>}</div>
                <div className="sub">joined {ago(u.created_at)} · last sign-in {ago(u.last_sign_in_at)}</div>
                {flags.length > 0 && <div className="sub" style={{ color: 'var(--gold)' }}>{flags.join(' · ')}</div>}
              </div>
              <div className="sub">{u.leagues.length ? u.leagues.map((m) => `${m.name} (${m.role})`).join(', ') : '—'}</div>
              <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {!u.confirmed && <button className="btn xs" onClick={() => act(`${u.email} confirmed`, () => store.admin('admin_confirm_user', { p_user: u.id }))}>Confirm email</button>}
                <button className="btn xs" onClick={() => confirm(`Email a password-reset link to ${u.email}?`) && act(`Reset link sent to ${u.email}`, () => store.adminSendReset(u.email))}>Send reset link</button>
                {!u.admin && !leagues.some((l) => l.owner === u.id) && <button className="btn xs ghost danger" onClick={() => { const why = prompt(`Delete the account ${u.email}? This can't be undone. Reason (logged):`, !u.last_sign_in_at ? 'Stranded sign-up' : ''); if (why !== null) act(`${u.email} deleted`, () => store.admin('admin_delete_user', { p_user: u.id, p_reason: why })); }}>Delete</button>}
              </div>
            </div>
          );
        })}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Stuck at sign-up? <b>Send reset link</b> lets them set a password (works for email-code accounts too). <b>Delete</b> clears a stranded account so the email can sign up fresh; it's only offered for accounts that don't own a league.</p>
      </section>}

      {tab === 'audit' && <section className="card" data-testid="admin-audit">
        {!audit.length && <p className="muted">No admin changes yet.</p>}
        {audit.map((a) => (
          <div key={a.id} className="audit-row">
            <span className="muted">{new Date(a.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span><b>{ACTION[a.action] || a.action}</b> · {a.target}{a.league_id && ` · ${leagues.find((l) => l.id === a.league_id)?.name || 'league'}`}{a.detail?.reason ? <span className="muted"> · “{a.detail.reason}”</span> : null}<span className="muted"> · by {a.admin_email}</span></span>
          </div>
        ))}
      </section>}

      {open && <LeagueAdmin ctx={ctx} meta={open} users={users} onClose={() => setOpen(null)} onChanged={load} />}
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 20 }}><button className="linkish" onClick={() => go('home')}>Back to my league</button></p>
    </>
  );
}

function LeagueAdmin({ ctx, meta, users, onClose, onChanged }) {
  const { store, toast } = ctx;
  const [lg, setLg] = useState(null);
  const [err, setErr] = useState(null);
  const [wid, setWid] = useState(null);
  const [edit, setEdit] = useState(null); // { key, name, holes }
  const [email, setEmail] = useState('');
  const load = useCallback(async () => {
    try { const r = await store.getLeague(meta.id); setLg(r.league); setWid((w) => w || sortedWeeks(r.league).slice(-1)[0]?.id || null); } catch (e) { setErr(e.message); }
  }, [store, meta.id]);
  useEffect(() => { load(); }, [load]);
  const hcp = useMemo(() => (lg ? computeHandicaps(lg) : null), [lg]);
  const act = async (label, fn) => { try { await fn(); toast(label); await load(); onChanged(); } catch (e) { toast(e.message); } };
  const week = lg && sortedWeeks(lg).find((w) => w.id === wid);
  const ents = week ? weekEntrants(lg, week, hcp) : [];
  const course = week ? courseForWeek(lg, week) : null;
  const people = lg ? [...lg.players, ...(lg.subPlayers || []).map((p) => ({ ...p, isSub: true }))] : [];

  return (
    <Sheet open wide onClose={onClose} title={meta.name} subtitle={`${meta.season || ''} · owner ${meta.owner_email || '?'} · admin view: changes are logged`}>
      {err && <div className="banner err">{err}</div>}
      {!lg ? <p className="muted">Loading…</p> : (
        <div className="stack" data-testid="admin-league">
          <div className="card flat" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title">Members</div>
            {(lg.members || []).map((m) => (
              <div key={m.user_id} className="admin-row">
                <div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{m.display_name || m.email}</b><div className="sub">{m.email}</div></div>
                <select className="input" style={{ height: 34 }} value={m.player_id || ''} onChange={(e) => act('Player slot updated', () => store.admin('admin_set_member', { p_league: lg.id, p_user: m.user_id, p_role: m.role, p_player: e.target.value || null }))}>
                  <option value="">No player</option>{lg.players.map((p) => <option key={p.id} value={p.id}>{shortName(p.name)}</option>)}
                </select>
                <div className="row" style={{ gap: 6 }}>
                  <select className="input" style={{ height: 34, width: 140 }} value={m.role} onChange={(e) => act('Role updated', () => store.admin('admin_set_member', { p_league: lg.id, p_user: m.user_id, p_role: e.target.value, p_player: m.player_id }))}>
                    <option value="player">Player</option><option value="commissioner">Commissioner</option>
                  </select>
                  <button className="icon-btn" aria-label="Remove member" onClick={() => confirm(`Remove ${m.email} from ${lg.name}?`) && act('Member removed', () => store.admin('admin_set_member', { p_league: lg.id, p_user: m.user_id, p_role: m.role, p_remove: true }))}><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input grow" list="admin-emails" placeholder="Add someone by email (they need an account)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <datalist id="admin-emails">{users.map((u) => <option key={u.id} value={u.email} />)}</datalist>
              <button className="btn sm" disabled={!email.includes('@')} onClick={() => act(`${email} added`, async () => { await store.admin('admin_add_member', { p_league: lg.id, p_email: email, p_role: 'player' }); setEmail(''); })}>Add</button>
            </div>
          </div>

          <div className="card flat" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title">Handicaps</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 6px' }}>Set an override to correct a handicap; clear it to go back to the calculated index.</p>
            {people.map((p) => <PlayerFix key={p.id} p={p} c={hcp.current[p.id]} rounds={hcp.log[p.id]?.length || 0}
              onSave={(patch, why) => act(`${p.name} updated`, () => store.admin('admin_update_player', { p_league: lg.id, p_player: p.id, p_patch: patch, p_reason: why }))} />)}
          </div>

          <div className="card flat" style={{ background: 'var(--surface-2)' }}>
            <div className="row spread wrap"><div className="card-title">Cards</div>
              <div className="chips" style={{ margin: 0 }}>{sortedWeeks(lg).map((w) => <button key={w.id} className={`chip ${w.id === wid ? 'on' : ''}`} onClick={() => setWid(w.id)}>W{w.number}</button>)}</div></div>
            {!week ? <p className="muted">No weeks yet.</p> : <>
              <div className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>{fmtDate(week.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {course?.name}{course?.tees ? ` (${course.tees})` : ''} · {course?.rating}/{course?.slope}</div>
              {ents.map((e) => (
                <div key={e.key} className="admin-row">
                  <div style={{ minWidth: 0 }}><b>{e.name}</b> {e.isSub && <span className="badge sub">Sub</span>}{e.out && <span className="badge out">Out</span>}{e.status === 'pending' && <span className="badge pending">Pending</span>}<div className="sub num">{e.holes.map((h) => h ?? '·').join(' ')}</div></div>
                  <div className="sub">{e.gross != null ? `${e.gross} gross · net ${e.net}` : e.entered ? `thru ${e.entered}` : 'no card'}</div>
                  <div className="row" style={{ gap: 6 }}>
                    {!e.out && <button className="btn xs" onClick={() => setEdit({ key: e.key, name: e.name, holes: e.holes.map((h) => h ?? ''), status: e.status || 'approved' })}>{e.entered ? 'Fix' : 'Enter'}</button>}
                    {week.scores?.[e.key] && <button className="icon-btn" aria-label="Delete card" onClick={() => { const why = prompt(`Delete ${e.name}'s week ${week.number} card? Reason (logged):`); if (why !== null) act('Card deleted', () => store.admin('admin_delete_score', { p_league: lg.id, p_week: week.id, p_key: e.key, p_reason: why })); }}><Icon name="trash" size={15} /></button>}
                  </div>
                </div>
              ))}
            </>}
          </div>
        </div>
      )}
      {edit && week && (
        <Sheet open onClose={() => setEdit(null)} title={`${edit.name} · week ${week.number}`} subtitle="Saved straight to the league and logged in the audit log."
          footer={<><span className="grow" /><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" disabled={edit.holes.some((h) => !(Number(h) >= 1 && Number(h) <= 20))} onClick={() => { const why = edit.reason || ''; const holes = edit.holes.map(Number); setEdit(null); act('Card corrected', () => store.admin('admin_set_score', { p_league: lg.id, p_week: week.id, p_key: edit.key, p_holes: holes, p_status: edit.status, p_reason: why })); }} data-testid="admin-save-card">Save card</button></>}>
          <div className="stack">
            <div className="hole-grid">
              <span className="lab">Hole</span>{Array.from({ length: HOLES }, (_, i) => <span key={i} className="hd">{i + 1}</span>)}
              <span className="lab">Par</span>{course.holes.map((h, i) => <span key={i} className="hd muted">{h.par}</span>)}
              <span className="lab">Score</span>{edit.holes.map((h, i) => <input key={i} className="input" inputMode="numeric" value={h} aria-label={`Hole ${i + 1}`} onChange={(ev) => { const holes = edit.holes.slice(); holes[i] = ev.target.value.replace(/\D/g, '').slice(0, 2); setEdit({ ...edit, holes }); }} />)}
            </div>
            <div className="row wrap"><span className="muted" style={{ fontSize: 13 }}>Status</span><Seg value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }]} /></div>
            <label className="field"><span>Reason (shows in the audit log)</span><input className="input" value={edit.reason || ''} onChange={(ev) => setEdit({ ...edit, reason: ev.target.value })} placeholder="e.g. Player typo on hole 4" /></label>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

function PlayerFix({ p, c, rounds, onSave }) {
  const [v, setV] = useState(p.manualIndex ?? '');
  useEffect(() => setV(p.manualIndex ?? ''), [p.manualIndex]);
  const changed = String(v) !== String(p.manualIndex ?? '');
  return (
    <div className="admin-row">
      <div className="row" style={{ minWidth: 0 }}><Avatar name={p.name} color={p.color} size="sm" sub={p.isSub} /><div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{p.name}</b><div className="sub">{p.isSub ? 'Sub · ' : ''}{rounds} rounds · {c?.method === 'manual' ? 'override' : c?.method === 'whs' ? 'calculated' : 'starting index'}</div></div></div>
      <div className="display num" style={{ fontSize: 22 }}>{fmtIdx(c?.index ?? 0)}</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" style={{ width: 92, height: 34 }} inputMode="decimal" placeholder="Override" value={v} onChange={(e) => setV(e.target.value)} aria-label={`${p.name} index override`} />
        <button className="btn xs" disabled={!changed || (v !== '' && !Number.isFinite(Number(v)))} onClick={() => { const why = prompt(`Why change ${p.name}'s handicap? (logged)`, ''); if (why !== null) onSave({ manualIndex: v === '' ? null : Number(v) }, why); }}>Save</button>
      </div>
    </div>
  );
}
