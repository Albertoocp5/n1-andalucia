// Additional season and play-by-play statistics transcribed from the visible Canastio tables.
const detailData = fetch('/n1detail.json').then(response => {
  if (!response.ok) throw Error();
  return response.json();
});
function splitText(value) {
  return (value || '').split('\n').map(s => s.trim()).filter(Boolean);
}
function makeTable(labels, rows) {
  const box = el('div'), table = el('table'), head = el('thead'), body = el('tbody'), r = el('tr');
  box.className = 'scroll';
  labels.forEach(label => r.append(el('th', label)));
  head.append(r);
  rows.forEach(row => body.append(cells(row)));
  table.append(head, body);
  box.append(table);
  return box;
}
function fold(label, content) {
  const section = el('details');
  section.append(el('summary', label), ...content);
  return section;
}
function seasonTables(p) {
  const sections = [];
  const totals = p.totals.map(([stat,total,average]) => [
    stat, stat === 'Minutos' && Number.isFinite(Number(total)) ? fmt.format(Number(total)) : total, average
  ]);
  sections.push(fold('Totales y medias de temporada', [makeTable(['Estadística','Acumulado','Media'], totals)]));
  const shots = splitText(p.tir);
  const rows = [];
  for (let i=0; i<shots.length; i++) {
    if (['Tiros de 2','Triples','Tiros libres'].includes(shots[i])) {
      rows.push([shots[i],shots[i+1] || '',/media/.test(shots[i+2] || '') ? shots[i+2] : '']);
    }
  }
  if(rows.length)sections.push(fold('Acierto en el tiro', [makeTable(['Tiro','Acierto y tiros','Comparación con la liga'],rows)]));
  const zone = splitText(p.zonas);
  if(zone.length) {
    const index = zone.findIndex(s => s.startsWith('Por zonas'));
    const info = zone.filter(s => /partidos? con mapa|al menos|tiros de campo/i.test(s))
      .map(s=>s.split(' Puedes verlos')[0]).join(' · ');
    const items = info ? [el('p',info)] : [];
    if(index >= 0) {
      const rows = [];
      for (let i=index+1; i+2<zone.length; i+=3) rows.push(zone.slice(i,i+3));
      if(rows.length)items.push(makeTable(['Zona','Aciertos / intentos','Diferencia con la liga'],rows));
    }
    if(items.length)sections.push(fold('Tiro por zonas',items));
  }
  const ratings = splitText(p.perfil);
  const rankings = [];
  for(let i=1; i<ratings.length; i++)if(/^top /i.test(ratings[i]))rankings.push([ratings[i-1],ratings[i]]);
  if(rankings.length)sections.push(fold('Perfil de juego en la competición',[makeTable(['Indicador','Posición relativa'],rankings)]));
  return sections;
}
let currentDetails = '';
async function renderPlayerExtra(player) {
  currentDetails = player.id;
  const area = document.querySelector('#extra');
  area.replaceChildren();
  let extra;
  try { extra = await detailData } catch { return }
  if(currentDetails !== player.id) return;
  const profile = extra.profiles[player.id];
  if(profile)area.append(...seasonTables(profile));
  const rows=[];
  for (const h of player.history) {
    const play=extra.plays[h.url.split('?')[0]];
    if(!play)continue;
    const counts=play[player.id], points=h.v[5];
    const off=counts?.['Rebote ofensivo']||0,def=counts?.['Rebote defensivo']||0;
    const checked=n(points)!=null && off+def===n(points);
    const events=counts ? Object.entries(counts).map(([name,value])=>name+' × '+value).join(' · ') : '';
    rows.push([h.journey,h.opponent,checked?off:'',checked?def:'',events]);
  }
  if(rows.length)area.append(fold('Rebotes y jugadas por partido',[makeTable(['Jornada','Rival','RO','RD','Jugadas registradas'],rows)]));
}
