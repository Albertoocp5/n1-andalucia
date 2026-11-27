import {initScout} from './scouting.js';
import {equipo as eq, jugador as pn, botonComparar, escudo} from './comun.js';
const $ = selector => document.querySelector(selector);
const make = (tag,text,cls) => {
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(cls)node.className=cls;
  return node;
};
const action=(text,fn,cls)=>{const b=make('button',text,cls);b.type='button';b.onclick=fn;return b};
const key=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const dt=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',timeZone:'UTC'});
const pretty=d=>dt.format(new Date(d+'T12:00:00Z'));
const roundNum=r=>Number(String(r||'').match(/\d+/)?.[0])||0;
const dmy=d=>d.slice(8,10)+'-'+d.slice(5,7)+'-'+d.slice(0,4);
// Fecha principal de cada jornada: el día en que se juegan más partidos (los aplazados no la mueven).
function roundDates(){
  const by=new Map();
  for(const g of games){if(!g.round)continue;const m=by.get(g.round)||new Map();m.set(g.date,(m.get(g.date)||0)+1);by.set(g.round,m)}
  return new Map([...by].map(([r,m])=>[r,[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0]]));
}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const groups=['A','B','C','D'];
let activeGroup='',week='',games=[],articles=[],editing=null,mainDate=new Map();
const season=await fetch('/season.json').then(r=>{if(!r.ok)throw Error('Calendario no disponible');return r.json()});
games=season.games;
const preview=initScout(season);
function renderControls(){
  mainDate=roundDates();
  const rounds=[...mainDate.keys()].sort((a,b)=>roundNum(a)-roundNum(b));
  // Por defecto, la jornada en curso o la próxima: la primera con partidos sin terminar cuya fecha principal no ha pasado hace más de 2 días.
  if(!week){const soon=new Date(Date.parse(today)-2*864e5).toISOString().slice(0,10);week=rounds.find(r=>mainDate.get(r)>=soon&&games.some(g=>g.round===r&&g.status!=='Final'))||rounds.at(-1)}
  $('#week').replaceChildren(...rounds.map(r=>new Option(r+' ('+dmy(mainDate.get(r))+')',r)));
  $('#week').value=week;
  const i=rounds.indexOf(week);
  $('#prevRound').disabled=i<=0;$('#nextRound').disabled=i>=rounds.length-1;
  $('#prevRound').onclick=()=>{week=rounds[i-1];render()};$('#nextRound').onclick=()=>{week=rounds[i+1];render()};
  const done=games.filter(g=>g.round===week),fin=done.filter(g=>g.status==='Final').length;
  $('#roundState').textContent=fin===done.length?'Jornada terminada · '+fin+' partidos':fin?fin+' de '+done.length+' partidos terminados':'Sin empezar · '+done.length+' partidos';
  const tabs=['',...groups].map(g=>{const b=action(g?'Grupo '+g:'Todos',()=>{activeGroup=g;render()});b.setAttribute('aria-pressed',String(activeGroup===g));return b});
  $('#groupTabs').replaceChildren(...tabs);
}
function weekGames(selectedWeek,group){
  return games.filter(g=>g.round===selectedWeek&&g.group===group).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
function drawGame(game){
  const b=action('',()=>showGame(game),'game');
  const md=mainDate.get(game.round),moved=md&&Math.abs(Date.parse(game.date)-Date.parse(md))>3*864e5;
  const state=game.status==='En juego'?'● En juego':game.status==='Final'?'Final':game.status==='Programado'?'Previa':game.status;
  const meta=make('small',pretty(game.date)+' · '+game.time+' · ');meta.append(make('span',state,'st st-'+(game.status==='Final'?'fin':game.status==='En juego'?'live':'prev')));
  if(moved)meta.append(make('span',' · fecha cambiada','moved'));
  b.append(meta);
  const sc=game.liveScore||game.score,win=i=>sc&&game.status==='Final'&&sc[i]>sc[1-i];
  const row=make('div',null,'g-row');
  const mid=make('span',null,'g-score');
  if(sc){mid.append(make('b',String(sc[0]),win(0)?'w':''),document.createTextNode(' – '),make('b',String(sc[1]),win(1)?'w':''))}else mid.append(make('b',game.time,'t'));
  const lado=(i,c)=>{const s=make('span',null,c+(win(i)?' w':''));s.append(escudo(i?game.away:game.home),make('span',eq(i?game.away:game.home)));return s};
  row.append(lado(0,'g-home'),mid,lado(1,'g-away'));
  b.append(row);
  return b;
}
function renderBoard(){
  const blocks=(activeGroup?[activeGroup]:groups).map(group=>{
    const rows=weekGames(week,group),block=make('div',null,'block');
    const head=make('div','GRUPO '+group,'group-head');
    head.append(make('small',rows.length+' partidos'));block.append(head);
    if(rows.length)block.append(...rows.map(drawGame));else block.append(make('p','Sin partidos en esta jornada.','empty'));
    const more=make('a','Clasificación del grupo '+group+' →','group-link');more.href='/clasificacion.html?grupo='+group;block.append(more);
    return block;
  });
  $('#board').replaceChildren(...blocks);
}
const fieldNames=['MIN','PTS','T2','T3','TL','REB','AST','ROB','PER','TAP','FC','FR','+/−','VAL'];
function leaderText(game){
  if(!game.verified)return '';
  const players=game.box.flatMap(team=>team.rows.map(row=>({name:pn(row[1]),pts:row[3],reb:row[7],ast:row[8]})));
  const valid=players.filter(p=>/^\d+$/.test(p.pts));
  if(!valid.length)return '';
  const max=Math.max(...valid.map(p=>Number(p.pts))),leaders=valid.filter(p=>Number(p.pts)===max);
  if(leaders.length>1)return leaders.map(p=>p.name).join(' y ')+' compartieron el máximo anotador con '+max+' puntos.';
  const p=leaders[0];return p.name+' lideró la anotación con '+max+' puntos'+(p.reb!=null&&p.reb!==''?', '+p.reb+' rebotes':'')+(p.ast!=null&&p.ast!==''?' y '+p.ast+' asistencias':'')+'.';
}
function showGame(g){
  const body=$('#matchBody');
  body.replaceChildren(make('small','GRUPO '+g.group+' · '+(g.round?g.round.toUpperCase()+' · ':'')+pretty(g.date)+' · '+g.time,'kicker'),make('h2',eq(g.home)+' — '+eq(g.away)));
  const score=g.liveScore||g.score;
  if(score)body.append(make('h3',score.join(' – ')+' · '+(g.liveScore?'Parcial · en juego':g.status)));
  if(g.venue)body.append(make('p',g.venue));
  if(g.verified){
    const winner=eq(g.score[0]>g.score[1]?g.home:g.away);
    body.append(make('h3','Crónica del partido'),make('p',winner+' ganó por '+Math.abs(g.score[0]-g.score[1])+' puntos. '+leaderText(g)),make('small',g.source?'Informe de '+g.source:'Informe del archivo histórico'));
  }
  for(const team of g.box||[]){
    body.append(make('h3',eq(team.team)));const wrap=make('div',null,'table-wrap'),table=make('table');
    const hr=make('tr');for(const h of ['Jugador',...fieldNames])hr.append(make('th',h));table.append(hr);
    for(const row of team.rows){
      const tr=make('tr'),td=make('td'),a=make('a',pn(row[1]));a.href='/jugador.html?id='+encodeURIComponent(row[0]);td.append(a);tr.append(td);
      row.slice(2,16).forEach(v=>tr.append(make('td',v)));table.append(tr);
    }
    wrap.append(table);body.append(wrap);
  }
  if(!g.box?.length&&g.score)body.append(make('p','Estadísticas individuales pendientes de un acta verificable.'));
  if(g.box?.length&&!g.verified)body.append(make('p','La suma de puntos individuales o el desglose disponible difiere del marcador. Revisión pendiente.'));
  if(score){
    const plays=make('section',null,'match-plays');
    body.append(plays);
    const report=make('section',null,'adv-report');
    body.insertBefore(report,plays);
    showAdvanced(g,report);
    showFabTimeline(g,plays);
  }
  if(!score)body.append(preview(g,games));
  if(!$('#matchDialog').open)$('#matchDialog').showModal();
}
const playLabels={
  'CANASTA-1P':'Tiro libre anotado','CANASTA-2P':'Canasta de dos','CANASTA-3P':'Triple',
  'TIRO1-FALLADO':'Tiro libre fallado','TIRO2-FALLADO':'Tiro de dos fallado','TIRO3-FALLADO':'Triple fallado',
  'CAMBIO-JUGADOR-ENTRA':'Entra','CAMBIO-JUGADOR-SALE':'Sale','TIEMPO-MUERTO-SOLICITADO':'Tiempo muerto',
};
async function showFabTimeline(game,section){
  const id=game.url?.split('?')[0].split('/').at(-1);
  if(!id)return;
  try{
    const response=await fetch('/api/jugadas-fab?partido='+encodeURIComponent(id));
    if(!response.ok)return;
    const {events,status,checkedAt}=await response.json();
    const title=make('h3','Jugada a jugada');
    const control=make('label','Periodo ');
    const rounds=[...new Set(events.map(event=>event[1]))].sort((a,b)=>b-a);
    const picker=make('select');
    for(const round of rounds)picker.add(new Option(round===0?'Inicio':'Periodo '+round,round));
    picker.add(new Option('Todos los periodos','all'));
    control.append(picker);
    const wrap=make('div',null,'table-wrap'), table=make('table');
    wrap.append(table);
    const stamp=checkedAt?new Date(checkedAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'medium'}):'';
    section.append(title,make('p',events.length+' acciones · Afición FAB · '+(status==='Final'?'secuencia final':'parcial, partido en juego')+(stamp?' · actualizado '+stamp:'')),control,wrap);
    if(status==='En juego')setTimeout(()=>{if(section.isConnected&&$('#matchDialog').open){section.replaceChildren();showFabTimeline(game,section)}},30000);
    const renderPlays=()=>{
      const header=make('tr');
      for(const label of ['Periodo','Reloj','Acción','Equipo','Jugador','Marcador']){
        const cell=make('th',label);cell.scope='col';header.append(cell);
      }
      const head=make('thead');head.append(header);
      const body=make('tbody');
      for(const [,period,clock,action,side,dorsal,player,score] of [...events].reverse()){
        if(picker.value!=='all'&&String(period)!==picker.value)continue;
        const row=make('tr');
        for(const value of [period||'—',clock.replace(/^00:/,'')||'—',playLabels[action]||action.replaceAll('-',' ').toLowerCase(),eq([game.home,game.away][side])||'—',player?((dorsal?'#'+dorsal+' ':'')+pn(player)):'—',score?score.join(' – '):'—'])
          row.append(make('td',value));
        body.append(row);
      }
      table.replaceChildren(head,body);
    };
    picker.onchange=renderPlays;
    renderPlays();
  }catch{section.append(make('p','No se pudo cargar la secuencia de jugadas.'))}
}
function render(){renderControls();renderBoard()}
$('#week').onchange=e=>{week=e.target.value;history.replaceState(null,'','?jornada='+encodeURIComponent(week));render()};
$('#dismiss').onclick=()=>$('#matchDialog').close();
function mergeFeed(records){
  const mapped=new Map(games.map(g=>[g.group+key(g.home)+'/'+key(g.away),g]));
  for(const record of Object.values(records)){
    for(const e of Object.values(record.events||{})){
      const game=mapped.get(e.group+key(e.home)+'/'+key(e.away));
      if(!game)continue;
      const score=typeof e.score==='string'?e.score.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/):null;
      if(game.status!=='Final'&&score){game.score=score.slice(1).map(Number);game.status='Resultado publicado';game.liveScore=null;}
      if(game.status!=='Final'&&e.status==='En juego'&&Array.isArray(e.live)){game.liveScore=e.live;game.status='En juego';}
      if(e.venue)game.venue=e.venue;
      if(e.localStartsAt&&/^\d{4}-\d{2}-\d{2}[T ]\d\d:\d\d/.test(e.localStartsAt)&&game.status!=='Final'){game.date=e.localStartsAt.slice(0,10);game.time=e.localStartsAt.slice(11,16);}
    }
  }
  const times=Object.entries(records).filter(([,g])=>g.lastGood&&!g.error).map(([,g])=>g.lastGood).sort();
  const source=Object.values(records).every(record=>record.source==='Afición FAB');
  $('#feedState').textContent=times.length?(source?'Calendario y marcadores de Afición FAB':'Resultados sincronizados en '+times.length+'/4 grupos')+' · '+new Date(times[0]).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}):'Calendario de la temporada';
}
async function refresh(){try{const r=await fetch('/api/results-saved');if(!r.ok)throw Error();mergeFeed(await r.json());render()}catch{$('#feedState').textContent='Último calendario disponible · 24/11/2026'}}
render();refresh();
// Con partidos en juego el marcador se consulta cada 30 s; si no, cada 5 min.
(function poll(){setTimeout(async()=>{if(!document.hidden)await refresh();poll()},games.some(g=>g.status==='En juego')?30000:300000)})();

const selectedMatch=new URLSearchParams(location.search).get('partido');
if(selectedMatch){
  const game=games.find(g=>g.url?.split('?')[0].split('/').at(-1)===selectedMatch);
  if(game){week=game.round;activeGroup=game.group;render();showGame(game);}
}else{
  const qs=new URLSearchParams(location.search);
  if(qs.get('jornada')&&games.some(g=>g.round===qs.get('jornada'))){week=qs.get('jornada');if('ABCD'.includes(qs.get('grupo')||'x'))activeGroup=qs.get('grupo');render()}
}

// Informe avanzado del partido (scripts/avanzadas.py → /api/avanzadas?partido=)
const fx=(v,d=1)=>v==null?'—':new Intl.NumberFormat('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const sg=v=>v==null?'—':(v>0?'+':'')+fx(v);
async function showAdvanced(game,section){
  const id=game.url?.split('?')[0].split('/').at(-1);
  let a;
  try{const r=await fetch('/api/avanzadas?partido='+encodeURIComponent(id));if(!r.ok)return;a=await r.json();}catch{return}
  const [H,A]=a.equipos, short=n=>eq(n).split(' ').slice(-2).join(' ');
  const ana=(...nodes)=>{for(const n of nodes){n.classList.add('solo-ana');section.append(n)}};
  const keys=make('div',null,'keys');
  const head=make('div',null,'key-row');head.append(make('b',short(H)),make('span'),make('span','',''),make('span'),make('b',short(A)));
  keys.append(head);
  for(const [k,label,max,low,tipKey] of [['ts','TS%',80],['efg','eFG%',75],['orb','Reb. ofensivo %',60,false,'ORB%'],['tov','Pérdidas %',35,true,'TOV%'],['ftr','Tiros libres / tiro',0.8,false,'FTr'],['ast','Canastas asistidas %',90,false,'AST%'],['off','Puntos por 100 pos.',140,false,'Ataque']]){
    const [h,w]=a.claves.map(c=>c[k]);
    const row=make('div',null,'key-row');
    const bar=(v,side)=>{const b=make('div',null,'bar '+side),i=make('i');i.style.width=Math.min(100,100*(v||0)/max)+'%';b.append(i);return b};
    const better=low?(h<w?0:1):(h>w?0:1);
    const vh=make('span',fx(h,k==='ftr'?2:1),'v'+(better===0?' win':'')),vw=make('span',fx(w,k==='ftr'?2:1),'v'+(better===1?' win':''));
    const lab=make('span',label,'label');lab.dataset.tip=tipKey||label;lab.tabIndex=0;
    row.append(vh,bar(h,'home'),lab,bar(w,'away'),vw);keys.append(row);
  }
  ana(make('h3','Claves del partido'),keys);
  const facts=make('p',null,'facts');
  facts.classList.add('solo-ana');
  facts.append(...[['Ritmo',fx(a.claves[0].ritmo)+' pos./40 min'],['Cambios de líder',a.cambiosLider],['Empates',a.empates],['Máx. ventaja',short(H)+' '+a.maxVentaja[0]+' · '+short(A)+' '+a.maxVentaja[1]]].map(([k,v])=>{const s=make('span');s.append(make('b',k+': '),document.createTextNode(v));return s}));
  section.append(facts);
  // Evolución del marcador: diferencia local − visitante
  const W=640,Hh=180,P=22,T=Math.max(2400,a.min*60),maxD=Math.max(8,...a.evolucion.map(e=>Math.abs(e[1]-e[2])));
  const X=t=>P+t/T*(W-P-6),Y=d=>Hh/2-d/maxD*(Hh/2-14);
  let path='M'+X(0)+' '+Y(0),area='';
  for(const [t,h,v] of a.evolucion){path+=' H'+X(t).toFixed(1)+' V'+Y(h-v).toFixed(1)}
  path+=' H'+X(T);
  const svg=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Evolución de la diferencia en el marcador"><clipPath id="up"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath><clipPath id="dn"><rect x="0" y="${Y(0)}" width="${W}" height="${Hh}"/></clipPath>`+
    `<path d="${path} V${Y(0)} H${X(0)}Z" class="lead-home" clip-path="url(#up)"/><path d="${path} V${Y(0)} H${X(0)}Z" class="lead-away" clip-path="url(#dn)"/>`+
    [600,1200,1800,2400].filter(t=>t<T).map(t=>`<line class="q" x1="${X(t)}" x2="${X(t)}" y1="6" y2="${Hh-6}"/>`).join('')+
    `<line class="q" x1="${P}" x2="${W-6}" y1="${Y(0)}" y2="${Y(0)}"/><path d="${path}" class="line"/>`+
    `<text x="${P}" y="12">${short(H)} por delante</text><text x="${P}" y="${Hh-4}">${short(A)} por delante</text>`+
    [0,10,20,30,40].map(m=>`<text x="${X(m*60)}" y="${Y(0)-4}" text-anchor="middle">${m}′</text>`).join('')+'</svg>';
  const flow=make('div',null,'flow');flow.innerHTML=svg;
  section.append(make('h3','Evolución del marcador'),flow);
  if(a.parciales.length){
    const runs=make('div',null,'runs');
    for(const r of a.parciales)runs.append(make('span',`${short(a.equipos[r.equipo])} ${r.pts}-0 · min ${Math.floor(r.from/60)}–${Math.ceil(r.to/60)} (${r.score.join('-')})`));
    section.append(make('h3','Parciales sin respuesta'),runs);
  }
  const table=(heads,rows)=>{const w=make('div',null,'table-wrap'),t=make('table');const tr=make('tr');heads.forEach(h=>tr.append(make('th',h)));t.append(tr);for(const r of rows){const x=make('tr');r.forEach(v=>{const td=make('td');if(v instanceof Node)td.append(v);else td.textContent=v;x.append(td)});t.append(x)}w.append(t);return w};
  const plink=p=>{const l=make('a',pn(p.nombre));l.href='/jugador.html?id='+encodeURIComponent(p.id);return l};
  ana(make('h3','Ritmo por periodos'),table(['Periodo','Pts','Pos.','Ataque '+short(H),'Ataque '+short(A),'Net '+short(H)],a.cuartos.map(q=>[q.periodo>4?'Prórroga '+(q.periodo-4):q.periodo+'.º',q.eq[0].pts+'–'+q.eq[1].pts,fx(q.eq[0].pos),fx(q.eq[0].off),fx(q.eq[1].off),sg(q.eq[0].net)])));
  if(a.tiros?.length){
    const {drawCourt}=await import('/tiros.js');
    const grid=make('div',null,'shot-grid');
    section.append(make('h3','Mapas de tiro'),grid);
    a.equipos.forEach((team,i)=>drawCourt(grid,a.tiros.filter(t=>t[0]===i).map(t=>({a:t[1]/10,s:t[2]/10,v:t[3],m:t[4]})),{title:eq(team),label:'Mapa de tiro de '+team}));
  }
  if(a.clutch)ana(make('h3','Final apretado (clutch)'),table(['Equipo','PTS','TC','PÉR'],a.clutch.map((c,i)=>[eq(a.equipos[i]),c.pts,c.fgm+'/'+c.fga,c.tov])));
  ana(make('h3','Impacto en pista'),table(['Jugador','Equipo','MIN','PTS','TS%','USG%','+/-','Ataque','Defensa'],[...a.jugadores].filter(p=>p.min>0).sort((x,y)=>y.pm-x.pm).map(p=>[plink(p),short(a.equipos[p.lado]),fx(p.min),p.pts,fx(p.ts),fx(p.usg),sg(p.pm),fx(p.off),fx(p.def)])));
  if(a.quintetos.length)ana(make('h3','Quintetos más usados'),table(['Equipo','Quinteto','MIN','+/-','Net'],a.quintetos.slice(0,8).map(q=>[short(a.equipos[q.lado]),q.jug.map(n=>pn(n).split(' ').slice(-2).join(' ')).join(' · '),fx(q.min),sg(q.pm),sg(q.net)])));
  section.append(make('small','Cálculo propio con el jugada a jugada de Afición FAB · definiciones en Estadística avanzada → Glosario'));
}
