// 3 day campaign, same order pace each day but more random events unlock. tweak DAYS / PACE
'use strict';
(() => {
  const G = window.Game;
  if (!G) return;

  const PACE = { maxOrders: 6, orderInterval: [5, 10], fabricInterval: [3.5, 7.5] };
  // events: which optional modules may fire that day (ids: gossip / cat / paint / hand / reno).
  const DAYS = [
    { title: 'Day 1', events: ['cat'] },
    { title: 'Day 2', events: ['cat', 'gossip', 'paint'] },
    { title: 'Day 3', events: ['cat', 'gossip', 'paint', 'hand', 'reno'] },
  ];

  // Daily grade, based on what was earned today (not the carried-over wallet). Shown as a rubber stamp.
  const RANKS = [
    [700, 'S', '#d6283a', 'rankS'],
    [450, 'A', '#d6283a', 'rankA'],
    [220, 'B', '#2f5fd0', 'rankB'],
    [-Infinity, 'C', '#5a5f80', 'rankC'],
  ];
  function grade() {
    const earned = G.money - (G.round.money || 0);
    const [, text, color, sfx] = RANKS.find(r => earned >= r[0]);
    return { text, color, sfx };
  }

  function startDay(n, money) {
    G.startRound({ day: n, events: DAYS[n - 1].events, money: money || 0, ...PACE });
  }

  G.days = { list: DAYS, start: startDay };
  G.setStartGame(() => startDay(1, 0));
  G.titleLines.push(`Open for ${DAYS.length} days; cash carries over, and things get weirder each day`);

  G.setEndPanel(stats => {
    const day = G.round.day || 1, last = day >= DAYS.length;
    const statLine = `Happy: ${stats.happy}    Meh: ${stats.meh}    Angry: ${stats.angry}    Expired: ${stats.expired}`;
    const toTitle = { label: 'Title', fn: () => { G.state = 'title'; }, color: '#9aa3c7' };
    if (!last) {
      return {
        title: `${DAYS[day - 1].title} Closed!`,
        lines: [`Wallet: ${G.money} (carries over)`, statLine],
        stamp: grade(),
        buttons: [{ label: `Start ${DAYS[day].title}`, fn: () => startDay(day + 1, G.money) }, toTitle],
      };
    }
    return {
      title: 'All 3 Days Done!',
      lines: [`Final savings: ${G.money}`, statLine],
      stamp: grade(),
      buttons: [{ label: 'Restart Day 1', fn: () => startDay(1, 0) }, toTitle],
    };
  });
})();
