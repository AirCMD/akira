// v45.5: соціальна подія зберігає не лише співрозмовника, а й канал та причину контакту.
class AkiraSocial {
  constructor(brain){this.brain=brain; this.lastInteraction=0;}
  init(){
    const s=this.brain.state;
    s.socialContext ||= {last:null,history:[]};
    return this;
  }
  choosePerson(){return this.brain.relationships?.bestContact?.()||Object.keys(this.brain.state.relationships||{})[0]||null;}
  samePlaceWithYani(){
    const s=this.brain.state,y=s.yani;
    if(!y || y.location!==s.world?.location) return false;
    if(y.location==="home" && y.homeRoom!==s.dailyLife?.homeRoom) return false;
    return true;
  }
  prepareAction(action){
    if(!action) return action;
    if(action.actionId==="talkToYani"){
      action.targetPerson ||= "Yani_Bakeneko";
      if(!action.interactionChannel){
        if(this.samePlaceWithYani()) action.interactionChannel="inPerson";
        else action.interactionChannel=Math.random()<0.72?"message":"phoneCall";
      }
      if(!action.contactReason){
        if(action.interactionChannel==="inPerson") action.contactReason="Яні була поруч, тож ми трохи поговорили";
        else if(action.interactionChannel==="phoneCall") action.contactReason=Math.random()<0.5?"Яні зателефонувала мені":"я зателефонував Яні";
        else action.contactReason=Math.random()<0.55?"Яні написала мені":"я написав Яні";
      }
      if(["message","phoneCall"].includes(action.interactionChannel)) action.remoteContact=true;
    }
    return action;
  }
  completeAction(action){
    if(!action) return;
    const social=["talkToSomeone","talkToYani","talkToKent","talkToTaras","talkToManager","talkToParents","talkToBrother","consultCustomer","compareDevices","explainSpecs","checkSocialNetwork","writePost"];
    if(!social.includes(action.actionId)) return;
    const person=action.targetPerson|| (action.actionId==="talkToYani"?"Yani_Bakeneko":null);
    if(person){this.brain.relationships?.onInteraction?.(person,"positive"); this.brain.state.currentPerson=person;}
    if(action.actionId==="talkToSomeone" || action.actionId==="talkToYani") this.brain.needs?.applySocialFatigue?.();
    if(person){
      const channel=action.interactionChannel || (action.actionId==="talkToYani" ? (this.samePlaceWithYani()?"inPerson":"message") : "inPerson");
      const event={
        at:Date.now(), date:this.brain.state.world?.date||null, time:this.brain.state.world?.time||null,
        personId:person, channel, reason:action.contactReason||action.reason||null,
        location:action.worldStarted?.location||this.brain.state.world?.location||null,
        privacy:action.contactPrivacy||"normal", visitReason:action.visitReason||null,
        actionId:action.actionId,
        customer:action.customer||null,
        workZone:action.workZone||null
      };
      const c=this.brain.state.socialContext ||= {last:null,history:[]};
      c.last=event; c.history ||= []; c.history.push(event); if(c.history.length>120)c.history.splice(0,c.history.length-120);
      action.interactionChannel=channel; action.contactReason=event.reason; action.socialEvent=event;
    }
    this.lastInteraction=Date.now();
  }
  lastWith(personId){
    const h=this.brain.state.socialContext?.history||[];
    return [...h].reverse().find(x=>x?.personId===personId)||null;
  }
}
window.AkiraSocial=AkiraSocial;
