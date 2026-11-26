const short = [
  'CB El Palo – Basket4Life', 'EBG Málaga Tecnocasa', 'Invermoneda CB Alhaurín de la Torre',
  'Málaga Basket', 'CB Benalmádena', 'Unicaja', 'Linaqua CB Linares',
  'CB Salliver Fuengirola Higuerón Resort', 'CD Colegio El Pinar', 'Club Andújar',
  'Campoameno CB La Mota', 'Caja Rural Jaén C. B.',
];
const names = new Map(league.rows.map(([name], index) => [name, short[index]]));
const format = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function node(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function summary(label, title, detail) {
  const card = node('div', '', 'card');
  card.append(node('span', label, 'label'), node('strong', title), node('p', detail));
  document.querySelector('#summary').append(card);
}

const attack = league.rows.reduce((best, row) => row[4] / row[1] > best[4] / best[1] ? row : best);
summary('Líder', short[0], league.rows[0][2] + ' victorias');
summary('Mejor ataque', names.get(attack[0]), format.format(attack[4] / attack[1]) + ' puntos por partido');
summary('Grupo C', league.rows.length + ' equipos', league.games.filter(game => game[4] !== '-').length + ' marcadores disponibles');

league.rows.forEach(([name, played, wins, losses, scored, allowed], index) => {
  const row = document.createElement('tr');
  const position = node('th', index + 1);
  position.scope = 'row';
  const difference = scored - allowed;
  row.append(position, ...[names.get(name), played, wins, losses, scored, allowed,
    difference > 0 ? '+' + difference : difference, format.format(scored / played)].map(value => node('td', value)));
  document.querySelector('#standings').append(row);
});

const teamFilter = document.querySelector('#team');
const statusFilter = document.querySelector('#status');
[...names].sort((a, b) => a[1].localeCompare(b[1], 'es')).forEach(([key, value]) => {
  teamFilter.add(new Option(value, key));
});

function renderMatches() {
  const upcoming = statusFilter.value === 'upcoming';
  const matches = league.games.filter(([date, home, away, , score]) => {
    const [day, month, year] = date.slice(0, 10).split('.');
    const future = [year, month, day].join('-') > '2026-11-23';
    return (upcoming ? future && score === '-' : score !== '-') &&
      (!teamFilter.value || [home, away].includes(teamFilter.value));
  });
  if (!upcoming) matches.reverse();
  document.querySelector('#count').textContent = matches.length === 1 ? '1 partido disponible' : matches.length + ' partidos disponibles';
  document.querySelector('#matches').replaceChildren(...matches.map(([when, home, away, venue, score]) => {
    const match = node('article', '', 'match');
    const [homeScore, awayScore] = upcoming ? ['', ''] : score.split('-');
    match.append(node('small', when.replace(' ', ' · ')));
    [[home, homeScore], [away, awayScore]].forEach(([name, points]) => {
      const line = node('div', '', 'team');
      line.append(node('span', names.get(name) || name), node('strong', points));
      match.append(line);
    });
    match.append(node('p', venue, 'venue'));
    return match;
  }));
}
teamFilter.addEventListener('change', renderMatches);
statusFilter.addEventListener('change', renderMatches);
renderMatches();
