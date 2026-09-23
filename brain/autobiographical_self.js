// autobiographical_self.js — v43
// Вчиться лише на прожитому досвіді. Не переписує канонічну біографію/вподобання.
class AkiraAutobiographicalSelf {
  constructor(brain){ this.brain=brain; this.config={}; this.elapsed=0; }
  init(){
    this.config=this.brain.data?.autobiographical_self?.autobiographicalSelf || {};
    const s=this.brain.state;
    s.autobiographicalSelf ||= {};
    s.autobiographicalSelf.patterns ||= [];
    s.autobiographicalSelf.observations ||= [];
    s.autobiographicalSelf.unfinished ||= [];
    s.autobiographicalSelf.lastUpdated ||= null;
    this.refresh(true);
    return this;
  }
  update(minutes){
    this.elapsed += Number(minutes)||0;
    if(this.elapsed < Number(this.config.updateIntervalMinutes||30)) return;
    this.elapsed=0; this.refresh();
  }
  episodes(){
    const mem=this.brain.memory?.memories || [];
    return mem.filter(m=>["episode","activity","conversation","event"].includes(m.type) && m.source!=="dream" && m.metadata?.reality!==false)
      .slice(-Number(this.config.historyWindow||180));
  }
  labelAction(id){
    const map={rest:"відпочивати",sleep:"спати",eat:"їсти",cook:"готувати",talkToYani:"розмовляти з Яні",talkToSomeone:"спілкуватися",work:"працювати",walk:"гуляти",cycling:"кататися на велосипеді",playGame:"грати",watchMovie:"дивитися фільми",draw:"малювати",groceryShopping:"купувати продукти",doLaundry:"займатися пранням",vacuum:"пилососити",washDishes:"мити посуд",takeBath:"приймати ванну"};
    return map[id]||id;
  }
  refresh(force=false){
    const s=this.brain.state, eps=this.episodes();
    const counts=new Map(), people=new Map(), places=new Map();
    for(const m of eps){
      if(m.actionId) counts.set(m.actionId,(counts.get(m.actionId)||0)+1);
      for(const p of (m.people||[])) people.set(p,(people.get(p)||0)+1);
      if(m.location) places.set(m.location,(places.get(m.location)||0)+1);
    }
    const min=Number(this.config.minPatternCount||3);
    const patterns=[...counts.entries()].filter(([,n])=>n>=min).sort((a,b)=>b[1]-a[1]).slice(0,Number(this.config.maxLearnedPatterns||24)).map(([actionId,count])=>({
      id:`action:${actionId}`,kind:"habit",actionId,count,confidence:Math.min(.95,.45+count*.06),text:`Останнім часом я досить часто ${this.labelAction(actionId)}.`
    }));
    const topPerson=[...people.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(topPerson && topPerson[1]>=min) patterns.push({id:`person:${topPerson[0]}`,kind:"social",person:topPerson[0],count:topPerson[1],confidence:Math.min(.95,.45+topPerson[1]*.05),text:topPerson[0]==="Yani_Bakeneko"?"Останнім часом у мене багато спільних моментів з Яні.":`Останнім часом я часто перетинаюся з ${topPerson[0]}.`});
    const topPlace=[...places.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(topPlace && topPlace[1]>=min) patterns.push({id:`place:${topPlace[0]}`,kind:"place",location:topPlace[0],count:topPlace[1],confidence:Math.min(.9,.4+topPlace[1]*.05),text:`Останнім часом багато моїх справ пов'язані з ${topPlace[0]}.`});
    s.autobiographicalSelf.patterns=patterns;
    s.autobiographicalSelf.unfinished=this.collectUnfinished();
    s.autobiographicalSelf.lastUpdated=Date.now();
    return s.autobiographicalSelf;
  }
  collectUnfinished(){
    const gp=this.brain.state?.goalsPlanning || {};
    const raw=[];
    const add=p=>{ if(p && !["completed","cancelled","done"].includes(p.status)) raw.push({id:p.id||p.goal||"plan",goal:p.goal||p.title||p.reason||"незавершена справа",status:p.status||"active",reason:p.reason||null}); };
    if(Array.isArray(gp.plans)) gp.plans.forEach(add);
    if(gp.activePlan) add(gp.activePlan);
    return raw.slice(-10);
  }
  onActionFinished(action){
    if(!action?.actionId) return;
    const a=this.brain.state.autobiographicalSelf;
    a.observations.push({at:Date.now(),date:this.brain.state.world?.date||null,actionId:action.actionId,location:this.brain.state.world?.location||null,person:action.targetPerson||null});
    a.observations=a.observations.slice(-Number(this.config.maxObservations||80));
    this.refresh(true);
  }
  strongestPattern(){ return this.refresh().patterns?.[0]||null; }
  answerHabit(){
    const p=this.strongestPattern();
    return p?.text || "Поки не бачу в себе якоїсь нової звички, яка справді повторюється.";
  }
  answerRecentSelf(){
    const a=this.refresh(), p=a.patterns?.[0], unfinished=a.unfinished?.[0];
    if(p && unfinished) return `${p.text} І ще тримаю в голові незавершене: ${unfinished.goal}.`;
    if(p) return p.text;
    if(unfinished) return `Останнім часом у мене немає однієї явної звички, але є незавершене: ${unfinished.goal}.`;
    return "Останнім часом нічого настільки повторюваного не помітив, щоб робити з цього висновок про себе.";
  }
  answerUnfinished(){
    const u=this.refresh().unfinished?.[0];
    return u ? `Так. У мене ще лишилося незавершене: ${u.goal}.` : "Зараз не бачу в себе важливої незавершеної справи.";
  }
  answerLearning(){
    const p=this.strongestPattern();
    if(!p) return "Поки замало повторюваного досвіду, щоб робити про себе новий висновок.";
    return `З досвіду я помітив таке: ${p.text.replace(/^Останнім часом\s+/iu,"")}`;
  }
}
window.AkiraAutobiographicalSelf=AkiraAutobiographicalSelf;
