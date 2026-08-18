"""Blocco analitico del cruscotto VITA: performance, rischio, distribuzione,
metriche relative a benchmark, decomposizione del rischio, bootstrap e stress.

Convenzioni: rendimenti giornalieri semplici; 252 giorni/anno; VaR e CVaR
espressi POSITIVI (perdita attesa); drawdown negativi; tasso privo di rischio
dichiarato esplicitamente (default 0%). Ogni blocco e' calcolato solo se la
numerosita' campionaria lo consente: dove il campione non basta il valore e'
None e la pagina lo mostra come non disponibile.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

TD = 252          # giorni di borsa per anno
Z = {0.95: 1.6448536, 0.99: 2.3263479}


# --------------------------------------------------------------- utilita' base
def _r(nav: pd.Series) -> pd.Series:
    return nav.pct_change().dropna()


def ann_factor(nav: pd.Series) -> float:
    return max((nav.index[-1] - nav.index[0]).days / 365.25, 1e-9)


def cagr(nav: pd.Series) -> float:
    return float((nav.iloc[-1] / nav.iloc[0]) ** (1 / ann_factor(nav)) - 1.0)


def r2(x) -> float | None:
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), 2)


def r4(x) -> float | None:
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), 4)


def pct(x, d=2) -> float | None:
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x) * 100, d)


# ------------------------------------------------------------------- drawdown
def dd_series(nav: pd.Series) -> pd.Series:
    return nav / nav.cummax() - 1.0


def episodi_drawdown(nav: pd.Series, top: int = 8) -> list[dict]:
    """I maggiori drawdown con picco, minimo, recupero e durate in giorni."""
    dd = dd_series(nav)
    epis, in_dd, picco = [], False, None
    for ts, v in dd.items():
        if not in_dd and v < 0:
            in_dd, picco = True, ts
        elif in_dd and v == 0:
            seg = dd.loc[picco:ts]
            epis.append((picco, seg.idxmin(), ts, float(seg.min())))
            in_dd = False
    if in_dd:
        seg = dd.loc[picco:]
        epis.append((picco, seg.idxmin(), None, float(seg.min())))
    epis.sort(key=lambda e: e[3])
    out = []
    for p, t, rec, prof in epis[:top]:
        # il picco effettivo e' l'ultimo massimo prima dell'inizio del drawdown
        p_eff = nav.loc[:p].idxmax()
        out.append({
            "picco": str(p_eff.date()), "minimo": str(t.date()),
            "recupero": str(rec.date()) if rec is not None else None,
            "profondita_pct": pct(prof),
            "giorni_caduta": int((t - p_eff).days),
            "giorni_recupero": int((rec - t).days) if rec is not None else None,
            "giorni_totali": int(((rec or nav.index[-1]) - p_eff).days),
            "in_corso": rec is None,
        })
    return out


def ulcer_index(nav: pd.Series) -> float:
    return float(np.sqrt((dd_series(nav) ** 2).mean()))


def pain_index(nav: pd.Series) -> float:
    return float(-dd_series(nav).mean())


def tempo_sott_acqua(nav: pd.Series) -> dict:
    dd = dd_series(nav)
    epis = episodi_drawdown(nav, top=10_000)
    durate = [e["giorni_totali"] for e in epis] or [0]
    return {
        "quota_giorni_sotto_massimo_pct": pct(float((dd < -1e-12).mean())),
        "dd_medio_pct": pct(float(dd[dd < 0].mean()) if (dd < 0).any() else 0.0),
        "durata_media_gg": round(float(np.mean(durate)), 0),
        "durata_max_gg": int(max(durate)),
        "episodi_n": len(epis),
    }


# ------------------------------------------------------------- rischio e coda
def var_cvar(r: pd.Series, level: float = 0.95) -> dict:
    q = float(np.quantile(r.values, 1 - level))
    coda = r[r <= q]
    mu, sd = float(r.mean()), float(r.std(ddof=1))
    z = Z[level]
    s, k = float(stats.skew(r)), float(stats.kurtosis(r))  # kurtosis in eccesso
    zcf = z + (z**2 - 1) * s / 6 + (z**3 - 3*z) * k / 24 - (2*z**3 - 5*z) * s**2 / 36
    return {
        "hist": -q, "param": z * sd - mu, "cornish_fisher": zcf * sd - mu,
        "cvar": -float(coda.mean()) if len(coda) else -q,
    }


def downside_dev(r: pd.Series, soglia: float = 0.0) -> float:
    d = r[r < soglia] - soglia
    return float(np.sqrt((d ** 2).mean())) if len(d) else 0.0


def omega(r: pd.Series, soglia: float = 0.0) -> float | None:
    su = (r[r > soglia] - soglia).sum()
    giu = (soglia - r[r <= soglia]).sum()
    return float(su / giu) if giu > 0 else None


def kappa(r: pd.Series, n: int = 3, soglia: float = 0.0) -> float | None:
    giu = soglia - r[r < soglia]
    lpm = float((giu ** n).mean()) if len(giu) else 0.0
    if lpm <= 0:
        return None
    return float((r.mean() - soglia) * TD / (lpm ** (1 / n) * TD ** (1 / n)))


def ewma_vol(r: pd.Series, lam: float = 0.94) -> pd.Series:
    """Volatilita' annualizzata EWMA (RiskMetrics, lambda 0.94)."""
    var = r.ewm(alpha=1 - lam, adjust=False).var(bias=True)
    return np.sqrt(var * TD)


def hurst(r: pd.Series) -> float | None:
    """Esponente di Hurst con analisi R/S su finestre crescenti."""
    x = r.values
    if len(x) < 120:
        return None
    tagli, rs = [], []
    n = len(x)
    for w in [10, 20, 40, 80, 160, 320]:
        if w * 2 > n:
            break
        seg = [x[i:i + w] for i in range(0, n - w + 1, w)]
        val = []
        for s in seg:
            dev = np.cumsum(s - s.mean())
            R, S = dev.max() - dev.min(), s.std(ddof=1)
            if S > 0:
                val.append(R / S)
        if val:
            tagli.append(np.log(w)); rs.append(np.log(np.mean(val)))
    if len(tagli) < 3:
        return None
    return float(np.polyfit(tagli, rs, 1)[0])


def ljung_box(r: pd.Series, lags: int = 10) -> dict:
    x = r - r.mean()
    n = len(x)
    acf = [float((x[:-k] * x.values[k:]).sum() / (x ** 2).sum()) for k in range(1, lags + 1)]
    q = n * (n + 2) * sum(a ** 2 / (n - k - 1) for k, a in enumerate(acf))
    return {"Q": round(float(q), 2), "p_value": r4(1 - stats.chi2.cdf(q, lags)),
            "lags": lags, "acf1": r4(acf[0])}


# ------------------------------------------------- Sharpe probabilistico e DSR
def psr(sr: float, n: int, skew: float, kurt_ecc: float, sr_bench: float = 0.0) -> float | None:
    """Probabilistic Sharpe Ratio (Bailey & Lopez de Prado): P(SR_vero > sr_bench)
    corretta per asimmetria e code del campione. sr e sr_bench sono ANNUALIZZATI."""
    if n < 30:
        return None
    sr_d, b_d = sr / np.sqrt(TD), sr_bench / np.sqrt(TD)
    den = np.sqrt(1 - skew * sr_d + (kurt_ecc + 2) / 4 * sr_d ** 2)
    if den <= 0:
        return None
    return float(stats.norm.cdf((sr_d - b_d) * np.sqrt(n - 1) / den))


def dsr(sr: float, n: int, skew: float, kurt_ecc: float, n_prove: int,
        var_sr_prove: float | None = None) -> float | None:
    """Deflated Sharpe Ratio: PSR contro la soglia attesa del MASSIMO di
    n_prove Sharpe indipendenti a vera performance nulla (selection bias)."""
    if n < 30 or n_prove < 2:
        return None
    v = var_sr_prove if var_sr_prove is not None else 1.0 / (n - 1)
    e = 0.5772156649
    z1 = stats.norm.ppf(1 - 1 / n_prove)
    z2 = stats.norm.ppf(1 - 1 / (n_prove * np.e))
    sr0_d = np.sqrt(v) * ((1 - e) * z1 + e * z2)
    return psr(sr, n, skew, kurt_ecc, sr_bench=sr0_d * np.sqrt(TD))


# ----------------------------------------------------------- blocco benchmark
def blocco_benchmark(nav: pd.Series, bnav: pd.Series, rf: float = 0.0) -> dict:
    a = _r(nav).rename("p")
    b = _r(bnav).rename("b")
    df = pd.concat([a, b], axis=1).dropna()
    if len(df) < 60:
        return {}
    p, q = df["p"], df["b"]
    beta, alpha_d, r_val, p_val, _ = stats.linregress(q, p)
    su, giu = q > 0, q < 0
    te = float((p - q).std(ddof=1) * np.sqrt(TD))
    cap_su = float(((1 + p[su]).prod() ** (TD / max(su.sum(), 1)) - 1) /
                   ((1 + q[su]).prod() ** (TD / max(su.sum(), 1)) - 1)) if su.sum() > 5 else None
    cap_giu = float(((1 + p[giu]).prod() ** (TD / max(giu.sum(), 1)) - 1) /
                    ((1 + q[giu]).prod() ** (TD / max(giu.sum(), 1)) - 1)) if giu.sum() > 5 else None
    vol_p = float(p.std(ddof=1) * np.sqrt(TD))
    vol_b = float(q.std(ddof=1) * np.sqrt(TD))
    sr_p = (float(p.mean()) * TD - rf) / vol_p if vol_p > 0 else 0.0
    m2 = rf + sr_p * vol_b
    beta_su = float(stats.linregress(q[su], p[su]).slope) if su.sum() > 20 else None
    beta_giu = float(stats.linregress(q[giu], p[giu]).slope) if giu.sum() > 20 else None
    return {
        "beta": r2(beta),
        "alpha_ann_pct": pct(alpha_d * TD),
        "correlazione": r2(r_val),
        "r_quadro": r2(r_val ** 2),
        "tracking_error_pct": pct(te),
        "information_ratio": r2((float(p.mean() - q.mean()) * TD) / te) if te > 0 else None,
        "up_capture_pct": pct(cap_su),
        "down_capture_pct": pct(cap_giu),
        "beta_up": r2(beta_su),
        "beta_down": r2(beta_giu),
        "batting_average_pct": pct(float((p > q).mean())),
        "m2_ann_pct": pct(m2),
        "perf_bench_pct": pct(float(bnav.iloc[-1] / bnav.iloc[0] - 1)),
        "cagr_bench_pct": pct(cagr(bnav)),
        "vol_bench_pct": pct(vol_b),
        "maxdd_bench_pct": pct(float(dd_series(bnav).min())),
        "extra_rendimento_pct": pct(float(nav.iloc[-1] / nav.iloc[0] - bnav.iloc[-1] / bnav.iloc[0])),
        "oss_n": int(len(df)),
    }


# ------------------------------------------------ decomposizione del rischio
def decomposizione_rischio(valori: pd.DataFrame, nav_last: float) -> dict:
    """Contributo al rischio per posizione: volatilita' marginale e componente,
    VaR componente, concentrazione (HHI) e numero effettivo di scommesse (PCA)."""
    rend = valori.pct_change().dropna()
    if len(rend) < 60 or rend.shape[1] < 2:
        return {}
    w = (valori.iloc[-1] / nav_last).values
    cov = rend.cov().values * TD
    var_p = float(w @ cov @ w)
    vol_p = float(np.sqrt(var_p))
    mrc = (cov @ w) / vol_p                      # contributo marginale
    crc = w * mrc                                # contributo assoluto
    quota = crc / vol_p
    # VaR componente al 95% (approssimazione gaussiana sul portafoglio)
    var95 = Z[0.95] * vol_p / np.sqrt(TD)
    var_comp = quota * var95
    hhi = float((w ** 2).sum())
    # numero effettivo di scommesse: entropia dei pesi PCA (Meucci)
    autoval = np.linalg.eigvalsh(cov)[::-1]
    autoval = autoval[autoval > 1e-14]
    p = autoval / autoval.sum()
    enb = float(np.exp(-(p * np.log(p)).sum()))
    vol_singole = np.sqrt(np.diag(cov))
    div_ratio = float((w @ vol_singole) / vol_p)
    return {
        "componenti": [{
            "nome": c,
            "peso_pct": pct(w[i]),
            "vol_singola_pct": pct(vol_singole[i]),
            "contrib_vol_pct": pct(crc[i]),
            "quota_rischio_pct": pct(quota[i]),
            "var95_componente_pct": pct(var_comp[i]),
            "beta_al_portafoglio": r2(mrc[i] / vol_p),
        } for i, c in enumerate(rend.columns)],
        "vol_portafoglio_pct": pct(vol_p),
        "somma_vol_singole_pct": pct(float(w @ vol_singole)),
        "beneficio_diversificazione_pct": pct(float(w @ vol_singole - vol_p)),
        "diversification_ratio": r2(div_ratio),
        "hhi": r4(hhi),
        "n_equivalente_posizioni": r2(1 / hhi),
        "numero_effettivo_scommesse": r2(enb),
        "posizioni_n": int(rend.shape[1]),
    }


# ------------------------------------------------------ bootstrap e proiezioni
def bootstrap(r: pd.Series, orizzonti_anni=(1, 3, 5), n_sim: int = 10_000,
              blocco: int = 21, seme: int = 20260818) -> dict:
    """Block bootstrap stazionario dei rendimenti storici: distribuzione del
    montante e del drawdown a diversi orizzonti. Assume che la distribuzione
    futura somigli a quella osservata: e' una proiezione, non una previsione."""
    rng = np.random.default_rng(seme)
    x = r.values
    n = len(x)
    if n < 120:
        return {}
    out = {}
    for anni in orizzonti_anni:
        h = int(TD * anni)
        n_bl = int(np.ceil(h / blocco))
        idx = rng.integers(0, n - blocco, size=(n_sim, n_bl))
        pos = idx[:, :, None] + np.arange(blocco)[None, None, :]
        camm = x[pos].reshape(n_sim, -1)[:, :h]
        perc = np.cumprod(1 + camm, axis=1)
        finale = perc[:, -1]
        picco = np.maximum.accumulate(perc, axis=1)
        dd_min = (perc / picco - 1).min(axis=1)
        out[f"{anni}a"] = {
            "p05_pct": pct(np.quantile(finale, 0.05) - 1),
            "p25_pct": pct(np.quantile(finale, 0.25) - 1),
            "mediana_pct": pct(np.median(finale) - 1),
            "p75_pct": pct(np.quantile(finale, 0.75) - 1),
            "p95_pct": pct(np.quantile(finale, 0.95) - 1),
            "prob_perdita_pct": pct(float((finale < 1).mean())),
            "prob_sotto_meno10_pct": pct(float((finale < 0.90).mean())),
            "prob_sopra_piu20_pct": pct(float((finale > 1.20).mean())),
            "cvar95_finale_pct": pct(float(finale[finale <= np.quantile(finale, 0.05)].mean()) - 1),
            "dd_atteso_mediano_pct": pct(float(np.median(dd_min))),
            "dd_p95_pct": pct(float(np.quantile(dd_min, 0.05))),
        }
    out["_meta"] = {"n_sim": n_sim, "blocco_gg": blocco, "oss_storiche": int(n)}
    return out


def cono_volatilita(r: pd.Series, finestre=(21, 63, 126, 252)) -> list[dict]:
    """Distribuzione storica della volatilita' realizzata per finestra."""
    out = []
    for w in finestre:
        if len(r) < w + 20:
            continue
        v = (r.rolling(w).std(ddof=1) * np.sqrt(TD)).dropna()
        out.append({
            "finestra_gg": w,
            "min_pct": pct(float(v.min())), "p25_pct": pct(float(v.quantile(.25))),
            "mediana_pct": pct(float(v.median())), "p75_pct": pct(float(v.quantile(.75))),
            "max_pct": pct(float(v.max())), "corrente_pct": pct(float(v.iloc[-1])),
        })
    return out


def finestre_peggiori(nav: pd.Series, giorni=(5, 21, 63, 126, 252)) -> list[dict]:
    out = []
    for g in giorni:
        if len(nav) <= g:
            continue
        roll = nav / nav.shift(g) - 1
        roll = roll.dropna()
        fine = roll.idxmin()
        out.append({
            "giorni": g,
            "peggiore_pct": pct(float(roll.min())),
            "migliore_pct": pct(float(roll.max())),
            "mediana_pct": pct(float(roll.median())),
            "quota_negative_pct": pct(float((roll < 0).mean())),
            "fine_peggiore": str(fine.date()),
        })
    return out


# ----------------------------------------------------------- blocco principale
def analitica(nav: pd.Series, valori: pd.DataFrame, benchmark: dict[str, pd.Series],
              rf: float = 0.0, n_prove_dsr: int = 6) -> dict:
    r = _r(nav)
    mensili = nav.resample("ME").last().pct_change().dropna()
    trim = nav.resample("QE").last().pct_change().dropna()
    sett = nav.resample("W-FRI").last().pct_change().dropna()
    vol = float(r.std(ddof=1) * np.sqrt(TD))
    dd = dd_series(nav)
    mdd = float(dd.min())
    g = cagr(nav)
    dsd = downside_dev(r)
    sk, ku = float(stats.skew(r)), float(stats.kurtosis(r))
    sr = (float(r.mean()) * TD - rf) / vol if vol > 0 else 0.0
    jb = stats.jarque_bera(r)
    sw = stats.shapiro(r.values[:5000])
    v95, v99 = var_cvar(r, .95), var_cvar(r, .99)
    epis = episodi_drawdown(nav)
    ui = ulcer_index(nav)
    # Burke: CAGR / radice della somma dei quadrati dei drawdown maggiori
    prof = np.array([e["profondita_pct"] / 100 for e in epis if e["profondita_pct"]])
    burke = float(g / np.sqrt((prof ** 2).sum())) if len(prof) else None
    # Sterling: CAGR / media dei 5 drawdown peggiori
    sterling = float(g / abs(prof[:5].mean())) if len(prof) else None
    vinc, pers = r[r > 0], r[r < 0]

    stat = {
        "campione": {
            "oss_giornaliere": int(len(r)), "oss_settimanali": int(len(sett)),
            "oss_mensili": int(len(mensili)), "oss_trimestrali": int(len(trim)),
            "anni": r2(ann_factor(nav)),
            "dal": str(nav.index[0].date()), "al": str(nav.index[-1].date()),
            "rf_dichiarato_pct": pct(rf), "n_prove_dsr": n_prove_dsr,
        },
        "rendimento": {
            "totale_pct": pct(float(nav.iloc[-1] / nav.iloc[0] - 1)),
            "cagr_pct": pct(g),
            "media_ann_aritmetica_pct": pct(float(r.mean()) * TD),
            "media_ann_geometrica_pct": pct(g),
            "miglior_giorno_pct": pct(float(r.max())),
            "peggior_giorno_pct": pct(float(r.min())),
            "miglior_settimana_pct": pct(float(sett.max())),
            "peggior_settimana_pct": pct(float(sett.min())),
            "miglior_mese_pct": pct(float(mensili.max())),
            "peggior_mese_pct": pct(float(mensili.min())),
            "miglior_trimestre_pct": pct(float(trim.max())) if len(trim) else None,
            "peggior_trimestre_pct": pct(float(trim.min())) if len(trim) else None,
            "giorni_positivi_pct": pct(float((r > 0).mean())),
            "settimane_positive_pct": pct(float((sett > 0).mean())),
            "mesi_positivi_pct": pct(float((mensili > 0).mean())),
            "trimestri_positivi_pct": pct(float((trim > 0).mean())) if len(trim) else None,
            "guadagno_medio_giorno_pct": pct(float(vinc.mean())) if len(vinc) else None,
            "perdita_media_giorno_pct": pct(float(pers.mean())) if len(pers) else None,
            "rapporto_vincite_perdite": r2(float(vinc.mean() / abs(pers.mean()))) if len(pers) else None,
            "profit_factor": r2(float(vinc.sum() / abs(pers.sum()))) if len(pers) else None,
            "gain_to_pain_mensile": r2(float(mensili.sum() / abs(mensili[mensili < 0].sum())))
            if (mensili < 0).any() else None,
            "expectancy_giorno_pct": pct(float(r.mean()), 4),
            "serie_positiva_max_gg": int((r > 0).astype(int).groupby((r <= 0).cumsum()).sum().max()),
            "serie_negativa_max_gg": int((r < 0).astype(int).groupby((r >= 0).cumsum()).sum().max()),
        },
        "rischio": {
            "vol_ann_giornaliera_pct": pct(vol),
            "vol_ann_settimanale_pct": pct(float(sett.std(ddof=1) * np.sqrt(52))),
            "vol_ann_mensile_pct": pct(float(mensili.std(ddof=1) * np.sqrt(12))),
            "vol_ewma_corrente_pct": pct(float(ewma_vol(r).iloc[-1])),
            "vol_30gg_corrente_pct": pct(float(r.tail(30).std(ddof=1) * np.sqrt(TD))),
            "vol_90gg_corrente_pct": pct(float(r.tail(90).std(ddof=1) * np.sqrt(TD))),
            "downside_deviation_pct": pct(dsd * np.sqrt(TD)),
            "semivarianza_ann_pct": pct(dsd ** 2 * TD, 4),
            "max_drawdown_pct": pct(mdd),
            "max_dd_data": str(dd.idxmin().date()),
            "ulcer_index_pct": pct(ui),
            "pain_index_pct": pct(pain_index(nav)),
            "var95_1g_hist_pct": pct(v95["hist"]),
            "var95_1g_param_pct": pct(v95["param"]),
            "var95_1g_cornish_fisher_pct": pct(v95["cornish_fisher"]),
            "cvar95_1g_pct": pct(v95["cvar"]),
            "var99_1g_hist_pct": pct(v99["hist"]),
            "var99_1g_param_pct": pct(v99["param"]),
            "var99_1g_cornish_fisher_pct": pct(v99["cornish_fisher"]),
            "cvar99_1g_pct": pct(v99["cvar"]),
            "var95_1sett_pct": pct(Z[.95] * vol * np.sqrt(5 / TD)),
            "var95_1mese_pct": pct(Z[.95] * vol * np.sqrt(21 / TD)),
            "var95_1anno_pct": pct(Z[.95] * vol),
            "var99_1mese_pct": pct(Z[.99] * vol * np.sqrt(21 / TD)),
            "var95_1mese_storico_pct": pct(-float(np.quantile(mensili, .05))) if len(mensili) >= 12 else None,
            "cvar95_1mese_storico_pct": pct(var_cvar(mensili, .95)["cvar"]) if len(mensili) >= 12 else None,
            "tail_ratio": r2(float(np.quantile(r, .95) / abs(np.quantile(r, .05)))),
            "common_sense_ratio": r2(float(np.quantile(r, .95) / abs(np.quantile(r, .05)) *
                                           (vinc.sum() / abs(pers.sum())))) if len(pers) else None,
        },
        "efficienza": {
            "sharpe": r2(sr),
            "sharpe_errore_std": r2(np.sqrt((1 + 0.5 * (sr / np.sqrt(TD)) ** 2) / len(r)) * np.sqrt(TD)),
            "sharpe_ic95_min": r2(sr - 1.96 * np.sqrt((1 + 0.5 * (sr / np.sqrt(TD)) ** 2) / len(r)) * np.sqrt(TD)),
            "sharpe_ic95_max": r2(sr + 1.96 * np.sqrt((1 + 0.5 * (sr / np.sqrt(TD)) ** 2) / len(r)) * np.sqrt(TD)),
            "psr_vs_zero_pct": pct(psr(sr, len(r), sk, ku)),
            "dsr_pct": pct(dsr(sr, len(r), sk, ku, n_prove_dsr)),
            "sortino": r2(float(r.mean()) * TD / (dsd * np.sqrt(TD))) if dsd > 0 else None,
            "calmar": r2(g / abs(mdd)) if mdd < 0 else None,
            "mar": r2(g / abs(mdd)) if mdd < 0 else None,
            "sterling": r2(sterling),
            "burke": r2(burke),
            "martin_ulcer_ratio": r2(g / ui) if ui > 0 else None,
            "pain_ratio": r2(g / pain_index(nav)) if pain_index(nav) > 0 else None,
            "omega": r2(omega(r)),
            "kappa3": r2(kappa(r, 3)),
            "recovery_factor": r2(float(nav.iloc[-1] / nav.iloc[0] - 1) / abs(mdd)) if mdd < 0 else None,
            "rendimento_per_unita_dd": r2(g / abs(mdd)) if mdd < 0 else None,
        },
        "distribuzione": {
            "asimmetria_giornaliera": r2(sk),
            "curtosi_eccesso_giornaliera": r2(ku),
            "asimmetria_mensile": r2(float(stats.skew(mensili))) if len(mensili) >= 12 else None,
            "curtosi_eccesso_mensile": r2(float(stats.kurtosis(mensili))) if len(mensili) >= 12 else None,
            "jarque_bera": r2(float(jb.statistic)),
            "jarque_bera_p": r4(float(jb.pvalue)),
            "shapiro_p": r4(float(sw.pvalue)),
            "normalita_rifiutata": bool(jb.pvalue < 0.05),
            "hurst": r2(hurst(r)),
            "ljung_box": ljung_box(r),
            "istogramma": None,   # riempito sotto
            "qq": None,
        },
        "sotto_acqua": tempo_sott_acqua(nav),
        "episodi_drawdown": epis,
        "cono_volatilita": cono_volatilita(r),
        "finestre_peggiori": finestre_peggiori(nav),
        "bootstrap": bootstrap(r),
        "decomposizione_rischio": decomposizione_rischio(valori, float(nav.iloc[-1])),
        "stagionalita": stagionalita(nav),
        "trimestrali": trimestrali(nav),
        "regimi": regimi(nav, next(iter(benchmark.values())) if benchmark else None),
    }

    # istogramma dei rendimenti giornalieri + curva normale di confronto
    conteggi, bordi = np.histogram(r.values, bins=41)
    centri = (bordi[:-1] + bordi[1:]) / 2
    mu, sd = float(r.mean()), float(r.std(ddof=1))
    dens = stats.norm.pdf(centri, mu, sd) * len(r) * (bordi[1] - bordi[0])
    stat["distribuzione"]["istogramma"] = {
        "centri_pct": [round(float(c) * 100, 3) for c in centri],
        "conteggi": [int(c) for c in conteggi],
        "normale": [round(float(d), 2) for d in dens],
        "media_pct": pct(mu, 3), "sigma_pct": pct(sd, 3),
    }
    # QQ plot contro la normale (campionato per leggibilita')
    oss = np.sort(r.values)
    teo = stats.norm.ppf((np.arange(len(oss)) + 0.5) / len(oss), mu, sd)
    passo = max(1, len(oss) // 200)
    stat["distribuzione"]["qq"] = [[round(float(t) * 100, 3), round(float(o) * 100, 3)]
                                   for t, o in zip(teo[::passo], oss[::passo])]

    # metriche relative a ciascun benchmark
    stat["benchmark"] = {k: blocco_benchmark(nav, v, rf) for k, v in benchmark.items()}
    stat["benchmark"] = {k: v for k, v in stat["benchmark"].items() if v}
    return stat


# --------------------------------------------------------------- serie rolling
def serie_rolling(nav: pd.Series, benchmark: dict[str, pd.Series],
                  rf: float = 0.0) -> dict:
    r = _r(nav)
    mensili = nav.resample("ME").last().pct_change().dropna()
    out: dict = {}

    def sett(s: pd.Series, d=2):
        s = s.resample("W-FRI").last().dropna()
        return [[str(k.date()), round(float(v), d)] for k, v in s.items() if np.isfinite(v)]

    for w in (30, 60, 90, 252):
        v = (r.rolling(w).std(ddof=1) * np.sqrt(TD) * 100).dropna()
        if len(v):
            out[f"vol_{w}gg"] = sett(v)
    out["vol_ewma"] = sett((ewma_vol(r) * 100).dropna())

    for w in (126, 252):
        m = r.rolling(w).mean() * TD - rf
        s = r.rolling(w).std(ddof=1) * np.sqrt(TD)
        v = (m / s).replace([np.inf, -np.inf], np.nan).dropna()
        if len(v):
            out[f"sharpe_{w}gg"] = sett(v)

    dsd_roll = r.rolling(252).apply(lambda x: downside_dev(pd.Series(x)) * np.sqrt(TD), raw=False)
    v = ((r.rolling(252).mean() * TD - rf) / dsd_roll).replace([np.inf, -np.inf], np.nan).dropna()
    if len(v):
        out["sortino_252gg"] = sett(v)

    # rolling 12 mesi (passo mensile) e 6 mesi
    for n, k in ((12, "rolling12m"), (6, "rolling6m")):
        if len(mensili) >= n:
            s = (1 + mensili).rolling(n).apply(np.prod, raw=True).dropna() - 1
            out[k] = [[str(i.date())[:7], round(float(v) * 100, 2)] for i, v in s.items()]

    # beta e correlazione mobili contro il benchmark principale
    for nome, b in benchmark.items():
        df = pd.concat([r.rename("p"), _r(b).rename("b")], axis=1).dropna()
        if len(df) < 150:
            continue
        cov = df["p"].rolling(126).cov(df["b"])
        var = df["b"].rolling(126).var()
        beta = (cov / var).dropna()
        corr = df["p"].rolling(126).corr(df["b"]).dropna()
        if len(beta):
            out[f"beta_126gg__{nome}"] = sett(beta)
            out[f"corr_126gg__{nome}"] = sett(corr)
        # extra-rendimento cumulato
        cum = ((1 + df["p"]).cumprod() / (1 + df["b"]).cumprod() - 1) * 100
        out[f"extra_cum__{nome}"] = sett(cum)
    return out


# --------------------------------------------------- stagionalita' e regimi
MESI_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"]


def stagionalita(nav: pd.Series) -> list[dict]:
    """Rendimento medio e mediano per mese solare (campione piccolo: indicativo)."""
    m = nav.resample("ME").last().pct_change().dropna()
    out = []
    for i in range(12):
        v = m[m.index.month == i + 1]
        out.append({
            "mese": MESI_IT[i], "n": int(len(v)),
            "medio_pct": pct(float(v.mean())) if len(v) else None,
            "mediano_pct": pct(float(v.median())) if len(v) else None,
            "positivi_pct": pct(float((v > 0).mean())) if len(v) else None,
        })
    return out


def trimestrali(nav: pd.Series) -> list[dict]:
    q = nav.resample("QE").last().pct_change().dropna()
    return [{"periodo": f"{i.year} T{i.quarter}", "ret_pct": pct(float(v))}
            for i, v in q.items()]


def regimi(nav: pd.Series, bench: pd.Series | None) -> dict:
    """Comportamento del portafoglio per regime di volatilita' (quartili della
    vol realizzata a 21 giorni) e nei giorni di mercato al rialzo/ribasso."""
    r = _r(nav)
    vol21 = (r.rolling(21).std(ddof=1) * np.sqrt(TD)).dropna()
    rr = r.reindex(vol21.index)
    q = vol21.quantile([0.25, 0.5, 0.75]).values
    etich = ["vol bassa (Q1)", "vol medio-bassa (Q2)", "vol medio-alta (Q3)", "vol alta (Q4)"]
    tagli = [(-np.inf, q[0]), (q[0], q[1]), (q[1], q[2]), (q[2], np.inf)]
    fasce = []
    for nome, (lo, hi) in zip(etich, tagli):
        m = (vol21 > lo) & (vol21 <= hi)
        v = rr[m]
        if not len(v):
            continue
        fasce.append({
            "regime": nome, "giorni": int(len(v)),
            "vol_media_pct": pct(float(vol21[m].mean())),
            "rend_ann_pct": pct(float(v.mean()) * TD),
            "giorni_positivi_pct": pct(float((v > 0).mean())),
            "peggior_giorno_pct": pct(float(v.min())),
        })
    out = {"volatilita": fasce}
    if bench is not None:
        b = _r(bench)
        df = pd.concat([r.rename("p"), b.rename("b")], axis=1).dropna()
        for nome, m in (("mercato su", df["b"] > 0), ("mercato giu", df["b"] < 0)):
            v, w = df["p"][m], df["b"][m]
            out.setdefault("mercato", []).append({
                "fase": nome, "giorni": int(m.sum()),
                "portafoglio_ann_pct": pct(float(v.mean()) * TD),
                "benchmark_ann_pct": pct(float(w.mean()) * TD),
                "cattura_pct": pct(float(v.mean() / w.mean())) if w.mean() != 0 else None,
            })
    return out
