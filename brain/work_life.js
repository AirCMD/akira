// v37: робоча зміна як окреме середовище, а не одна шестигодинна дія work.
class AkiraWorkLife {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.work_life?.workLife||{};
    this.place=this.brain.data?.workplace?.workplace||{};
    this.customerData=this.brain.data?.work_customers?.workCustomers||{};
    const s=this.brain.state;
    s.workLife=s.workLife||{date:null,customers:0,consultations:0,sales:0,breaks:0,lastEvent:null,lastCustomer:null,history:[]};
    this.ensureDay(); return this;
  }
  mins(v){ const m=String(v||"00:00").match(/(\d{1,2}):(\d{2})/); return m?+m[1]*60 + +m[2]:0; }
  now(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
  isWorkday(){ return this.brain.dailyLife?.isWorkday?.() ?? false; }
  atWork(){ return this.brain.state.world?.location==="techsmith"; }
  inShift(){ const p=this.brain.data?.life_profile?.lifeProfile?.work||{}; const t=this.now(); return this.isWorkday() && t>=this.mins(p.start||"10:00") && t<this.mins(p.end||"16:00"); }
  ensureDay(){
    const x=this.brain.state.workLife, d=this.brain.state.world?.date;
    if(x.date===d)return;
    Object.assign(x,{date:d,customers:0,consultations:0,sales:0,breaks:0,lastEvent:null,lastCustomer:null,history:[]});
  }
  range(id){ const a=this.data.events?.[id]?.duration||[8,15]; return a[0]+Math.floor(Math.random()*(Math.max(1,a[1]-a[0]+1))); }
  weighted(items=[]){
    const pool=items.filter(Boolean); if(!pool.length)return null;
    const total=pool.reduce((n,x)=>n+Number(x.weight||1),0); let r=Math.random()*total;
    for(const x of pool){r-=Number(x.weight||1); if(r<=0)return x;} return pool[pool.length-1];
  }
  customerStory(){
    const type=this.weighted(this.customerData.types||[])||{id:"person",label:"покупець"};
    const behaviour=this.weighted(this.customerData.behaviours||[])||{id:"careful",label:"спокійно вибирає техніку",fatigue:4};
    const needs=this.customerData.needs||["техніку"];
    const need=needs[Math.floor(Math.random()*needs.length)]||"техніку";
    return {typeId:type.id,typeLabel:type.label,need,behaviourId:behaviour.id,behaviourLabel:behaviour.label,fatigue:Number(behaviour.fatigue||0)};
  }
  workplaceName(formal=false){ return formal?(this.place.officialName||"TechSmith"):(this.place.nickname||this.data.displayName||"Техсмітник"); }
  describeOutside(){ const o=this.place.outside||{}; return `Ззовні ${this.workplaceName(true)} — ${o.building||"велика сіра будівля"}. ${o.sign||"Над входом сріблястими літерами написано TechSmith"}. ${o.windows||"На фасаді багато великих вікон"}. ${o.entrance?`Вхід — ${o.entrance}.`:""} Довкола дерева й багатоповерхівки, навпроти дорога та пішохідний перехід. Збоку є маленьке кафе.`; }
  describeInside(){ const i=this.place.inside||{}; return `Всередині все переважно сріблясто-сіре: ${i.walls||"сріблясті"} стіни, ${i.floor||"сіра плитка"}, ${i.ceiling||"біла стеля з LED-панелями"}. ${i.merchandise||"Техніка стоїть на стендах і у вітринах"}. Є ${i.serviceCounter||"стійка обслуговування"}. Загалом звичайний великий магазин техніки.`; }
  describeCafe(){ return this.place.outside?.cafe ? `Збоку від магазину ${this.place.outside.cafe}.` : "Збоку є маленьке кафе."; }
  describeStaffArea(){ return this.place.inside?.staffArea||"Є службова зона для працівників."; }
  describeBehindCounter(){ return this.place.inside?.behindCounter||"За стійкою лежать дрібні аксесуари."; }
  action(id,reason,extra={}){ return {type:"action",actionId:id,duration:this.range(id),source:"work_life",reason,goal:"відпрацювати зміну",expectedOutcome:"виконати робочі обов’язки",...extra}; }
  getPriorityAction(){
    this.ensureDay();
    if(this.brain.state.action || !this.atWork() || !this.inShift()) return null;
    const x=this.brain.state.workLife;
    // Перерва можлива, але не кожні десять хвилин, бо навіть вигаданий магазин має якось заробляти.
    if(x.consultations>=2 && x.breaks<2 && Math.random()<0.09) return this.action("workBreak","між покупцями можна трохи перепочити");
    const r=Math.random();
    // Рідкісні особисті відвідувачі. Вони є окремими подіями, а не маскуються під звичайного customer.
    if(r<0.012) return this.action("talkToManager","керівник звернувся до мене по робочих справах",{targetPerson:"Manager_Mykhailenko",interactionChannel:"inPerson",contactReason:"робочі справи",contactPrivacy:"work_private",duration:5,workZone:"serviceCounter"});
    if(r>=0.012 && r<0.014){ const needs=this.customerData.specialVisitors?.parents?.possibleNeeds||["техніку"]; const need=needs[Math.floor(Math.random()*needs.length)]; return this.action("talkToParents",`батьки рідко зайшли до магазину, дивляться ${need}`,{targetPerson:"Akira_Parents",interactionChannel:"inPerson",contactReason:`прийшли подивитися ${need}`,duration:8,workZone:"salesFloor"}); }
    if(r>=0.014 && r<0.016) return this.action("talkToBrother","брат рідко зайшов до магазину по своїх справах",{targetPerson:"Akira_Brother",interactionChannel:"inPerson",contactReason:"його особисті справи",contactPrivacy:"family_private",duration:7,workZone:"salesFloor"});
    // Якщо Яні реально приїхала до магазину, Акіра може коротко поговорити з
    // нею особисто. Її приватна причина візиту не стає його власністю.
    if(this.brain.social?.samePlaceWithYani?.() && Math.random()<0.65){
      const visit=this.brain.state.yani?.pendingWorkVisit||{};
      return this.action("talkToYani","Яні ненадовго зайшла до мене на роботу",{targetPerson:"Yani_Bakeneko",interactionChannel:"inPerson",contactReason:"Яні ненадовго зайшла до мене на роботу",contactPrivacy:visit.privacy||"normal",visitReason:visit.reason||null,duration:5});
    }
    // v45.5: рідкісний контакт з Яні під час зміни. Це не означає, що вона
    // фізично прийшла: за замовчуванням це коротке повідомлення або дзвінок.
    // Особиста розмова можлива лише якщо Яні вже реально дісталася TechSmith.
    if(r>=0.016 && r<0.04){
      const together=this.brain.social?.samePlaceWithYani?.();
      const channel=together?"inPerson":(Math.random()<0.78?"message":"phoneCall");
      const why=together?"Яні ненадовго зайшла, і ми поговорили":(channel==="message"?"була вільна хвилина, і ми з Яні трохи переписувалися":"була вільна хвилина, і ми з Яні коротко поговорили телефоном");
      return this.action("talkToYani",why,{targetPerson:"Yani_Bakeneko",interactionChannel:channel,contactReason:why,duration:channel==="message"?3:5});
    }
    if(r<0.12) return this.action("talkToKent","Кент поруч і завів розмову",{targetPerson:"Kent_White",interactionChannel:"inPerson"});
    if(r<0.18) return this.action("talkToTaras","перекинувся кількома словами з Тарасом",{targetPerson:"Taras",interactionChannel:"inPerson"});
    if(r < Number(this.data.quietChance||.16)+.17) return this.action("quietAtWork","у магазині зараз тихо");
    const customerId=`customer_${Date.now().toString(36)}`;
    const customer=this.customerStory();
    const kinds=["consultCustomer","compareDevices","explainSpecs"];
    const id=kinds[Math.floor(Math.random()*kinds.length)];
    const reason=`підійшов ${customer.typeLabel}, шукає ${customer.need}`;
    return this.action(id,reason,{targetPerson:customerId,customerId,customer,interactionChannel:"inPerson",contactReason:reason,workZone:"salesFloor"});
  }
  completeAction(a){
    if(a?.source!=="work_life") return;
    this.ensureDay(); const x=this.brain.state.workLife;
    if(["consultCustomer","compareDevices","explainSpecs"].includes(a.actionId)){
      x.customers++; x.consultations++; x.lastCustomer=a.customerId||a.targetPerson||null;
      x.lastCustomerStory=a.customer||null;
      if(a.customer?.fatigue) this.brain.state.needs.social=Math.max(0,Number(this.brain.state.needs?.social||50)-Math.min(10,a.customer.fatigue/2));
      // Продаж не гарантований після кожної консультації.
      const saleChance=a.customer?.behaviourId==="randomChoice"?.58:a.customer?.behaviourId==="quick"?.64:a.customer?.behaviourId==="specShowoff"?.28:.43;
      const sold=Math.random()<saleChance; if(sold) x.sales++;
      if(a.customer) a.customer.outcome=sold?"sale":"no_sale";
    }
    if(a.actionId==="makeSale") x.sales++;
    if(a.actionId==="workBreak") x.breaks++;
    if(a.actionId==="workLunch"){
      const eating=this.brain.food?.eatingDay?.();
      if(eating?.meals) eating.meals.lunch=true;
      this.brain.state.food ||= {};
      this.brain.state.food.lastMealAt=Date.now();
      this.brain.state.food.mealHistory ||= [];
      this.brain.state.food.mealHistory.push({id:"workLunch",name:"обід на роботі",at:new Date().toISOString(),mealSlot:"lunch",mealKind:"meal"});
      if(this.brain.state.food.mealHistory.length>20)this.brain.state.food.mealHistory.shift();
      this.brain.needs?.applyActivity?.("eat");
    }
    const end=this.mins(this.brain.data?.life_profile?.lifeProfile?.work?.end||"16:00");
    if(this.now()>=end-10) this.brain.inventoryMoney?.payAkiraForWorkday?.();
    x.lastEvent=a.actionId;
    x.history.push({actionId:a.actionId,targetPerson:a.targetPerson||null,customer:a.customer||null,channel:a.interactionChannel||null,reason:a.contactReason||a.reason||null,workZone:a.workZone||null,date:this.brain.state.world?.date,time:this.brain.state.world?.time,sales:x.sales,at:Date.now()});
    if(x.history.length>80)x.history.splice(0,x.history.length-80);
  }
  summary(){
    const x=this.brain.state.workLife||{};
    if(!this.atWork()) return "Я зараз не на роботі.";
    if(!this.inShift()) return "Я вже на роботі, але зміна зараз не йде.";
    const a=this.brain.state.action;
    const labels=this.data.events||{};
    if(a?.source==="work_life") return labels[a.actionId]?.label ? `Зараз ${labels[a.actionId].label}.` : "Зараз працюю.";
    return "Я на роботі. Поки між справами.";
  }
}
window.AkiraWorkLife=AkiraWorkLife;
