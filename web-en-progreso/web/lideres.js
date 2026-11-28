import { jugador as pn, equipo as eq, muestra, botonComparar, tipped, avatar, equipoFavorito } from '/comun.js';

const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

const adv = await fetch('/api/avanzadas').then(r => r.ok ? r.json() : null).catch(() => null);
if (!adv) { $('#nota').textContent = 'Las estadísticas todavía no están disponibles.'; throw Error('sin datos'); }
const m = muestra(adv.jugadores);
$('#stamp').textContent = 'Fuente: actas oficiales y jugada a jugada de Afición FAB · actualizado ' + new Date(adv.checkedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });

// [título, clave del glosario, valor(p, escala), decimales, condición extra, solo analista, más bajo es mejor]
const count = k => (p, s) => s === 'tot' ? p[k] : s === 'p40' ? (p.min ? 40 * p[k] / p.min : null) : p[k] / p.pj;
const STATS = [
  ['Puntos', 'PTS', (p, s) => s === 'pp' ? p.ppp : count('pts')(p, s), 1],
  ['Rebotes', 'REB', count('reb'), 1],
  ['Asistencias', 'AST', count('ast'), 1],
  ['Valoración', 'VAL', (p, s) => s === 'tot' ? p.val * p.pj : s === 'p40' ? (p.min ? 40 * p.val * p.pj / p.min : null) : p.val, 1],
  ['Recuperaciones', 'ROB', count('stl'), 1],
  ['Tapones', 'TAP', count('blk'), 1],
  ['Triples anotados', 'T3', count('tpm'), 1],
  ['Rebotes ofensivos', 'ORB%', count('orb'), 1],
  ['Tiro real (TS%)', 'TS%', p => p.ts, 1, p => p.fga + p.fta >= 4 * m.J],
  ['Acierto en triples', 'T3%', p => p.t3, 1, p => p.tpa >= 2 * m.J],
  ['Acierto en tiros libres', 'TL%', p => p.tl, 1, p => p.fta >= 2 * m.J],
  ['Minutos', 'MIN', (p, s) => s === 'tot' ? p.min : p.mpp, 1],
  ['Más / menos', '+/-', (p, s) => s === 'tot' ? p.pm : s === 'p40' ? (p.min ? 40 * p.pm / p.min : null) : p.pm / p.pj, 1, null, true],
  ['Uso', 'USG%', p => p.usg, 1, null, true],
  ['Puntos por posesión usada', 'PPP', p => p.ppos, 2, p => p.fga + p.fta >= 4 * m.J, true],
  ['Net en pista', 'Net en pista', p => p.net, 1, null, true],
  ['Con él / sin él', 'On/Off', p => p.onoff, 1, null, true],
  ['Pérdidas (menos es mejor)', 'PÉR', count('tov'), 1, null, true, true],
];

function render() {
  const g = $('#grupo').value, s = $('#escala').value;
  const pop = adv.jugadores.filter(p => (!g || p.grupo === g) && p.min >= m.min && p.pj >= m.pj);
  $('#nota').textContent = `Los 10 mejores de ${g ? 'el grupo ' + g : 'toda la N1'} · solo jugadores con al menos ${m.min} minutos y ${m.pj} partidos (${pop.length} jugadores). Los porcentajes exigen un mínimo de intentos. Pulsa un nombre para ver su ficha o + para compararlo.`;
  const boxes = STATS.map(([titulo, key, get, d, cond, ana, low]) => {
    const scaleLabel = ['PTS', 'REB', 'AST', 'VAL', 'ROB', 'TAP', 'T3', 'ORB%', '+/-', 'PÉR', 'MIN'].includes(key) ? { pp: 'por partido', tot: 'totales', p40: 'por 40 minutos' }[key === 'MIN' && s === 'p40' ? 'pp' : s] : 'temporada';
    const rows = pop.filter(p => !cond || cond(p)).map(p => [p, get(p, s)]).filter(([, v]) => v != null && Number.isFinite(v))
      .sort((a, b) => low ? a[1] - b[1] : b[1] - a[1]).slice(0, 10);
    const box = el('article', null, 'leader-box' + (ana ? ' solo-ana' : ''));
    const h = el('h3'); h.append(tipped(titulo, key === 'ORB%' ? null : key, key === 'ORB%' ? 'Rebotes capturados en el aro rival, que dan otra posesión a su equipo.' : null));
    box.append(h, el('small', scaleLabel));
    const ol = el('ol');
    rows.forEach(([p, v], i) => {
      const li = el('li', null, p.equipo === equipoFavorito() ? 'fav' : '');
      const who = el('span', null, 'who'); const a = el('a', pn(p.nombre)); a.href = '/jugador.html?id=' + encodeURIComponent(p.id);
      who.append(a, el('small', eq(p.equipo) + (g ? '' : ' · ' + p.grupo)));
      const val = el('b', (key === '+/-' || key === 'Net en pista' || key === 'On/Off') && v > 0 ? '+' + fmt(v, d) : fmt(v, key === 'MIN' && s === 'tot' ? 0 : d));
      const right = el('span'); right.append(val, botonComparar({ t: 'j', id: p.id, nombre: pn(p.nombre) }));
      li.append(el('span', String(i + 1), 'n'), avatar(p.nombre, p.equipo, 'xs'), who, right);
      ol.append(li);
    });
    box.append(ol);
    return box;
  });
  $('#lideres').replaceChildren(...boxes);
}
const params = new URLSearchParams(location.search);
if ('ABCD'.includes(params.get('grupo') || 'x')) $('#grupo').value = params.get('grupo');
$('#grupo').onchange = $('#escala').onchange = render;
render();
