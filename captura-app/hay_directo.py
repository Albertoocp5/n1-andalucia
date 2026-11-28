#!/usr/bin/env python3
"""¿Hay que seguir actualizando en directo? Imprime «si» o «no» leyendo el calendario guardado.

Sí cuando algún partido está en juego, o no ha terminado y su hora de inicio está entre hace
3 horas y dentro de 90 minutos (la app de la federación a veces marca el inicio tarde)."""
import json, re, sys, time
from pathlib import Path

ANTES, DESPUES = 90 * 60, 3 * 3600


def main():
    calendario = json.loads(Path(sys.argv[1]).read_text())
    ahora = time.time()
    for p in calendario:
        estado = p.get("Estado", "")
        if estado in ("En juego", "En curso"):
            print("si"); return
        if estado in ("Terminado", "Aplazado", "Suspendido"):
            continue
        m = re.search(r"\d+", p.get("FechaHoraUTC") or "")
        if m and -ANTES <= ahora - int(m.group()) / 1000 <= DESPUES:
            print("si"); return
    print("no")


if __name__ == "__main__":
    main()
