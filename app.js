'use strict';
/* =====================================================================
   PLANT GROWTH INVESTIGATION (Brassica rapa x fertilizer) - app.js
   Sections: 1 CONFIG  2 RANDOM NUMBERS  3 BIOLOGICAL MODEL  4 PLANT DRAWING
             5 DATA EXPORT  6 UI HELPERS  7 WEEK LOGIC  8 ROUTER  9 INSTRUCTOR
   The HTML is the experimental environment only: it never calculates means,
   variance, SD, t-tests or graphs of the student's data.
   ===================================================================== */

/* ---------- 1. CONFIG (edit these to tune the experiment) ---------- */
const CONFIG = {
  availableWeeks: 3,            // set to 1 or 2 until later labs open (students cannot see later data)
  treatments: [
    { key: 'C', name: 'Control', gl: 0 },
    { key: 'L', name: 'Low',     gl: 0.75 },
    { key: 'M', name: 'Medium',  gl: 1.25 },
    { key: 'H', name: 'High',    gl: 2.0 }
  ],
  pots: 4, plantsPer: 4,
  days: [0, 7, 14, 21],
  // Expected mean plant height (mm) at Day 0, 7, 14, 21 for each treatment
  mean: { C: [5, 13, 32, 58], L: [5, 17, 46, 84], M: [5, 21, 60, 108], H: [5, 20, 57, 100] },
  // Plant-to-plant variation (coefficient of variation). HIGH is more variable.
  cv: { C: 0.12, L: 0.13, M: 0.13, H: 0.20 },
  potCv: 0.04, noiseCv: 0.04, day0Sd: 0.7,
  roundTo: 0.5,                 // measurements are recorded to the nearest 0.5 mm
  dayMax: [20, 45, 90, 160],    // ruler length (mm) in the measuring tool for each day
  ticks: [[1, 5], [1, 5], [5, 10], [5, 10]],  // [minor, major] ruler ticks
  // Greenhouse dosing (Week 1, Step 4). One "unit" = 0.05 g of fertilizer (1 dropper squeeze; a scoop = 2 units).
  // Each pot gets potMl of solution, so concentration (g/L) = units * unitG / (potMl/1000).
  dosing: { potMl: 400, unitG: 0.05, scoopUnits: 2, stockGperL: 50, maxOver: 14,
            tolUnits: 2,        // off-target by this many units or more is written into the Lab notes as a documented dosing error
            overDecline: 0.28,  // fraction of growth lost per g/L above the HIGH concentration
            burnAbove: 2.8 }    // g/L above which leaves look scorched
};

/* ---------- 2. RANDOM NUMBERS (seeded by the Experiment Code) ---------- */
function xmur3(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0}}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rngFrom = s => mulberry32(xmur3(s)());
const gauss = r => { let u=0; while(!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); };
const shuffle = (a,r) => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';          // no 0/O/1/I/L
const newCode = () => { const b=new Uint32Array(5); crypto.getRandomValues(b); return 'BR-'+[...b].map(x=>ALPHA[x%ALPHA.length]).join(''); };
/* Code = BR-XXXXX (seed) + optional dose profile suffix. The suffix records how far each pot's dose was from target. */
const normCode = s => { s=(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); if(s.startsWith('BR')) s=s.slice(2); if(s.length<5||s.length>21) return null; const suf=s.slice(5); if([...suf].some(c=>!ALPHA.includes(c))) return null; return {base:'BR-'+s.slice(0,5),suf}; };
const targetUnits = t => Math.round(t.gl*CONFIG.dosing.potMl/1000/CONFIG.dosing.unitG);
const unitsToGL = u => Math.round(u*CONFIG.dosing.unitG*1000/CONFIG.dosing.potMl*1e6)/1e6;
const allTargets = () => CONFIG.treatments.flatMap(t=>Array(CONFIG.pots).fill(targetUnits(t)));

/* ---------- 3. BIOLOGICAL MODEL ---------- */
const TNAME = Object.fromEntries(CONFIG.treatments.map(t=>[t.key,t.name]));
function curveAt(c,ys,over){const xs=CONFIG.treatments.map(t=>t.gl);for(let i=0;i<4;i++)if(c===xs[i])return ys[i];if(c<xs[0])return ys[0];
  for(let i=0;i<3;i++)if(c<xs[i+1])return ys[i]+(ys[i+1]-ys[i])*(c-xs[i])/(xs[i+1]-xs[i]);return over(ys[3],c-xs[3]);}
const meanAt=(c,di)=>curveAt(c,CONFIG.treatments.map(t=>CONFIG.mean[t.key][di]),(y,o)=>di?y*Math.max(.2,1-CONFIG.dosing.overDecline*o):y);
const cvAt=c=>curveAt(c,CONFIG.treatments.map(t=>CONFIG.cv[t.key]),(y,o)=>y*(1+.3*o));
function generate(code,units){
  units=units||allTargets();
  const R=rngFrom(code), E=rngFrom(code+'|events'), B=rngFrom(code+'|bench'), P=[];
  CONFIG.treatments.forEach((t,ti)=>{ for(let p=1;p<=CONFIG.pots;p++){ const pe=1+gauss(R)*CONFIG.potCv, c=unitsToGL(units[ti*CONFIG.pots+p-1]);
    for(let k=1;k<=CONFIG.plantsPer;k++){
      const f=Math.max(.45,1+gauss(R)*cvAt(c))*pe;
      const h=CONFIG.days.map((_,i)=>{const mu=meanAt(c,i);return i?Math.max(0,mu*f*(1+gauss(R)*CONFIG.noiseCv)):Math.max(2,mu+gauss(R)*CONFIG.day0Sd);});
      for(let i=1;i<4;i++) h[i]=Math.max(h[i],h[i-1]+1);
      P.push({id:t.key+p+'-'+k,t:t.key,pot:p,k,h,lean:gauss(R)*.35,curv:gauss(R)*.3,hue:gauss(R)*4,leaf:1+gauss(R)*.08,dmg:0,failed:false,notes:[[],[],[],[]]});
    }}});
  const pool=shuffle(P,E), take=()=>pool.pop(), an=[];
  // Greenhouse dosing consequences: big dosing errors are written into the Lab notes; very high doses scorch the leaves.
  CONFIG.treatments.forEach((t,ti)=>{ for(let p=1;p<=CONFIG.pots;p++){ const u=units[ti*CONFIG.pots+p-1], d=u-targetUnits(t), g=unitsToGL(u);
    P.filter(x=>x.t===t.key&&x.pot===p).forEach(pl=>{
      if(Math.abs(d)>=CONFIG.dosing.tolUnits)[0,1,2,3].forEach(i=>pl.notes[i].push({doc:true,txt:`Documented dosing error: pot ${t.key+p} received ${g.toFixed(2)} g/L; target was ${t.gl.toFixed(2)} g/L.`}));
      if(g>CONFIG.dosing.burnAbove){pl.dmg=1;[1,2,3].forEach(i=>pl.notes[i].push({doc:false,txt:'Observation: leaf edges look scorched.'}));} });
    if(Math.abs(d)>=CONFIG.dosing.tolUnits) an.push({type:`dosing error (${g.toFixed(2)} g/L applied, target ${t.gl} g/L)`,id:t.key+p+' (pot)'}); }});
  const note=(p,days,txt,doc)=>days.forEach(d=>p.notes[d].push({doc:!!doc,txt}));
  const fixUp=p=>{for(let i=1;i<4;i++)p.h[i]=Math.max(p.h[i],p.h[i-1]+(i===1?1:.5));};
  if(E()<.7){const p=take();p.failed=true;p.h=[0,0,0,0];note(p,[0,1,2,3],'Documented failure: no seedling emerged (failed germination).',true);an.push({type:'failed germination (documented)',id:p.id});}
  const w2=['small','lean','leaf'][Math.floor(E()*3)], p2=take();
  if(w2==='small'){p2.h[2]*=.5;p2.h[3]*=.5;fixUp(p2);note(p2,[2,3],'Observation: much smaller than the other plants in its pot.');}
  if(w2==='lean'){p2.lean=(E()<.5?-1:1)*1.2;note(p2,[2,3],'Observation: stem leaning strongly toward the light.');}
  if(w2==='leaf'){p2.dmg=1;note(p2,[2,3],'Observation: one leaf is damaged; cause unknown.');}
  an.push({type:'Week 2 complication: '+w2,id:p2.id});
  const p3=take();p3.h[2]*=1.3;p3.h[3]*=1.3;fixUp(p3);an.push({type:'unusually tall plant',id:p3.id});
  const p4=take();p4.curv=(E()<.5?-1:1)*1.1;note(p4,[3],'Observation: stem is curved, so this one is harder to measure.');an.push({type:'curved stem / harder measurement (Day 21)',id:p4.id});
  P.forEach(p=>p.m=p.h.map(v=>Math.round(v/CONFIG.roundTo)*CONFIG.roundTo));
  const grouped=[]; CONFIG.treatments.forEach(t=>{for(let p=1;p<=CONFIG.pots;p++)grouped.push(t.key+p);});
  return {code,units,plants:P,byId:Object.fromEntries(P.map(p=>[p.id,p])),anomalies:an,w2:{type:w2,id:p2.id},grouped,random:shuffle(grouped,B)};
}
const potPlants=(pid)=>EXP.plants.filter(p=>p.t+p.pot===pid);

/* ---------- 4. PLANT DRAWING (SVG) ---------- */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nLeaves=(p,di)=>di?Math.max(2,Math.min(9,2+Math.floor(p.h[di]/14))):0;
function describe(p,di){
  const t=TNAME[p.t]; if(p.failed) return `Plant ${p.id} (${t}): no seedling is visible above the growth medium.`;
  const r=p.h[di]/CONFIG.dayMax[di], size=r<.2?'very short':r<.38?'short':r<.62?'medium-height':'tall';
  const post=Math.abs(p.lean)>.8?'leaning strongly':Math.abs(p.lean)>.4?'leaning slightly':'upright';
  return `Plant ${p.id} (${t}): ${size} ${di?`plant with ${nLeaves(p,di)} leaves`:'seedling with two small seed leaves'}, ${post}${Math.abs(p.curv)>.8?', stem noticeably curved':''}${p.dmg&&di>=2?', one leaf damaged':''}.`;
}
function drawPlant(p,di,cx,soil,px,ls,sw){
  const H=p.h[di]; if(p.failed||H<=0) return `<text x="${cx}" y="${soil-6}" text-anchor="middle" font-size="9" fill="#333">none</text>`;
  const top=H*px,qx=cx+p.curv*top*.25,qy=soil-top*.5,ex=cx+p.lean*top*.28,ey=soil-top,col=`hsl(${112+p.hue},45%,34%)`;
  const pt=t=>[(1-t)*(1-t)*cx+2*(1-t)*t*qx+t*t*ex,(1-t)*(1-t)*soil+2*(1-t)*t*qy+t*t*ey];
  let s=`<path d="M${cx} ${soil} Q${qx} ${qy} ${ex} ${ey}" fill="none" stroke="#3f7d3a" stroke-width="${Math.max(1.4,sw)}" stroke-linecap="round"/>`;
  const L=(3+Math.sqrt(H)*1.1)*ls*p.leaf;
  if(di===0){[-1,1].forEach(sd=>{const[x,y]=pt(.98);s+=`<ellipse cx="${x+sd*L*.9}" cy="${y}" rx="${L}" ry="${L*.55}" fill="${col}"/>`;});}
  else{const n=nLeaves(p,di);for(let i=0;i<n;i++){const t=.3+.65*i/Math.max(1,n-1),[x,y]=pt(t),sd=i%2?1:-1,dm=p.dmg&&i===1&&di>=2,cx2=x+sd*L*.8;
    s+=`<ellipse cx="${cx2}" cy="${y-L*.2}" rx="${L}" ry="${L*.5}" transform="rotate(${-sd*25} ${cx2} ${y})" fill="${dm?'#a8a24a':col}" stroke="${dm?'#6b4a1a':'none'}"/>`;}}
  return s;
}
function plantSVG(p,di,o={}){
  const w=o.w||260,hh=o.h||340,pad=20,soil=hh-pad,ox=o.ruler?44:0,cx=ox+(w-ox)/2,px=o.px;
  let s=`<svg viewBox="0 0 ${w} ${hh}" role="img" aria-label="${esc(describe(p,di))}"><rect x="0" y="${soil}" width="${w}" height="${pad}" fill="#7a5a3a"/><line x1="0" y1="${soil}" x2="${w}" y2="${soil}" stroke="#3b2a18" stroke-width="2"/>`;
  if(o.ruler){const[mi,ma]=CONFIG.ticks[di],mx=CONFIG.dayMax[di];s+=`<line x1="${ox-2}" y1="${soil}" x2="${ox-2}" y2="${soil-mx*px}" stroke="#222"/>`;
    for(let mm=0;mm<=mx;mm+=mi){const y=soil-mm*px,major=mm%ma===0;s+=`<line x1="${ox-(major?16:9)}" y1="${y}" x2="${ox-2}" y2="${y}" stroke="#222"/>`;if(major)s+=`<text x="${ox-19}" y="${y+4}" text-anchor="end" font-size="11" fill="#111">${mm}</text>`;}
    s+=`<text x="6" y="12" font-size="11" fill="#111">mm</text>`;}
  s+=drawPlant(p,di,cx,soil,px,o.ls||1,o.sw||3);
  if(o.marker!=null){const y=soil-o.marker*px;s+=`<line x1="${ox}" y1="${y}" x2="${w}" y2="${y}" stroke="#b02a1b" stroke-width="2" stroke-dasharray="6 4"/><text x="${w-4}" y="${y-4}" text-anchor="end" font-size="12" font-weight="700" fill="#b02a1b">${o.marker.toFixed(1)} mm</text>`;}
  return s+'</svg>';
}
function potSVG(pid,di){
  const ps=potPlants(pid),px=62/CONFIG.dayMax[di];
  let s=`<svg viewBox="0 0 124 100" role="img" aria-label="${esc('Pot '+pid+' ('+TNAME[pid[0]]+'): four plants. '+ps.map(p=>describe(p,di)).join(' '))}"><rect x="0" y="82" width="124" height="18" fill="#7a5a3a"/><line x1="0" y1="82" x2="124" y2="82" stroke="#3b2a18" stroke-width="2"/>`;
  ps.forEach((p,i)=>s+=drawPlant(p,di,16+i*30,82,px,.5,1.8));
  return s+'</svg>';
}

/* ---------- 5. DATA EXPORT (raw data only, no statistics) ---------- */
function notesText(p,di){const seen=new Set(),o=[];for(let d=0;d<=di;d++)p.notes[d].forEach(n=>{if(!seen.has(n.txt)){seen.add(n.txt);o.push((n.doc?'':`Day ${CONFIG.days[d]}: `)+n.txt);}});return o.join(' ');}
function rowsFor(di){
  const head=['Treatment','Pot','Plant ID',...CONFIG.days.slice(0,di+1).map(d=>`Day ${d} Height (mm)`),'Lab notes'];
  return [head,...EXP.plants.map(p=>[TNAME[p.t],p.pot,p.id,...p.m.slice(0,di+1),notesText(p,di)])];
}
function dataTable(di){
  const r=rowsFor(di);
  return `<div class="tw"><table class="data"><caption>Research-team measurements, Day 0${di?` to Day ${CONFIG.days[di]}`:''} (64 plants)</caption><thead><tr>${r[0].map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${r.slice(1).map(x=>`<tr>${x.map((c,i)=>i===2?`<th scope="row">${c}</th>`:`<td${i>2&&i<x.length-1?' class="n"':''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function dataTools(di){return `<div class="res"><button type="button" data-act="copy" data-di="${di}">Copy current week data</button><button type="button" data-act="csv" data-di="${di}">Download current week data (CSV)</button></div>`;}
function bindTools(el){el.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
  const di=+b.dataset.di,r=rowsFor(di);
  if(b.dataset.act==='copy'){const t=r.map(x=>x.join('\t')).join('\n');try{await navigator.clipboard.writeText(t);say('Data copied. Paste it into cell A1 of your Excel sheet.');}catch{say('Copy was blocked by your browser. Use the CSV download instead.');}}
  else{const csv=r.map(x=>x.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${EXP.code}_Day${CONFIG.days[di]}_data.csv`;a.click();}});}

/* ---------- 6. UI HELPERS ---------- */
const $=s=>document.querySelector(s), main=$('#main');
const say=m=>{const l=$('#live');l.textContent='';setTimeout(()=>l.textContent=m,50);const f=$('#fbk');if(f)f.textContent=m;};
const RM=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('nomotion');
const checks=a=>`<ul class="chk">${a.map(x=>`<li><label><input type="checkbox"> <span>${x}</span></label></li>`).join('')}</ul>`;
const rec=a=>`<div class="rec"><h3>RECORD IN YOUR LAB DOCUMENT:</h3><ul>${a.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
const olist=a=>`<ol>${a.map(x=>`<li>${x}</li>`).join('')}</ol>`;
const WEEK_TODO=`<div class="card"><h3>THIS WEEK YOU WILL:</h3>${olist(['Observe your plants.','Measure selected plants.','Obtain the week\'s complete dataset.','Add the data to your Excel workbook.','Calculate mean, variance, standard deviation, and t-tests.','Create the week\'s bar graph.','Update your growth-over-time line graph.','Answer interpretation questions in your lab document.'])}</div>`;
function dlg(title,html){$('#dlg-t').textContent=title;$('#dlg-b').innerHTML=html;$('#dlg').showModal();}
$('#dlg-x').onclick=()=>$('#dlg').close();
const pickRep=(di,n)=>{ // 4 representative plants: one per treatment (never a failed one), deterministic per code+day
  const r=rngFrom(EXP.code+'|pick'+di);
  return shuffle(CONFIG.treatments.map(t=>{const c=EXP.plants.filter(p=>p.t===t.key&&!p.failed);return c[Math.floor(r()*c.length)];}),r);
};

/* Greenhouse bench + pot inspector */
function benchHTML(layout,di){
  return `<div class="light" aria-hidden="true"><span>&#9728; Window side (more light)</span><span>Wall side (less light)</span></div><div class="bench" role="group" aria-label="Greenhouse bench with 16 pots. Left column receives the most light.">${layout.map(pid=>`<button type="button" class="pot" data-pot="${pid}" aria-pressed="false" aria-label="Pot ${pid}, ${TNAME[pid[0]]} fertilizer. Select to inspect its four plants.">${di==null?'':potSVG(pid,di)}<span class="pl">${pid} · ${TNAME[pid[0]]}</span></button>`).join('')}</div><div id="potview" tabindex="-1"></div>`;
}
function bindBench(el,di){
  el.querySelectorAll('.pot').forEach(b=>b.onclick=()=>{
    el.querySelectorAll('.pot').forEach(x=>x.setAttribute('aria-pressed',x===b));
    const ps=potPlants(b.dataset.pot),pv=el.querySelector('#potview');
    pv.innerHTML=`<h3>Pot ${b.dataset.pot} · ${TNAME[b.dataset.pot[0]]} fertilizer</h3><div class="cards">${ps.map(p=>`<figure class="pc" style="margin:0">${plantSVG(p,di,{w:150,h:230,px:190/CONFIG.dayMax[di],ls:1.1})}<figcaption><strong>${p.id}</strong><br><small>${esc(describe(p,di).replace(/^Plant \S+ \([^)]*\): /,''))}</small></figcaption></figure>`).join('')}</div>`;
    pv.focus();say('Showing four plants in pot '+b.dataset.pot);});
}
function observeBody(di,prompts,grown){return el=>{el.innerHTML=(grown?`<div class="banner grow" role="status">${grown}</div>`:'')+`<div class="${grown?'grow':''}">${benchHTML(EXP.random,di)}</div>`+(prompts||'');bindBench(el,di);};}

/* Interactive ruler (pointer drag + slider + number box + text alternative) */
function measureBody(di){return el=>{
  const picks=pickRep(di),mx=CONFIG.dayMax[di],px=300/mx;let i=0,val=0,submitted=false,doneAll=!!S.rel[di];
  const day=CONFIG.days[di],q=['What makes plant height difficult to measure perfectly?','Where on the plant did you decide the "highest point" was?','Did the curve of the stem change your reading?','Would a second person get exactly the same number?'];
  el.innerHTML=`<div class="card"><h3>Measure 4 representative plants (Day ${day})</h3><p><strong>Measure from the surface of the growth medium to the highest point of the plant.</strong> Stems may curve and leaves may stick up, so perfect precision is not expected.</p><p id="mstat" aria-live="polite"></p>
  <div class="mflex"><div id="mplant"></div><div class="mctl"><label for="mnum">Marker height (mm)</label><div><input id="mnum" type="number" min="0" max="${mx}" step="${CONFIG.roundTo}" style="width:7rem"></div><label for="mrange" class="sr">Marker height slider</label><input id="mrange" type="range" min="0" max="${mx}" step="${CONFIG.roundTo}"><div class="nudge" role="group" aria-label="Nudge marker">${[-5,-1,-.5,.5,1,5].map(n=>`<button type="button" data-n="${n}">${n>0?'+':''}${n}</button>`).join('')}</div>
  <div class="res"><button type="button" id="msub" class="primary">Submit measurement</button><button type="button" id="mdesc">Describe where the plant tip is</button></div><p id="mfb" class="fb" role="status"></p><button type="button" id="mnext" hidden>Next plant</button></div></div></div><div id="rel"></div>`;
  const plantEl=el.querySelector('#mplant'),num=el.querySelector('#mnum'),rng=el.querySelector('#mrange'),fb=el.querySelector('#mfb');
  function draw(){const p=picks[i];plantEl.innerHTML=plantSVG(p,di,{ruler:true,px,marker:val});num.value=val;rng.value=val;el.querySelector('#mstat').textContent=`Plant ${i+1} of 4: ${p.id} (${TNAME[p.t]})`;}
  const set=v=>{val=Math.max(0,Math.min(mx,Math.round(v/CONFIG.roundTo)*CONFIG.roundTo));draw();};
  function fromPtr(e){const svg=plantEl.querySelector('svg'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const q=pt.matrixTransform(svg.getScreenCTM().inverse());set((320-q.y)/px);}
  let drag=false;plantEl.onpointerdown=e=>{drag=true;plantEl.setPointerCapture(e.pointerId);fromPtr(e);};plantEl.onpointermove=e=>{if(drag)fromPtr(e);};plantEl.onpointerup=()=>drag=false;
  num.oninput=()=>set(+num.value||0);rng.oninput=()=>set(+rng.value);
  el.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>set(val+ +b.dataset.n));
  el.querySelector('#mdesc').onclick=()=>{const p=picks[i],H=p.h[di],ma=CONFIG.ticks[di][1],lo=Math.floor(H/ma)*ma,hi=lo+ma;fb.textContent=`Text alternative: the highest point of ${p.id} lies between the ${lo} mm and ${hi} mm marks of the ruler${H-lo>ma/2?', closer to '+hi:', closer to '+lo} mm.`;};
  el.querySelector('#msub').onclick=()=>{if(submitted)return;submitted=true;const p=picks[i],t=p.m[di],d=Math.abs(val-t);
    fb.textContent=`Your reading: ${val.toFixed(1)} mm. The research team measured: ${t.toFixed(1)} mm. Difference: ${d.toFixed(1)} mm. ${q[i]} (Answer in your lab document if asked; this is not graded.)`;
    el.querySelector('#msub').disabled=true;
    if(i<3){const n=el.querySelector('#mnext');n.hidden=false;n.focus();}else{doneAll=true;release();}};
  el.querySelector('#mnext').onclick=function(){i++;submitted=false;val=0;fb.textContent='';this.hidden=true;el.querySelector('#msub').disabled=false;draw();rng.focus();};
  function release(){const r=el.querySelector('#rel');
    r.innerHTML=`<div class="card"><h3>All four measured</h3><p>Your research team measured all 64 plants. Release the complete Day ${day} dataset when you are ready.</p>${S.rel[di]?'':'<button type="button" id="relb" class="primary">Release the complete Day '+day+' dataset</button>'}</div><div id="rt"></div>`;
    const show=()=>{r.querySelector('#rt').innerHTML=dataTools(di)+dataTable(di);bindTools(r);};
    const b=r.querySelector('#relb');if(b)b.onclick=()=>{S.rel[di]=1;save();b.remove();show();say(`Day ${day} dataset released.`);updNav();gateUpd();};else show();}
  draw();if(doneAll){fb.textContent='You have already measured and released this dataset.';release();}
};}

/* ---------- 7. WEEK LOGIC ---------- */
let EXP=null;
const S={code:null,week:1,step:0,stepMap:{},rel:[0,0,0,0],done:{},pred:0,rnd:0,dose:Array(16).fill(null),inst:new URLSearchParams(location.search).get('instructor')==='true'};
const KEY=c=>'brlab:'+c;
function save(){if(!S.code)return;S.stepMap[S.week]=S.step;try{localStorage.setItem(KEY(S.code),JSON.stringify({stepMap:S.stepMap,rel:S.rel,done:S.done,pred:S.pred,rnd:S.rnd,dose:S.dose}));localStorage.setItem('brlab:last',S.code);}catch{}}
const loadStore=c=>{try{return JSON.parse(localStorage.getItem(KEY(c))||'null');}catch{return null;}};
const doseUnits=()=>allTargets().map((t,i)=>S.dose&&S.dose[i]!=null?S.dose[i]:t);
function fullCode(){const T=allTargets(),ch=doseUnits().map((u,i)=>ALPHA[Math.max(-16,Math.min(14,u-T[i]))+16]);while(ch.length&&ch[ch.length-1]===ALPHA[16])ch.pop();return ch.length?S.code+'-'+ch.join('').match(/.{1,4}/g).join('-'):S.code;}
const codeLabel=()=>S.code?fullCode():'';
function initExp(base,suf){S.code=base;const j=loadStore(base);Object.assign(S,{stepMap:{},rel:[0,0,0,0],done:{},pred:0,rnd:0,dose:Array(16).fill(null)},j||{});
  if(!Array.isArray(S.dose)||S.dose.length!==16)S.dose=Array(16).fill(null);
  if(suf){const T=allTargets();S.dose=T.map((t,i)=>Math.max(0,t+(ALPHA.indexOf(suf[i]||ALPHA[16])-16)));}
  EXP=generate(base,doseUnits());return j;}

const RES={Light:'Light energy drives photosynthesis, which builds the sugars a plant uses to grow. Too little light slows growth and can make stems stretch and weak.',
Water:'Water keeps cells firm, carries dissolved minerals from roots to leaves, and is a raw material for photosynthesis.',
'Carbon dioxide':'CO2 enters leaves through stomata. Photosynthesis uses it to build carbon-based molecules, which make up most of a plant\'s dry mass.',
Nitrogen:'Nitrogen is part of amino acids, proteins, chlorophyll and DNA. It is often the nutrient that limits plant growth.',
Phosphorus:'Phosphorus is part of ATP, DNA and cell membranes. It supports energy transfer and root and flower development.',
Potassium:'Potassium helps control water movement, stomata opening and enzyme activity.',
Temperature:'Temperature affects the speed of enzymes and metabolism. Growth slows when it is too cold and can stop when it is too hot.'};

const layoutNow=()=>(S.week>1||S.rnd)?EXP.random:EXP.grouped;
function layoutTable(l){return `<div class="tw"><table><caption>Greenhouse bench layout (window side on the left)</caption><thead><tr><th scope="col">Row</th>${[1,2,3,4].map(c=>`<th scope="col">Column ${c}</th>`).join('')}</tr></thead><tbody>${[0,1,2,3].map(r=>`<tr><th scope="row">${r+1}</th>${l.slice(r*4,r*4+4).map(p=>`<td>${p} ${TNAME[p[0]]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
const compose=(...f)=>el=>f.forEach(fn=>{const d=document.createElement('div');el.append(d);fn(d);});
const html=h=>el=>{el.innerHTML=h;};
const reveal=(btnLabel,content)=>el=>{el.innerHTML=`<button type="button" class="primary">${btnLabel}</button><div class="card" hidden aria-live="polite">${content}</div>`;const b=el.querySelector('button'),c=el.querySelector('.card');b.onclick=()=>{c.hidden=false;b.setAttribute('aria-expanded','true');};};
const dataDay=(di)=>({title:`Measure and obtain the Day ${CONFIG.days[di]} data`,todo:`Measure 4 plants with the virtual ruler, then release the complete Day ${CONFIG.days[di]} dataset.`,gate:()=>S.rel[di],gmsg:'Measure all 4 plants and release the dataset to continue.'});

function excelStep(w){
  const di=w,d=CONFIG.days[di];
  const tasks=[`For each treatment calculate Day ${d}:`,'<ul class="chk"><li><label><input type="checkbox"> Mean</label></li><li><label><input type="checkbox"> Variance</label></li><li><label><input type="checkbox"> Standard deviation</label></li></ul>','Run t-tests:','<ul class="chk"><li><label><input type="checkbox"> Control vs Low</label></li><li><label><input type="checkbox"> Control vs Medium</label></li><li><label><input type="checkbox"> Control vs High</label></li></ul>'];
  const gr={1:['Day 7 bar graph: x-axis = fertilizer treatment, y-axis = mean plant height, with standard deviation error bars','Growth-over-time line graph with Day 0 and Day 7, one line for each fertilizer treatment'],
    2:['Day 14 bar graph with standard deviation error bars','UPDATE your existing growth-over-time line graph so it contains Day 0, Day 7 and Day 14, with separate lines for Control, Low, Medium and High'],
    3:['Day 21 bar graph with standard deviation error bars','COMPLETE your final growth-over-time line graph with Day 0, Day 7, Day 14 and Day 21 for all four treatments']}[w];
  return {title:`Excel checkpoint: Day ${d}`,todo:'Leave the simulation, open your Excel workbook, and do everything in the box below.',
   body:html(`<div class="stop"><h3>${w===1?'NOW LEAVE THE SIMULATION AND OPEN YOUR EXCEL WORKBOOK.':'STOP HERE AND OPEN YOUR EXCEL WORKBOOK.'}</h3><p>${w===1?'Enter or paste the Day 0 and Day 7 data.':`Add the Day ${d} data to the SAME workbook.`} Then:</p><h4>IN EXCEL:</h4>${tasks.join('')}<h4>Create:</h4>${checks(gr)}<p><strong>Do not calculate any of these in the simulation. It never analyzes your data.</strong></p>${dataTools(di)}</div>`),bind:true};
}
const Q={1:['Are fertilizer-treatment differences visible after only one week?','Which treatment has the highest mean plant height?','Which treatment has the greatest variability?','Do the t-tests agree with what appears visually in the bar graph?','Is there enough evidence after one week to recommend an optimal fertilizer concentration?'],
2:['Are treatment differences larger than they were on Day 7?','Have any treatment comparisons changed in statistical significance?','Why might a treatment difference become easier to detect as time passes?','Are the four growth lines approximately parallel?','Does fertilizer appear to affect final size, growth rate, or both?','How does biological variation affect your confidence in the results?'],
3:['How did fertilizer concentration affect <em>Brassica</em> growth?','Was more fertilizer always associated with more growth?','Which fertilizer concentration would you recommend based on your results?','What evidence supports that recommendation?','How did the treatment effect change between Day 7 and Day 21?','What did the line graph reveal that the Day 21 bar graph alone did not?','What does standard deviation tell you about biological variation among plants?','Did all individual plants follow the overall treatment pattern?','Why is that biologically important?','Did your original prediction match the final results?','What limitation or source of uncertainty exists in this experiment?']};
const interp=w=>({title:'Interpretation questions',todo:'Answer these in your lab document, using your Excel calculations and graphs as evidence. Do not type answers here.',body:html(`<div class="rec"><h3>ANSWER IN YOUR LAB DOCUMENT:</h3>${olist(Q[w])}</div>`)});
const FIN={1:['WEEK 1 COMPLETE','Save your Excel workbook and lab document. You will return to the SAME plants next week.'],2:['WEEK 2 COMPLETE','Save your Excel workbook and lab document. Your plants have one final week of growth.'],3:['EXPERIMENT COMPLETE','Your scientific conclusions belong in your lab document and should be supported using the calculations and graphs in your Excel workbook.']};
const finishStep=w=>({title:`Before you leave: Week ${w}`,todo:'Tick each item, then finish the week.',last:true,body:el=>{
  el.innerHTML=`<div class="card"><h3>BEFORE YOU LEAVE, MAKE SURE YOU HAVE:</h3>${checks(['Saved your Excel workbook','Completed this week\'s calculations','Created the required bar graph','Updated the line graph','Answered the lab-document questions',`Recorded your Experiment Code (${codeLabel()})`])}</div><button type="button" id="fin" class="primary" ${S.done[w]?'':'disabled'}>Finish Week ${w}</button><div id="fmsg" tabindex="-1" aria-live="polite"></div>`;
  const boxes=[...el.querySelectorAll('input')],fin=el.querySelector('#fin'),m=el.querySelector('#fmsg');
  const show=()=>{m.innerHTML=`<div class="banner" style="margin-top:14px">${FIN[w][0]}</div><p>${FIN[w][1]}</p>${w<3?(w+1<=CONFIG.availableWeeks||S.inst?`<p>Week ${w+1} is open. Return with your Experiment Code (<strong>${codeLabel()}</strong>) at the next lab.</p>`:`<p>Return with your Experiment Code (<strong>${codeLabel()}</strong>) when your instructor opens Week ${w+1}.</p>`):''}`;};
  boxes.forEach(b=>b.onchange=()=>fin.disabled=!boxes.every(x=>x.checked));
  fin.onclick=()=>{S.done[w]=1;save();show();updNav();m.focus();say(FIN[w][0]);};
  if(S.done[w]){boxes.forEach(b=>b.checked=true);show();}
}});

/* ---------- Greenhouse treatment step (Week 1, Step 4): pots + dropper/scoop ---------- */
const dropperSVG='<svg viewBox="0 0 80 110" aria-hidden="true"><rect x="22" y="48" width="36" height="56" rx="8" fill="#e8f1f5" stroke="#234" stroke-width="2.5"/><rect x="26" y="70" width="28" height="30" rx="5" fill="#8fb98f"/><rect x="30" y="38" width="20" height="12" fill="#234"/><path d="M40 38 C28 38 30 8 40 8 C50 8 52 38 40 38Z" fill="#b5532f" stroke="#234" stroke-width="2.5"/></svg>';
const scoopSVG='<svg viewBox="0 0 80 110" aria-hidden="true"><rect x="16" y="46" width="48" height="58" rx="7" fill="#f4efe0" stroke="#234" stroke-width="2.5"/><rect x="14" y="38" width="52" height="12" rx="4" fill="#234"/><circle cx="40" cy="26" r="14" fill="#c9a55a" stroke="#234" stroke-width="2.5"/><rect x="38" y="4" width="4" height="12" fill="#234"/></svg>';
const beakerSVG=u=>`<svg viewBox="0 0 80 110" aria-hidden="true"><path d="M14 10 V96 Q14 102 20 102 H60 Q66 102 66 96 V10" fill="#fff" stroke="#234" stroke-width="3"/><rect x="17" y="${100-Math.min(u,30)*2.8}" width="46" height="${Math.min(u,30)*2.8}" fill="#7fae7a"/>${[30,55,80].map(y=>`<line x1="14" y1="${y}" x2="26" y2="${y}" stroke="#234" stroke-width="2"/>`).join('')}</svg>`;
const treatPotSVG=done=>`<svg viewBox="0 0 100 90" aria-hidden="true"><path d="M20 38 H80 L73 84 H27 Z" fill="#b5532f" stroke="#5a2410" stroke-width="2"/><rect x="15" y="31" width="70" height="10" rx="3" fill="#c9653c" stroke="#5a2410" stroke-width="2"/><ellipse cx="50" cy="33" rx="32" ry="4" fill="${done?'#3b2a1a':'#8a6a48'}"/>${[28,43,57,72].map(x=>`<circle cx="${x}" cy="33" r="2.4" fill="#e8d9a0" stroke="#5a4a20"/>`).join('')}${done?'<path d="M38 62 l9 9 l15 -17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>':''}</svg>`;
function treatStep(){return {title:'Step 4: Treat your pots',gate:()=>S.dose.every(v=>v!=null),gmsg:'Treat all 16 pots to continue.',
  todo:'Give each pot its fertilizer. Work out the amount for its treatment, measure it with the dropper or the scoop, and pour it into the right pot. Fertilizer cannot be taken back out of the soil.',
  body:el=>{
  const DS=CONFIG.dosing,tgt=pid=>CONFIG.treatments.find(t=>t.key===pid[0]),ix=pid=>EXP.grouped.indexOf(pid);
  let sel=null,dr=0,sc=0,pending=false;const units=()=>dr+sc*DS.scoopUnits;
  el.innerHTML=`<p>The seeds are planted and your 16 pots are on the bench. Now apply the treatments. <strong>Each pot receives ${DS.potMl} mL of watering solution</strong> at its treatment concentration. Select a pot, measure fertilizer into the beaker, then pour.</p><div class="card"><h3>Fertilizer recipe</h3><ul><li><strong>Concentration</strong> (g/L) = grams of fertilizer dissolved in 1 liter of water.</li><li><strong>Dropper bottle:</strong> stock solution at ${DS.stockGperL} g/L. One squeeze = ${DS.unitG/(DS.stockGperL/1000)} mL = ${DS.unitG} g of fertilizer.</li><li><strong>Scoop:</strong> dry fertilizer. One level scoop = ${Math.round(DS.unitG*DS.scoopUnits*100)/100} g.</li><li>Use either tool, or both, for any pot.</li></ul><details><summary>Show a worked example (not one of your treatments)</summary><p>Target 1.0 g/L in 400 mL: 1.0 g/L × 0.4 L = 0.40 g of fertilizer. Dropper: 0.40 g ÷ 0.05 g per squeeze = 8 squeezes. Scoop: 0.40 g ÷ 0.10 g per scoop = 4 scoops.</p></details></div><div id="tb"></div><div id="stn" class="card" aria-live="polite"></div><div id="tlog"></div><div id="tdone" aria-live="polite"></div>`+rec(['How you calculated the amount of fertilizer for each treatment','Any pot where you think you may have added the wrong amount, and what you would do differently']);
  const q=s=>el.querySelector(s);
  function drawBench(){q('#tb').innerHTML=`<div class="light" aria-hidden="true"><span>&#9728; Window side (more light)</span><span>Wall side (less light)</span></div><div class="bench" role="group" aria-label="Greenhouse bench with 16 pots">${EXP.random.map(pid=>{const t=tgt(pid),d=S.dose[ix(pid)]!=null;return`<button type="button" class="pot tpot" data-pot="${pid}" aria-pressed="${sel===pid}" aria-label="Pot ${pid}, ${t.name}, target ${t.gl} grams per liter, ${d?'treated':'not treated yet'}">${treatPotSVG(d)}<span class="pl">${pid} · ${t.name}</span><span class="pl">${t.gl} g/L · ${d?'Treated':'Not treated'}</span></button>`;}).join('')}</div>`;
    q('#tb').querySelectorAll('.pot').forEach(b=>b.onclick=()=>{sel=b.dataset.pot;dr=sc=0;pending=false;q('#tb').querySelectorAll('.pot').forEach(x=>x.setAttribute('aria-pressed',x===b));drawStation();const h=q('#sth');if(h)h.focus();});}
  function drawStation(){const s=q('#stn');if(!sel){s.innerHTML='<p>Select a pot on the bench to begin.</p>';return;}
    const t=tgt(sel),i=ix(sel),tu=targetUnits(t);
    if(S.dose[i]!=null){s.innerHTML=`<h3 id="sth" tabindex="-1">Pot ${sel} · ${t.name}</h3><p>Treated: ${(S.dose[i]*DS.unitG).toFixed(2)} g of fertilizer in ${DS.potMl} mL (${unitsToGL(S.dose[i]).toFixed(2)} g/L). The target for this pot was ${t.gl} g/L. It cannot be changed.</p>`;return;}
    s.innerHTML=`<h3 id="sth" tabindex="-1">Fertilizer station: pot ${sel} · ${t.name} · target ${t.gl} g/L</h3><div class="tools"><div class="tool">${dropperSVG}<button type="button" id="bd">Squeeze dropper (+1 mL stock)</button></div><div class="tool">${scoopSVG}<button type="button" id="bs">Add one level scoop (dry)</button></div><div class="tool"><div id="bk"></div><p id="bt"></p></div></div><div class="res"><button type="button" id="btip">Tip out the beaker</button><button type="button" id="bpour" class="primary"></button></div><p id="bmsg" class="fb" role="status"></p>`;
    const msg=m=>q('#bmsg').textContent=m;
    const upd=()=>{q('#bk').innerHTML=beakerSVG(units());q('#bt').textContent=`In the beaker: ${dr} squeeze${dr===1?'':'s'} of stock, ${sc} scoop${sc===1?'':'s'} of dry fertilizer.`;q('#bpour').textContent=pending?'Confirm: pour now (cannot be undone)':(units()?`Fill to ${DS.potMl} mL and pour into pot ${sel}`:`Pour ${DS.potMl} mL of plain water into pot ${sel}`);};
    const add=(n,w)=>{if(units()+n>tu+DS.maxOver){msg('The beaker is full. Any more would overflow the pot.');return;}w==='d'?dr++:sc++;pending=false;msg('');upd();};
    q('#bd').onclick=()=>add(1,'d');q('#bs').onclick=()=>add(DS.scoopUnits,'s');
    q('#btip').onclick=()=>{dr=sc=0;pending=false;msg('Beaker emptied.');upd();};
    q('#bpour').onclick=()=>{if(!pending){pending=true;upd();msg('Fertilizer cannot be taken back out of the soil. Press again to pour.');return;}
      S.dose[i]=units();save();say(`Pot ${sel} treated.`);drawBench();drawStation();drawLog();check();q('#tb').querySelector(`[data-pot="${sel}"]`).focus();};
    upd();}
  function drawLog(){const rows=EXP.grouped.filter(p=>S.dose[ix(p)]!=null);q('#tlog').innerHTML=rows.length?`<div class="tw"><table><caption>Treatment log</caption><thead><tr><th scope="col">Pot</th><th scope="col">Treatment</th><th scope="col">Target (g/L)</th><th scope="col">Fertilizer added (g)</th><th scope="col">Applied (g/L)</th></tr></thead><tbody>${rows.map(p=>{const u=S.dose[ix(p)],t=tgt(p);return`<tr><th scope="row">${p}</th><td>${t.name}</td><td class="n">${t.gl.toFixed(2)}</td><td class="n">${(u*DS.unitG).toFixed(2)}</td><td class="n">${unitsToGL(u).toFixed(2)}</td></tr>`;}).join('')}</tbody></table></div>`:'';}
  function check(){if(!S.dose.every(v=>v!=null))return;EXP=generate(S.code,doseUnits());const f=fullCode(),ch=f!==S.code;
    q('#tdone').innerHTML=`<div class="stop"><h3>ALL 16 POTS ARE TREATED</h3><p>${ch?`Some pots received amounts different from the plan, and your plants will respond to what you actually applied. Your Experiment Code is now longer. <strong>Record this FULL code in your Excel workbook and lab document: ${f}</strong>`:`Your Experiment Code is unchanged: <strong>${f}</strong>. Record it in your Excel workbook and lab document.`}</p></div>`;gateUpd();}
  drawBench();drawStation();drawLog();check();
}};}

function stepsFor(w){
  const gl=CONFIG.treatments;
  if(w===1)return [
  {title:'Step 1: Enter the greenhouse',todo:'Read the research question, explore each plant resource, then write the variables in your lab document.',body:compose(
    html(`<div class="card"><p><strong>Research question:</strong> How does fertilizer concentration affect <em>Brassica rapa</em> growth over three weeks, and is more fertilizer always better?</p><p><em>Brassica rapa</em> is a fast-growing mustard-family plant widely used in plant biology. Fertilizer supplies mineral nutrients, mainly nitrogen (N), phosphorus (P) and potassium (K), that plants cannot make for themselves.</p></div><h3>Explore what a plant needs</h3><div class="res" role="group" aria-label="Plant resources">${Object.keys(RES).map(k=>`<button type="button" aria-pressed="false" data-r="${k}">${k}</button>`).join('')}</div><div class="card" id="rtxt" aria-live="polite"><p>Select a resource to read why it matters.</p></div><p><strong>Think about it:</strong> What variable is being manipulated in this experiment?</p>`),
    el=>{el.previousElementSibling.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{el.previousElementSibling.querySelectorAll('[data-r]').forEach(x=>x.setAttribute('aria-pressed',x===b));el.previousElementSibling.querySelector('#rtxt').innerHTML=`<p><strong>${b.dataset.r}:</strong> ${RES[b.dataset.r]}</p>`;});},
    html(rec(['Independent variable','Dependent variable','At least four controlled variables','Purpose of the control treatment'])))},
  {title:'Step 2: Experimental design',todo:'Study the design, then try the "only one plant" experiment and think about the question it asks.',body:compose(
    html(`<div class="grid4">${gl.map(t=>`<div class="card"><h3>${t.name.toUpperCase()}</h3><p>${t.gl} g/L fertilizer</p></div>`).join('')}</div><p><strong>4 replicate pots per treatment × 4 measured plants per pot = 64 plants.</strong> Every plant has a permanent ID, such as <code>L2-3</code> = Low fertilizer, Pot 2, Plant 3.</p>`),
    reveal('WHAT IF WE USED ONLY ONE PLANT?',`<p>Imagine a different, one-plant version of this experiment (<em>demonstration numbers, not your data</em>). At Day 7 the single Control plant is 16 mm tall. The single Medium plant happened to grow unusually poorly and is 9 mm tall.</p><div class="tw"><table><caption>One-plant experiment (illustration)</caption><thead><tr><th scope="col">Treatment</th><th scope="col">Plants</th><th scope="col">Height (mm)</th></tr></thead><tbody><tr><td>Control</td><td>1</td><td>16</td></tr><tr><td>Medium</td><td>1</td><td>9</td></tr></tbody></table></div><p>This one-plant experiment would suggest that fertilizer <em>stunts</em> growth. <strong>Would one plant represent the treatment reliably?</strong> Individual plants differ in genes, seed size and tiny differences in their surroundings, so replication shows what is typical and how variable it is.</p>`),
    html(rec(['Would one plant represent a treatment reliably? Why or why not?'])))},
  {title:'Step 3: Randomization',gate:()=>S.rnd,gmsg:'Randomize your greenhouse to continue.',todo:'Look at the grouped bench, think about the light, then randomize your greenhouse.',body:el=>{
    const draw=()=>{el.querySelector('#bn').innerHTML=benchHTML(layoutNow(),null)+layoutTable(layoutNow());};
    el.innerHTML=`<p>You have 16 pots on one bench. One side of the greenhouse, near the window, receives slightly more light. Right now the pots are grouped by treatment.</p><div id="bn"></div><div class="res"><button type="button" id="bias">Why might grouped placement cause bias?</button><button type="button" id="rnd" class="primary">RANDOMIZE MY GREENHOUSE</button></div><div class="card" id="bx" hidden aria-live="polite"><p>If every Control pot sat in the brightest column, any difference in growth could come from <em>light</em> instead of fertilizer. The two causes could not be separated.</p></div>`+rec(['Why is randomization useful in this experiment?']);
    draw();
    el.querySelector('#bias').onclick=()=>{el.querySelector('#bx').hidden=false;};
    el.querySelector('#rnd').onclick=()=>{S.rnd=1;save();draw();say('Your greenhouse is randomized.');gateUpd();};
    }},
  treatStep(),
  {title:'Step 5: Hypothesis and prediction',todo:'Record your hypothesis and prediction in your lab document before you continue.',gate:()=>S.pred,gmsg:'Confirm your prediction to continue.',body:el=>{
    const sh=[['A','Growth continuously increases as fertilizer increases.','M8 72 L92 12'],['B','Growth increases to an optimum and then levels off or decreases.','M8 72 C30 8 58 6 92 42'],['C','Fertilizer has no effect.','M8 42 L92 42']];
    el.innerHTML=`<p>Here are three possible patterns. We are not telling you which is right.</p><div class="grid4">${sh.map(s=>`<div class="card"><svg viewBox="0 0 100 80" role="img" aria-label="Sketch graph. Pattern ${s[0]}: ${s[1]}" style="width:100%;max-width:200px;background:#fff"><path d="M8 4 V74 H96" fill="none" stroke="#222"/><path d="${s[2]}" fill="none" stroke="#1d5c3f" stroke-width="3"/><text x="52" y="80" font-size="7" text-anchor="middle">fertilizer</text></svg><p><strong>${s[0]}.</strong> ${s[1]}</p></div>`).join('')}</div>`+rec(['Your hypothesis','Your prediction (which pattern, and why)'])+`<button type="button" id="pred" class="primary" aria-pressed="${!!S.pred}">I HAVE RECORDED MY PREDICTION</button>`;
    el.querySelector('#pred').onclick=function(){S.pred=1;this.setAttribute('aria-pressed','true');save();gateUpd();say('Prediction confirmed.');};}},
  {title:'Step 6: Day 0 baseline, inspect the seedlings',todo:'Select several pots and look at the seedlings. Notice how similar they are at the start.',body:observeBody(0,'<p>Select pots to inspect their seedlings.</p>')},
  {...dataDay(0),title:'Step 7: Measure Day 0',body:compose(measureBody(0),html(rec(['What makes plant height difficult to measure perfectly?'])),el=>bindTools(el))},
  {title:'Step 8: Seven days later',todo:'Inspect the Day 7 plants. Compare treatments and individual plants, but do not draw conclusions yet.',body:observeBody(1,rec(['What differences do you notice among pots? Which are observations and which are conclusions?']),'7 DAYS LATER')},
  {...dataDay(1),title:'Step 9: Measure Day 7',body:compose(measureBody(1),el=>bindTools(el))},
  excelStep(1),interp(1),finishStep(1)];
  if(w===2)return [
  {title:'Step 1: Return to the greenhouse (Day 14)',todo:'Inspect the Day 14 plants closely before any numbers appear.',body:observeBody(2,rec(['Which treatment appears tallest?','Which treatment appears most variable?','What evidence are you using?','Which plants look unusual?']),'DAY 14')},
  {title:'Step 2: A complication',todo:'Look at the plant below and think about what you would do with its data.',body:el=>{
    const p=EXP.byId[EXP.w2.id],q=['Interesting. What would this do to your data?','Would you exclude this plant? What evidence would justify doing so?','Is this biological variation or experimental error?','Can you tell from one plant?','Look at the entire treatment before drawing a conclusion.'];
    const ob=p.notes[2].map(n=>n.txt).join(' ');
    el.innerHTML=`<div class="card"><p>While checking the bench, your team notices an unusual plant:</p><figure class="pc" style="margin:0 auto 8px;max-width:150px">${plantSVG(p,2,{w:150,h:230,px:190/CONFIG.dayMax[2],ls:1.1})}<figcaption><strong>${p.id}</strong> (${TNAME[p.t]})<br><small>${esc(ob)}</small></figcaption></figure><ul>${q.map(x=>`<li>${x}</li>`).join('')}</ul></div><h3>Should an unusual biological observation automatically be deleted from the dataset?</h3><div class="res" role="group" aria-label="Possible responses"><button type="button" data-a="0">Delete it</button><button type="button" data-a="1">Keep it and note it</button><button type="button" data-a="2">Look for a documented problem first</button></div><div class="card" id="ans" aria-live="polite"><p>Select a response to see how scientists think about this.</p></div>`+rec(['Should this plant be removed from your data? Explain your reasoning.']);
    const A=['Deleting a value because it is different can hide real biological variation, and can bias your results toward the answer you expected.','Reasonable. Keeping the value and writing down what you saw preserves the evidence. Different plants really do differ.','Best practice. An unusual value should be removed only for a defensible biological or methodological reason, such as a documented experimental or measurement failure. Check the Lab notes column of your data: a documented failure is labelled as one, and an ordinary observation is not.'];
    el.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{el.querySelector('#ans').innerHTML=`<p>${A[+b.dataset.a]}</p><p><strong>Keep the value unless the simulation explicitly identifies a documented experimental or measurement failure.</strong></p>`;});}},
  {...dataDay(2),title:'Step 3: Measure Day 14',body:compose(measureBody(2),el=>bindTools(el))},
  excelStep(2),interp(2),finishStep(2)];
  return [
  {title:'Step 1: Final greenhouse observation (Day 21)',todo:'Inspect the mature plants before any numbers appear.',body:observeBody(3,rec(['Which fertilizer treatment would you currently recommend?','What visual evidence supports your prediction?']),'DAY 21')},
  {...dataDay(3),title:'Step 2: Final measurements (Day 21)',body:compose(measureBody(3),el=>bindTools(el))},
  excelStep(3),
  {title:'Three-week comparison',todo:'Complete these tables in Excel or your lab document using your own workbook values.',body:html(`<p>These tables are intentionally blank. Fill them from your workbook.</p><div class="tw"><table><caption>Mean plant height (mm)</caption><thead><tr><th scope="col">Treatment</th><th scope="col">Day 7 mean</th><th scope="col">Day 14 mean</th><th scope="col">Day 21 mean</th></tr></thead><tbody>${gl.map(t=>`<tr><th scope="row">${t.name}</th><td></td><td></td><td></td></tr>`).join('')}</tbody></table></div><div class="tw"><table><caption>t-test p-values</caption><thead><tr><th scope="col">Comparison</th><th scope="col">Day 7 p</th><th scope="col">Day 14 p</th><th scope="col">Day 21 p</th></tr></thead><tbody>${['Control vs Low','Control vs Medium','Control vs High'].map(c=>`<tr><th scope="row">${c}</th><td></td><td></td><td></td></tr>`).join('')}</tbody></table></div>`)},
  interp(3),finishStep(3)];
}

/* ---------- 8. ROUTER, NAVIGATION, START SCREENS ---------- */
let STEPS=[];
function wstate(w){if(!S.inst&&w>CONFIG.availableWeeks)return'Not yet available';if(S.done[w])return'Completed';if(w===S.week)return'Current';if(w===1||S.done[w-1]||S.inst)return'Not started';return'Locked';}
function weeksNav(){const n=$('#weeks');if(!S.code){n.innerHTML='';return;}
  n.innerHTML=`<ol>${[1,2,3].map(w=>{const st=wstate(w),dis=st==='Locked'||st==='Not yet available';return`<li><button type="button" data-w="${w}" ${w===S.week?'aria-current="true"':''} ${dis?'disabled':''}>Week ${w} — Day ${CONFIG.days[w]}<span class="st">${st}</span></button></li>`;}).join('')}</ol><p class="days">${CONFIG.days.map((d,i)=>`<span>Day ${d}: ${S.rel[i]?'data ✓':i===S.week?'current':i>S.week?'locked':'—'}</span>`).join(' → ')}</p>`;
  n.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>setWeek(+b.dataset.w));}
const updNav=weeksNav;
function setWeek(w){if(w>1){for(let i=0;i<w;i++)S.rel[i]=1;S.dose=doseUnits();EXP=generate(S.code,S.dose);}S.week=w;S.step=S.stepMap[w]||0;save();render(true);}
function gateUpd(){const s=STEPS[S.step],nx=$('#nxt');if(!nx)return;const ok=!s.gate||s.gate()||S.inst;nx.disabled=!ok;$('#gmsg').textContent=ok?'':(s.gmsg||'');}
function render(focus){
  weeksNav();instPanel();
  if(!S.code){startScreen();return;}
  STEPS=stepsFor(S.week);S.step=Math.max(0,Math.min(S.step,STEPS.length-1));const s=STEPS[S.step];
  main.innerHTML=`<p class="stepbar">Week ${S.week} · Day ${CONFIG.days[S.week]} · Step ${S.step+1} of ${STEPS.length}</p><h2 id="sh" tabindex="-1">${s.title}</h2>${S.step===0?WEEK_TODO:''}<aside class="todo" aria-labelledby="wtd"><h3 id="wtd">WHAT TO DO NOW</h3><p>${s.todo}</p></aside><div id="sb"></div><div class="stepnav"><button type="button" id="prev">Back</button><button type="button" id="nxt" class="primary" ${s.last?'hidden':''}>Next</button><span id="gmsg" role="status"></span></div><p id="fbk" class="sr"></p>`;
  s.body($('#sb'));bindTools(main);
  $('#prev').disabled=S.step===0;$('#prev').onclick=()=>step(-1);$('#nxt').onclick=()=>step(1);gateUpd();
  if(focus){$('#sh').focus();scrollTo(0,0);}
}
function step(d){S.step+=d;save();render(true);}
function startScreen(){
  const last=(()=>{try{return localStorage.getItem('brlab:last')||'';}catch{return'';}})();
  main.innerHTML=`<h2 id="sh" tabindex="-1">Welcome to the greenhouse</h2><p>You are a plant scientist testing how fertilizer concentration affects <em>Brassica rapa</em>. The experiment runs for 21 simulated days, with data collected in three weekly labs. This site is the experimental environment only: you will do all calculations, graphs and written answers in your Excel workbook and lab document.</p><div class="grid4"><div class="card"><h3>New experiment</h3><p>Start Week 1 and get your personal Experiment Code.</p><button type="button" id="new" class="primary">Start a new experiment</button></div><div class="card"><h3>Return to my experiment</h3><label for="cin">Experiment Code</label><br><input id="cin" type="text" autocomplete="off" placeholder="BR-7K4Q9" value="${esc(last)}" style="width:100%"><fieldset><legend>Which lab are you starting?</legend>${[1,2,3].map(w=>`<label style="display:flex;gap:8px"><input type="radio" name="wk" value="${w}" ${w===1?'checked':''}> Week ${w} (Day ${CONFIG.days[w]})</label>`).join('')}</fieldset><label style="display:flex;gap:8px"><input type="checkbox" id="honor"> I completed the previous weeks' Excel and lab-document work.</label><button type="button" id="go" class="primary">Continue</button><p id="cerr" class="fb" role="alert"></p></div></div>`;
  $('#new').onclick=()=>{initExp(newCode());S.week=1;S.step=0;save();codeScreen();};
  $('#go').onclick=()=>{const c=normCode($('#cin').value),er=$('#cerr');
    if(!c){er.textContent='That code does not look right. It has the form BR- followed by five letters or numbers.';return;}
    const had=loadStore(c.base);initExp(c.base,c.suf);let w;
    if(had&&Object.keys(S.done).length){w=1;while(w<3&&S.done[w])w++;}
    else{w=+document.querySelector('input[name=wk]:checked').value;if(w>1&&!$('#honor').checked&&!S.inst){er.textContent='To start a later week on a new computer, tick the box to confirm you finished the earlier weeks.';S.code=null;EXP=null;return;}}
    if(w>CONFIG.availableWeeks&&!S.inst){er.textContent=`Week ${w} is not yet available. Your instructor will open it.`;S.code=null;EXP=null;return;}
    setWeek(w);};
}
function codeScreen(){
  main.innerHTML=`<h2 id="sh" tabindex="-1">Your Experiment Code</h2><div class="card"><p class="banner" style="font-size:2.2rem" id="cd">${S.code}</p><p><strong>Record this Experiment Code in your Excel workbook and lab document. You will need it again in Weeks 2 and 3.</strong></p><p>The code recreates exactly the same plants on any computer. If you lose it, you cannot get your plants back. After you treat your pots in Step 4, your code may get longer: always record the full code you are shown.</p><div class="res"><button type="button" id="cc">Copy code</button></div><label style="display:flex;gap:8px;margin-top:10px"><input type="checkbox" id="rc"> I have recorded my Experiment Code.</label><button type="button" id="begin" class="primary" disabled>Begin Week 1</button></div>`;
  $('#sh').focus();$('#cc').onclick=async()=>{try{await navigator.clipboard.writeText(S.code);say('Code copied.');}catch{say('Copy blocked. Please write the code down.');}};
  $('#rc').onchange=e=>$('#begin').disabled=!e.target.checked;$('#begin').onclick=()=>setWeek(1);
}

/* utilities, preferences, instructor mode */
document.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{const u=b.dataset.u;
  if(u==='code')dlg('Experiment code',S.code?`<p class="banner" style="font-size:1.8rem">${codeLabel()}</p><p>Record it in your Excel workbook and lab document. You need it in Weeks 2 and 3. If your code gets longer after you treat your pots, always record the FULL code.</p>`:'<p>You do not have a code yet. Start a new experiment, or enter the code you already have.</p>');
  if(u==='treat')dlg('Fertilizer treatments',`<div class="tw"><table><caption>4 treatments × 4 pots × 4 plants = 64 plants</caption><thead><tr><th scope="col">Treatment</th><th scope="col">Fertilizer</th><th scope="col">Pot IDs</th></tr></thead><tbody>${CONFIG.treatments.map(t=>`<tr><th scope="row">${t.name}</th><td>${t.gl} g/L</td><td>${[1,2,3,4].map(p=>t.key+p).join(', ')}</td></tr>`).join('')}</tbody></table></div><p>Plant IDs: treatment letter + pot number, a dash, plant number. Example: M4-1 = Medium, Pot 4, Plant 1.</p>`);
  if(u==='map')dlg('Greenhouse map',EXP?layoutTable(layoutNow())+(layoutNow()===EXP.grouped?'<p>Pots are still grouped. Randomize them in Week 1, Step 3.</p>':''):'<p>Start an experiment to see your greenhouse.</p>');
  if(u==='guide')dlg('Measurement guide',`<ol><li>Measure from the <strong>surface of the growth medium</strong> to the <strong>highest point of the plant</strong>.</li><li>Move the red marker by dragging on the picture, using the slider, typing a number, or pressing the nudge buttons.</li><li>Stems may curve and leaves may point up. Decide where the highest point is and be consistent.</li><li>Your reading will usually differ slightly from the research team's. That is measurement uncertainty.</li><li>If you cannot see the picture, use "Describe where the plant tip is" for a text description.</li></ol>`);
  if(u==='wrong')dlg('Something went wrong',`<ul><li><strong>Code not accepted:</strong> check it is BR- followed by five characters. The code never contains 0, O, 1, I or L.</li><li><strong>New computer:</strong> choose "Return to my experiment", type your code, and pick the week you are starting.</li><li><strong>Numbers differ from a classmate:</strong> that is expected. Every code makes a different experiment.</li><li><strong>Page looks broken:</strong> refresh with Ctrl+Shift+R (Command+Shift+R on a Mac).</li><li><strong>Still stuck:</strong> email your instructor with your Experiment Code and a description of what you see.</li></ul>`);
  if(u==='a11y'){dlg('Accessibility options',['big:Larger text','hc:High contrast','nomotion:Reduce motion'].map(x=>{const[k,l]=x.split(':');return`<label style="display:flex;gap:8px;min-height:44px"><input type="checkbox" data-p="${k}" ${document.body.classList.contains(k)?'checked':''}> ${l}</label>`;}).join('')+'<p>Every plant image also has a text description, and the measuring tool has a number box and slider as keyboard alternatives.</p>');
    $('#dlg-b').querySelectorAll('[data-p]').forEach(c=>c.onchange=()=>{document.body.classList.toggle(c.dataset.p,c.checked);try{localStorage.setItem('brlab:prefs',JSON.stringify(['big','hc','nomotion'].filter(k=>document.body.classList.contains(k))));}catch{}});}});
try{JSON.parse(localStorage.getItem('brlab:prefs')||'[]').forEach(k=>document.body.classList.add(k));}catch{}

function instPanel(){const p=$('#inst');if(!S.inst){p.innerHTML='';return;}
  p.innerHTML=`<details open><summary>Instructor mode</summary><div>Seed: <strong>${EXP?EXP.code:'(none)'}</strong> · Full code: <strong>${S.code?codeLabel():'(none)'}</strong> · Week ${S.week} · Step ${S.step+1}<br><label>Test code <input id="ic" size="9" aria-label="Test code"></label> <button type="button" id="icb">Load</button><br>Jump to week <select id="iw" aria-label="Week">${[1,2,3].map(w=>`<option ${w===S.week?'selected':''}>${w}</option>`).join('')}</select> step <input id="is" type="number" min="1" value="${S.step+1}" style="width:4.5rem" aria-label="Step"> <button type="button" id="ij">Go</button></div>${EXP?`<div><strong>Generated events</strong><ul>${EXP.anomalies.map(a=>`<li>${a.type}: ${a.id}</li>`).join('')}</ul></div><details><summary>True heights and treatment assignment</summary><div class="tw"><table><thead><tr><th>ID</th><th>g/L</th><th>Day 0</th><th>Day 7</th><th>Day 14</th><th>Day 21</th></tr></thead><tbody>${EXP.plants.map(p=>`<tr><td>${p.id}</td><td>${CONFIG.treatments.find(t=>t.key===p.t).gl}</td>${p.h.map(v=>`<td>${v.toFixed(1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}</details>`;
  $('#icb').onclick=()=>{const c=normCode($('#ic').value);if(c){initExp(c.base,c.suf);S.week=1;S.step=0;render(true);}};
  $('#ij').onclick=()=>{if(!EXP)initExp(newCode());const w=+$('#iw').value;for(let i=0;i<w;i++)S.rel[i]=1;S.week=w;S.step=Math.max(0,+$('#is').value-1);render(true);};}
if(S.inst)window.__lab={S,generate,initExp,setWeek,render,stepsFor,get EXP(){return EXP;}};
render();
