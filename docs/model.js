const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const prior=(xs,k)=>xs.reduce((a,b)=>a+b,0)/(xs.length+k);
export function forecast(games){
  const ratings=new Map(), margins=[], errors=[], tests=[];
  const rating=t=>ratings.get(t)||0;
  function estimate(g){
    const home=prior(margins,20), gap=rating(g.home)-rating(g.away), expected=home+gap;
    // Mirror residuals around zero and shrink towards a neutral forecast early in the season.
    const outcomes=errors.flatMap(x=>[expected+x,expected-x]);
    const wins=outcomes.reduce((n,x)=>n+(x>0?1:x===0?.5:0),0);
    return {p:(wins+5)/(outcomes.length+10),home,gap,expected};
  }
  const dates=new Map();for(const g of games.filter(g=>g.score&&g.score[0]!==g.score[1]).sort((a,b)=>a.date.localeCompare(b.date))){if(!dates.has(g.date))dates.set(g.date,[]);dates.get(g.date).push(g)}
  for(const day of dates.values()){
    const validate=margins.length>=24;const batch=day.map(g=>({g,...estimate(g)}));
    for(const {g,p,expected} of batch){
      const diff=g.score[0]-g.score[1],residual=diff-expected;
      if(validate)tests.push((p-Number(diff>0))**2);
      const adjustment=.15*Math.max(-30,Math.min(30,residual));
      ratings.set(g.home,rating(g.home)+adjustment);ratings.set(g.away,rating(g.away)-adjustment);
      errors.push(residual);margins.push(diff);
    }
  }
  return {estimate,brier:avg(tests),n:tests.length};
}
