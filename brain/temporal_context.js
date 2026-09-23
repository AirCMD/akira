// temporal_context.js
// v40.1 — Temporal Context
// Єдине джерело для відповідей про минуле / теперішнє / майбутнє.
// Минуле читається лише з пережитої історії/пам'яті, теперішнє — зі state,
// майбутнє — тільки з явних intentions/plans. Ніякого ворожіння.
class AkiraTemporalContext {
  constructor(brain){ this.brain=brain; }

  personName(id){
    if(!id) return null;
    const people=this.brain.data?.people?.people || this.brain.data?.people || {};
    if(people[id]?.name) return people[id].name;
    return ({Yani_Bakeneko:"Яні",Kent_White:"Кент",Taras:"Тарас"})[id] || String(id).replaceAll("_"," ");
  }

  socialPerson(action){
    if(!action) return null;
    if(!["talkToSomeone","talkToYani"].includes(action.actionId)) return null;
    return action.targetPerson || (action.actionId==="talkToYani" ? "Yani_Bakeneko" : null);
  }

  currentPerson(){ return this.socialPerson(this.brain.state?.action); }

  pastPerson(){
    const history=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
    const a=[...history].reverse().find(x=>this.socialPerson(x));
    if(a) return this.socialPerson(a);
    // Довга пам'ять потрібна після очищення короткої actionHistory.
    const memories=this.brain.state?.memory?.episodic || this.brain.state?.memory?.episodes || [];
    const m=[...(Array.isArray(memories)?memories:[])].reverse().find(x=>x?.targetPerson || (Array.isArray(x?.people)&&x.people.length));
    return m?.targetPerson || m?.people?.[0] || null;
  }

  futureSocialPlan(){
    const plans=(this.brain.state?.intentions?.plans||[])
      .filter(p=>p?.status==="planned")
      .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || this.minutes(a.time)-this.minutes(b.time));
    const p=plans.find(x=>x.targetPerson || ["talkToSomeone","talkToYani"].includes(x.actionId));
    if(p) return p;
    const cur=this.brain.state?.intentions?.current;
    if(cur?.nextAction && typeof cur.nextAction==="object" && (cur.nextAction.targetPerson || ["talkToSomeone","talkToYani"].includes(cur.nextAction.actionId))) return cur.nextAction;
    return null;
  }

  minutes(t){ const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||"")); return m?Number(m[1])*60+Number(m[2]):9999; }

  answerPeople(tense){
    if(tense==="present"){
      const id=this.currentPerson();
      return id?`З ${this.personName(id)}.`:"Зараз я ні з ким не розмовляю.";
    }
    if(tense==="past"){
      const id=this.pastPerson();
      return id?`Останнім часом розмовляв з ${this.personName(id)}.`:"Не пам'ятаю, щоб останнім часом з кимось розмовляв.";
    }
    const p=this.futureSocialPlan();
    if(!p) return "Не знаю. Я ж не планую наперед кожну розмову.";
    const id=p.targetPerson || (p.actionId==="talkToYani"?"Yani_Bakeneko":null);
    if(!id) return "Є намір з кимось поговорити, але з ким саме ще не вирішив.";
    const when=p.time?` приблизно о ${p.time}`:"";
    return `Планую поговорити з ${this.personName(id)}${when}.`;
  }

  currentAction(){ return this.brain.state?.action || null; }
  pastAction(){
    const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
    return h.length?h[h.length-1]:null;
  }
  futurePlan(){ return this.brain.intentions?.getNextPlan?.() || null; }

  answerActivity(tense, labelFn){
    if(tense==="present"){
      const a=this.currentAction(); const label=a&&labelFn?.(a);
      return label?`Зараз ${label}.`:"Зараз нічим конкретним не зайнятий.";
    }
    if(tense==="past"){
      const a=this.pastAction(); const label=a&&labelFn?.(a);
      return label?`Перед цим ${label}.`:"Не пам'ятаю, що робив перед цим.";
    }
    const p=this.futurePlan();
    if(!p) return "Поки не знаю, що робитиму далі.";
    const goal=this.brain.intentions?.planGoal?.(p)||p.actionId;
    return `Планую ${goal}${p.time?` приблизно о ${p.time}`:""}.`;
  }

  locationName(loc, room){
    if(loc==="home") return room?`вдома, у ${room}`:"вдома";
    if(loc==="techsmith") return "на роботі, у «Техсмітнику»";
    const places=this.brain.data?.world?.world?.location?.places||{};
    return places?.[loc]?.name?`у місці «${places[loc].name}»`:(loc?`у ${loc}`:null);
  }

  answerLocation(tense, roomLabelFn){
    if(tense==="present") return null; // dialogue має багатший current-location formatter
    if(tense==="past"){
      const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
      const a=[...h].reverse().find(x=>x?.worldFinished?.location);
      if(!a) return "Не пам'ятаю, де саме був перед цим.";
      let room=null;
      if(a.worldFinished.location==="home" && a.worldFinished.homeRoom){
        const rooms=this.brain.data?.home?.home?.rooms||this.brain.data?.home?.rooms||[];
        const r=Array.isArray(rooms)?rooms.find(x=>x.id===a.worldFinished.homeRoom||x.key===a.worldFinished.homeRoom):null;
        room=roomLabelFn?.(r)||null;
      }
      const where=this.locationName(a.worldFinished.location,room);
      return where?`Перед цим був ${where}.`:"Не пам'ятаю, де саме був перед цим.";
    }
    const p=this.futurePlan();
    if(!p || !p.destination) return "Поки не планував, куди піду далі.";
    const where=this.locationName(p.destination,null);
    return where?`Планую піти ${where}${p.time?` приблизно о ${p.time}`:""}.`:"План є, але місце ще не визначив.";
  }
}
window.AkiraTemporalContext=AkiraTemporalContext;
