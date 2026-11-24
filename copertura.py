"""VITA 5M · studio di copertura: regola della media esponenziale a 10 mesi.

Scrive data/vita5m_copertura.json per la pagina vita5m-copertura.html e per il
pannello del segnale in vita5m-reale.html.

Regola (studio Claude del 24.11.2026, doc "VITA 5M dal 2020")
- Grandezza osservata: azionario VITA 5M = WORLD, IWMO, EIMI, FWRA, EMVL ai pesi
  obiettivo 25/25/20/5/5 (ZGLD escluso), in CHF, ribilanciato a fine mese.
- Controllo solo sulla chiusura dell'ultima seduta del mese, contro la media
  esponenziale a 10 mesi delle chiusure di fine mese (peso 2/11 all'ultimo mese).
- Vendita: chiusura < media x (1 - 1%) -> alla prima seduta del mese successivo si
  vende il 75% dell'azionario, liquidità in CHF; ZGLD non si tocca.
- Rientro: chiusura > media x (1 + 1%) -> alla prima seduta del mese successivo si
  ricompra tutto ai pesi obiettivo.
- Costi per compravendita: bollo 0,15% + negoziazione 0,10% + cambio 0,25% sulla
  parte in USD (circa 0,42%).

Le serie con storia breve sono allungate all'indietro con un proxy (rendimenti).
Benchmark: S&P 500 TR (CSPX) e MSCI World TR (IWDA) convertiti in CHF.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from reale import storia, fx_serie, BENCH, r2, SPEC

ROOT = Path(__file__).resolve().parent
INIZIO_DATI = "2014-10-01"
INIZIO_GRAFICO = "2016-01-01"
MESI, BANDA, QUOTA = 10, 0.01, 0.75
PESI = {"WORLD": 0.25, "IWMO": 0.25, "EIMI": 0.20, "ZGLD": 0.20, "FWRA": 0.05, "EMVL": 0.05}
AZIONARIO = ["WORLD", "IWMO", "EIMI", "FWRA", "EMVL"]
USD_AZ = sum(PESI[t] for t in ("IWMO", "EIMI", "EMVL")) / sum(PESI[t] for t in AZIONARIO)
COSTO = 0.0015 + 0.0010 + 0.0025 * USD_AZ
# proxy per allungare all'indietro le linee nate da poco: (ticker Yahoo, valuta)
PROXY = {
    "WORLD": [("IWDC.SW", "CHF"), ("IWDA.L", "USD")],
    "FWRA": [("VWRA.L", "USD"), ("SSAC.L", "USD"), ("IWDA.L", "USD")],
    "EMVL": [("EIMI.L", "USD")],
    "IWMO": [("IWDA.L", "USD")],
    "EIMI": [("IEMA.L", "USD")],
}
# tasso della liquidità in CHF: tasso guida BNS (approssimazione del SARON)
BNS = [("2014-12-18", -0.25), ("2015-01-15", -0.75), ("2022-06-17", -0.25), ("2022-09-23", 0.50),
       ("2022-12-16", 1.00), ("2023-03-24", 1.50), ("2023-06-23", 1.75), ("2024-03-22", 1.50),
       ("2024-06-21", 1.25), ("2024-09-27", 1.00), ("2024-12-13", 0.50), ("2025-03-21", 0.25),
       ("2025-06-20", 0.00)]
LINEE = ["VITA 5M senza copertura", "VITA 5M con copertura (EMA 10 mesi)", "S&P 500 TR (CHF)", "MSCI World TR (CHF)"]


def in_chf(s, ccy, fx):
    if ccy == "CHF":
        return s
    f = fx[ccy]
    return s * f.reindex(s.index.union(f.index)).ffill().reindex(s.index)


def serie_lunga(t, cands, ccy, fx, note):
    s, sym = storia(cands, INIZIO_DATI)
    s = in_chf(s, ccy, fx)
    for psym, pccy in PROXY.get(t, []):
        if s.index[0] <= pd.Timestamp(INIZIO_DATI) + pd.Timedelta(days=20):
            break
        try:
            p, _ = storia([psym], INIZIO_DATI)
        except SystemExit:
            continue
        p = in_chf(p, pccy, fx)
        prima = s.index[0]
        rp = p.pct_change()
        pre = (1 + rp[rp.index <= prima].fillna(0)).cumprod()
        if len(pre) < 2:
            continue
        pre = pre / pre.iloc[-1] * s.iloc[0]
        s = pd.concat([pre[pre.index < prima], s])
        note.append(f"{t}: prima del {prima.date()} rendimenti di {psym} ({pccy}) come proxy")
    return s, sym


def tasso_cash(idx):
    r = pd.Series({pd.Timestamp(a): b for a, b in BNS})
    r = r.reindex(r.index.union(idx)).ffill().reindex(idx).fillna(-0.75)
    return r / 100 / 252


def metriche(s):
    s = s.dropna()
    r = s.pct_change().dropna()
    if len(r) < 20:
        return {}
    anni = len(r) / 252
    tot = s.iloc[-1] / s.iloc[0] - 1
    cagr = (1 + tot) ** (1 / anni) - 1 if anni >= 0.9 else None
    vol = r.std(ddof=1) * math.sqrt(252)
    dd = (s / s.cummax() - 1).min()
    return {"rend_pct": r2(tot * 100), "cagr_pct": r2(cagr * 100) if cagr is not None else None,
            "vol_pct": r2(vol * 100), "max_dd_pct": r2(dd * 100),
            "sharpe": r2(cagr / vol) if cagr is not None and vol else None,
            "calmar": r2(cagr / abs(dd)) if cagr is not None and dd else None}


def ultimo_giorno_borsa(d):
    fine = (d + pd.offsets.MonthEnd(0)).normalize()
    while fine.dayofweek >= 5:
        fine -= pd.Timedelta(days=1)
    return fine


def main(out_dir: str) -> None:
    spec = json.loads(SPEC.read_text())
    lines = {l["ticker"]: l for l in spec["lines"]}
    fx = {"USD": fx_serie("USD", INIZIO_DATI), "EUR": fx_serie("EUR", INIZIO_DATI)}
    note, fonti, P = [], {}, {}
    for t in PESI:
        s, sym = serie_lunga(t, lines[t]["yf"], lines[t]["ccy"], fx, note)
        P[t], fonti[t] = s, sym
    P = pd.DataFrame(P).sort_index().ffill()
    P = P[P.index.dayofweek < 5].dropna()
    R = P.pct_change().fillna(0.0)

    B = {}
    for nome, b in BENCH.items():
        s, sym = storia(b["yf"], INIZIO_DATI)
        B[nome] = in_chf(s, b["ccy"][b["yf"].index(sym)], fx)
        fonti[nome] = sym
    B = pd.DataFrame(B).reindex(P.index.union(pd.DataFrame(B).index)).ffill().reindex(P.index)

    # azionario VITA 5M ribilanciato a fine mese ai pesi obiettivo
    w_az = pd.Series({t: PESI[t] for t in AZIONARIO}); w_az = w_az / w_az.sum()
    fine_mese = P.index.to_series().groupby(P.index.to_period("M")).max()
    r_az = (R[AZIONARIO] * w_az).sum(axis=1)  # ribilanciamento giornaliero ~ mensile per questa misura
    az = (1 + r_az).cumprod()
    r_oro = R["ZGLD"]
    cash = tasso_cash(P.index)

    # segnale mensile: il mese in corso non e' un controllo finche' non chiude
    oggi0 = P.index[-1]
    mese_in_corso = oggi0 < ultimo_giorno_borsa(oggi0)
    chiusure = az.loc[fine_mese.values]
    if mese_in_corso:
        chiusure = chiusure.iloc[:-1]
    ema = chiusure.ewm(span=MESI, adjust=False).mean()
    stato, mensile, quota = 0.0, [], {}
    for i, (d, c) in enumerate(chiusure.items()):
        m = ema.iloc[i]
        evento = "—"
        if i >= MESI - 1:
            if stato == 0 and c < m * (1 - BANDA):
                stato, evento = QUOTA, "VENDITA"
            elif stato > 0 and c > m * (1 + BANDA):
                stato, evento = 0.0, "RIENTRO"
        quota[d] = stato
        mensile.append({"mese": d.strftime("%Y-%m"), "data": d.strftime("%Y-%m-%d"), "chiusura": r2(c * 100, 2),
                        "ema": r2(m * 100, 2), "dist_pct": r2((c / m - 1) * 100), "evento": evento,
                        "quota_venduta_pct": r2(stato * 100, 0)})
    # quota venduta in vigore dalla prima seduta del mese successivo al controllo
    q = pd.Series(quota).reindex(P.index).ffill().fillna(0.0).shift(1).fillna(0.0)

    # simulazione: azionario E, oro G, liquidità K; pesi obiettivo a fine mese
    E, G, K = 0.80, 0.20, 0.0
    nav_c, nav_s = [], []
    Es, Gs = 0.80, 0.20
    prev_q = 0.0
    ultimi = set(fine_mese.values)
    for d in P.index:
        ra, ro, rc = r_az.loc[d], r_oro.loc[d], cash.loc[d]
        E *= 1 + ra; G *= 1 + ro; K *= 1 + rc
        Es *= 1 + ra; Gs *= 1 + ro
        qd = q.loc[d]
        if qd != prev_q:  # esecuzione del segnale
            tot_az = E + K
            dk = qd * tot_az - K
            c = abs(dk) * COSTO
            if dk > 0:
                E -= dk; K += dk - c
            else:
                K += dk; E += -dk - c
            prev_q = qd
        if d in ultimi:  # ribilanciamento mensile oro / azionario ai pesi obiettivo (senza costi: flussi interni)
            tot = E + G + K
            G = 0.20 * tot; rest = 0.80 * tot
            K = qd * rest; E = rest - K
            tots = Es + Gs
            Gs, Es = 0.20 * tots, 0.80 * tots
        nav_c.append(E + G + K); nav_s.append(Es + Gs)
    NAV = pd.DataFrame({LINEE[0]: nav_s, LINEE[1]: nav_c}, index=P.index)
    NAV[LINEE[2]] = B["S&P 500 TR (CHF)"]
    NAV[LINEE[3]] = B["MSCI World TR (CHF)"]
    g = NAV.loc[INIZIO_GRAFICO:].dropna()
    g = g / g.iloc[0] * 100
    DD = (g / g.cummax() - 1) * 100

    # fasi di copertura
    fasi, aperta = [], None
    qg = q.loc[g.index]
    for d, v in qg.items():
        if v > 0 and aperta is None:
            aperta = d
        elif v == 0 and aperta is not None:
            fasi.append((aperta, d)); aperta = None
    if aperta is not None:
        fasi.append((aperta, None))
    righe_fasi = []
    for a, b in fasi:
        bb = b or g.index[-1]
        righe_fasi.append({"da": a.strftime("%Y-%m-%d"), "a": b.strftime("%Y-%m-%d") if b else None,
                           "sedute": int(((g.index >= a) & (g.index <= bb)).sum()),
                           "rend_senza_pct": r2((g[LINEE[0]].loc[bb] / g[LINEE[0]].loc[a] - 1) * 100),
                           "rend_con_pct": r2((g[LINEE[1]].loc[bb] / g[LINEE[1]].loc[a] - 1) * 100)})

    oggi = g.index[-1]
    finestre = {"Dal 2016": g.index[0], "Dal 2020": pd.Timestamp("2020-01-01"),
                "Ultimi 3 anni": oggi - pd.DateOffset(years=3), "Ultimi 12 mesi": oggi - pd.DateOffset(years=1),
                "Da inizio anno": pd.Timestamp(f"{oggi.year}-01-01")}
    met = {k: {n: metriche(g[n].loc[v:]) for n in LINEE} for k, v in finestre.items()}

    # stato attuale del segnale
    # il riferimento e' l'ultimo controllo chiuso prima della seduta di oggi
    k = -1 if mese_in_corso else -2
    ult_ctrl = chiusure.index[k]
    ema_prec = float(ema.iloc[k]); stato_regola = quota[ult_ctrl]
    livello = float(az.iloc[-1])
    ema_stima = ema_prec + 2 / (MESI + 1) * (livello - ema_prec)
    s_v, s_r = ema_stima * (1 - BANDA), ema_stima * (1 + BANDA)
    # livello di chiusura che rende vero il segnale: c < (ema_prec*(1-a)*(1-b)) / (1 - a*(1-b)), a = 2/11
    a = 2 / (MESI + 1)
    lim_v = ema_prec * (1 - a) * (1 - BANDA) / (1 - a * (1 - BANDA))
    lim_r = ema_prec * (1 - a) * (1 + BANDA) / (1 - a * (1 + BANDA))
    it = lambda v: f"{v:+.1f}".replace(".", ",")
    if stato_regola == 0:
        se_chiude = "VENDITA" if livello < lim_v else "NESSUN SEGNALE"
        serve = (lim_v / livello - 1) * 100
        frase = (f"Se il mese chiudesse oggi la regola venderebbe il {int(QUOTA*100)}% dell'azionario. Per evitarlo serve un "
                 f"rialzo di almeno {it(serve)}% entro la chiusura del {ultimo_giorno_borsa(oggi).strftime('%d.%m.%Y')}."
                 if se_chiude == "VENDITA" else
                 f"Nessun segnale: l'azionario è {it(abs(serve))[1:]}% sopra il livello che farebbe scattare la vendita.")
    else:
        se_chiude = "RIENTRO" if livello > lim_r else "RESTA COPERTO"
        serve = (lim_r / livello - 1) * 100
        frase = (f"Copertura attiva ({int(stato_regola*100)}% dell'azionario in liquidità). " +
                 ("Se il mese chiudesse oggi la regola ricomprerebbe tutto." if se_chiude == "RIENTRO"
                  else f"Per il rientro serve un rialzo di {it(serve)}% entro fine mese."))
    stato_out = {
        "data": oggi.strftime("%Y-%m-%d"), "livello": r2(livello * 100, 2),
        "ema_fine_mese_precedente": r2(ema_prec * 100, 2), "ema_stimata_fine_mese": r2(ema_stima * 100, 2),
        "dist_ema_prec_pct": r2((livello / ema_prec - 1) * 100), "dist_ema_stimata_pct": r2((livello / ema_stima - 1) * 100),
        "soglia_vendita": r2(s_v * 100, 2), "soglia_rientro": r2(s_r * 100, 2),
        "livello_chiusura_vendita": r2(lim_v * 100, 2), "livello_chiusura_rientro": r2(lim_r * 100, 2),
        "stato_regola": "COPERTO" if stato_regola > 0 else "INVESTITO", "quota_venduta_pct": r2(stato_regola * 100, 0),
        "se_chiudesse_oggi": se_chiude, "variazione_necessaria_pct": r2(serve),
        "ultimo_controllo": ult_ctrl.strftime("%Y-%m-%d"), "mese_in_corso": bool(mese_in_corso),
        "prossimo_controllo": ultimo_giorno_borsa(oggi).strftime("%Y-%m-%d"),
        "giorni_al_controllo": int(np.busday_count(oggi.date() + dt.timedelta(days=1), ultimo_giorno_borsa(oggi).date() + dt.timedelta(days=1))),
        "frase": frase,
        "avvertenza": "Prezzi di chiusura pubblici (Yahoo). Il segnale vale sulle chiusure ufficiali dell'ultima seduta del mese; "
                      "confrontarle con le marcature della banca prima di eseguire.",
    }
    picco = az.loc[az.index >= oggi - pd.DateOffset(years=1)]
    stato_out["calo_dal_massimo_12m_pct"] = r2((livello / picco.max() - 1) * 100)
    stato_out["data_massimo_12m"] = picco.idxmax().strftime("%Y-%m-%d")

    out = {
        "asof": oggi.strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "regola": {"media": f"esponenziale a {MESI} mesi su chiusure di fine mese", "banda_pct": BANDA * 100,
                   "quota_venduta_pct": QUOTA * 100, "costo_compravendita_pct": r2(COSTO * 100, 3),
                   "grandezza": "azionario VITA 5M (WORLD, IWMO, EIMI, FWRA, EMVL) ai pesi obiettivo, in CHF; ZGLD escluso",
                   "esecuzione": "prima seduta del mese successivo al controllo", "liquidita": "CHF al tasso guida BNS"},
        "serie": {"date": [d.strftime("%Y-%m-%d") for d in g.index], **{n: [r2(v) for v in g[n]] for n in LINEE},
                  "quota_venduta_pct": [r2(v * 100, 0) for v in qg]},
        "drawdown": {n: [r2(v) for v in DD[n]] for n in LINEE},
        "mensile": mensile, "fasi": righe_fasi, "metriche": met, "stato": stato_out,
        "fonti": fonti, "note": note,
        "disclaimer": "Studio interno, simulazione su prezzi pubblici con proxy per le serie brevi. Non è consulenza finanziaria. "
                      "Le performance passate non sono indicative di quelle future.",
    }
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "vita5m_copertura.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("scritto vita5m_copertura.json | asof", out["asof"], "|", stato_out["stato_regola"], "|", se_chiude,
          "| dist", stato_out["dist_ema_stimata_pct"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data"))
