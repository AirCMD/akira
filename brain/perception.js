class AkiraPerception {
  constructor(brain){this.brain=brain;}
  init(){return this;}
  perceive(){
    const b=this.brain, n=b.needs;
    return {world:{...b.state.world},activity:b.state.activity,action:b.state.action,urgentNeed:n?.getMostUrgentNeed?.()||null,needs:{...b.state.needs},emotions:b.mood?.getState?.()||{},currentPerson:b.state.currentPerson,recentEvents:[...(b.state.recentEvents||[])].slice(-5)};
  }
}
window.AkiraPerception=AkiraPerception;
