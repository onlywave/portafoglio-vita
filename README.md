# PORTAFOGLIO VITA

Cruscotto quantitativo dei due portafogli **VITA 5M** e **VITA 5M-C40**.

**Pagina: https://onlywave.github.io/portafoglio-vita/**

## Come funziona

I due portafogli sono posizioni *buy & hold* a composizione fissa dal **01/05/2024**:
un solo acquisto per strumento, nessuna transazione successiva. La composizione è
sincronizzata dai portafogli omonimi su Google Finance e vive in `portafogli/*.json`.

Google Finance non espone API pubbliche e i portafogli sono privati: una GitHub Action
non può leggerli. Quello che si aggiorna da solo, ogni giorno di borsa, è tutto il resto —
prezzi di chiusura, cambi e l'intero blocco di metriche — ricostruito da dati EOD pubblici
con le stesse quantità e gli stessi prezzi di carico.

| Cosa | Come si aggiorna |
|---|---|
| Prezzi, cambi, NAV, tutte le metriche | automatico, `aggiorna-dati` alle 20:30 UTC nei giorni feriali |
| Quantità, prezzi di carico, elenco strumenti | manuale, modificando `portafogli/*.json` — solo se cambia la composizione |

## File

- `index.html` — la pagina (nessuna dipendenza esterna, SVG generati a runtime)
- `portafogli/*.json` — composizione: quantità, prezzi di carico, ticker Yahoo, ISIN
- `genera.py` — costruisce il NAV giornaliero e scrive `data/*.json`
- `analitica.py` — metriche di performance, rischio, distribuzione, benchmark, bootstrap
- `.github/workflows/aggiorna.yml` — automazione giornaliera

## Rigenerare in locale

```bash
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python genera.py data
python -m http.server 8899   # poi apri http://localhost:8899
```

## Avvertenza

Pagina di ricerca. Non è consulenza finanziaria, né offerta o sollecitazione
all'investimento. Valori lordi: nessuna commissione né fiscalità è dedotta.
Le performance passate non sono indicative di quelle future.
