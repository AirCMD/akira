// goals_planning.js — v42 Goals + Multi-step Planning
// Довгі цілі з кроками, умовами, відкладанням, перериванням і відновленням.
// План не передбачає майбутнє: він описує лише те, що Акіра справді вирішив зробити.
class AkiraGoalsPlanning {
  constructor(brain){ this.brain=brain; this.config={}; }
  init(){
    this.config=this.brain.data?.goals_planning?.goalsPlanning || {};
    const s=this.brain.state;
    s.goalsPlanning ||= {goals:[],history:[],lastPlanningDay:null};
    s.goalsPlanning.goals ||= [];
    s.goalsPlanning.history ||= [];
    s.goalsPlanning.lastPlanningDay ||= null;
    return this;
  }
  now(){ return Date.now(); }
  dayKey(){ return this.brain.state?.world?.date || new Date().toISOString().slice(0,10); }
  minutes(t){ const m=String(t||"00:00").match(/(\d{1,2}):(\d{2})/); return m?Number(m[1])*60+Number(m[2]):0; }
  timeFromMinutes(v){ v=((Math.round(v)%1440)+1440)%1440; return `${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`; }
  currentMinute(){ return this.minutes(this.brain.state?.world?.time); }
  activeGoals(){ return (this.brain.state.goalsPlanning?.goals||[]).filter(g=>["planned","active","paused"].includes(g.status)); }
  nextGoal(){
    return this.activeGoals().filter(g=>g.date>=this.dayKey()).sort((a,b)=>String(a.date).localeCompare(String(b.date))||this.minutes(a.time)-this.minutes(b.time))[0]||null;
  }
  currentGoal(){ return this.activeGoals().find(g=>g.status==="active") || this.nextGoal(); }
  opportunity(){
    const ops=this.brain.leisure?.config?.opportunities||[];
    const scored=ops.map(o=>({o,score:this.brain.leisure?.scoreOpportunity?.(o)??-Infinity})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score);
    if(!scored.length) return null;
    return scored.slice(0,Math.min(3,scored.length))[Math.floor(Math.random()*Math.min(3,scored.length))].o;
  }
  buildLeisureGoal(o,time){
    const id=`goal_${this.dayKey()}_${o.id}_${Math.floor(Math.random()*10000)}`;
    const steps=[];
    if(o.destination && o.destination!=="home") steps.push({id:`${id}_travel`,kind:"travel",actionId:"travelToLeisure",duration:o.travelMinutes||25,targetLocation:o.destination,destinationName:o.destinationName||o.destination,status:"pending"});
    steps.push({id:`${id}_activity`,kind:"activity",actionId:o.actionId,duration:o.duration||45,targetLocation:o.destination||"home",status:"pending"});
    if(o.destination && o.destination!=="home") steps.push({id:`${id}_return`,kind:"return",actionId:"returnHomeLeisure",duration:o.travelMinutes||25,targetLocation:"home",status:"pending"});
    return {id,type:"leisure",title:this.brain.intentions?.describeAction?.({actionId:o.actionId,destinationName:o.destinationName})||o.actionId,
      reason:o.reason||"мені цього захотілося",expectedOutcome:o.destination&&o.destination!=="home"?"виберуся з дому і проведу час так, як хотів":"займуся тим, що запланував",
      date:this.dayKey(),time,createdAt:this.now(),status:"planned",priority:45,outdoor:!!o.outdoor,destination:o.destination||"home",destinationName:o.destinationName||null,
      opportunityId:o.id,steps,currentStep:0,postpones:0,interruptions:[],lastChangeReason:null};
  }
  ensureDailyGoal(){
    const cfg=this.config.dailyPlanning||{}; if(cfg.enabled===false) return;
    const st=this.brain.state.goalsPlanning, day=this.dayKey(); if(st.lastPlanningDay===day) return;
    if(this.currentMinute()<8*60) return;
    st.lastPlanningDay=day;
    const workday=this.brain.dailyLife?.isWorkday?.()??false;
    const chance=Number(workday?cfg.chanceWorkday:cfg.chanceWeekend); if(Math.random()>(Number.isFinite(chance)?chance:.65)) return;
    const o=this.opportunity(); if(!o) return;
    const g=this.buildLeisureGoal(o,workday?(cfg.workdayTime||"18:30"):(cfg.weekendTime||"14:00"));
    st.goals.push(g); this.trim();
  }
  trim(){
    const st=this.brain.state.goalsPlanning, max=Number(this.config.maxGoals||20), hm=Number(this.config.maxHistory||40);
    while(st.goals.length>max){ const x=st.goals.shift(); if(x) st.history.push(x); }
    while(st.history.length>hm) st.history.shift();
  }
  update(){ this.ensureDailyGoal(); this.reconsider(); }
  reconsider(){
    const s=this.brain.state, cfg=this.config.reconsider||{};
    for(const g of this.activeGoals()){
      if(g.date!==this.dayKey() || g.status==="active") continue;
      if(this.currentMinute() < this.minutes(g.time)-20) continue;
      let reason=null;
      if(Number(s.energy??50)<Number(cfg.energyBelow??20)) reason="я надто втомився";
      if(!reason && g.outdoor){ const wc=this.brain.leisure?.weatherComfort?.(); if(Number.isFinite(wc)&&wc<Number(cfg.weatherComfortBelow??28)) reason="погода зіпсувалася"; }
      const meta=s.internalStream?.metacognition;
      if(!reason && meta?.reconsidering && this.currentMinute()>=this.minutes(g.time)-20) reason="я передумав після того, як оцінив свій стан";
      if(!reason) continue;
      const maxPost=Number(cfg.maxPostpones??2);
      if((g.postpones||0)<maxPost && this.currentMinute()<21*60){
        const min=Number(cfg.postponeMinutesMin||30), max=Number(cfg.postponeMinutesMax||90), add=Math.round(min+Math.random()*Math.max(0,max-min));
        g.time=this.timeFromMinutes(this.currentMinute()+add); g.postpones=(g.postpones||0)+1; g.status="paused"; g.lastChangeReason=reason;
        g.interruptions.push({at:this.now(),type:"postponed",reason,newTime:g.time});
      } else { this.cancelGoal(g,reason); }
    }
  }
  cancelGoal(g,reason){ g.status="cancelled"; g.finishedAt=this.now(); g.lastChangeReason=reason; g.interruptions.push({at:this.now(),type:"cancelled",reason}); this.archive(g); }
  archive(g){ const st=this.brain.state.goalsPlanning; if(!st.history.some(x=>x.id===g.id)) st.history.push(JSON.parse(JSON.stringify(g))); this.trim(); }
  dueGoal(){
    return this.activeGoals().filter(g=>g.date===this.dayKey() && this.currentMinute()>=this.minutes(g.time)).sort((a,b)=>(b.priority||0)-(a.priority||0)||this.minutes(a.time)-this.minutes(b.time))[0]||null;
  }
  getPriorityAction(){
    if(this.brain.state.action) return null;
    const g=this.dueGoal(); if(!g) return null;
    if(this.brain.dailyLife?.isWorkTime?.()) { g.status="paused"; g.lastChangeReason="зараз робочий час"; return null; }
    let step=g.steps?.[g.currentStep||0];
    while(step && step.status==="completed"){ g.currentStep++; step=g.steps[g.currentStep]; }
    if(!step){ this.completeGoal(g); return null; }
    g.status="active"; step.status="active"; step.startedAt=this.now();
    if(step.kind==="return" && this.brain.state.leisure) this.brain.state.leisure.returnPending=false;
    return {type:"action",actionId:step.actionId,category:"goal_plan",duration:step.duration||20,reason:g.reason,goal:g.title,expectedOutcome:g.expectedOutcome,
      goalPlanId:g.id,planStepId:step.id,targetLocation:step.targetLocation,destinationName:step.destinationName,score:1600,factors:{goalPlan:1600}};
  }
  onActionFinished(action){
    const gid=action?.goalPlanId, sid=action?.planStepId; if(!gid||!sid) return;
    const g=(this.brain.state.goalsPlanning?.goals||[]).find(x=>x.id===gid); if(!g) return;
    const step=g.steps.find(x=>x.id===sid); if(!step) return;
    step.status="completed"; step.finishedAt=this.now(); g.currentStep=Math.max(g.currentStep||0,g.steps.indexOf(step)+1);
    if(g.currentStep>=g.steps.length) this.completeGoal(g); else g.status="planned";
  }
  completeGoal(g){ g.status="completed"; g.finishedAt=this.now(); g.lastChangeReason=null; this.archive(g); }
  describeGoal(g){ if(!g) return null; const step=g.steps?.[g.currentStep||0]; return {title:g.title,reason:g.reason,time:g.time,date:g.date,status:g.status,nextStep:step?.actionId||null,progress:`${Math.min(g.currentStep||0,g.steps?.length||0)}/${g.steps?.length||0}`,lastChangeReason:g.lastChangeReason}; }
  answerPlan(){ const g=this.nextGoal(); if(!g) return "Поки нічого конкретного не запланував."; const extra=g.status==="paused"&&g.lastChangeReason?` Довелося відкласти, бо ${g.lastChangeReason}.`:""; return `Планую ${g.title} приблизно о ${g.time}.${extra}`; }
  answerPlanWhy(){ const g=this.currentGoal(); return g?`Бо ${String(g.reason||"мені цього захотілося").replace(/[.!?]+$/u,"")}.`:"Зараз у мене немає конкретного довгого плану."; }
  answerPlanProgress(){ const g=this.currentGoal(); if(!g) return "Зараз немає плану, який я виконую."; const done=(g.steps||[]).filter(s=>s.status==="completed").length,total=g.steps?.length||0; if(g.status!=="active"&&done===0) return `Ще не почав. Планую ${g.title} приблизно о ${g.time}.`; return `У плані «${g.title}» виконав ${done} з ${total} кроків.`; }
}
window.AkiraGoalsPlanning=AkiraGoalsPlanning;
