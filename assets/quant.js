/* quant.js — motore statistico lato browser.
   Ricalcola l'intero blocco di metriche su un intervallo di date scelto da chi
   legge, a partire dalla serie giornaliera del NAV in punti indice.
   Convenzioni identiche alla versione Python: rendimenti semplici, 252 giorni
   di borsa per anno, VaR e CVaR positivi (perdita), drawdown negativi. */
(function(glob){
"use strict";
const TD = 252, Z95 = 1.6448536, Z99 = 2.3263479;

/* --------------------------------------------------- funzioni speciali */
function erf(x){                     // Abramowitz-Stegun 7.1.26
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1/(1+0.3275911*x);
  const y = 1 - ((((1.061405429*t - 1.453152027)*t + 1.421413741)*t
            - 0.284496736)*t + 0.254829592)*t*Math.exp(-x*x);
  return s*y;
}
const normCdf = z => 0.5*(1+erf(z/Math.SQRT2));
function normPpf(p){                 // Acklam, precisione ~1e-9
  if(p<=0) return -Infinity; if(p>=1) return Infinity;
  const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,
           1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00],
        b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,
           6.680131188771972e+01,-1.328068155288572e+01],
        c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,
           -2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00],
        d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,
           3.754408661907416e+00];
  const pl=0.02425;
  let q,r;
  if(p<pl){ q=Math.sqrt(-2*Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if(p>1-pl){ q=Math.sqrt(-2*Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q=p-0.5; r=q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
         (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function lnGamma(x){                 // Lanczos
  const g=[676.5203681218851,-1259.1392167224028,771.32342877765313,
           -176.61502916214059,12.507343278686905,-0.13857109526572012,
           9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<0.5) return Math.log(Math.PI/Math.sin(Math.PI*x))-lnGamma(1-x);
  x-=1; let a=0.99999999999980993, t=x+7.5;
  for(let i=0;i<8;i++) a+=g[i]/(x+i+1);
  return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a);
}
function gammaIncLower(s,x){         // P(s,x) regolarizzata
  if(x<0||s<=0) return NaN;
  if(x===0) return 0;
  if(x < s+1){                       // serie
    let sum=1/s, term=sum;
    for(let n=1;n<600;n++){ term*=x/(s+n); sum+=term; if(Math.abs(term)<Math.abs(sum)*1e-14) break; }
    return sum*Math.exp(-x+s*Math.log(x)-lnGamma(s));
  }
  let b=x+1-s, c=1e300, d=1/b, h=d;   // frazione continua per Q
  for(let i=1;i<600;i++){
    const an=-i*(i-s);
    b+=2; d=an*d+b; if(Math.abs(d)<1e-300) d=1e-300;
    c=b+an/c;       if(Math.abs(c)<1e-300) c=1e-300;
    d=1/d; const del=d*c; h*=del;
    if(Math.abs(del-1)<1e-14) break;
  }
  return 1 - Math.exp(-x+s*Math.log(x)-lnGamma(s))*h;
}
const chi2Sf = (q,df) => 1 - gammaIncLower(df/2, q/2);

/* ------------------------------------------------------ utilità serie */
const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
function sd(a, ddof=1){
  if(a.length<=ddof) return NaN;
  const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-ddof));
}
function quantile(sorted, p){        // interpolazione lineare, come numpy
  const n=sorted.length; if(!n) return NaN;
  const h=(n-1)*p, lo=Math.floor(h), hi=Math.ceil(h);
  return sorted[lo]+(h-lo)*(sorted[hi]-sorted[lo]);
}
const asc = a => Float64Array.from(a).sort();
function momento(a, k){
  const m=mean(a), n=a.length;
  let s2=0, sk=0;
  for(const v of a){ const d=v-m; s2+=d*d; sk+=Math.pow(d,k); }
  return {m, m2:s2/n, mk:sk/n};
}
function skewness(a){ const {m2,mk}=momento(a,3); return mk/Math.pow(m2,1.5); }
function kurtosisEcc(a){ const {m2,mk}=momento(a,4); return mk/(m2*m2)-3; }

const rendimenti = nav => { const r=new Array(nav.length-1);
  for(let i=1;i<nav.length;i++) r[i-1]=nav[i]/nav[i-1]-1; return r; };

/* aggrega la serie a fine periodo: 'M' mese, 'Q' trimestre, 'Y' anno */
function finePeriodo(date, nav, tipo){
  const chiave = d => tipo==="M" ? d.slice(0,7)
    : tipo==="Q" ? d.slice(0,4)+"T"+(Math.floor((+d.slice(5,7)-1)/3)+1)
    : d.slice(0,4);
  const out=[];
  for(let i=0;i<date.length;i++){
    const k=chiave(date[i]);
    if(out.length && out[out.length-1].k===k){ out[out.length-1].v=nav[i]; out[out.length-1].d=date[i]; }
    else out.push({k, v:nav[i], d:date[i]});
  }
  return out;
}
function rendPeriodo(date, nav, tipo){
  const p=finePeriodo(date,nav,tipo);
  const out=[];
  for(let i=1;i<p.length;i++) out.push({k:p[i].k, v:p[i].v/p[i-1].v-1, d:p[i].d});
  return out;
}

/* ------------------------------------------------------------ drawdown */
function ddSerie(nav){
  const out=new Array(nav.length); let picco=-Infinity;
  for(let i=0;i<nav.length;i++){ if(nav[i]>picco) picco=nav[i]; out[i]=nav[i]/picco-1; }
  return out;
}
function giorniTra(a,b){ return Math.round((Date.parse(b)-Date.parse(a))/86400000); }

function episodiDrawdown(date, nav, top=8){
  const dd=ddSerie(nav), epis=[];
  let inDD=false, iniz=0;
  for(let i=0;i<dd.length;i++){
    if(!inDD && dd[i]<0){ inDD=true; iniz=i; }
    else if(inDD && dd[i]>=0){
      let mi=iniz; for(let j=iniz;j<=i;j++) if(dd[j]<dd[mi]) mi=j;
      epis.push({i:iniz, mi, rec:i, prof:dd[mi]}); inDD=false;
    }
  }
  if(inDD){ let mi=iniz; for(let j=iniz;j<dd.length;j++) if(dd[j]<dd[mi]) mi=j;
    epis.push({i:iniz, mi, rec:null, prof:dd[mi]}); }
  epis.sort((a,b)=>a.prof-b.prof);
  const fine=date.length-1;
  const piccoDi = e => { let pk=e.i; for(let j=0;j<=e.i;j++) if(nav[j]>=nav[pk]) pk=j; return pk; };
  const durate = epis.map(e=>giorniTra(date[piccoDi(e)], date[e.rec===null?fine:e.rec]));
  return {tutti:epis, durate, top: epis.slice(0,top).map(e=>{
    const pk=piccoDi(e);
    const recD = e.rec===null?null:date[e.rec];
    return {picco:date[pk], minimo:date[e.mi], recupero:recD,
      profondita_pct:e.prof*100,
      giorni_caduta:giorniTra(date[pk],date[e.mi]),
      giorni_recupero:recD?giorniTra(date[e.mi],recD):null,
      giorni_totali:giorniTra(date[pk], recD||date[fine]),
      in_corso:recD===null};})};
}

/* ------------------------------------------------------- VaR e affini */
function varCvar(r, level){
  const s=asc(r), q=quantile(s,1-level), z=level===0.99?Z99:Z95;
  const mu=mean(r), dev=sd(r), sk=skewness(r), ku=kurtosisEcc(r);
  const zcf=z+(z*z-1)*sk/6+(z*z*z-3*z)*ku/24-(2*z*z*z-5*z)*sk*sk/36;
  let som=0,n=0; for(const v of r) if(v<=q){som+=v;n++;}
  return {hist:-q, param:z*dev-mu, cf:zcf*dev-mu, cvar:n?-som/n:-q};
}
function downsideDev(r, soglia=0){
  let s=0,n=0; for(const v of r) if(v<soglia){ const d=v-soglia; s+=d*d; n++; }
  return n?Math.sqrt(s/n):0;
}
function omega(r, soglia=0){
  let su=0,giu=0; for(const v of r){ if(v>soglia) su+=v-soglia; else giu+=soglia-v; }
  return giu>0?su/giu:null;
}
function kappa(r,n=3){
  let s=0,c=0; for(const v of r) if(v<0){ s+=Math.pow(-v,n); c++; }
  if(!c) return null;
  const lpm=s/c;
  if(lpm<=0) return null;
  return mean(r)*TD/(Math.pow(lpm,1/n)*Math.pow(TD,1/n));
}
function ewmaVol(r, lam=0.94){
  const out=new Array(r.length); let v=r[0]*r[0];
  for(let i=0;i<r.length;i++){ v=lam*v+(1-lam)*r[i]*r[i]; out[i]=Math.sqrt(v*TD); }
  return out;
}
function hurst(r){
  if(r.length<120) return null;
  const xs=[], ys=[];
  for(const w of [10,20,40,80,160,320]){
    if(w*2>r.length) break;
    const val=[];
    for(let i=0;i+w<=r.length;i+=w){
      const seg=r.slice(i,i+w), m=mean(seg);
      let cum=0, mx=-Infinity, mn=Infinity;
      for(const v of seg){ cum+=v-m; if(cum>mx)mx=cum; if(cum<mn)mn=cum; }
      const S=sd(seg);
      if(S>0) val.push((mx-mn)/S);
    }
    if(val.length){ xs.push(Math.log(w)); ys.push(Math.log(mean(val))); }
  }
  if(xs.length<3) return null;
  return ols(xs,ys).slope;
}
function ljungBox(r, lags=10){
  const m=mean(r), n=r.length;
  let den=0; for(const v of r) den+=(v-m)*(v-m);
  const acf=[];
  for(let k=1;k<=lags;k++){
    let s=0; for(let i=k;i<n;i++) s+=(r[i]-m)*(r[i-k]-m);
    acf.push(s/den);
  }
  let q=0; for(let k=0;k<lags;k++) q+=acf[k]*acf[k]/(n-k-1);
  q*=n*(n+2);
  return {Q:q, p_value:chi2Sf(q,lags), lags, acf1:acf[0]};
}
function ols(x,y){
  const n=x.length, mx=mean(x), my=mean(y);
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){ const a=x[i]-mx, b=y[i]-my; sxy+=a*b; sxx+=a*a; syy+=b*b; }
  const slope=sxy/sxx;
  return {slope, intercept:my-slope*mx, r: sxy/Math.sqrt(sxx*syy)};
}

/* ------------------------------------- Sharpe probabilistico e deflazionato */
function psr(srAnn, n, sk, ku, srBenchAnn=0){
  if(n<30) return null;
  const s=srAnn/Math.sqrt(TD), b=srBenchAnn/Math.sqrt(TD);
  const den=Math.sqrt(1-sk*s+(ku+2)/4*s*s);
  if(!(den>0)) return null;
  return normCdf((s-b)*Math.sqrt(n-1)/den);
}
function dsr(srAnn, n, sk, ku, nProve){
  if(n<30||nProve<2) return null;
  const v=1/(n-1), e=0.5772156649;
  const z1=normPpf(1-1/nProve), z2=normPpf(1-1/(nProve*Math.E));
  const sr0=Math.sqrt(v)*((1-e)*z1+e*z2);
  return psr(srAnn, n, sk, ku, sr0*Math.sqrt(TD));
}

/* ------------------------------------------------------------ bootstrap */
function rngLcg(seme){ let s=seme>>>0;
  return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function bootstrap(r, anni=[1,3,5], nSim=6000, blocco=21, seme=20260818){
  if(r.length<120) return null;
  const rnd=rngLcg(seme), x=Float64Array.from(r), n=x.length, out={};
  for(const a of anni){
    const h=Math.round(TD*a), nBl=Math.ceil(h/blocco);
    const fin=new Float64Array(nSim), ddm=new Float64Array(nSim);
    for(let s=0;s<nSim;s++){
      let val=1, picco=1, minDd=0, t=0;
      for(let b=0;b<nBl && t<h;b++){
        const st=Math.floor(rnd()*(n-blocco));
        for(let j=0;j<blocco && t<h;j++,t++){
          val*=1+x[st+j];
          if(val>picco) picco=val;
          const d=val/picco-1; if(d<minDd) minDd=d;
        }
      }
      fin[s]=val; ddm[s]=minDd;
    }
    const sf=Float64Array.from(fin).sort(), sd_=Float64Array.from(ddm).sort();
    let nPer=0, nM10=0, nP20=0, cSom=0, cN=0;
    const q05=quantile(sf,0.05);
    for(const v of fin){ if(v<1)nPer++; if(v<0.90)nM10++; if(v>1.20)nP20++;
      if(v<=q05){cSom+=v;cN++;} }
    out[a+"a"]={
      p05_pct:(quantile(sf,0.05)-1)*100, p25_pct:(quantile(sf,0.25)-1)*100,
      mediana_pct:(quantile(sf,0.5)-1)*100, p75_pct:(quantile(sf,0.75)-1)*100,
      p95_pct:(quantile(sf,0.95)-1)*100,
      prob_perdita_pct:nPer/nSim*100, prob_sotto_meno10_pct:nM10/nSim*100,
      prob_sopra_piu20_pct:nP20/nSim*100,
      cvar95_finale_pct:(cN?cSom/cN:1)*100-100,
      dd_atteso_mediano_pct:quantile(sd_,0.5)*100, dd_p95_pct:quantile(sd_,0.05)*100};
  }
  out._meta={n_sim:nSim, blocco_gg:blocco, oss_storiche:r.length};
  return out;
}

/* -------------------------------------------------------- blocco completo */
function analizza(date, nav, opt){
  opt = opt || {};
  const rf = opt.rf || 0, nProve = opt.nProve || 6;
  const r = rendimenti(nav);
  const anni = giorniTra(date[0], date[date.length-1])/365.25;
  const mens = rendPeriodo(date,nav,"M"), trim = rendPeriodo(date,nav,"Q");
  const mv = mens.map(x=>x.v), tv = trim.map(x=>x.v);
  // settimanali: fine settimana = ultimo giorno prima di un salto di settimana ISO
  const sett=[]; {
    const wk = d => { const t=new Date(d+"T00:00:00Z");
      const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day); return t.toISOString().slice(0,10); };
    const p=[]; for(let i=0;i<date.length;i++){ const k=wk(date[i]);
      if(p.length && p[p.length-1].k===k) p[p.length-1].v=nav[i]; else p.push({k,v:nav[i]}); }
    for(let i=1;i<p.length;i++) sett.push(p[i].v/p[i-1].v-1);
  }
  const vol = sd(r)*Math.sqrt(TD), mu = mean(r);
  const g = Math.pow(nav[nav.length-1]/nav[0], 1/Math.max(anni,1e-9))-1;
  const dd = ddSerie(nav), mdd = Math.min(...dd);
  const dsdv = downsideDev(r), sk = skewness(r), ku = kurtosisEcc(r);
  const srA = vol>0 ? (mu*TD-rf)/vol : 0;
  const seSR = Math.sqrt((1+0.5*Math.pow(srA/Math.sqrt(TD),2))/r.length)*Math.sqrt(TD);
  const v95 = varCvar(r,0.95), v99 = varCvar(r,0.99);
  const ep = episodiDrawdown(date,nav);
  const ui = Math.sqrt(dd.reduce((s,v)=>s+v*v,0)/dd.length);
  const pain = -dd.reduce((s,v)=>s+v,0)/dd.length;
  const prof = ep.top.map(e=>e.profondita_pct/100);
  const vinc = r.filter(v=>v>0), pers = r.filter(v=>v<0);
  const sumV = vinc.reduce((s,v)=>s+v,0), sumP = Math.abs(pers.reduce((s,v)=>s+v,0));
  const jb = r.length/6*(sk*sk + ku*ku/4);
  const sortM = asc(r);
  const mensNeg = mv.filter(v=>v<0).reduce((s,v)=>s+v,0);
  const serieMax = (pred) => { let best=0,cur=0; for(const v of r){ if(pred(v)){cur++; if(cur>best)best=cur;} else cur=0; } return best; };

  const A = {
    campione:{oss_giornaliere:r.length, oss_settimanali:sett.length, oss_mensili:mv.length,
      oss_trimestrali:tv.length, anni, dal:date[0], al:date[date.length-1],
      rf_dichiarato_pct:rf*100, n_prove_dsr:nProve},
    rendimento:{
      totale_pct:(nav[nav.length-1]/nav[0]-1)*100, cagr_pct:g*100,
      media_ann_aritmetica_pct:mu*TD*100,
      miglior_giorno_pct:Math.max(...r)*100, peggior_giorno_pct:Math.min(...r)*100,
      miglior_settimana_pct:sett.length?Math.max(...sett)*100:null,
      peggior_settimana_pct:sett.length?Math.min(...sett)*100:null,
      miglior_mese_pct:mv.length?Math.max(...mv)*100:null,
      peggior_mese_pct:mv.length?Math.min(...mv)*100:null,
      miglior_trimestre_pct:tv.length?Math.max(...tv)*100:null,
      peggior_trimestre_pct:tv.length?Math.min(...tv)*100:null,
      giorni_positivi_pct:vinc.length/r.length*100,
      settimane_positive_pct:sett.length?sett.filter(v=>v>0).length/sett.length*100:null,
      mesi_positivi_pct:mv.length?mv.filter(v=>v>0).length/mv.length*100:null,
      trimestri_positivi_pct:tv.length?tv.filter(v=>v>0).length/tv.length*100:null,
      guadagno_medio_giorno_pct:vinc.length?mean(vinc)*100:null,
      perdita_media_giorno_pct:pers.length?mean(pers)*100:null,
      rapporto_vincite_perdite:pers.length?mean(vinc)/Math.abs(mean(pers)):null,
      profit_factor:sumP>0?sumV/sumP:null,
      gain_to_pain_mensile:mensNeg<0?mv.reduce((s,v)=>s+v,0)/Math.abs(mensNeg):null,
      expectancy_giorno_pct:mu*100,
      serie_positiva_max_gg:serieMax(v=>v>0), serie_negativa_max_gg:serieMax(v=>v<0)},
    rischio:{
      vol_ann_giornaliera_pct:vol*100,
      vol_ann_settimanale_pct:sett.length>2?sd(sett)*Math.sqrt(52)*100:null,
      vol_ann_mensile_pct:mv.length>2?sd(mv)*Math.sqrt(12)*100:null,
      vol_ewma_corrente_pct:ewmaVol(r).slice(-1)[0]*100,
      vol_30gg_corrente_pct:r.length>=30?sd(r.slice(-30))*Math.sqrt(TD)*100:null,
      vol_90gg_corrente_pct:r.length>=90?sd(r.slice(-90))*Math.sqrt(TD)*100:null,
      downside_deviation_pct:dsdv*Math.sqrt(TD)*100,
      max_drawdown_pct:mdd*100, max_dd_data:date[dd.indexOf(mdd)],
      ulcer_index_pct:ui*100, pain_index_pct:pain*100,
      var95_1g_hist_pct:v95.hist*100, var95_1g_param_pct:v95.param*100,
      var95_1g_cornish_fisher_pct:v95.cf*100, cvar95_1g_pct:v95.cvar*100,
      var99_1g_hist_pct:v99.hist*100, var99_1g_param_pct:v99.param*100,
      var99_1g_cornish_fisher_pct:v99.cf*100, cvar99_1g_pct:v99.cvar*100,
      var95_1sett_pct:Z95*vol*Math.sqrt(5/TD)*100,
      var95_1mese_pct:Z95*vol*Math.sqrt(21/TD)*100,
      var99_1mese_pct:Z99*vol*Math.sqrt(21/TD)*100,
      var95_1anno_pct:Z95*vol*100,
      var95_1mese_storico_pct:mv.length>=12?-quantile(asc(mv),0.05)*100:null,
      cvar95_1mese_storico_pct:mv.length>=12?varCvar(mv,0.95).cvar*100:null,
      tail_ratio:quantile(sortM,0.95)/Math.abs(quantile(sortM,0.05)),
      common_sense_ratio:sumP>0?quantile(sortM,0.95)/Math.abs(quantile(sortM,0.05))*(sumV/sumP):null},
    efficienza:{
      sharpe:srA, sharpe_errore_std:seSR,
      sharpe_ic95_min:srA-1.96*seSR, sharpe_ic95_max:srA+1.96*seSR,
      psr_vs_zero_pct:(x=>x===null?null:x*100)(psr(srA,r.length,sk,ku)),
      dsr_pct:(x=>x===null?null:x*100)(dsr(srA,r.length,sk,ku,nProve)),
      sortino:dsdv>0?(mu*TD-rf)/(dsdv*Math.sqrt(TD)):null,
      calmar:mdd<0?g/Math.abs(mdd):null, mar:mdd<0?g/Math.abs(mdd):null,
      sterling:prof.length?g/Math.abs(mean(prof.slice(0,5))):null,
      burke:prof.length?g/Math.sqrt(prof.reduce((s,v)=>s+v*v,0)):null,
      martin_ulcer_ratio:ui>0?g/ui:null, pain_ratio:pain>0?g/pain:null,
      omega:omega(r), kappa3:kappa(r,3),
      recovery_factor:mdd<0?(nav[nav.length-1]/nav[0]-1)/Math.abs(mdd):null},
    distribuzione:{
      asimmetria_giornaliera:sk, curtosi_eccesso_giornaliera:ku,
      asimmetria_mensile:mv.length>=12?skewness(mv):null,
      curtosi_eccesso_mensile:mv.length>=12?kurtosisEcc(mv):null,
      jarque_bera:jb, jarque_bera_p:Math.exp(-jb/2),   // chi2 con 2 gradi di liberta'
      normalita_rifiutata:Math.exp(-jb/2)<0.05,
      hurst:hurst(r), ljung_box:ljungBox(r)},
    sotto_acqua:{
      quota_giorni_sotto_massimo_pct:dd.filter(v=>v<-1e-12).length/dd.length*100,
      dd_medio_pct:(a=>a.length?mean(a)*100:0)(dd.filter(v=>v<0)),
      durata_media_gg:(t=>t.length?mean(t):0)(ep.durate),
      durata_max_gg:(t=>t.length?Math.max(...t):0)(ep.durate),
      episodi_n:ep.tutti.length},
    episodi_drawdown:ep.top,
    mensili:mens, trimestrali:trim,
  };

  /* istogramma e QQ */
  const nb=41, mn=Math.min(...r), mx=Math.max(...r), w=(mx-mn)/nb;
  const cnt=new Array(nb).fill(0);
  for(const v of r){ let i=Math.floor((v-mn)/w); if(i>=nb) i=nb-1; if(i<0) i=0; cnt[i]++; }
  const centri=[], norm=[], dev=sd(r);
  for(let i=0;i<nb;i++){ const c=mn+w*(i+0.5); centri.push(c*100);
    norm.push(Math.exp(-0.5*Math.pow((c-mu)/dev,2))/(dev*Math.sqrt(2*Math.PI))*r.length*w); }
  A.distribuzione.istogramma={centri_pct:centri, conteggi:cnt, normale:norm,
    media_pct:mu*100, sigma_pct:dev*100};
  const passo=Math.max(1,Math.floor(sortM.length/200)), qq=[];
  for(let i=0;i<sortM.length;i+=passo)
    qq.push([(mu+dev*normPpf((i+0.5)/sortM.length))*100, sortM[i]*100]);
  A.distribuzione.qq=qq;

  /* cono di volatilità e finestre peggiori */
  A.cono_volatilita=[];
  for(const w2 of [21,63,126,252]){
    if(r.length < w2+20) continue;
    const v=[];
    for(let i=w2;i<=r.length;i++) v.push(sd(r.slice(i-w2,i))*Math.sqrt(TD));
    const s=asc(v);
    A.cono_volatilita.push({finestra_gg:w2, min_pct:s[0]*100, p25_pct:quantile(s,.25)*100,
      mediana_pct:quantile(s,.5)*100, p75_pct:quantile(s,.75)*100,
      max_pct:s[s.length-1]*100, corrente_pct:v[v.length-1]*100});
  }
  A.finestre_peggiori=[];
  for(const gg of [5,21,63,126,252]){
    if(nav.length<=gg) continue;
    const v=[]; let imin=gg;
    for(let i=gg;i<nav.length;i++){ const x=nav[i]/nav[i-gg]-1; v.push(x); if(x<nav[imin]/nav[imin-gg]-1) imin=i; }
    const s=asc(v);
    A.finestre_peggiori.push({giorni:gg, peggiore_pct:s[0]*100, migliore_pct:s[s.length-1]*100,
      mediana_pct:quantile(s,.5)*100, quota_negative_pct:v.filter(x=>x<0).length/v.length*100,
      fine_peggiore:date[imin]});
  }

  /* regimi di volatilità (quartili della vol a 21 giorni) */
  A.regimi={volatilita:[]};
  if(r.length>60){
    const v21=[], idx=[];
    for(let i=21;i<=r.length;i++){ v21.push(sd(r.slice(i-21,i))*Math.sqrt(TD)); idx.push(i-1); }
    const s=asc(v21), q=[quantile(s,.25),quantile(s,.5),quantile(s,.75)];
    const et=["vol bassa (Q1)","vol medio-bassa (Q2)","vol medio-alta (Q3)","vol alta (Q4)"];
    const lim=[[-Infinity,q[0]],[q[0],q[1]],[q[1],q[2]],[q[2],Infinity]];
    et.forEach((nome,k)=>{
      const sel=[], vs=[];
      v21.forEach((vv,i)=>{ if(vv>lim[k][0] && vv<=lim[k][1]){ sel.push(r[idx[i]]); vs.push(vv); } });
      if(sel.length) A.regimi.volatilita.push({regime:nome, giorni:sel.length,
        vol_media_pct:mean(vs)*100, rend_ann_pct:mean(sel)*TD*100,
        giorni_positivi_pct:sel.filter(x=>x>0).length/sel.length*100,
        peggior_giorno_pct:Math.min(...sel)*100});
    });
  }
  return A;
}

/* ----------------------------------------------- metriche contro benchmark */
function vsBenchmark(navP, navB, rf=0){
  const p=rendimenti(navP), b=rendimenti(navB);
  if(p.length<60) return null;
  const reg=ols(b,p);
  const su=[], giu=[], suB=[], giuB=[];
  for(let i=0;i<b.length;i++){ if(b[i]>0){su.push(p[i]); suB.push(b[i]);}
                               else if(b[i]<0){giu.push(p[i]); giuB.push(b[i]);} }
  const diff=p.map((v,i)=>v-b[i]);
  const te=sd(diff)*Math.sqrt(TD);
  const volP=sd(p)*Math.sqrt(TD), volB=sd(b)*Math.sqrt(TD);
  const annua = a => Math.pow(a.reduce((s,v)=>s*(1+v),1), TD/Math.max(a.length,1))-1;
  const srP = volP>0?(mean(p)*TD-rf)/volP:0;
  return {
    beta:reg.slope, alpha_ann_pct:reg.intercept*TD*100,
    correlazione:reg.r, r_quadro:reg.r*reg.r,
    tracking_error_pct:te*100,
    information_ratio:te>0?(mean(p)-mean(b))*TD/te:null,
    up_capture_pct:su.length>5?annua(su)/annua(suB)*100:null,
    down_capture_pct:giu.length>5?annua(giu)/annua(giuB)*100:null,
    beta_up:su.length>20?ols(suB,su).slope:null,
    beta_down:giu.length>20?ols(giuB,giu).slope:null,
    batting_average_pct:p.filter((v,i)=>v>b[i]).length/p.length*100,
    m2_ann_pct:(rf+srP*volB)*100,
    perf_bench_pct:(navB[navB.length-1]/navB[0]-1)*100,
    cagr_bench_pct:null, vol_bench_pct:volB*100,
    maxdd_bench_pct:Math.min(...ddSerie(navB))*100,
    extra_rendimento_pct:((navP[navP.length-1]/navP[0])-(navB[navB.length-1]/navB[0]))*100,
    oss_n:p.length,
    mercato:[
      {fase:"mercato su", giorni:su.length, portafoglio_ann_pct:su.length?mean(su)*TD*100:null,
       benchmark_ann_pct:suB.length?mean(suB)*TD*100:null,
       cattura_pct:suB.length&&mean(suB)!==0?mean(su)/mean(suB)*100:null},
      {fase:"mercato giu", giorni:giu.length, portafoglio_ann_pct:giu.length?mean(giu)*TD*100:null,
       benchmark_ann_pct:giuB.length?mean(giuB)*TD*100:null,
       cattura_pct:giuB.length&&mean(giuB)!==0?mean(giu)/mean(giuB)*100:null}],
  };
}

/* --------------------------------------------- decomposizione del rischio */
function decomposizione(compSerie, nomi, navFin){
  const n=nomi.length, T=compSerie[nomi[0]].length;
  if(T<61||n<2) return null;
  const rend=nomi.map(k=>rendimenti(compSerie[k]));
  const m=rend.length, L=rend[0].length;
  const w=nomi.map(k=>compSerie[k][T-1]/navFin);
  const cov=[];
  for(let i=0;i<m;i++){ cov.push([]);
    for(let j=0;j<m;j++){
      const a=rend[i], b=rend[j], ma=mean(a), mb=mean(b);
      let s=0; for(let t=0;t<L;t++) s+=(a[t]-ma)*(b[t]-mb);
      cov[i].push(s/(L-1)*TD); } }
  let varP=0; for(let i=0;i<m;i++) for(let j=0;j<m;j++) varP+=w[i]*cov[i][j]*w[j];
  const volP=Math.sqrt(varP);
  const mrc=cov.map(row=>row.reduce((s,v,j)=>s+v*w[j],0)/volP);
  const crc=w.map((wi,i)=>wi*mrc[i]);
  const volS=cov.map((row,i)=>Math.sqrt(row[i]));
  const hhi=w.reduce((s,v)=>s+v*v,0);
  const av=autovalori(cov);
  const tot=av.reduce((s,v)=>s+Math.max(v,0),0);
  const pr=av.filter(v=>v>1e-14).map(v=>v/tot);
  const enb=Math.exp(-pr.reduce((s,v)=>s+v*Math.log(v),0));
  const sommaVol=w.reduce((s,v,i)=>s+v*volS[i],0);
  return {
    componenti:nomi.map((k,i)=>({nome:k, peso_pct:w[i]*100, vol_singola_pct:volS[i]*100,
      contrib_vol_pct:crc[i]*100, quota_rischio_pct:crc[i]/volP*100,
      var95_componente_pct:crc[i]/volP*(Z95*volP/Math.sqrt(TD))*100,
      beta_al_portafoglio:mrc[i]/volP})),
    vol_portafoglio_pct:volP*100, somma_vol_singole_pct:sommaVol*100,
    beneficio_diversificazione_pct:(sommaVol-volP)*100,
    diversification_ratio:sommaVol/volP, hhi, n_equivalente_posizioni:1/hhi,
    numero_effettivo_scommesse:enb, posizioni_n:n};
}
/* autovalori di una matrice simmetrica per iterazione di Jacobi */
function autovalori(A0){
  const n=A0.length, A=A0.map(r=>r.slice());
  for(let sweep=0;sweep<60;sweep++){
    let off=0; for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) off+=A[i][j]*A[i][j];
    if(off<1e-22) break;
    for(let p=0;p<n;p++) for(let q=p+1;q<n;q++){
      if(Math.abs(A[p][q])<1e-18) continue;
      const th=(A[q][q]-A[p][p])/(2*A[p][q]);
      const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1));
      const c=1/Math.sqrt(t*t+1), s=t*c;
      for(let k=0;k<n;k++){
        const akp=A[k][p], akq=A[k][q];
        A[k][p]=c*akp-s*akq; A[k][q]=s*akp+c*akq; }
      for(let k=0;k<n;k++){
        const apk=A[p][k], aqk=A[q][k];
        A[p][k]=c*apk-s*aqk; A[q][k]=s*apk+c*aqk; }
    }
  }
  return A.map((r,i)=>r[i]).sort((a,b)=>b-a);
}
function correlazioni(compSerie, nomi){
  const rend=nomi.map(k=>rendimenti(compSerie[k]));
  if(rend[0].length<40) return null;
  const M=nomi.map((_,i)=>nomi.map((__,j)=>pearson(rend[i],rend[j])));
  return {labels:nomi.slice(), matrix:M};
}
function pearson(a,b){
  const ma=mean(a), mb=mean(b);
  let sab=0,saa=0,sbb=0;
  for(let i=0;i<a.length;i++){ const x=a[i]-ma, y=b[i]-mb; sab+=x*y; saa+=x*x; sbb+=y*y; }
  return sab/Math.sqrt(saa*sbb);
}

/* --------------------------------------------------------- serie rolling */
function rolling(date, nav, benchSerie, rf=0){
  const r=rendimenti(nav), d=date.slice(1), out={};
  const volW=(w)=>{ const o=[]; for(let i=w;i<=r.length;i++) o.push([d[i-1], sd(r.slice(i-w,i))*Math.sqrt(TD)*100]); return o; };
  for(const w of [30,60,90,252]) if(r.length>=w+1) out["vol_"+w+"gg"]=sub(volW(w));
  out.vol_ewma=sub(ewmaVol(r).map((v,i)=>[d[i], v*100]));
  for(const w of [126,252]){
    if(r.length<w+1) continue;
    const o=[]; for(let i=w;i<=r.length;i++){ const seg=r.slice(i-w,i), s=sd(seg);
      o.push([d[i-1], s>0?(mean(seg)*TD-rf)/(s*Math.sqrt(TD)):0]); }
    out["sharpe_"+w+"gg"]=sub(o);
  }
  if(r.length>=253){
    const o=[]; for(let i=252;i<=r.length;i++){ const seg=r.slice(i-252,i), ds=downsideDev(seg);
      o.push([d[i-1], ds>0?(mean(seg)*TD-rf)/(ds*Math.sqrt(TD)):0]); }
    out.sortino_252gg=sub(o);
  }
  const mens=rendPeriodo(date,nav,"M");
  for(const [n,k] of [[12,"rolling12m"],[6,"rolling6m"]]){
    if(mens.length<n) continue;
    const o=[]; for(let i=n;i<=mens.length;i++){
      let c=1; for(let j=i-n;j<i;j++) c*=1+mens[j].v;
      o.push([mens[i-1].k, (c-1)*100]); }
    out[k]=o;
  }
  for(const nome in benchSerie){
    const b=rendimenti(benchSerie[nome]);
    if(b.length<150) continue;
    const ob=[], oc=[], oe=[];
    let cp=1, cb=1;
    for(let i=0;i<r.length;i++){ cp*=1+r[i]; cb*=1+b[i]; oe.push([d[i], (cp/cb-1)*100]); }
    for(let i=126;i<=r.length;i++){
      const sp=r.slice(i-126,i), sb=b.slice(i-126,i);
      ob.push([d[i-1], ols(sb,sp).slope]); oc.push([d[i-1], pearson(sp,sb)]); }
    out["beta_126gg__"+nome]=sub(ob); out["corr_126gg__"+nome]=sub(oc);
    out["extra_cum__"+nome]=sub(oe);
  }
  return out;
}
function sub(serie, max=170){        // assottiglia per non appesantire i grafici
  if(serie.length<=max) return serie;
  const p=Math.ceil(serie.length/max), o=[];
  for(let i=0;i<serie.length;i+=p) o.push(serie[i]);
  if(o[o.length-1][0]!==serie[serie.length-1][0]) o.push(serie[serie.length-1]);
  return o;
}

glob.Q = {analizza, vsBenchmark, decomposizione, correlazioni, rolling, bootstrap,
          rendimenti, rendPeriodo, ddSerie, normCdf, normPpf, chi2Sf, quantile, asc,
          mean, sd, skewness, kurtosisEcc, pearson, ols, giorniTra};
})(window);
