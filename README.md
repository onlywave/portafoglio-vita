# PORTAFOGLIO VITA

Cruscotto quantitativo di tre portafogli reali: **VITA 5M**, **VITA 5M-C40** ed **EMANUELE ETF**.

**Pagine**

| | |
|---|---|
| Cruscotto completo e confronto a tre | https://onlywave.github.io/portafoglio-vita/ |
| VITA 5M — indice base 100, periodo a scelta | https://onlywave.github.io/portafoglio-vita/vita5m.html |
| VITA 5M-C40 — indice base 100, periodo a scelta | https://onlywave.github.io/portafoglio-vita/vita5m-c40.html |
| EMANUELE ETF — indice base 100, periodo a scelta | https://onlywave.github.io/portafoglio-vita/emanuele-etf.html |

Le tre pagine in base 100 non espongono quantità, prezzi di carico né importi: lavorano solo
in grandezze relative. Il periodo di analisi lo sceglie chi legge (preset o due date) e l'intero
blocco statistico — drawdown, correlazioni, decomposizione del rischio, bootstrap — viene
**ricalcolato nel browser** su quella finestra, non ritagliato da un calcolo fatto sull'intera
storia. Lo stato finisce nell'indirizzo (`#da=2025-04-09&a=2026-08-18`), quindi una vista è
condivisibile con un link.

## Come funziona

I tre portafogli seguono due modelli diversi, dichiarati nella spec e scritti in chiaro
sulle pagine. Ogni composizione vive in `portafogli/*.json`.

| Portafoglio | Modello | Base | Inception | Fonte della composizione |
|---|---|---|---|---|
| VITA 5M | buy & hold, quote fisse | CHF | 01/05/2024 | portafoglio Google Finance omonimo |
| VITA 5M-C40 | buy & hold, quote fisse | CHF | 01/05/2024 | portafoglio Google Finance omonimo |
| EMANUELE ETF | proporzioni costanti, ribilanciamento trimestrale | EUR | 26/06/2023 | registro movimenti Quantistik (portafoglio 175788332) |

- **Buy & hold**: un solo acquisto per strumento, nessuna transazione successiva. La spec
  porta quantità e prezzi di carico.
- **Proporzioni costanti**: pesi obiettivo 30% emergenti value, 22,5% mondo sviluppato,
  22,5% momentum, 20% oro, 5% mondo intero, riportati agli obiettivi il 26 di marzo,
  giugno, settembre e dicembre. La spec porta il **registro degli 85 eseguiti**, da cui si
  ricostruiscono le quote giorno per giorno; i ribilanciamenti sono autofinanziati e dopo
  l'apporto iniziale di 1.000.000 EUR non ci sono stati né versamenti né prelievi.

Né Google Finance né Quantistik espongono API pubbliche leggibili da una GitHub Action
(i portafogli sono privati e dietro sessione). Quello che si aggiorna da solo, ogni giorno
di borsa, è tutto il resto — prezzi di chiusura, cambi e l'intero blocco di metriche —
ricostruito da dati EOD pubblici a quantità invariate.

| Cosa | Come si aggiorna |
|---|---|
| Prezzi, cambi, NAV, serie giornaliere, tutte le metriche, confronto a tre | automatico, `aggiorna-dati` alle 20:30 UTC nei giorni feriali |
| Quantità, prezzi di carico, elenco strumenti | manuale, modificando `portafogli/*.json` — solo se cambia la composizione |
| Nuovo ribilanciamento di EMANUELE ETF | manuale: riesportare `/downloads/export-movements/175788332` e appendere gli eseguiti nuovi a `movements` |

## Il confronto a tre

Le tre inception non coincidono e una valuta base è diversa, quindi la scheda *Confronto*
non mette in fila tre numeri come se fossero omogenei:

- le serie ripartono da 100 alla data da cui esistono **tutte** (03/05/2024) e i drawdown
  sono ricalcolati su quella finestra, non ritagliati da quelli di inception;
- tutto è misurato in **CHF**: EMANUELE ETF porta nei dati anche la propria serie
  convertita (`index_weekly_cmp`), così il confronto non somma di nascosto rendimento e cambio;
- la prima tabella contiene le sole cifre paragonabili fra loro (finestra comune, stessa
  valuta); la seconda, quelle da inception nella valuta di ciascuno, con l'avvertenza che
  riga per riga non sono confrontabili;
- correlazioni settimanali fra i portafogli in chiaro: nella finestra comune non scendono
  sotto 0,88, quindi le differenze di performance vanno lette come rumore, non come classifica.

## Riscontri

Ricostruzione di EMANUELE ETF contro la piattaforma, al 29/10/2026:

| Controllo | Esito |
|---|---|
| Quote per ISIN dal registro contro quelle esposte da Quantistik | **PASS**, differenze sotto 1e-12 pezzi |
| Cassa residua implicata dal registro | 0,00 EUR: i ribilanciamenti si autofinanziano |
| Pesi post-ribilanciamento al 26/09/2026 ai prezzi del registro | 30,00 / 22,50 / 22,50 / 20,00 / 5,00% — coincidono con gli obiettivi |
| NAV | ricostruito 2.073.861 EUR (+107,4%) contro +105,2% esposto dalla piattaforma |

Lo scarto sul NAV è dichiarato e atteso: la piattaforma usa i propri prezzi e la propria
data di valorizzazione (che può essere il giorno prima), qui si usano le chiusure pubbliche
delle linee effettivamente detenute — ZGLD.SW, EMVL.L, IWMO.SW, IWDA.AS, FWRA.MI — convertite
in EUR ai cambi del giorno. Vale circa un giorno di movimento del portafoglio. Le **quote**,
che sono il dato strutturale, quadrano in modo esatto.

## File

- `index.html` — cruscotto completo in valuta base, con la scheda di confronto a tre
- `vita5m.html`, `vita5m-c40.html`, `emanuele-etf.html` — pagine in base 100 con periodo selezionabile
- `assets/stile.css`, `assets/grafici.js` — stile e primitive SVG condivise
- `assets/quant.js` — motore statistico lato browser, verificato contro quello Python su 159
  metriche (differenze residue sotto l'unità di arrotondamento)
- `assets/ribasata.js` — costruzione delle pagine in base 100
- `portafogli/*.json` — composizione: quantità e prezzi di carico per il buy & hold,
  registro degli eseguiti (`movements`) per il modello a proporzioni costanti, più ticker
  Yahoo, ISIN, sede di quotazione e impronta dell'export di origine
- `genera.py` — costruisce il NAV giornaliero e scrive `data/*.json`. Su un portafoglio
  ribilanciato le quote di ogni giorno sono la somma cumulata dei movimenti, la cassa segue
  gli eseguiti, e i rendimenti di componente si misurano sui **prezzi** e non sui valori:
  un eseguito sposta il valore di una posizione senza che il prezzo si muova, e falserebbe
  covarianze, correlazioni e decomposizione di Euler
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
