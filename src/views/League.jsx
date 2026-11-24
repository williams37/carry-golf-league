import { useEffect, useState } from 'react';
import { Icon, Switch, Seg, Avatar, shortName } from '../components/ui.jsx';
import { settingsOf, DEFAULT_SETTINGS, closeSeason, seasonAsLeague, computeHandicaps, standings, seasonSkins, sortedWeeks } from '../lib/golf.js';
import { Sheet, money, fmtIdx } from '../components/ui.jsx';
import { demoLeague } from '../lib/seed.js';
import { cloudConfig, saveCloudConfig, hasBuiltInCloud } from '../config.js';
import { auth } from '../lib/store/cloud.js';
import { localStore } from '../lib/store/local.js';
import { EmailWorkbookSheet } from './EmailWorkbook.jsx';
import { workbookName } from '../lib/share.js';

function Setting({ label, desc, children }) {
  return <div className="setting"><div style={{ minWidth: 0 }}><div className="lbl">{label}</div>{desc && <div className="desc">{desc}</div>}</div><div style={{ flex: 'none' }}>{children}</div></div>;
}

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const fileSafe = (s) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');

export async function exportExcel(ctx, league = ctx.league) {
  ctx.toast('Building workbook…');
  const { buildWorkbook } = await import('../lib/excel.js');
  const blob = await buildWorkbook(league);
  download(workbookName(league), blob);
  ctx.toast('Excel workbook downloaded');
}

export default function League({ ctx }) {
  const { league, mutate, isCommissioner, toast, mode } = ctx;
  const s = settingsOf(league);
  const [name, setName] = useState(league.name);
  const [season, setSeason] = useState(league.season || '');
  const set = (fn) => mutate((l) => { l.settings = structuredClone(settingsOf(l)); fn(l.settings); });
  const [emailing, setEmailing] = useState(false);

  return (
    <>
      <div className="page-head"><div><div className="eyebrow">{mode === 'cloud' ? 'Cloud league' : 'Saved on this device'}</div><h1 className="page-title">League</h1></div></div>

      <div className="grid-2">
        <section className="card">
          <div className="card-title">League</div>
          <div className="stack" style={{ marginTop: 10 }}>
            <label className="field"><span>Name</span><input className="input" disabled={!isCommissioner} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== league.name && mutate((l) => { l.name = name; })} /></label>
            <label className="field"><span>Season</span><input className="input" disabled={!isCommissioner} value={season} onChange={(e) => setSeason(e.target.value)} onBlur={() => season !== league.season && mutate((l) => { l.season = season; })} /></label>
            <div className="row wrap">
              <button className="btn primary" onClick={() => exportExcel(ctx)}><Icon name="download" size={17} /> Export to Excel</button>
              <button className="btn" onClick={() => setEmailing(true)} data-testid="email-excel"><Icon name="mail" size={17} /> Email</button>
              <button className="btn" onClick={() => ctx.go('tv')}><Icon name="tv" size={17} /> TV board</button>
            </div>
          </div>
        </section>
        <Invites ctx={ctx} />
      </div>

      {isCommissioner && (
        <>
          <div className="h2">Scoring</div>
          <div className="grid-2">
            <section className="card">
              <div className="card-title">Handicaps & standings</div>
              <Setting label="Rounds before handicaps kick in" desc="Until then, everyone plays off their starting index (0 by default).">
                <select className="input" style={{ width: 84 }} value={s.minRounds} onChange={(e) => set((x) => (x.minRounds = +e.target.value))}>{[3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select>
              </Setting>
              <Setting label="Handicap allowance" desc="WHS recommends 100% for individual stroke play.">
                <select className="input" style={{ width: 96 }} value={s.allowance} onChange={(e) => set((x) => (x.allowance = +e.target.value))}>{[1, 0.95, 0.9, 0.85, 0.8].map((n) => <option key={n} value={n}>{Math.round(n * 100)}%</option>)}</select>
              </Setting>
              <Setting label="Include Rating − Par" desc="WHS course handicap formula. Turn off for a simpler Index × Slope/113.">
                <Switch on={s.includeCrMinusPar} onChange={(v) => set((x) => (x.includeCrMinusPar = v))} />
              </Setting>
              <Setting label="Maximum index" desc="9-hole scale. 27 ≈ half the WHS max of 54.">
                <input className="input" style={{ width: 84 }} inputMode="decimal" defaultValue={s.maxIndex} onBlur={(e) => set((x) => (x.maxIndex = +e.target.value || 27))} />
              </Setting>
              <Setting label="Missed weeks" desc="So skipping a bad night is never an advantage.">
                <select className="input" style={{ width: 168 }} value={s.absencePolicy} onChange={(e) => set((x) => (x.absencePolicy = e.target.value))}>
                  <option value="fieldMaxPlus1">Worst net + 1</option><option value="average">Own average</option><option value="skip">Skip</option>
                </select>
              </Setting>
              <Setting label="Count unapproved cards" desc="Off: player-entered cards wait for commissioner approval.">
                <Switch on={s.countPending} onChange={(v) => set((x) => (x.countPending = v))} />
              </Setting>
            </section>
            <section className="card">
              <div className="card-title">Skins</div>
              <Setting label="Scoring"><Seg value={s.skins.mode} onChange={(v) => set((x) => (x.skins.mode = v))} options={[{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }]} /></Setting>
              <Setting label="Carryovers" desc="A tied hole rolls into the next one."><Switch on={s.skins.carryover} onChange={(v) => set((x) => (x.skins.carryover = v))} /></Setting>
              <Setting label="Still tied after the 9th">
                <select className="input" style={{ width: 150 }} value={s.skins.endCarry} disabled={!s.skins.carryover} onChange={(e) => set((x) => (x.skins.endCarry = e.target.value))}><option value="split">Split among tied</option><option value="none">Unclaimed</option></select>
              </Setting>
              <Setting label="Buy-in per player" desc="Set to 0 to play for bragging rights.">
                <input className="input" style={{ width: 84 }} inputMode="decimal" defaultValue={s.skins.buyIn} onBlur={(e) => set((x) => (x.skins.buyIn = +e.target.value || 0))} />
              </Setting>
              <Setting label="Net skins allowance" desc="Many leagues give half strokes for skins.">
                <select className="input" style={{ width: 96 }} value={s.skins.netAllowance} disabled={s.skins.mode !== 'net'} onChange={(e) => set((x) => (x.skins.netAllowance = +e.target.value))}>{[1, 0.75, 0.5].map((n) => <option key={n} value={n}>{n * 100}%</option>)}</select>
              </Setting>
              <div className="card-title" style={{ marginTop: 14 }}>Simulator house rules</div>
              <Setting label="Putting" desc="Use one mode for the whole league.">
                <select className="input" style={{ width: 168 }} value={s.house.gimme} onChange={(e) => set((x) => (x.house.gimme = e.target.value))}>
                  <option value="off">Putt everything</option><option value="3ft">Gimme 3 ft</option><option value="5ft">Gimme 5 ft</option><option value="8ft">Gimme 8 ft</option><option value="auto">GSPro auto-putt</option>
                </select>
              </Setting>
              <Setting label="Mulligans per round">
                <select className="input" style={{ width: 84 }} value={s.house.mulligans} onChange={(e) => set((x) => (x.house.mulligans = +e.target.value))}>{[0, 1, 2].map((n) => <option key={n}>{n}</option>)}</select>
              </Setting>
            </section>
          </div>
        </>
      )}

      <div className="h2">Seasons</div>
      <Seasons ctx={ctx} />

      <EmailWorkbookSheet ctx={ctx} open={emailing} onClose={() => setEmailing(false)} />
      <div className="h2">Data</div>
      <DataCard ctx={ctx} />

      <div className="h2">Cloud sync</div>
      <CloudCard ctx={ctx} />

      <div className="h2">Appearance</div>
      <section className="card"><Setting label="Theme" desc="Dark looks great on a TV; light reads well outdoors."><Seg value={ctx.theme} onChange={ctx.setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Setting></section>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 24 }}>Carry · built for 9-hole sim leagues · v1.0</p>
    </>
  );
}

function Invites({ ctx }) {
  const { mode, league, isCommissioner, store, toast, reload, myPlayerId } = ctx;
  if (mode !== 'cloud') {
    return (
      <section className="card" style={{ background: 'linear-gradient(150deg, color-mix(in oklab, var(--aqua) 10%, var(--surface)), var(--surface))' }}>
        <div className="row"><Icon name="mail" size={20} style={{ color: 'var(--aqua)' }} /><div className="card-title">Invite players</div></div>
        <p className="t2" style={{ fontSize: 13.5 }}>Right now this league lives on this device. {hasBuiltInCloud() ? <>Sign in to <b>Carry Cloud</b></> : <>Turn on <b>cloud sync</b> (free Supabase project, about 5 minutes)</>} and everyone gets an invite link. They sign in, claim their player and enter their own cards, and the leaderboard updates live for all.</p>
        <div className="row wrap">
          {hasBuiltInCloud()
            ? <button className="btn primary" onClick={() => { if (league && !league.isDemo) localStorage.setItem('carry:pendingUpload', league.id); ctx.setMode('cloud'); location.reload(); }}><Icon name="cloud" size={17} /> Sign in to invite players</button>
            : <button className="btn primary" onClick={() => document.getElementById('cloud')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="cloud" size={17} /> Set up cloud sync</button>}
        </div>
      </section>
    );
  }
  const cfgSrc = ctx.cfg;
  // When the server address was typed into this browser (not baked into the build), carry it in the link
  const link = `${location.origin}${location.pathname}#/join/${league.inviteCode}` + (cfgSrc?.source === 'browser' ? `?u=${encodeURIComponent(cfgSrc.url)}&k=${encodeURIComponent(cfgSrc.key)}` : '');
  const members = league.members || [];
  const claimed = new Set(members.map((m) => m.player_id).filter(Boolean));
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { prompt('Copy this', t); } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: league.name, text: `Join ${league.name} on Carry. Code ${league.inviteCode}`, url: link }); } catch {} } else copy(link); };
  return (
    <section className="card">
      <div className="row spread"><div className="card-title">Invite players</div>{isCommissioner && <button className="btn xs ghost" onClick={async () => { await store.newInvite(league.id); reload(); toast('New invite code. The old one no longer works.'); }}>New code</button>}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="display num" style={{ fontSize: 34, letterSpacing: '.18em', flex: 1 }}>{league.inviteCode}</div>
        <button className="btn sm" onClick={() => copy(link)}><Icon name="link" size={15} /> Copy link</button>
        <button className="btn sm primary" onClick={share}>Share</button>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {members.map((m) => (
          <div key={m.user_id} className="row">
            <Avatar name={m.display_name || m.email || '?'} color="var(--aqua)" size="sm" />
            <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600 }}>{m.display_name || m.email}</div><div className="muted" style={{ fontSize: 12 }}>{m.role === 'commissioner' ? 'Commissioner' : 'Player'}</div></div>
            {isCommissioner ? (
              <select className="input" style={{ width: 150, height: 36 }} value={m.player_id || ''} onChange={async (e) => { await store.setMember(league.id, m.user_id, { player_id: e.target.value || null }); reload(); }}>
                <option value="">No player</option>{league.players.map((p) => <option key={p.id} value={p.id} disabled={claimed.has(p.id) && m.player_id !== p.id}>{shortName(p.name)}</option>)}
              </select>
            ) : <span className="muted" style={{ fontSize: 12.5 }}>{league.players.find((p) => p.id === m.player_id)?.name || 'Unclaimed'}</span>}
          </div>
        ))}
      </div>
      {!myPlayerId && !isCommissioner && <ClaimInline ctx={ctx} claimed={claimed} />}
    </section>
  );
}

export function ClaimInline({ ctx, claimed }) {
  const { league, store, reload, toast } = ctx;
  return (
    <div className="banner" style={{ marginTop: 12, display: 'grid' }}>
      <b>Which player are you?</b>
      <div className="row wrap" style={{ gap: 6 }}>
        {league.players.map((p) => (
          <button key={p.id} className="chip" disabled={claimed?.has(p.id)} onClick={async () => { try { await store.claim(league.id, p.id); await reload(); toast(`Welcome, ${shortName(p.name)}!`); } catch (e) { toast(e.message); } }}>
            <Avatar name={p.name} color={p.color} size="sm" /> {shortName(p.name)}
          </button>
        ))}
      </div>
    </div>
  );
}

function DataCard({ ctx }) {
  const { league, leagues, setActiveId, isCommissioner, toast, mode, store, refreshList } = ctx;
  const exportJson = () => download(`${fileSafe(league.name)}.carry.json`, new Blob([JSON.stringify(league, null, 2)], { type: 'application/json' }));
  const importJson = (file) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const l = JSON.parse(r.result);
        if (!l.players || !l.weeks || !l.courses) throw new Error('Not a Carry league file');
        if (mode === 'cloud') { const id = await store.createLeague(l); await refreshList(); setActiveId(id); }
        else { if (leagues.some((x) => x.id === l.id) && !confirm(`Replace "${l.name}" on this device with the file?`)) return; await store.createLeague(l); await refreshList(); setActiveId(l.id); }
        toast(`Imported ${l.name}`);
      } catch (e) { toast(`Import failed: ${e.message}`); }
    };
    r.readAsText(file);
  };
  return (
    <section className="card">
      <div className="row wrap">
        <button className="btn" onClick={exportJson}><Icon name="download" size={16} /> Backup (.json)</button>
        <label className="btn"><Icon name="upload" size={16} /> Import<input type="file" accept=".json,application/json" className="sr" onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} /></label>
        <button className="btn" onClick={ctx.openWelcome}><Icon name="plus" size={16} /> New league</button>
        {mode === 'local' && <button className="btn ghost" onClick={async () => { await localStore.createLeague(demoLeague()); await refreshList(); setActiveId('demo'); ctx.reload(); toast('Demo league reset'); }}>Reset demo</button>}
        {isCommissioner && leagues.length > 1 && <button className="btn ghost danger" onClick={async () => { if (!confirm(`Delete "${league.name}" permanently?`)) return; await store.deleteLeague(league.id); const l = await refreshList(); setActiveId(l[0]?.id); }}><Icon name="trash" size={16} /> Delete league</button>}
      </div>
      {leagues.length > 1 && (
        <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Switch league:</span>
          {leagues.map((l) => <button key={l.id} className={`chip ${l.id === league.id ? 'on' : ''}`} onClick={() => setActiveId(l.id)}>{l.name}{l.isDemo ? ' (demo)' : ''}</button>)}
        </div>
      )}
    </section>
  );
}

function CloudCard({ ctx }) {
  const { mode, setMode, toast, league, authState, cfg } = ctx;
  const [url, setUrl] = useState(cfg?.url || '');
  const [key, setKey] = useState(cfg?.key || '');
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(cfg?.source === 'browser');
  useEffect(() => { setUrl(cfg?.url || ''); setKey(cfg?.key || ''); }, [cfg?.url]); // eslint-disable-line
  const connect = async () => {
    if (!/^https:\/\/.+/.test(url) || key.length < 20) return toast('Paste your Supabase URL and anon key');
    saveCloudConfig({ url: url.trim(), key: key.trim() });
    if (league && !league.isDemo) localStorage.setItem('carry:pendingUpload', league.id);
    setMode('cloud'); location.reload();
  };
  if (mode === 'cloud') {
    return (
      <section className="card" id="cloud">
        <div className="row"><Icon name="cloud" size={20} style={{ color: 'var(--lime)' }} /><div className="grow"><b>Connected</b><div className="muted" style={{ fontSize: 12.5 }}>{authState.session?.user?.email} · {cfg?.url?.replace('https://', '')}</div></div></div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await auth.signOut(cfg); location.reload(); }}><Icon name="out" size={16} /> Sign out</button>
          <button className="btn ghost" onClick={() => { setMode('local'); location.reload(); }}>Use offline mode</button>
        </div>
      </section>
    );
  }
  if (hasBuiltInCloud() && !custom) {
    return (
      <section className="card" id="cloud">
        <div className="row"><Icon name="cloud" size={20} style={{ color: 'var(--aqua)' }} /><div className="grow"><b>Carry Cloud</b><div className="muted" style={{ fontSize: 12.5 }}>Sign in to share a league: invites, players' own cards, live leaderboard.</div></div></div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => { if (league && !league.isDemo) localStorage.setItem('carry:pendingUpload', league.id); saveCloudConfig(null); setMode('cloud'); location.reload(); }}><Icon name="cloud" size={16} /> Sign in</button>
          <button className="btn ghost" onClick={() => setCustom(true)}>Use my own Supabase project</button>
        </div>
        {league && !league.isDemo && <p className="muted" style={{ fontSize: 12 }}>After you sign in, Carry offers to upload "{league.name}" so your players can join it.</p>}
      </section>
    );
  }
  return (
    <section className="card" id="cloud">
      <p className="t2" style={{ marginTop: 0, fontSize: 13.5 }}>Cloud sync uses your own free <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a> project, so your data stays yours. Run <code>supabase/schema.sql</code> once, then paste the project URL and <b>anon public</b> key (Project Settings → API). Steps are in the README.</p>
      <div className="grid-2">
        <label className="field"><span>Project URL</span><input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <label className="field"><span>Anon public key</span><input className="input" placeholder="eyJhbGciOi…" value={key} onChange={(e) => setKey(e.target.value)} /></label>
      </div>
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={connect}><Icon name="cloud" size={16} /> Connect & sign in</button>
        {cloudConfig() && <button className="btn ghost" onClick={() => { saveCloudConfig(null); toast('Cloud settings cleared'); setUrl(''); setKey(''); }}>Clear</button>}
      </div>
      {league && !league.isDemo && <p className="muted" style={{ fontSize: 12 }}>After you sign in, Carry offers to upload "{league.name}" so your players can join it.</p>}
    </section>
  );
}

/** Close out a season (archived, still viewable and exportable) and start the next one without losing history. */
function Seasons({ ctx }) {
  const { league, isCommissioner, mutate, toast } = ctx;
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState(null);
  const archive = league.archive || [];
  const weeks = sortedWeeks(league);
  return (
    <section className="card" data-testid="seasons">
      <div className="row spread wrap" style={{ gap: 10 }}>
        <div><div className="card-title">{league.season || 'This season'}</div><div className="muted" style={{ fontSize: 12.5 }}>{weeks.length} week{weeks.length === 1 ? '' : 's'} played so far · current season</div></div>
        {isCommissioner && <button className="btn" disabled={!weeks.length} onClick={() => setClosing(true)} data-testid="season-close"><Icon name="archive" size={16} /> Close season</button>}
      </div>
      {archive.length > 0 && <div className="stack" style={{ marginTop: 12, gap: 0 }}>
        {[...archive].reverse().map((a) => {
          const champ = a.summary?.table?.filter((r) => r.place === 1) || [];
          return (
            <div key={a.id} className="admin-row" data-testid="season-row">
              <div style={{ minWidth: 0 }}><b>{a.season}</b><div className="sub">Closed {new Date(a.closedAt).toLocaleDateString()} · {a.summary?.weeks ?? a.weeks.length} weeks</div></div>
              <div className="ellipsis" style={{ fontSize: 13 }}>{champ.length ? <><Icon name="trophy" size={14} style={{ color: 'var(--gold)', verticalAlign: '-2px' }} /> {champ.map((r) => r.name).join(' & ')}</> : <span className="muted">No final weeks</span>}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn xs" onClick={() => setView(a)}>View</button>
                <button className="btn xs ghost" onClick={() => exportExcel(ctx, seasonAsLeague(league, a))} aria-label={`Excel for ${a.season}`}><Icon name="download" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>}
      {!archive.length && <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>When the season ends, close it here. It's archived with every card, standings and skins, and you start fresh with the same players.</p>}
      {closing && <CloseSeasonSheet ctx={ctx} onClose={() => setClosing(false)} onDone={(name) => { setClosing(false); toast(`${league.season} archived. ${name} is under way.`); }} mutate={mutate} />}
      {view && <SeasonSheet ctx={ctx} entry={view} onClose={() => setView(null)} />}
    </section>
  );
}

function nextSeasonName(cur) {
  const m = String(cur || '').match(/^(.*?)(\d{4})$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${cur || 'Season'} 2`;
}

function CloseSeasonSheet({ ctx, onClose, onDone, mutate }) {
  const { league, derived } = ctx;
  const [name, setName] = useState(nextSeasonName(league.season));
  const [carry, setCarry] = useState(true);
  const table = standings(league, Infinity, derived.hcp);
  const champ = table.filter((r) => r.place === 1 && r.played > 0);
  const go = () => {
    const nm = name.trim() || nextSeasonName(league.season);
    mutate((l) => { const n = closeSeason(l, { nextSeason: nm, carryIndex: carry }); for (const k of Object.keys(l)) delete l[k]; Object.assign(l, n); });
    onDone(nm);
  };
  return (
    <Sheet open onClose={onClose} title={`Close ${league.season || 'the season'}`} subtitle="The season is archived with every card, the final table and skins. Nothing is deleted."
      footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go} data-testid="season-confirm"><Icon name="archive" size={16} /> Close and start {name.trim() || 'next season'}</button></>}>
      <div className="stack">
        {champ.length > 0 && <div className="banner"><Icon name="trophy" size={20} style={{ color: 'var(--gold)', flex: 'none' }} /><span>Champion: <b>{champ.map((r) => r.name).join(' & ')}</b> · {champ[0].total} net over {champ[0].rounds.length} weeks</span></div>}
        <label className="field"><span>Next season's name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="season-name" /></label>
        <Setting label="Carry handicaps over" desc="Everyone starts next season on the index they finished with (subs too). Off: back to their starting index.">
          <Switch on={carry} onChange={setCarry} />
        </Setting>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Players, subs, courses, settings and invites stay. Week 1 of the new season starts empty. Past seasons stay viewable here and export to Excel any time.</p>
      </div>
    </Sheet>
  );
}

function SeasonSheet({ ctx, entry, onClose }) {
  const lg = seasonAsLeague(ctx.league, entry);
  const hcp = computeHandicaps(lg);
  const table = standings(lg, Infinity, hcp);
  const sk = seasonSkins(lg, hcp);
  return (
    <Sheet open wide onClose={onClose} title={entry.season} subtitle={`Archived ${new Date(entry.closedAt).toLocaleDateString()} · ${entry.weeks.length} weeks`}
      footer={<><span className="grow" /><button className="btn" onClick={() => exportExcel(ctx, lg)}><Icon name="download" size={16} /> Excel</button><button className="btn primary" onClick={onClose}>Done</button></>}>
      <div className="grid-2">
        <div>
          <div className="eyebrow">Final standings</div>
          <div className="tbl-wrap" style={{ marginTop: 6 }}><table className="tbl">
            <thead><tr><th>#</th><th>Player</th><th className="r">Net</th><th className="r">Rds</th><th className="r">Index</th></tr></thead>
            <tbody>{table.map((r) => <tr key={r.id} className={r.place === 1 ? 'used' : ''}><td>{r.place}</td><td>{r.name}</td><td className="r"><b>{r.total}</b></td><td className="r">{r.played}</td><td className="r muted">{fmtIdx(hcp.current[r.id]?.index ?? 0)}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div>
          <div className="eyebrow">Skins money</div>
          <div className="stack" style={{ marginTop: 6, gap: 6 }}>
            {sk.length ? sk.map((t) => <div key={t.id} className="row spread"><span>{t.name} {t.isSub && <span className="badge sub">Sub</span>}</span><b className="num">{money(t.money)}</b></div>) : <span className="muted">No skins.</span>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export { DEFAULT_SETTINGS };
