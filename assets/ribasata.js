/* ribasata.js — pagina di un singolo portafoglio in punti indice (base 100 alla
   data iniziale scelta). Nessun importo, nessuna quantità, nessun prezzo: solo
   grandezze relative. Ogni metrica è ricalcolata nel browser sul periodo
   selezionato, non ritagliata da un calcolo fatto sull'intera storia. */
"use strict";

let S=null, ALTRO=null;
const PRESET=[["max","Tutto"],["3a","3 anni"],["2a","2 anni"],["1a","1 anno"],
              ["ytd","Da inizio anno"],["6m","6 mesi"],["3m","3 mesi"]];

const idxDi = (d, def) => { const i=S.date.findIndex(x=>x>=d); return i<0?def:i; };

function intervallo(){
  const h=new URLSearchParams(location.hash.slice(1));
  const fine=S.date.length-1;
  let a=h.get("da"), b=h.get("a");
  const pre=h.get("p")||(a?null:"max");
  if(pre){
    const ultimo=S.date[fine], t=new Date(ultimo+"T00:00:00Z");
    if(pre==="max") a=S.date[0];
    else if(pre==="ytd") a=ultimo.slice(0,4)+"-01-01";
    else{ const n=parseInt(pre), u=pre.slice(-1);
      if(u==="a") t.setUTCFullYear(t.getUTCFullYear()-n); else t.setUTCMonth(t.getUTCMonth()-n);
      a=t.toISOString().slice(0,10); }
  }
  let i=Math.max(0, idxDi(a||S.date[0], 0));
  let j=b ? Math.min(fine, Math.max(i+1, idxDi(b, fine))) : fine;
  if(j-i<25){ j=Math.min(fine, i+25); if(j-i<25) i=Math.max(0, j-25); }  // minimo tecnico
  return {i, j, preset:pre};
}

/* ------------------------------------------------------- serie ritagliate */
function ritaglia(i, j){
  const n=S.nav[i];
  const date=S.date.slice(i, j+1);
  const nav=S.nav.slice(i, j+1).map(v=>v/n*100);
  const comp={}, etich=S.etichette;
  for(const k in S.componenti) comp[k]=S.componenti[k].slice(i, j+1).map(v=>v/n*100);
  const bench={};
  for(const k in S.benchmark){ const b=S.benchmark[k], b0=b[i];
    bench[k]=b.slice(i, j+1).map(v=>v/b0*100); }
  return {date, nav, comp, bench, etich};
}

/* --------------------------------------------------------------- pannello */
function selettore(sel){
  const fine=S.date.length-1;
  return `<div class="panel" style="margin-bottom:18px">
    <h4>Periodo di analisi</h4>
    <p class="cap">Tutte le metriche, i grafici e le tabelle qui sotto sono ricalcolati
      su questo intervallo; l'indice riparte da 100 alla data iniziale.</p>
    <div class="periodo">
      <div class="presets">${PRESET.map(([k,t])=>
        `<button data-p="${k}" class="${sel.preset===k?"on":""}">${t}</button>`).join("")}</div>
      <label>Da <input type="date" id="da" value="${S.date[sel.i]}"
        min="${S.date[0]}" max="${S.date[fine]}"></label>
      <label>A <input type="date" id="a" value="${S.date[sel.j]}"
        min="${S.date[0]}" max="${S.date[fine]}"></label>
      <button id="applica" class="primario">Applica</button>
      <span class="cap" id="conteggio"></span>
    </div></div>`;
}

function aggancia(){
  document.querySelectorAll(".presets button").forEach(b=>b.addEventListener("click",()=>{
    location.hash="p="+b.dataset.p; disegna(); }));
  const go=()=>{ const da=document.getElementById("da").value,
                       a=document.getElementById("a").value;
    if(!da||!a) return;
    location.hash=`da=${da}&a=${a}`; disegna(); };
  document.getElementById("applica").addEventListener("click", go);
  ["da","a"].forEach(k=>document.getElementById(k).addEventListener("keydown",
    e=>{ if(e.key==="Enter") go(); }));
}

/* ----------------------------------------------------------------- render */
function disegna(){
  const sel=intervallo();
  const R=ritaglia(sel.i, sel.j);
  const A=Q.analizza(R.date, R.nav, {rf:0, nProve:6});
  const nomi=Object.keys(R.comp);
  const DR=Q.decomposizione(R.comp, nomi, R.nav[R.nav.length-1]);
  const B={}; for(const k in R.bench){ const b=Q.vsBenchmark(R.nav, R.bench[k], 0);
    if(b){ b.cagr_bench_pct=(Math.pow(R.bench[k][R.bench[k].length-1]/100,
      1/Math.max(A.campione.anni,1e-9))-1)*100; B[k]=b; } }
  const ROLL=Q.rolling(R.date, R.nav, R.bench, 0);
  const BS=Q.bootstrap(Q.rendimenti(R.nav));
  const CORR=Q.correlazioni(R.comp, nomi);

  const app=document.getElementById("app");
  app.innerHTML=selettore(sel);
  aggancia();
  document.getElementById("conteggio").textContent =
    `${A.campione.oss_giornaliere} giorni di borsa · ${A.campione.oss_mensili} mesi · ${nf(A.campione.anni,2)} anni`;

  const K=A.rischio, RD=A.rendimento, E=A.efficienza, D=A.distribuzione, C=A.campione;
  const add=h=>app.insertAdjacentHTML("beforeend",h);

  add(`<div class="tiles">
    ${tabB("Rendimento del periodo", pcs(RD.totale_pct), cls(RD.totale_pct), C.dal+" → "+C.al)}
    ${tabB("Indice finale", nf(R.nav[R.nav.length-1],1), "", "base 100 al "+C.dal)}
    ${tabB("CAGR", pcs(RD.cagr_pct), cls(RD.cagr_pct), "su "+nf(C.anni,2)+" anni")}
    ${tabB("Volatilità annua", pc(K.vol_ann_giornaliera_pct), "", "rendimenti giornalieri")}
    ${tabB("Sharpe", nf(E.sharpe), "", "IC 95% "+nf(E.sharpe_ic95_min)+" … "+nf(E.sharpe_ic95_max))}
    ${tabB("Max drawdown", pc(K.max_drawdown_pct), "down", K.max_dd_data)}
  </div>`);

  const corto = C.oss_giornaliere < 250;
  add(`<div class="flag">
    <b>Quanto vale statisticamente questo periodo.</b> ${C.oss_giornaliere} giorni di borsa
    (${nf(C.anni,2)} anni, ${C.oss_mensili} mesi).
    Sharpe <b>${nf(E.sharpe)}</b>, intervallo di confidenza al 95% da <b>${nf(E.sharpe_ic95_min)}</b>
    a <b>${nf(E.sharpe_ic95_max)}</b>${E.sharpe_ic95_min<0?" — <b>comprende lo zero</b>":""}.
    Sharpe probabilistico contro zero ${pc(E.psr_vs_zero_pct,1)}; deflazionato per la selezione
    fra ${C.n_prove_dsr} varianti <b>${pc(E.dsr_pct,1)}</b>${E.dsr_pct<95?" (sotto il 95%)":""}.
    ${corto?"<b>Attenzione</b>: accorciando la finestra l'errore di stima cresce in fretta — "+
      "su meno di un anno di dati Sharpe, alfa e code non sono stimabili in modo affidabile. ":""}
    Tasso privo di rischio assunto pari a ${pc(C.rf_dichiarato_pct,1)}.
  </div>`);

  /* andamento */
  add(`<h3 class="sec">Andamento</h3>`);
  add(pannello(`Indice del portafoglio, base 100 al ${C.dal}`,
    "Benchmark ribasati alla stessa data. Confronto puramente relativo.", "g_nav"));
  lineChart(document.getElementById("g_nav"),
    [{name:S.label, data:zip(R.date,R.nav), color:"var(--s1)", w:2.4}].concat(
      Object.keys(R.bench).map((n,i)=>({name:n, data:zip(R.date,R.bench[n]),
        color:COL[(i+1)%COL.length], w:1.5, op:.85}))),
    {fmt:v=>nf(v,0), tfmt:v=>nf(v,1), h:300});

  add(pannello("Drawdown dal massimo del periodo",
    `Massimo ${pc(K.max_drawdown_pct)} il ${K.max_dd_data}; sotto il proprio massimo il
     ${pc(A.sotto_acqua.quota_giorni_sotto_massimo_pct,1)} dei giorni.`, "g_dd"));
  areaChart(document.getElementById("g_dd"), sub(zip(R.date, Q.ddSerie(R.nav).map(v=>v*100))));

  /* periodi */
  add(`<h3 class="sec">Rendimenti per periodo</h3>`);
  const annuali=Q.rendPeriodo(R.date, R.nav, "Y");
  add(`<div class="grid2">
    ${pannello("Rendimenti per anno solare",
      "Il primo e l'ultimo anno del periodo sono parziali.", "g_ann")}
    ${pannello("Rendimenti trimestrali","","g_tri")}</div>`);
  barChart(document.getElementById("g_ann"),
    annuali.map(x=>[x.k, x.v*100]), {valori:true, bw:88, h:230});
  barChart(document.getElementById("g_tri"),
    A.trimestrali.map(x=>[x.k, x.v*100]), {h:230, bw:44, b:32});
  add(pannello("Rendimenti mensili","","g_mens"));
  barChart(document.getElementById("g_mens"),
    A.mensili.map(x=>[x.k.slice(5)+"/"+x.k.slice(2,4), x.v*100]), {h:240, bw:26});
  if(ROLL.rolling12m){
    add(`<div class="grid2">${pannello("Rolling 12 mesi","","g_r12")}
      ${pannello("Rolling 6 mesi","","g_r6")}</div>`);
    barChart(document.getElementById("g_r12"),
      ROLL.rolling12m.map(x=>[x[0].slice(5)+"/"+x[0].slice(2,4), x[1]]), {h:230, bw:30});
    barChart(document.getElementById("g_r6"),
      ROLL.rolling6m.map(x=>[x[0].slice(5)+"/"+x[0].slice(2,4), x[1]]), {h:230, bw:24});
  }

  /* volatilità */
  add(`<h3 class="sec">Volatilità e rischio nel tempo</h3>`);
  const sv=[];
  [["vol_30gg","vol 30 gg"],["vol_60gg","vol 60 gg"],["vol_90gg","vol 90 gg"],
   ["vol_252gg","vol 252 gg"],["vol_ewma","EWMA λ=0,94"]].forEach(([k,n],i)=>{
     if(ROLL[k]) sv.push({name:n, data:ROLL[k], color:COL[i%COL.length], w:k==="vol_ewma"?2.2:1.6});});
  if(sv.length){
    add(pannello("Volatilità realizzata mobile (annualizzata)",
      `Corrente: 30 gg ${pc(K.vol_30gg_corrente_pct)} · 90 gg ${pc(K.vol_90gg_corrente_pct)} ·
       EWMA ${pc(K.vol_ewma_corrente_pct)} · intero periodo ${pc(K.vol_ann_giornaliera_pct)}.`, "g_vol"));
    lineChart(document.getElementById("g_vol"), sv, {fmt:v=>nf(v,0)+"%", tfmt:v=>nf(v,1)+"%", h:280, y0:0});
  }
  if(A.cono_volatilita.length){
    add(pannello("Cono di volatilità",
      "Distribuzione della volatilità realizzata nel periodo; il punto arancione è il valore corrente.","g_cono"));
    conoVol(document.getElementById("g_cono"), A.cono_volatilita);
  }
  const ss=[];
  [["sharpe_126gg","Sharpe 126 gg"],["sharpe_252gg","Sharpe 252 gg"],["sortino_252gg","Sortino 252 gg"]]
    .forEach(([k,n],i)=>{ if(ROLL[k]) ss.push({name:n, data:ROLL[k], color:COL[i%COL.length], w:1.9});});
  if(ss.length){
    add(pannello("Efficienza mobile","Sharpe e Sortino su finestra mobile, annualizzati, rf 0%.","g_sh"));
    lineChart(document.getElementById("g_sh"), ss, {fmt:v=>nf(v,1), tfmt:v=>nf(v,2), h:250, zero:true});
  }

  /* benchmark */
  const nb=Object.keys(B);
  if(nb.length){
    add(`<h3 class="sec">Confronto con i benchmark</h3>`);
    add(tabella([{t:"Benchmark"},{t:"Perf. periodo",n:1},{t:"CAGR",n:1},{t:"Extra rend.",n:1},
      {t:"Beta",n:1},{t:"Alfa ann.",n:1},{t:"Corr.",n:1},{t:"R²",n:1},{t:"Tracking error",n:1},
      {t:"Info ratio",n:1},{t:"Cattura ↑",n:1},{t:"Cattura ↓",n:1},{t:"β ↑",n:1},{t:"β ↓",n:1},{t:"M²",n:1}],
      nb.map(n=>{const b=B[n]; return `<tr><td><b>${n}</b></td>
        <td class="num">${pcs(b.perf_bench_pct)}</td><td class="num">${pcs(b.cagr_bench_pct)}</td>
        <td class="num ${cls(b.extra_rendimento_pct)}">${pcs(b.extra_rendimento_pct)}</td>
        <td class="num">${nf(b.beta)}</td><td class="num ${cls(b.alpha_ann_pct)}">${pcs(b.alpha_ann_pct)}</td>
        <td class="num">${nf(b.correlazione)}</td><td class="num">${nf(b.r_quadro)}</td>
        <td class="num">${pc(b.tracking_error_pct,1)}</td><td class="num">${nf(b.information_ratio)}</td>
        <td class="num">${pc(b.up_capture_pct,0)}</td><td class="num">${pc(b.down_capture_pct,0)}</td>
        <td class="num">${nf(b.beta_up)}</td><td class="num">${nf(b.beta_down)}</td>
        <td class="num">${pc(b.m2_ann_pct,1)}</td></tr>`;}).join(""),
      "Alfa di Jensen annualizzata da regressione sui rendimenti giornalieri del periodo selezionato."));
    const sE=nb.map((n,i)=>({name:"vs "+n, data:ROLL["extra_cum__"+n]||[], color:COL[i%COL.length], w:1.8}))
               .filter(x=>x.data.length);
    if(sE.length){
      add(pannello("Extra-rendimento cumulato","Sopra lo zero il portafoglio è avanti sul benchmark.","g_ex"));
      lineChart(document.getElementById("g_ex"), sE, {fmt:v=>nf(v,0)+"%", tfmt:v=>pcs(v,1), h:260, zero:true});
    }
    const sB=[], sC=[];
    nb.forEach((n,i)=>{ if(ROLL["beta_126gg__"+n]) sB.push({name:"β vs "+n, data:ROLL["beta_126gg__"+n], color:COL[i%COL.length], w:1.8});
      if(ROLL["corr_126gg__"+n]) sC.push({name:"ρ vs "+n, data:ROLL["corr_126gg__"+n], color:COL[i%COL.length], w:1.8});});
    if(sB.length){
      add(`<div class="grid2">${pannello("Beta mobile a 126 giorni","","g_beta")}
        ${pannello("Correlazione mobile a 126 giorni","","g_corr")}</div>`);
      lineChart(document.getElementById("g_beta"), sB, {fmt:v=>nf(v,1), tfmt:v=>nf(v,2), h:240, zero:true});
      lineChart(document.getElementById("g_corr"), sC, {fmt:v=>nf(v,1), tfmt:v=>nf(v,2), h:240, y0:-1, y1:1});
    }
    const m=B[nb[0]].mercato;
    add(tabella([{t:"Fase di mercato ("+nb[0]+")"},{t:"Giorni",n:1},{t:"Portafoglio ann.",n:1},
      {t:"Benchmark ann.",n:1},{t:"Cattura",n:1}],
      m.map(r=>`<tr><td>${r.fase==="mercato su"?"Giorni di rialzo del benchmark":"Giorni di ribasso del benchmark"}</td>
        <td class="num">${r.giorni}</td>
        <td class="num ${cls(r.portafoglio_ann_pct)}">${pcs(r.portafoglio_ann_pct,1)}</td>
        <td class="num ${cls(r.benchmark_ann_pct)}">${pcs(r.benchmark_ann_pct,1)}</td>
        <td class="num">${pc(r.cattura_pct,1)}</td></tr>`).join(""),
      "Rendimenti annualizzati condizionati al segno del benchmark: tassi teorici, non realizzati."));
  }

  /* metriche */
  add(`<h3 class="sec">Metriche complete del periodo</h3>`);
  const gr=(t,r)=>`<div class="panel"><h4>${t}</h4><div class="kv">${
    r.filter(x=>x[1]!=="—").map(x=>`<div>${x[0]}</div><div class="${x[2]||""}">${x[1]}</div>`).join("")}</div></div>`;
  add(`<div class="grid2">
    ${gr("Rendimento",[
      ["Rendimento del periodo", pcs(RD.totale_pct), cls(RD.totale_pct)],
      ["CAGR", pcs(RD.cagr_pct), cls(RD.cagr_pct)],
      ["Media annua aritmetica", pcs(RD.media_ann_aritmetica_pct)],
      ["Miglior giorno", pcs(RD.miglior_giorno_pct),"up"],
      ["Peggior giorno", pcs(RD.peggior_giorno_pct),"down"],
      ["Miglior settimana", pcs(RD.miglior_settimana_pct),"up"],
      ["Peggior settimana", pcs(RD.peggior_settimana_pct),"down"],
      ["Miglior mese", pcs(RD.miglior_mese_pct),"up"],
      ["Peggior mese", pcs(RD.peggior_mese_pct),"down"],
      ["Miglior trimestre", pcs(RD.miglior_trimestre_pct),"up"],
      ["Peggior trimestre", pcs(RD.peggior_trimestre_pct),"down"],
      ["Giorni positivi", pc(RD.giorni_positivi_pct,1)],
      ["Settimane positive", pc(RD.settimane_positive_pct,1)],
      ["Mesi positivi", pc(RD.mesi_positivi_pct,0)+" su "+C.oss_mensili],
      ["Trimestri positivi", pc(RD.trimestri_positivi_pct,1)],
      ["Guadagno medio nei giorni positivi", pcs(RD.guadagno_medio_giorno_pct)],
      ["Perdita media nei giorni negativi", pcs(RD.perdita_media_giorno_pct)],
      ["Rapporto vincite/perdite", nf(RD.rapporto_vincite_perdite)],
      ["Profit factor", nf(RD.profit_factor)],
      ["Gain-to-pain (mensile)", nf(RD.gain_to_pain_mensile)],
      ["Serie positiva più lunga", RD.serie_positiva_max_gg+" giorni"],
      ["Serie negativa più lunga", RD.serie_negativa_max_gg+" giorni"]])}
    ${gr("Rischio e code",[
      ["Volatilità annua (giornaliera)", pc(K.vol_ann_giornaliera_pct)],
      ["Volatilità annua (settimanale)", pc(K.vol_ann_settimanale_pct)],
      ["Volatilità annua (mensile)", pc(K.vol_ann_mensile_pct)],
      ["Volatilità EWMA corrente", pc(K.vol_ewma_corrente_pct)],
      ["Volatilità 30 giorni", pc(K.vol_30gg_corrente_pct)],
      ["Volatilità 90 giorni", pc(K.vol_90gg_corrente_pct)],
      ["Downside deviation annua", pc(K.downside_deviation_pct)],
      ["Massimo drawdown", pc(K.max_drawdown_pct),"down"],
      ["Ulcer index", pc(K.ulcer_index_pct)],
      ["Pain index", pc(K.pain_index_pct)],
      ["VaR 95% 1 giorno — storico", pc(K.var95_1g_hist_pct)],
      ["VaR 95% 1 giorno — parametrico", pc(K.var95_1g_param_pct)],
      ["VaR 95% 1 giorno — Cornish-Fisher", pc(K.var95_1g_cornish_fisher_pct)],
      ["CVaR 95% 1 giorno", pc(K.cvar95_1g_pct)],
      ["VaR 99% 1 giorno — storico", pc(K.var99_1g_hist_pct)],
      ["VaR 99% 1 giorno — Cornish-Fisher", pc(K.var99_1g_cornish_fisher_pct)],
      ["CVaR 99% 1 giorno", pc(K.cvar99_1g_pct)],
      ["VaR 95% 1 settimana", pc(K.var95_1sett_pct)],
      ["VaR 95% 1 mese", pc(K.var95_1mese_pct)],
      ["VaR 99% 1 mese", pc(K.var99_1mese_pct)],
      ["VaR 95% 1 anno", pc(K.var95_1anno_pct)],
      ["VaR 95% mensile — storico", pc(K.var95_1mese_storico_pct)],
      ["CVaR 95% mensile — storico", pc(K.cvar95_1mese_storico_pct)],
      ["Tail ratio", nf(K.tail_ratio)],
      ["Common sense ratio", nf(K.common_sense_ratio)]])}
    ${gr("Efficienza (rf = "+pc(C.rf_dichiarato_pct,1)+")",[
      ["Sharpe", nf(E.sharpe)],
      ["Errore standard dello Sharpe", nf(E.sharpe_errore_std)],
      ["Sharpe — intervallo 95%", nf(E.sharpe_ic95_min)+" … "+nf(E.sharpe_ic95_max)],
      ["Sharpe probabilistico contro 0", pc(E.psr_vs_zero_pct,1)],
      ["Sharpe deflazionato (DSR)", pc(E.dsr_pct,1), E.dsr_pct<95?"warnc":""],
      ["Sortino", nf(E.sortino)],
      ["Calmar / MAR", nf(E.calmar)],
      ["Sterling", nf(E.sterling)],
      ["Burke", nf(E.burke)],
      ["Martin (Ulcer performance index)", nf(E.martin_ulcer_ratio)],
      ["Pain ratio", nf(E.pain_ratio)],
      ["Omega (soglia 0)", nf(E.omega)],
      ["Kappa 3", nf(E.kappa3)],
      ["Recovery factor", nf(E.recovery_factor)]])}
    ${gr("Forma della distribuzione",[
      ["Asimmetria giornaliera", nf(D.asimmetria_giornaliera)],
      ["Curtosi in eccesso giornaliera", nf(D.curtosi_eccesso_giornaliera)],
      ["Asimmetria mensile", nf(D.asimmetria_mensile)],
      ["Curtosi in eccesso mensile", nf(D.curtosi_eccesso_mensile)],
      ["Jarque-Bera", nf(D.jarque_bera)+" (p "+nf(D.jarque_bera_p,4)+")"],
      ["Normalità", D.normalita_rifiutata?"rifiutata (code spesse)":"non rifiutata",
       D.normalita_rifiutata?"warnc":""],
      ["Esponente di Hurst", nf(D.hurst)],
      ["Ljung-Box Q ("+D.ljung_box.lags+" ritardi)", nf(D.ljung_box.Q)+" (p "+nf(D.ljung_box.p_value,4)+")"],
      ["Autocorrelazione a 1 giorno", nf(D.ljung_box.acf1,3)],
      ["Osservazioni giornaliere", String(C.oss_giornaliere)],
      ["Osservazioni mensili", String(C.oss_mensili)],
      ["Periodo", C.dal+" → "+C.al]])}
  </div>`);

  add(`<div class="grid2">
    ${pannello("Distribuzione dei rendimenti giornalieri",
      `Media ${pcs(D.istogramma.media_pct,3)}, σ ${pc(D.istogramma.sigma_pct,3)}.`,"g_hist")}
    ${pannello("Quantili osservati contro normale (QQ)","","g_qq")}</div>`);
  histChart(document.getElementById("g_hist"), D.istogramma);
  scatter(document.getElementById("g_qq"), D.qq, {xl:"quantili teorici della normale (%)", h:250});

  /* drawdown e stress */
  add(`<h3 class="sec">Drawdown, tempo sotto acqua e stress</h3>`);
  add(`<div class="tiles">
    ${tab("Giorni sotto il massimo", pc(A.sotto_acqua.quota_giorni_sotto_massimo_pct,1))}
    ${tab("Drawdown medio", pc(A.sotto_acqua.dd_medio_pct))}
    ${tab("Durata media episodio", nf(A.sotto_acqua.durata_media_gg,0)+" gg")}
    ${tab("Durata massima", nf(A.sotto_acqua.durata_max_gg,0)+" gg")}
    ${tab("Episodi di drawdown", String(A.sotto_acqua.episodi_n))}
    ${tab("Ulcer index", pc(K.ulcer_index_pct))}</div>`);
  add(tabella([{t:"#"},{t:"Picco"},{t:"Minimo"},{t:"Recupero"},{t:"Profondità",n:1},
    {t:"Giorni di caduta",n:1},{t:"Giorni di recupero",n:1},{t:"Durata totale",n:1}],
    A.episodi_drawdown.map((e,i)=>`<tr><td>${i+1}</td><td>${e.picco}</td><td>${e.minimo}</td>
      <td>${e.recupero||"<i>in corso</i>"}</td><td class="num down">${pc(e.profondita_pct)}</td>
      <td class="num">${e.giorni_caduta}</td><td class="num">${e.giorni_recupero??"—"}</td>
      <td class="num">${e.giorni_totali}</td></tr>`).join(""),
    "Un episodio si chiude quando l'indice torna al massimo precedente <i>dentro il periodo selezionato</i>."));
  add(tabella([{t:"Finestra mobile"},{t:"Peggiore",n:1},{t:"Fine della peggiore"},{t:"Mediana",n:1},
    {t:"Migliore",n:1},{t:"Finestre negative",n:1}],
    A.finestre_peggiori.map(f=>`<tr><td>${f.giorni} giorni di borsa</td>
      <td class="num down">${pcs(f.peggiore_pct)}</td><td>${f.fine_peggiore}</td>
      <td class="num">${pcs(f.mediana_pct)}</td><td class="num up">${pcs(f.migliore_pct)}</td>
      <td class="num">${pc(f.quota_negative_pct,1)}</td></tr>`).join("")));
  if(A.regimi.volatilita.length) add(tabella(
    [{t:"Regime di volatilità"},{t:"Giorni",n:1},{t:"Vol. media",n:1},
     {t:"Rendimento annualizzato",n:1},{t:"Giorni positivi",n:1},{t:"Peggior giorno",n:1}],
    A.regimi.volatilita.map(r=>`<tr><td>${r.regime}</td><td class="num">${r.giorni}</td>
      <td class="num">${pc(r.vol_media_pct,1)}</td>
      <td class="num ${cls(r.rend_ann_pct)}">${pcs(r.rend_ann_pct,1)}</td>
      <td class="num">${pc(r.giorni_positivi_pct,1)}</td>
      <td class="num down">${pcs(r.peggior_giorno_pct)}</td></tr>`).join(""),
    "Quartili della volatilità realizzata a 21 giorni calcolati sul periodo selezionato."));

  /* composizione, solo in termini relativi */
  add(`<h3 class="sec">Composizione e attribuzione</h3>`);
  const L=R.nav.length-1;
  const righeH=nomi.map(k=>{
    const c=R.comp[k], e=R.etich[k];
    const w0=c[0]/R.nav[0]*100, w1=c[L]/R.nav[L]*100;
    const rp=(c[L]/c[0]-1)*100, contrib=(c[L]-c[0])/R.nav[0]*100;
    const rr=Q.rendimenti(c);
    return {k, e, w0, w1, rp, contrib, vol:Q.sd(rr)*Math.sqrt(252)*100,
            dd:Math.min(...Q.ddSerie(c))*100};
  });
  add(tabella([{t:"Strumento"},{t:"Ticker"},{t:"ISIN"},{t:"Classe"},{t:"Val."},
    {t:"Peso iniziale",n:1},{t:"Peso finale",n:1},{t:"Deriva",n:1},
    {t:"Rendimento nel periodo",n:1},{t:"Contributo p.p.",n:1},{t:"Vol. ann.",n:1},{t:"Max DD",n:1}],
    righeH.map(h=>`<tr><td>${h.e.nome}</td><td>${h.k}</td>
      <td style="font-size:11.5px;color:var(--muted)">${h.e.isin}</td>
      <td>${h.e.gruppo}</td><td>${h.e.ccy}</td>
      <td class="num">${pc(h.w0)}</td><td class="num">${pc(h.w1)}</td>
      <td class="num ${cls(h.w1-h.w0)}">${pcs(h.w1-h.w0)}</td>
      <td class="num ${cls(h.rp)}">${pcs(h.rp)}</td>
      <td class="num ${cls(h.contrib)}">${pcs(h.contrib)}</td>
      <td class="num">${pc(h.vol,1)}</td><td class="num down">${pc(h.dd,1)}</td></tr>`).join(""),
    "Rendimenti degli strumenti in "+S.base_currency+", effetto cambio incluso. Contributo in punti "+
    "percentuali sull'indice del portafoglio a inizio periodo. Nessun ribilanciamento: la deriva è "+
    "solo movimento di mercato. <b>Quantità, prezzi e importi non sono esposti</b>: la pagina lavora "+
    "esclusivamente in grandezze relative.", "wide"));

  if(DR){
    add(`<div class="tiles">
      ${tab("Volatilità del portafoglio", pc(DR.vol_portafoglio_pct))}
      ${tab("Somma delle volatilità singole", pc(DR.somma_vol_singole_pct))}
      ${tab("Beneficio di diversificazione", "−"+pc(DR.beneficio_diversificazione_pct),"up")}
      ${tab("Diversification ratio", nf(DR.diversification_ratio))}
      ${tab("Concentrazione (HHI)", nf(DR.hhi,3),"", "equivalente a "+nf(DR.n_equivalente_posizioni,1)+" posizioni pari peso")}
      ${tab("Numero effettivo di scommesse", nf(DR.numero_effettivo_scommesse),"", "su "+DR.posizioni_n+" posizioni")}
    </div>`);
    add(pannello("Peso contro quota del rischio","Le posizioni con la barra arancione più lunga di quella blu pesano sul rischio più che sul capitale.","g_rc"));
    barPair(document.getElementById("g_rc"), DR.componenti.map(c=>({k:c.nome, a:c.peso_pct, b:c.quota_rischio_pct})));
    add(tabella([{t:"Posizione"},{t:"Peso",n:1},{t:"Volatilità singola",n:1},{t:"Contributo alla vol.",n:1},
      {t:"Quota del rischio",n:1},{t:"VaR 95% componente",n:1},{t:"Beta al portafoglio",n:1}],
      DR.componenti.map(c=>`<tr><td>${c.nome}</td><td class="num">${pc(c.peso_pct)}</td>
        <td class="num">${pc(c.vol_singola_pct,1)}</td><td class="num">${pc(c.contrib_vol_pct)}</td>
        <td class="num"><b>${pc(c.quota_rischio_pct,1)}</b></td>
        <td class="num">${pc(c.var95_componente_pct)}</td>
        <td class="num">${nf(c.beta_al_portafoglio)}</td></tr>`).join(""),
      "Decomposizione di Euler: i contributi sommano alla volatilità del portafoglio, le quote al 100%."));
  }
  if(CORR){
    add(pannello("Correlazione fra le posizioni","Rendimenti giornalieri in "+S.base_currency+" nel periodo selezionato.","g_hm"));
    heatmap(document.getElementById("g_hm"), CORR.labels, CORR.matrix);
  }

  /* calendario */
  add(`<h3 class="sec">Calendario dei rendimenti</h3>`);
  const mm={};
  A.mensili.forEach(x=>{ const y=x.k.slice(0,4), m=+x.k.slice(5,7);
    (mm[y]=mm[y]||{})["m"+String(m).padStart(2,"0")]=x.v*100; });
  for(const y in mm){ let c=1; for(const k in mm[y]) if(k!=="tot") c*=1+mm[y][k]/100;
    mm[y].tot=(c-1)*100; }
  add(tabella([{t:"Anno"}].concat(MESI.map(m=>({t:m,n:1}))).concat([{t:"Anno",n:1}]),
    Object.keys(mm).sort().map(y=>`<tr><td><b>${y}</b></td>${
      MESI.map((_,i)=>{ const v=mm[y]["m"+String(i+1).padStart(2,"0")];
        return `<td class="num">${v===undefined?'<span style="color:var(--muted)">—</span>':
          `<span class="${cls(v)}">${pcs(v)}</span>`}</td>`;}).join("")
      }<td class="num"><b class="${cls(mm[y].tot)}">${pcs(mm[y].tot)}</b></td></tr>`).join(""),
    "Mesi compresi nel periodo selezionato; la colonna finale compone i soli mesi disponibili."));
  const stag=MESI.map((m,i)=>{ const v=A.mensili.filter(x=>+x.k.slice(5,7)===i+1).map(x=>x.v);
    return {m, n:v.length, medio:v.length?Q.mean(v)*100:null,
      pos:v.length?v.filter(x=>x>0).length/v.length*100:null};});
  add(tabella([{t:"Mese solare"},{t:"Osservazioni",n:1},{t:"Rendimento medio",n:1},{t:"Mesi positivi",n:1}],
    stag.map(s=>`<tr><td>${s.m}</td><td class="num">${s.n}</td>
      <td class="num ${cls(s.medio)}">${pcs(s.medio)}</td>
      <td class="num">${pc(s.pos,0)}</td></tr>`).join(""),
    "<b>Curiosità, non segnale</b>: con pochissime osservazioni per mese solare qualunque "+
    "differenza fra i mesi è indistinguibile dal caso."));

  /* proiezioni */
  if(BS){
    add(`<h3 class="sec">Proiezioni per ricampionamento</h3>`);
    add(pannello("Distribuzione dell'indice a 1, 3 e 5 anni",
      `Block bootstrap stazionario: ${n0(BS._meta.n_sim)} simulazioni da blocchi di ${BS._meta.blocco_gg}
       giorni pescati nel <b>periodo selezionato</b> (${BS._meta.oss_storiche} giorni).
       <b>Proiezione condizionata a quel periodo, non una previsione</b>: cambiando la finestra
       cambia la distribuzione, ed è esattamente il punto — serve a vedere quanto le conclusioni
       dipendono dal tratto di storia che si guarda.`, "g_fan"));
    fanChart(document.getElementById("g_fan"), BS);
    add(tabella([{t:"Orizzonte"},{t:"5°",n:1},{t:"25°",n:1},{t:"Mediana",n:1},{t:"75°",n:1},{t:"95°",n:1},
      {t:"P(perdita)",n:1},{t:"P(< −10%)",n:1},{t:"P(> +20%)",n:1},{t:"CVaR 95%",n:1},
      {t:"Drawdown mediano",n:1},{t:"Drawdown 95°",n:1}],
      Object.keys(BS).filter(k=>k!=="_meta").map(k=>{const b=BS[k];
        return `<tr><td><b>${k.replace("a"," "+(k[0]==="1"?"anno":"anni"))}</b></td>
        <td class="num ${cls(b.p05_pct)}">${pcs(b.p05_pct,1)}</td>
        <td class="num ${cls(b.p25_pct)}">${pcs(b.p25_pct,1)}</td>
        <td class="num ${cls(b.mediana_pct)}"><b>${pcs(b.mediana_pct,1)}</b></td>
        <td class="num ${cls(b.p75_pct)}">${pcs(b.p75_pct,1)}</td>
        <td class="num ${cls(b.p95_pct)}">${pcs(b.p95_pct,1)}</td>
        <td class="num">${pc(b.prob_perdita_pct,1)}</td>
        <td class="num">${pc(b.prob_sotto_meno10_pct,1)}</td>
        <td class="num">${pc(b.prob_sopra_piu20_pct,1)}</td>
        <td class="num down">${pcs(b.cvar95_finale_pct,1)}</td>
        <td class="num down">${pc(b.dd_atteso_mediano_pct,1)}</td>
        <td class="num down">${pc(b.dd_p95_pct,1)}</td></tr>`;}).join("")));
  }

  add(`<h3 class="sec">Metodologia</h3>
    <div class="panel"><p class="note">${S.methodology}</p>
    <p class="note" style="margin-top:10px"><b>Che cosa cambia in questa pagina.</b>
      Tutto è espresso in punti indice con base 100 alla data iniziale scelta: non compaiono
      quantità, prezzi di carico né importi. Le metriche non sono ritagliate da un calcolo fatto
      sull'intera storia: l'intero blocco statistico viene ricalcolato nel browser sui soli
      rendimenti del periodo selezionato, compresi drawdown, correlazioni, decomposizione del
      rischio e bootstrap. Il motore JavaScript è stato verificato contro quello Python della
      pagina principale su 159 metriche: le differenze residue restano sotto l'unità di
      arrotondamento.</p>
    <p class="note" style="margin-top:10px"><b>Limiti.</b> Rendimenti giornalieri semplici,
      252 giorni di borsa per anno, tasso privo di rischio ${pc(C.rf_dichiarato_pct,1)}, valori lordi
      senza commissioni né fiscalità. Accorciando il periodo la numerosità campionaria cala e
      l'incertezza su Sharpe, alfa e code cresce rapidamente: l'intervallo di confidenza dello
      Sharpe è riportato in cima proprio per rendere visibile questo effetto.</p></div>`);
}

const zip=(a,b)=>a.map((x,i)=>[x,b[i]]);
function sub(s, max=200){ if(s.length<=max) return s;
  const p=Math.ceil(s.length/max), o=[]; for(let i=0;i<s.length;i+=p) o.push(s[i]);
  if(o[o.length-1][0]!==s[s.length-1][0]) o.push(s[s.length-1]); return o; }

async function avvia(pid, altro){
  ALTRO=altro;
  S = await (await fetch(`data/serie_${pid}.json?v=${Date.now()}`)).json();
  document.title = S.label + " — indice base 100";
  document.getElementById("titolo").textContent = S.label;
  document.getElementById("sottotitolo").innerHTML =
    `Indice base 100 · ${S.base_currency} · inception ${S.inception} · dati al <b>${S.asof}</b>`;
  document.getElementById("piede").textContent = S.disclaimer;
  addEventListener("hashchange", disegna);
  disegna();
}
