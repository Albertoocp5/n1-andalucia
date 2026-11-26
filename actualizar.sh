#!/bin/zsh
# Actualización completa N1 desde Afición FAB hacia la web local (http://localhost:8787).
# 1) arranca la web local si no está, 2) descarga calendario y partidos nuevos o en juego,
# 3) valida y carga actas y jugadas, 4) recalcula y publica la estadística avanzada.
set -euo pipefail
RAIZ="${0:A:h}"
WEB="$RAIZ/web-en-progreso"
LOG="$RAIZ/registros/actualizar-$(date +%Y%m%d-%H%M).log"
mkdir -p "$RAIZ/registros" "$RAIZ/salidas"
exec > >(tee -a "$LOG") 2>&1
echo "== Actualización $(date '+%Y-%m-%d %H:%M:%S')"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! curl -s -o /dev/null -m 5 http://localhost:8787/; then
  echo "Arrancando la web local"
  (cd "$WEB" && nohup node dev/serve.mjs > "$RAIZ/registros/servidor.log" 2>&1 &)
  for i in {1..20}; do curl -s -o /dev/null -m 2 http://localhost:8787/ && break; sleep 1; done
fi
cd "$RAIZ/captura-app"
python3 recolectar.py "$RAIZ/datos-fab-vivo"
cd "$WEB"
export N1_SITE=http://localhost:8787 N1_TOKEN_FILE="$WEB/.fab-import-token-local" N1_PAUSA=0
python3 scripts/cargar-fab.py "$RAIZ/datos-fab-vivo" --publicar
python3 scripts/avanzadas.py "$RAIZ/datos-fab-vivo" "$RAIZ/salidas/avanzadas.json" --sitio http://localhost:8787 --publicar
# versión estática para GitHub Pages (carpeta docs/)
node scripts/build.mjs && node dev/exportar.mjs "$RAIZ/docs"
echo "== Terminado $(date '+%H:%M:%S') · registro: $LOG"
