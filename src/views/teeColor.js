/** Swatch for common tee names (anything else gets a neutral chip). */
export function teeColor(name) {
  const k = String(name || '').toLowerCase();
  const map = { black: '#1d1f22', blue: '#2f6fe0', white: '#f2f2ee', yellow: '#f2c230', gold: '#d6a535', red: '#d8432f', green: '#2fa45a', silver: '#b8bec6', junior: '#33c6c6', orange: '#f08a2b', purple: '#7d5bd6', copper: '#b86b3f', bronze: '#a87444', teal: '#2aa3a0', tips: '#1d1f22', forward: '#d8432f' };
  return map[k] || map[k.split(' ')[0]] || 'var(--muted)';
}
