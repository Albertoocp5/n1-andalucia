import { drawCourt, zoneTable, fromRow } from '/tiros.js';
import { simulate } from '/simulador.js';
import { jugador as pn, equipo as eq, botonComparar, tipped, puesto, tierPuesto } from '/comun.js';
import { standings, formaNode } from '/clasif.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmt(v, d);
const link = (text, href) => { const a = el('a', text); a.href = href; return a; };
const teamHref = name => '/equipo.html?n=' + encodeURIComponent(name);
const mean = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function table(container, heads, rows, numFrom = 1) {
  const t = el('table', null, 'adv-table');
  const tr = el('tr');
  heads.forEach((h, i) => { const th = el('th', h); if (i >= numFrom) th.className = 'num'; tr.append(th); });
  const thead = el('thead'); thead.append(tr);
  const body = el('tbody');
  for (const r of rows) {
    const x = el('tr');
    r.forEach((v, i) => { const td = el('td'); if (v instanceof Node) td.append(v); else td.textContent = v ?? '—'; if (i >= numFrom) td.className = 'num'; x.append(td); });
    body.append(x);
  }
  t.append(thead, body);
  container.replaceChildren(t);
}

const [adv, season] = await Promise.all([
  fetch('/api/avanzadas').then(r => r.ok ? r.json() : null),
  fetch('/season.json').then(r => r.json()),
]);
if (!adv) { $('#tmName').textContent = 'Estadística avanzada no disponible'; throw Error('sin datos'); }
const params = new URLSearchParams(location.search);
const team = adv.equipos.find(t => t.equipo === params.get('n')) || [...adv.equipos].sort((a, b) => b.net - a.net)[0];
const group = adv.equipos.filter(t => t.grupo === team.grupo);

document.title = eq(team.equipo) + ' · N1 Andalucía';
const tabla = standings(season.games.filter(x => x.group === team.grupo), season.groups[team.grupo]);
const fila = tabla.find(r => r.equipo === team.equipo);
$('#tmKicker').textContent = 'GRUPO ' + team.grupo + (fila ? ' · ' + fila.pos + '.º DE ' + tabla.length : '');
$('#tmName').replaceChildren(document.createTextNode(eq(team.equipo)), botonComparar({ t: 'e', id: team.equipo, nombre: eq(team.equipo) }, true));
$('#tmMeta').replaceChildren(document.createTextNode(`${team.v} victorias y ${team.pj - team.v} derrotas · ${team.pts} puntos a favor y ${team.opp} en contra · `));
if (fila) { $('#tmMeta').append('últimos partidos ', formaNode(fila), ' · '); const cl = el('a', 'ver clasificación'); cl.href = '/clasificacion.html?grupo=' + team.grupo; $('#tmMeta').append(cl); }
$('#tmPick').replaceChildren(...[...adv.equipos].sort((a, b) => a.grupo.localeCompare(b.grupo) || a.equipo.localeCompare(b.equipo, 'es')).map(t => new Option(t.grupo + ' · ' + eq(t.equipo), t.equipo)));
$('#tmPick').value = team.equipo;
$('#tmPick').onchange = () => { location.search = '?n=' + encodeURIComponent($('#tmPick').value); };

// tarjetas con puesto en el grupo
const cards = [['Puntos a favor', 'PF', fmt(team.pts / team.pj), 'por partido', t => t.pts / t.pj, true], ['Puntos en contra', 'PC', fmt(team.opp / team.pj), 'por partido', t => t.opp / t.pj, false],
  ['Ataque', 'Ataque', fmt(team.off), 'puntos por 100 posesiones', t => t.off, true, 1], ['Defensa', 'Defensa', fmt(team.def), 'recibidos por 100 posesiones', t => t.def, false, 1],
  ['Dif. neta', 'Net', signed(team.net), 'por 100 posesiones', t => t.net, true, 1], ['Ritmo', 'Ritmo', fmt(team.ritmo), 'posesiones por 40 min', t => t.ritmo, null, 1]];
$('#tmCards').replaceChildren(...cards.map(([t, key, v, sub, get, higher, ana]) => {
  const c = el('article', null, 'adv-card' + (ana ? ' solo-ana' : ''));
  const avg = mean(group.map(get));
  c.append(tipped(t, key), el('strong', v), el('em', sub + ' · media del grupo ' + (key === 'Net' ? signed(avg) : fmt(avg))));
  if (higher != null) {
    const r = puesto(group.map(get), get(team), higher), rl = puesto(adv.equipos.map(get), get(team), higher);
    if (r) {
      const box = el('div', null, 'rank'), txt = el('span', null, 'rank-txt');
      txt.append(document.createTextNode(r.pos + '.º de ' + r.n), el('small', ' en su grupo · ' + rl.pos + '.º de ' + rl.n + ' en la N1'));
      const bar = el('div', null, 'rank-bar'), fill = el('i', null, tierPuesto(r)); fill.style.width = (100 * (r.n - r.pos) / (r.n - 1)) + '%'; bar.append(fill);
      const ends = el('div', null, 'rank-ends'); ends.append(el('span', 'peor'), el('span', 'mejor'));
      box.append(txt, bar, ends); c.append(box);
    }
  }
  return c;
}));

// cuatro factores
const F = [['eFG%', 'efg', true], ['Pérdidas por 100 pos.', 'tov', false], ['Rebote ofensivo %', 'orb', true], ['Tiros libres por tiro', 'ftr', true], ['TS%', 'ts', true], ['Triples sobre tiros %', 't3r', null], ['Canastas asistidas %', 'ast', true]];
table($('#tmFactors'), ['Factor', 'Ataque', 'Media grupo', 'Concede en defensa', 'Media grupo'], F.map(([label, k, higher]) => {
  const at = team[k], ag = mean(group.map(t => t[k])), df = team.rival?.[k], dg = mean(group.map(t => t.rival?.[k]));
  const d = k === 'ftr' ? 2 : 1;
  const mark = (v, avg, good) => { const s = el('span', fmt(v, d)); if (good != null && v != null && avg != null && Math.abs(v - avg) > (k === 'ftr' ? 0.02 : 1)) s.className = (good ? v > avg : v < avg) ? 'good' : 'bad'; return s; };
  return [label, mark(at, ag, higher), fmt(ag, d), mark(df, dg, higher == null ? null : !higher), fmt(dg, d)];
}));

// proyección con el simulador
{
  const games = season.games.filter(x => x.group === team.grupo).map(x => ({ ...x, score: x.status === 'Final' ? x.score : null }));
  const sim = simulate(games, season.groups[team.grupo]);
  const r = sim.rows.find(x => x.equipo === team.equipo) || sim.rows.find(x => x.equipo.normalize('NFD').replace(/\p{M}/gu, '') === team.equipo.normalize('NFD').replace(/\p{M}/gu, ''));
  if (r) {
    $('#tmProjNote').textContent = `${fmt(r.vEsp)} victorias esperadas al final de la fase regular · puesto medio ${fmt(r.pEsp)} · ${sim.runs.toLocaleString('es-ES')} simulaciones de los ${sim.left.length} partidos pendientes del grupo.`;
    $('#tmProj').replaceChildren(...r.pos.map((p, i) => {
      const b = el('div', null, 'proj-bar'); const fill = el('i'); fill.style.height = Math.max(1, 100 * p / Math.max(...r.pos)) + '%';
      b.title = `${Math.round(100 * p)} % de acabar ${i + 1}.º`;
      b.append(el('span', p >= 0.01 ? Math.round(100 * p) + '%' : ''), fill, el('b', String(i + 1)));
      return b;
    }));
  }
}

// partidos
const ids = new Map(season.games.map(g => [g.url.split('?')[0].split('/').at(-1), g]));
table($('#tmGames'), ['Jornada', 'Rival', 'Resultado', 'Ataque', 'Defensa', 'Net'], [...team.partidos].sort((a, b) => b.fecha.split('/').reverse().join('').localeCompare(a.fecha.split('/').reverse().join(''))).map(p => {
  const res = el('a', (p.pts > p.opp ? 'V ' : 'D ') + p.pts + '-' + p.opp); res.href = '/?partido=' + p.id; res.className = p.pts > p.opp ? 'good' : 'bad';
  return [ids.get(p.id)?.round || p.fecha, link((p.local ? '' : '@ ') + eq(p.rival), teamHref(p.rival)), res, fmt(p.off), fmt(p.def), signed(p.net)];
}), 3);

// plantilla
const roster = adv.jugadores.filter(p => p.equipo === team.equipo).sort((a, b) => b.min - a.min);
table($('#tmRoster'), ['Jugador', 'PJ', 'MIN', 'PTS', 'REB', 'AST', 'TS%', 'USG%', '+/-', 'Net', 'On/Off'], roster.map(p => [
  (() => { const w = el('span'); w.append(link(pn(p.nombre), '/jugador.html?id=' + encodeURIComponent(p.id)), botonComparar({ t: 'j', id: p.id, nombre: pn(p.nombre) })); return w; })(), p.pj, fmt(p.mpp), fmt(p.ppp), fmt(p.reb / p.pj), fmt(p.ast / p.pj), fmt(p.ts), fmt(p.usg), signed(p.pm, 0), signed(p.net), signed(p.onoff),
]));

// quintetos
const lineups = adv.quintetos.filter(l => l.equipo === team.equipo).slice(0, 10);
table($('#tmLineups'), ['Quinteto', 'MIN', 'Pos.', '+/-', 'Ataque', 'Defensa', 'Net'], lineups.map(l => [l.jug.map(n => pn(n).split(' ').slice(-2).join(' ')).join(' · '), fmt(l.min), fmt(l.pos, 0), signed(l.pm, 0), fmt(l.off), fmt(l.def), signed(l.net)]));
if (!lineups.length) $('#tmLineups').replaceChildren(el('p', 'Ningún quinteto suma todavía 5 minutos juntos.', 'adv-note'));

// mapa de tiro
const shots = await fetch('/api/avanzadas?tiros=1').then(r => r.ok ? r.json() : null).catch(() => null);
drawCourt($('#tmCourt'), (shots?.equipos[team.equipo] || []).map(fromRow), { title: eq(team.equipo), label: 'Mapa de tiro de ' + eq(team.equipo) });
zoneTable($('#tmZones'), adv.zonas.equipos[team.equipo] || {}, adv.zonas.liga);

// próximos partidos (con enlace a la previa)
{
  const next = season.games.filter(g => g.status !== 'Final' && (g.home === team.equipo || g.away === team.equipo)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const fecha = d => new Date(d + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  if (next.length) table($('#tmNext'), ['Jornada', 'Cuándo', 'Rival', 'Previa'], next.slice(0, 5).map(g => {
    const home = g.home === team.equipo, rival = home ? g.away : g.home;
    const ida = season.games.find(x => x.status === 'Final' && x.home === rival && x.away === team.equipo || x.status === 'Final' && x.away === rival && x.home === team.equipo);
    return [g.round, fecha(g.date) + ' · ' + g.time, link((home ? 'vs ' : '@ ') + eq(rival), teamHref(rival)), link(ida ? 'Previa · ida ' + (ida.home === team.equipo ? ida.score : [...ida.score].reverse()).join('-') : 'Ver previa', '/?partido=' + g.url.split('?')[0].split('/').at(-1))];
  }), 9);
  else $('#tmNext').replaceChildren(el('p', 'No le quedan partidos en la fase regular.', 'adv-note'));
}
