# 🏀 N1 Andalucía

Estadística avanzada de la Primera Nacional masculina de Andalucía (Liga Nacional N1, grupos A, B, C y D), temporada 2026/2027, con los datos oficiales de Afición FAB.

Publicada en https://albertoocp5.github.io/n1-andalucia/.

La web se actualiza sola desde GitHub Actions: descarga el calendario, las actas y el jugada a jugada, recalcula la estadística y vuelve a publicar, también durante los partidos en directo.

## Qué ofrece

Al entrar se elige un modo, que se puede cambiar en cualquier momento desde el menú:

- **Aficionado**: resultados, directo, clasificación, líderes y tu equipo, de un vistazo.
- **Analista**: todas las métricas, quintetos, mapas de tiro, comparador, simulador y jugada a jugada.

| Página | Qué hay |
|---|---|
| Inicio (`index.html`) | Jornadas de los cuatro grupos y bloque «En directo». Cada partido tiene pestañas Resumen, Acta, Jugada a jugada y Avanzado, el mejor del partido (★ MVP, cuando ha terminado) y botón Compartir. El directo consulta Afición FAB desde el navegador |
| Clasificación (`clasificacion.html`) | Clasificación por grupo, racha y estadística de equipo |
| Líderes (`lideres.html`) | Líderes por estadística, en totales, por partido o por 40 minutos |
| Estadística avanzada (`avanzada.html`) | Pestañas Equipos, Jugadores, Quintetos, Mapas de tiro, Final apretado, Simulador y Glosario |
| Ficha de jugador (`jugador.html?id=`) | Percentiles frente a la liga y frente a su grupo (anotación, tiro real, creación, rebote, defensa, uso e impacto), impacto en pista, mapa de tiro, final apretado, partido a partido y jugadores parecidos |
| Ficha de equipo (`equipo.html?n=`) | Cuatro factores, ratings, plantilla, quintetos y proyección del simulador |
| Comparador (`comparar.html`) | Jugadores o equipos frente a frente |
| Laboratorio (`liga.html`) | Volumen y acierto de la liga, clasificación por jornada y pronósticos publicados |

Además:

- **Tu equipo**: al entrar (o con «☆ Hacer mi equipo» en cualquier ficha) se elige un equipo favorito, que queda destacado en toda la web y cuyo partido sale el primero en el directo. Se guarda en el navegador.
- **Métricas**: posesiones, OffRtg, DefRtg y Net, ritmo, eFG%, TS%, TOV%, ORB%, FT rate, AST%, USG%, +/- y ratings en pista, final apretado (últimos 5 minutos con ±5 puntos) y parciales de 8-0 o más. Todas las definiciones están en el Glosario y en explicaciones emergentes.
- **Simulador de clasificación**: ratings por diferencia de puntos, ajustados por rival y pista, y 10.000 simulaciones Monte Carlo de los partidos que quedan.
- **Mapas de tiro** con las coordenadas de Afición FAB pasadas a medidas FIBA.
- Escudos de los 48 equipos, fotos de los jugadores y modo claro u oscuro.

## Cómo funciona

```
┌────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Afición FAB│───▶│  Recolector  │───▶│  Validación  │───▶│  Web local   │───▶│ Web estática │
│ (servidor  │    │ recolectar.py│    │ cargar-fab.py│    │ Worker en    │    │   docs/ en   │
│ federación)│    │   Python     │    │ avanzadas.py │    │ Node.js 22   │    │ GitHub Pages │
└────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

1. **Recolector, sin emulador.** `captura-app/recolectar.py` hace por internet las mismas consultas que la app de Afición FAB al servidor de la federación. Abre una sesión de invitado propia (se guarda en `captura-app/.sesion-fab.json`, nunca en el repositorio), pide el calendario y baja el acta y el jugada a jugada de los partidos nuevos, de los que cambian de marcador y de los que están en juego. Lo deja todo en `datos-fab-vivo/`.
2. **Validación e importación.** `web-en-progreso/scripts/cargar-fab.py` comprueba equipos, jornadas, marcadores y que los puntos cuadren, y carga calendario, actas y jugadas en la web. `scripts/avanzadas.py` calcula ratings, percentiles, quintetos, final apretado y mapas de tiro.
3. **Web local.** `web-en-progreso/dev/serve.mjs` ejecuta el Worker compilado (`server.mjs`, `fab.mjs`, `actas.mjs`) con un almacenamiento en disco y sirve la web en `http://localhost:8787`.
4. **Versión estática.** `web-en-progreso/dev/exportar.mjs` recorre la web local y guarda cada página, recurso y respuesta de la API como archivo en `docs/`, con un pequeño traductor que hace que la API funcione sin servidor.
5. **Actualización automática.** `.github/workflows/actualizar.yml` repite la cadena en los servidores de GitHub y sube los cambios de `datos-fab-vivo/` y `docs/`. Mientras haya partidos en juego, sigue publicando el directo cada ~5 minutos.

## Arranque rápido

```bash
# Requisitos: Python ≥ 3.10, Node.js ≥ 22 y curl. No hace falta instalar librerías.

cd web-en-progreso
node scripts/build.mjs                 # compila el Worker en dist/server/index.js
node dev/serve.mjs --seed              # terminal 1, http://localhost:8787

./actualizar.sh                        # terminal 2, desde la raíz: descarga, valida, carga y calcula
```

`--seed` reinicia el almacenamiento local con el estado guardado en `estado-web-publicada/`; úsalo solo la primera vez. Después basta `node dev/serve.mjs`.

`actualizar.sh` arranca la web local si está parada, descarga los datos, los carga, recalcula la estadística avanzada y regenera `docs/`. Deja un registro en `registros/`.

Para sacar los datos desde otra máquina (Mac, Linux o Windows con WSL), qué copiar y qué no, y cómo programar la actualización, ver [Como-sacar-datos-FAB-otra-maquina.pdf](Como-sacar-datos-FAB-otra-maquina.pdf).

## Estructura

```
captura-app/            Recolector de Afición FAB sin emulador
├── fab_api.py          Cliente del servicio FAB (sesión de invitado y key rotatoria)
├── recolectar.py       Descarga calendario, actas y jugada a jugada
└── hay_directo.py      Dice si hay partidos en juego (para seguir en directo)
datos-fab/              Captura inicial del 26-11-2026 (referencia)
datos-fab-vivo/         Datos actuales: calendario, partidos/ y medios/ (escudos y fotos)
docs/                   Web estática publicada en GitHub Pages (se genera, no se edita a mano)
estado-web-publicada/   Estado guardado de la web original, para sembrar la web local
referencia/             Instrucciones históricas del inicio del proyecto
web-base-v11/           Código de la versión 11 original, como referencia
web-en-progreso/        La web actual
├── web/                Páginas, estilos y JavaScript del navegador
├── server.mjs, fab.mjs, actas.mjs   Worker: API, importación de datos y actas
├── scripts/            build.mjs, cargar-fab.py, avanzadas.py, importar-fab.py
└── dev/                serve.mjs, exportar.mjs, bucket.mjs, simular-directo.py
.github/workflows/      actualizar.yml, la actualización automática
actualizar.sh           Actualización completa en una sola orden
```

## Documentación

| Documento | Para qué |
|---|---|
| [EMPIEZA-AQUI.md](EMPIEZA-AQUI.md) | Traspaso del proyecto: contenido, estado inicial y casos pendientes |
| [ESTADO-2026-11-26.md](ESTADO-2026-11-26.md) | Estado de los datos, la web y la publicación |
| [Como-sacar-datos-FAB-otra-maquina.pdf](Como-sacar-datos-FAB-otra-maquina.pdf) | Requisitos, paso a paso, conexión con Afición FAB y tareas programadas |
| [PROMPT-NUEVO-CHAT.md](PROMPT-NUEVO-CHAT.md) | Objetivos y criterios del trabajo pendiente |
| Pestaña Glosario de `avanzada.html` | Definición de cada métrica |

## Comandos

```bash
./actualizar.sh                                          # actualización completa
python3 captura-app/recolectar.py datos-fab-vivo --todo  # vuelve a descargar todos los partidos terminados
cd web-en-progreso && python3 scripts/cargar-fab.py ../datos-fab-vivo   # solo valida, sin cargar
cd web-en-progreso && node dev/exportar.mjs ../docs      # regenera la web estática
python3 web-en-progreso/dev/simular-directo.py <id-partido>   # simula un directo contra la web local
```

## Actualización automática

`.github/workflows/actualizar.yml` se ejecuta (hora de Madrid, invierno):

- los lunes a las 08:00;
- viernes, sábado y domingo, cada media hora de 11:00 a 23:00;
- de lunes a jueves, cada media hora de 18:00 a 22:00;
- al subir cambios de código a `main` (no de datos, `docs/` ni `.md`);
- a mano, desde Actions → «Run workflow».

Si hay partidos en juego, la ejecución se queda en marcha y publica el directo cada ~5 minutos, hasta unas 5 horas. La sesión de invitado de Afición FAB se conserva en la caché de Actions. GitHub Pages publica la rama `main`, carpeta `/docs`.

## Tecnologías

- **Python 3** (solo biblioteca estándar): recolector, validación y estadística avanzada.
- **Node.js 22**: Worker con la API, servidor local y exportación estática.
- **HTML, CSS y JavaScript** sin frameworks en el navegador.
- **GitHub Actions** para la actualización y **GitHub Pages** para la publicación.

## Autor

[Albertoocp5](https://github.com/Albertoocp5)
