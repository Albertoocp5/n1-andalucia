# Primera Nacional Andalucía · Traspaso del 26 de noviembre de 2026

Temporada 2026/2027 de la Liga Nacional N1 Masculina de Andalucía. El despliegue público confirmado en Sites es la versión **11** del proyecto `appgprj_6b04cc49d5ac819195cfbd9d3fa09ae7`. El traspaso se preparó sin desplegar ni importar datos nuevos. [Web publicada](https://primer-nacional-andalucia.fabulousebony.chatgpt.site/)

## Contenido del ZIP

| Ruta | Contenido |
| --- | --- |
| `web-base-v11/` | Código completo del commit `2240e7dceaa04e9f6ba95381f4ecd83c4bef5050`, base de la versión 11. Incluye el proyecto Sites, las páginas, el Worker, los scripts, los datos iniciales y los pronósticos iniciales. |
| `web-en-progreso/` | Copia íntegra de esa base con los cambios locales para importar el calendario, actas y jugadas de la FAB y mostrarlos en las fichas. Pendiente de validación integral y despliegue. |
| `datos-fab/` | Captura de Afición FAB del 26 de noviembre. `calendario.json` contiene 528 partidos de 48 equipos. `partidos/` contiene 167 respuestas de encuentros finalizados con datos para actas y jugadas. `categorias.json` y `grupos.json` acompañan a la captura. |
| `estado-web-publicada/` | Respuestas públicas guardadas de `/season.json`, `/api/pronosticos` y `/api/results-saved`. Representan la web publicada en el momento del traspaso, incluidas las dos actas FAB verificadas. |
| `referencia/EMPIEZA-AQUI-original.md` | Instrucciones históricas recibidas al inicio del proyecto. Las indicaciones de Windows y Canastio de ese archivo corresponden al estado inicial. |
| `PROMPT-NUEVO-CHAT.md` | Instrucciones para pegar en el nuevo chat con el ZIP adjunto. |

El almacenamiento `BUCKET` y la automatización pertenecen al proyecto de Sites. Los archivos del paquete son una copia del código y de los datos deportivos disponibles. Las credenciales, las sesiones de invitado, el emulador, el repositorio Git y los borradores personales de la web quedan en sus entornos originales. Los archivos de `datos-fab/` y `estado-web-publicada/` deben quedar fuera del directorio que se publique como recursos estáticos.

## Estado que verá el nuevo chat

- La web publicada contiene 528 fichas y tiene dos actas verificadas de Afición FAB. Son Caja Rural Jaén 83–72 CB Benalmádena (grupo C) y Obertum CB Gibraleón 73–65 CB Lepe Alius El Jamón (grupo A). Se comparó el acta de Jaén con 21 jugadores y 294 valores, incluido el redondeo de minutos.
- La v11 admite actas en `POST /api/actas-fab`. El importador antiguo `/api/actas` devuelve HTTP 410. El refresco de marcadores de la versión publicada todavía usa SportsEvents24.
- La captura oficial tiene 132 partidos y 22 jornadas en cada grupo. Los finalizados se reparten en A (42), B (42), C (42) y D (41). Las 528 fichas coinciden con el calendario por grupo y equipos. Quedan 361 partidos programados en la captura.
- La validación local con el importador actual acepta 159 actas y 166 secuencias con 102.575 acciones. Los 167 archivos capturados quedan disponibles para completar la revisión. Este recuento corresponde a una ejecución sin publicación y todavía se debe probar el lote contra el Worker.
- Android Studio en el Mac ejecutó Afición FAB 5.0.14 en Android 15, con el dispositivo virtual `Aficion_FAB_-_Android_15`. La prueba anterior de Android 16 con Afición FAB 5.0.42 no ofrecía instalación compatible en Google Play. Se comprobó que la versión de Android 15 permite ver actas y jugadas sin un móvil físico. La captura utilizó la sesión de invitado del propio emulador para consultar el servicio de Afición FAB. La actualización en directo y la renovación desatendida de la sesión están pendientes de verificar.
- La automatización `Automation_3e50ceea12f08191b466ee9a057a1652` está activa los lunes a las 08:00, hora de Madrid. Actualmente refresca marcadores y aún no recoge el jugada a jugada de la FAB.

## Comprobación local de la copia

Desde la raíz extraída, abre `web-en-progreso/`. El proyecto usa Node.js 22 o superior y Python 3. Asegúrate de que el Python elegido dispone de `pdfplumber`, que el importador en progreso carga también para reutilizar el formato de minutos de las actas.

```sh
cd web-en-progreso
node scripts/build.mjs
python3 scripts/cargar-fab.py ../datos-fab
```

El primer comando compila el Worker en `dist/server/index.js`. El segundo valida la captura localmente. El modo `--publicar` escribe en la web real y requiere la credencial de importación del propietario. Antes de usarlo, valida el lote contra el Worker con un almacenamiento de prueba y comprueba las rutas de producción tras desplegar. La copia conserva `.openai/hosting.json` con el ID original. Para continuar en Sites abre su repositorio con el flujo del plugin y lleva los cambios de `web-en-progreso/` a ese checkout.

## Casos concretos pendientes

Las ocho actas rechazadas se concentran en tres pares de nombres del Grupo D. Verifica la identidad con la referencia oficial del partido antes de aceptarlos como equivalentes.

| Nombre del calendario FAB | Nombre del acta FAB | Club que figura en el calendario |
| --- | --- | --- |
| DUNAMAR CB LA MOJONERA | CB LA MOJONERA | CB LA MOJONERA |
| MAGAR CDB ADRA | CD BALONCESTO ADRA 2012 | CD BALONCESTO ADRA 2012 |
| STUDENT EXPERIENCE FCBG | CD GRANADA POR EL BALONCESTO | FUNDACION CB GRANADA |

El Grupo B tiene un caso en la jornada 6. **CB Utrera–CB Cimbis** trajo 591 acciones con 590 identificadores distintos. Compara las dos acciones que comparten identificador antes de eliminar o renumerar alguna y conserva el orden oficial.

La copia local añade `POST /api/calendario-fab`, `POST /api/jugadas-fab` y `GET /api/jugadas-fab?partido=<id>`. Permite presentar una puntuación provisional distinta del resultado final, pero el recolector usado para esta captura solo descargó el detalle de partidos finalizados. Queda pendiente conectar y verificar la recogida periódica y en directo.
