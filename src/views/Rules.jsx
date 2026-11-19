import { useMemo, useState } from 'react';
import { Icon } from '../components/ui.jsx';
import { RULE_SECTIONS, WHS_SECTION, SIM_SECTION, PENALTY_TABLE, RULES_EDITION } from '../lib/rules.js';
import { settingsOf, gsproToSlope } from '../lib/golf.js';

const GIMME = { off: 'Putt everything out', '3ft': 'Gimmes inside 3 ft', '5ft': 'Gimmes inside 5 ft', '8ft': 'Gimmes inside 8 ft', auto: 'GSPro auto-putt' };

export function leagueRulesSection(league) {
  const s = settingsOf(league);
  const n = league.players.length;
  return {
    id: 'league', title: `${league.name} rules`, icon: 'flag', blurb: 'Generated from this league\'s settings, so it updates when they change.',
    items: [
      { t: 'Format', r: 'League', b: `${n} regular players. Each week is one 9-hole round on a different course, in individual stroke play off ${Math.round(s.allowance * 100)}% of course handicap.` },
      { t: 'Season standings', r: 'League', b: `Lowest cumulative net score wins the season. Regulars only. A missed week counts as ${s.absencePolicy === 'fieldMaxPlus1' ? "that week's highest regular net + 1" : s.absencePolicy === 'average' ? 'your own season-average net' : 'nothing (players with more rounds rank first)'}. A week counts once every card is in or the commissioner closes it.` },
      { t: 'Weekly teams', r: 'League', b: `Players are paired into ${Math.floor(n / 2)} two-player teams each week. The lowest combined net score wins the week. Partners rotate so nobody repeats until everyone has played together, and ties are broken by balancing handicaps.` },
      { t: 'Handicaps', r: 'League', b: `Everyone starts at their starting index (0 unless the commissioner sets it). After ${Math.max(3, s.minRounds)} rounds, your index is calculated WHS-style from 9-hole differentials: 113 ÷ Slope × (Adjusted Gross − Course Rating), best N of your last 20, updated every week and capped at ${s.maxIndex}. Course handicap = Index × Slope ÷ 113${s.includeCrMinusPar ? ' + (Rating − Par)' : ''}.` },
      { t: 'Score caps', r: 'League', b: 'For handicap purposes only, each hole counts at most net double bogey (par + 2 + your strokes on that hole), or par + 5 before you have an index. Your actual score always counts for the league.' },
      { t: 'Skins', r: 'League', b: `${s.skins.mode === 'net' ? 'Net' : 'Gross'} skins, $${s.skins.buyIn} per player each week. The lowest score on a hole wins it outright. ${s.skins.carryover ? `Ties carry to the next hole. Anything still carrying after the 9th is ${s.skins.endCarry === 'split' ? 'split among those tied on the 9th' : 'left unclaimed'}.` : 'Tied holes are void.'} The pot is divided by the number of skins won.` },
      { t: 'Substitutes', r: 'League', b: 'A regular can be replaced for a week by a sub with a temporary index. The sub\'s net score counts fully for the team, and subs can win skins. Subs never appear in season standings, and their rounds never touch a regular\'s handicap.' },
      { t: 'Simulator house rules', r: 'League', b: `${GIMME[s.house.gimme] || 'Putt everything out'}. ${s.house.mulligans ? `${s.house.mulligans} mulligan${s.house.mulligans > 1 ? 's' : ''} per round (not off the last tee shot).` : 'No mulligans.'} Clear misreads are re-hit without penalty.` },
      { t: 'GSPro slope mapping', r: 'League', b: `Slope = 55 + 10 × GSPro difficulty (0–10), so 5.8 ≈ ${gsproToSlope(5.8)} (standard) and 10 = ${gsproToSlope(10)}. Rating defaults to par + (slope − 113) ÷ 13. Real 9-hole ratings override both.` },
      { t: 'Scorekeeping', r: 'League', b: 'Players enter their own hole scores after the round. The commissioner can edit or approve any card. Hole-by-hole entry is required for skins and score caps.' },
    ],
  };
}

function hl(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{hl(text.slice(i + q.length), q)}</>;
}

export default function Rules({ ctx }) {
  const [q, setQ] = useState('');
  const [sec, setSec] = useState('all');
  const [open, setOpen] = useState({});
  const sections = useMemo(() => [leagueRulesSection(ctx.league), ...RULE_SECTIONS, WHS_SECTION, SIM_SECTION], [ctx.league]);
  const terms = q.trim().toLowerCase();
  const visible = sections
    .filter((s) => sec === 'all' || s.id === sec)
    .map((s) => ({ ...s, items: terms ? s.items.filter((it) => (it.t + ' ' + it.b + ' ' + it.r + ' ' + s.title).toLowerCase().includes(terms)) : s.items }))
    .filter((s) => s.items.length);
  const total = visible.reduce((a, s) => a + s.items.length, 0);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">{RULES_EDITION.label}</div><h1 className="page-title">Rules</h1></div>
      </div>
      <div className="card flat" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ position: 'relative' }}>
          <Icon name="search" size={18} style={{ position: 'absolute', left: 13, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search: bunker, out of bounds, flagstick, drop…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rules" />
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>Current edition: Rules of Golf 2023 (R&A / USGA), in force through 2027. Next edition: 1 Jan 2028. Tap a topic to expand it.</div>
        <div className="chips" style={{ margin: '0 -16px', paddingBottom: 2 }}>
          {[{ id: 'all', title: 'All' }, ...sections].map((s) => (
            <button key={s.id} className={`chip ${sec === s.id ? 'on' : ''}`} onClick={() => setSec(s.id)}>{s.id === 'league' ? 'Our league' : s.title}</button>
          ))}
        </div>
      </div>

      {terms && <p className="muted" style={{ fontSize: 13 }}>{total} result{total === 1 ? '' : 's'} for "{q}"</p>}

      {visible.map((s) => (
        <section key={s.id} style={{ marginTop: 18 }} className="rise">
          <div className="row" style={{ marginBottom: 8 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: s.id === 'league' ? 'var(--tracer)' : 'var(--surface-2)', display: 'grid', placeItems: 'center', color: s.id === 'league' ? '#08150e' : 'var(--accent)', flex: 'none' }}><Icon name={s.icon} size={20} /></div>
            <div><div className="display" style={{ fontSize: 20, fontWeight: 600 }}>{s.title}</div><div className="muted" style={{ fontSize: 12.5 }}>{s.blurb}</div></div>
          </div>
          <div className="card pad-0">
            {s.items.map((it, i) => {
              const k = s.id + i;
              const isOpen = terms || open[k];
              return (
                <div key={k} className="rule-item">
                  <button className="rule-q" aria-expanded={!!isOpen} onClick={() => setOpen({ ...open, [k]: !open[k] })}>
                    <span className="t">{hl(it.t, terms)}</span><span className="ref">{it.r}</span><Icon name="chev" size={16} />
                  </button>
                  {isOpen && <div className="rule-a">{hl(it.b, terms)}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {(sec === 'all' || sec === 'penalties') && !terms && (
        <section style={{ marginTop: 22 }}>
          <div className="display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Penalty quick reference</div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Situation</th><th>Penalty (stroke play)</th><th className="r">Rule</th></tr></thead>
            <tbody>{PENALTY_TABLE.map(([a, b, r]) => <tr key={a}><td style={{ whiteSpace: 'normal' }}>{a}</td><td style={{ whiteSpace: 'normal', fontWeight: 650 }}>{b}</td><td className="r muted">{r}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}

      <div className="card flat" style={{ marginTop: 20, background: 'var(--surface-2)' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={18} style={{ color: 'var(--aqua)', flex: 'none', marginTop: 2 }} />
          <div className="t2" style={{ fontSize: 13 }}>
            These are plain-English summaries written for Carry. They are not the official text. {RULES_EDITION.note} For the full Rules, interpretations and local rules:
            <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
              {RULES_EDITION.links.map((l) => <a key={l.href} className="btn sm" href={l.href} target="_blank" rel="noreferrer"><Icon name="link" size={14} /> {l.label}</a>)}
            </div>
          </div>
        </div>
      </div>

      <div className="card flat" style={{ marginTop: 12, background: 'var(--surface-2)' }} data-testid="about-credits">
        <div className="eyebrow">About Carry · credits</div>
        <p className="t2" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Course list courtesy of <a href="https://simulatorgolftour.com/courses/" target="_blank" rel="noopener">Simulator Golf Tour</a> (names, par, GSPro difficulty, scorecard images), refreshed weekly. Course styles and private-server courses come from <a href="https://pakgolfstudios.com/gspro-course-list/" target="_blank" rel="noopener">PakGolf Studios</a>. GSPro courses are free, community-built designs. Carry isn't affiliated with GSPro, SGT or PakGolf.
        </p>
      </div>
    </>
  );
}
