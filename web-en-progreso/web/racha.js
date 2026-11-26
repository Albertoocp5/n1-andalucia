const normalizeTeam = name => name.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const formData = Promise.all([
  fetch('/season.json').then(r=>r.json()),
  fetch('/api/results-saved').then(r=>r.json()).catch(()=>({}))
]).then(([season,feed])=>{
  const published = new Map();
  const key=(group,home,away)=>[group,normalizeTeam(home),normalizeTeam(away)].join('/');
  for(const group of Object.values(feed))for(const event of Object.values(group.events||{})){
    const score=String(event.score||'').match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if(score)published.set(key(event.group,event.home,event.away),{score:score.slice(1).map(Number),date:event.localStartsAt});
  }
  const byTeam=new Map();
  for(const game of season.games){
    const result=game.status==='Final'?{score:game.score}:published.get(key(game.group,game.home,game.away));
    if(!result?.score||result.score[0]===result.score[1])continue;
    [game.home,game.away].forEach((team,i)=>{
      if(!byTeam.has(team))byTeam.set(team,[]);
      byTeam.get(team).push({date:result.date||game.date+'T'+game.time,won:result.score[i]>result.score[1-i],match:game.home+' '+result.score.join('–')+' '+game.away});
    });
  }
  for(const games of byTeam.values())games.sort((a,b)=>a.date.localeCompare(b.date));
  return byTeam;
});
class TeamForm extends HTMLElement{
  async connectedCallback(){
    try{
      const games=(await formData).get(this.getAttribute('equipo'))||[];
      this.replaceChildren(...games.slice(-5).map(g=>{
        const badge=document.createElement('span');
        badge.className=g.won?'win':'loss';
        badge.textContent=g.won?'V':'D';
        badge.title=(g.won?'Victoria':'Derrota')+' · '+g.date.slice(0,10)+' · '+g.match;
        badge.setAttribute('aria-label',badge.title);
        return badge;
      }));
    }catch{this.title='Racha no disponible'}
  }
}
customElements.define('racha-equipo',TeamForm);
