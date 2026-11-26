// Mapa de tiro sobre media pista FIBA (medidas reales, metros con origen en el aro).
// Cada tiro: {a: metros hacia el centro del campo, s: metros hacia la banda, v: 2|3, m: 0|1}
const NS = 'http://www.w3.org/2000/svg';
const PX = 30, HALF_W = 7.5, BASE = -1.575, MID = 12.425;
const sx = s => (s + HALF_W) * PX, sy = a => (MID - a) * PX; // canasta abajo
export const ZONES = ['Aro', 'Pintura', 'Media distancia', 'Triple esquina', 'Triple lateral', 'Triple frontal'];

function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
}

function courtLines(svg) {
  const g = node('g', { class: 'court' }, svg);
  node('rect', { x: 0, y: 0, width: 15 * PX, height: 14 * PX, class: 'floor' }, g);
  const line = (a1, s1, a2, s2) => node('line', { x1: sx(s1), y1: sy(a1), x2: sx(s2), y2: sy(a2) }, g);
  const arc = (r, from, to, ca = 0, sweep = 0) => {
    const p = t => [sx(r * Math.sin(t)), sy(ca + r * Math.cos(t))];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    node('path', { d: `M${x1} ${y1} A${r * PX} ${r * PX} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${sweep} ${x2} ${y2}` }, g);
  };
  node('rect', { x: sx(-2.45), y: sy(BASE + 5.8), width: 4.9 * PX, height: 5.8 * PX, class: 'paint' }, g);
  const corner = Math.sqrt(6.75 ** 2 - 6.6 ** 2);
  line(BASE, -6.6, corner, -6.6); line(BASE, 6.6, corner, 6.6);
  const t3 = Math.asin(6.6 / 6.75);
  arc(6.75, -t3, t3, 0, 1);                            // triple
  arc(1.8, -Math.PI / 2, Math.PI / 2, BASE + 5.8, 1);  // tiros libres
  arc(1.25, -Math.PI / 2, Math.PI / 2, 0, 1);          // semicírculo sin carga
  arc(1.8, Math.PI / 2, -Math.PI / 2, MID, 1);         // círculo central
  line(-0.375, -0.9, -0.375, 0.9);                     // tablero
  node('circle', { cx: sx(0), cy: sy(0), r: 0.225 * PX, class: 'rim' }, g);
}

export function drawCourt(container, shots, { title = '', label = '' } = {}) {
  const svg = node('svg', { viewBox: `0 0 ${15 * PX} ${14 * PX}`, role: 'img', class: 'shot-chart', 'aria-label': label || 'Mapa de tiro' });
  courtLines(svg);
  const dots = node('g', { class: 'shots' }, svg);
  // fallos debajo, aciertos encima
  for (const t of [...shots].sort((x, y) => x.m - y.m)) {
    const cx = sx(t.s), cy = sy(Math.max(t.a, BASE + 0.15));
    if (t.m) node('circle', { cx, cy, r: 4.2, class: 'made v' + t.v }, dots);
    else { const r = 3.4; node('path', { d: `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`, class: 'miss v' + t.v }, dots); }
  }
  const made = shots.filter(t => t.m).length;
  const fig = document.createElement('figure');
  fig.className = 'shot-figure';
  const cap = document.createElement('figcaption');
  cap.innerHTML = '';
  if (title) cap.append(Object.assign(document.createElement('b'), { textContent: title }));
  cap.append(document.createTextNode(` ${made}/${shots.length} tiros de campo` + (shots.length ? ` · ${(100 * made / shots.length).toFixed(1).replace('.', ',')} %` : '')));
  const legend = document.createElement('span');
  legend.className = 'shot-legend';
  legend.innerHTML = '<i class="lg-made"></i>Anotado <i class="lg-miss"></i>Fallado';
  fig.append(svg, cap, legend);
  container.append(fig);
  return fig;
}

// Tabla por zonas comparada con la media de la liga
export function zoneTable(container, zones, league) {
  const total = ZONES.reduce((a, z) => a + (zones[z]?.int || 0), 0);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const t = document.createElement('table');
  t.className = 'adv-table zone-table';
  t.innerHTML = '<thead><tr><th>Zona</th><th class="num">TC</th><th class="num">%</th><th class="num" title="Diferencia con el porcentaje medio de la liga en esa zona">vs. liga</th><th class="num" title="Parte de los tiros de campo que se lanzan desde esa zona">Frecuencia</th><th class="num" title="Puntos por tiro desde esa zona">Pts/tiro</th></tr></thead>';
  const body = document.createElement('tbody');
  const f = (v, d = 1) => v == null ? '—' : v.toFixed(d).replace('.', ',');
  for (const z of ZONES) {
    const d = zones[z] || { int: 0, anot: 0 }, l = league[z];
    const pct = d.int ? 100 * d.anot / d.int : null, lp = l?.int ? 100 * l.anot / l.int : null;
    const diff = pct != null && lp != null ? pct - lp : null;
    const tr = document.createElement('tr');
    const cells = [z, `${d.anot}/${d.int}`, f(pct), diff == null ? '—' : (diff > 0 ? '+' : '') + f(diff), total ? f(100 * d.int / total) + ' %' : '—', d.int ? f((z.startsWith('Triple') ? 3 : 2) * d.anot / d.int, 2) : '—'];
    cells.forEach((c, i) => {
      const td = document.createElement('td'); td.textContent = c; if (i) td.className = 'num';
      if (i === 3 && diff != null && d.int >= 5) td.style.setProperty('--heat', String(Math.max(-1, Math.min(1, diff / 12)).toFixed(2)));
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body); wrap.append(t); container.append(wrap);
}

export const fromRow = r => ({ a: r[0] / 10, s: r[1] / 10, v: r[2], m: r[3] });
