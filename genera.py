"""Genera i dati della vetrina PORTAFOGLIO VITA a partire dalle spec in portafogli/.

Modello: buy & hold a quote fisse dall'inception (un solo acquisto per strumento,
nessuna transazione successiva — riscontro dal registro transazioni di Google
Finance). Il NAV giornaliero e' ricostruito dai prezzi EOD di chiusura nella
valuta di quotazione, convertiti in valuta base ai cambi dello stesso giorno; i
dividendi (nulli su ETF ad accumulazione) sono accreditati a cassa.

Convenzioni metriche: rendimenti giornalieri semplici, 252 giorni/anno, VaR
espresso POSITIVO (perdita), drawdown negativo.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from analitica import analitica, serie_rolling

ROOT = Path(__file__).resolve().parent
SPEC_DIR = ROOT / "portafogli"
TRADING_DAYS = 252
Z95 = 1.6449
PRE_DAYS = 12  # margine dati prima dell'inception per ffill di prezzi e FX

DISCLAIMER = (
    "Pagina di ricerca a cura di Emanuele Ferreri. Non e' consulenza finanziaria, "
    "ne' offerta o sollecitazione all'investimento. I due portafogli sono "
    "posizioni buy & hold a composizione fissa dal 01/05/2024, sincronizzate dai "
    "portafogli Google Finance omonimi; prezzi di chiusura da fonte pubblica "
    "(Yahoo Finance), valori lordi, nessuna commissione ne' fiscalita' dedotta. "
    "Le performance passate non sono indicative di quelle future."
)

MONTH_KEYS = [f"m{i:02d}" for i in range(1, 13)]

# Benchmark di confronto, ricostruiti nella valuta base del portafoglio.
# "mix" combina piu' simboli a pesi fissi ribilanciati giornalmente.
BENCHMARK = {
    "MSCI World (CHF)": {"mix": {"IWDA.L": 1.0}, "ccy": {"IWDA.L": "USD"}},
    "SMI (CHF)": {"mix": {"^SSMI": 1.0}, "ccy": {"^SSMI": "CHF"}},
    "60/40 globale (CHF)": {"mix": {"IWDA.L": 0.6, "AGGS.SW": 0.4},
                            "ccy": {"IWDA.L": "USD", "AGGS.SW": "CHF"}},
    "Oro CHF": {"mix": {"ZGLD.SW": 1.0}, "ccy": {"ZGLD.SW": "CHF"}},
}


# ---------------------------------------------------------------- dati mercato
def scarica(symbols: list[str], start: str, end: str | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Chiusure e dividendi wide [data x simbolo], prezzi ffill, GBp->GBP."""
    closes, divs = {}, {}
    for sym in symbols:
        h = yf.Ticker(sym).history(start=start, end=end, auto_adjust=False)
        if h.empty:
            raise SystemExit(f"nessun dato per {sym}")
        h.index = pd.DatetimeIndex(h.index).tz_localize(None).normalize()
        h = h[~h.index.duplicated(keep="last")]
        closes[sym] = h["Close"].astype(float)
        divs[sym] = h.get("Dividends", pd.Series(0.0, index=h.index)).astype(float)
    c = pd.DataFrame(closes).sort_index()
    d = pd.DataFrame(divs).reindex(c.index).fillna(0.0)
    return c.ffill(), d


def cambi(valute: set[str], base: str, start: str, end: str | None) -> pd.DataFrame:
    """Serie ccy->base per ogni valuta diversa dalla base."""
    out = {}
    for ccy in sorted(valute - {base}):
        h = yf.Ticker(f"{ccy}{base}=X").history(start=start, end=end, auto_adjust=False)
        if h.empty:
            h = yf.Ticker(f"{base}{ccy}=X").history(start=start, end=end, auto_adjust=False)
            if h.empty:
                raise SystemExit(f"nessun dato FX per {ccy}{base}")
            h["Close"] = 1.0 / h["Close"].astype(float)
        h.index = pd.DatetimeIndex(h.index).tz_localize(None).normalize()
        out[ccy] = h["Close"].astype(float)[~h.index.duplicated(keep="last")]
    if not out:
        return pd.DataFrame(index=pd.DatetimeIndex([]))
    return pd.DataFrame(out).sort_index().ffill()


# ------------------------------------------------------------------- metriche
def max_drawdown(nav: pd.Series) -> float:
    return float((nav / nav.cummax() - 1.0).min())


def cagr(nav: pd.Series) -> float:
    anni = max((nav.index[-1] - nav.index[0]).days / 365.25, 1e-9)
    return float((nav.iloc[-1] / nav.iloc[0]) ** (1 / anni) - 1.0)


def sortino(r: pd.Series) -> float:
    giu = r[r < 0]
    ds = float(np.sqrt((giu ** 2).mean())) if len(giu) else 0.0
    return float(r.mean() / ds * np.sqrt(TRADING_DAYS)) if ds > 0 else 0.0


def cvar_hist(r: pd.Series, level: float = 0.95) -> float:
    var = -np.quantile(r.values, 1.0 - level)
    coda = r[r <= -var]
    return float(-coda.mean()) if len(coda) else float(var)


def rolling12(monthly: pd.Series) -> pd.Series:
    """Rendimento composto a 12 mesi, passo mensile."""
    if len(monthly) < 12:
        return pd.Series(dtype=float)
    return (1 + monthly).rolling(12).apply(np.prod, raw=True).dropna() - 1


def statistiche(nav: pd.Series) -> dict:
    r = nav.pct_change().dropna()
    monthly = nav.resample("ME").last().pct_change().dropna()
    vol = float(r.std(ddof=1) * np.sqrt(TRADING_DAYS))
    sd = r.std(ddof=1)
    out = {
        "perf_total_pct": round(float(nav.iloc[-1] / nav.iloc[0] - 1) * 100, 2),
        "cagr_pct": round(cagr(nav) * 100, 2),
        "vol_ann_pct": round(vol * 100, 2),
        "sharpe": round(float(r.mean() / sd * np.sqrt(TRADING_DAYS)) if sd > 0 else 0.0, 2),
        "sortino": round(sortino(r), 2),
        "calmar": round(cagr(nav) / abs(max_drawdown(nav)) if max_drawdown(nav) < 0 else 0.0, 2),
        "max_dd_pct": round(max_drawdown(nav) * 100, 2),
        "var95_1d_hist_pct": round(-float(np.quantile(r.values, 0.05)) * 100, 2),
        "var95_1w_pct": round(Z95 * vol * np.sqrt(5 / TRADING_DAYS) * 100, 2),
        "best_day_pct": round(float(r.max()) * 100, 2),
        "worst_day_pct": round(float(r.min()) * 100, 2),
        "days_positive_pct": round(float((r > 0).mean()) * 100, 0),
        "months_n": int(len(monthly)),
        "months_positive_pct": round(float((monthly > 0).mean()) * 100, 0) if len(monthly) else None,
        "best_month_pct": round(float(monthly.max()) * 100, 2) if len(monthly) else None,
        "worst_month_pct": round(float(monthly.min()) * 100, 2) if len(monthly) else None,
        "var95_1m_hist_pct": round(-float(np.quantile(monthly, 0.05)) * 100, 2) if len(monthly) >= 12 else None,
        "cvar95_1m_hist_pct": round(cvar_hist(monthly) * 100, 2) if len(monthly) >= 12 else None,
        "skew_monthly": round(float(monthly.skew()), 2) if len(monthly) >= 12 else None,
        "kurtosis_monthly": round(float(monthly.kurt()), 2) if len(monthly) >= 12 else None,
        "rolling12_median_pct": None, "rolling12_min_pct": None,
        "rolling12_max_pct": None, "rolling12_positive_pct": None, "rolling12_n": 0,
    }
    r12 = rolling12(monthly)
    if len(r12):
        out.update({
            "rolling12_median_pct": round(float(r12.median()) * 100, 1),
            "rolling12_min_pct": round(float(r12.min()) * 100, 1),
            "rolling12_max_pct": round(float(r12.max()) * 100, 1),
            "rolling12_positive_pct": round(float((r12 > 0).mean()) * 100, 0),
            "rolling12_n": int(len(r12)),
        })
    return out


def matrice_mensile(nav: pd.Series) -> dict:
    """{anno: {m01..m12, tot}} con il primo anno parziale composto dai mensili."""
    monthly = nav.resample("ME").last().pct_change().dropna()
    out: dict[str, dict] = {}
    for ts, v in monthly.items():
        out.setdefault(str(ts.year), {})[MONTH_KEYS[ts.month - 1]] = round(float(v) * 100, 2)
    for anno, riga in out.items():
        comp = 1.0
        for k in MONTH_KEYS:
            if k in riga:
                comp *= 1 + riga[k] / 100
        riga["tot"] = round((comp - 1) * 100, 2)
    return out


def rendimenti_annuali(nav: pd.Series) -> list[dict]:
    """Rendimento per anno solare; il primo e l'ultimo sono parziali (etichettati)."""
    fine = nav.resample("YE").last()
    out = []
    for i, (ts, v) in enumerate(fine.items()):
        prec = float(fine.iloc[i - 1]) if i > 0 else float(nav.iloc[0])
        out.append({
            "anno": str(ts.year),
            "ret_pct": round((float(v) / prec - 1) * 100, 2),
            "parziale": (i == 0 and nav.index[0].month > 1) or ts.year == nav.index[-1].year,
            "da": str(nav.index[0].date()) if i == 0 else f"{ts.year}-01-01",
            "a": str(nav.index[-1].date()) if ts.year == nav.index[-1].year else f"{ts.year}-12-31",
        })
    return out


# ------------------------------------------------------------------ benchmark
def costruisci_benchmark(base: str, idx: pd.DatetimeIndex, start: str,
                         end: str | None, fx_get) -> dict[str, pd.Series]:
    """NAV base-100 di ogni benchmark nella valuta base, allineato a `idx`."""
    simboli = sorted({s for b in BENCHMARK.values() for s in b["mix"]})
    try:
        px, _ = scarica(simboli, start, end)
    except SystemExit as e:
        print("  ! benchmark non disponibili:", e)
        return {}
    out = {}
    for nome, cfg in BENCHMARK.items():
        try:
            comp = []
            for sym, peso in cfg["mix"].items():
                ccy = cfg["ccy"][sym]
                # quotazioni in pence -> sterline
                serie = px[sym] / 100.0 if ccy in ("GBp", "GBX") else px[sym]
                c = "GBP" if ccy in ("GBp", "GBX") else ccy
                v = (serie * fx_get(c, px.index)).reindex(idx).ffill().bfill()
                comp.append(peso * v / float(v.iloc[0]))
            nav = pd.concat(comp, axis=1).sum(axis=1)
            out[nome] = (nav / float(nav.iloc[0]) * 100).dropna()
        except Exception as e:  # un benchmark rotto non deve fermare la pagina
            print(f"  ! benchmark '{nome}' saltato: {type(e).__name__}: {e}")
    return out


# -------------------------------------------------------------------- payload
def costruisci(spec: dict, end: str | None = None) -> dict:
    base = spec["base_currency"]
    holds = spec["holdings"]
    inception = pd.Timestamp(spec["inception"])
    start = (inception - pd.Timedelta(days=PRE_DAYS)).date().isoformat()

    yfs = [h["yf"] for h in holds]
    closes, divs = scarica(yfs, start, end)
    valute = ({h["ccy"] for h in holds} | {h["cost_ccy"] for h in holds} | {base}
              | {c for b in BENCHMARK.values() for c in b["ccy"].values()})
    valute = {"GBP" if v in ("GBp", "GBX") else v for v in valute}
    fx = cambi(valute, base, start, end)

    def tasso(ccy: str, idx: pd.Index) -> pd.Series:
        if ccy == base:
            return pd.Series(1.0, index=idx)
        return fx[ccy].reindex(idx).ffill().bfill()

    live = closes.loc[closes.index >= inception]
    if live.empty:
        raise SystemExit(f"{spec['portfolio']}: nessuna quotazione dopo l'inception")
    idx = live.index

    # valore di mercato per strumento in valuta base + cassa dividendi
    valori, cassa = {}, pd.Series(0.0, index=idx)
    for h in holds:
        r = tasso(h["ccy"], idx)
        valori[h["symbol"]] = live[h["yf"]] * r * h["shares"]
        cassa = cassa.add((divs[h["yf"]].reindex(idx).fillna(0.0) * r * h["shares"]).cumsum(),
                          fill_value=0.0)
    val_df = pd.DataFrame(valori)
    nav = val_df.sum(axis=1) + cassa

    # NAV iniziale = capitale effettivamente investito (prezzi di carico Google),
    # convertito in valuta base al cambio del giorno di acquisto
    g0 = idx[0]
    capitale = sum(h["cost_amount"] * float(tasso(h["cost_ccy"], idx).asof(g0)) for h in holds)
    nav = pd.concat([pd.Series([capitale], index=[g0 - pd.Timedelta(days=1)]), nav])

    s = statistiche(nav)
    ultimo = idx[-1]
    nav_last = float(nav.iloc[-1])

    posizioni = []
    for h in holds:
        r1 = float(tasso(h["ccy"], idx).asof(ultimo))
        rc = float(tasso(h["cost_ccy"], idx).asof(g0))
        px = float(live[h["yf"]].asof(ultimo))
        val = float(val_df[h["symbol"]].asof(ultimo))
        costo_base = h["cost_amount"] * rc
        # prezzo riportato nella valuta in cui Google espone lo strumento
        rq = 1.0 if h["quote_ccy_google"] == h["ccy"] else (
            r1 / float(tasso(h["quote_ccy_google"], idx).asof(ultimo)))
        px_quote = px * rq
        serie_h = (live[h["yf"]] * tasso(h["ccy"], idx)).pct_change().dropna()
        posizioni.append({
            "name": h["name"], "id": h["isin"], "ticker": h["symbol"],
            "group": h["group"], "kind": h["kind"], "ccy": h["quote_ccy_google"],
            "shares": h["shares"], "cost_px": h["cost_px"],
            "last_px": round(px_quote, 4),
            "pl_pct": round((px_quote / h["cost_px"] - 1) * 100, 2),
            "pl_base_pct": round((val / costo_base - 1) * 100, 2),
            "value_base": round(val, 0), "cost_base": round(costo_base, 0),
            "contrib_pp": round((val - costo_base) / capitale * 100, 2),
            "weight_now_pct": round(val / nav_last * 100, 2),
            "weight_cost_pct": round(costo_base / capitale * 100, 2),
            "vol_ann_pct": round(float(serie_h.std(ddof=1)) * (252 ** 0.5) * 100, 2),
            "max_dd_pct": round(float((val_df[h["symbol"]] / val_df[h["symbol"]].cummax() - 1).min()) * 100, 2),
        })

    bench = costruisci_benchmark(base, nav.index, start, end,
                                 lambda c, i: tasso(c, i))
    an = analitica(nav, val_df, bench, rf=0.0, n_prove_dsr=6)
    roll = serie_rolling(nav, bench, rf=0.0)

    # --- serie giornaliera normalizzata (base 100): alimenta le pagine ribasate,
    # dove il periodo di analisi lo sceglie chi legge e nessun importo e' esposto.
    fatt = 100.0 / capitale
    comp_g = val_df.reindex(nav.index)
    for h in holds:  # il primo punto e' il costo effettivo, non un prezzo di mercato
        comp_g.loc[nav.index[0], h["symbol"]] = h["cost_amount"] * float(tasso(h["cost_ccy"], idx).asof(g0))
    serie = {
        "portfolio": spec["portfolio"], "label": spec["label"], "base_currency": base,
        "inception": spec["inception"], "asof": str(ultimo.date()),
        "date": [str(k.date()) for k in nav.index],
        "nav": [round(float(v) * fatt, 6) for v in nav.values],
        "cassa": [round(float(v) * fatt, 6) for v in cassa.reindex(nav.index).fillna(0.0).values],
        "componenti": {h["symbol"]: [round(float(v) * fatt, 6) for v in comp_g[h["symbol"]].values]
                       for h in holds},
        "etichette": {h["symbol"]: {"nome": h["name"], "gruppo": h["group"],
                                    "isin": h["isin"], "ccy": h["quote_ccy_google"]} for h in holds},
        "benchmark": {n: [round(float(v), 6) for v in b.reindex(nav.index).ffill().bfill().values]
                      for n, b in bench.items()},
        "disclaimer": DISCLAIMER,
        "methodology": spec["methodology"],
    }

    dd = nav / nav.cummax() - 1.0
    mensili = nav.resample("ME").last().pct_change().dropna()
    comp_ret = val_df.pct_change().dropna()
    corr = None
    if len(comp_ret) >= 40 and comp_ret.shape[1] >= 2:
        m = comp_ret.corr().round(2)
        corr = {"labels": [x for x in m.columns],
                "matrix": [[float(x) for x in row] for row in m.values]}

    # correlazione delle componenti con i benchmark
    corr_bench = None
    if bench:
        righe = {}
        for nome, b in bench.items():
            br = b.pct_change()
            righe[nome] = [round(float(comp_ret[c].corr(br.reindex(comp_ret.index))), 2)
                           for c in comp_ret.columns]
        corr_bench = {"labels": list(comp_ret.columns), "righe": righe}

    payload = {
        "portfolio": spec["portfolio"], "label": spec["label"],
        "google_portfolio_id": spec["google_portfolio_id"],
        "base_currency": base, "inception": spec["inception"],
        "sync_date": spec["sync_date"], "asof": str(ultimo.date()),
        "methodology": spec["methodology"],
        "capitale_iniziale": round(capitale, 0),
        "metrics": {**s, "nav_last": round(nav_last, 0)},
        "analitica": an,
        "rolling": roll,
        "nav_weekly": [[str(k.date()), round(float(v), 0)]
                       for k, v in nav.resample("W-FRI").last().dropna().items()],
        "index_weekly": [[str(k.date()), round(float(v) / capitale * 100, 2)]
                         for k, v in nav.resample("W-FRI").last().dropna().items()],
        "bench_index_weekly": {n: [[str(k.date()), round(float(v), 2)]
                                   for k, v in b.resample("W-FRI").last().dropna().items()]
                               for n, b in bench.items()},
        "monthly_pct": {str(k.date())[:7]: round(float(v) * 100, 2) for k, v in mensili.items()},
        "monthly_matrix": matrice_mensile(nav),
        "annual": rendimenti_annuali(nav),
        "rolling12": [[str(k.date())[:7], round(float(v) * 100, 2)]
                      for k, v in rolling12(mensili).items()],
        "drawdown_weekly": [[str(k.date()), round(float(v) * 100, 2)]
                            for k, v in dd.resample("W-FRI").last().dropna().items()],
        "max_dd_date": str(dd.idxmin().date()),
        "correlations": corr,
        "correlations_bench": corr_bench,
        "holdings": posizioni,
        "disclaimer": DISCLAIMER,
    }
    return payload, serie


def main(out_dir: str, end: str | None = None) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    registry = []
    for spec_path in sorted(SPEC_DIR.glob("*.json")):
        spec = json.loads(spec_path.read_text())
        d, serie = costruisci(spec, end=end)
        (out / f"{d['portfolio']}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))
        (out / f"serie_{d['portfolio']}.json").write_text(
            json.dumps(serie, ensure_ascii=False, separators=(",", ":")))
        print("scritto:", out / f"{d['portfolio']}.json", "| asof", d["asof"],
              "| perf", d["metrics"]["perf_total_pct"], "%",
              "| serie", len(serie["date"]), "giorni")
        registry.append({k: d[k] for k in (
            "portfolio", "label", "base_currency", "inception", "asof",
            "capitale_iniziale", "metrics", "google_portfolio_id")})
    (out / "registry.json").write_text(json.dumps({
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "portfolios": registry, "disclaimer": DISCLAIMER,
    }, ensure_ascii=False, indent=1))
    print("scritto:", out / "registry.json")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data"),
         sys.argv[2] if len(sys.argv) > 2 else None)
