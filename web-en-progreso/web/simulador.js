// Simulador de clasificación: ratings de diferencia de puntos (ajustados por rival y
// pista, con regularización) + Monte Carlo de los partidos que quedan por jugar.
const RUNS = 10000;
const RIDGE = 4; // equivale a sumar 4 partidos neutros a cada equipo: frena los extremos al principio

export function fitRatings(games, teams) {
  const played = games.filter(g => g.score && g.score[0] !== g.score[1]);
  const r = new Map(teams.map(t => [t, 0]));
  let home = 0;
  for (let it = 0; it < 300; it++) {
    // ventaja de campo = media de (margen − diferencia de ratings), con prior hacia 0
    let s = 0;
    for (const g of played) s += (g.score[0] - g.score[1]) - (r.get(g.home) - r.get(g.away));
    home = s / (played.length + 10);
    for (const t of teams) {
      let num = 0, n = 0;
      for (const g of played) {
        const m = g.score[0] - g.score[1] - home;
        if (g.home === t) { num += m + r.get(g.away); n++; } else if (g.away === t) { num += -m + r.get(g.home); n++; }
      }
      r.set(t, num / (n + RIDGE));
    }
    const mean = [...r.values()].reduce((a, b) => a + b, 0) / teams.length;
    for (const t of teams) r.set(t, r.get(t) - mean);
  }
  const res = played.map(g => (g.score[0] - g.score[1]) - (home + r.get(g.home) - r.get(g.away)));
  // dispersión: residuos corregidos por los grados de libertad usados, mínimo 9 puntos
  const sd = Math.max(9, Math.sqrt(res.reduce((a, x) => a + x * x, 0) / Math.max(1, res.length - teams.length)));
  return { ratings: r, home, sd, played: played.length };
}

const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
export const winProb = (model, home, away) => 0.5 * (1 + erf((model.home + model.ratings.get(home) - model.ratings.get(away)) / (model.sd * Math.SQRT2)));

function gauss(rand) { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function simulate(games, teams) {
  const model = fitRatings(games, teams);
  const base = new Map(teams.map(t => [t, { w: 0, l: 0, pf: 0, pa: 0 }]));
  for (const g of games.filter(g => g.score && g.score[0] !== g.score[1])) {
    const h = base.get(g.home), a = base.get(g.away);
    h.pf += g.score[0]; h.pa += g.score[1]; a.pf += g.score[1]; a.pa += g.score[0];
    if (g.score[0] > g.score[1]) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  const left = games.filter(g => !(g.score && g.score[0] !== g.score[1]));
  const pos = new Map(teams.map(t => [t, new Array(teams.length).fill(0)]));
  const wins = new Map(teams.map(t => [t, 0]));
  const rand = seeded(20262027);
  for (let run = 0; run < RUNS; run++) {
    const st = new Map(teams.map(t => { const b = base.get(t); return [t, { t, w: b.w, d: b.pf - b.pa, tie: rand() }]; }));
    for (const g of left) {
      let m = model.home + model.ratings.get(g.home) - model.ratings.get(g.away) + model.sd * gauss(rand);
      if (Math.abs(m) < 0.5) m = m < 0 ? -1 : 1; // no hay empates en baloncesto
      const h = st.get(g.home), a = st.get(g.away);
      if (m > 0) h.w++; else a.w++;
      h.d += m; a.d -= m;
    }
    const order = [...st.values()].sort((x, y) => y.w - x.w || y.d - x.d || x.tie - y.tie);
    order.forEach((x, i) => { pos.get(x.t)[i]++; wins.set(x.t, wins.get(x.t) + x.w); });
  }
  const rows = teams.map(t => ({
    equipo: t, ...base.get(t), rating: model.ratings.get(t),
    vEsp: wins.get(t) / RUNS, pos: pos.get(t).map(c => c / RUNS),
    pEsp: pos.get(t).reduce((a, c, i) => a + c * (i + 1), 0) / RUNS,
  })).sort((a, b) => a.pEsp - b.pEsp);
  return { rows, model, left, runs: RUNS };
}
