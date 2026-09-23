// v36: автономне життя Яні. Яні має власний стан; Акіра не отримує його як всезнання.
class AkiraYaniLife {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data.yani||{};
    const s=this.brain.state;
    s.yani=s.yani||{
      location:"home", homeRoom:"glass_room", activity:"idle", action:null,
      energy:72, fatigue:28, hunger:30, socialEnergy:58, creativity:66, fun:62,
      mood:"calm", sleeping:false, lastAction:null, lastSeenByAkira:null,
      history:[], nextDecisionAt:0
    };
    return this;
  }
  clamp(v){ return Math.max(0,Math.min(100,Number(v)||0)); }
  update(minutes=0){
    const y=this.brain.state.yani; if(!y) return;
    const m=Math.max(0,Number(minutes)||0);
    y.hunger=this.clamp(y.hunger+m*0.055);
    y.fatigue=this.clamp(y.fatigue+m*(y.sleeping?-0.22:0.035));
    y.energy=this.clamp(y.energy+m*(y.sleeping?0.24:-0.025));
    y.fun=this.clamp(y.fun-m*0.018); y.creativity=this.clamp(y.creativity-m*0.01);
    if(y.action && Date.now()>=y.action.endsAt) this.finishAction();
    if(!y.action && Date.now()>=Number(y.nextDecisionAt||0)) this.decide();
    this.observeIfTogether();
  }
  hour(){ return Number(String(this.brain.state.world?.time||"12:00").split(":")[0])||12; }
  choose(items){ return items[Math.floor(Math.random()*items.length)]; }
  decide(){
    const y=this.brain.state.yani, h=this.hour();
    if(y.sleeping){
      if(h>=9 && h<14 && y.energy>65) return this.start("wakeUp",5,"home",y.homeRoom,"прокинулась");
      y.nextDecisionAt=Date.now()+15000; return;
    }
    if((h>=1&&h<9) && (y.fatigue>55 || y.energy<38)) return this.start("sleep",360,"home","bedroom","лягла спати");
    if(y.hunger>72) return this.start(this.choose(["eatSnacks","orderFood"]),this.choose([15,25]),"home",y.homeRoom,"зголодніла");
    if(y.fatigue>78) return this.start("rest",35,"home",this.choose(["glass_room","space_room"]),"втомилася");
    const pool=["playTamagotchi","draw","decorateNotebook","workOnScripts","listenOrSing","browseCollectibles","walk","visitJeannieShop","pickUpParcel","sitOnBalcony","idle"];
    if(y.creativity>58) pool.push("draw","decorateNotebook","workOnScripts");
    if(y.fun<45) pool.push("playTamagotchi","walk","browseCollectibles");
    const a=this.choose(pool);
    const external={visitJeannieShop:"jeannie_shop",pickUpParcel:"post_office",walk:"city",browseCollectibles:"shops"};
    const room=this.choose(["glass_room","space_room","second_room","balcony"]);
    this.start(a,this.choose([20,30,45,60]),external[a]||"home",external[a]?null:room,"сама вирішила цим зайнятися");
  }
  start(id,duration,location,room,reason){
    const y=this.brain.state.yani;
    if(id==="wakeUp") y.sleeping=false;
    if(id==="sleep") y.sleeping=true;
    y.location=location||y.location; if(room) y.homeRoom=room;
    const now=Date.now();
    y.activity=id; y.action={actionId:id,startedAt:now,endsAt:now+Math.max(1,duration)*60*1000/Math.max(.01,this.brain.config.simulationSpeed),reason};
    if(id==="sleep") y.action.endsAt=now+Math.max(1,duration)*60*1000/Math.max(.01,this.brain.config.simulationSpeed);
    this.record(id,reason); return y.action;
  }
  finishAction(){
    const y=this.brain.state.yani, a=y.action; if(!a)return;
    if(["eatSnacks","orderFood"].includes(a.actionId)){y.hunger=this.clamp(y.hunger-55);y.fun=this.clamp(y.fun+8);}
    if(["playTamagotchi","walk","browseCollectibles","visitJeannieShop"].includes(a.actionId)) y.fun=this.clamp(y.fun+18);
    if(["draw","decorateNotebook","workOnScripts"].includes(a.actionId)) y.creativity=this.clamp(y.creativity+12);
    if(a.actionId==="rest") {y.fatigue=this.clamp(y.fatigue-20);y.energy=this.clamp(y.energy+15);}
    y.lastAction=a.actionId; y.action=null; y.activity="idle"; y.nextDecisionAt=Date.now()+3000;
  }
  record(actionId,reason){
    const y=this.brain.state.yani; y.history=y.history||[];
    y.history.push({actionId,reason,date:this.brain.state.world?.date,time:this.brain.state.world?.time,location:y.location,homeRoom:y.homeRoom});
    if(y.history.length>120)y.history.splice(0,y.history.length-120);
  }
  observeIfTogether(){
    const y=this.brain.state.yani, a=this.brain.state;
    if(y.location!==a.world?.location)return;
    if(y.location==="home" && y.homeRoom!==a.homeRoom)return;
    y.lastSeenByAkira={at:Date.now(),date:a.world?.date,time:a.world?.time,location:y.location,homeRoom:y.homeRoom,activity:y.activity};
  }
  knownLocationForAkira(){
    const y=this.brain.state.yani, a=this.brain.state;
    if(y.location===a.world?.location && (y.location!=="home" || y.homeRoom===a.homeRoom)) return {known:true,current:true,...y};
    const seen=y.lastSeenByAkira;
    if(seen && Date.now()-seen.at<30*60*1000) return {known:true,current:false,...seen};
    return {known:false};
  }
}
window.AkiraYaniLife=AkiraYaniLife;
