"""S&P 500 e segnale della media esponenziale a 10 mesi, sulla storia più lunga disponibile.

Scrive data/spx_segnale.json per la pagina spx-segnale.html.
- Indice: ^GSPC (S&P 500 di prezzo, Yahoo, dal 1927). Per il confronto di rendimento
  si usa anche ^SP500TR (total return, dal 1988) dove disponibile.
- Segnale (stessa regola di VITA 5M): chiusura di fine mese sotto la media esponenziale a
  10 mesi - 1% -> VENDITA (freccia giù); sopra media + 1% -> RIENTRO (freccia su).
  Esecuzione alla prima seduta del mese successivo.
- Strategia illustrativa: 100% indice quando investito, liquidità a rendimento zero quando
  fuori (prudenziale), costo 0,10% per operazione.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from reale import storia, r2

ROOT = Path(__file__).resolve().parent
MESI, BANDA, COSTO = 10, 0.01, 0.001


def ultimo_giorno_borsa(d):
    fine = (d + pd.offsets.MonthEnd(0)).normalize()
    while fine.dayofweek >= 5:
        fine -= pd.Timedelta(days=1)
    return fine


def main(out_dir: str) -> None:
    px, sym = storia(["^GSPC"], "1927-01-01")
    oggi = px.index[-1]
    in_corso = oggi < ultimo_giorno_borsa(oggi)
    me = px.groupby(px.index.to_period("M")).last()
    me.index = me.index.to_timestamp("M")
    chiusi = me.iloc[:-1] if in_corso else me
    ema = chiusi.ewm(span=MESI, adjust=False).mean()

    stato, eventi = 1, []          # 1 investito, 0 fuori
    pos = {}
    for i, (d, c) in enumerate(chiusi.items()):
        m = ema.iloc[i]
        if i >= MESI - 1:
            if stato == 1 and c < m * (1 - BANDA):
                stato = 0; eventi.append({"data": d.strftime("%Y-%m-%d"), "tipo": "VENDITA", "prezzo": r2(c, 2), "ema": r2(m, 2)})
            elif stato == 0 and c > m * (1 + BANDA):
                stato = 1; eventi.append({"data": d.strftime("%Y-%m-%d"), "tipo": "RIENTRO", "prezzo": r2(c, 2), "ema": r2(m, 2)})
        pos[d] = stato
    # esito di ogni segnale fino al segnale successivo (o a oggi)
    for j, e in enumerate(eventi):
        a = pd.Timestamp(e["data"])
        b = pd.Timestamp(eventi[j + 1]["data"]) if j + 1 < len(eventi) else oggi
        pa = me.loc[a]; pb = px.loc[:b].iloc[-1] if b == oggi else me.loc[b]
        var = (pb / pa - 1) * 100
        e["fino_a"] = b.strftime("%Y-%m-%d"); e["mesi"] = int(round((b - a).days / 30.44))
        e["var_indice_pct"] = r2(var)
        # una vendita è "corretta" se l'indice scende fino al rientro; un rientro se sale fino alla vendita
        e["esito"] = "corretto" if (var < 0 if e["tipo"] == "VENDITA" else var > 0) else "falso"

    # strategia illustrativa su rendimenti mensili di prezzo
    rm = me.pct_change().fillna(0)
    p = pd.Series(pos).reindex(me.index).ffill().fillna(1).shift(1).fillna(1)
    if in_corso:
        p.iloc[-1] = pd.Series(pos).iloc[-1]
    switch = p.diff().abs().fillna(0)
    strat = (1 + rm * p - switch * COSTO).cumprod()
    bh = (1 + rm).cumprod()

    def stat(s):
        r = s.pct_change().dropna(); anni = len(r) / 12
        cagr = s.iloc[-1] ** (1 / anni) - 1
        vol = r.std() * math.sqrt(12); dd = (s / s.cummax() - 1).min()
        return {"cagr_pct": r2(cagr * 100), "vol_pct": r2(vol * 100), "max_dd_pct": r2(dd * 100),
                "sharpe": r2(cagr / vol), "calmar": r2(cagr / abs(dd))}

    periodi = {"Intero periodo": me.index[MESI], "Dal 1950": pd.Timestamp("1950-01-31"),
               "Dal 1990": pd.Timestamp("1990-01-31"), "Dal 2000": pd.Timestamp("2000-01-31"),
               "Dal 2010": pd.Timestamp("2010-01-31"), "Dal 2020": pd.Timestamp("2020-01-31")}
    met = {k: {"Indice (buy & hold)": stat(bh.loc[v:] / bh.loc[v:].iloc[0]),
               "Con segnale (fuori = liquidità a 0%)": stat(strat.loc[v:] / strat.loc[v:].iloc[0])} for k, v in periodi.items()}

    vend = [e for e in eventi if e["tipo"] == "VENDITA"]
    riep = {"vendite": len(vend), "rientri": len(eventi) - len(vend),
            "vendite_corrette_pct": r2(sum(e["esito"] == "corretto" for e in vend) / max(len(vend), 1) * 100, 0),
            "mesi_fuori_pct": r2((1 - pd.Series(pos).mean()) * 100, 1),
            "anni": r2((me.index[-1] - me.index[0]).days / 365.25, 1)}

    ema_prec = float(ema.iloc[-1]); liv = float(px.iloc[-1]); a = 2 / (MESI + 1)
    lim_v = ema_prec * (1 - a) * (1 - BANDA) / (1 - a * (1 - BANDA))
    lim_r = ema_prec * (1 - a) * (1 + BANDA) / (1 - a * (1 + BANDA))
    stato_out = {"data": oggi.strftime("%Y-%m-%d"), "livello": r2(liv, 2), "ema_ultimo_fine_mese": r2(ema_prec, 2),
                 "dist_ema_pct": r2((liv / ema_prec - 1) * 100), "posizione": "INVESTITO" if stato == 1 else "FUORI",
                 "livello_vendita": r2(lim_v, 2), "livello_rientro": r2(lim_r, 2),
                 "se_chiudesse_oggi": ("VENDITA" if liv < lim_v else "NESSUN SEGNALE") if stato == 1 else ("RIENTRO" if liv > lim_r else "RESTA FUORI"),
                 "variazione_necessaria_pct": r2(((lim_v if stato == 1 else lim_r) / liv - 1) * 100),
                 "prossimo_controllo": ultimo_giorno_borsa(oggi).strftime("%Y-%m-%d"), "mese_in_corso": bool(in_corso),
                 "ultimo_segnale": eventi[-1] if eventi else None}

    out = {"asof": oggi.strftime("%Y-%m-%d"), "generato": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "fonte": sym, "regola": {"media_mesi": MESI, "banda_pct": BANDA * 100, "costo_pct": COSTO * 100},
           "mensile": {"date": [d.strftime("%Y-%m") for d in me.index], "chiusura": [r2(v, 2) for v in me],
                       "ema": [r2(ema.get(d), 2) if d in ema.index else None for d in me.index],
                       "investito": [int(p.get(d, 1)) for d in me.index],
                       "strategia": [r2(v * 100, 3) for v in strat], "buy_hold": [r2(v * 100, 3) for v in bh]},
           "eventi": eventi, "riepilogo": riep, "metriche": met, "stato": stato_out,
           "disclaimer": "Studio illustrativo su indice di prezzo (dividendi esclusi), liquidità a rendimento zero quando fuori dal mercato, "
                         "costo 0,10% per operazione, imposte escluse. Non è consulenza finanziaria. Le performance passate non sono indicative di quelle future."}
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "spx_segnale.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print("scritto spx_segnale.json | dal", out["mensile"]["date"][0], "| eventi", len(eventi), "|", stato_out["posizione"], stato_out["se_chiudesse_oggi"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data"))
