// health.js — фізичне самопочуття, сезонні застуди/грип і пилова алергія.
// Це симуляція стану персонажа, а не медична модель чи порада.
class AkiraHealth {
  constructor(brain){ this.brain=brain; this.cfg={}; }
  init(){
    this.cfg=this.brain.data?.health?.health||{};
    const s=this.brain.state;
    s.health ||= {};
    s.health.temperature ??= Number(this.cfg.baseline?.temperature)||36.6;
    s.health.wellbeing ??= Number(this.cfg.baseline?.wellbeing)||88;
    s.health.illness ||= null;
    s.health.allergy ||= null;
    s.health.symptoms = Array.isArray(s.health.symptoms)?s.health.symptoms:[];
    s.health.severity ??= 0;
    s.health.lastUpdateAt ||= Date.now();
    return this;
  }
  n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
  clamp(v,a=0,b=100){ return Math.max(a,Math.min(b,this.n(v))); }
  speed(){ return Math.max(.01,this.n(this.brain.config?.simulationSpeed,1)); }
  simMs(minutes){ return minutes*1000/this.speed(); }
  rand(a,b){ return a+Math.random()*(b-a); }
  chancePerMinutes(perDay,minutes){ return 1-Math.pow(1-this.clamp(perDay,0,.95),Math.max(0,minutes)/1440); }
  weightedType(){
    const types=this.cfg.illness?.types||{}; const entries=Object.entries(types); if(!entries.length) return ["cold",{}];
    const total=entries.reduce((s,[,v])=>s+this.n(v.weight,1),0); let r=Math.random()*total;
    for(const e of entries){ r-=this.n(e[1].weight,1); if(r<=0) return e; } return entries[0];
  }
  currentRoomDust(){
    const room=this.brain.state?.dailyLife?.homeRoom; return this.n(this.brain.state?.household?.rooms?.[room]?.dust,0);
  }
  startIllness(){
    if(this.brain.state.health.illness) return;
    const [type,cfg]=this.weightedType(); const dur=cfg.durationSimHours||[48,96]; const peak=cfg.peakTemperature||[37,38];
    const durationMin=this.rand(dur[0],dur[1])*60;
    this.brain.state.health.illness={type,startedAt:Date.now(),endsAt:Date.now()+this.simMs(durationMin),durationSimMinutes:durationMin,peakTemperature:this.rand(peak[0],peak[1]),symptoms:[...(cfg.symptoms||[])],stage:"early"};
    this.brain.memory?.remember?.({type:"health",title:"Почав погано почуватися",content:`Почалися симптоми: ${type}`,importance:45,topics:["health",type],keywords:["health",type]});
  }
  startAllergy(dust){
    const cfg=this.cfg.allergy||{}; const d=cfg.durationSimMinutes||[30,120]; const duration=this.rand(d[0],d[1]);
    this.brain.state.health.allergy={type:"dust",startedAt:Date.now(),endsAt:Date.now()+this.simMs(duration),dustAtTrigger:dust,symptoms:[...(cfg.symptoms||[])]};
  }
  update(minutes=0){
    if(minutes<=0) return; const h=this.brain.state.health; const now=Date.now();
    if(h.illness && now>=h.illness.endsAt){
      this.brain.memory?.remember?.({type:"health",title:"Одужав",content:"Самопочуття повернулося до норми",importance:35,topics:["health","recovery"],keywords:["recovery"]});
      h.illness=null;
    }
    if(h.allergy && now>=h.allergy.endsAt) h.allergy=null;

    if(!h.illness && this.cfg.illness?.enabled!==false){
      let risk=this.n(this.cfg.illness?.seasonRiskPerSimDay?.[this.brain.state.world?.season],.008);
      if(this.n(this.brain.state.fatigue)>this.n(this.cfg.illness?.fatigueMultiplierAbove,65)) risk*=1.7;
      if(this.n(this.brain.state.energy)>0 && this.n(this.brain.state.energy)<this.n(this.cfg.illness?.lowEnergyMultiplierBelow,35)) risk*=1.6;
      if(Math.random()<this.chancePerMinutes(risk,minutes)) this.startIllness();
    }

    const dust=this.currentRoomDust(); const ac=this.cfg.allergy||{};
    if(!h.allergy && ac.enabled!==false && this.brain.state.world?.location==="home" && dust>=this.n(ac.dustThreshold,58)){
      const over=1+(dust-this.n(ac.dustThreshold,58))/35;
      const hourly=this.n(ac.riskPerSimHourAtThreshold,.012)*over;
      const p=1-Math.pow(1-Math.min(.8,hourly),minutes/60);
      if(Math.random()<p) this.startAllergy(dust);
    }

    let severity=0, temp=36.6, symptoms=[];
    if(h.illness){
      const i=h.illness; const total=Math.max(1,i.endsAt-i.startedAt), progress=this.clamp((now-i.startedAt)/total,0,1);
      const curve=Math.sin(Math.PI*progress); severity=Math.max(severity,25+65*curve); temp=36.6+(i.peakTemperature-36.6)*curve;
      i.stage=progress<.2?"early":progress<.72?"peak":"recovering"; symptoms.push(...i.symptoms);
    }
    if(h.allergy){ severity=Math.max(severity,28+Math.min(32,(h.allergy.dustAtTrigger-50)*.8)); symptoms.push(...h.allergy.symptoms); }
    h.severity=Math.round(this.clamp(severity)); h.temperature=Math.round(temp*10)/10; h.symptoms=[...new Set(symptoms)];
    h.wellbeing=Math.round(this.clamp(92-h.severity*.72)); h.lastUpdateAt=now;
    this.brain.state.physicalComfort=this.clamp(85-h.severity*.75);
    if(h.severity>35 && this.brain.needs?.needs?.energy){
      this.brain.needs.needs.energy.value=this.clamp(this.brain.needs.needs.energy.value-minutes*(h.severity/100)*.035);
      this.brain.needs.syncToBrain?.(); this.brain.needs.updateDerivedState?.();
    }
  }
  getPriorityAction(){
    const h=this.brain.state.health, b=this.cfg.behavior||{};
    if(this.brain.state.action || this.brain.state.world?.location!=="home") return null;
    if(this.n(h?.severity)<this.n(b.restSeverity,55)) return null;
    return {type:"action",actionId:"rest",duration:this.n(h.severity)>=this.n(b.strongRestSeverity,72)?60:35,category:"health",reason:h.illness?"погано почуваюся і треба відпочити":"алергія дістала, хочу трохи відпочити",goal:"дати організму відпочити",expectedOutcome:"має стати трохи легше",score:1400,factors:{health:1400},homeRoom:"cozyRoom"};
  }
  completeAction(action){
    if(action?.category!=="health") return;
    const h=this.brain.state.health; h.wellbeing=this.clamp(this.n(h.wellbeing)+5);
  }
  describe(){
    const h=this.brain.state.health||{};
    if(h.illness){ const t=h.temperature>=37?` Температура десь ${h.temperature.toFixed(1)}.`:""; return `Не дуже. ${h.symptoms.slice(0,2).join(" і ")}.${t}`; }
    if(h.allergy) return `Алергія на пил розігралася. ${h.symptoms.slice(0,2).join(" і ")}.`;
    return "Нормально почуваюся. Нічого особливого не турбує.";
  }
}
window.AkiraHealth=AkiraHealth;
