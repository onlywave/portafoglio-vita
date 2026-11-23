"""VITA 5M reale: quotazione intraday (prezzi Yahoo ritardati, barre da 5 minuti).

Scrive un solo file JSON, pubblicato sul ramo `intraday` (non su main, per non
riempire la storia di commit), che la pagina vita5m-reale.html legge da
raw.githubusercontent.com ogni pochi minuti.

Variazione del giorno = somma dei pesi alla chiusura precedente per la
variazione in CHF di ogni linea (prezzo e cambio). Il rendimento dall'inizio
stimato estende l'ultimo indice TWR di chiusura con la variazione intraday.
Stima: non tiene conto di acquisti eseguiti nella giornata.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
SPEC = ROOT / "reale" / "vita5m_reale.json"
DAILY = ROOT / "data" / "vita5m_reale.json"
BENCH = {"S&P 500 TR (CHF)": ("CSPX.L", "USD"), "MSCI World TR (CHF)": ("IWDA.L", "USD")}
TZ = "Europe/Zurich"


def barre(sym: str) -> tuple[pd.Series, float, str]:
    """Barre 5m degli ultimi giorni (ora di Zurigo), chiusura del giorno prima di oggi."""
    t = yf.Ticker(sym)
    h = t.history(period="5d", interval="5m", auto_adjust=False)
    d = t.history(period="10d", interval="1d", auto_adjust=False)
    if h.empty or d.empty:
        raise ValueError(f"nessun dato intraday per {sym}")
    h.index = pd.DatetimeIndex(h.index).tz_convert(TZ)
    s = h["Close"].astype(float).dropna()
    giorno = s.index[-1].date()
    d.index = pd.DatetimeIndex(d.index).tz_localize(None).normalize()
    dc = d["Close"].astype(float).dropna()
    prev = dc[dc.index.date < giorno]
    if prev.empty:
        raise ValueError(f"nessuna chiusura precedente per {sym}")
    oggi = s[s.index.date == giorno]
    div = 100.0 if (sym.endswith(".L") and dc.median() > 500) else 1.0
    return oggi / div, float(prev.iloc[-1]) / div, str(giorno)


def prova(cands: list[str]):
    err = None
    for c in cands:
        try:
            return (*barre(c), c)
        except Exception as e:  # noqa: BLE001
            err = e
    raise SystemExit(f"{cands}: {err}")


def main(out: str) -> None:
    spec = json.loads(SPEC.read_text())
    fx_s, fx_prev, fx_g, _ = prova(["USDCHF=X", "CHF=X"])
    fx_last = float(fx_s.iloc[-1])

    def chf(serie: pd.Series, prev: float, ccy: str):
        if ccy == "CHF":
            return serie, prev
        f = fx_s.reindex(serie.index.union(fx_s.index)).ffill().reindex(serie.index).fillna(fx_last)
        return serie * f, prev * fx_prev

    unita = {}
    for a in spec["acquisti"]:
        unita[a["ticker"]] = unita.get(a["ticker"], 0.0) + a["quota"] / (a["prezzo"] * a["fx_chf"])

    righe, curve, val_prev = [], {}, {}
    for l in spec["lines"]:
        s, prev, g, sym = prova(l["yf"])
        sc, pc = chf(s, prev, l["ccy"])
        u = unita.get(l["ticker"], 0.0)
        val_prev[l["ticker"]] = u * pc
        curve[l["ticker"]] = sc / pc - 1
        righe.append({
            "ticker": l["ticker"], "fonte": sym, "valuta": l["ccy"], "giorno": g,
            "ultimo": round(float(s.iloc[-1]), 4), "ora": s.index[-1].strftime("%H:%M"),
            "chiusura_prec": round(prev, 4),
            "var_locale_pct": round((float(s.iloc[-1]) / prev - 1) * 100, 2),
            "var_chf_pct": round(float(curve[l["ticker"]].iloc[-1]) * 100, 2),
        })
    tot = sum(val_prev.values())
    pesi = {k: (v / tot if tot else 0.0) for k, v in val_prev.items()}

    # percorso intraday del portafoglio su una griglia comune di 5 minuti
    griglia = sorted(set().union(*[c.index for c in curve.values()]))
    df = pd.DataFrame({k: c.reindex(griglia).ffill() for k, c in curve.items()}).fillna(0.0)
    port = sum(df[k] * w for k, w in pesi.items())
    bench, bcurve = {}, {}
    for nome, (sym, ccy) in BENCH.items():
        try:
            s, prev, g, _ = prova([sym])
            sc, pc = chf(s, prev, ccy)
            c = sc / pc - 1
            bcurve[nome] = c.reindex(griglia).ffill()
            bench[nome] = {"var_chf_pct": round(float(c.iloc[-1]) * 100, 2), "ora": s.index[-1].strftime("%H:%M")}
        except SystemExit:
            bench[nome] = None
    for r in righe:
        r["peso_pct"] = round(pesi[r["ticker"]] * 100, 2)
        r["contributo_pp"] = round(pesi[r["ticker"]] * r["var_chf_pct"], 2)

    var_oggi = float(port.iloc[-1])
    giorno = max(r["giorno"] for r in righe)
    twr = None
    if DAILY.exists():
        d = json.loads(DAILY.read_text())
        serie = d["live"]["serie"]
        idx, date = serie["VITA 5M (TWR)"], serie["date"]
        if date and date[-1] < giorno:
            twr = round(((idx[-1] / 100) * (1 + var_oggi) - 1) * 100, 2)
        elif date:
            twr = d["live"]["rend_twr_pct"]
    res = {
        "giorno": giorno,
        "aggiornato": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "ultimo_prezzo": max(r["ora"] for r in righe),
        "var_oggi_pct": round(var_oggi * 100, 2),
        "twr_stimato_pct": twr,
        "usdchf": {"ultimo": round(fx_last, 5), "chiusura_prec": round(fx_prev, 5),
                   "var_pct": round((fx_last / fx_prev - 1) * 100, 2)},
        "benchmark": bench,
        "linee": righe,
        "percorso": {"ora": [t.strftime("%H:%M") for t in griglia],
                     "VITA 5M": [round(v * 100, 3) for v in port],
                     **{k: [None if pd.isna(v) else round(v * 100, 3) for v in c] for k, c in bcurve.items()}},
        "nota": "Prezzi Yahoo Finance ritardati (circa 15-20 minuti), barre da 5 minuti. Variazione rispetto alla chiusura precedente, "
                "in CHF, ai pesi della chiusura precedente. Stima: la valorizzazione ufficiale resta quella di chiusura.",
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")))
    print("intraday", giorno, res["ultimo_prezzo"], "var", res["var_oggi_pct"], "% | TWR stimato", twr)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "intraday.json"))
