/**
 * Rules of Golf guide — plain-English summaries written for Carry (not the official text).
 * Edition: Rules of Golf 2023 (R&A / USGA), still in force through 2027; the next edition
 * takes effect 1 January 2028. Rule numbers are given so players can look up the full text.
 */
export const RULES_EDITION = {
  label: 'Rules of Golf · 2023 edition',
  note: 'In force through 2027. The next edition is due 1 Jan 2028. Optional Model Local Rules added in 2026 only apply when a committee adopts them.',
  links: [
    { label: 'USGA Rules of Golf', href: 'https://www.usga.org/content/usga/home-page/rules-hub.html' },
    { label: 'R&A Rules of Golf', href: 'https://www.randa.org/rog/the-rules-of-golf' },
    { label: 'USGA Rules of Handicapping', href: 'https://www.usga.org/handicapping/roh/rules-of-handicapping.html' },
  ],
};

export const RULE_SECTIONS = [
  {
    id: 'basics', title: 'The basics', icon: 'flag', blurb: 'Three ideas that settle most situations.',
    items: [
      { t: 'Play it as it lies', r: 'Rules 1.1, 8', b: 'Hit the ball from where it ended up and take the course as you find it. You only move the ball or change conditions when a rule specifically lets you.' },
      { t: 'Count every stroke', r: 'Rule 3.3', b: 'In stroke play you hole out on every hole and your score is every stroke you made plus any penalty strokes. If you skip holing out on a hole, you must correct it before teeing off on the next hole, or you are disqualified.' },
      { t: 'Two kinds of penalty', r: 'Rule 1.3c', b: 'Most breaches cost either one stroke or the "general penalty". In stroke play the general penalty is two strokes; in match play it is loss of the hole.' },
      { t: 'When unsure, play two balls', r: 'Rule 20.1c(3)', b: 'In stroke play, if you are not sure what to do, finish the hole with two balls, say which one you want to count, and ask the committee before you hand in your card.' },
      { t: 'Honesty and care', r: 'Rule 1.2', b: 'Players are expected to call penalties on themselves, show consideration for others, and look after the course. A committee can disqualify a player for serious misconduct.' },
    ],
  },
  {
    id: 'tee', title: 'Teeing area', icon: 'tee', blurb: 'Where each hole starts.',
    items: [
      { t: 'Where you may tee up', r: 'Rule 6.2b', b: 'The teeing area is a rectangle between the front of the two tee markers and two club-lengths deep. Your ball must be inside it; your feet can be outside.' },
      { t: 'Playing from outside it', r: 'Rule 6.1b', b: 'In stroke play, teeing off from outside the teeing area is the general penalty (two strokes) and you must replay from inside it. That first stroke does not count.' },
      { t: 'Ball falls off the tee', r: 'Rule 6.2b(5)', b: 'A ball is not in play until you make a stroke at it. If it falls off the tee or you knock it off while addressing it, re-tee it with no penalty. A whiff counts as a stroke.' },
      { t: 'Tidying the tee', r: 'Rule 6.2b(3)', b: 'On the teeing area you may press down or pull up grass, remove dew, and level the ground before playing. You may not move the tee markers.' },
    ],
  },
  {
    id: 'general', title: 'General area', icon: 'fairway', blurb: 'Fairway, rough, trees: everything that is not tee, bunker, penalty area or green.',
    items: [
      { t: "Don't improve your lie", r: 'Rule 8.1', b: 'You may not press down, bend or break things to improve the lie, your stance, your swing area or your line of play. Taking a fair stance and grounding the club lightly is fine.' },
      { t: 'Loose impediments', r: 'Rule 15.1', b: 'Twigs, leaves, stones and the like can be moved without penalty anywhere on the course. If your ball moves when you do it (other than on the green or tee), add one stroke and replace the ball.' },
      { t: 'Movable obstructions', r: 'Rule 15.2', b: 'Rakes, cans, bottles and other artificial things that can easily be moved can be taken away without penalty. If the ball moves, replace it without penalty.' },
      { t: 'Free relief from course conditions', r: 'Rule 16.1', b: "Cart paths, sprinkler heads, ground under repair, temporary water and animal holes give free relief. Find the nearest point where the condition no longer interferes, then drop within one club-length of that point, no closer to the hole." },
      { t: 'Embedded ball', r: 'Rule 16.3', b: "If your ball is stuck in its own pitch-mark in the general area, you get free relief: drop within one club-length behind the spot, no closer to the hole." },
      { t: 'Identifying your ball', r: 'Rule 7.3', b: 'You may lift your ball to identify it, but you have to mark it first and must not clean it more than you need to see your marking.' },
      { t: 'Wrong ball', r: 'Rule 6.3c', b: 'Playing a ball that is not yours is the general penalty (two strokes). Go back and play your own ball; strokes with the wrong ball do not count.' },
    ],
  },
  {
    id: 'bunker', title: 'Bunkers', icon: 'bunker', blurb: 'Specially prepared areas of sand.',
    items: [
      { t: "Don't test the sand", r: 'Rule 12.2b', b: 'Before your stroke you may not touch the sand with your hand or club to test it, touch the sand right in front of or behind the ball, or touch it on a practice swing or the backswing. Penalty: general penalty.' },
      { t: 'What you can do', r: 'Rule 12.2a', b: 'You may remove loose impediments and movable obstructions, lean on a club, dig your feet in for a stance, and rake after you play.' },
      { t: 'Unplayable in a bunker', r: 'Rule 19.3', b: 'For one stroke you can use the normal unplayable options and drop inside the bunker. For two strokes in total you may drop outside the bunker, going straight back on the line from the hole through the ball.' },
    ],
  },
  {
    id: 'penalty', title: 'Penalty areas', icon: 'water', blurb: 'Water hazards and other areas marked with red or yellow.',
    items: [
      { t: 'Play it from there', r: 'Rule 17.1b', b: 'You may play the ball as it lies in a penalty area with no penalty. You may ground your club and move loose impediments, just like the general area.' },
      { t: 'Relief for one stroke (yellow and red)', r: 'Rule 17.1d', b: 'Take stroke-and-distance (replay from where you last hit), or drop back on the line from the hole through the point where the ball last crossed the edge, as far back as you like.' },
      { t: 'Extra option for red', r: 'Rule 17.1d(3)', b: 'With red margins you may also drop within two club-lengths of where the ball last crossed the edge, no closer to the hole.' },
      { t: 'Knowing it went in', r: 'Rule 17.1c', b: 'You may only take penalty-area relief if it is known or virtually certain the ball is in the area. Otherwise a missing ball is a lost ball.' },
    ],
  },
  {
    id: 'green', title: 'Putting green', icon: 'green', blurb: 'The green has its own, friendlier set of rules.',
    items: [
      { t: 'Mark, lift and clean', r: 'Rule 13.1b', b: 'On the green you may mark, lift and clean your ball, then replace it on its spot.' },
      { t: 'Repair damage', r: 'Rule 13.1c', b: 'You may repair almost any damage on the green, including ball marks, shoe damage and old hole plugs, but not natural wear or aeration holes.' },
      { t: 'Flagstick in or out', r: 'Rule 13.2', b: 'You can putt with the flagstick in the hole or taken out. There is no penalty if a ball hits a flagstick left in the hole.' },
      { t: 'Ball moves accidentally', r: 'Rule 13.1d', b: 'If you or your opponent accidentally move your ball or marker on the green, replace it with no penalty. If wind moves it after you have marked and replaced it, put it back where it was.' },
      { t: 'Hitting another ball on the green', r: 'Rule 11.1a', b: 'In stroke play, if your putt from the green strikes another ball at rest on the green, you get the general penalty (two strokes). Play your ball from where it stops.' },
      { t: 'Overhanging the hole', r: 'Rule 13.3', b: 'If your ball hangs on the lip, you get a reasonable time to walk to the hole plus 10 seconds to see if it drops. If it falls in after that, add one stroke.' },
    ],
  },
  {
    id: 'lost', title: 'Lost ball & out of bounds', icon: 'lost', blurb: 'The ones that cost the most strokes.',
    items: [
      { t: 'Three-minute search', r: 'Rule 18.2a', b: 'A ball is lost if it is not found within three minutes after you (or your caddie) start searching.' },
      { t: 'Stroke and distance', r: 'Rule 18.2b', b: 'For a lost ball or a ball out of bounds, add one stroke and play again from where you last hit. A tee shot out of bounds means you play your 3rd shot from the tee.' },
      { t: 'Hit a provisional', r: 'Rule 18.3', b: 'If your ball might be lost or out of bounds outside a penalty area, announce a "provisional" and play another ball to save the walk back. If the original is found in bounds within three minutes, you continue with it.' },
      { t: 'Local-rule alternative', r: 'Model Local Rule E-5', b: 'Many clubs adopt an alternative to stroke-and-distance: for two penalty strokes, drop in the fairway-side area near where the ball was lost or went out. It only applies if the committee adopts it. Not for elite events.' },
    ],
  },
  {
    id: 'unplayable', title: 'Unplayable ball', icon: 'unplayable', blurb: 'You decide; the cost is one stroke.',
    items: [
      { t: "Anywhere but a penalty area", r: 'Rule 19.1', b: 'You alone decide whether your ball is unplayable, anywhere on the course except in a penalty area.' },
      { t: 'Three options, one stroke', r: 'Rule 19.2', b: 'Take stroke-and-distance, drop back on the line from the hole through the ball as far back as you like, or drop within two club-lengths of the ball, no closer to the hole.' },
    ],
  },
  {
    id: 'relief', title: 'Taking relief', icon: 'drop', blurb: 'How to drop correctly.',
    items: [
      { t: 'Drop from knee height', r: 'Rule 14.3b', b: 'Let the ball fall straight down from knee height without throwing or spinning it. It must land in the relief area and stay there; if it rolls out, drop again, then place it where it first touched the ground if needed.' },
      { t: 'Measuring', r: 'Definitions', b: 'A club-length is the length of your longest club other than the putter. Relief areas are usually one or two club-lengths and never closer to the hole than the reference point.' },
      { t: 'Substituting a ball', r: 'Rule 14.2a', b: 'When you take relief you may use the original ball or a different one.' },
    ],
  },
  {
    id: 'play', title: 'Equipment & pace', icon: 'bag', blurb: 'What you carry and how fast you play.',
    items: [
      { t: '14 clubs max', r: 'Rule 4.1b', b: 'Start with no more than 14 clubs. In stroke play the penalty is two strokes for each hole where the breach happened, up to four strokes total.' },
      { t: 'Advice', r: 'Rule 10.2', b: 'Only your caddie (or partner, in partner formats) may give you advice on club choice or how to play. Public information such as distances is not advice.' },
      { t: 'Pace of play', r: 'Rule 5.6b', b: 'Play promptly. The recommendation is to play each stroke within 40 seconds once it is your turn. "Ready golf" is encouraged in stroke play.' },
      { t: 'Distance devices', r: 'Rule 4.3a', b: 'Rangefinders that measure distance are allowed unless a local rule says otherwise.' },
    ],
  },
  {
    id: 'scoring', title: 'Scoring & formats', icon: 'card', blurb: 'Getting the card right.',
    items: [
      { t: 'Wrong score on a hole', r: 'Rule 3.3b(3)', b: 'If you return a hole score lower than you actually made, you are disqualified. If it is higher, the higher score stands.' },
      { t: 'Max-score format', r: 'Rule 21.2', b: 'In a maximum-score competition, each hole is capped (for example net double bogey or a fixed number). It speeds play up, and you can pick up once you reach the cap.' },
      { t: 'Stableford', r: 'Rule 21.1', b: 'Points per hole relative to a fixed score (often net par): 1 for bogey, 2 for par, 3 for birdie, and so on. Most points wins.' },
      { t: 'Four-ball and teams', r: 'Rule 23', b: "In four-ball (best ball) each partner plays their own ball and the team's score on a hole is the lower of the two. Carry's weekly team game sums both partners' net scores instead, which keeps both players in it." },
    ],
  },
];

export const PENALTY_TABLE = [
  ['Ball out of bounds / lost', '1 stroke + replay from previous spot', '18.2'],
  ['Unplayable ball', '1 stroke', '19.2'],
  ['Penalty area relief', '1 stroke', '17.1d'],
  ['Playing a wrong ball', '2 strokes', '6.3c'],
  ['Teeing off outside the teeing area', '2 strokes + replay', '6.1b'],
  ['Touching sand to test it / in the backswing', '2 strokes', '12.2b'],
  ['Putt hits a ball at rest on the green (stroke play)', '2 strokes', '11.1a'],
  ['Improving your lie or line', '2 strokes', '8.1'],
  ['Ball moves while removing loose impediment (off green)', '1 stroke, replace', '15.1b'],
  ['More than 14 clubs', '2 per hole, max 4', '4.1b'],
  ['Playing from a wrong place', '2 strokes', '14.7'],
  ['Hole score returned too low', 'Disqualification', '3.3b'],
];

export const WHS_SECTION = {
  id: 'whs', title: 'Handicaps (WHS)', icon: 'chart', blurb: 'How the World Handicap System works, in brief.',
  items: [
    { t: 'Handicap Index', r: 'RoH 5.2', b: 'Your index is the average of your best 8 Score Differentials from your most recent 20 rounds. With fewer than 20 rounds a sliding table uses fewer of them, with small adjustments for very short records.' },
    { t: 'Score Differential', r: 'RoH 5.1', b: 'How well you played against the course: (113 ÷ Slope Rating) × (Adjusted Gross Score − Course Rating) − any playing-conditions adjustment.' },
    { t: 'Net double bogey', r: 'RoH 3.1', b: 'For handicap purposes, the most you can count on a hole is par + 2 + any strokes you receive there. Until you have an index, the cap is par + 5.' },
    { t: 'Course & Playing Handicap', r: 'RoH 6.1–6.2', b: 'Course Handicap = Index × (Slope ÷ 113) + (Course Rating − Par). The Playing Handicap applies the format allowance, such as 100% for individual stroke play or 85% for four-ball.' },
    { t: 'Strokes by hole', r: 'Stroke index', b: 'Strokes are given on the hardest holes first, using the stroke index printed on the card (1 = hardest).' },
    { t: '9-hole scores (since 2024)', r: 'RoH 5.1b', b: 'A 9-hole score now counts right away. It is combined with an "expected" score for the other nine based on your index to make an 18-hole differential.' },
    { t: 'Caps and exceptional scores', r: 'RoH 5.8–5.9', b: 'A soft cap slows increases more than 3.0 strokes above your lowest index of the past year, and a hard cap stops them at 5.0. A round 7 or more strokes better than your index triggers an extra reduction.' },
  ],
};

export const SIM_SECTION = {
  id: 'sim', title: 'Simulator play', icon: 'screen', blurb: 'Indoor golf has a few realities of its own.',
  items: [
    { t: 'Lock the settings', r: 'House', b: 'Use the same green speed, firmness, wind, tees and pin difficulty for everyone in a given week. Post the settings with the course so every card is comparable.' },
    { t: 'Putting', r: 'House', b: "GSPro can putt for you, give automatic gimmes inside a radius, or let you putt everything. Choose one league-wide mode. Auto-gimmes usually make scores about 1–2 strokes lower per nine than putting everything." },
    { t: 'Mulligans', r: 'House', b: 'Some leagues allow one mulligan per nine for misreads (a ball the sensor did not pick up properly is not a mulligan, just re-hit it). A round with mulligans is fine for league play but would not be acceptable for an official WHS score.' },
    { t: 'OB & penalty areas', r: 'Sim', b: 'The software applies penalties automatically. Agree up front whether to use its stroke-and-distance or a drop zone (like Model Local Rule E-5) when it offers one.' },
    { t: 'Misreads', r: 'House', b: 'If the launch monitor clearly misreads a shot (a shank shows as a draw, a phantom 400-yard drive, a shot it never registered), replay the shot without penalty. Your playing partners decide.' },
    { t: 'Sim slope is an estimate', r: 'Carry', b: 'Simulator courses rarely have official ratings. Carry estimates slope from GSPro difficulty. Keep it consistent across the season and the handicaps will be fair inside the league.' },
  ],
};
