const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const matchId = url => url.split('?')[0].split('/').at(-1);
const seedSeason = JSON.parse(assets['/season.json']);
const seedById = new Map(seedSeason.games.map(g => [matchId(g.url),g]));
const legacyImportKey = group => 'canastio/group-'+group+'.json';
const fabImportKey = group => 'fab/group-'+group+'.json';
async function readImports(bucket) {
  const groups = Object.keys(divisions);
  const keys = [...groups.map(legacyImportKey), ...groups.map(fabImportKey)];
  const imports = await Promise.all(keys.map(key => read(bucket,key)));
  return Object.assign({},...imports.filter(Boolean));
}
function seasonWithImports(imported, calendar) {
  const games=seedSeason.games.map(g=>applyFabCalendar({...g,...imported[matchId(g.url)]},calendar));
  const stamps=Object.values(imported).map(g=>g.checkedAt?.slice(0,10)).filter(Boolean);
  return {...seedSeason,games,updated:[seedSeason.updated,calendar?.checkedAt?.slice(0,10)||'',...stamps].sort().at(-1)};
}
function validStatCell(value, index) {
  if (typeof value!=='string'||value.length>16)return false;
  if (value==='')return index!==3;
  if ([4,5,6].includes(index)) {
    const m=value.match(/^(\d{1,3})\/(\d{1,3})$/);
    return m && +m[1]<=+m[2];
  }
  return (index===2?/^\d{1,3}([,.]\d+)?$/:index>=14?/^-?\d{1,3}$/:/^\d{1,3}$/).test(value);
}
function verifyBox(p,g){
  if(!Array.isArray(p.box)||p.box.length!==2||p.status!=='Final'||!Array.isArray(p.score)||p.score.length!==2||p.score.some(x=>!Number.isInteger(x)||x<0||x>350)||p.score[0]===p.score[1])return false;
  const ids = new Set();
  return [g.home,g.away].every((team,index)=>{
    const t=p.box.find(x=>x.team===team);
    if(!t||!Array.isArray(t.rows)||t.rows.length<1||t.rows.length>30)return false;
    return t.rows.every(r=>{
      if(!Array.isArray(r)||r.length!==16||!uuidPattern.test(r[0])||ids.has(r[0])||typeof r[1]!=='string'||!r[1].trim()||r[1].length>140||!r.slice(2).every((v,i)=>validStatCell(v,i+2)))return false;
      ids.add(r[0]);
      return true;
    }) && t.rows.reduce((sum,r)=>sum+Number(r[3]),0)===p.score[index];
  });
}
function fabName(value) {
  return value.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function knownPlayers(team, imported) {
  const players = new Map();
  const boxes = [...seedSeason.games.map(g=>g.box), ...Object.values(imported).map(g=>g.box)];
  for (const box of boxes) {
    for (const row of box?.find(t=>t.team===team)?.rows || []) {
      const name = fabName(row[1]);
      if (!players.has(name)) players.set(name, new Set());
      players.get(name).add(row[0]);
    }
  }
  return players;
}
async function fabPlayerId(team, name) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([team,name])));
  const hex = Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),'8'+hex.slice(13,16),'8'+hex.slice(17,20),hex.slice(20,32)].join('-');
}
async function normalizeFabBox(report, game, imported) {
  if (!Array.isArray(report.teams) || report.teams.length!==2) return null;
  const box = [];
  for (const team of [game.home,game.away]) {
    const table = report.teams.find(t=>typeof t?.team==='string' && fabName(t.team)===fabName(team));
    if (!Array.isArray(table?.rows) || !table.rows.length || table.rows.length>30) return null;
    const known = knownPlayers(team,imported);
    const names = new Set();
    const rows = [];
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length!==15 || typeof row[0]!=='string' || row[0].length>140) return null;
      const name = fabName(row[0]), ids = known.get(name);
      if (!name || names.has(name) || ids?.size>1) return null;
      names.add(name);
      rows.push([ids?.values().next().value ?? await fabPlayerId(team,name), ...row]);
    }
    box.push({team,rows});
  }
  return box;
}
async function fabImport(request,env) {
  const denied = fabWriteDenied(request,env);
  if(denied)return denied;
  const raw = await request.text();
  if (raw.length>90000) return json({error:'Informe demasiado extenso.'},413);
  let report;
  try { report=JSON.parse(raw); } catch { return json({error:'Formato de informe no válido.'},400); }
  const calendar = await read(env.BUCKET,fabCalendarKey);
  const fixture = seedById.get(report?.id);
  const game = fixture && applyFabCalendar(fixture,calendar);
  if (!game || report.year!=='2026/2027' || report.date!==game.date) return json({error:'El informe no corresponde al partido, la fecha o la temporada seleccionados.'},422);
  const round = game.round || report.round;
  if (!/^Jornada (?:[1-9]|[1-9]\d)$/.test(round||'') || (game.round && report.round && report.round!==game.round)) {
    return json({error:'La jornada indicada no coincide con el calendario.'},422);
  }
  const imported = await readImports(env.BUCKET);
  const box = await normalizeFabBox(report,game,imported);
  const record = {score:report.score,status:'Final',round,box,verified:true,source:'Afición FAB'};
  if (!verifyBox(record,game) || (game.score && game.score.some((score,i)=>score!==record.score[i]))) {
    return json({error:'Los equipos, las filas o la suma de puntos no coinciden con el marcador.'},422);
  }
  const key = fabImportKey(game.group);
  for (let attempt=0;attempt<4;attempt++) {
    const object = await env.BUCKET.get(key);
    const saved = object ? await object.json() : {};
    const previous = saved[report.id];
    if (previous) {
      const {checkedAt,...content} = previous;
      if (JSON.stringify(content)===JSON.stringify(record)) return json({state:'Informe FAB ya importado',id:report.id,checkedAt});
    }
    const checkedAt = new Date().toISOString();
    const stored = await env.BUCKET.put(key,JSON.stringify({...saved,[report.id]:{...record,checkedAt}}),{
      onlyIf:object ? {etagMatches:object.etag} : {etagDoesNotMatch:'*'}
    });
    if (stored) return json({state:'Informe FAB verificado',id:report.id,checkedAt});
  }
  return json({error:'Hay otra actualización en curso. Reinténtalo.'},409);
}
function individualAsset(imports, calendar) {
  const added = [];
  for (const [id,record] of Object.entries(imports)) {
    const fixture = seedById.get(id);
    if (!fixture || !record.verified) continue;
    const base = applyFabCalendar({...fixture,...record},calendar);
    if(!base.verified)continue;
    const label = [base.time,base.home,base.away,...record.score,'Final'].join('\n');
    added.push({url:base.url,label,section:record.round,journey:record.round,teams:record.box,date:base.date});
  }
  const last = Object.values(imports).map(g=>g.checkedAt?.slice(0,10)).filter(Boolean).sort().at(-1) || seedSeason.updated;
  return assets['/n1-data.js']+'\n'+`{
    const normalizeUrl = url => url.split('?')[0];
    const upsert = (list, item) => {
      const index = list.findIndex(old=>normalizeUrl(old.url)===normalizeUrl(item.url));
      if (index<0) list.push(item);
      else list[index] = item;
    };
    for (const match of ${JSON.stringify(added)}) {
      const {url,label,section} = match;
      upsert(calendar,{url,label,section});
      upsert(matches,match);
    }
  }
  const reportUpdated = ${JSON.stringify(last)};`;
}
