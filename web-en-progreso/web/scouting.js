import {forecast} from './model.js';
import {splits, evolution} from './laboratorio.js';
const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const format=x=>Number.isFinite(x)?x.toLocaleString('es-ES',{maximumFractionDigits:1}):'—';
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const prior=(xs,k)=>xs.reduce((a,b)=>a+b,0)/(xs.length+k);
const norm=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
function profiles(games){
  const map=new Map();
  function entry(key,name,group,team,id){if(!map.has(key))map.set(key,{name,group,team,id,rows:[],games:[]});return map.get(key)}
  for(const g of games.filter(g=>g.verified)){
    for(const t of g.box){const team=entry(t.team,t.team,g.group,t.team);team.games.push(g);team.rows.push(...t.rows);
      for(const row of t.rows){const player=entry(row[0]+'|'+t.team,row[1],g.group,t.team,row[0]);player.games.push(g);player.rows.push(row)}
    }
  }
  for(const x of map.values()){
    const sum=i=>x.rows.reduce((a,r)=>r[i]==null||r[i]===''?NaN:a+Number(String(r[i]).replace(',','.')),0);
    const shots=i=>[0,1].map(j=>x.rows.reduce((a,r)=>a+Number(String(r[i]).split('/')[j]),0));
    const [two,t2]=shots(4),[three,t3]=shots(5),[,ft]=shots(6),fga=t2+t3,n=x.games.length;
    const frac=(a,b)=>b>0?a/b:NaN;
    x.metrics={'Puntos por partido':sum(3)/n,'Rebotes por partido':sum(7)/n,'Asistencias por partido':sum(8)/n,'VAL media':sum(15)/n,'Tiro efectivo (%)':frac(100*(two+1.5*three),fga),'Tiro verdadero (%)':frac(50*sum(3),fga+.44*ft),'Triples sobre tiros de campo (%)':frac(100*t3,fga),'Asistencias por pérdida':frac(sum(8),sum(10))};
    if(!x.id)x.metrics['Puntos recibidos por partido']=avg(x.games.map(g=>g.score[g.home===x.team?1:0]));
  }
  return map;
}
function table(headers,rows){const box=element('div'),t=element('table');box.className='table-wrap';for(const [i,row] of [headers,...rows].entries()){const tr=element('tr');for(const value of row)tr.append(element(i?'td':'th',value));t.append(tr)}box.append(t);return box}
export function initScout(season){
 const entities=profiles(season.games),input=document.querySelector('#scoutSearch'),hits=document.querySelector('#scoutHits');
 const dialog=document.querySelector('#scoutDialog'),body=document.querySelector('#scoutBody');
 document.querySelector('#closeScout').onclick=()=>dialog.close();
 function open(x){
  const peers=[...entities.values()].filter(y=>!!x.id===!!y.id&&y.group===x.group);
  body.replaceChildren(element('h2',x.name),element('p',(x.id?x.team+' · ':'')+'Grupo '+x.group+' · '+x.games.length+' partidos con acta'));
  body.append(table(['Indicador','Temporada','Media del grupo¹'],Object.entries(x.metrics).map(([k,v])=>[k,format(v),format(avg(peers.map(y=>y.metrics[k]).filter(Number.isFinite)))])),element('small','¹ Media simple entre '+(x.id?'jugadores':'equipos')+' con dato. Los porcentajes individuales se calculan sobre los intentos acumulados.'));
  if(x.id){body.append(evolution(x));const link=element('a','Ver el historial por jornada');link.href='/andalucia.html?jugador='+x.id;body.append(element('p'),link)}
  else{const recent=[...x.games].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);body.append(element('h3','Últimos cinco resultados'),table(['Fecha','Rival','Puntos a favor y en contra'],recent.map(g=>[g.date,g.home===x.name?g.away:g.home,(g.home===x.name?g.score:[...g.score].reverse()).join(' – ')])))}
  dialog.showModal();
 }
 input.oninput=()=>{const words=norm(input.value.trim()).split(/\s+/);hits.replaceChildren();if(!words[0])return;
 const found=[...entities.values()].filter(x=>words.every(w=>norm(x.name).includes(w)));hits.append(element('small',found.length+' coincidencias'));for(const x of found.slice(0,30)){const b=element('button',x.name+' · '+(x.id?x.team:'Grupo '+x.group));b.onclick=()=>open(x);hits.append(b)}};
 return function preview(g,games){
  const history=games.filter(x=>x.date<g.date),model=forecast(history),est=model.estimate(g),pct=Math.round(100*est.p);
  const section=element('section');section.className='scoutPreview';section.append(element('h3','Previa del partido'),element('p','Probabilidad estimada de victoria'),element('strong',g.home+' '+pct+' %  ·  '+(100-pct)+' % '+g.away));
  const a=entities.get(g.home),b=entities.get(g.away);if(a&&b)section.append(table(['Media de temporada',g.home,g.away],[['Partidos con acta',a.games.length,b.games.length],...Object.keys(a.metrics).map(k=>[k,format(a.metrics[k]),format(b.metrics[k])])]));
  section.append(splits(g,history));
  const d=element('details');d.append(element('summary','Cómo se simula y qué precisión tiene'),element('p','Margen esperado del local: '+format(est.expected)+' puntos. Ventaja de pista estimada en la liga: '+format(est.home)+' puntos. Diferencia de fuerza ajustada al rival: '+format(est.gap)+' puntos.'),element('p','Los equipos parten iguales. Tras cada partido se transfiere el 15 % de la diferencia entre el margen observado y el esperado, limitada a ±30 puntos. La localía se modera con 20 partidos de referencia a margen cero. La simulación aplica al margen previsto todos los errores históricos en ambos sentidos e incluye diez escenarios neutrales. No incorpora bajas ni alineaciones.'),element('p','Prueba cronológica tras las primeras fechas: '+model.n+' predicciones. Brier '+(model.brier?.toFixed(3)??'—')+' frente a 0,250 al dar un 50 % a cada equipo. Menor es mejor. La muestra aún es corta.'));section.append(d);return section;
 };
}
