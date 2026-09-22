class AkiraSocial {
  constructor(brain){this.brain=brain; this.lastInteraction=0;}
  init(){return this;}
  choosePerson(){return this.brain.relationships?.bestContact?.()||Object.keys(this.brain.state.relationships||{})[0]||null;}
  completeAction(action){
    if(!action) return;
    const social=["talkToSomeone","talkToYani","checkSocialNetwork","writePost"];
    if(!social.includes(action.actionId)) return;
    const person=action.targetPerson|| (action.actionId==="talkToYani"?"Yani_Bakeneko":null);
    if(person){this.brain.relationships?.onInteraction?.(person,"positive"); this.brain.state.currentPerson=person;}
    if(action.actionId==="talkToSomeone" || action.actionId==="talkToYani") this.brain.needs?.applySocialFatigue?.();
    this.lastInteraction=Date.now();
  }
}
window.AkiraSocial=AkiraSocial;
