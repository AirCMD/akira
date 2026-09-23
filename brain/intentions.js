// intentions.js
// Намір -> причина -> план -> виконання/скасування -> спогад.
// Не генерує репліки: лише зберігає причинність власних дій Акіри.
class AkiraIntentions {
  constructor(brain){ this.brain=brain; this.config={}; }

  init(){
    this.config=this.brain.data?.intentions?.intentions || {};
    const s=this.brain.state;
    s.intentions ||= {};
    s.intentions.current ||= null;
    s.intentions.plans ||= [];
    s.intentions.recent ||= [];
    s.intentions.lastPlanningDay ||= null;
    return this;
  }

  now(){ return Date.now(); }
  dayKey(){ return this.brain.state?.world?.date || new Date().toISOString().slice(0,10); }
  minutes(t){ const m=String(t||"00:00").match(/(\d{1,2}):(\d{2})/); return m?Number(m[1])*60+Number(m[2]):0; }
  currentMinute(){ return this.minutes(this.brain.state?.world?.time); }

  describeAction(action){
    const id=action?.actionId || "дія";
    const explicit=action?.intentionLabel || action?.destinationName || action?.mealName || action?.drinkName;
    if(explicit) return explicit;
    const labels={
      sleep:"поспати", rest:"відпочити", eatMeal:"поїсти", cookMeal:"приготувати їжу",
      prepareDrink:"приготувати напій", drinkSelected:"щось випити", walk:"прогулятися містом",
      cycle:"покататися велосипедом", read:"почитати", playGame:"пограти", watchStreamer:"подивитися стрім",
      visitMuseum:"сходити в музей", visitPlanetarium:"сходити в планетарій", visitTheatre:"сходити в театр",
      visitConcert:"сходити на концерт", goToCinema:"сходити в кіно", work:"попрацювати",
      commuteToWork:"дістатися на роботу", commuteHome:"повернутися додому", washDishes:"помити посуд",
      wipeDust:"витерти пил", vacuumRoom:"пропилососити", mopFloor:"помити підлогу", washWindows:"помити вікна",
      startLaundry:"випрати білизну", hangLaundry:"розвісити білизну", foldLaundry:"скласти суху білизну",
      shave:"поголитися", takeBath:"прийняти ванну", groceryShopping:"купити продукти"
    };
    return labels[id] || id;
  }

  onActionStarted(action){
    if(!action || action.actionId==="moveRoom") return;
    const i={
      id:`intent_${this.now()}_${Math.floor(Math.random()*10000)}`,
      actionId:action.actionId,
      goal:this.describeAction(action),
      reason:action.reason || this.inferReason(action),
      trigger:action.trigger || null,
      startedAt:this.now(),
      status:"active",
      plannedId:action.plannedId || null
    };
    this.brain.state.intentions.current=i;
    if(action.plannedId){
      const p=this.brain.state.intentions.plans.find(x=>x.id===action.plannedId);
      if(p){ p.status="in_progress"; p.startedAt=this.now(); }
    }
  }

  inferReason(action){
    const s=this.brain.state;
    const id=action?.actionId;
    if(["cookMeal","eatMeal"].includes(id)) return "зголоднів і вирішив поїсти";
    if(["prepareDrink","drinkSelected"].includes(id)) return "захотілося пити";
    if(id==="sleep") return Number(s.fatigue||0)>55 ? "втомився і хочу виспатися" : "час поспати";
    if(id==="rest") return "хочу трохи відпочити";
    if(["wipeDust","vacuumRoom","mopFloor","washWindows","washDishes"].includes(id)) return "помітив безлад і вирішив прибрати";
    if(["startLaundry","hangLaundry","foldLaundry"].includes(id)) return "накопичилася білизна, треба з нею розібратися";
    return action?.reason || "зараз це здалося мені доречним";
  }

  onActionFinished(action){
    const cur=this.brain.state.intentions?.current;
    if(cur && cur.actionId===action?.actionId){
      cur.status="completed"; cur.finishedAt=this.now();
      this.pushRecent(cur);
      this.brain.state.intentions.current=null;
    }
    if(action?.plannedId){
      const p=this.brain.state.intentions.plans.find(x=>x.id===action.plannedId);
      if(p){ p.status="completed"; p.finishedAt=this.now(); }
    }
  }

  pushRecent(item){
    const r=this.brain.state.intentions.recent;
    r.push({...item});
    const max=Number(this.config.maxRecent||30);
    while(r.length>max) r.shift();
  }

  update(){
    this.ensureDailyPlan();
    this.reconsiderPlans();
  }

  ensureDailyPlan(){
    const cfg=this.config.dailyPlanning||{};
    if(cfg.enabled===false) return;
    const s=this.brain.state.intentions;
    const day=this.dayKey();
    if(s.lastPlanningDay===day) return;
    // План формуємо один раз на календарний день, але не посеред ночі.
    const minute=this.currentMinute();
    if(minute<8*60) return;
    s.lastPlanningDay=day;
    const workday=this.brain.dailyLife?.isWorkday?.() ?? false;
    const chance=Number(workday?cfg.chanceWorkday:cfg.chanceWeekend);
    if(Math.random()>(Number.isFinite(chance)?chance:0.65)) return;
    const leisure=this.brain.leisure;
    const allowed=new Set(cfg.candidates||[]);
    const ops=(leisure?.config?.opportunities||[]).filter(o=>allowed.size===0||allowed.has(o.id));
    if(!ops.length) return;
    const scored=ops.map(o=>({o,score:leisure?.scoreOpportunity?.(o) ?? Number(o.base||0)}))
      .filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score);
    if(!scored.length) return;
    // Не завжди найвище: невелика варіативність серед трьох найдоречніших.
    const pool=scored.slice(0,Math.min(3,scored.length));
    const chosen=pool[Math.floor(Math.random()*pool.length)].o;
    const plannedTime=workday?(cfg.workdayTime||"18:30"):(cfg.weekendTime||"14:00");
    s.plans.push({
      id:`plan_${day}_${chosen.id}`,
      date:day, time:plannedTime, source:"daily_leisure", opportunityId:chosen.id,
      actionId:chosen.actionId, destination:chosen.destination||"home", destinationName:chosen.destinationName||null,
      duration:chosen.duration, travelMinutes:chosen.travelMinutes||0, reason:chosen.reason,
      outdoor:!!chosen.outdoor, status:"planned", createdAt:this.now()
    });
  }

  reconsiderPlans(){
    const s=this.brain.state;
    const plans=s.intentions?.plans||[];
    for(const p of plans){
      if(p.status!=="planned") continue;
      if(p.date!==this.dayKey()) continue;
      if(Number(s.energy||50)<Number(this.config.cancelEnergyBelow||18)){
        p.status="cancelled"; p.cancelReason="надто втомився"; p.cancelledAt=this.now(); this.pushRecent({...p,goal:this.planGoal(p)}); continue;
      }
      if(p.outdoor){
        const wc=this.brain.leisure?.weatherComfort?.();
        if(Number.isFinite(wc) && wc<Number(this.config.outdoorWeatherComfortBelow||28)){
          p.status="cancelled"; p.cancelReason="погода зіпсувалася"; p.cancelledAt=this.now(); this.pushRecent({...p,goal:this.planGoal(p)});
        }
      }
    }
  }

  planGoal(p){
    const fake={actionId:p.actionId,destinationName:p.destinationName};
    return this.describeAction(fake);
  }

  getPriorityAction(){
    if(this.brain.state.action) return null;
    const s=this.brain.state;
    const due=(s.intentions?.plans||[]).find(p=>p.status==="planned" && p.date===this.dayKey() && this.currentMinute()>=this.minutes(p.time));
    if(!due) return null;
    // Робота та дорога мають вищий пріоритет: прострочений leisure-план трохи почекає.
    if(this.brain.dailyLife?.isWorkTime?.()) return null;
    if(due.destination && due.destination!=="home" && s.world?.location==="home"){
      // Використовуємо існуючий leisure pendingAction, щоб після дороги
      // план продовжився реальною активністю, а не загубився біля дверей театру.
      if(s.leisure) s.leisure.pendingAction={actionId:due.actionId,duration:due.duration,reason:due.reason,
        destination:due.destination,extra:{plannedId:due.id}};
      return {type:"action",actionId:"travelToLeisure",category:"intention",duration:due.travelMinutes||25,
        reason:due.reason,plannedId:due.id,targetLocation:due.destination,destinationName:due.destinationName||due.destination,
        plannedAction:due.actionId,plannedDuration:due.duration,score:1400,factors:{intention:1400}};
    }
    return {type:"action",actionId:due.actionId,category:"intention",duration:due.duration||45,reason:due.reason,
      plannedId:due.id,score:1400,factors:{intention:1400}};
  }

  getWhy(){
    const cur=this.brain.state.intentions?.current;
    if(cur?.reason) return cur.reason;
    const action=this.brain.state.action;
    if(action?.reason) return action.reason;
    return null;
  }

  getNextPlan(){
    return (this.brain.state.intentions?.plans||[])
      .filter(p=>p.status==="planned" && p.date===this.dayKey())
      .sort((a,b)=>this.minutes(a.time)-this.minutes(b.time))[0] || null;
  }
}
window.AkiraIntentions=AkiraIntentions;
