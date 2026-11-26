const divisions = { A:125786, B:125787, C:125788, D:125789 };
const day = 86400000;
const json = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
const dateAt = x => new Date(x).toISOString().slice(0,10);
const read = async (bucket,key) => (await bucket.get(key))?.json();

async function refreshGroup(bucket,group,now) {
  const key='scores/'+group+'.json';
  const previousObject=await bucket.get(key);
  const previous=previousObject ? await previousObject.json() : {events:{},lastFull:null};
  if (previous.retryAt>now || (now-Date.parse(previous.lastCheck)) < 3600000) return previous;
  // Persist the attempt before contacting the feed. A lost request can retry
  // after one hour and a new deployment retains its previous results.
  await bucket.put(key,JSON.stringify({...previous,lastCheck:new Date(now).toISOString(),error:'Sincronización en curso'}));
  const since=Date.parse(previous.lastGood);
  const isDelta=Number.isFinite(since) && now-since<6*day && now-Date.parse(previous.lastFull)<day;
  const args=new URLSearchParams({tournament_id:String(divisions[group]),from:dateAt(now-6*day),to:dateAt(now+8*day),limit:'100'});
  if(isDelta) args.set('updated_since',new Date(since-60000).toISOString());
  const result={...previous,lastCheck:new Date(now).toISOString()};
  try{
    const response=await fetch('https://sportsevents24.com/api/v1/events?'+args,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      result.retryAt=now+Math.max(3600,Number(response.headers.get('retry-after'))||0)*1000;
      throw Error('La fuente ha respondido HTTP '+response.status);
    }
    const body=await response.json();
    if(!Array.isArray(body.data)||body.nextCursor) throw Error('Respuesta incompleta de la fuente');
    for(const record of body.data){
      if(record.tournamentId!==divisions[group] || record.sportId!==2 || !record.tournament?.includes('2026/2027') || !record.tournament?.includes('N1 MAS') || !record.tournament?.endsWith('GRUPO '+group)) throw Error('Competición sin verificar');
      if(!record.teamHome||!record.teamAway||!record.startsAt)continue;
      result.events[record.id]={id:record.id,home:record.teamHome,away:record.teamAway,startsAt:record.startsAt,localStartsAt:record.localStartsAt,timeZoneConfidence:record.timeZoneConfidence,score:record.result,updatedAt:record.updatedAt,venue:record.location,group};
    }
    result.lastGood=result.lastCheck;
    if(!isDelta)result.lastFull=result.lastCheck;
    result.error=null;result.retryAt=0;
  }catch(e){result.error=e.message}
  await bucket.put(key,JSON.stringify(result));
  return result;
}
async function feed(bucket,update){
  const results=await Promise.all(Object.keys(divisions).map(async group=>{
    const record=update?await refreshGroup(bucket,group,Date.now()):await read(bucket,'scores/'+group+'.json');
    return [group,record||{events:{}}];
  }));
  const records=Object.fromEntries(results);if(update)await recordForecasts(bucket,records);return records;
}
const syncSummary=records=>Object.fromEntries(Object.entries(records).map(([group,r])=>[group,{events:Object.keys(r.events).length,lastGood:r.lastGood||null,error:r.error||null}]));
async function articles(request,bucket,url) {
  const user=request.headers.get('oai-authenticated-user-id');
  if(!user)return json({error:'Abre la web con tu cuenta de ChatGPT.'},401);
  const prefix='articles/'+encodeURIComponent(user)+'/';
  if(request.method==='GET'){
    const items=[];
    let cursor;
    do{
      const page=await bucket.list({prefix,cursor,include:['customMetadata']});
      for(const item of page.objects)items.push({id:item.key.slice(prefix.length),...item.customMetadata});
      cursor=page.truncated?page.cursor:null;
    }while(cursor);
    const id=url.searchParams.get('id');
    if(id&&/^[a-z0-9-]{36}$/.test(id))return json(await read(bucket,prefix+id)||null);
    return json(items.sort((a,b)=>String(b.updated).localeCompare(String(a.updated))));
  }
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Solicitud no válida'},403);
  const p=await request.json();
  if(!/^[a-z0-9-]{36}$/.test(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>150||typeof p.body!=='string'||!p.body.trim()||p.body.length>30000||!['Borrador','Publicado'].includes(p.status))return json({error:'Revisa título, texto y estado.'},400);
  const updated=new Date().toISOString();
  const article={id:p.id,title:p.title,body:p.body,status:p.status,updated,revision:crypto.randomUUID()};
  const old=await bucket.head(prefix+p.id);
  if(old && old.customMetadata?.revision!==p.revision)return json({error:'Hay una versión más reciente. Abre el artículo antes de guardar.'},409);
  const saved=await bucket.put(prefix+p.id,JSON.stringify(article),{customMetadata:{title:article.title,status:article.status,updated,revision:article.revision},...(old?{onlyIf:{etagMatches:old.etag}}:{})});
  return saved?json(article):json({error:'El artículo cambió en otra ventana.'},409);
}
async function mcp(request,bucket){
  const {method,id,params}=await request.json();
  const wrap=result=>json({jsonrpc:'2.0',id,result});
  if(method==='server/discover')return wrap({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
  if(method==='initialize')return wrap({protocolVersion:params?.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'N1 Andalucía',version:'1.0'}});
  if(method==='tools/list')return wrap({tools:['actualizar_marcadores','comprobar_actualizacion'].map(name=>({name,description:name==='actualizar_marcadores'?'Consulta los resultados de los cuatro grupos y guarda los cambios verificados.':'Lee la fecha de la sincronización guardada para cada grupo.',inputSchema:{type:'object',properties:{},additionalProperties:false}}))});
  if(method==='tools/call'&&['actualizar_marcadores','comprobar_actualizacion'].includes(params?.name)){
    const records=await feed(bucket,params.name==='actualizar_marcadores');
    return wrap({content:[{type:'text',text:JSON.stringify(syncSummary(records))}],isError:Object.values(records).some(x=>x.error)});
  }
  if(id===undefined)return new Response(null,{status:202});
  return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Método no disponible'}});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(url.pathname==='/mcp' && request.method==='POST')return mcp(request,env.BUCKET);
    if(url.pathname==='/api/articles')return articles(request,env.BUCKET,url);
    if(url.pathname==='/api/results-saved' && request.method==='GET')return json(await feed(env.BUCKET,false));
    if(url.pathname==='/api/results' && request.method==='GET')return json(await feed(env.BUCKET,true));
    if(url.pathname==='/api/sync-status' && request.method==='GET')return json(syncSummary(await feed(env.BUCKET,false)));
    if(url.pathname==='/api/pronosticos')return json(await predictionHistory(env.BUCKET));
    if(url.pathname==='/api/actas')return json({error:'La importación de Canastio se ha retirado.'},410);
    if(url.pathname==='/api/actas-fab')return fabImport(request,env);
    if(url.pathname==='/season.json')return json(seasonWithImports(await readImports(env.BUCKET)));
    if(url.pathname==='/n1-data.js')return new Response(individualAsset(await readImports(env.BUCKET)),{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'private, no-store'}});
    const route=url.pathname==='/'?'/index.html':url.pathname;
    if(!Object.hasOwn(assets,route))return new Response('Página no encontrada',{status:404});
    const mime={html:'text/html',js:'application/javascript',css:'text/css',json:'application/json'};
    return new Response(assets[route],{headers:{'content-type':mime[route.split('.').at(-1)]+'; charset=utf-8','cache-control':'private, no-cache','x-content-type-options':'nosniff'}});
  }catch{return json({error:'No se ha podido completar la operación.'},503)}
}};
async function recordForecasts(bucket,records){
  const at=new Date().toISOString(),dayLocal=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const key='predictions/'+dayLocal+'.json';
  if(await bucket.head(key))return;
  const season=seasonWithImports(await readImports(bucket));
  const normal=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const match=g=>g.group+normal(g.home)+'/'+normal(g.away);
  const byMatch=new Map(Object.values(records).flatMap(r=>Object.values(r.events||{})).map(e=>[match(e),e]));
  for(const g of season.games){const e=byMatch.get(match(g));if(!e||g.status==='Final')continue;const score=String(e.score||'').match(/^(\d+)\s*[-:]\s*(\d+)$/);if(score)g.score=score.slice(1).map(Number);if(e.localStartsAt)g.date=e.localStartsAt.slice(0,10)}
  const model=forecast(season.games.filter(g=>g.date<=dayLocal));
  const items=season.games.filter(g=>!g.score&&g.date>dayLocal&&g.date<=dateAt(Date.now()+8*day)).map(g=>({url:g.url,home:Math.round(100*model.estimate(g).p)}));
  if(items.length)await bucket.put(key,JSON.stringify({at,items}),{onlyIf:{etagDoesNotMatch:'*'}});
}
async function predictionHistory(bucket){
  const seed=JSON.parse(assets['/first-predictions.json']);
  const list=await bucket.list({prefix:'predictions/'});
  return [seed,...await Promise.all(list.objects.map(o=>read(bucket,o.key)))].filter(Boolean);
}
