class AkiraActivities {
  constructor(brain){this.brain=brain; this.data={};}
  init(){this.data=this.brain.data.activities?.activities||this.brain.data.activities||{}; return this;}
  get(id){return this.data[id]||null;}
  canStart(id){const a=this.get(id); return !!(a && a.canInitiate!==false && !this.brain.state.action);}
  start(id, extra={}){if(!this.canStart(id)) return null; const a=this.get(id); const d=a.duration||{}; return this.brain.executeAction({type:"action",actionId:id,duration:Number(d.usualMinutes)||10,...extra});}
  finish(){return this.brain.finishAction();}
}
window.AkiraActivities=AkiraActivities;
