// Clasificación de un grupo a partir de los partidos terminados.
// Desempate: victorias; entre empatados, victorias y diferencia en los enfrentamientos
// directos; después diferencia general y puntos a favor.
export const jugado = g => g.status === 'Final' && Array.isArray(g.score) && g.score.length === 2;

export function standings(games, teams) {
  const rows = new Map(teams.map(t => [t, { equipo: t, pj: 0, g: 0, p: 0, pf: 0, pc: 0, casa: [0, 0], fuera: [0, 0], forma: [], partidos: [] }]));
  const played = games.filter(jugado).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  for (const g of played) {
    const [h, a] = g.score;
    for (const [team, own, opp, home] of [[g.home, h, a, true], [g.away, a, h, false]]) {
      const r = rows.get(team); if (!r) continue;
      const win = own > opp;
      r.pj++; r.pf += own; r.pc += opp; win ? r.g++ : r.p++;
      (home ? r.casa : r.fuera)[win ? 0 : 1]++;
      r.forma.push({ win, own, opp, rival: home ? g.away : g.home, home, game: g });
      r.partidos.push(g);
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.dif = r.pf - r.pc;
    let n = 0; for (let i = r.forma.length - 1; i >= 0 && r.forma[i].win === r.forma.at(-1).win; i--) n++;
    r.racha = r.forma.length ? (r.forma.at(-1).win ? 'G' : 'P') + n : '—';
  }
  const h2h = (team, group) => {
    let w = 0, d = 0;
    for (const g of played) {
      if (!group.has(g.home) || !group.has(g.away) || (g.home !== team && g.away !== team)) continue;
      const [own, opp] = g.home === team ? g.score : [g.score[1], g.score[0]];
      if (own > opp) w++; d += own - opp;
    }
    return [w, d];
  };
  list.sort((a, b) => b.g - a.g || a.p - b.p);
  // reordenar bloques empatados a victorias
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i; while (j < list.length && list[j].g === list[i].g && list[j].p === list[i].p) j++;
    const block = list.slice(i, j), names = new Set(block.map(r => r.equipo));
    for (const r of block) r._h = h2h(r.equipo, names);
    block.sort((a, b) => b._h[0] - a._h[0] || b._h[1] - a._h[1] || b.dif - a.dif || b.pf - a.pf || a.equipo.localeCompare(b.equipo, 'es'));
    out.push(...block); i = j;
  }
  out.forEach((r, i) => { r.pos = i + 1; delete r._h; });
  return out;
}

/** Iconos G/P de los últimos n partidos (el más reciente a la derecha). */
export function formaNode(r, n = 5, href = null) {
  const box = document.createElement('span'); box.className = 'form';
  for (const f of r.forma.slice(-n)) {
    const i = document.createElement('i'); i.className = f.win ? 'w' : 'l'; i.textContent = f.win ? 'G' : 'P';
    i.title = (f.win ? 'Victoria ' : 'Derrota ') + f.own + '-' + f.opp + (f.home ? ' contra ' : ' en casa de ') + f.rival;
    box.append(i);
  }
  return box;
}
