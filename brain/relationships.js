class AkiraRelationships {
  constructor(brain){ this.brain=brain; this.initialized=false; }
  init(){ this.initialized=true; return this; }
  get(personId){ return this.brain.state.relationships?.[personId] || null; }
  change(personId, changes={}){
    const rel=this.get(personId); if(!rel) return false;
    for(const [key,delta] of Object.entries(changes)){
      if(typeof delta!=="number") continue;
      const current=Number(rel[key])||0;
      rel[key]=Math.max(-100,Math.min(100,current+delta));
    }
    this.brain.emit("relationshipChanged",{personId,relationship:{...rel}}); return true;
  }
  onInteraction(personId, sentiment="neutral"){
    const map={positive:{trust:1,liking:2,closeness:1,desireForContact:1},negative:{trust:-2,liking:-3,closeness:-1,desireForContact:-2},neutral:{familiarity:0.5}};
    return this.change(personId,map[sentiment]||map.neutral);
  }
  bestContact(){
    return Object.entries(this.brain.state.relationships||{}).sort((a,b)=>((b[1].desireForContact||0)+(b[1].closeness||0))-((a[1].desireForContact||0)+(a[1].closeness||0)))[0]?.[0]||null;
  }
}
window.AkiraRelationships=AkiraRelationships;
