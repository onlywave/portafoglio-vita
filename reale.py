"""VITA 5M · investimento reale: report giornaliero da prezzi EOD pubblici.

Legge reale/vita5m_reale.json (acquisti espressi come QUOTA del programma, mai
come importi) e scrive data/vita5m_reale.json per la pagina vita5m-reale.html.

Cosa calcola
- Linea di equity a rendimento ponderato nel tempo (TWR): gli acquisti delle
  tranche sono flussi esterni e non entrano nel rendimento. Base 100 alla
  chiusura del giorno di inception; il risultato del primo giorno (prezzo e
  cambio d'esecuzione contro chiusura) e' riportato a parte.
- Benchmark in CHF, ribasati alla stessa data: S&P 500 TR (CSPX.L) e
  MSCI World TR (IWDA.L), entrambi convertiti da USD ai cambi del giorno.
- Rischio realizzato (solo quando i giorni bastano) e rischio ex ante sui
  pesi correnti e su quelli obiettivo, stimato su 3 anni di storia in CHF:
  volatilita', VaR/CVaR, drawdown, beta, tracking error, contributi di Euler,
  correlazioni, finestre di stress.
- Costi: TER ponderato e costi di negoziazione per tranche (stima o contabile).
- Allerte sulle soglie della spec e stato di riconciliazione degli eseguiti.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
SPEC = ROOT / "reale" / "vita5m_reale.json"
TD = 252
STORIA_ANNI = 3
BENCH = {
    "S&P 500 TR (CHF)": {"yf": ["CSPX.L", "SXR8.DE"], "ccy": ["USD", "EUR"]},
    "MSCI World TR (CHF)": {"yf": ["IWDA.L", "IWDA.AS"], "ccy": ["USD", "EUR"]},
}
# proxy per lo storico di una linea nata da poco: rendimento in valuta locale
PROXY = {"WORLD": {"yf": "IWDA.L", "nota": "storico pre-quotazione: MSCI World in USD come proxy della classe CHF-hedged"}}
STRESS = [
    ("Shock dazi USA", "2025-02-19", "2025-04-08"),
    ("Correzione estate 2024", "2024-07-16", "2024-08-05"),
    ("Ultimi 3 mesi", None, None),
]


def r2(x, d=2):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), d)


def storia(cands: list[str], start: str) -> tuple[pd.Series, str]:
    for sym in cands:
        try:
            h = yf.Ticker(sym).history(start=start, auto_adjust=False)
        except Exception:  # noqa: BLE001
            continue
        if not h.empty:
            h.index = pd.DatetimeIndex(h.index).tz_localize(None).normalize()
            s = h["Close"].astype(float)
            s = s[~s.index.duplicated(keep="last")]
            if sym.endswith(".L") and s.median() > 500:  # GBp
                s = s / 100.0
            return s, sym
    raise SystemExit(f"nessun dato per {cands}")


def fx_serie(ccy: str, start: str) -> pd.Series:
    if ccy == "CHF":
        return None
    s, _ = storia([f"{ccy}CHF=X"], start)
    return s


def stats(r: pd.Series) -> dict:
    r = r.dropna()
    n = len(r)
    if n < 2:
        return {"n": n}
    nav = (1 + r).cumprod()
    dd = nav / nav.cummax() - 1
    anni = n / TD
    out = {
        "n": n,
        "rend_pct": (nav.iloc[-1] - 1) * 100,
        "cagr_pct": (nav.iloc[-1] ** (1 / anni) - 1) * 100 if anni >= 0.9 else None,
        "vol_pct": r.std(ddof=1) * math.sqrt(TD) * 100,
        "max_dd_pct": dd.min() * 100,
        "dd_corrente_pct": dd.iloc[-1] * 100,
        "var95_1d_pct": -np.percentile(r, 5) * 100 if n >= 20 else None,
        "cvar95_1d_pct": -r[r <= np.percentile(r, 5)].mean() * 100 if n >= 20 else None,
        "peggior_giorno_pct": r.min() * 100,
        "miglior_giorno_pct": r.max() * 100,
    }
    if out["cagr_pct"] is not None and out["vol_pct"]:
        out["sharpe"] = out["cagr_pct"] / out["vol_pct"]
        out["calmar"] = out["cagr_pct"] / abs(out["max_dd_pct"]) if out["max_dd_pct"] else None
        neg = r[r < 0]
        out["sortino"] = out["cagr_pct"] / (math.sqrt((neg ** 2).sum() / n) * math.sqrt(TD) * 100) if len(neg) else None
    m = nav.resample("ME").last().pct_change().dropna()
    if len(m) >= 6:
        out["peggior_mese_pct"] = m.min() * 100
        out["mesi_positivi_pct"] = (m > 0).mean() * 100
    return {k: r2(v) if k != "n" else v for k, v in out.items()}


def relativo(r: pd.Series, b: pd.Series) -> dict:
    x = pd.concat([r, b], axis=1).dropna()
    if len(x) < 20:
        return {}
    a, c = x.iloc[:, 0], x.iloc[:, 1]
    beta = a.cov(c) / c.var()
    te = (a - c).std(ddof=1) * math.sqrt(TD)
    ex = ((1 + a).prod() ** (TD / len(a)) - (1 + c).prod() ** (TD / len(c)))
    return {"beta": r2(beta), "correlazione": r2(a.corr(c)), "tracking_error_pct": r2(te * 100),
            "info_ratio": r2(ex / te) if te else None,
            "up_capture_pct": r2(a[c > 0].mean() / c[c > 0].mean() * 100),
            "down_capture_pct": r2(a[c < 0].mean() / c[c < 0].mean() * 100)}


def euler(w: np.ndarray, cov: np.ndarray) -> np.ndarray:
    sp = math.sqrt(w @ cov @ w)
    return w * (cov @ w) / sp / sp if sp else w * 0


def main(out_dir: str) -> None:
    spec = json.loads(SPEC.read_text())
    inc = pd.Timestamp(spec["inception"])
    start = (inc - pd.DateOffset(years=STORIA_ANNI) - pd.Timedelta(days=15)).strftime("%Y-%m-%d")
    lines = spec["lines"]
    tick = [l["ticker"] for l in lines]
    usdchf = fx_serie("USD", start)
    eurchf = fx_serie("EUR", start)

    def in_chf(s: pd.Series, ccy: str) -> pd.Series:
        if ccy == "CHF":
            return s
        f = {"USD": usdchf, "EUR": eurchf}[ccy]
        f = f.reindex(s.index.union(f.index)).ffill().reindex(s.index)
        return s * f

    prezzi, fonti, note = {}, {}, []
    for l in lines:
        s, sym = storia(l["yf"], start)
        fonti[l["ticker"]] = sym
        if l["ticker"] in PROXY and s.index[0] > pd.Timestamp(start) + pd.Timedelta(days=30):
            p, psym = storia([PROXY[l["ticker"]]["yf"]], start)
            rp = p.pct_change()
            prima = s.index[0]
            pre = (1 + rp[rp.index <= prima].fillna(0)).cumprod()
            pre = pre / pre.iloc[-1] * s.iloc[0]
            s = pd.concat([pre[pre.index < prima], s])
            note.append(f"{l['ticker']}: {PROXY[l['ticker']]['nota']} ({psym}) fino al {prima.date()}")
        prezzi[l["ticker"]] = in_chf(s, l["ccy"])
    P = pd.DataFrame(prezzi).sort_index().ffill()
    P = P[P.index.dayofweek < 5]

    bench = {}
    for nome, b in BENCH.items():
        s, sym = storia(b["yf"], start)
        ccy = b["ccy"][b["yf"].index(sym)]
        bench[nome] = in_chf(s, ccy)
        fonti[nome] = sym
    B = pd.DataFrame(bench).reindex(P.index.union(pd.DataFrame(bench).index)).ffill().reindex(P.index)

    # --------------------------------------------------------- posizioni (unita')
    acq = spec["acquisti"]
    unita = pd.DataFrame(0.0, index=P.index, columns=tick)
    costo = {t: 0.0 for t in tick}
    flussi = pd.Series(0.0, index=P.index)
    oggi = P.index[-1]
    for a in acq:
        d = pd.Timestamp(a["data"])
        if d > oggi:
            continue
        u = a["quota"] / (a["prezzo"] * a["fx_chf"])  # unita' per 1 di programma
        unita.loc[unita.index >= d, a["ticker"]] += u
        costo[a["ticker"]] += a["quota"]
        dd = unita.index[unita.index >= d][0]
        flussi.loc[dd] += a["quota"]
    live = P.index >= inc
    V = (unita * P).sum(axis=1)[live]
    F = flussi[live]
    if len(V) == 0:
        raise SystemExit("nessuna chiusura dopo l'inception")
    # TWR: r_t = (V_t - F_t)/V_{t-1} - 1 ; il primo giorno va contro il costo
    r = pd.Series(index=V.index, dtype=float)
    prev = None
    for d in V.index:
        if prev is None or prev == 0:
            r[d] = V[d] / F[d] - 1 if F[d] else 0.0
        else:
            r[d] = (V[d] - F[d]) / prev - 1
        prev = V[d]
    giorno_esec = r.iloc[0]
    rl = r.iloc[1:]  # close-to-close
    idx = 100 * (1 + rl).cumprod()
    idx = pd.concat([pd.Series([100.0], index=[V.index[0]]), idx])
    rb = B[live].pct_change().iloc[1:]
    bidx = 100 * B[live] / B[live].iloc[0]
    dd_live = idx / idx.cummax() - 1

    investito = sum(costo.values())
    val = (unita.iloc[-1] * P.iloc[-1])
    peso = val / val.sum()
    target = pd.Series({l["ticker"]: l["target"] for l in lines})

    # ---------------------------------------------------- rischio ex ante (3 anni)
    R = P.pct_change().dropna()
    R = R[R.index > R.index[-1] - pd.DateOffset(years=STORIA_ANNI)]
    cov = R.cov().values * TD
    corr = R.corr()

    def exante(w: pd.Series) -> dict:
        w = w.reindex(tick).fillna(0).values
        rp = pd.Series(R.values @ w, index=R.index)
        st = stats(rp)
        rel = {k: relativo(rp, B.pct_change()[k]) for k in BENCH}
        e = euler(w, cov)
        st["contributi_rischio_pct"] = {t: r2(e[i] * 100, 1) for i, t in enumerate(tick)}
        st["var95_1m_param_pct"] = r2(1.645 * st["vol_pct"] / math.sqrt(12))
        st["relativo"] = rel
        st["stress"] = []
        for nome, a, b in STRESS:
            if a is None:
                a = (R.index[-1] - pd.DateOffset(months=3)).strftime("%Y-%m-%d")
                b = R.index[-1].strftime("%Y-%m-%d")
            m = (rp.index >= a) & (rp.index <= b)
            riga = {"nome": nome, "da": a, "a": b, "portafoglio_pct": r2(((1 + rp[m]).prod() - 1) * 100)}
            for k in BENCH:
                bb = B.pct_change()[k]
                mb = (bb.index >= a) & (bb.index <= b)
                riga[k] = r2(((1 + bb[mb]).prod() - 1) * 100)
            st["stress"].append(riga)
        return st, rp

    ex_cor, rp_cor = exante(peso)
    ex_tgt, rp_tgt = exante(target)
    bstats = {k: stats(B.pct_change()[k][R.index]) for k in BENCH}
    eq3 = {"date": [d.strftime("%Y-%m-%d") for d in R.index],
           "VITA 5M (pesi obiettivo)": [r2(v, 2) for v in 100 * (1 + rp_tgt).cumprod()]}
    for k in BENCH:
        eq3[k] = [r2(v, 2) for v in 100 * (1 + B.pct_change()[k][R.index].fillna(0)).cumprod()]

    # --------------------------------------------------------------------- costi
    ter = pd.Series({l["ticker"]: l.get("ter_pct", 0) for l in lines})
    ter_cor = float((peso * ter).sum())
    ter_tgt = float((target * ter).sum())
    costi = []
    for t in spec.get("costi_tranche", []):
        tot = sum(v for k, v in t.items() if k.endswith("_pct") and v is not None)
        costi.append({**t, "totale_pct": r2(tot, 3)})

    # ------------------------------------------------------------------- allerte
    s = spec["soglie"]
    allerte = []
    vol20 = rl.tail(20).std(ddof=1) * math.sqrt(TD) * 100 if len(rl) >= 20 else None

    def al(nome, valore, soglia, scatta, unita="%"):
        allerte.append({"controllo": nome, "valore": r2(valore), "soglia": soglia, "unita": unita,
                        "stato": "n.d." if valore is None else ("ALLERTA" if scatta else "OK")})

    al("Drawdown dal picco (TWR)", dd_live.iloc[-1] * 100, s["drawdown_pct"], dd_live.iloc[-1] * 100 <= s["drawdown_pct"])
    al("Volatilità realizzata 20 giorni", vol20, s["vol20_pct"], vol20 is not None and vol20 >= s["vol20_pct"])
    sc = ((peso - target) * 100).abs()
    al("Scostamento massimo dai pesi obiettivo", sc.max(), s["scostamento_pp"], sc.max() >= s["scostamento_pp"], "pp")
    al("Oro (ZGLD) sul portafoglio", peso.get("ZGLD", 0) * 100, s["oro_max_pct"], peso.get("ZGLD", 0) * 100 > s["oro_max_pct"])
    al("Volatilità ex ante (pesi correnti)", ex_cor["vol_pct"], s.get("vol_exante_pct", 18.0),
       (ex_cor["vol_pct"] or 0) >= s.get("vol_exante_pct", 18.0))

    righe = []
    for l in lines:
        t = l["ticker"]
        righe.append({
            "ticker": t, "nome": l["name"], "isin": l["isin"], "gruppo": l["group"], "valuta": l["ccy"],
            "fonte_prezzi": fonti[t], "ter_pct": l.get("ter_pct"),
            "peso_pct": r2(peso[t] * 100), "target_pct": r2(target[t] * 100),
            "scostamento_pp": r2((peso[t] - target[t]) * 100),
            "rend_dal_carico_pct": r2((val[t] / costo[t] - 1) * 100) if costo[t] else None,
            "contributo_pp": r2((val[t] - costo[t]) / investito * 100) if investito else None,
            "rend_3a_ann_pct": r2(((1 + R[t]).prod() ** (TD / len(R)) - 1) * 100),
            "vol_3a_pct": r2(R[t].std(ddof=1) * math.sqrt(TD) * 100),
            "contrib_rischio_corr_pct": ex_cor["contributi_rischio_pct"][t],
            "contrib_rischio_tgt_pct": ex_tgt["contributi_rischio_pct"][t],
        })

    rl_stats = stats(rl) if len(rl) else {"n": 0}
    rel_live = {k: relativo(rl, rb[k]) for k in BENCH} if len(rl) >= 20 else {}
    out = {
        "portfolio": spec["portfolio"], "label": spec["label"], "base_currency": "CHF",
        "inception": spec["inception"], "asof": oggi.strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "nota_privacy": spec["nota_privacy"],
        "programma_investito_pct": r2(investito * 100),
        "tranches": spec["tranches"],
        "live": {
            "rend_twr_pct": r2((idx.iloc[-1] / 100 - 1) * 100),
            "rend_giorno_pct": r2(rl.iloc[-1] * 100) if len(rl) else None,
            "giorno_esecuzione_pct": r2(giorno_esec * 100),
            "rend_dal_costo_pct": r2((V.iloc[-1] / F.sum() - 1) * 100),
            "vol20_pct": r2(vol20), "stats": rl_stats, "relativo": rel_live,
            "bench_pct": {k: r2((bidx[k].iloc[-1] / 100 - 1) * 100) for k in BENCH},
            "serie": {"date": [d.strftime("%Y-%m-%d") for d in idx.index],
                      "VITA 5M (TWR)": [r2(v) for v in idx],
                      **{k: [r2(v) for v in bidx[k]] for k in BENCH},
                      "drawdown": [r2(v * 100) for v in dd_live]},
        },
        "exante": {"pesi_correnti": ex_cor, "pesi_obiettivo": ex_tgt, "benchmark": bstats,
                   "finestra": [R.index[0].strftime("%Y-%m-%d"), R.index[-1].strftime("%Y-%m-%d")],
                   "equity_3a": eq3,
                   "correlazioni": {"labels": tick, "matrix": [[r2(v) for v in row] for row in corr.values]}},
        "linee": righe,
        "costi": {"ter_corrente_pct": r2(ter_cor, 3), "ter_obiettivo_pct": r2(ter_tgt, 3), "tranche": costi},
        "allerte": allerte,
        "riconciliazione": spec.get("riconciliazione", []),
        "acquisti": [{k: a[k] for k in ("rif", "data", "ticker", "prezzo", "stato")} for a in acq],
        "fonti": fonti, "note": note,
        "disclaimer": "Report di monitoraggio interno. Non è consulenza finanziaria. Valori lordi da prezzi EOD pubblici, "
                      "senza commissioni né fiscalità salvo dove indicato. Le performance passate non sono indicative di quelle future.",
    }
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "vita5m_reale.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("scritto vita5m_reale.json | asof", out["asof"], "| TWR", out["live"]["rend_twr_pct"],
          "| investito", out["programma_investito_pct"], "% del programma")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data"))
