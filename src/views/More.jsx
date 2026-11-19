import { useState } from 'react';
import { Icon } from '../components/ui.jsx';
import { EmailWorkbookSheet } from './EmailWorkbook.jsx';
import { exportExcel } from './League.jsx';

const ITEMS = [
  { id: 'players', icon: 'users', t: 'Players', d: 'Handicaps, trends and how each was worked out' },
  { id: 'courses', icon: 'map', t: 'Courses', d: 'Weekly 9s with rating, slope and stroke index' },
  { id: 'rules', icon: 'book', t: 'Rules', d: 'Rules of Golf, handicaps and our league rules' },
  { id: 'league', icon: 'gear', t: 'League', d: 'Invites, scoring settings, cloud sync and data' },
  { id: 'tv', icon: 'tv', t: 'TV board', d: 'Full-screen leaderboard for the sim room' },
];

export default function More({ ctx }) {
  const [emailing, setEmailing] = useState(false);
  return (
    <>
      <div className="page-head"><h1 className="page-title">More</h1></div>
      <div className="stack">
        {ITEMS.map((it, i) => (
          <button key={it.id} className={`choice rise rise-${Math.min(i, 4)}`} onClick={() => ctx.go(it.id)}>
            <span className="ic"><Icon name={it.icon} size={22} /></span>
            <span className="grow"><b>{it.t}</b><small>{it.d}</small></span><Icon name="chev" />
          </button>
        ))}
        <div className="choice rise rise-4 excel-choice" style={{ cursor: 'default' }}>
          <span className="ic"><Icon name="download" size={22} /></span>
          <span className="grow" style={{ minWidth: 0 }}><b>Excel workbook</b><small>Players, courses, results, standings, skins</small></span>
          <span className="row excel-acts" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => exportExcel(ctx)} aria-label="Download Excel"><Icon name="download" size={15} /> Download</button>
            <button className="btn sm primary" onClick={() => setEmailing(true)} data-testid="email-excel"><Icon name="mail" size={15} /> Email</button>
          </span>
        </div>
      </div>
      <EmailWorkbookSheet ctx={ctx} open={emailing} onClose={() => setEmailing(false)} />
    </>
  );
}
