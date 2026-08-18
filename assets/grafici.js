/* grafici.js — formati numerici italiani e primitive SVG condivise da tutte
   le pagine del cruscotto. Nessuna dipendenza esterna. */
/* ------------------------------------------------------------------ formati */
const IT = "it-IT";
const nf = (v,d=2) => (v===null||v===undefined||!isFinite(v)) ? "—"
  : Number(v).toLocaleString(IT,{minimumFractionDigits:d,maximumFractionDigits:d});
const pc = (v,d=2) => (v===null||v===undefined||!isFinite(v)) ? "—" : nf(v,d)+"%";
const pcs= (v,d=2) => (v===null||v===undefined||!isFinite(v)) ? "—" : (v>0?"+":"")+nf(v,d)+"%";
const n0 = v => (v===null||v===undefined||!isFinite(v)) ? "—" : Math.round(v).toLocaleString(IT);
const cls= v => (v===null||v===undefined) ? "" : (v>=0?"up":"down");
const MESI=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const COL=["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--neg)"];
const el = (h) => { const t=document.createElement("template"); t.innerHTML=h.trim(); return t.content.firstChild; };

/* --------------------------------------------------------- primitive grafiche */
function frame(W,H,m){ return {W,H,m,
  X:(t,x0,x1)=>m.l+(t-x0)/((x1-x0)||1)*(W-m.l-m.r),
  Y:(v,y0,y1)=>H-m.b-(v-y0)/((y1-y0)||1)*(H-m.t-m.b)}; }

function assiY(f,y0,y1,fmt,n=4){
  let g="",l="";
  for(let i=0;i<=n;i++){
    const v=y0+(y1-y0)*i/n, y=f.Y(v,y0,y1);
    const zero = Math.abs(v)<1e-9;
    g+=`<line x1="${f.m.l}" x2="${f.W-f.m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
         stroke="${zero?"var(--axis)":"var(--grid)"}" stroke-width="1"/>`;
    l+=`<text x="${f.m.l-7}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10.5"
         fill="var(--muted)" font-variant-numeric="tabular-nums">${fmt(v)}</text>`;
  }
  return g+l;
}
function assiXdate(f,dates,x0,x1,max=9){
  const mesi={};
  dates.forEach(d=>{const k=String(d).slice(0,7); if(!(k in mesi)) mesi[k]=+new Date(d);});
  const e=Object.entries(mesi), step=Math.max(1,Math.ceil(e.length/max));
  let l="";
  e.forEach(([k,t],i)=>{ if(i%step===0)
    l+=`<text x="${f.X(t,x0,x1).toFixed(1)}" y="${f.H-6}" font-size="10.5" text-anchor="middle"
         fill="var(--muted)">${k.slice(5)}/${k.slice(2,4)}</text>`;});
  return l;
}
function legenda(series){
  return `<div class="legend">${series.map((s,i)=>
    `<span><i style="background:${s.color||COL[i%COL.length]}"></i>${s.name}</span>`).join("")}</div>`;
}

/* linea multipla su asse temporale */
function lineChart(host, series, opt={}){
  const W=1000,H=opt.h||280,m={t:12,r:14,b:24,l:opt.l||52};
  const f=frame(W,H,m);
  const all=series.flatMap(s=>s.data);
  if(!all.length) return;
  const ts=all.map(p=>+new Date(p[0])), vs=all.map(p=>p[1]).filter(v=>isFinite(v));
  const x0=Math.min(...ts), x1=Math.max(...ts);
  let y0=Math.min(...vs), y1=Math.max(...vs);
  const pad=(y1-y0)*0.08||1; y0-=pad; y1+=pad;
  if(opt.y0!==undefined) y0=opt.y0;        // limiti espliciti: nessun margine
  if(opt.y1!==undefined) y1=opt.y1;
  if(opt.zero){ y0=Math.min(y0,0); y1=Math.max(y1,0); }
  const fmt=opt.fmt||(v=>nf(v,0));
  let paths="";
  series.forEach((s,i)=>{
    const c=s.color||COL[i%COL.length];
    const d=s.data.filter(p=>isFinite(p[1])).map((p,j)=>(j?"L":"M")+
      f.X(+new Date(p[0]),x0,x1).toFixed(1)+" "+f.Y(p[1],y0,y1).toFixed(1)).join(" ");
    paths+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="${s.w||1.9}"
      stroke-linejoin="round" ${s.dash?`stroke-dasharray="${s.dash}"`:""} opacity="${s.op||1}"/>`;
  });
  host.insertAdjacentHTML("beforeend", legenda(series)+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria||"grafico"}">
      ${assiY(f,y0,y1,fmt)}${assiXdate(f,all.map(p=>p[0]),x0,x1)}${paths}
      <line class="ch" y1="${m.t}" y2="${H-m.b}" stroke="var(--axis)" stroke-dasharray="3 3" style="display:none"/>
      <rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent" class="hov"/>
    </svg><div class="tip"></div>`);
  const svg=host.querySelector("svg:last-of-type"), tip=host.querySelector(".tip:last-of-type");
  const ch=svg.querySelector(".ch");
  svg.querySelector(".hov").addEventListener("mousemove",e=>{
    const r=svg.getBoundingClientRect(), px=(e.clientX-r.left)*(W/r.width);
    const base=series[0].data; let b=0,bd=1e18;
    base.forEach((p,i)=>{const d=Math.abs(f.X(+new Date(p[0]),x0,x1)-px); if(d<bd){bd=d;b=i;}});
    const key=base[b][0], x=f.X(+new Date(key),x0,x1);
    ch.setAttribute("x1",x); ch.setAttribute("x2",x); ch.style.display="block";
    const righe=series.map((s,i)=>{
      const hit=s.data.find(p=>p[0]===key);
      return hit? `<span style="color:${s.color||COL[i%COL.length]}">■</span> ${s.name}: <b>${
        (opt.tfmt||fmt)(hit[1])}</b>`:null;}).filter(Boolean);
    tip.style.display="block";
    tip.style.left=Math.min(x/W*r.width+12, r.width-190)+"px";
    tip.style.top="8px";
    tip.innerHTML=`${key}<br>`+righe.join("<br>");
  });
  svg.addEventListener("mouseleave",()=>{tip.style.display="none";ch.style.display="none";});
}

/* area sotto lo zero (drawdown) */
function areaChart(host, data, opt={}){
  const W=1000,H=opt.h||210,m={t:10,r:14,b:24,l:52};
  const f=frame(W,H,m);
  if(!data.length) return;
  const ts=data.map(p=>+new Date(p[0])), vs=data.map(p=>p[1]);
  const x0=Math.min(...ts), x1=Math.max(...ts);
  const y0=Math.min(...vs)*1.12, y1=0;
  const pts=data.map(p=>`${f.X(+new Date(p[0]),x0,x1).toFixed(1)} ${f.Y(p[1],y0,y1).toFixed(1)}`);
  const d=`M${f.X(ts[0],x0,x1).toFixed(1)} ${f.Y(0,y0,y1)} L`+pts.join(" L")+
          ` L${f.X(ts[ts.length-1],x0,x1).toFixed(1)} ${f.Y(0,y0,y1)} Z`;
  host.insertAdjacentHTML("beforeend",
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="drawdown">
      ${assiY(f,y0,y1,v=>nf(v,1)+"%",4)}${assiXdate(f,data.map(p=>p[0]),x0,x1)}
      <path d="${d}" fill="var(--neg)" fill-opacity=".22" stroke="var(--neg)" stroke-width="1.6"/>
    </svg>`);
}

/* barre categoriali */
function barChart(host, entries, opt={}){
  const W=1000,H=opt.h||230,m={t:14,r:14,b:opt.b||30,l:56};
  const f=frame(W,H,m);
  if(!entries.length) return;
  const vs=entries.map(e=>e[1]).filter(v=>isFinite(v));
  const lim=Math.max(...vs.map(Math.abs))*1.16||1;
  const y0=opt.pos?0:-lim, y1=lim;
  const bw=Math.min(opt.bw||58,(W-m.l-m.r)/entries.length-6);
  let bars="",lab="";
  entries.forEach((e,i)=>{
    const [k,v]=e;
    if(!isFinite(v)) return;
    const x=m.l+(i+0.5)*(W-m.l-m.r)/entries.length-bw/2;
    const yz=f.Y(0,y0,y1), yv=f.Y(v,y0,y1);
    const top=Math.min(yz,yv), h=Math.max(2,Math.abs(yv-yz));
    const c=opt.color||(v>=0?"var(--s1)":"var(--neg)");
    bars+=`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
      rx="3" fill="${c}"/>`;
    if(opt.valori) bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${(v>=0?top-4:top+h+11).toFixed(1)}"
      text-anchor="middle" font-size="10.5" fill="var(--ink2)"
      font-variant-numeric="tabular-nums">${pcs(v,opt.vd??1)}</text>`;
    lab+=`<text x="${(x+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10.5"
      fill="var(--muted)">${k}</text>`;
  });
  host.insertAdjacentHTML("beforeend",
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria||"barre"}">
      ${assiY(f,y0,y1,v=>nf(v,1)+"%",4)}${bars}${lab}</svg>`);
}

/* barre orizzontali appaiate (peso vs quota di rischio) */
function barPair(host, righe, opt={}){
  const H=Math.max(120, righe.length*34+34), W=1000, m={t:8,r:60,b:22,l:150};
  const max=Math.max(...righe.flatMap(r=>[r.a,r.b]))*1.1||1;
  const larg=W-m.l-m.r;
  let s="";
  righe.forEach((r,i)=>{
    const y=m.t+i*34;
    s+=`<text x="${m.l-8}" y="${y+13}" text-anchor="end" font-size="11.5" fill="var(--ink2)">${r.k}</text>`;
    s+=`<rect x="${m.l}" y="${y}" width="${(r.a/max*larg).toFixed(1)}" height="11" rx="2.5" fill="var(--s1)"/>`;
    s+=`<rect x="${m.l}" y="${y+13}" width="${(r.b/max*larg).toFixed(1)}" height="11" rx="2.5" fill="var(--s2)"/>`;
    s+=`<text x="${(m.l+Math.max(r.a,r.b)/max*larg+7).toFixed(1)}" y="${y+16}" font-size="11"
         fill="var(--muted)" font-variant-numeric="tabular-nums">${pc(r.a,1)} / ${pc(r.b,1)}</text>`;
  });
  host.insertAdjacentHTML("beforeend",
    legenda([{name:opt.a||"peso",color:"var(--s1)"},{name:opt.b||"quota di rischio",color:"var(--s2)"}])+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="peso e rischio">${s}</svg>`);
}

/* istogramma con normale sovrapposta */
function histChart(host, h){
  const W=1000,H=250,m={t:12,r:14,b:28,l:48};
  const f=frame(W,H,m);
  const x0=Math.min(...h.centri_pct), x1=Math.max(...h.centri_pct);
  const y1=Math.max(...h.conteggi, ...h.normale)*1.08;
  const bw=(W-m.l-m.r)/h.centri_pct.length*0.86;
  let bars="";
  h.centri_pct.forEach((c,i)=>{
    const x=f.X(c,x0,x1)-bw/2, y=f.Y(h.conteggi[i],0,y1);
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}"
      height="${(f.Y(0,0,y1)-y).toFixed(1)}" fill="${c<0?"var(--neg)":"var(--s1)"}" opacity=".72"/>`;
  });
  const norm=h.centri_pct.map((c,i)=>(i?"L":"M")+f.X(c,x0,x1).toFixed(1)+" "+f.Y(h.normale[i],0,y1).toFixed(1)).join(" ");
  let lab="";
  for(let i=0;i<=6;i++){
    const v=x0+(x1-x0)*i/6;
    lab+=`<text x="${f.X(v,x0,x1).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10.5"
      fill="var(--muted)">${nf(v,1)}%</text>`;
  }
  host.insertAdjacentHTML("beforeend",
    legenda([{name:"frequenza osservata",color:"var(--s1)"},{name:"normale con stessa media e σ",color:"var(--s3)"}])+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="distribuzione dei rendimenti">
      ${assiY(f,0,y1,v=>nf(v,0),4)}${bars}
      <path d="${norm}" fill="none" stroke="var(--s3)" stroke-width="2"/>${lab}</svg>`);
}

/* dispersione (QQ, oppure portafoglio vs benchmark) */
function scatter(host, punti, opt={}){
  const W=1000,H=opt.h||280,m={t:12,r:14,b:30,l:52};
  const f=frame(W,H,m);
  const xs=punti.map(p=>p[0]), ys=punti.map(p=>p[1]);
  const lo=Math.min(...xs,...ys)*1.05, hi=Math.max(...xs,...ys)*1.05;
  const pts=punti.map(p=>`<circle cx="${f.X(p[0],lo,hi).toFixed(1)}" cy="${f.Y(p[1],lo,hi).toFixed(1)}"
    r="2.2" fill="var(--s1)" opacity=".62"/>`).join("");
  const diag=`M${f.X(lo,lo,hi)} ${f.Y(lo,lo,hi)} L${f.X(hi,lo,hi)} ${f.Y(hi,lo,hi)}`;
  let lab="";
  for(let i=0;i<=6;i++){
    const v=lo+(hi-lo)*i/6;
    lab+=`<text x="${f.X(v,lo,hi).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10.5"
      fill="var(--muted)">${nf(v,1)}%</text>`;
  }
  host.insertAdjacentHTML("beforeend",
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria||"dispersione"}">
      ${assiY(f,lo,hi,v=>nf(v,1)+"%",4)}
      <path d="${diag}" stroke="var(--s3)" stroke-width="1.5" stroke-dasharray="5 4" fill="none"/>
      ${pts}${lab}
      <text x="${W/2}" y="${H+2}" text-anchor="middle" font-size="11" fill="var(--muted)">${opt.xl||""}</text>
    </svg>`);
}

/* cono di volatilità: bande min–max, quartili, valore corrente */
function conoVol(host, cono){
  const W=1000,H=250,m={t:14,r:20,b:32,l:52};
  const f=frame(W,H,m);
  const y1=Math.max(...cono.map(c=>c.max_pct))*1.08, y0=0;
  const passo=(W-m.l-m.r)/cono.length;
  let s="";
  cono.forEach((c,i)=>{
    const x=m.l+passo*(i+0.5);
    const w=passo*0.34;
    s+=`<line x1="${x}" x2="${x}" y1="${f.Y(c.min_pct,y0,y1)}" y2="${f.Y(c.max_pct,y0,y1)}"
         stroke="var(--axis)" stroke-width="1.4"/>`;
    s+=`<rect x="${x-w}" y="${f.Y(c.p75_pct,y0,y1)}" width="${w*2}"
         height="${(f.Y(c.p25_pct,y0,y1)-f.Y(c.p75_pct,y0,y1)).toFixed(1)}"
         fill="var(--s1)" opacity=".2" stroke="var(--s1)" stroke-width="1"/>`;
    s+=`<line x1="${x-w}" x2="${x+w}" y1="${f.Y(c.mediana_pct,y0,y1)}" y2="${f.Y(c.mediana_pct,y0,y1)}"
         stroke="var(--s1)" stroke-width="2.2"/>`;
    s+=`<circle cx="${x}" cy="${f.Y(c.corrente_pct,y0,y1)}" r="4.5" fill="var(--s2)"
         stroke="var(--surface)" stroke-width="1.6"/>`;
    s+=`<text x="${x}" y="${H-9}" text-anchor="middle" font-size="11" fill="var(--muted)">${c.finestra_gg} gg</text>`;
  });
  host.insertAdjacentHTML("beforeend",
    legenda([{name:"intervallo min–max",color:"var(--axis)"},{name:"quartili e mediana",color:"var(--s1)"},
             {name:"volatilità corrente",color:"var(--s2)"}])+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="cono di volatilità">
      ${assiY(f,y0,y1,v=>nf(v,0)+"%",4)}${s}</svg>`);
}

/* ventaglio delle proiezioni bootstrap */
function fanChart(host, bs){
  const chiavi=Object.keys(bs).filter(k=>k!=="_meta");
  const W=1000,H=260,m={t:14,r:16,b:30,l:56};
  const f=frame(W,H,m);
  const tutti=chiavi.flatMap(k=>[bs[k].p05_pct,bs[k].p95_pct]);
  const y0=Math.min(0,...tutti)*1.1, y1=Math.max(...tutti)*1.08;
  const X=i=>m.l+(i+0.5)*(W-m.l-m.r)/chiavi.length;
  const banda=(a,b,c,o)=>`<path d="M${X(0)} ${f.Y(bs[chiavi[0]][a],y0,y1)} `+
    chiavi.map((k,i)=>`L${X(i)} ${f.Y(bs[k][a],y0,y1)}`).join(" ")+" "+
    chiavi.slice().reverse().map((k,i)=>`L${X(chiavi.length-1-i)} ${f.Y(bs[k][b],y0,y1)}`).join(" ")+
    `Z" fill="${c}" opacity="${o}"/>`;
  const linea=(a,c,w)=>`<path d="${chiavi.map((k,i)=>(i?"L":"M")+X(i)+" "+f.Y(bs[k][a],y0,y1)).join(" ")}"
    fill="none" stroke="${c}" stroke-width="${w}"/>`;
  let lab="";
  chiavi.forEach((k,i)=>{
    lab+=`<text x="${X(i)}" y="${H-9}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${k.replace("a"," anno"+(k[0]==="1"?"":"i"))}</text>`;
    lab+=`<text x="${X(i)}" y="${f.Y(bs[k].mediana_pct,y0,y1)-8}" text-anchor="middle" font-size="11"
      fill="var(--ink2)" font-variant-numeric="tabular-nums">${pcs(bs[k].mediana_pct,0)}</text>`;
  });
  host.insertAdjacentHTML("beforeend",
    legenda([{name:"5°–95° percentile",color:"var(--s1)"},{name:"25°–75° percentile",color:"var(--s1)"},
             {name:"mediana",color:"var(--s2)"}])+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="proiezione bootstrap">
      ${assiY(f,y0,y1,v=>nf(v,0)+"%",4)}
      ${banda("p05_pct","p95_pct","var(--s1)",".14")}
      ${banda("p25_pct","p75_pct","var(--s1)",".28")}
      ${linea("mediana_pct","var(--s2)",2.4)}${lab}</svg>`);
}

/* mappa di calore delle correlazioni */
function heatmap(host, labels, matrix){
  const n=labels.length;
  const cella=Math.min(64, 760/n), lato=cella*n, ml=Math.min(150, 106+n*2);
  const W=ml+lato+16, H=56+lato;
  const col=v=>{
    const t=Math.max(-1,Math.min(1,v));
    return t>=0 ? `rgba(42,120,214,${(0.10+0.72*t).toFixed(3)})`
                : `rgba(217,58,56,${(0.10+0.72*-t).toFixed(3)})`;};
  let s="";
  labels.forEach((l,j)=>{
    s+=`<text x="${ml+cella*(j+0.5)}" y="${44}" text-anchor="middle" font-size="10.5"
      fill="var(--muted)" transform="rotate(-38 ${ml+cella*(j+0.5)} 44)">${l.length>13?l.slice(0,12)+"…":l}</text>`;});
  labels.forEach((l,i)=>{
    s+=`<text x="${ml-8}" y="${56+cella*(i+0.62)}" text-anchor="end" font-size="11"
      fill="var(--ink2)">${l.length>17?l.slice(0,16)+"…":l}</text>`;
    matrix[i].forEach((v,j)=>{
      s+=`<rect x="${ml+cella*j}" y="${56+cella*i}" width="${cella-1.5}" height="${cella-1.5}"
        rx="2.5" fill="${col(v)}"/>`;
      s+=`<text x="${ml+cella*(j+0.5)}" y="${56+cella*(i+0.62)}" text-anchor="middle" font-size="${cella>44?11:9.5}"
        fill="var(--ink)" font-variant-numeric="tabular-nums">${nf(v,2)}</text>`;});});
  host.insertAdjacentHTML("beforeend",
    `<div class="scroll"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(340,W*0.62)}px"
      role="img" aria-label="matrice di correlazione">${s}</svg></div>`);
}

/* ------------------------------------------------------------- costruzione */
const tab=(k,v,c="",n="") => `<div class="tile"><div class="k">${k}</div>
  <div class="v ${c}">${v}</div>${n?`<div class="n">${n}</div>`:""}</div>`;
const tabB=(k,v,c="",n="") => `<div class="tile big"><div class="k">${k}</div>
  <div class="v ${c}">${v}</div>${n?`<div class="n">${n}</div>`:""}</div>`;

function pannello(titolo, cap, id){
  return `<div class="panel"><h4>${titolo}</h4>${cap?`<p class="cap">${cap}</p>`:""}<div id="${id}"></div></div>`;
}
function tabella(intest, righe, nota="", cl=""){
  return `<div class="panel"><div class="scroll"><table class="${cl}"><thead><tr>${
    intest.map(h=>`<th class="${h.n?"num":""}">${h.t}</th>`).join("")}</tr></thead>
    <tbody>${Array.isArray(righe)?righe.join(""):righe}</tbody></table></div>${nota?`<p class="cap" style="margin:8px 0 0">${nota}</p>`:""}</div>`;
}

/* equity con drawdown in sottografico: due riquadri, un solo asse dei tempi.
   eq e dd sono liste di serie {name, data:[[data,valore]], color}; le date
   delle due liste devono coincidere perché il crosshair legge lo stesso indice. */
function equityDD(host, eq, dd, opt={}){
  const W=1000, H=opt.h||400, m={t:28,r:14,b:26,l:58}, gap=34;
  const disp=H-m.t-m.b-gap, hT=Math.round(disp*0.66), hB=disp-hT;
  const yT0=m.t, yT1=m.t+hT, yB0=yT1+gap, yB1=yB0+hB;
  const tutti=eq.flatMap(s=>s.data);
  if(!tutti.length) return;
  const ts=tutti.map(p=>+new Date(p[0]));
  const x0=Math.min(...ts), x1=Math.max(...ts);
  const X=t=>m.l+(t-x0)/((x1-x0)||1)*(W-m.l-m.r);
  const ev=tutti.map(p=>p[1]).filter(isFinite);
  let e0=Math.min(...ev), e1=Math.max(...ev);
  const pad=(e1-e0)*0.07||1; e0-=pad; e1+=pad;
  const YT=v=>yT1-(v-e0)/((e1-e0)||1)*hT;
  const dv=dd.flatMap(s=>s.data.map(p=>p[1])).filter(isFinite);
  const d0=Math.min(...dv,-0.5)*1.12, d1=0;
  const YB=v=>yB0+(v-d1)/((d0-d1)||1)*hB;
  const fmtE=opt.fmt||(v=>nf(v,0));

  let g="", l="";
  for(let i=0;i<=4;i++){                       // griglia del riquadro superiore
    const v=e0+(e1-e0)*i/4, y=YT(v);
    g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
        stroke="var(--grid)" stroke-width="1"/>`;
    l+=`<text x="${m.l-7}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10.5"
        fill="var(--muted)" font-variant-numeric="tabular-nums">${fmtE(v)}</text>`;
  }
  for(let i=0;i<=2;i++){                       // griglia del riquadro inferiore
    const v=d1+(d0-d1)*i/2, y=YB(v);
    g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
        stroke="${i===0?"var(--axis)":"var(--grid)"}" stroke-width="1"/>`;
    l+=`<text x="${m.l-7}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10.5"
        fill="var(--muted)" font-variant-numeric="tabular-nums">${nf(v,0)}%</text>`;
  }
  const mesi={};
  tutti.forEach(p=>{const k=String(p[0]).slice(0,7); if(!(k in mesi)) mesi[k]=+new Date(p[0]);});
  const en=Object.entries(mesi), step=Math.max(1,Math.ceil(en.length/10));
  en.forEach(([k,t],i)=>{ if(i%step===0)
    l+=`<text x="${X(t).toFixed(1)}" y="${H-6}" font-size="10.5" text-anchor="middle"
        fill="var(--muted)">${k.slice(5)}/${k.slice(2,4)}</text>`;});

  let dis="";
  eq.forEach((s,i)=>{                          // equity: linea con velo sottostante
    const c=s.color||COL[i%COL.length];
    const pts=s.data.filter(p=>isFinite(p[1]));
    const d=pts.map((p,j)=>(j?"L":"M")+X(+new Date(p[0])).toFixed(1)+" "+YT(p[1]).toFixed(1)).join(" ");
    if(eq.length===1)
      dis+=`<path d="${d} L${X(+new Date(pts[pts.length-1][0])).toFixed(1)} ${yT1}
             L${X(+new Date(pts[0][0])).toFixed(1)} ${yT1} Z" fill="${c}" fill-opacity=".10"/>`;
    dis+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="${s.w||2.4}" stroke-linejoin="round"/>`;
  });
  dd.forEach((s,i)=>{                          // drawdown: area sotto lo zero
    const c=s.color||(dd.length===1?"var(--neg)":COL[i%COL.length]);
    const pts=s.data.filter(p=>isFinite(p[1]));
    const d=pts.map((p,j)=>(j?"L":"M")+X(+new Date(p[0])).toFixed(1)+" "+YB(p[1]).toFixed(1)).join(" ");
    dis+=`<path d="M${X(+new Date(pts[0][0])).toFixed(1)} ${YB(0)} ${d.slice(1)}
           L${X(+new Date(pts[pts.length-1][0])).toFixed(1)} ${YB(0)} Z"
          fill="${c}" fill-opacity="${dd.length===1?".24":".13"}"/>`;
    dis+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"/>`;
  });

  const eti=(t,y)=>`<text x="${m.l}" y="${y}" font-size="10.5" fill="var(--muted)"
    letter-spacing=".06em">${t}</text>`;
  host.insertAdjacentHTML("beforeend",
    (eq.length>1?legenda(eq):"")+
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria||"equity e drawdown"}">
      ${g}${l}
      ${eti((opt.tit||"EQUITY").toUpperCase(), yT0-11)}
      ${eti("DRAWDOWN", yB0-11)}
      <line x1="${m.l}" x2="${W-m.r}" y1="${yT1}" y2="${yT1}" stroke="var(--axis)"/>
      ${dis}
      <line class="ch" y1="${yT0}" y2="${yB1}" stroke="var(--axis)" stroke-dasharray="3 3" style="display:none"/>
      <circle class="pt" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" style="display:none"/>
      <rect x="${m.l}" y="${yT0}" width="${W-m.l-m.r}" height="${yB1-yT0}" fill="transparent" class="hov"/>
    </svg><div class="tip"></div>`);
  const svg=host.querySelector("svg:last-of-type"), tip=host.querySelector(".tip:last-of-type");
  const ch=svg.querySelector(".ch"), pt=svg.querySelector(".pt");
  svg.querySelector(".hov").addEventListener("mousemove",e=>{
    const r=svg.getBoundingClientRect(), px=(e.clientX-r.left)*(W/r.width);
    const base=eq[0].data; let b=0,bd=1e18;
    base.forEach((p,i)=>{const d=Math.abs(X(+new Date(p[0]))-px); if(d<bd){bd=d;b=i;}});
    const key=base[b][0], x=X(+new Date(key));
    ch.setAttribute("x1",x); ch.setAttribute("x2",x); ch.style.display="block";
    pt.setAttribute("cx",x); pt.setAttribute("cy",YT(base[b][1])); pt.style.display="block";
    pt.setAttribute("fill", eq[0].color||COL[0]);
    const righe=eq.map((s,i)=>{ const h=s.data.find(p=>p[0]===key); if(!h) return null;
      const q=(dd[i]||dd[0]).data.find(p=>p[0]===key);
      return `<span style="color:${s.color||COL[i%COL.length]}">■</span> ${s.name}: <b>${
        (opt.tfmt||fmtE)(h[1])}</b>${q?`  ·  DD <b class="down">${nf(q[1],2)}%</b>`:""}`;
    }).filter(Boolean);
    tip.style.display="block";
    tip.style.left=Math.min(x/W*r.width+12, r.width-230)+"px";
    tip.style.top="8px";
    tip.innerHTML=`${key}<br>`+righe.join("<br>");
  });
  svg.addEventListener("mouseleave",()=>{tip.style.display="none";ch.style.display="none";pt.style.display="none";});
}
