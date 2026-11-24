/* S&P 500 con segnale della media esponenziale a 10 mesi — da data/spx_segnale.json */
const sxD = s => { if(!s) return "—"; const p=s.split("-"); return p.length===3? p.reverse().join(".") : p[1]+"/"+p[0]; };
const sxSez = (n,t,m="") => `<div class="sez"><span class="num">${n}</span><h2>${t}</h2>${m?`<span class="meta">${m}</span>`:""}</div>`;
const sxSt = s => `<span class="st ${s==="VENDITA"||s==="FUORI"||s==="RESTA FUORI"?"al":(s==="RIENTRO"?"ok":(s==="INVESTITO"||s==="NESSUN SEGNALE"?"ok":"wa"))}">${s}</span>`;

function sxGrafico(host, d, i0, opt){
  const M = d.mensile, n = M.date.length;
  const W = 1000, H = opt.h||470, m = {t:16, r:16, b:28, l:62};
  const idx = []; for(let i=i0;i<n;i++) idx.push(i);
  const ys = opt.serie(i0);                       // [{name,color,w,dash,vals}]
  const tutti = ys.flatMap(s=>idx.map(i=>s.vals[i])).filter(v=>v>0&&isFinite(v));
  const L0 = Math.log10(Math.min(...tutti))-0.03, L1 = Math.log10(Math.max(...tutti))+0.03;
  const X = i => m.l + (i-i0)/((n-1-i0)||1)*(W-m.l-m.r);
  const Y = v => m.t + (L1-Math.log10(v))/(L1-L0)*(H-m.t-m.b);
  let g = "";
  // fasce fuori mercato
  if(opt.fasce){ let a=null;
    for(let i=i0;i<=n;i++){ const out = i<n && M.investito[i]===0;
      if(out && a===null) a=i; if(!out && a!==null){ g+=`<rect x="${X(a-0.5).toFixed(1)}" y="${m.t}" width="${Math.max(1.5,X(i-0.5)-X(a-0.5)).toFixed(1)}" height="${H-m.t-m.b}" fill="var(--neg)" fill-opacity=".09"/>`; a=null; } } }
  // griglia log
  const dec = []; for(let e=Math.floor(L0); e<=Math.ceil(L1); e++) [1,2,5].forEach(k=>{const v=k*10**e; if(Math.log10(v)>=L0&&Math.log10(v)<=L1) dec.push(v);});
  const passo = dec.length>14 ? dec.filter(v=>String(v).startsWith("1")) : dec;
  passo.forEach(v=>{ const y=Y(v); g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--grid)"/>
    <text x="${m.l-7}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--muted)">${v>=1000?nf(v,0):(v>=1?nf(v,0):nf(v,2))}</text>`; });
  // asse x: anni
  const anni = (n-i0)/12, ogni = anni>60?10:anni>25?5:anni>8?2:1;
  for(let i=i0;i<n;i++){ const [yy,mm]=M.date[i].split("-").map(Number); if(mm===1 && yy%ogni===0)
    g+=`<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${yy}</text>`; }
  // serie
  ys.forEach(s=>{ const pts=idx.filter(i=>s.vals[i]>0).map((i,j)=>(j?"L":"M")+X(i).toFixed(1)+" "+Y(s.vals[i]).toFixed(1)).join(" ");
    g+=`<path d="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.w||1.6}" ${s.dash?`stroke-dasharray="${s.dash}"`:""} stroke-linejoin="round"/>`; });
  // frecce
  if(opt.frecce){ const pos = {}; M.date.forEach((x,i)=>pos[x]=i);
    d.eventi.forEach(e=>{ const i = pos[e.data.slice(0,7)]; if(i===undefined||i<i0) return;
      const x=X(i), y=Y(M.chiusura[i]), giu = e.tipo==="VENDITA", s=opt.grandi?7:5.5;
      const yy = giu ? y-10 : y+10;
      const tri = giu ? `${x-s},${yy-s*1.6} ${x+s},${yy-s*1.6} ${x},${yy}` : `${x-s},${yy+s*1.6} ${x+s},${yy+s*1.6} ${x},${yy}`;
      g+=`<polygon points="${tri}" fill="${giu?"var(--neg)":"var(--good)"}" stroke="var(--surface)" stroke-width="0.8"><title>${e.tipo} ${sxD(e.data)} a ${nf(e.prezzo,2)} (media ${nf(e.ema,2)}) · fino al ${sxD(e.fino_a)}: indice ${pcs(e.var_indice_pct,1)} · ${e.esito}</title></polygon>`; }); }
  host.innerHTML = legenda(ys) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria}">${g}
    <line class="ch" y1="${m.t}" y2="${H-m.b}" stroke="var(--axis)" stroke-dasharray="3 3" style="display:none"/>
    <rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent" class="hov"/></svg><div class="tip"></div>`;
  const svg = host.querySelector("svg"), tip = host.querySelector(".tip"), ch = svg.querySelector(".ch");
  svg.querySelector(".hov").addEventListener("mousemove", ev=>{
    const r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)*(W/r.width);
    const i = Math.max(i0, Math.min(n-1, Math.round(i0 + (px-m.l)/(W-m.l-m.r)*((n-1-i0)||1))));
    const x = X(i); ch.setAttribute("x1",x); ch.setAttribute("x2",x); ch.style.display="block";
    tip.style.display="block"; tip.style.left=Math.min(x/W*r.width+12, r.width-230)+"px"; tip.style.top="8px";
    tip.innerHTML = `${sxD(M.date[i])}<br>` + ys.map(s=>`<span style="color:${s.color}">■</span> ${s.name}: <b>${nf(s.vals[i],2)}</b>`).join("<br>")
      + (opt.fasce?`<br>${M.investito[i]?"investito":"<b class='down'>fuori dal mercato</b>"}${M.ema[i]?` · distanza dalla media ${pcs((M.chiusura[i]/M.ema[i]-1)*100,1)}`:""}`:"");
  });
  svg.addEventListener("mouseleave",()=>{tip.style.display="none"; ch.style.display="none";});
}

async function avviaSpx(){
  const d = await (await fetch("data/spx_segnale.json",{cache:"no-store"})).json();
  const M = d.mensile, S = d.stato, R = d.riepilogo, n = M.date.length;
  document.getElementById("meta").textContent =
    `Dati al ${sxD(d.asof)} · ${d.fonte} dal ${sxD(M.date[0])} (${nf(R.anni,0)} anni) · aggiornato ${d.generato.replace("T"," ").slice(0,16)} UTC`;
  const ult = S.ultimo_segnale;
  let h = sxSez("00","Segnale oggi", `media esponenziale ${d.regola.media_mesi} mesi · banda ±${nf(d.regola.banda_pct,0)}% · controllo a fine mese`);
  h += `<div class="tesi" style="border-left-color:${S.se_chiudesse_oggi==="VENDITA"||S.posizione==="FUORI"?"var(--neg)":"var(--good)"}">
    <b>Posizione:</b> ${sxSt(S.posizione)} · <b>se il mese chiudesse oggi:</b> ${sxSt(S.se_chiudesse_oggi)}.
    S&amp;P 500 a <b>${nf(S.livello,2)}</b>, ${pcs(S.dist_ema_pct,1)} rispetto alla media di fine mese (${nf(S.ema_ultimo_fine_mese,2)}).
    ${S.posizione==="INVESTITO"?`Vendita sotto <b>${nf(S.livello_vendita,2)}</b> alla chiusura del ${sxD(S.prossimo_controllo)} (${pcs(S.variazione_necessaria_pct,1)} da oggi).`
      :`Rientro sopra <b>${nf(S.livello_rientro,2)}</b> alla chiusura del ${sxD(S.prossimo_controllo)} (${pcs(S.variazione_necessaria_pct,1)} da oggi).`}
    ${ult?`Ultimo segnale: ${sxSt(ult.tipo)} a fine ${sxD(ult.data.slice(0,7))} a ${nf(ult.prezzo,2)}.`:""}</div>`;
  h += `<div class="tiles">
    ${tab("Segnali di vendita", n0(R.vendite), "", "dal "+sxD(M.date[0]))}
    ${tab("Vendite seguite da un calo", pc(R.vendite_corrette_pct,0), "", "fino al rientro: il valore sta nei grandi ribassi evitati")}
    ${tab("Tempo fuori dal mercato", pc(R.mesi_fuori_pct,1), "", "dei mesi")}
    ${tab("Max drawdown indice", pc(d.metriche["Intero periodo"]["Indice (buy & hold)"].max_dd_pct,1), "down", "intero periodo")}
    ${tab("Max drawdown con segnale", pc(d.metriche["Intero periodo"]["Con segnale (fuori = liquidità a 0%)"].max_dd_pct,1), "", "intero periodo")}
  </div>`;
  h += sxSez("01","S&P 500 e segnali","scala logaritmica · ▼ vendita · ▲ rientro · fasce = fuori dal mercato");
  const P = [["Tutto",M.date[0]],["Dal 1950","1950-01"],["Dal 1990","1990-01"],["Dal 2000","2000-01"],["Dal 2010","2010-01"],["Dal 2020","2020-01"],["Ultimi 5 anni",null]];
  h += `<div class="panel"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px" id="sxp">${P.map((p,i)=>`<button class="pill${i?"":" on"}" data-i="${i}" style="cursor:pointer">${p[0]}</button>`).join("")}</div>
    <h4>S&amp;P 500 (chiusure di fine mese) e media esponenziale a 10 mesi</h4>
    <p class="cap">Freccia rossa ▼: chiusura di fine mese sotto la media − 1%, vendita alla prima seduta del mese dopo. Freccia verde ▲: sopra la media + 1%, rientro. Passa sulle frecce per l'esito di ogni segnale.</p>
    <div id="sxg"></div></div>`;
  h += `<div class="panel"><h4>Indice tenuto sempre contro indice con il segnale</h4>
    <p class="cap">Rendimenti di prezzo (dividendi esclusi), base 100 all'inizio della finestra; fuori dal mercato la liquidità rende zero, costo 0,10% per operazione.</p><div id="sxe"></div></div>`;
  h += sxSez("02","Rendimento e rischio per periodo");
  const MT = d.metriche, K = Object.keys(MT), N = ["Indice (buy & hold)","Con segnale (fuori = liquidità a 0%)"];
  h += tabella([{t:"Periodo"},{t:"Versione"},{t:"Annuo",n:1},{t:"Volatilità",n:1},{t:"Max drawdown",n:1},{t:"Sharpe",n:1},{t:"Calmar",n:1}],
    K.flatMap(k=>N.map((nm,j)=>{const x=MT[k][nm]; return `<tr><td>${j?"":k}</td><td>${nm}</td><td class="num">${pc(x.cagr_pct,1)}</td><td class="num">${pc(x.vol_pct,1)}</td><td class="num">${pc(x.max_dd_pct,1)}</td><td class="num">${nf(x.sharpe)}</td><td class="num">${nf(x.calmar)}</td></tr>`;})),
    "Rendimenti di prezzo mensili. Con i dividendi entrambe le versioni rendono circa 2-4 punti in più l'anno; la versione con segnale ne incassa meno perché resta fuori una parte del tempo.", "rep");
  h += sxSez("03","Tutti i segnali", `${d.eventi.length} segnali, dal più recente`);
  h += tabella([{t:"Fine mese"},{t:"Segnale"},{t:"S&P 500",n:1},{t:"Media",n:1},{t:"Fino al"},{t:"Mesi",n:1},{t:"Indice nel periodo",n:1},{t:"Esito"}],
    d.eventi.slice().reverse().map(e=>`<tr><td>${sxD(e.data.slice(0,7))}</td><td>${sxSt(e.tipo)}</td><td class="num">${nf(e.prezzo,2)}</td><td class="num">${nf(e.ema,2)}</td><td>${sxD(e.fino_a)}</td><td class="num">${e.mesi}</td><td class="num ${cls(e.var_indice_pct)}">${pcs(e.var_indice_pct,1)}</td><td>${e.esito==="corretto"?'<span class="st ok">corretto</span>':'<span class="st wa">falso</span>'}</td></tr>`),
    "Esito: una vendita è corretta se l'indice è sceso fino al rientro successivo; un rientro se è salito fino alla vendita successiva.", "rep");
  document.getElementById("app").innerHTML = h;
  document.getElementById("piede").textContent = d.disclaimer;

  const inizio = k => { const p=P[k]; if(!p[1]) return Math.max(0,n-61); const i=M.date.findIndex(x=>x>=p[1]); return Math.max(0,i); };
  const disegna = k => {
    const i0 = inizio(k);
    sxGrafico(document.getElementById("sxg"), d, i0, {frecce:true, fasce:true, grandi:(n-i0)<400, aria:"S&P 500 con segnali", serie: ()=>[
      {name:"S&P 500 (fine mese)", color:"var(--s1)", w:1.8, vals:M.chiusura},
      {name:"Media esponenziale 10 mesi", color:"var(--muted)", w:1.3, dash:"5 3", vals:M.ema.map(v=>v||NaN)}]});
    const b = M.buy_hold[i0], s = M.strategia[i0];
    sxGrafico(document.getElementById("sxe"), d, i0, {h:300, aria:"Indice contro indice con segnale", serie: ()=>[
      {name:"Con segnale", color:"var(--s1)", w:2.2, vals:M.strategia.map(v=>v/s*100)},
      {name:"Indice sempre investito", color:"var(--s2)", w:1.6, vals:M.buy_hold.map(v=>v/b*100)}]});
  };
  disegna(0);
  document.querySelectorAll("#sxp button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#sxp button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); disegna(+b.dataset.i);}));
}
