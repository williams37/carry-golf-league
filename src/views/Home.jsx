import { Icon, Avatar, Sparkline, fmtIdx, money, shortName, Empty } from '../components/ui.jsx';
import { currentWeek, weekState, standingsWithMovement, indexTrend, fmtDate, finalWeekNumbers } from '../lib/helpers.js';
import { teamResults, weekHighlights, weekSkins, seasonSkins, sortedWeeks, playerById } from '../lib/golf.js';

function Arc() {
  return (
    <svg className="hero-arc" viewBox="0 0 400 200" aria-hidden="true">
      <defs>
        <linearGradient id="arcg" x1="0" x2="1"><stop offset="0" stopColor="#4fe3c1" stopOpacity="0" /><stop offset=".35" stopColor="#4fe3c1" /><stop offset="1" stopColor="#c6f36d" /></linearGradient>
      </defs>
      <path d="M10 190 C 120 -20, 300 -10, 372 120" stroke="url(#arcg)" strokeWidth="3" fill="none" strokeLinecap="round" className="draw" style={{ '--len': 560 }} />
      <circle cx="372" cy="120" r="6" fill="#fff" stroke="var(--line-2)" strokeWidth="1.5" className="rise" style={{ animationDelay: '1.1s' }} />
      <path d="M372 126 v40" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="2 4" />
    </svg>
  );
}

export default function Home({ ctx }) {
  const { league, derived, go, myPlayerId, isCommissioner } = ctx;
  const { hcp } = derived;
  const wk = currentWeek(league, hcp);
  if (!wk) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Clubhouse</h1></div>
        <Empty icon="calendar" title="Your season starts here" action={<button className="btn primary" onClick={() => go('scores')}><Icon name="plus" size={18} /> Schedule week 1</button>}>
          Add a course, then schedule the first week. Carry builds the teams for you.
        </Empty>
      </>
    );
  }
  const st = weekState(league, wk, hcp);
  const finals = finalWeekNumbers(league, hcp);
  const lastFinal = finals.length ? sortedWeeks(league).find((w) => w.number === finals[finals.length - 1]) : null;
  const table = finals.length ? standingsWithMovement(league, finals[finals.length - 1], hcp) : [];
  const pending = sortedWeeks(league).flatMap((w) => Object.entries(w.scores || {}).filter(([, s]) => s.status === 'pending').map(([k]) => ({ w, k })));
  const me = myPlayerId ? playerById(league, myPlayerId) : null;
  const myRow = me && wk ? st.ents.find((e) => e.regularId === me.id) : null;
  const seasonSk = seasonSkins(league, hcp).slice(0, 3);

  let recap = null;
  if (lastFinal) {
    const lw = weekState(league, lastFinal, hcp);
    const teams = teamResults(league, lastFinal, lw.ents);
    recap = { w: lastFinal, ...lw, teams, hl: weekHighlights(league, lastFinal, lw.ents), sk: weekSkins(league, lastFinal, lw.ents) };
  }

  return (
    <>
      {league.isDemo && (
        <div className="banner rise" style={{ marginTop: 6 }}>
          <Icon name="spark" size={20} style={{ color: 'var(--aqua)', flex: 'none' }} />
          <div className="grow"><b>You're exploring a demo league.</b> <span className="t2">Seven weeks of real scoring math, subs and skins carryovers. Change anything you like.</span></div>
          <button className="btn sm" onClick={ctx.openWelcome}>Start mine</button>
        </div>
      )}

      <section className="card hero rise" style={{ marginTop: 14 }}>
        <Arc />
        <div className="row" style={{ gap: 8 }}>
          <span className="eyebrow">Week {wk.number} · {fmtDate(wk.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          {st.final ? <span className="badge final">Final</span> : <span className="badge live">● Live</span>}
        </div>
        <h2>{st.course?.name || 'Course TBD'}</h2>
        <div className="t2" style={{ fontSize: 14 }}>{st.course?.tees ? `${st.course.tees} tees · ` : ''}9 holes · GSPro difficulty {st.course?.gspro ?? '–'}</div>
        <div className="hero-stats">
          <div className="stat"><div className="v num">{st.course?.par}</div><div className="k">Par</div></div>
          <div className="stat"><div className="v num">{st.course?.rating}</div><div className="k">Rating</div></div>
          <div className="stat"><div className="v num">{st.course?.slope}</div><div className="k">Slope</div></div>
          <div className="stat"><div className="v num">{st.done}<span className="muted" style={{ fontSize: 16 }}>/{st.ents.length}</span></div><div className="k">Cards in</div></div>
        </div>
        <div className="moneybar" style={{ marginTop: 14, height: 6 }}><i style={{ width: `${(st.done / st.ents.length) * 100}%`, background: 'var(--tracer)' }} /></div>
        <div className="row wrap" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => go(`scores/${wk.id}`)}><Icon name="edit" size={17} /> {myRow ? (myRow.complete ? 'View my card' : 'Enter my card') : 'Enter scores'}</button>
          <button className="btn" onClick={() => go('tv')}><Icon name="tv" size={17} /> TV board</button>
        </div>
      </section>

      {isCommissioner && pending.length > 0 && (
        <div className="banner warn rise rise-1" style={{ marginTop: 12 }}>
          <Icon name="info" size={20} style={{ color: 'var(--gold)', flex: 'none' }} />
          <div className="grow"><b>{pending.length} card{pending.length > 1 ? 's' : ''} waiting for approval.</b> <span className="t2">Players entered these themselves.</span></div>
          <button className="btn sm" onClick={() => go(`scores/${pending[0].w.id}`)}>Review</button>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 14 }}>
        <section className="card pad-0 rise rise-1">
          <div className="row spread" style={{ padding: '14px 16px 8px' }}>
            <div><div className="card-title">Season standings</div><div className="muted" style={{ fontSize: 12.5 }}>{finals.length ? `Through week ${finals[finals.length - 1]} · lowest net wins` : 'No completed weeks yet'}</div></div>
            <button className="btn ghost sm" onClick={() => go('table')}>All <Icon name="chev" size={16} /></button>
          </div>
          {!table.length && <p className="muted" style={{ padding: '0 16px 16px', margin: 0, fontSize: 13.5 }}>The table fills in once week 1 is final. Until then, follow the live cards on the Scores tab.</p>}
          <div className="lb">
            {table.slice(0, 5).map((r) => (
              <div key={r.id} className={`lb-row ${r.place === 1 ? 'leader' : ''}`}>
                <div className="pos num">{r.place}</div>
                <div className={`mv ${r.move > 0 ? 'up' : r.move < 0 ? 'down' : 'same'}`}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : '–'}</div>
                <Avatar name={r.name} color={r.color} />
                <div style={{ minWidth: 0 }}><div className="lb-name ellipsis">{shortName(r.name)}</div><div className="lb-sub">{r.played} rds · avg {r.avg ?? '–'}</div></div>
                <Sparkline values={r.rounds.map((x) => x.net)} />
                <div className="tot num">{r.total}</div>
              </div>
            ))}
          </div>
        </section>

        {recap ? (
          <section className="card rise rise-2">
            <div className="row spread"><div><div className="card-title">Week {recap.w.number} recap</div><div className="muted" style={{ fontSize: 12.5 }}>{recap.course?.name}</div></div>
              <button className="btn ghost sm" onClick={() => go(`scores/${recap.w.id}`)}>Card <Icon name="chev" size={16} /></button></div>
            <div className="stack" style={{ marginTop: 12 }}>
              {recap.teams[0]?.complete && (
                <div className="row" style={{ padding: 12, borderRadius: 14, background: 'color-mix(in oklab, var(--gold) 10%, var(--surface-2))', border: '1px solid color-mix(in oklab, var(--gold) 30%, transparent)' }}>
                  <Icon name="trophy" size={22} style={{ color: 'var(--gold)' }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="eyebrow" style={{ color: 'var(--gold)' }}>Winning team</div>
                    <div style={{ fontWeight: 650 }} className="ellipsis">{recap.teams.filter((t) => t.winner).map((t) => t.members.map((m) => shortName(m.name) + (m.isSub ? ' (sub)' : '')).join(' & ')).join(' · ')}</div>
                  </div>
                  <div className="display num" style={{ fontSize: 26 }}>{recap.teams[0].net}</div>
                </div>
              )}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                <Mini k="Low net" v={recap.hl?.lowNetScore} who={recap.hl?.lowNet.map((e) => shortName(e.name)).join(', ')} />
                <Mini k="Low gross" v={recap.hl?.lowGrossScore} who={recap.hl?.lowGross.map((e) => shortName(e.name)).join(', ')} />
                <Mini k="Birdies" v={recap.hl?.birdies + recap.hl?.eagles} who={recap.hl?.eagles ? `${recap.hl.eagles} eagle${recap.hl.eagles > 1 ? 's' : ''}+` : 'across the field'} />
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Skins ({money(recap.sk.pot)} pot):</span>
                {Object.entries(recap.sk.byKey).map(([k, v]) => {
                  const e = recap.ents.find((x) => x.key === k);
                  return <span key={k} className="chip" style={{ height: 28, fontSize: 12 }}>{shortName(e.name)}{e.isSub && <span className="badge sub" style={{ height: 16 }}>Sub</span>} · {money(v.money)}</span>;
                })}
                {!Object.keys(recap.sk.byKey).length && <span className="muted">No skins won, all carried.</span>}
              </div>
            </div>
          </section>
        ) : <div />}
      </div>

      <div className="h2">Handicaps</div>
      <div className="chips" style={{ paddingBottom: 10 }}>
        {league.players.map((p, i) => {
          const c = hcp.current[p.id];
          return (
            <button key={p.id} className="card link rise" style={{ flex: 'none', width: 168, padding: 14, textAlign: 'left', animationDelay: `${i * 0.04}s` }} onClick={() => go(`players/${p.id}`)}>
              <div className="row"><Avatar name={p.name} color={p.color} size="sm" /><div className="ellipsis" style={{ fontWeight: 650, fontSize: 13.5 }}>{shortName(p.name)}</div></div>
              <div className="row spread" style={{ marginTop: 10, alignItems: 'flex-end' }}>
                <div><div className="display num" style={{ fontSize: 28, lineHeight: 1 }}>{fmtIdx(c.index)}</div><div className="muted" style={{ fontSize: 11 }}>{c.method === 'whs' ? `${c.rounds} rounds` : c.method === 'manual' ? 'Set by commish' : `Starting · ${c.rounds}/4`}</div></div>
                <Sparkline values={indexTrend(league, hcp, p.id)} width={64} height={30} color={p.color} />
              </div>
            </button>
          );
        })}
      </div>

      {seasonSk.length > 0 && (
        <>
          <div className="h2">Skins money</div>
          <div className="grid-3">
            {seasonSk.map((t, i) => (
              <div key={t.id} className={`card rise rise-${i + 1}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className="coin won" style={{ width: 40, height: 40, fontSize: 14 }}>{i + 1}</div>
                <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 650 }}>{shortName(t.name)} {t.isSub && <span className="badge sub">Sub</span>}</div><div className="muted" style={{ fontSize: 12 }}>{Math.round(t.units * 10) / 10} skins · weeks {t.weeks.join(', ')}</div></div>
                <div className="display num" style={{ fontSize: 24 }}>{money(t.money)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Mini({ k, v, who }) {
  return (
    <div style={{ padding: 10, borderRadius: 12, background: 'var(--surface-2)', minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 10 }}>{k}</div>
      <div className="display num" style={{ fontSize: 24, lineHeight: 1.1 }}>{v ?? '–'}</div>
      <div className="muted ellipsis" style={{ fontSize: 11.5 }}>{who}</div>
    </div>
  );
}
