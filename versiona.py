"""Aggiunge l'impronta del contenuto agli asset citati nelle pagine HTML.

GitHub Pages serve gli asset con cache-control: max-age=600. Senza impronta, per
dieci minuti dopo un rilascio un browser puo' combinare HTML nuovo e JavaScript
vecchio: la pagina si carica ma pezzi non compaiono. Rinominando l'URL a ogni
cambiamento di contenuto il problema sparisce, e i file immutati restano in cache.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RIF = re.compile(r'(src|href)="(assets/[\w.\-/]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"')


def impronta(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()[:10]


def main() -> int:
    cambiati = []
    for pagina in sorted(ROOT.glob("*.html")):
        testo = originale = pagina.read_text()

        def sost(m: re.Match) -> str:
            attr, rel = m.group(1), m.group(2)
            f = ROOT / rel
            if not f.exists():
                raise SystemExit(f"{pagina.name}: asset mancante {rel}")
            return f'{attr}="{rel}?v={impronta(f)}"'

        testo = RIF.sub(sost, testo)
        if testo != originale:
            pagina.write_text(testo)
            cambiati.append(pagina.name)
    print("pagine aggiornate:", ", ".join(cambiati) if cambiati else "nessuna (impronte già corrette)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
