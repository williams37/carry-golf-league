import { useState } from 'react';
import { Icon, Avatar, shortName, money, Empty, nick } from '../components/ui.jsx';
import { weekState } from '../lib/helpers.js';
import { weekSkins, seasonSkins, settingsOf, skinsPayout } from '../lib/golf.js';

export function CarryTrack({ skins, ents, big }) {
  const name = (k) => { const e = ents.find((x) => x.key === k); return e ? nick(e.name) : ''; };
  const xs = (i) => ((i + 0.5) / 9) * 900;
  const arcs = [];
  skins.holes.forEach((h, j) => {
    const resolves = h.winner || h.split || (h.carriedOut && j === skins.holes.length - 1);
    if (h.carriedIn > 0 && resolves) {
      for (let i = j - h.carriedIn; i < j; i++) {
        const span = j - i;
        arcs.push(<path key={`${i}-${j}`} className={h.winner || h.split ? 'win' : ''} vectorEffect="non-scaling-stroke"
          d={`M${xs(i)},70 Q${(xs(i) + xs(j)) / 2},${Math.max(-30, 34 - span * 22)} ${xs(j)},70`} />);
      }
    }
  });
  return (
    <div className="track" style={big ? { fontSize: '1.1em' } : undefined}>
      <svg className="track-svg" viewBox="0 0 900 80" preserveAspectRatio="none">{arcs}</svg>
      <div className="track-holes">
        {skins.holes.map((h) => {
          const cls = h.winner ? 'won' : h.split ? 'split' : h.carriedOut ? 'carry' : '';
          return (
            <div key={h.hole} className="track-node">
              <div className={`coin ${cls}`} title={h.winner ? `${name(h.winner)} wins ${h.units}` : 'Tied'}>
                {h.winner ? (h.units > 1 ? `×${h.units}` : '1') : h.split ? '½' : h.carriedOut ? '→' : '–'}
              </div>
              <div className="track-label">
                <div style={{ color: 'var(--text-2)', fontWeight: 700 }}>{h.hole}</div>
                <div className="ellipsis" style={{ color: h.winner ? 'var(--gold)' : undefined }}>{h.winner ? name(h.winner) : h.split ? 'Split' : h.carriedOut ? '' : 'Push'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Skins({ ctx }) {
  const { league, derived, go } = ctx;
  const weeks = derived.weeks;
  const [wid, setWid] = useState(() => {
    const finals = weeks.filter((w) => weekState(league, w, derived.hcp).final);
    return (finals[finals.length - 1] || weeks[weeks.length - 1])?.id;
  });
  const s = settingsOf(league).skins;
  const season = seasonSkins(league, derived.hcp);
  const week = weeks.find((w) => w.id === wid);
  if (!week) return <><div className="page-head"><h1 className="page-title">Skins</h1></div><Empty icon="coin" title="No skins yet">Skins appear once two or more players post full cards in a week.</Empty></>;
  const st = weekState(league, week, derived.hcp);
  const sk = weekSkins(league, week, st.ents);
  const max = Math.max(1, ...season.map((t) => t.money));
  const pay = skinsPayout(league, week, sk);
  const sitting = st.ents.filter((e) => !e.out && !e.skins);
  const nm = (k) => { const e = st.ents.find((x) => x.key === k); return e ? shortName(e.name) : ''; };

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">{s.mode === 'net' ? 'Net' : 'Gross'} skins · {s.carryover ? 'carryovers on' : 'no carryovers'} · ${s.buyIn}/player</div><h1 className="page-title">Skins</h1></div>
        {ctx.isCommissioner && <button className="icon-btn" aria-label="Skins settings" onClick={() => go('league')}><Icon name="gear" size={18} /></button>}
      </div>
      <div className="chips">
        {weeks.map((w) => <button key={w.id} className={`chip ${w.id === wid ? 'on' : ''}`} onClick={() => setWid(w.id)}>Week {w.number}</button>)}
      </div>

      <section className="card rise" style={{ marginTop: 8 }}>
        <div className="row spread wrap">
          <div><div className="card-title">{st.course?.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{sk.field.length} in the pot{!st.final && ' · provisional, week is live'}</div></div>
          <div className="row" style={{ gap: 18 }}>
            <div className="stat"><div className="v num">{money(sk.pot)}</div><div className="k">Pot</div></div>
            <div className="stat"><div className="v num">{Math.round(sk.awardedUnits * 10) / 10}</div><div className="k">Skins</div></div>
            <div className="stat"><div className="v num">{sk.unitValue ? money(sk.unitValue) : '–'}</div><div className="k">Per skin</div></div>
          </div>
        </div>
        {sk.holes.length ? <CarryTrack skins={sk} ents={st.ents} /> : <p className="muted">Waiting for at least two complete cards.</p>}
        {sk.unclaimed > 0 && <div className="banner warn" style={{ marginTop: 10 }}><Icon name="info" size={18} />{sk.unclaimed} skin{sk.unclaimed > 1 ? 's' : ''} left unclaimed after the 9th.</div>}
      </section>

      {sk.holes.length > 0 && (
        <>
          <div className="h2">Hole by hole</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Player</th>{sk.holes.map((h) => <th key={h.hole} className="c">{h.hole}</th>)}<th className="r">Won</th></tr></thead>
              <tbody>
                {sk.field.map((e) => (
                  <tr key={e.key}>
                    <td><span className="row" style={{ gap: 6 }}><span className="ellipsis" style={{ maxWidth: 120, fontWeight: 600 }}>{shortName(e.name)}</span>{e.isSub && <span className="badge sub">Sub</span>}</span></td>
                    {sk.holes.map((h) => {
                      const sc = h.scores.find((x) => x.key === e.key);
                      const win = h.winner === e.key || h.split?.includes(e.key);
                      const low = sc.score === h.low;
                      return (
                        <td key={h.hole} className="c" style={{ fontWeight: win ? 800 : 500, color: win ? 'var(--gold)' : low ? 'var(--text)' : 'var(--muted)' }}>
                          {sc.gross}{sc.dot > 0 && s.mode === 'net' && <sup style={{ color: 'var(--aqua)' }}>{'•'.repeat(sc.dot)}</sup>}
                        </td>
                      );
                    })}
                    <td className="r"><b>{sk.byKey[e.key] ? money(sk.byKey[e.key].money) : '–'}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.mode === 'net' && <p className="muted" style={{ fontSize: 12 }}>Gross scores shown. Each • is a handicap stroke on that hole; the lowest net score wins the skin.</p>}
        </>
      )}

      <div className="h2">Settle up · week {week.number}</div>
      <section className="card rise" data-testid="skins-payout">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <div className="muted" style={{ fontSize: 12.5 }}>{pay.rows.length} bought in at {money(pay.buyIn)} · {money(pay.pot)} pot{pay.perSkin ? ` · ${money(pay.perSkin)} a skin` : ''}{!st.final && ' · provisional until the week is final'}</div>
          {pay.refund && <span className="badge pending">No skins won · buy-ins back</span>}
        </div>
        {pay.holes.length > 0 && (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {pay.holes.map((h) => <span key={h.hole} className="chip" style={{ height: 28, fontSize: 12 }}><b>#{h.hole}</b> {h.winners.map(nm).join(' & ')}{h.units > 1 ? ` ×${h.units}` : ''} · {money(h.value)}{h.winners.length > 1 ? ' each' : ''}</span>)}
          </div>
        )}
        {pay.rows.length ? (
          <div className="payout" style={{ marginTop: 10 }}>
            <div className="payout-row muted" style={{ fontSize: 11.5, paddingTop: 0 }}><span /><span>Player</span><span className="amt">Paid</span><span className="amt">Collects</span><span className="amt">Net</span></div>
            {pay.rows.map((r) => (
              <div key={r.key} className="payout-row">
                <Avatar name={r.name} color={r.color} sub={r.isSub} size="sm" />
                <span className="ellipsis" style={{ fontWeight: 600 }}>{r.name} {r.isSub && <span className="badge sub">Sub</span>}{r.holes.length > 0 && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}> · hole{r.holes.length > 1 ? 's' : ''} {r.holes.join(', ')}</span>}</span>
                <span className="amt muted">{money(r.paid)}</span>
                <span className="amt" style={{ fontWeight: 750, color: r.owed ? 'var(--gold)' : undefined }}>{r.owed ? money(r.owed) : '–'}</span>
                <span className={`amt ${r.net > 0 ? 'pos' : 'neg'}`}>{r.net > 0 ? '+' : r.net < 0 ? '−' : ''}{money(Math.abs(r.net))}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ marginBottom: 0 }}>Nobody is in the skins for this week yet. The commissioner ticks <b>Skins</b> next to each player who paid on the Scores tab.</p>}
        {sitting.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Not in the skins this week: {sitting.map((e) => shortName(e.name)).join(', ')}. They still count for teams and standings.</p>}
      </section>

      <div className="h2">Season money</div>
      {season.length ? (
        <div className="card stack">
          {season.map((t, i) => (
            <div key={t.id} className="row rise" style={{ animationDelay: `${i * 0.04}s` }}>
              <Avatar name={t.name} color={t.color} sub={t.isSub} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row spread"><span className="ellipsis" style={{ fontWeight: 600 }}>{t.name} {t.isSub && <span className="badge sub">Sub</span>}</span><b className="display num" style={{ fontSize: 18 }}>{money(t.money)}</b></div>
                <div className="moneybar" style={{ marginTop: 6 }}><i style={{ width: `${(t.money / max) * 100}%`, animationDelay: `${i * 0.05}s` }} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="muted">Season totals appear after the first final week.</p>}
    </>
  );
}
