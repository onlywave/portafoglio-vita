/* VITA 5M · investimento reale — costruzione del report dalla data/vita5m_reale.json */
const BN = ["S&P 500 TR (CHF)", "MSCI World TR (CHF)"];
const stato = s => {
  const k = (s||"").toUpperCase();
  const c = k==="OK"?"ok":(k.startsWith("ALLERTA")?"al":(k==="N.D."?"nd":"wa"));
  return `<span class="st ${c}">${s}</span>`;
};
const sez = (n,t,m="") => `<div class="sez"><span class="num">${n}</span><h2>${t}</h2>${m?`<span class="meta">${m}</span>`:""}</div>`;
const td = (v,c="num") => `<td class="${c}">${v}</td>`;
const dIT = s => s ? s.split("-").reverse().join(".") : "—";

async function avviaReale(){
  const d = await (await fetch("data/vita5m_reale.json",{cache:"no-store"})).json();
  const L = d.live, X = d.exante, C = d.costi;
  document.getElementById("meta").textContent =
    `Dati al ${dIT(d.asof)} · inception ${dIT(d.inception)} · aggiornato ${d.generato.replace("T"," ").slice(0,16)} UTC · base CHF`;
  const app = document.getElementById("app");
  const ex = X.pesi_correnti, et = X.pesi_obiettivo;
  const vsS = L.rend_twr_pct - L.bench_pct[BN[0]], vsW = L.rend_twr_pct - L.bench_pct[BN[1]];
  const allerteOn = d.allerte.filter(a=>a.stato==="ALLERTA");

  let h = `<div id="intra"></div>`;
  // ------------------------------------------------------------- 1. sintesi
  h += sez("01","Sintesi", `${n0(d.live.serie.date.length)} sedute dall'inception`);
  h += `<div class="tesi"><b>${pcs(L.rend_twr_pct)}</b> dall'inizio (rendimento ponderato nel tempo), contro
    <b>${pcs(L.bench_pct[BN[0]])}</b> dell'S&amp;P 500 e <b>${pcs(L.bench_pct[BN[1]])}</b> dell'MSCI World in CHF.
    Investito il <b>${pc(d.programma_investito_pct,1)}</b> del programma. Rischio atteso sui pesi correnti:
    volatilità <b>${pc(ex.vol_pct,1)}</b>, VaR 95% a 1 giorno <b>${pc(ex.var95_1d_pct,2)}</b>.
    ${allerteOn.length?`<b class="down">${allerteOn.length} allerta/e attive:</b> ${allerteOn.map(a=>a.controllo).join("; ")}.`
      :`<b class="up">Nessuna allerta attiva.</b>`}</div>`;
  h += `<div class="tiles">
    ${tabB("Rendimento TWR dall'inizio", pcs(L.rend_twr_pct), cls(L.rend_twr_pct), "chiusura su chiusura, al netto dei flussi")}
    ${tabB("Ultima seduta", pcs(L.rend_giorno_pct), cls(L.rend_giorno_pct), dIT(d.asof))}
    ${tab("Extra-rendimento vs S&P 500", pcs(vsS), cls(vsS), "punti percentuali")}
    ${tab("Extra-rendimento vs MSCI World", pcs(vsW), cls(vsW), "punti percentuali")}
    ${tab("Giorno di esecuzione", pcs(L.giorno_esecuzione_pct), cls(L.giorno_esecuzione_pct), "prezzo e cambio eseguiti → chiusura")}
    ${tab("Dal costo (inclusa esecuzione)", pcs(L.rend_dal_costo_pct), cls(L.rend_dal_costo_pct), "valore / costo − 1")}
    ${tab("Drawdown corrente", pc(L.serie.drawdown.at(-1),2), cls(L.serie.drawdown.at(-1)))}
    ${tab("Volatilità 20 sedute", L.vol20_pct==null?"n.d.":pc(L.vol20_pct,1), "", L.vol20_pct==null?"servono 20 sedute":"annualizzata")}
    ${tab("Programma investito", pc(d.programma_investito_pct,1), "", d.tranches.map(t=>t.id+": "+t.stato).join(" · "))}
    ${tab("TER ponderato", pc(C.ter_corrente_pct,3), "", "obiettivo "+pc(C.ter_obiettivo_pct,3)+" annuo")}
  </div>`;

  // -------------------------------------------------------------- 2. allerte
  h += sez("02","Allerte e soglie di rischio");
  h += tabella([{t:"Controllo"},{t:"Valore",n:1},{t:"Soglia",n:1},{t:"Stato"}],
    d.allerte.map(a=>`<tr><td>${a.controllo}</td>${td(a.valore==null?"—":nf(a.valore,2)+(a.unita==="pp"?" pp":"%"))}
      ${td((a.unita==="pp"?"≥ ":(a.soglia<0?"≤ ":(a.controllo.startsWith("Oro")?"> ":"≥ ")))+nf(a.soglia,1)+(a.unita==="pp"?" pp":"%"))}
      <td>${stato(a.stato)}</td></tr>`), "Lo scostamento dai pesi resta in allerta finché la linea FWRA non viene acquistata (tranche 2).", "rep");

  // ------------------------------------------------- 3. equity vs benchmark
  h += sez("03","Andamento dall'inizio contro i benchmark","base 100 alla chiusura del "+dIT(d.inception));
  h += pannello("VITA 5M contro S&P 500 e MSCI World, in CHF",
    "Rendimento ponderato nel tempo: gli acquisti delle tranche non contano come rendimento. Benchmark total return (CSPX, IWDA) convertiti in CHF ai cambi del giorno.","eqlive");
  if(L.relativo && Object.keys(L.relativo).length){
    h += tabella([{t:"Rispetto a"},{t:"Beta",n:1},{t:"Correlazione",n:1},{t:"Tracking error",n:1},{t:"Information ratio",n:1}],
      BN.map(k=>{const r=L.relativo[k]||{};return `<tr><td>${k}</td>${td(nf(r.beta))}${td(nf(r.correlazione))}${td(pc(r.tracking_error_pct,1))}${td(nf(r.info_ratio))}</tr>`;}),
      "Statistiche realizzate dall'inception.","rep");
  } else {
    h += `<div class="flag"><b>Statistiche realizzate non ancora significative.</b> Beta, tracking error e VaR storico compaiono da 20 sedute; nel frattempo vale il rischio ex ante della sezione 05.</div>`;
  }

  // ---------------------------------------------------------- 4. composizione
  h += sez("04","Composizione e contributi");
  h += tabella([{t:"ETF"},{t:"ISIN"},{t:"Valuta"},{t:"Peso",n:1},{t:"Obiettivo",n:1},{t:"Scost.",n:1},
      {t:"Dal carico",n:1},{t:"Contributo",n:1},{t:"TER",n:1},{t:"Quota di rischio",n:1}],
    d.linee.map(l=>`<tr><td>${l.ticker} <span class="note">${l.nome}</span></td><td>${l.isin}</td><td>${l.valuta}</td>
      ${td(pc(l.peso_pct,2))}${td(pc(l.target_pct,0))}<td class="num ${Math.abs(l.scostamento_pp)>=2?"down":""}">${(l.scostamento_pp>0?"+":"")+nf(l.scostamento_pp,2)} pp</td>
      <td class="num ${cls(l.rend_dal_carico_pct)}">${l.rend_dal_carico_pct==null?"—":pcs(l.rend_dal_carico_pct)}</td>
      ${td(l.contributo_pp==null?"—":(l.contributo_pp>0?"+":"")+nf(l.contributo_pp,2)+" pp")}${td(pc(l.ter_pct,2))}${td(pc(l.contrib_rischio_corr_pct,1))}</tr>`),
    "Dal carico: valore corrente sul costo d'acquisto in CHF, cambio d'esecuzione incluso. Contributo: utile o perdita della linea in punti del capitale investito. Quota di rischio: contributo di Euler alla volatilità ex ante.","rep");
  h += `<div class="grid2">${pannello("Pesi correnti contro obiettivo","Scostamento in punti percentuali.","scost")}
        ${pannello("Peso e quota di rischio","Pesi correnti: quanto del rischio totale viene da ogni linea.","rischio")}</div>`;

  // ------------------------------------------------------------ 5. rischio ex ante
  h += sez("05","Analisi del rischio ex ante", `storia ${dIT(X.finestra[0])} – ${dIT(X.finestra[1])}, rendimenti giornalieri in CHF`);
  const riga = (nome,s,rel) => `<tr><td>${nome}</td>${td(pc(s.cagr_pct,1))}${td(pc(s.vol_pct,1))}${td(nf(s.sharpe))}${td(pc(s.max_dd_pct,1))}
    ${td(pc(s.var95_1d_pct,2))}${td(pc(s.cvar95_1d_pct,2))}${td(pc(s.peggior_mese_pct,1))}
    ${td(rel?nf(rel.beta):"—")}${td(rel?pc(rel.tracking_error_pct,1):"—")}</tr>`;
  h += tabella([{t:"Su 3 anni"},{t:"Rend. annuo",n:1},{t:"Volatilità",n:1},{t:"Sharpe",n:1},{t:"Max drawdown",n:1},
      {t:"VaR 95% 1g",n:1},{t:"CVaR 95% 1g",n:1},{t:"Peggior mese",n:1},{t:"Beta vs MSCI W.",n:1},{t:"TE vs MSCI W.",n:1}],
    [riga("VITA 5M · pesi correnti",ex,ex.relativo[BN[1]]), riga("VITA 5M · pesi obiettivo",et,et.relativo[BN[1]]),
     riga(BN[0],X.benchmark[BN[0]],null), riga(BN[1],X.benchmark[BN[1]],null)],
    "Simulazione a pesi costanti sulla storia degli ETF detenuti (ribilanciamento giornaliero implicito). Sharpe con tasso privo di rischio CHF a zero. VaR e CVaR storici, espressi come perdita.","rep wide");
  h += pannello("Simulazione a 3 anni: pesi obiettivo contro benchmark","Base 100 all'inizio della finestra. Serve a leggere il profilo rischio/rendimento, non è una previsione.","eq3");
  h += `<div class="grid2">${pannello("Correlazioni fra le linee","Rendimenti giornalieri in CHF, 3 anni.","corr")}
        <div>${tabella([{t:"Scenario di stress"},{t:"Periodo"},{t:"VITA 5M",n:1},{t:"S&P 500",n:1},{t:"MSCI W.",n:1}],
          et.stress.map(s=>`<tr><td>${s.nome}</td><td>${dIT(s.da)} – ${dIT(s.a)}</td>
            <td class="num ${cls(s.portafoglio_pct)}">${pcs(s.portafoglio_pct,1)}</td>
            <td class="num ${cls(s[BN[0]])}">${pcs(s[BN[0]],1)}</td><td class="num ${cls(s[BN[1]])}">${pcs(s[BN[1]],1)}</td></tr>`),
          "Pesi obiettivo applicati agli episodi storici, in CHF.","rep")}
          <div class="panel"><h4>VaR a 1 mese (parametrico, 95%)</h4><div class="kv">
            <div>Pesi correnti</div><div>${pc(ex.var95_1m_param_pct,1)}</div>
            <div>Pesi obiettivo</div><div>${pc(et.var95_1m_param_pct,1)}</div></div></div></div></div>`;

  // ---------------------------------------------------------------- 6. costi
  h += sez("06","Costi: gestione e negoziazione");
  const t1 = C.tranche;
  h += `<div class="colonne">${tabella([{t:"Costo ricorrente"},{t:"Annuo",n:1}],
      d.linee.map(l=>`<tr><td>${l.ticker}</td>${td(pc(l.ter_pct,2))}</tr>`).join("")+
      `<tr><td>Ponderato, pesi correnti</td>${td("<b>"+pc(C.ter_corrente_pct,3)+"</b>")}</tr>
       <tr><td>Ponderato, pesi obiettivo</td>${td("<b>"+pc(C.ter_obiettivo_pct,3)+"</b>")}</tr>`,
      "TER dichiarati dagli emittenti; già dedotti dai prezzi degli ETF.","rep")}
    ${tabella([{t:"Negoziazione"},...t1.map(t=>({t:t.tranche+" · "+dIT(t.data),n:1}))],
      [["Commissioni (courtage)","courtage_pct"],["Tassa di bollo","bollo_pct"],["Ricarico sul cambio","ricarico_cambio_pct"],
       ["Spread denaro/lettera (stima)","spread_stimato_pct"],["Totale una tantum","totale_pct"]].map(([k,f])=>
        `<tr><td>${k}</td>${t1.map(t=>td(f==="totale_pct"?"<b>"+pc(t[f],2)+"</b>":pc(t[f],3))).join("")}</tr>`).join("")+
      `<tr><td>Fonte</td>${t1.map(t=>`<td class="num">${stato(t.fonte.startsWith("STIMA")?"STIMA":"CONTABILE")}</td>`).join("")}</tr>`,
      "In % del controvalore della tranche. "+(t1[0]?t1[0].nota:""),"rep")}</div>`;
  const anno1 = (t1.reduce((a,t)=>a+(t.totale_pct||0),0)/Math.max(t1.length,1)) + C.ter_obiettivo_pct;
  h += `<div class="flag"><b>Costo totale stimato del primo anno: circa ${pc(anno1,2)}</b> del capitale
    (negoziazione una tantum più TER). La voce più pesante è il ricarico sul cambio: negoziare il margine sulle prossime tranche è la leva principale.</div>`;

  // -------------------------------------------------------- 7. riconciliazione
  h += sez("07","Riconciliazione con gli eseguiti bancari");
  h += tabella([{t:"Voce"},{t:"Fonte"},{t:"Data"},{t:"Stato"}],
    d.riconciliazione.map(r=>`<tr><td>${r.voce}</td><td>${r.fonte}</td><td>${dIT(r.data)}</td><td>${stato(r.stato)}</td></tr>`),
    "Si aggiorna quando le contabili dell'e-banking vengono lette e confrontate con il registro permanente.","rep");
  h += `<div class="colonne">${tabella([{t:"Rif."},{t:"Data"},{t:"ETF"},{t:"Prezzo",n:1},{t:"Stato"}],
      d.acquisti.map(a=>`<tr><td>${a.rif}</td><td>${dIT(a.data)}</td><td>${a.ticker}</td>${td(nf(a.prezzo,4))}<td class="note">${a.stato}</td></tr>`),
      "Prezzi medi eseguiti in valuta di negoziazione. Quantità e importi restano nel registro interno.","rep")}
    ${tabella([{t:"Tranche"},{t:"Data"},{t:"Stato"},{t:"Nota"}],
      d.tranches.map(t=>`<tr><td>${t.id}</td><td>${dIT(t.data)}</td><td>${stato(t.stato==="eseguita"?"OK":t.stato.toUpperCase())}</td><td class="note">${t.nota}</td></tr>`),"","rep")}</div>`;

  // ----------------------------------------------------------- 8. metodologia
  h += sez("08","Metodologia e fonti");
  h += `<div class="panel note">
    <p><b>Privacy.</b> ${d.nota_privacy}</p>
    <p><b>Rendimento.</b> Ponderato nel tempo (TWR) dalla chiusura del giorno di inception; il giorno d'acquisto è misurato a parte dal prezzo e dal cambio realmente eseguiti fino alla chiusura, così il costo dell'esecuzione resta visibile e non sporca il confronto con i benchmark.</p>
    <p><b>Prezzi.</b> Chiusure EOD pubbliche: ${Object.entries(d.fonti).map(([k,v])=>k+" → "+v).join(" · ")}. Valute convertite in CHF ai cambi del giorno.${d.note.length?" "+d.note.join(" "):""}</p>
    <p><b>Rischio ex ante.</b> Covarianze stimate su 3 anni di rendimenti giornalieri in CHF; contributi al rischio con la scomposizione di Euler; VaR/CVaR storici, VaR mensile parametrico.</p>
    <p><b>Aggiornamento.</b> Automatico ogni giorno di borsa dopo la chiusura europea. Gli acquisti delle tranche si aggiungono a <code>reale/vita5m_reale.json</code> dopo la riconciliazione con l'e-banking.</p></div>`;
  app.innerHTML = h;
  document.getElementById("piede").textContent = d.disclaimer;

  // ----------------------------------------------------------------- grafici
  const S = L.serie, dt = S.date;
  const ser = (k,c,w) => ({name:k, color:c, w, data: dt.map((x,i)=>[x,S[k][i]])});
  equityDD(document.getElementById("eqlive"),
    [ser("VITA 5M (TWR)","var(--s1)",2.4), ser(BN[0],"var(--s2)"), ser(BN[1],"var(--s3)")],
    [{name:"Drawdown VITA 5M", color:"var(--neg)", data: dt.map((x,i)=>[x,S.drawdown[i]])}],
    {fmt:v=>nf(v,1), tit:"Base 100"});
  barChart(document.getElementById("scost"), d.linee.map(l=>[l.ticker,l.scostamento_pp]), {valori:true});
  barPair(document.getElementById("rischio"), d.linee.map(l=>({k:l.ticker,a:l.peso_pct,b:l.contrib_rischio_corr_pct})),
    {a:"peso corrente", b:"quota di rischio"});
  const E = X.equity_3a;
  lineChart(document.getElementById("eq3"), ["VITA 5M (pesi obiettivo)",...BN].map((k,i)=>
    ({name:k, color:["var(--s1)","var(--s2)","var(--s3)"][i], w:i?1.6:2.3, data:E.date.map((x,j)=>[x,E[k][j]])})),
    {fmt:v=>nf(v,0)});
  heatmap(document.getElementById("corr"), X.correlazioni.labels, X.correlazioni.matrix);
  caricaIntraday(d);
  setInterval(()=>caricaIntraday(d), 5*60*1000);
}

/* ------------------------------------------------------------------ intraday */
const URL_INTRA = [
  "https://raw.githubusercontent.com/onlywave/portafoglio-vita/intraday/intraday.json",
  "https://api.github.com/repos/onlywave/portafoglio-vita/contents/intraday.json?ref=intraday",
];
async function leggiIntraday(){
  for(const u of URL_INTRA){
    try{
      const r = await fetch(u+(u.includes("?")?"&":"?")+"t="+Date.now(),
        u.includes("api.github")?{headers:{Accept:"application/vnd.github.raw+json"}}:{cache:"no-store"});
      if(r.ok) return await r.json();
    }catch(e){}
  }
  return null;
}
function curvaIntraday(host, P){
  const W=1000,H=230,m={t:12,r:14,b:24,l:52};
  const nomi=Object.keys(P).filter(k=>k!=="ora"), n=P.ora.length;
  if(n<2){ host.innerHTML='<p class="note">Percorso disponibile dopo le prime barre della seduta.</p>'; return; }
  const vs=nomi.flatMap(k=>P[k]).filter(v=>v!=null&&isFinite(v));
  let y0=Math.min(...vs,0), y1=Math.max(...vs,0); const pad=(y1-y0)*0.1||0.2; y0-=pad; y1+=pad;
  const X=i=>m.l+i/(n-1)*(W-m.l-m.r), Y=v=>H-m.b-(v-y0)/(y1-y0)*(H-m.t-m.b);
  const col=["var(--s1)","var(--s2)","var(--s3)"];
  let g="";
  for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4;
    g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/>
        <text x="${m.l-7}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--muted)">${nf(v,2)}%</text>`;}
  g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--axis)"/>`;
  const passo=Math.max(1,Math.round(n/8));
  P.ora.forEach((o,i)=>{ if(i%passo===0) g+=`<text x="${X(i).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${o}</text>`; });
  nomi.forEach((k,j)=>{
    const d=P[k].map((v,i)=>v==null?null:`${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).filter(Boolean);
    g+=`<path d="M${d.join(" L")}" fill="none" stroke="${col[j%3]}" stroke-width="${j?1.6:2.4}"/>`;
  });
  host.innerHTML = legenda(nomi.map((k,j)=>({name:k,color:col[j%3]}))) +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="percorso intraday">${g}</svg>`;
}
async function caricaIntraday(daily){
  const box=document.getElementById("intra"); if(!box) return;
  const q=await leggiIntraday();
  if(!q){ box.innerHTML = sez("00","Oggi, in tempo quasi reale") +
    `<div class="flag"><b>Quotazione intraday non ancora disponibile.</b> Si aggiorna ogni 15 minuti nei giorni di borsa.</div>`; return; }
  const B=q.benchmark||{}, bs=B[BN[0]], bw=B[BN[1]];
  const aperta = q.giorno > daily.asof;
  box.innerHTML = sez("00","Oggi, in tempo quasi reale",
      `seduta del ${dIT(q.giorno)} · ultimo prezzo ${q.ultimo_prezzo} · aggiornato ${new Date(q.aggiornato).toLocaleTimeString("it-CH",{hour:"2-digit",minute:"2-digit"})} · ritardo ~15-20 min`) +
    `<div class="tiles">
      ${tabB("Variazione di oggi (stima)", pcs(q.var_oggi_pct), cls(q.var_oggi_pct), "in CHF, contro la chiusura precedente")}
      ${tabB("Dall'inizio, stimato ora", q.twr_stimato_pct==null?"—":pcs(q.twr_stimato_pct), cls(q.twr_stimato_pct), aperta?"chiusura TWR + variazione di oggi":"coincide con la chiusura")}
      ${tab("S&P 500 oggi (CHF)", bs?pcs(bs.var_chf_pct):"—", bs?cls(bs.var_chf_pct):"", bs?"ore "+bs.ora:"")}
      ${tab("MSCI World oggi (CHF)", bw?pcs(bw.var_chf_pct):"—", bw?cls(bw.var_chf_pct):"", bw?"ore "+bw.ora:"")}
      ${tab("USD/CHF", nf(q.usdchf.ultimo,4), "", pcs(q.usdchf.var_pct)+" oggi")}
    </div>
    <div class="grid2">${pannello("Percorso della seduta","Variazione cumulata in CHF dalla chiusura precedente, barre da 5 minuti.","curvaintra")}
    ${tabella([{t:"ETF"},{t:"Ultimo",n:1},{t:"Ora",n:1},{t:"Var. locale",n:1},{t:"Var. CHF",n:1},{t:"Contributo",n:1}],
      q.linee.map(l=>`<tr><td>${l.ticker} <span class="note">${l.valuta}</span></td>${td(nf(l.ultimo,l.ultimo<20?4:2))}${td(l.ora)}
        <td class="num ${cls(l.var_locale_pct)}">${pcs(l.var_locale_pct)}</td><td class="num ${cls(l.var_chf_pct)}">${pcs(l.var_chf_pct)}</td>
        ${td((l.contributo_pp>0?"+":"")+nf(l.contributo_pp,2)+" pp")}</tr>`), q.nota, "rep")}</div>`;
  curvaIntraday(document.getElementById("curvaintra"), q.percorso);
}
