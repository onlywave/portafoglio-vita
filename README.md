# PORTAFOGLIO VITA

Cruscotto quantitativo dei due portafogli **VITA 5M** e **VITA 5M-C40**.

**Pagine**

| | |
|---|---|
| Cruscotto completo, valori in CHF | https://onlywave.github.io/portafoglio-vita/ |
| VITA 5M — indice base 100, periodo a scelta | https://onlywave.github.io/portafoglio-vita/vita5m.html |
| VITA 5M-C40 — indice base 100, periodo a scelta | https://onlywave.github.io/portafoglio-vita/vita5m-c40.html |

Le due pagine in base 100 non espongono quantità, prezzi di carico né importi: lavorano solo
in grandezze relative. Il periodo di analisi lo sceglie chi legge (preset o due date) e l'intero
blocco statistico — drawdown, correlazioni, decomposizione del rischio, bootstrap — viene
**ricalcolato nel browser** su quella finestra, non ritagliato da un calcolo fatto sull'intera
storia. Lo stato finisce nell'indirizzo (`#da=2025-04-09&a=2026-08-18`), quindi una vista è
condivisibile con un link.

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
| Prezzi, cambi, NAV, serie giornaliere, tutte le metriche | automatico, `aggiorna-dati` alle 20:30 UTC nei giorni feriali |
| Quantità, prezzi di carico, elenco strumenti | manuale, modificando `portafogli/*.json` — solo se cambia la composizione |

## File

- `index.html` — cruscotto completo in valuta base
- `vita5m.html`, `vita5m-c40.html` — pagine in base 100 con periodo selezionabile
- `assets/stile.css`, `assets/grafici.js` — stile e primitive SVG condivise
- `assets/quant.js` — motore statistico lato browser, verificato contro quello Python su 159
  metriche (differenze residue sotto l'unità di arrotondamento)
- `assets/ribasata.js` — costruzione delle pagine in base 100
- `portafogli/*.json` — composizione: quantità, prezzi di carico, ticker Yahoo, ISIN
- `genera.py` — costruisce il NAV giornaliero e scrive `data/*.json`
- `analitica.py` — metriche di performance, rischio, distribuzione, benchmark, bootstrap
- `versiona.py` — appende al nome degli asset l'impronta del contenuto, così un rilascio
  non può far combinare al browser HTML nuovo e JavaScript vecchio (Pages li serve con
  `cache-control: max-age=600`)
- `.github/workflows/aggiorna.yml` — automazione giornaliera

## Rigenerare in locale

```bash
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python genera.py data
python3 versiona.py
python -m http.server 8899   # poi apri http://localhost:8899
```

## Avvertenza

Pagina di ricerca. Non è consulenza finanziaria, né offerta o sollecitazione
all'investimento. Valori lordi: nessuna commissione né fiscalità è dedotta.
Le performance passate non sono indicative di quelle future.
