const fabCalendarKey = 'fab/calendario.json';
const fabTimelineKey = id => 'fab/jugadas/'+id+'.json';
const fabTimelineLimit = 5000;
const fabScore = value => Array.isArray(value) && value.length===2
  && value.every(points=>Number.isInteger(points) && points>=0 && points<=350);
const fabDate = value => typeof value==='string' && /^20\d\d-\d\d-\d\d$/.test(value)
  && Number.isFinite(Date.parse(value)) && dateAt(Date.parse(value))===value;
const fabTime = value => typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const fabRound = value => typeof value==='string' && /^Jornada (?:[1-9]|[1-9]\d)$/.test(value);
function fabWriteDenied(request,env) {
  if(request.method!=='POST')return json({error:'Método no admitido.'},405);
  if(!env.FAB_IMPORT_TOKEN || request.headers.get('authorization')!=='Bearer '+env.FAB_IMPORT_TOKEN)
    return json({error:'Acceso restringido.'},401);
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return json({error:'Se esperaba JSON.'},415);
  return null;
}
async function fabCalendarImport(request,env) {
  const denied=fabWriteDenied(request,env);
  if(denied)return denied;
  const raw=await request.text();
  if(raw.length>300000)return json({error:'Calendario demasiado extenso.'},413);
  let items;
  try{items=JSON.parse(raw).games;}catch{return json({error:'Calendario no válido.'},400)}
  if(!Array.isArray(items)||items.length!==seedById.size)return json({error:'Se requiere el calendario completo de la N1.'},422);
  const games={};
  for(const item of items){
    const {id,date,time,round,venue,status,score}=item||{};
    if(!seedById.has(id)||Object.hasOwn(games,id)||!fabDate(date)||!fabTime(time)||!fabRound(round)
      ||typeof venue!=='string'||venue.length>180||!['Final','Programado','En juego','Aplazado','Suspendido'].includes(status)
      ||(status==='Final'&&(!fabScore(score)||score[0]===score[1]))
      ||(status==='En juego'&&!fabScore(score))
      ||(!['Final','En juego'].includes(status)&&score!==null))
      return json({error:'El calendario contiene un encuentro inválido.'},422);
    games[id]={date,time,round,venue,status,score};
  }
  const checkedAt=new Date().toISOString();
  await env.BUCKET.put(fabCalendarKey,JSON.stringify({checkedAt,games}));
  return json({state:'Calendario FAB guardado',matches:Object.keys(games).length,checkedAt});
}
function applyFabCalendar(game,calendar) {
  const update=calendar?.games?.[matchId(game.url)];
  if(!update)return game;
  const {status,score,...schedule}=update;
  if(status==='Final'){
    const same=game.score?.[0]===score[0]&&game.score?.[1]===score[1];
    return {...game,...schedule,status,score,calendarSource:'Afición FAB',...(same?{}:{box:null,verified:false})};
  }
  if(game.status==='Final')return {...game,...schedule,calendarSource:'Afición FAB'};
  return {...game,...schedule,status,liveScore:status==='En juego'?score:null,calendarSource:'Afición FAB'};
}
function fabCalendarFeed(calendar) {
  return Object.fromEntries(Object.keys(divisions).map(group=>{
    const events={};
    for(const [id,schedule] of Object.entries(calendar.games)){
      const game=seedById.get(id);
      if(!game||game.group!==group)continue;
      events[id]={id,group,home:game.home,away:game.away,venue:schedule.venue,
        localStartsAt:schedule.date+'T'+schedule.time,
        status:schedule.status,live:schedule.status==='En juego'?schedule.score:null,
        score:schedule.status==='Final'?schedule.score.join('-'):null};
    }
    return [group,{source:'Afición FAB',events,lastGood:calendar.checkedAt,error:null}];
  }));
}
function normalizeFabEvent(event,previous) {
  if(!Array.isArray(event)||event.length!==11)return null;
  const [seq,period,clock,action,side,dorsal,player,score,points,x,y]=event;
  const coordinate=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000;
  if(!Number.isInteger(seq)||seq<=previous||!Number.isInteger(period)||period<0||period>32
    ||typeof clock!=='string'||(clock!==''&&!/^\d\d:\d\d:\d\d(?:\.\d{1,3})?$/.test(clock))
    ||typeof action!=='string'||!/^[A-Z0-9_-]{1,65}$/.test(action)
    ||![-1,0,1].includes(side)||typeof dorsal!=='string'||!/^(\d{1,3}|)$/.test(dorsal)
    ||typeof player!=='string'||player.length>140||!(score===null||fabScore(score))
    ||!fabScore(points)||!coordinate(x)||!coordinate(y))return null;
  return event;
}
async function fabTimeline(request,env,url) {
  if(request.method==='GET'){
    const id=url.searchParams.get('partido');
    if(!seedById.has(id))return json({error:'Partido no disponible.'},404);
    const data=await read(env.BUCKET,fabTimelineKey(id));
    return data?json(data):json({error:'Todavía no hay jugadas de Afición FAB para este partido.'},404);
  }
  const denied=fabWriteDenied(request,env);
  if(denied)return denied;
  const raw=await request.text();
  if(raw.length>650000)return json({error:'Secuencia demasiado extensa.'},413);
  let entry;
  try{entry=JSON.parse(raw)}catch{return json({error:'Secuencia no válida.'},400)}
  const {id,events,score}=entry||{};
  const calendar=await read(env.BUCKET,fabCalendarKey);
  const game=calendar?.games?.[id];
  if(!seedById.has(id)||!game||!['Final','En juego'].includes(game.status)||!fabScore(score)
    ||game.score?.some((value,i)=>value!==score[i])||!Array.isArray(events)||!events.length||events.length>fabTimelineLimit)
    return json({error:'La secuencia no coincide con el partido de Afición FAB.'},422);
  let last=-1;
  for(const event of events){
    if(!normalizeFabEvent(event,last))return json({error:'La secuencia contiene una jugada inválida.'},422);
    last=event[0];
  }
  const key=fabTimelineKey(id);
  const old=await env.BUCKET.get(key);
  const previous=old?await old.json():null;
  if(previous?.status==='Final'&&game.status!=='Final')return json({error:'El partido ya tiene una secuencia final.'},409);
  // Un reintento tardío con una instantánea anterior no sustituye a la más reciente.
  if(previous?.status==='En juego'&&game.status==='En juego'&&previous.events.at(-1)[0]>events.at(-1)[0])
    return json({error:'Secuencia anterior a la guardada.'},409);
  if(previous?.status===game.status&&JSON.stringify(previous.events)===JSON.stringify(events))
    return json({state:'Jugadas FAB ya guardadas',count:events.length});
  const written=await env.BUCKET.put(key,JSON.stringify({id,source:'Afición FAB',status:game.status,score,events,checkedAt:new Date().toISOString()}),
    {onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});
  if(!written)return json({error:'La secuencia cambió. Reinténtalo.'},409);
  return json({state:'Jugadas FAB guardadas',count:events.length});
}
// Estadística avanzada calculada a partir de actas y jugadas FAB (scripts/avanzadas.py).
const fabAdvancedKey = (id,tipo) => id ? 'fab/avanzadas/partidos/'+id+'.json' : tipo==='tiros' ? 'fab/avanzadas/tiros.json' : 'fab/avanzadas/temporada.json';
async function fabAdvanced(request,env,url) {
  if(request.method==='GET'){
    const id=url.searchParams.get('partido');
    if(id&&!seedById.has(id))return json({error:'Partido no disponible.'},404);
    const data=await read(env.BUCKET,fabAdvancedKey(id,url.searchParams.has('tiros')?'tiros':null));
    return data?json(data):json({error:'Todavía no hay estadística avanzada.'},404);
  }
  const denied=fabWriteDenied(request,env);
  if(denied)return denied;
  const raw=await request.text();
  if(raw.length>2000000)return json({error:'Datos demasiado extensos.'},413);
  let body;
  try{body=JSON.parse(raw)}catch{return json({error:'Datos no válidos.'},400)}
  const {tipo,id,datos}=body||{};
  if(!datos||typeof datos!=='object'||!['temporada','partido','tiros'].includes(tipo)||(tipo==='partido'&&!seedById.has(id)))
    return json({error:'Datos no válidos.'},422);
  await env.BUCKET.put(fabAdvancedKey(tipo==='partido'?id:null,tipo),JSON.stringify({...datos,checkedAt:new Date().toISOString()}));
  return json({state:'Estadística avanzada guardada',tipo});
}
