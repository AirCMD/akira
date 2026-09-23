// dreams.js — сновидіння Акіри (v40.2)
// Сон є суб'єктивним переживанням, а не фактом реального світу.
class AkiraDreams {
  constructor(brain){ this.brain=brain; this.activeSleep=null; }
  init(){
    const s=this.brain.state;
    s.dreams=s.dreams||{history:[],lastDream:null,lastSleepDreamAt:null};
    if(!Array.isArray(s.dreams.history)) s.dreams.history=[];
    return this;
  }
  cfg(){ return this.brain.data?.dreams?.dreams||{}; }
  update(minutes){
    const a=this.brain.state.action;
    if(a?.actionId==="sleep"){
      if(!this.activeSleep || this.activeSleep.actionStartedAt!==a.startedAt){
        this.activeSleep={actionStartedAt:a.startedAt||Date.now(),minutes:0,date:this.brain.state.world?.date||null};
      }
      this.activeSleep.minutes+=Math.max(0,Number(minutes)||0);
    }
  }
  completeAction(action){
    if(action?.actionId!=="sleep") return;
    const minutes=this.activeSleep?.minutes || this.estimateMinutes(action);
    this.activeSleep=null;
    this.maybeCreateDream(minutes);
  }
  estimateMinutes(action){
    const ms=(Number(action?.endsAt)||0)-(Number(action?.startedAt)||0);
    return ms>0 ? ms/1000*(this.brain.config?.simulationSpeed||1) : 0;
  }
  maybeCreateDream(minutes){
    const c=this.cfg();
    if(c.enabled===false || minutes<(c.minimumSleepMinutes??70)) return null;
    const chance=Math.min(.95,(c.baseChance??.55)+(minutes>=300?(c.longSleepBonus??.25):0));
    if(Math.random()>chance){ this.brain.state.dreams.lastSleepDreamAt=Date.now(); return null; }
    const dream=this.generateDream(minutes);
    const remembered=Math.random()<(c.rememberChance??.72);
    const fragment=remembered && Math.random()<(c.fragmentChance??.18);
    dream.remembered=remembered;
    dream.fragment=fragment;
    const d=this.brain.state.dreams;
    d.lastSleepDreamAt=Date.now();
    d.history.push(dream);
    if(d.history.length>(c.maxHistory??30)) d.history.splice(0,d.history.length-(c.maxHistory??30));
    if(remembered) d.lastDream=dream;
    this.storeAsDreamMemory(dream);
    return dream;
  }
  generateDream(minutes){
    const memories=(this.brain.memory?.memories||[]).filter(m=>m.type!=="dream" && m.source!=="dream" && (m.content||m.location||m.people?.length));
    const recent=memories.slice(-80);
    const pick=arr=>arr?.length?arr[Math.floor(Math.random()*arr.length)]:null;
    const first=pick(recent), second=pick(recent.filter(x=>x.id!==first?.id));
    const people=[...(first?.people||[]),...(second?.people||[])].filter(Boolean);
    const person=pick([...new Set(people)]);
    const location=first?.location||second?.location||this.brain.state.world?.location||"home";
    const transform=pick(this.cfg().transformations)||"усе було трохи не таким, як мало бути";
    const fragments=[first?.content,second?.content].filter(Boolean).slice(0,2);
    const text=this.composeDreamText({person,location,transform,fragments});
    return {id:`dream_${Date.now()}_${Math.floor(Math.random()*10000)}`,createdAt:Date.now(),worldDate:this.brain.state.world?.date||null,worldTime:this.brain.state.world?.time||null,sleepMinutes:Math.round(minutes),person:person||null,location,sourceMemoryIds:[first?.id,second?.id].filter(Boolean),text};
  }
  composeDreamText({person,location,transform,fragments}){
    const who=person ? (String(person).toLowerCase().includes("yani")?"Яні":String(person)) : null;
    const place=location==="home"?"вдома":location==="techsmith"?"на роботі":location==="city"?"десь у місті":null;
    if(who && place) return `Снилося щось дивне: я був ${place}, поруч була ${who}, але ${transform}. Деталі вже трохи розсипаються.`;
    if(who) return `Пам'ятаю уривок сну з ${who}. ${this.cap(transform)}. Решта вже нечітка.`;
    if(place) return `Наснилося, що я був ${place}, але ${transform}. Більше майже нічого не пам'ятаю.`;
    if(fragments.length) return `Сон був якийсь перемішаний зі знайомими речами, але ${transform}. Після пробудження лишилися тільки уривки.`;
    return `Щось снилося, але після пробудження лишилося тільки відчуття, що ${transform}.`;
  }
  cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
  storeAsDreamMemory(dream){
    this.brain.memory?.remember?.({
      type:"dream", source:"dream", title:"Сновидіння", content:dream.text,
      worldDate:dream.worldDate, worldTime:dream.worldTime,
      people:dream.person?[dream.person]:[], location:dream.location,
      importance:dream.remembered?28:10, strength:dream.remembered?32:12,
      vividness:dream.remembered?38:14, forgettable:true,
      keywords:["сон","сновидіння"],
      metadata:{isDream:true,reality:false,remembered:dream.remembered,fragment:dream.fragment,sourceMemoryIds:dream.sourceMemoryIds}
    });
  }
  lastRememberedDream(){
    const h=this.brain.state.dreams?.history||[];
    return [...h].reverse().find(x=>x.remembered)||null;
  }
  answerLastDream(){
    const d=this.lastRememberedDream();
    if(!d) return "Не пам'ятаю останнього сну. Може, щось і снилося, але після пробудження нічого не лишилося.";
    if(d.fragment) return `Уривками. ${d.text}`;
    return d.text;
  }
  answerDreamingGenerally(){ return "Сни іноді бачу. Частину пам'ятаю після пробудження, частина зникає майже одразу."; }
}
window.AkiraDreams=AkiraDreams;
