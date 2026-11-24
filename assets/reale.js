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

  let h = `<div id="hero"></div><div id="intra"></div><div id="trading"></div>`;
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

  // ------------------------------------- 1b. obiettivo, studi, ancoraggio banca
  const OB = d.obiettivo, ST = d.studi, MB = d.marche_banca||[];
  if(OB && OB.benchmark){
    h += sez("OB","Obiettivo: battere S&amp;P 500 e MSCI World", OB.testo);
    h += `<div class="tiles">${OB.benchmark.map(b=>tabB("Extra vs "+b.nome.replace(" TR (CHF)",""),
        (b.extra_pp>0?"+":"")+nf(b.extra_pp,2)+" pp", cls(b.extra_pp),
        b.stato+(b.banda1_pp!=null?" · banda ±1σ "+nf(b.banda1_pp,2)+" pp":"")+(b.sedute_sopra_pct!=null?" · sedute sopra "+nf(b.sedute_sopra_pct,0)+"%":""))).join("")}</div>`;
    h += tabella([{t:"Benchmark"},{t:"Extra dall'inizio",n:1},{t:"Stato"},{t:"z (extra / TE·√t)",n:1},{t:"TE ex ante",n:1},{t:"Info ratio ex ante",n:1},{t:"Sedute sopra",n:1}],
      OB.benchmark.map(b=>`<tr><td>${b.nome}</td><td class="num ${cls(b.extra_pp)}"><b>${(b.extra_pp>0?"+":"")+nf(b.extra_pp,2)} pp</b></td>
        <td>${stato(b.stato==="SOPRA"?"OK":(b.stato==="PARI"?"PARI":"SOTTO"))}</td>${td(nf(b.z))}${td(pc(b.te_exante_pct,1))}${td(nf(b.info_ratio_exante))}
        ${td(b.sedute_sopra_pct==null?"—":pc(b.sedute_sopra_pct,0))}</tr>`),
      "Extra-rendimento = TWR VITA 5M − rendimento del benchmark in CHF, stessa base. La banda ±1σ scala il tracking error ex ante (3 anni, pesi obiettivo) con la radice del tempo: dentro la banda lo scarto è rumore statistico, sotto −1σ scatta l'allerta.","rep");
    h += pannello("Extra-rendimento cumulato contro i due benchmark","Punti di indice base 100: sopra lo zero VITA 5M sta battendo il benchmark.","extra");
  }
  if(ST && ST.scenari && ST.scenari.length){
    h += sez("ST","Scostamenti dagli studi interni", "rendimento reale contro la distribuzione attesa");
    h += tabella([{t:"Studio"},{t:"CAGR",n:1},{t:"Vol.",n:1},{t:"Max DD storico",n:1},{t:"Sedute",n:1},{t:"Atteso",n:1},{t:"Reale",n:1},{t:"Scost.",n:1},{t:"Banda ±1σ",n:1},{t:"Banda ±2σ",n:1},{t:"z",n:1},{t:"Stato"}],
      ST.scenari.map(x=>`<tr><td>${x.principale?"<b>"+x.nome+"</b>":x.nome}</td>${td(pc(x.cagr_pct,1))}${td(pc(x.vol_pct,1))}${td(pc(x.max_dd_pct,1))}${td(x.sedute)}
        ${td(pcs(x.atteso_pct))}<td class="num ${cls(x.reale_pct)}"><b>${pcs(x.reale_pct)}</b></td><td class="num ${cls(x.scostamento_pp)}">${(x.scostamento_pp>0?"+":"")+nf(x.scostamento_pp,2)} pp</td>
        ${td(pcs(x.banda1_pct[0])+" / "+pcs(x.banda1_pct[1]))}${td(pcs(x.banda2_pct[0])+" / "+pcs(x.banda2_pct[1]))}${td(nf(x.z))}<td>${stato(x.stato)}</td></tr>`).join("")+
      (ST.anno2026||[]).map(x=>`<tr><td class="note">${x.nome}</td><td class="num note" colspan="11">rendimento ${pcs(x.rend_pct,1)} · max drawdown ${pc(x.max_dd_pct,1)} (riferimento, non entra nel cono)</td></tr>`).join(""),
      ST.nota+" z = (log-rendimento reale − atteso) / σ·√t. OK entro 1σ, ATTENZIONE fra 1σ e 2σ, ALLERTA oltre 2σ.","rep wide");
    h += pannello("VITA 5M dentro il cono dello studio base","Mediana attesa e bande a 1σ e 2σ (CAGR e volatilità dello studio), base 100 alla chiusura dell'inception.","cono");
  }
  if(MB.length){
    const m = MB.at(-1);
    h += sez("BK","Ancoraggio al conto reale", `marcatura e-banking del ${dIT(m.data)} ore ${m.ora} · USD/CHF ${nf(m.usdchf,4)}`);
    h += `<div class="tiles">${tabB("Dal costo netto, prezzi banca", pcs(m.rend_dal_costo_netto_pct,3), cls(m.rend_dal_costo_netto_pct), "valore ai corsi bancari / carico netto da contabile − 1")}
      ${tab("Dal costo, prezzi pubblici", pcs(L.rend_dal_costo_pct), cls(L.rend_dal_costo_pct), "chiusura EOD del "+dIT(d.asof))}
      ${tab("Differenza banca − pubblico", (()=>{const v=m.rend_dal_costo_netto_pct-L.rend_dal_costo_pct;return (v>0?"+":"")+nf(v,2)+" pp";})(), "", "orari e fonti diverse")}</div>`;
    h += tabella([{t:"ETF"},{t:"Corso banca",n:1},{t:"Prezzo pubblico",n:1},{t:"Del",n:1},{t:"Scarto",n:1},{t:"Stato"}],
      m.linee.map(x=>`<tr><td>${x.ticker}</td>${td(nf(x.prezzo_banca,x.prezzo_banca<20?4:2))}${td(nf(x.prezzo_pubblico,x.prezzo_pubblico<20?4:2))}${td(dIT(x.data_pubblico))}
        <td class="num ${Math.abs(x.scarto_pct||0)>=1?"down":""}">${pcs(x.scarto_pct)}</td><td>${stato(x.stato)}</td></tr>`),
      (m.nota||"")+" Uno scarto oltre l'1% indica un prezzo pubblico non aggiornato o un orario diverso: fa fede la banca.","rep");
  }

  // -------------------------------------------------------------- 2. allerte
  h += sez("02","Allerte e soglie di rischio");
  h += tabella([{t:"Controllo"},{t:"Valore",n:1},{t:"Soglia",n:1},{t:"Stato"}],
    d.allerte.map(a=>{const u=a.unita==="pp"?" pp":(a.unita==="σ"?" σ":"%");
      const pre=a.controllo.startsWith("Extra")?"allerta sotto −1σ TE · obiettivo > ":(a.unita==="σ"?"|z| ≥ ":(a.controllo.startsWith("Scarto")?"|scarto| ≥ ":(a.soglia<0?"≤ ":(a.controllo.startsWith("Oro")?"> ":"≥ "))));
      return `<tr><td>${a.controllo}</td>${td(a.valore==null?"—":nf(a.valore,2)+u)}
      ${td(pre+nf(a.soglia,1)+u)}
      <td>${stato(a.stato)}</td></tr>`;}), "Lo scostamento dai pesi resta in allerta finché la linea FWRA non viene acquistata (tranche 2).", "rep");

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
        `<tr><td>${k}${t1.some(t=>(t.stime||[]).includes(f))?' <span class="note">(stima)</span>':""}</td>${t1.map(t=>td(f==="totale_pct"?"<b>"+pc(t[f],2)+"</b>":pc(t[f],3))).join("")}</tr>`).join("")+
      `<tr><td>Fonte</td>${t1.map(t=>`<td class="num">${stato(t.fonte.startsWith("STIMA")?"STIMA":"CONTABILE")}</td>`).join("")}</tr>`,
      "In % del controvalore della tranche. "+(t1[0]?t1[0].nota:""),"rep")}</div>`;
  const anno1 = (t1.reduce((a,t)=>a+(t.totale_pct||0),0)/Math.max(t1.length,1)) + C.ter_obiettivo_pct;
  h += `<div class="flag"><b>Costo totale stimato del primo anno: circa ${pc(anno1,2)}</b> del capitale
    (negoziazione una tantum più TER). Courtage zero e bollo da contabile; il ricarico sul cambio resta la voce più pesante (stima): negoziare il margine sulle prossime tranche è la leva principale.</div>`;

  // -------------------------------------------------------- 7. riconciliazione
  h += sez("07","Riconciliazione con gli eseguiti bancari");
  h += tabella([{t:"Voce"},{t:"Fonte"},{t:"Data"},{t:"Stato"}],
    d.riconciliazione.map(r=>`<tr><td>${r.voce}</td><td>${r.fonte}</td><td>${dIT(r.data)}</td><td>${stato(r.stato)}</td></tr>`),
    "Si aggiorna quando le contabili dell'e-banking vengono lette e confrontate con il registro permanente.","rep");
  h += `<div class="colonne">${tabella([{t:"Rif."},{t:"Data"},{t:"ETF"},{t:"Eseguito",n:1},{t:"Carico netto",n:1},{t:"Stato"}],
      d.acquisti.map(a=>`<tr><td>${a.rif}</td><td>${dIT(a.data)}</td><td>${a.ticker}</td>${td(nf(a.prezzo_eseguito,4))}${td("<b>"+nf(a.prezzo,4)+"</b>")}<td class="note">${a.stato}</td></tr>`),
      "Prezzo medio eseguito e carico netto unitario (bollo incluso) in valuta di negoziazione. Quantità e importi restano nel registro interno.","rep")}
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
  if(OB && OB.benchmark && document.getElementById("extra")){
    lineChart(document.getElementById("extra"), OB.benchmark.map((b,i)=>({name:"vs "+b.nome.replace(" TR (CHF)",""), color:["var(--s2)","var(--s3)"][i], w:2,
      data: dt.map((x,j)=>[x,b.serie_extra[j]])})), {fmt:v=>nf(v,1), zero:true});
  }
  if(ST && ST.coni && ST.coni.base && document.getElementById("cono")){
    const K = ST.coni.base, z = (k,c,w,dash) => ({name:k, color:c, w, dash, data: dt.map((x,j)=>[x,K[k][j]])});
    lineChart(document.getElementById("cono"), [
      {name:"VITA 5M (TWR)", color:"var(--s1)", w:2.6, data: dt.map((x,i)=>[x,S["VITA 5M (TWR)"][i]])},
      z("mediana","var(--s4)",1.6,"6 4"), z("p1_su","var(--s5)",1.2,"3 3"), z("p1_giu","var(--s5)",1.2,"3 3"),
      z("p2_su","var(--neg)",1,"2 4"), z("p2_giu","var(--neg)",1,"2 4")].map(x=>({...x,
        name:{mediana:"Mediana attesa",p1_su:"+1σ",p1_giu:"−1σ",p2_su:"+2σ",p2_giu:"−2σ"}[x.name]||x.name})), {fmt:v=>nf(v,1)});
  }
  barChart(document.getElementById("scost"), d.linee.map(l=>[l.ticker,l.scostamento_pp]), {valori:true});
  barPair(document.getElementById("rischio"), d.linee.map(l=>({k:l.ticker,a:l.peso_pct,b:l.contrib_rischio_corr_pct})),
    {a:"peso corrente", b:"quota di rischio"});
  const E = X.equity_3a;
  lineChart(document.getElementById("eq3"), ["VITA 5M (pesi obiettivo)",...BN].map((k,i)=>
    ({name:k, color:["var(--s1)","var(--s2)","var(--s3)"][i], w:i?1.6:2.3, data:E.date.map((x,j)=>[x,E[k][j]])})),
    {fmt:v=>nf(v,0)});
  heatmap(document.getElementById("corr"), X.correlazioni.labels, X.correlazioni.matrix);
  renderHero(d);
  renderTrading(d, 5);
  DAILY = d;
  caricaIntraday(d);
  setInterval(()=>{ if(Date.now() >= PROSSIMA) caricaIntraday(d); }, 5000);
  setInterval(tickBarra, 1000);
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
async function caricaIntraday(daily, manuale){
  const box=document.getElementById("intra"); if(!box) return;
  STATO_LETTURA = "in corso"; tickBarra();
  const q=await leggiIntraday();
  N_LETTURE++; ULTIMA_LETTURA = Date.now(); PROSSIMA = ULTIMA_LETTURA + POLL_MS;
  const nuovo = q && (!INTRA || q.aggiornato !== INTRA.aggiornato);
  if(nuovo) N_NUOVI++;
  STATO_LETTURA = !q ? "errore" : (nuovo ? "nuovi prezzi" : "nessun prezzo nuovo");
  if(manuale && q && !nuovo) MSG_BTN = `Nessun prezzo nuovo: il server li pubblica ogni 15 minuti, i prossimi verso le ${prossimoSlot()}.`;
  else if(manuale && nuovo) MSG_BTN = "Prezzi aggiornati.";
  if(!q){ box.innerHTML = sez("00","Oggi, in tempo quasi reale") +
    `<div class="flag"><b>Quotazione intraday non ancora disponibile.</b> Si aggiorna ogni 15 minuti nei giorni di borsa.</div>`; return; }
  const B=q.benchmark||{}, bs=B[BN[0]], bw=B[BN[1]];
  const aperta = INTRA_VALIDA(q, daily);
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
  INTRA = q; renderTrading(daily, FIN_SEL); renderHero(daily); tickBarra();
}

/* ------------------------------------------------- cruscotto sala trading */
let INTRA = null, FIN_SEL = 5;
const FINS = ["3","5","7","15","30"];
function renderTrading(d, W){
  FIN_SEL = W;
  const T = d.trading, box = document.getElementById("trading");
  if(!T || !box) return;
  const F = T.finestre, f = F[String(W)], nomi = ["VITA 5M", ...BN];
  const oggi = {}; if(INTRA_VALIDA(INTRA, d)) INTRA.linee.forEach(l=>oggi[l.ticker]=l);
  const qOggi = INTRA_VALIDA(INTRA, d) ? INTRA : null;
  const bottoni = FINS.map(k=>`<button class="${+k===W?"on":""}" data-w="${k}">${k} sedute</button>`).join("");
  let h = sez("TR","Cruscotto sala trading", `finestra ${dIT(f.da)} – ${dIT(f.a)} · ${f.live_disponibile?"dati reali":"pro forma a pesi correnti"}`);
  h += `<div class="panel"><div class="periodo"><div class="presets" id="finbtn">${bottoni}</div>
        <span class="note">${T.nota}</span></div></div>`;
  // matrice dei rendimenti per finestra
  const rigaRend = (n,lab) => `<tr><td>${lab||n}</td>${qOggi?`<td class="num ${cls(n==="VITA 5M"?qOggi.var_oggi_pct:(qOggi.benchmark[n]||{}).var_chf_pct)}">${pcs(n==="VITA 5M"?qOggi.var_oggi_pct:(qOggi.benchmark[n]||{}).var_chf_pct)}</td>`:""}
     ${FINS.map(k=>{const v=F[k][n].rend_pct;return `<td class="num ${cls(v)} ${+k===W?"sel":""}">${pcs(v)}</td>`;}).join("")}</tr>`;
  const extra = FINS.map(k=>{const v=F[k]["VITA 5M"].rend_pct-F[k][BN[1]].rend_pct;return `<td class="num ${cls(v)} ${+k===W?"sel":""}">${(v>0?"+":"")+nf(v,2)} pp</td>`;}).join("");
  h += tabella([{t:"Rendimento"},...(qOggi?[{t:"Oggi",n:1}]:[]),...FINS.map(k=>({t:k+" sedute",n:1}))],
    nomi.map(n=>rigaRend(n,n==="VITA 5M"?"VITA 5M (pesi correnti)":n)).join("")+
    `<tr><td>Extra vs MSCI World</td>${qOggi?`<td class="num">${(()=>{const v=qOggi.var_oggi_pct-((qOggi.benchmark[BN[1]]||{}).var_chf_pct||0);return (v>0?"+":"")+nf(v,2)+" pp";})()}</td>`:""}${extra}</tr>`,
    "In CHF. Oggi: variazione intraday stimata dalla chiusura precedente.","rep");
  // parametri rischio/rendimento sulla finestra scelta
  const M = [["Rendimento","rend_pct",v=>pcs(v)],["Volatilità annualizzata","vol_pct",v=>pc(v,1)],["Sharpe annualizzato","sharpe",v=>nf(v)],
    ["Max drawdown","max_dd_pct",v=>pc(v,2)],["VaR 95% 1 giorno","var95_1d_pct",v=>pc(v,2)],["Beta vs MSCI World","beta",v=>nf(v)],
    ["Correlazione vs MSCI World","corr",v=>nf(v)],["Sedute positive","giorni_pos_pct",v=>pc(v,0)],
    ["Miglior seduta","miglior_pct",v=>pcs(v)],["Peggior seduta","peggior_pct",v=>pcs(v)]];
  h += `<div class="grid2">${tabella([{t:"Su "+W+" sedute"},...nomi.map(n=>({t:n==="VITA 5M"?"VITA 5M":n.replace(" TR (CHF)",""),n:1}))],
    M.map(([lab,k,fmt])=>`<tr><td>${lab}</td>${nomi.map(n=>{const v=f[n][k];return td(v==null?"—":fmt(v));}).join("")}</tr>`),
    "Sharpe su finestre brevi: indicativo, tasso privo di rischio CHF a zero. VaR parametrico 1,645 σ.","rep")}
    ${pannello("Contributo alla performance · "+W+" sedute","Peso corrente × rendimento della linea in CHF, punti percentuali.","contrib")}</div>`;
  // per asset: rendimenti, contributi, medie mobili
  const MM = T.medie_mobili;
  h += tabella([{t:"ETF"},...(qOggi?[{t:"Oggi",n:1}]:[]),...FINS.map(k=>({t:k+"s",n:1})),{t:"Contrib. "+W+"s",n:1},{t:"Vol "+W+"s",n:1},
      {t:"vs SMA50",n:1},{t:"vs SMA200",n:1},{t:"da max 52s",n:1},{t:"Trend"}],
    d.linee.map(l=>{const t=l.ticker, m=MM[t], o=oggi[t];
      return `<tr><td>${t} <span class="note">${m.valuta}</span></td>
      ${qOggi?`<td class="num ${o?cls(o.var_chf_pct):""}">${o?pcs(o.var_chf_pct):"—"}</td>`:""}
      ${FINS.map(k=>{const v=F[k].asset[t].rend_pct;return `<td class="num ${cls(v)} ${+k===W?"sel":""}">${pcs(v)}</td>`;}).join("")}
      <td class="num ${cls(f.asset[t].contrib_pp)}">${(f.asset[t].contrib_pp>0?"+":"")+nf(f.asset[t].contrib_pp,2)} pp</td>${td(pc(f.asset[t].vol_pct,1))}
      <td class="num ${cls(m.dist_sma50_pct)}">${pcs(m.dist_sma50_pct,1)}</td><td class="num ${cls(m.dist_sma200_pct)}"><b>${pcs(m.dist_sma200_pct,1)}</b></td>
      ${td(pc(m.dist_max52s_pct,1))}<td>${stato(m.trend==="rialzista"?"OK":(m.trend==="ribassista"?"ALLERTA":"MISTO")).replace(/>[^<]+</,">"+m.trend+"<")}</td></tr>`;}).join("")+
    ["VITA 5M (pesi correnti)",...BN].map(n=>{const m=MM[n];
      return `<tr><td>${n}</td>${qOggi?"<td></td>":""}${FINS.map(()=>"<td></td>").join("")}<td></td><td></td>
      <td class="num ${cls(m.dist_sma50_pct)}">${pcs(m.dist_sma50_pct,1)}</td><td class="num ${cls(m.dist_sma200_pct)}"><b>${pcs(m.dist_sma200_pct,1)}</b></td>
      ${td(pc(m.dist_max52s_pct,1))}<td>${stato(m.trend==="rialzista"?"OK":(m.trend==="ribassista"?"ALLERTA":"MISTO")).replace(/>[^<]+</,">"+m.trend+"<")}</td></tr>`;}).join(""),
    "s = sedute. SMA50/SMA200: distanza dell'ultima chiusura dalle medie mobili a 50 e 200 sedute. Trend rialzista: prezzo e SMA50 sopra la SMA200.","rep wide");
  box.innerHTML = h;
  barChart(document.getElementById("contrib"), d.linee.map(l=>[l.ticker, f.asset[l.ticker].contrib_pp]).concat([["Totale", f["VITA 5M"].rend_pct]]), {valori:true, vd:2});
  box.querySelectorAll("#finbtn button").forEach(b=>b.addEventListener("click",()=>renderTrading(d, +b.dataset.w)));
}

/* ------------------------------------------------------------ testata in CHF
   Il JSON pubblico porta solo frazioni del programma. Gli importi in CHF si
   calcolano qui, moltiplicando per il capitale del programma che l'utente
   inserisce una volta: resta nel suo browser e non viene pubblicato. */
const CHIAVE_CAP = "vita5m_capitale_chf";
const leggiCap = () => { try { const v = +localStorage.getItem(CHIAVE_CAP); return v>0 ? v : null; } catch(e){ return null; } };
const scriviCap = v => { try { v ? localStorage.setItem(CHIAVE_CAP, String(v)) : localStorage.removeItem(CHIAVE_CAP); } catch(e){} };
const chf = (v,d=0) => (v==null||!isFinite(v)) ? "—" : "CHF "+v.toLocaleString("de-CH",{minimumFractionDigits:d,maximumFractionDigits:d});
const chfs = v => (v==null||!isFinite(v)) ? "—" : (v>0?"+":v<0?"−":"")+chf(Math.abs(v));
function renderHero(d){
  const box = document.getElementById("hero"); if(!box) return;
  // link personale: #cap=3000000 salva il capitale in questo browser e sparisce dall'indirizzo
  const m = (location.hash||"").match(/cap=(\d+)/);
  if(m){ scriviCap(+m[1]); try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
  const cap = d.capitale_chf || leggiCap();
  const q = INTRA_VALIDA(INTRA, d) ? INTRA : null;
  const vq = d.valore_quota * (q ? 1 + (q.var_oggi_pct||0)/100 : 1), cq = d.costo_quota;
  const rend = (vq/cq - 1)*100, FB = d.finestre_brevi || {};
  const oggiV = q ? q.var_oggi_pct : (FB["1"]||{})["VITA 5M"];
  const bOggi = n => q ? ((q.benchmark||{})[n]||{}).var_chf_pct : (FB["1"]||{})[n];
  const W = [["oggi","Oggi"],["3","3 giorni"],["5","1 settimana"],["21","1 mese"]];
  // durante la seduta le finestre chiuse ieri si compongono con la variazione di oggi
  const conOggi = (x, n) => (x==null || !q) ? x : ((1+x/100)*(1+((n==="VITA 5M"?oggiV:bOggi(n))||0)/100)-1)*100;
  const val = (k,n) => k==="oggi" ? (n==="VITA 5M"?oggiV:bOggi(n)) : conOggi((FB[k]||{})[n], n);
  const pf = k => k!=="oggi" && (FB[k]||{}).fonte==="pro forma";
  const mf = q ? MINUTI_FA(q.aggiornato) : null;
  const quando = q ? `prezzi delle ${q.ultimo_prezzo} (Yahoo, ritardo ~15-20 min) · letto ${mf} min fa${mf>45?' <b style="color:#ffcf6b">· dato non aggiornato</b>':""}`
                   : `chiusura del ${dIT(d.asof)}${INTRA&&INTRA.giorno===d.asof?" · borsa chiusa":""}`;
  const kpi = (k,v,c="",n="") => `<div class="hx-k"><div class="hx-kl">${k}</div><div class="hx-kv ${c}">${v}</div>${n?`<div class="hx-kn">${n}</div>`:""}</div>`;
  // stessa base dei benchmark: chiusura del giorno d'inception, piu' la seduta in corso
  const twr = conOggi(d.live.rend_twr_pct, "VITA 5M");
  const bDa = n => conOggi(d.live.bench_pct[n], n);
  const ex = n => twr - (bDa(n)||0);
  const amm = v => cap ? chf(v*cap) : "—";
  const MBu = MB_ULT(d), liq = MBu && MBu.liquidita_quota != null ? MBu.liquidita_quota : null;
  const A = d.annuo_reale_pct, a12 = (FB["252"]||{});
  const tend = A != null ? A : a12["VITA 5M"];
  const tendLab = A != null ? "annualizzato sul reale" : "ultimi 12 mesi a pesi attuali (il reale annualizzato compare dopo 3 mesi)";
  const studio = ((d.studi||{}).scenari||[]).find(x=>x.principale);
  const card = (dom, risp, cl, sub, big) => `<div class="qa${big?" qa-big":""}"><div class="qa-q">${dom}</div><div class="qa-a ${cl||""}">${risp}</div><div class="qa-s">${sub||""}</div></div>`;
  const capBox = cap ? "" : `<div class="hx-cap"><div class="hx-capt">Inserisci una volta il capitale del programma per vedere le risposte in CHF</div>
      <input id="capin" type="number" min="1" step="1000" placeholder="3000000"> <button id="capok">Mostra in CHF</button></div>`;
  const pcol = v => (v||0)>=0?"pos":"neg";
  const rigaB = (lab, v, s_, w_, nota) => {
    const nn = x => x!=null && isFinite(x);
    const e1 = nn(v)&&nn(s_) ? v-s_ : null, e2 = nn(v)&&nn(w_) ? v-w_ : null, ok = x => nn(x) ? (Math.abs(x)<0.005 ? `<span class="pa">PARI</span>` : `<span class="${x>0?"si":"no"}">${x>0?"SÌ":"NO"} ${(x>0?"+":"")+nf(x,2)} pp</span>`) : "—";
    return `<tr><td>${lab}${nota?`<span>${nota}</span>`:""}</td><td class="${pcol(v)}">${pcs(v)}</td><td>${pcs(s_)}</td><td>${pcs(w_)}</td><td>${ok(e1)}</td><td>${ok(e2)}</td></tr>`;
  };
  const vv = k => [ val(k,"VITA 5M"), val(k,BN[0]), val(k,BN[1]) ];
  let h = `<section class="hx">
    <div class="hx-top hx-qa">
      <div class="hx-bar" id="hxbar"></div>
      ${capBox}
      <div class="qa-grid">
        ${card("1 · Quanto ho investito?", cap?chf(cq*cap):pc(cq*100,2)+" del programma", "",
          `in titoli, costi inclusi${cap?` · ${pc(cq*100,1)} del programma di ${chf(cap)}`:""}`)}
        ${card("2 · Quanto ho adesso?", cap?chf(vq*cap):pc(vq*100,2)+" del programma", "",
          `${cap?`<b class="${pcol(rend)}">${chfs((vq-cq)*cap)}</b> · `:""}titoli, ${quando}${cap&&liq!=null?`<br>con la liquidità del programma: <b>${chf((vq+liq)*cap)}</b> (saldi conto ${dIT(MBu.data)})`:""}`, true)}
        ${card("3 · Performance dall'inizio", pcs(rend), pcol(rend), `dal ${dIT(d.inception)}, sul prezzo realmente pagato`)}
        ${card("4 · 1 mese · 1 settimana", `<span class="${pcol(val("21","VITA 5M"))}">${pcs(val("21","VITA 5M"))}</span> <span class="qa-sep">·</span> <span class="${pcol(val("5","VITA 5M"))}">${pcs(val("5","VITA 5M"))}</span>`, "",
          (pf("21")||pf("5"))?"pro forma a pesi attuali finché le sedute reali non coprono il periodo":"reale")}
        ${card("5 · Tendenziale annuo", pcs(tend), pcol(tend), `${tendLab}${studio?` · atteso dallo studio base ${pc(studio.cagr_pct,1)}`:""}`)}
      </div>
      <div class="qa-bt"><div class="qa-btt">Sto battendo S&amp;P 500 e MSCI World?</div>
        <table><thead><tr><th>Periodo</th><th>VITA 5M</th><th>S&amp;P 500</th><th>MSCI World</th><th>Batto S&amp;P 500?</th><th>Batto MSCI World?</th></tr></thead><tbody>
          ${rigaB("Dall'inizio", twr, bDa(BN[0]), bDa(BN[1]), "stessa base: chiusura "+dIT(d.inception)+(q?", inclusa la seduta in corso":""))}
          ${rigaB("Oggi", oggiV, bOggi(BN[0]), bOggi(BN[1]), q?"intraday":"")}
          ${rigaB("1 settimana", ...vv("5"), (pf("5")?"pro forma":"")+(q?(pf("5")?", ":"")+"con oggi":""))}
          ${rigaB("1 mese", ...vv("21"), (pf("21")?"pro forma":"")+(q?(pf("21")?", ":"")+"con oggi":""))}
          ${rigaB("12 mesi (tendenziale)", ...vv("252"), (pf("252")?"pro forma a pesi attuali":"")+(q?", con oggi":""))}
        </tbody></table></div>
    </div>
    <div class="hx-body">
      <table class="hx-t"><thead><tr><th>Confronto sulla stessa base</th><th>Dal ${dIT(d.inception)}</th>${W.map(([k,t])=>`<th>${t}</th>`).join("")}</tr></thead><tbody>
        <tr class="hx-me"><td>VITA 5M</td><td class="${cls(twr)}">${pcs(twr)}</td>${W.map(([k])=>`<td class="${cls(val(k,"VITA 5M"))}">${pcs(val(k,"VITA 5M"))}${pf(k)?"<sup>pf</sup>":""}</td>`).join("")}</tr>
        ${BN.map(n=>`<tr><td>${n.replace(" TR (CHF)","")}</td><td class="${cls(d.live.bench_pct[n])}">${pcs(d.live.bench_pct[n])}</td>${W.map(([k])=>`<td class="${cls(val(k,n))}">${pcs(val(k,n))}</td>`).join("")}</tr>`).join("")}
        <tr><td>Extra vs S&amp;P 500</td><td class="${cls(ex(BN[0]))}">${(ex(BN[0])>0?"+":"")+nf(ex(BN[0]),2)} pp</td>${W.map(([k])=>{const v=val(k,"VITA 5M")-val(k,BN[0]);return `<td class="${cls(v)}">${isFinite(v)?(v>0?"+":"")+nf(v,2)+" pp":"—"}</td>`;}).join("")}</tr>
        <tr><td>Extra vs MSCI World</td><td class="${cls(ex(BN[1]))}">${(ex(BN[1])>0?"+":"")+nf(ex(BN[1]),2)} pp</td>${W.map(([k])=>{const v=val(k,"VITA 5M")-val(k,BN[1]);return `<td class="${cls(v)}">${isFinite(v)?(v>0?"+":"")+nf(v,2)+" pp":"—"}</td>`;}).join("")}</tr>
      </tbody></table>
      <table class="hx-t hx-l"><thead><tr><th>ETF</th><th>Prezzo d'acquisto</th><th>Valore attuale</th><th>Utile / perdita</th><th>Dall'acquisto</th>${W.map(([k,t])=>`<th>${t}</th>`).join("")}<th>Peso</th></tr></thead><tbody>
        ${d.linee.map(l=>{const ql=q&&q.linee?(q.linee.find(x=>x.ticker===l.ticker)||{}):{};
          const v=l.valore_quota*(q?1+(ql.var_chf_pct||0)/100:1), c=l.costo_quota, r=c?(v/c-1)*100:null;
          const vv=k=>k==="oggi"?(q?ql.var_chf_pct:(l.var_pct||{})["1"]):(l.var_pct||{})[k];
          return `<tr><td><b>${l.ticker}</b><span>${l.nome}</span></td>
            <td>${c?(cap?chf(c*cap):pc(c*100,2)):"non acquistato"}</td><td>${c?(cap?chf(v*cap):pc(v*100,2)):"—"}</td>
            <td class="${cls(r)}">${c&&cap?chfs((v-c)*cap):"—"}</td><td class="${cls(r)}"><b>${r==null?"—":pcs(r)}</b></td>
            ${W.map(([k])=>`<td class="${cls(vv(k))}">${pcs(vv(k))}</td>`).join("")}<td>${pc(l.peso_pct,1)}</td></tr>`;}).join("")}
        <tr class="hx-tot"><td>Totale</td><td>${cap?chf(cq*cap):pc(cq*100,2)}</td><td>${cap?chf(vq*cap):pc(vq*100,2)}</td>
          <td class="${cls(rend)}">${cap?chfs((vq-cq)*cap):"—"}</td><td class="${cls(rend)}">${pcs(rend)}</td>${W.map(([k])=>`<td class="${cls(val(k,"VITA 5M"))}">${pcs(val(k,"VITA 5M"))}</td>`).join("")}<td>100%</td></tr>
      </tbody></table>
      <div class="hx-chart"><div class="hx-ct">VITA 5M contro S&amp;P 500 e MSCI World <span>base 100 alla chiusura del ${dIT(d.inception)}, in CHF, stessa base per tutti</span></div><div id="heroeq"></div></div>
      <div class="hx-foot">Prezzo d'acquisto = carico netto da contabile bancaria (bollo incluso), USD al cambio spot eseguito. «Dall'acquisto» (valore, utile/perdita, righe ETF) include il giorno di esecuzione (${pcs(d.live.giorno_esecuzione_pct)} da prezzo eseguito a chiusura); il confronto con i benchmark parte invece dalla chiusura del ${dIT(d.inception)}, unica base comune. Verifica col conto ${MB_ULT(d)?`del ${dIT(MB_ULT(d).data)} ore ${MB_ULT(d).ora}: <b>${pcs(MB_ULT(d).rend_dal_costo_netto_pct,2)}</b> dal costo ai prezzi della banca.`:"—"}
        <sup>pf</sup> pro forma a pesi correnti finché le sedute reali non coprono la finestra. Benchmark total return in CHF.
        ${cap?` Importi sul capitale del programma di ${chf(cap)}, riconciliato con Raiffeisen.`:""}</div>
    </div></section>`;
  box.innerHTML = h;
  const S = d.live.serie, dt = S.date;
  lineChart(document.getElementById("heroeq"), [["VITA 5M (TWR)","var(--s1)",3],[BN[0],"var(--s2)",2],[BN[1],"var(--s3)",2]]
    .map(([k,c,w])=>({name:k.replace(" TR (CHF)","").replace(" (TWR)",""), color:c, w, data: dt.map((x,i)=>[x,S[k][i]])})), {fmt:v=>nf(v,1), h:300});
  const ok = document.getElementById("capok");
  if(ok){ const go=()=>{ const v=+document.getElementById("capin").value; if(v>0){ scriviCap(v); renderHero(d);} };
    ok.addEventListener("click",go); document.getElementById("capin").addEventListener("keydown",e=>{ if(e.key==="Enter") go(); }); }
  const rs = document.getElementById("capreset");
  if(rs) rs.addEventListener("click",e=>{ e.preventDefault(); scriviCap(null); renderHero(d); });
}
const MB_ULT = d => (d.marche_banca||[]).at(-1);

/* la quotazione intraday vale se riguarda una seduta successiva all'ultima chiusura
   del file giornaliero (che contiene solo sedute chiuse) */
const INTRA_VALIDA = (q, d) => !!(q && q.giorno > d.asof);
/* freschezza: quanti minuti fa e' stato generato il dato mostrato */
const MINUTI_FA = iso => Math.round((Date.now() - new Date(iso).getTime())/60000);

/* ------------------------------------------- barra di stato: ritardo, contatore, timer */
const POLL_MS = 2*60*1000;          // la pagina controlla il server ogni 2 minuti
let DAILY = null, N_LETTURE = 0, N_NUOVI = 0, ULTIMA_LETTURA = null, PROSSIMA = 0, STATO_LETTURA = "", MSG_BTN = "";
const SLOT = [4,19,34,49];          // minuti del job intraday (ora UTC/locale indifferente: minuti)
function prossimoSlot(){
  const t = new Date(); t.setSeconds(0,0);
  for(let i=0;i<60;i++){ t.setMinutes(t.getMinutes()+1); if(SLOT.includes(t.getMinutes())) break; }
  t.setMinutes(t.getMinutes()+2);   // il job impiega ~1-2 minuti
  return t.toLocaleTimeString("it-CH",{hour:"2-digit",minute:"2-digit"});
}
// ora di Zurigo "HH:MM" del giorno g -> istante assoluto
function zurigo(g, hhmm){
  const [Y,M,D] = g.split("-").map(Number), [h,m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(Y,M-1,D,h,m);
  const f = new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Zurich",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(guess));
  const [fh,fm] = f.split(":").map(Number);
  return guess - (((fh*60+fm) - (h*60+m) + 1440) % 1440)*60000;
}
const durata = ms => { const s=Math.max(0,Math.round(ms/1000)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60;
  return h ? `${h} h ${String(m).padStart(2,"0")} min` : (m ? `${m} min ${String(x).padStart(2,"0")} s` : `${x} s`); };
function borsaAperta(){
  const f = new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Zurich",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const w=f.find(x=>x.type==="weekday").value, h=+f.find(x=>x.type==="hour").value, m=+f.find(x=>x.type==="minute").value, t=h*60+m;
  if(w==="Sat"||w==="Sun") return "chiusa";
  return (t>=9*60 && t<17*60+30) ? "aperta" : (t>=17*60+30 && t<22*60 ? "solo USA" : "chiusa");
}
function tickBarra(){
  const el = document.getElementById("hxbar"); if(!el || !DAILY) return;
  const q = INTRA_VALIDA(INTRA, DAILY) ? INTRA : null, now = Date.now(), b = borsaAperta();
  let ritardo = null, ora = "—";
  if(q){ const t = zurigo(q.giorno, q.ultimo_prezzo); ritardo = now - t; ora = q.ultimo_prezzo; }
  const lvl = !q ? "nd" : (b!=="aperta" ? "chiusa" : (ritardo < 25*60000 ? "ok" : (ritardo < 45*60000 ? "wa" : "al")));
  const testoStato = {ok:"Quasi tempo reale", wa:"Ritardo elevato", al:"Dato non aggiornato", chiusa: b==="solo USA" ? "Borse europee chiuse · USA aperte" : "Borse chiuse", nd:"Chiusura ufficiale"}[lvl];
  el.innerHTML = `<span class="hb-dot hb-${lvl}"></span><b>${testoStato}</b>
    <span class="hb-i">Prezzi delle <b>${q?ora:"chiusura del "+dIT(DAILY.asof)}</b></span>
    <span class="hb-i">Ritardo sul tempo reale <b>${q?durata(ritardo):"—"}</b>${q&&b==="aperta"?' <span class="hb-n">(Yahoo ~15-20 min + pubblicazione ogni 15 min)</span>':""}</span>
    <span class="hb-i">Ultima lettura <b>${ULTIMA_LETTURA?durata(now-ULTIMA_LETTURA)+" fa":"—"}</b> <span class="hb-n">${STATO_LETTURA}</span></span>
    <span class="hb-i">Prossimo controllo tra <b>${PROSSIMA?durata(PROSSIMA-now):"—"}</b></span>
    <span class="hb-i">Nuovi prezzi dal server verso le <b>${prossimoSlot()}</b></span>
    <span class="hb-i">Letture <b>${N_LETTURE}</b> · aggiornamenti ricevuti <b>${N_NUOVI}</b></span>
    <button id="hbbtn" class="hb-btn"${STATO_LETTURA==="in corso"?" disabled":""}>⟳ Aggiorna prezzi ora</button>
    ${MSG_BTN?`<span class="hb-msg">${MSG_BTN}</span>`:""}`;
  const bt = document.getElementById("hbbtn");
  if(bt) bt.onclick = () => { MSG_BTN = ""; caricaIntraday(DAILY, true); };
}
