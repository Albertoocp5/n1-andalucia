// Definiciones compartidas: explicaciones emergentes (al pasar el ratón o tocar) y página de glosario.
// Cada entrada: [nombre, qué es, cómo se calcula, '+' si más es mejor / '-' si menos es mejor].
export const TERMS = {
  // Estadística del acta
  'PJ': ['Partidos jugados', 'Partidos en los que ha participado.', 'Se cuentan los partidos con acta oficial de la FAB.'],
  'MIN': ['Minutos', 'Minutos en pista. En tablas «por partido», es la media por partido.', 'Del acta oficial; con el jugada a jugada se reconstruyen los minutos exactos de cada jugador.'],
  'PTS': ['Puntos', 'Puntos anotados.', 'Tiros libres + 2 × canastas de dos + 3 × triples, según el acta.', '+'],
  'T2': ['Tiros de dos', 'Canastas de dos anotadas / intentadas.', 'Del acta oficial.'],
  'T3': ['Triples', 'Triples anotados / intentados.', 'Del acta oficial.'],
  'TL': ['Tiros libres', 'Tiros libres anotados / intentados.', 'Del acta oficial.'],
  'TC': ['Tiros de campo', 'Canastas de dos y de tres juntas, anotadas / intentadas (sin tiros libres).', 'T2 + T3 del acta.'],
  'T2%': ['Acierto en tiros de dos', 'Porcentaje de canastas de dos anotadas.', 'Canastas de dos ÷ tiros de dos intentados × 100.', '+'],
  'T3%': ['Acierto en triples', 'Porcentaje de triples anotados.', 'Triples anotados ÷ triples intentados × 100.', '+'],
  'TL%': ['Acierto en tiros libres', 'Porcentaje de tiros libres anotados.', 'Libres anotados ÷ libres intentados × 100.', '+'],
  'TC%': ['Acierto en tiros de campo', 'Porcentaje de tiros de campo anotados (sin libres).', 'Canastas ÷ tiros de campo intentados × 100.', '+'],
  'T3I': ['Triples intentados', 'Cuántos triples ha lanzado.', 'Suma de triples intentados en el acta.'],
  'TLI': ['Tiros libres intentados', 'Cuántos tiros libres ha lanzado.', 'Suma de libres intentados en el acta.'],
  'REB': ['Rebotes', 'Rebotes capturados, ofensivos y defensivos.', 'Rebotes ofensivos + defensivos del acta.', '+'],
  'AST': ['Asistencias', 'Pases que acaban directamente en canasta.', 'Del acta oficial.', '+'],
  'ROB': ['Recuperaciones', 'Balones robados al rival.', 'Del acta oficial.', '+'],
  'PÉR': ['Pérdidas', 'Balones perdidos sin llegar a tirar.', 'Del acta oficial.', '-'],
  'TAP': ['Tapones', 'Tiros del rival taponados.', 'Del acta oficial.', '+'],
  'FC': ['Faltas cometidas', 'Faltas personales que ha hecho.', 'Del acta oficial.'],
  'FR': ['Faltas recibidas', 'Faltas que le han hecho.', 'Del acta oficial.'],
  'VAL': ['Valoración', 'Resumen de todo lo que hace en el acta: lo bueno suma y lo malo resta.', 'Puntos + rebotes + asistencias + recuperaciones + tapones + faltas recibidas − tiros fallados − pérdidas − tapones recibidos − faltas cometidas. Es la valoración oficial del acta.', '+'],
  'Titular': ['Partidos de titular', 'Partidos en los que estuvo en el quinteto inicial.', 'Del acta oficial.'],
  // Clasificación
  'Bal.': ['Balance', 'Victorias y derrotas.', 'Ganados – perdidos.'],
  'G': ['Ganados', 'Partidos ganados.', 'Partidos con resultado final.', '+'],
  'P': ['Perdidos', 'Partidos perdidos.', 'Partidos con resultado final.', '-'],
  'PF': ['Puntos a favor', 'Puntos anotados en toda la temporada.', 'Suma de los marcadores finales.', '+'],
  'PC': ['Puntos en contra', 'Puntos recibidos en toda la temporada.', 'Suma de los marcadores finales del rival.', '-'],
  'Dif.': ['Diferencia de puntos', 'Puntos a favor menos puntos en contra.', 'PF − PC.', '+'],
  'Últimos 5': ['Últimos cinco partidos', 'Cómo le ha ido en sus cinco partidos más recientes (G = ganado, P = perdido).', 'El más reciente a la derecha.'],
  'Casa': ['En casa', 'Partidos ganados – perdidos jugando como local.', 'Partidos con resultado final.'],
  'Fuera': ['Fuera de casa', 'Partidos ganados – perdidos jugando como visitante.', 'Partidos con resultado final.'],
  'Racha': ['Racha', 'Partidos seguidos ganados (G) o perdidos (P) hasta hoy.', 'Se cuentan desde el último partido hacia atrás.'],
  'Gr.': ['Grupo', 'Grupo de la N1 Andalucía (A, B, C o D).', 'Según el calendario oficial de la FAB.'],
  // Avanzada
  'Pos.': ['Posesiones', 'Cuántas veces ha tenido el balón un equipo. Sirve para comparar equipos que juegan rápido y lento.', 'Tiros de campo intentados − rebotes ofensivos + pérdidas + 0,44 × tiros libres intentados. Se promedian las de los dos equipos del partido.'],
  'Ritmo': ['Ritmo de juego', 'Posesiones que juega un equipo en 40 minutos. Más alto = partidos más rápidos.', 'Posesiones × 40 ÷ minutos jugados.'],
  'Ataque': ['Rating ofensivo', 'Puntos que anota por cada 100 posesiones. Mide la eficiencia en ataque sin importar el ritmo.', 'Puntos anotados × 100 ÷ posesiones. En un jugador, los del equipo mientras él está en pista.', '+'],
  'Defensa': ['Rating defensivo', 'Puntos que recibe por cada 100 posesiones del rival.', 'Puntos recibidos × 100 ÷ posesiones. En un jugador, los recibidos mientras él está en pista.', '-'],
  'Net': ['Diferencia neta', 'Cuántos puntos saca al rival por cada 100 posesiones. Por encima de 0, mejor que sus rivales.', 'Ataque − Defensa.', '+'],
  'Dif. neta': ['Diferencia neta', 'Cuántos puntos saca al rival por cada 100 posesiones. Por encima de 0, mejor que sus rivales.', 'Ataque − Defensa.', '+'],
  'Net en pista': ['Diferencia neta con él en pista', 'Diferencia neta del equipo mientras este jugador juega.', 'Ataque − Defensa del equipo en sus minutos, con el jugada a jugada.', '+'],
  'Net sin él': ['Diferencia neta sin él', 'Diferencia neta del equipo cuando este jugador está en el banquillo.', 'Ataque − Defensa del equipo en los minutos sin él. Solo si el equipo jugó más de 60 posesiones sin él.', '+'],
  'On/Off': ['Con él / sin él', 'Cuánto mejora (o empeora) el equipo cuando el jugador está en pista.', 'Net con él en pista − Net sin él. Solo si el equipo jugó más de 60 posesiones sin él. Depende mucho de los compañeros, así que conviene mirarlo con otros datos.', '+'],
  'eFG%': ['Tiro de campo efectivo', 'Acierto en tiros de campo dando más valor a los triples, porque valen un punto más.', '(Canastas + 0,5 × triples anotados) ÷ tiros de campo intentados × 100.', '+'],
  'TS%': ['Tiro real (True Shooting)', 'El mejor resumen de la puntería: tiene en cuenta dobles, triples y tiros libres.', 'Puntos ÷ (2 × (tiros de campo intentados + 0,44 × tiros libres intentados)) × 100.', '+'],
  'TOV%': ['Pérdidas por 100 posesiones', 'Qué parte de sus posesiones termina en pérdida.', 'Pérdidas × 100 ÷ posesiones.', '-'],
  'ORB%': ['Rebote ofensivo %', 'Qué parte de los rebotes en su propio aro captura (de su equipo, o del jugador mientras está en pista).', 'Rebotes ofensivos ÷ (rebotes ofensivos propios + rebotes defensivos del rival) × 100.', '+'],
  'DRB%': ['Rebote defensivo %', 'Qué parte de los rebotes en el aro propio (tras fallo del rival) captura.', 'Rebotes defensivos ÷ (rebotes defensivos propios + rebotes ofensivos del rival) × 100.', '+'],
  'FTr': ['Frecuencia de tiros libres', 'Cuántas veces llega a la línea de tiros libres por cada tiro de campo.', 'Tiros libres intentados ÷ tiros de campo intentados.', '+'],
  'AST%': ['Asistencias %', 'Equipo: qué parte de sus canastas viene de una asistencia. Jugador: qué parte de las canastas de sus compañeros en pista asiste él.', 'Equipo: asistencias ÷ canastas × 100. Jugador: asistencias ÷ (canastas del equipo con él en pista − sus canastas) × 100.', '+'],
  '3PAr': ['Frecuencia de triple', 'Qué parte de sus tiros de campo son triples.', 'Triples intentados ÷ tiros de campo intentados × 100.'],
  'USG%': ['Uso', 'Qué parte de las jugadas de su equipo termina él (tirando, yendo a la línea o perdiendo el balón) mientras está en pista.', '(Tiros de campo + 0,44 × tiros libres + pérdidas del jugador) ÷ lo mismo del equipo con él en pista × 100.'],
  'PPP': ['Puntos por posesión usada', 'Cuántos puntos saca de cada jugada que termina él. Mide eficiencia anotadora.', 'Puntos ÷ (tiros de campo + 0,44 × tiros libres + pérdidas).', '+'],
  '+/-': ['Más / menos', 'Diferencia del marcador mientras el jugador está en pista.', 'Puntos del equipo − puntos del rival en sus minutos, con el jugada a jugada (o el acta si no lo hay).', '+'],
  'Clutch': ['Final apretado', 'Lo que pasa en los momentos decisivos.', 'Últimos 5 minutos del 4.º periodo o de la prórroga con 5 puntos o menos de diferencia.'],
  'Parcial': ['Parcial', 'Puntos seguidos de un equipo sin que anote el rival.', 'Se muestran los de 8 puntos o más.'],
  'p40': ['Por 40 minutos', 'Lo que haría jugando un partido entero. Iguala a quien juega mucho y a quien juega poco.', 'Valor total × 40 ÷ minutos jugados.'],
  'Fuerza': ['Fuerza estimada', 'Puntos por encima (o por debajo) de un equipo medio del grupo en campo neutral.', 'Se calcula con la diferencia de cada partido, corregida por la fuerza del rival y por jugar en casa.'],
  'V esp.': ['Victorias esperadas', 'Victorias que acabaría teniendo de media al final de la liga regular.', 'Media de 10.000 simulaciones del resto del calendario.'],
  'Puesto esp.': ['Puesto esperado', 'Puesto medio en que acabaría la liga regular.', 'Media de 10.000 simulaciones del resto del calendario.'],
  'Prob.': ['Probabilidad de victoria', 'Opciones de ganar según la fuerza de cada equipo y el factor campo.', 'Modelo de fuerza del simulador con la dispersión real de resultados del grupo.'],
  'Puesto': ['Puesto', 'Su posición entre los jugadores (o equipos) comparables en esa estadística: 1.º es el mejor.', 'Se ordena de mejor a peor. Solo entran jugadores con un mínimo de minutos y partidos, para no comparar con quien apenas ha jugado.'],
};

// Alias: distintas etiquetas que significan lo mismo
const ALIAS = { 'PER': 'PÉR', '+/−': '+/-', 'Más / menos': '+/-', 'Uso %': 'USG%', 'Uso': 'USG%', 'Pos': 'Pos.', 'Reb': 'REB', 'Pts': 'PTS', 'Ast': 'AST', 'Val': 'VAL', 'Min': 'MIN', 'Rebote ofensivo %': 'ORB%', 'Rebote defensivo %': 'DRB%', 'Tiro real': 'TS%', 'Valoración': 'VAL', 'Puntos': 'PTS', 'Rebotes': 'REB', 'Asistencias': 'AST', 'Recuperaciones': 'ROB', 'Pérdidas': 'PÉR', 'Tapones': 'TAP', 'Triples %': 'T3%', 'Tiros libres %': 'TL%', 'MIN tot.': 'MIN', 'Res.': null };
export function term(label) {
  if (label == null) return null;
  const k = Object.hasOwn(ALIAS, label) ? ALIAS[label] : label;
  return k && TERMS[k] ? { key: k, name: TERMS[k][0], what: TERMS[k][1], how: TERMS[k][2], dir: TERMS[k][3] } : null;
}
// Compatibilidad: texto plano de cada definición
export const GLOSSARY = Object.fromEntries(Object.entries(TERMS).map(([k, [n, w, h]]) => [k, `${n}. ${w} Cálculo: ${h}`]));
