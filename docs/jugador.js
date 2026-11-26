import { drawCourt, zoneTable, fromRow } from './tiros.js';
import { GLOSSARY } from './glosario.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const signed = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + fmt(v, d);
const MIN_MINUTES = 80; // muestra mínima para entrar en la población de percentiles

const per40 = (p, k) => p.min ? 40 * p[k] / p.min : null;
// [clave, etiqueta, función, más alto es mejor, decimales, explicación]
const BLOCKS = [
  ['Anotación', [
    ['p40', 'Puntos por 40 min', p => p.p40, true, 1],
    ['ts', 'TS%', p => p.fga + p.fta >= 15 ? p.ts : null, true, 1, 'Tiro real'],
    ['efg', 'eFG%', p => p.fga >= 15 ? p.efg : null, true, 1],
    ['t3', 'Triples %', p => p.tpa >= 10 ? p.t3 : null, true, 1, 'Con 10 o más intentos'],
    ['tl', 'Tiros libres %', p => p.fta >= 10 ? p.tl : null, true, 1, 'Con 10 o más intentos'],
    ['ppos', 'Puntos por posesión usada', p => p.ppos, true, 2, 'PPP'],
  ]],
  ['Creación', [
    ['a40', 'Asistencias por 40 min', p => p.a40, true, 1],
    ['astp', 'AST%', p => p.astp, true, 1],
    ['usg', 'Uso %', p => p.usg, true, 1, 'USG%'],
    ['tov40', 'Pérdidas por 40 min', p => per40(p, 'tov'), false, 1],
  ]],
  ['Rebote', [
    ['r40', 'Rebotes por 40 min', p => p.r40, true, 1],
    ['orbp', 'Rebote ofensivo %', p => p.orbp, true, 1, 'ORB%'],
    ['drbp', 'Rebote defensivo %', p => p.drbp, true, 1, 'DRB%'],
  ]],
  ['Defensa', [
    ['stl40', 'Recuperaciones por 40 min', p => per40(p, 'stl'), true, 1],
    ['blk40', 'Tapones por 40 min', p => per40(p, 'blk'), true, 1],
  ]],
  ['Impacto', [
    ['pm40', '+/- por 40 min', p => p.min ? 40 * p.pm / p.min : null, true, 1, '+/-'],
    ['net', 'Net en pista', p => p.net, true, 1, 'Net'],
    ['onoff', 'On/Off', p => p.onoff, true, 1, 'On/Off'],
  ]],
];
const METRICS = BLOCKS.flatMap(([, m]) => m);

function percentile(values, v, higher) {
  if (v == null) return null;
  const xs = values.filter(x => x != null);
  if (!xs.length) return null;
  let below = 0, equal = 0;
  for (const x of xs) { if (x < v) below++; else if (x === v) equal++; }
  const p = 100 * (below + equal / 2) / xs.length;
  return Math.round(higher ? p : 100 - p);
}
const tier = p => p == null ? '' : p >= 80 ? 't-top' : p >= 60 ? 't-good' : p >= 40 ? 't-mid' : p >= 20 ? 't-low' : 't-bottom';

const params = new URLSearchParams(location.search);
const [adv, season] = await Promise.all([
  fetch('./api/avanzadas').then(r => r.ok ? r.json() : null),
  fetch('./season.json').then(r => r.json()),
]);
if (!adv) { $('#plName').textContent = 'Estadística avanzada no disponible'; throw Error('sin datos'); }
const byId = new Map(adv.jugadores.map(p => [p.id, p]));
let player = byId.get(params.get('id'));
if (!player) player = [...adv.jugadores].sort((a, b) => b.pts - a.pts)[0];

// buscador
$('#plList').replaceChildren(...adv.jugadores.map(p => new Option(p.equipo, p.nombre)));
$('#plSearch').onchange = () => {
  const p = adv.jugadores.find(x => x.nombre === $('#plSearch').value);
  if (p) location.search = '?id=' + encodeURIComponent(p.id);
};

function population(kind) {
  return adv.jugadores.filter(p => p.min >= MIN_MINUTES && (kind === 'liga' || p.grupo === player.grupo));
}
function pctOf(p, pop) {
  const out = {};
  for (const [key, , get, higher] of METRICS) out[key] = percentile(pop.map(get), get(p), higher);
  return out;
}

function header() {
  document.title = player.nombre + ' · N1 Andalucía';
  $('#plKicker').replaceChildren(document.createTextNode('GRUPO ' + player.grupo + ' · '), Object.assign(el('a', player.equipo), { href: './equipo.html?n=' + encodeURIComponent(player.equipo) }));
  $('#plName').textContent = player.nombre;
  $('#plMeta').textContent = `${player.pj} partidos · ${player.tit} de titular · ${fmt(player.mpp)} minutos por partido · ${fmt(player.min, 0)} minutos en total`;
  const pop = population('liga'), pc = pctOf(player, pop);
  const cards = [
    ['Puntos', fmt(player.ppp), 'por partido', pc.p40, 'p40'], ['Rebotes', fmt(player.reb / player.pj), 'por partido', pc.r40],
    ['Asistencias', fmt(player.ast / player.pj), 'por partido', pc.a40], ['Valoración', fmt(player.val), 'por partido', null],
    ['TS%', fmt(player.ts), 'tiro real', pc.ts], ['Uso', fmt(player.usg), '% de jugadas', pc.usg],
    ['Net en pista', signed(player.net), 'por 100 posesiones', pc.net], ['On/Off', signed(player.onoff), 'con él − sin él', pc.onoff],
  ];
  $('#plCards').replaceChildren(...cards.map(([t, v, sub, p]) => {
    const c = el('article', null, 'adv-card');
    c.append(el('small', t), el('strong', v), el('em', sub));
    if (p != null) c.append(el('span', 'Percentil ' + p, 'pct-chip ' + tier(p)));
    return c;
  }));
}

function renderPercentiles() {
  const kind = $('#pctGroup').value, pop = population(kind), pc = pctOf(player, pop);
  const vs = byId.get($('#pctVs').value), pv = vs ? pctOf(vs, pop) : null;
  $('#pctNote').textContent = `Comparado con ${pop.length} jugadores de ${kind === 'liga' ? 'toda la N1' : 'su grupo'} con ${MIN_MINUTES} minutos o más.` +
    (player.min < MIN_MINUTES ? ' Este jugador tiene menos minutos: tómalo como orientativo.' : '');
  $('#pctGrid').replaceChildren(...BLOCKS.map(([title, metrics]) => {
    const box = el('section', null, 'pct-block');
    box.append(el('h3', title));
    for (const [key, label, get, higher, dec, tipKey] of metrics) {
      const row = el('div', null, 'pct-row');
      const name = el('span', label, 'pct-label');
      const t = GLOSSARY[tipKey || label]; if (t) { name.title = t; name.classList.add('has-tip'); }
      const bar = el('div', null, 'pct-bar');
      const fill = el('i', null, tier(pc[key])); fill.style.width = (pc[key] ?? 0) + '%';
      bar.append(fill);
      if (pv?.[key] != null) { const m = el('b', null, 'pct-vs'); m.style.left = pv[key] + '%'; m.title = vs.nombre + ': percentil ' + pv[key]; bar.append(m); }
      const v = get(player);
      row.append(name, bar, el('span', key === 'pm40' || key === 'net' || key === 'onoff' ? signed(v, dec) : fmt(v, dec), 'pct-value'), el('span', pc[key] == null ? '—' : String(pc[key]), 'pct-num ' + tier(pc[key])));
      box.append(row);
    }
    return box;
  }));
}

function renderSimilar() {
  const pop = population('liga');
  const keys = ['p40', 'ts', 'usg', 'a40', 'astp', 'r40', 'orbp', 'drbp', 'stl40', 'blk40', 'tov40'];
  const vector = p => { const pc = pctOf(p, pop); return keys.map(k => pc[k] ?? 50); };
  const me = vector(player);
  const near = pop.filter(p => p.id !== player.id).map(p => {
    const v = vector(p);
    return [Math.sqrt(v.reduce((a, x, i) => a + (x - me[i]) ** 2, 0) / keys.length), p];
  }).sort((a, b) => a[0] - b[0]).slice(0, 6);
  $('#similar').replaceChildren(...near.map(([d, p]) => {
    const a = el('a', null, 'similar-card'); a.href = './jugador.html?id=' + encodeURIComponent(p.id);
    a.append(el('b', p.nombre), el('small', p.equipo + ' · grupo ' + p.grupo), el('span', `${fmt(p.ppp)} pts · TS ${fmt(p.ts)} · uso ${fmt(p.usg)}`), el('em', 'Parecido ' + Math.max(0, Math.round(100 - d)) + '%'));
    return a;
  }));
  $('#pctVs').replaceChildren(new Option('Ninguno', ''), ...near.map(([, p]) => new Option(p.nombre + ' (parecido)', p.id)),
    ...adv.jugadores.filter(p => p.equipo === player.equipo && p.id !== player.id).map(p => new Option(p.nombre + ' (compañero)', p.id)));
}

async function renderShots() {
  const data = await fetch('./api/avanzadas?tiros=1').then(r => r.ok ? r.json() : null).catch(() => null);
  const idx = data ? data.jugadores.indexOf(player.id) : -1;
  const rows = idx < 0 ? [] : (data.equipos[player.equipo] || []).filter(r => r[4] === idx);
  $('#plCourt').replaceChildren();
  drawCourt($('#plCourt'), rows.map(fromRow), { title: player.nombre, label: 'Mapa de tiro de ' + player.nombre });
  $('#plZones').replaceChildren();
  zoneTable($('#plZones'), adv.zonas.jugadores[player.id] || {}, adv.zonas.liga);
  const c = player.clutch;
  $('#plClutch').replaceChildren(el('h3', 'Final apretado'), el('p', c.fga || c.pts ? `${c.pts} puntos con ${c.fgm}/${c.fga} en tiros de campo y ${c.tov} pérdidas en los últimos 5 minutos con 5 puntos o menos de diferencia.` : 'Sin acciones de tiro en finales apretados.', 'adv-note'));
}

function renderLog() {
  const games = [];
  for (const g of season.games) {
    for (const [side, t] of (g.box || []).entries()) {
      const r = t.rows.find(r => r[0] === player.id);
      if (!r) continue;
      const home = t.team === g.home, rival = home ? g.away : g.home, sc = g.score || [];
      games.push({ g, r, rival, home, own: home ? sc[0] : sc[1], opp: home ? sc[1] : sc[0] });
    }
  }
  games.sort((a, b) => a.g.date.localeCompare(b.g.date));
  const num = v => Number(String(v).replace(',', '.')) || 0;
  // gráfico de barras: puntos (barra) y valoración (punto)
  const W = 640, H = 170, P = 26, n = games.length || 1, bw = (W - P - 8) / n;
  const maxV = Math.max(10, ...games.flatMap(x => [num(x.r[3]), num(x.r[15])]));
  const minV = Math.min(0, ...games.map(x => num(x.r[15])));
  const Y = v => 10 + (maxV - v) / (maxV - minV) * (H - 36);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntos y valoración por partido"><line x1="${P}" x2="${W - 4}" y1="${Y(0)}" y2="${Y(0)}" class="q"/>`;
  games.forEach((x, i) => {
    const cx = P + i * bw + bw / 2, pts = num(x.r[3]), val = num(x.r[15]);
    svg += `<rect x="${cx - bw * 0.3}" y="${Y(pts)}" width="${bw * 0.6}" height="${Math.max(0, Y(0) - Y(pts))}" class="bar-pts"><title>${x.g.round} · ${pts} puntos</title></rect>`;
    svg += `<circle cx="${cx}" cy="${Y(val)}" r="4" class="dot-val"><title>${x.g.round} · valoración ${val}</title></circle>`;
    svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${(x.g.round || '').replace('Jornada ', 'J')}</text>`;
  });
  svg += `<text x="${P}" y="10">${maxV}</text></svg>`;
  const trend = el('div', null, 'flow'); trend.innerHTML = svg;
  const legend = el('div', null, 'shot-legend'); legend.innerHTML = '<i class="lg-pts"></i>Puntos <i class="lg-val"></i>Valoración';
  $('#plTrend').replaceChildren(trend, legend);
  const t = el('table', null, 'adv-table');
  t.innerHTML = '<thead><tr><th>Jornada</th><th>Rival</th><th class="num">Res.</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">T2</th><th class="num">T3</th><th class="num">TL</th><th class="num">REB</th><th class="num">AST</th><th class="num">ROB</th><th class="num">PÉR</th><th class="num">+/−</th><th class="num">VAL</th></tr></thead>';
  const body = el('tbody');
  for (const x of [...games].reverse()) {
    const tr = el('tr');
    const id = x.g.url.split('?')[0].split('/').at(-1);
    const link = el('a', (x.home ? '' : '@ ') + x.rival); link.href = './index.html?partido=' + id;
    const td = el('td'); td.append(link);
    const res = x.own != null ? (x.own > x.opp ? 'V ' : 'D ') + x.own + '-' + x.opp : '—';
    tr.append(el('td', x.g.round || x.g.date), td, ...[res, x.r[2], x.r[3], x.r[4], x.r[5], x.r[6], x.r[7], x.r[8], x.r[9], x.r[10], x.r[14], x.r[15]].map(v => el('td', v, 'num')));
    body.append(tr);
  }
  t.append(body);
  $('#plLog').replaceChildren(t);
}

header();
renderSimilar();
renderPercentiles();
renderLog();
renderShots();
$('#pctGroup').onchange = renderPercentiles;
$('#pctVs').onchange = renderPercentiles;
