// v37: робоча зміна як окреме середовище, а не одна шестигодинна дія work.
class AkiraWorkLife {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.work_life?.workLife||{};
    const s=this.brain.state;
    s.workLife=s.workLife||{date:null,customers:0,consultations:0,sales:0,breaks:0,lastEvent:null,lastCustomer:null,history:[]};
    this.ensureDay(); return this;
  }
  mins(v){ const m=String(v||"00:00").match(/(\d{1,2}):(\d{2})/); return m?+m[1]*60 + +m[2]:0; }
  now(){ return this.mins(this.brain.state.world?.time); }
  isWorkday(){ return this.brain.dailyLife?.isWorkday?.() ?? false; }
  atWork(){ return this.brain.state.world?.location==="techsmith"; }
  inShift(){ const p=this.brain.data?.life_profile?.lifeProfile?.work||{}; const t=this.now(); return this.isWorkday() && t>=this.mins(p.start||"10:00") && t<this.mins(p.end||"16:00"); }
  ensureDay(){
    const x=this.brain.state.workLife, d=this.brain.state.world?.date;
    if(x.date===d)return;
    Object.assign(x,{date:d,customers:0,consultations:0,sales:0,breaks:0,lastEvent:null,lastCustomer:null,history:[]});
  }
  range(id){ const a=this.data.events?.[id]?.duration||[8,15]; return a[0]+Math.floor(Math.random()*(Math.max(1,a[1]-a[0]+1))); }
  action(id,reason,extra={}){ return {type:"action",actionId:id,duration:this.range(id),source:"work_life",reason,goal:"відпрацювати зміну",expectedOutcome:"виконати робочі обов’язки",...extra}; }
  getPriorityAction(){
    this.ensureDay();
    if(this.brain.state.action || !this.atWork() || !this.inShift()) return null;
    const x=this.brain.state.workLife;
    // Перерва можлива, але не кожні десять хвилин, бо навіть вигаданий магазин має якось заробляти.
    if(x.consultations>=2 && x.breaks<2 && Math.random()<0.09) return this.action("workBreak","між покупцями можна трохи перепочити");
    const r=Math.random();
    if(r<0.11) return this.action("talkToKent","Кент поруч і завів розмову",{targetPerson:"Kent_White"});
    if(r<0.17) return this.action("talkToTaras","перекинувся кількома словами з Тарасом",{targetPerson:"Taras"});
    if(r < Number(this.data.quietChance||.16)+.17) return this.action("quietAtWork","у магазині зараз тихо");
    const customerId=`customer_${Date.now().toString(36)}`;
    const kinds=["consultCustomer","compareDevices","explainSpecs"];
    const id=kinds[Math.floor(Math.random()*kinds.length)];
    return this.action(id,"підійшов покупець",{targetPerson:customerId,customerId});
  }
  completeAction(a){
    if(a?.source!=="work_life") return;
    this.ensureDay(); const x=this.brain.state.workLife;
    if(["consultCustomer","compareDevices","explainSpecs"].includes(a.actionId)){
      x.customers++; x.consultations++; x.lastCustomer=a.customerId||a.targetPerson||null;
      // Продаж не гарантований після кожної консультації.
      if(Math.random()<.43) x.sales++;
    }
    if(a.actionId==="makeSale") x.sales++;
    if(a.actionId==="workBreak") x.breaks++;
    const end=this.mins(this.brain.data?.life_profile?.lifeProfile?.work?.end||"16:00");
    if(this.now()>=end-10) this.brain.inventoryMoney?.payAkiraForWorkday?.();
    x.lastEvent=a.actionId;
    x.history.push({actionId:a.actionId,targetPerson:a.targetPerson||null,date:this.brain.state.world?.date,time:this.brain.state.world?.time,sales:x.sales,at:Date.now()});
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
