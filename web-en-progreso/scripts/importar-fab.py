#!/usr/bin/env python3
"""Read a Liga Nacional N1 men's statistics PDF exported by Afición FAB."""

import argparse
from decimal import Decimal, ROUND_HALF_UP
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import NamedTemporaryFile



SITE = os.environ.get("N1_SITE", "https://primer-nacional-andalucia.fabulousebony.chatgpt.site")
COLUMNS = (3, 4, 6, 8, 12, 13, 14, 15, 16, 18, 19, 21, 20)
TITLE = re.compile(r"Estadísticas\s+[-\u00ad–]\s+(.+?)\s+vs\s+(.+?)\s+[-\u00ad–]\s+N1 MAS\b")
SEASON = re.compile(r"Temporada (\d{4}/\d{4})\b")


def minutes(value):
    whole, seconds = map(int, value.split(":"))
    if not 0 <= seconds < 60 or not 0 <= whole <= 99:
        raise ValueError("Tiempo de juego fuera de rango")
    value = Decimal(whole) + Decimal(seconds) / 60
    return str(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)).replace(".", ",")


def team_table(name, table):
    tot = [row for row in table if row[1] == "TOTALES"]
    if len(tot) != 1:
        raise ValueError(f"Faltan los totales de {name}")
    rows = []
    for row in table:
        if not row[0] or not row[0].isdigit():
            continue
        player = row[1].strip("* ").removesuffix(" (CAP)").replace("\u00ad", "-")
        stats = [row[c].replace("\u00ad", "-") for c in COLUMNS]
        rows.append([player, minutes(row[2]), *stats])
    score = int(tot[0][3])
    if not rows or sum(int(row[2]) for row in rows) != score:
        raise ValueError(f"Las filas de {name} no suman los puntos del informe")
    return {"team": name, "rows": rows}, score


def report_from_pdf(path, fixture_id, date, round_no):
    import pdfplumber
    with pdfplumber.open(path) as document:
        title = " ".join((document.pages[0].extract_text() or "").split())
        teams = TITLE.search(title)
        season = SEASON.search(title)
        if not teams or not season or "FEDERACIÓN ANDALUZA DE BALONCESTO" not in title:
            raise ValueError("Se esperaba el PDF de Estadísticas de un partido de N1 masculina")
        tables = [
            table for page in document.pages for table in page.extract_tables()
            if len(table[0]) == 22 and any(row[1] == "TOTALES" for row in table)
        ]
    if len(tables) != 2:
        raise ValueError("Se esperaba una tabla completa por equipo")
    box, score = zip(*(team_table(name, table) for name, table in zip(teams.groups(), tables)))
    payload = {"id": fixture_id, "date": date, "year": season[1], "score": score, "teams": box}
    if round_no:
        payload["round"] = f"Jornada {round_no}"
    return payload


def upload(payload, token_path):
    token = token_path.read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", token):
        raise ValueError("La credencial local de importación no es válida")
    with NamedTemporaryFile(mode="w", encoding="utf-8") as report:
        json.dump(payload, report, ensure_ascii=False)
        report.flush()
        process = subprocess.run(
            [
                "/usr/bin/curl", "--silent", "--show-error", "--fail-with-body",
                "--max-time", "25", "--config", "-", "--data-binary", "@" + report.name,
                SITE + "/api/actas-fab",
            ],
            input=f'header = "Authorization: Bearer {token}"\nheader = "Content-Type: application/json"\n',
            encoding="utf-8",
            check=False,
        )
    return process.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("informe", type=Path)
    parser.add_argument("--partido", required=True, help="Identificador del partido en el calendario del sitio")
    parser.add_argument("--fecha", required=True, help="Fecha del partido en formato AAAA-MM-DD")
    parser.add_argument("--jornada", type=int, help="Jornada que muestra Afición FAB")
    parser.add_argument("--publicar", action="store_true", help="Guarda en el sitio el informe validado")
    args = parser.parse_args()
    try:
        payload = report_from_pdf(args.informe, args.partido, args.fecha, args.jornada)
        if args.publicar:
            return upload(payload, Path(__file__).resolve().parent.parent / ".fab-import-token")
        print(json.dumps(payload, ensure_ascii=False))
    except (OSError, ValueError) as error:
        parser.exit(2, f"{error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
