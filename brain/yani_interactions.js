// v36.1: взаємодія двох автономних агентів. Яні пропонує, Акіра може погодитися або відмовитися.
class AkiraYaniInteractions {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data.yani_interactions||{};
    const s=this.brain.state;
    s.yaniInteractions=s.yaniInteractions||{lastProposalAt:0,lastInteractionAt:0,history:[],pending:null,conflict:null};
    return this;
  }
  simMs(minutes){ return Math.max(1,minutes)*1000/Math.max(.01,this.brain.config.simulationSpeed); }
  together(){
    const s=this.brain.state, y=s.yani;
    if(!y || y.location!==s.world?.location) return false;
    if(y.location==="home" && y.homeRoom!==(s.dailyLife?.homeRoom||null)) return false;
    return true;
  }
  busyAkira(){ return !!this.brain.state.action; }
  busyYani(){ return !!this.brain.state.yani?.action; }
  chance(p){ return Math.random()<p; }
  choose(a){ return a[Math.floor(Math.random()*a.length)]; }
  update(minutes=0){
    const s=this.brain.state, y=s.yani, x=s.yaniInteractions;
    if(!y||!x||!this.together()||y.sleeping) return;
    if(x.pending && Date.now()>x.pending.expiresAt) x.pending=null;
    if(x.conflict && Date.now()>x.conflict.coolUntil) this.reconcile();
    if(this.busyYani() || x.pending || x.conflict) return;
    const cooldown=this.simMs(Number(this.data.proposalCooldownMinutes)||90);
    if(Date.now()-Number(x.lastProposalAt||0)<cooldown) return;
    // Яні не перетворюється на генератор запрошень щотік. Ініціатива приблизно 50/50, але ситуативна.
    if(!this.chance(.018)) return;
    const p=this.makeProposal(); if(!p) return;
    x.lastProposalAt=Date.now(); x.pending={...p,createdAt:Date.now(),expiresAt:Date.now()+this.simMs(15)};
    this.resolveProposal(x.pending);
  }
  makeProposal(){
    const y=this.brain.state.yani;
    const pool=[];
    if(y.fun<65) pool.push("playTogether");
    if(y.creativity>45) pool.push("drawTogether");
    if(y.energy>45 && y.fatigue<60) pool.push("walkTogether");
    if(y.hunger>45) pool.push("orderFoodTogether");
    if(y.energy>30) pool.push("balconyTogether");
    if(y.socialEnergy>45) pool.push("massageAkira","talkTogether");
    if(!pool.length) return null;
    const id=this.choose(pool);
    return {id,from:"Yani_Bakeneko",to:"Akira",reason:this.proposalReason(id)};
  }
  proposalReason(id){
    const map={playTogether:"хочеться разом пограти",drawTogether:"хочеться разом помалювати",walkTogether:"хочеться прогулятися разом",orderFoodTogether:"зголодніла і хочеться замовити щось разом",balconyTogether:"хочеться побути разом на балконі",massageAkira:"хочеться проявити турботу",talkTogether:"хочеться поговорити з Акірою"};
    return map[id]||"хочеться провести час разом";
  }
  akiraAccepts(p){
    const s=this.brain.state, n=s.needs||{};
    if(this.busyAkira()) return false;
    if((n.energy??60)<25 || (n.rest??50)<18) return false;
    if((n.privacy??50)>82 && p.id!=="massageAkira") return false;
    if(s.health?.illness?.stage==="peak") return false;
    return this.chance(.72);
  }
  resolveProposal(p){
    const x=this.brain.state.yaniInteractions;
    const accepted=this.akiraAccepts(p);
    this.record("proposal",{proposal:p.id,accepted,reason:p.reason});
    if(accepted) this.startShared(p.id); else this.handleRefusal(p.id);
    x.pending=null;
  }
  startShared(id){
    const y=this.brain.state.yani;
    const map={
      playTogether:{akira:"playGame",yani:"playTogether",duration:35},
      drawTogether:{akira:"draw",yani:"drawTogether",duration:40},
      walkTogether:{akira:"walk",yani:"walkTogether",duration:45},
      orderFoodTogether:{akira:"eatMeal",yani:"orderFoodTogether",duration:30},
      balconyTogether:{akira:"lookOutWindow",yani:"balconyTogether",duration:25},
      massageAkira:{akira:"rest",yani:"massageAkira",duration:25},
      talkTogether:{akira:"talkToYani",yani:"talkTogether",duration:25}
    };
    const m=map[id]||map.talkTogether;
    // Спільна дія відбувається лише коли вони вже поруч. Не телепортуємо агентів.
    this.brain.executeAction?.({type:"action",actionId:m.akira,duration:m.duration,targetPerson:"Yani_Bakeneko",reason:`Яні запропонувала: ${this.proposalReason(id)}`,goal:"провести час з Яні",expectedOutcome:"спільний час"});
    if(!this.brain.state.action) return;
    y.action={actionId:m.yani,startedAt:Date.now(),endsAt:Date.now()+this.simMs(m.duration),reason:`запропонувала Акірі: ${this.proposalReason(id)}`,sharedWith:"Akira"};
    y.activity=m.yani;
    this.brain.state.yaniInteractions.lastInteractionAt=Date.now();
    this.record("shared_start",{interaction:id});
  }
  handleRefusal(id){
    const y=this.brain.state.yani;
    y.socialEnergy=Math.max(0,(Number(y.socialEnergy)||50)-2);
    this.record("refusal",{interaction:id});
  }
  maybeConflict(trigger){
    const x=this.brain.state.yaniInteractions;
    if(!this.together()||x.conflict||!this.chance(.16)) return false;
    x.conflict={trigger,startedAt:Date.now(),coolUntil:Date.now()+this.simMs(20+Math.floor(Math.random()*40))};
    this.brain.relationships?.change?.("Yani_Bakeneko",{desireForContact:-2,closeness:-1});
    this.record("conflict",{trigger}); return true;
  }
  reconcile(){
    const x=this.brain.state.yaniInteractions; if(!x.conflict)return;
    this.record("reconcile",{trigger:x.conflict.trigger});
    this.brain.relationships?.change?.("Yani_Bakeneko",{desireForContact:2,closeness:1});
    x.conflict=null;
  }
  record(type,extra={}){
    const x=this.brain.state.yaniInteractions; x.history=x.history||[];
    x.history.push({type,...extra,date:this.brain.state.world?.date,time:this.brain.state.world?.time,at:Date.now()});
    if(x.history.length>100)x.history.splice(0,x.history.length-100);
  }
}
window.AkiraYaniInteractions=AkiraYaniInteractions;
