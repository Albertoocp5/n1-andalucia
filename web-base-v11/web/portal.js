import {initScout} from './scouting.js';
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
function monday(date){
  const d=new Date(date+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const groups=['A','B','C','D'];
let activeGroup='',week='',games=[],articles=[],editing=null;
const season=await fetch('/season.json').then(r=>{if(!r.ok)throw Error('Calendario no disponible');return r.json()});
games=season.games;
const preview=initScout(season);
function renderControls(){
  const weeks=[...new Set(games.map(g=>monday(g.date)))].sort();
  if(!week)week=weeks.find(w=>w>=monday(today))||weeks.at(-1);
  $('#week').replaceChildren(...weeks.map(w=>new Option('Semana del '+pretty(w)+' de '+w.slice(0,4),w)));
  $('#week').value=week;
  const tabs=['',...groups].map(g=>{const b=action(g?'Grupo '+g:'Todos',()=>{activeGroup=g;render()});b.setAttribute('aria-pressed',String(activeGroup===g));return b});
  $('#groupTabs').replaceChildren(...tabs);
}
function weekGames(selectedWeek,group){
  return games.filter(g=>monday(g.date)===selectedWeek&&g.group===group).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
function drawGame(game){
  const b=action('',()=>showGame(game),'game');
  b.append(make('small',pretty(game.date)+' · '+game.time+' · '+game.status));
  [game.home,game.away].forEach((team,i)=>{
    const line=make('div',null,'teamline');
    line.append(make('span',team),make('b',game.score?.[i]??''));b.append(line);
  });
  return b;
}
function renderBoard(){
  const blocks=(activeGroup?[activeGroup]:groups).map(group=>{
    const rows=weekGames(week,group),block=make('div',null,'block');
    const head=make('div','GRUPO '+group,'group-head');
    head.append(make('small',rows.length+' partidos'));block.append(head);
    if(rows.length)block.append(...rows.map(drawGame));else block.append(make('p','Sin encuentros en esta semana.','empty'));
    return block;
  });
  $('#board').replaceChildren(...blocks);
}
const fieldNames=['MIN','PTS','T2','T3','TL','REB','AST','ROB','PER','TAP','FC','FR','+/−','VAL'];
function leaderText(game){
  if(!game.verified)return '';
  const players=game.box.flatMap(team=>team.rows.map(row=>({name:row[1],pts:row[3],reb:row[7],ast:row[8]})));
  const valid=players.filter(p=>/^\d+$/.test(p.pts));
  if(!valid.length)return '';
  const max=Math.max(...valid.map(p=>Number(p.pts))),leaders=valid.filter(p=>Number(p.pts)===max);
  if(leaders.length>1)return leaders.map(p=>p.name).join(' y ')+' compartieron el máximo anotador con '+max+' puntos.';
  const p=leaders[0];return p.name+' lideró la anotación con '+max+' puntos'+(p.reb!=null&&p.reb!==''?', '+p.reb+' rebotes':'')+(p.ast!=null&&p.ast!==''?' y '+p.ast+' asistencias':'')+'.';
}
function showGame(g){
  const body=$('#matchBody');
  body.replaceChildren(make('small','GRUPO '+g.group+' · '+pretty(g.date)+' · '+g.time,'kicker'),make('h2',g.home+' — '+g.away));
  if(g.score)body.append(make('h3',g.score.join(' – ')+' · '+g.status));
  if(g.round)body.append(make('p',g.round));
  if(g.venue)body.append(make('p',g.venue));
  if(g.verified){
    const winner=g.score[0]>g.score[1]?g.home:g.away;
    body.append(make('h3','Crónica del partido'),make('p',winner+' ganó por '+Math.abs(g.score[0]-g.score[1])+' puntos. '+leaderText(g)),make('small',g.source?'Informe de '+g.source:'Informe del archivo histórico'));
  }
  for(const team of g.box||[]){
    body.append(make('h3',team.team));const wrap=make('div',null,'table-wrap'),table=make('table');
    const hr=make('tr');for(const h of ['Jugador',...fieldNames])hr.append(make('th',h));table.append(hr);
    for(const row of team.rows){
      const tr=make('tr'),td=make('td'),a=make('a',row[1]);a.href='/andalucia.html?jugador='+encodeURIComponent(row[0])+'#jugadores';td.append(a);tr.append(td);
      row.slice(2,16).forEach(v=>tr.append(make('td',v)));table.append(tr);
    }
    wrap.append(table);body.append(wrap);
  }
  if(!g.box?.length&&g.score)body.append(make('p','Estadísticas individuales pendientes de un acta verificable.'));
  if(g.box?.length&&!g.verified)body.append(make('p','La suma de puntos individuales o el desglose disponible difiere del marcador. Revisión pendiente.'));
  if(!g.score)body.append(preview(g,games));
  if(!$('#matchDialog').open)$('#matchDialog').showModal();
}
function render(){renderControls();renderBoard()}
$('#week').onchange=e=>{week=e.target.value;render()};
$('#dismiss').onclick=()=>$('#matchDialog').close();
function mergeFeed(records){
  const mapped=new Map(games.map(g=>[g.group+key(g.home)+'/'+key(g.away),g]));
  for(const record of Object.values(records)){
    for(const e of Object.values(record.events||{})){
      const game=mapped.get(e.group+key(e.home)+'/'+key(e.away));
      if(!game)continue;
      const score=typeof e.score==='string'?e.score.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/):null;
      if(game.status!=='Final'&&score){game.score=score.slice(1).map(Number);game.status='Resultado publicado';}
      if(e.venue)game.venue=e.venue;
      if(e.localStartsAt&&/^\d{4}-\d{2}-\d{2}[T ]\d\d:\d\d/.test(e.localStartsAt)&&game.status!=='Final'){game.date=e.localStartsAt.slice(0,10);game.time=e.localStartsAt.slice(11,16);}
    }
  }
  const times=Object.entries(records).filter(([,g])=>g.lastGood&&!g.error).map(([,g])=>g.lastGood).sort();
  $('#feedState').textContent=times.length?'Resultados sincronizados en '+times.length+'/4 grupos · '+new Date(times[0]).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}):'Calendario de la temporada';
}
async function refresh(){try{const r=await fetch('/api/results-saved');if(!r.ok)throw Error();mergeFeed(await r.json());render()}catch{$('#feedState').textContent='Último calendario disponible · 24/11/2026'}}
render();refresh();

const selectedMatch=new URLSearchParams(location.search).get('partido');
if(selectedMatch){
  const game=games.find(g=>g.url?.split('?')[0].split('/').at(-1)===selectedMatch);
  if(game){week=monday(game.date);activeGroup=game.group;render();showGame(game);}
}
