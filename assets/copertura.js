/* VITA 5M · studio di copertura (media esponenziale a 10 mesi) — da data/vita5m_copertura.json */
const CP_LINEE = ["VITA 5M con copertura (EMA 10 mesi)", "VITA 5M senza copertura", "S&P 500 TR (CHF)", "MSCI World TR (CHF)"];
const CP_COL = {"VITA 5M con copertura (EMA 10 mesi)":"var(--s1)", "VITA 5M senza copertura":"var(--s2)",
                "S&P 500 TR (CHF)":"var(--s3)", "MSCI World TR (CHF)":"var(--s4)"};
const cpSez = (n,t,m="") => `<div class="sez"><span class="num">${n}</span><h2>${t}</h2>${m?`<span class="meta">${m}</span>`:""}</div>`;
const cpTd = (v,c="num") => `<td class="${c}">${v}</td>`;
const cpD = s => s ? s.split("-").reverse().join(".") : "—";
const cpStato = s => {
  const c = s==="VENDITA"||s==="RESTA COPERTO"||s==="COPERTO" ? "al" : (s==="RIENTRO"?"wa":"ok");
  return `<span class="st ${c}">${s}</span>`;
};

/* blocco riutilizzato anche nel report reale */
function cpBloccoStato(S, R, link){
  const allarme = S.se_chiudesse_oggi==="VENDITA" || S.stato_regola==="COPERTO";
  return `<div class="tesi" style="border-left-color:${allarme?"var(--neg)":"var(--good)"}">
      <b>Regola:</b> ${cpStato(S.stato_regola)} · <b>se il mese chiudesse oggi:</b> ${cpStato(S.se_chiudesse_oggi)}<br>
      ${S.frase} Prossimo controllo: chiusura del <b>${cpD(S.prossimo_controllo)}</b>
      (${S.giorni_al_controllo} sedute). ${link?`<a href="vita5m-copertura.html">Studio completo</a>.`:""}</div>
    <div class="tiles">
      ${tab("Azionario VITA 5M vs media di fine mese precedente", pcs(S.dist_ema_prec_pct), cls(S.dist_ema_prec_pct), "media "+nf(S.ema_fine_mese_precedente,2)+" · livello "+nf(S.livello,2))}
      ${tab("Vs media stimata a fine mese", pcs(S.dist_ema_stimata_pct), cls(S.dist_ema_stimata_pct), "se il mese chiudesse a questo livello")}
      ${tab("Livello di chiusura che fa vendere", nf(S.livello_chiusura_vendita,2), "", "sotto media − "+nf(R.banda_pct,0)+"%")}
      ${tab(S.stato_regola==="COPERTO"?"Variazione per rientrare":"Margine prima della vendita", pcs(S.variazione_necessaria_pct), cls(-S.variazione_necessaria_pct), "da oggi alla chiusura di fine mese")}
      ${tab("Calo dal massimo a 12 mesi", pc(S.calo_dal_massimo_12m_pct,1), cls(S.calo_dal_massimo_12m_pct), "massimo del "+cpD(S.data_massimo_12m))}
      ${tab("Quota azionario venduta", pc(S.quota_venduta_pct,0), "", "dall'ultimo controllo del "+cpD(S.ultimo_controllo))}
    </div>
    <p class="cap">${S.avvertenza}</p>`;
}

async function avviaCopertura(){
  const d = await (await fetch("data/vita5m_copertura.json",{cache:"no-store"})).json();
  const S = d.stato, R = d.regola, M = d.metriche;
  document.getElementById("meta").textContent =
    `Dati al ${cpD(d.asof)} · aggiornato ${d.generato.replace("T"," ").slice(0,16)} UTC · base CHF · serie dal ${cpD(d.serie.date[0])}`;
  const app = document.getElementById("app");
  const finestre = Object.keys(M);
  let h = "";

  h += cpSez("00","Segnale oggi", `media ${R.media} · banda ±${nf(R.banda_pct,0)}% · vendita ${nf(R.quota_venduta_pct,0)}%`);
  h += cpBloccoStato(S, R, false);

  const dc = M["Dal 2016"], dz = M["Dal 2020"];
  const Lc = CP_LINEE[0], Ls = CP_LINEE[1];
  h += cpSez("01","Sintesi");
  h += `<div class="tesi">Dal ${cpD(d.serie.date[0])} VITA 5M <b>con copertura</b> ha reso <b>${pc(dc[Lc].cagr_pct,1)}</b> l'anno con un drawdown massimo
    di <b>${pc(dc[Lc].max_dd_pct,1)}</b>; <b>senza copertura</b> ${pc(dc[Ls].cagr_pct,1)} l'anno e ${pc(dc[Ls].max_dd_pct,1)}.
    Sharpe ${nf(dc[Lc].sharpe)} contro ${nf(dc[Ls].sharpe)}. Dal 2020: ${pc(dz[Lc].cagr_pct,1)} contro ${pc(dz[Ls].cagr_pct,1)} l'anno,
    drawdown ${pc(dz[Lc].max_dd_pct,1)} contro ${pc(dz[Ls].max_dd_pct,1)}. ${d.fasi.length} periodi di copertura nel campione.</div>`;
  h += `<div class="tiles">${CP_LINEE.map(n=>tab(n, pc(dc[n].cagr_pct,1)+" l'anno", "", "drawdown "+pc(dc[n].max_dd_pct,1)+" · Sharpe "+nf(dc[n].sharpe))).join("")}</div>`;

  h += cpSez("02","Linee di equity a confronto");
  h += `<div class="panel"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px" id="cpfin">${
      ["Dal 2016","Dal 2020","Ultimi 3 anni","Ultimi 12 mesi","Da inizio anno"].map((k,i)=>`<button class="pill${i?"":" on"}" data-k="${k}" style="cursor:pointer">${k}</button>`).join("")}</div>
    <h4>VITA 5M con e senza copertura, S&amp;P 500 e MSCI World, in CHF</h4>
    <p class="cap">Base 100 all'inizio della finestra scelta. Costi di compravendita della copertura inclusi; benchmark total return (CSPX, IWDA) convertiti in CHF.</p>
    <div id="cpeq"></div></div>`;
  h += pannello("Quota dell'azionario venduta dalla regola", "Gradino del 75% nei mesi di copertura: si vende alla prima seduta dopo una chiusura di fine mese sotto la media − 1%.", "cpq");

  h += cpSez("03","Rendimento e rischio per periodo");
  const metRighe = k => CP_LINEE.map(n=>{const x=M[k][n]||{}; return `<tr><td>${n}</td>${cpTd(pcs(x.rend_pct,1))}${cpTd(x.cagr_pct==null?"—":pc(x.cagr_pct,1))}${cpTd(pc(x.vol_pct,1))}${cpTd(pc(x.max_dd_pct,1))}${cpTd(nf(x.sharpe))}${cpTd(nf(x.calmar))}</tr>`;});
  h += `<div class="panel"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px" id="cpmet">${finestre.map((k,i)=>`<button class="pill${i?"":" on"}" data-k="${k}" style="cursor:pointer">${k}</button>`).join("")}</div>
    <div class="scroll"><table class="rep"><thead><tr><th>Linea</th><th class="num">Rendimento</th><th class="num">Annuo</th><th class="num">Volatilità</th><th class="num">Max drawdown</th><th class="num">Sharpe</th><th class="num">Calmar</th></tr></thead>
    <tbody id="cpmetb">${metRighe(finestre[0]).join("")}</tbody></table></div>
    <p class="cap" style="margin:8px 0 0">Sharpe e Calmar senza sottrarre il tasso privo di rischio (CHF vicino a zero nel periodo). Rendimento annuo solo per finestre di almeno un anno.</p></div>`;

  h += cpSez("04","Periodi di copertura", `${d.fasi.length} uscite dal ${cpD(d.serie.date[0])}`);
  h += tabella([{t:"Vendita"},{t:"Rientro"},{t:"Sedute",n:1},{t:"VITA 5M senza copertura",n:1},{t:"VITA 5M con copertura",n:1},{t:"Effetto",n:1}],
    d.fasi.slice().reverse().map(f=>{const e=f.rend_con_pct-f.rend_senza_pct; return `<tr><td>${cpD(f.da)}</td><td>${f.a?cpD(f.a):"<b>in corso</b>"}</td>${cpTd(f.sedute)}${cpTd(pcs(f.rend_senza_pct,1))}${cpTd(pcs(f.rend_con_pct,1))}<td class="num ${cls(e)}">${pcs(e,1)}</td></tr>`;}),
    "Rendimento nel periodo in cui la copertura è attiva. Effetto positivo = la copertura ha evitato perdite; negativo = falso segnale o rimbalzo perso.", "rep");

  h += cpSez("05","Controlli di fine mese", "ultimi 24 mesi");
  h += tabella([{t:"Mese"},{t:"Chiusura azionario",n:1},{t:"Media esp. 10 mesi",n:1},{t:"Distanza",n:1},{t:"Evento"},{t:"Quota venduta dopo",n:1}],
    d.mensile.slice(-24).reverse().map(m=>`<tr><td>${m.mese}</td>${cpTd(nf(m.chiusura,2))}${cpTd(nf(m.ema,2))}<td class="num ${cls(m.dist_pct)}">${pcs(m.dist_pct,2)}</td><td>${m.evento==="—"?"—":cpStato(m.evento)}</td>${cpTd(pc(m.quota_venduta_pct,0))}</tr>`),
    "Indice dell'azionario VITA 5M (WORLD 25, IWMO 25, EIMI 20, FWRA 5, EMVL 5) in CHF, base 100 all'inizio dei dati.", "rep");

  h += cpSez("06","Regola e metodologia");
  h += `<div class="panel"><ol style="margin:4px 0 0 18px;line-height:1.6;font-size:13.5px">
    <li><b>Grandezza</b>: ${R.grandezza}.</li>
    <li><b>Controllo</b>: solo sulla chiusura dell'ultima seduta del mese, contro la media ${R.media}.</li>
    <li><b>Vendita</b>: chiusura sotto la media − ${nf(R.banda_pct,0)}% → ${R.esecuzione} si vende il ${nf(R.quota_venduta_pct,0)}% di ogni linea azionaria; ZGLD resta; liquidità ${R.liquidita}.</li>
    <li><b>Rientro</b>: chiusura sopra la media + ${nf(R.banda_pct,0)}% → ${R.esecuzione} si ricompra tutto ai pesi obiettivo.</li>
    <li><b>Costi</b>: ${nf(R.costo_compravendita_pct,3)}% per compravendita (bollo, negoziazione, cambio sulla parte in USD).</li>
    <li><b>Portafoglio</b>: pesi obiettivo 25/25/20/20/5/5 ribilanciati a fine mese, in entrambe le versioni.</li></ol>
    <p class="cap" style="margin:10px 0 0">Fonti dei prezzi: ${Object.entries(d.fonti).map(([k,v])=>k+" "+v).join(" · ")}.<br>${d.note.join("<br>")}<br>
    Studio di riferimento: documento Claude «VITA 5M dal 2020 — Vendita di azionario a soglie VIX crescenti», sezioni sulla media a 10 mesi (24.11.2026).</p></div>`;

  app.innerHTML = h;
  document.getElementById("piede").textContent = d.disclaimer;

  // grafici
  const D = d.serie.date;
  const disegna = k => {
    const host = document.getElementById("cpeq"); host.innerHTML = "";
    const oggi = new Date(D.at(-1));
    const da = {"Dal 2016":D[0], "Dal 2020":"2020-01-01", "Ultimi 3 anni":new Date(oggi.getFullYear()-3, oggi.getMonth(), oggi.getDate()).toISOString().slice(0,10),
                "Ultimi 12 mesi":new Date(oggi.getFullYear()-1, oggi.getMonth(), oggi.getDate()).toISOString().slice(0,10),
                "Da inizio anno":oggi.getFullYear()+"-01-01"}[k];
    const i0 = Math.max(0, D.findIndex(x=>x>=da));
    const eq = CP_LINEE.map(n=>{const v=d.serie[n], b=v[i0]; return {name:n, color:CP_COL[n], w:n===CP_LINEE[0]?2.6:1.6,
      data:D.slice(i0).map((x,j)=>[x, v[i0+j]/b*100])};});
    const dd = eq.map(s=>{let mx=-1e9; return {name:s.name, color:s.color, data:s.data.map(p=>{mx=Math.max(mx,p[1]); return [p[0], (p[1]/mx-1)*100];})};});
    equityDD(host, eq, dd, {fmt:v=>nf(v,0), tit:"Base 100", h:430});
  };
  disegna("Dal 2016");
  document.querySelectorAll("#cpfin button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#cpfin button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); disegna(b.dataset.k);}));
  document.querySelectorAll("#cpmet button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#cpmet button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
    document.getElementById("cpmetb").innerHTML = metRighe(b.dataset.k).join("");}));
  lineChart(document.getElementById("cpq"), [{name:"Quota venduta (%)", color:"var(--neg)", w:1.8,
    data: D.map((x,i)=>[x, d.serie.quota_venduta_pct[i]])}], {fmt:v=>nf(v,0)+"%", y0:0, y1:100, h:150});
}
