// brain_coordinator.js — v44 Integration / Brain Coordinator
// Єдина точка оркестрації автономного циклу. Не містить характеру чи реплік.
class AkiraBrainCoordinator {
  constructor(brain){ this.brain=brain; this.config={}; }
  init(){
    this.config=this.brain.data?.brain_coordinator?.brainCoordinator || {};
    const s=this.brain.state;
    s.coordinator ||= {cycle:0,lastPhases:[],lastDecision:null,lastConflict:null,lastTickAt:null};
    return this;
  }
  runUpdates(minutes){
    const b=this.brain, s=b.state, phases=[];
    const phase=(name,fn)=>{ try{ fn?.(); phases.push(name); }catch(e){ console.warn(`Coordinator phase ${name} failed`,e); } };
    // Порядок навмисний: тіло і світ раніше за інтерпретацію та плани.
    phase("body",()=>{ b.updateNeeds(minutes); b.health?.update?.(minutes); b.dreams?.update?.(minutes); });
    phase("environment",()=>{ b.household?.update?.(minutes); b.accidents?.update?.(minutes); b.phone?.update?.(minutes); b.yaniLife?.update?.(minutes); b.yaniInteractions?.update?.(minutes); b.workLife?.ensureDay?.(); });
    phase("attention",()=>b.attention?.update?.(minutes));
    phase("emotion",()=>b.updateMood(minutes));
    phase("memory",()=>b.updateMemory(minutes));
    phase("self",()=>{ b.selfModel?.update?.(minutes); b.autobiographicalSelf?.update?.(minutes); b.internalStream?.update?.(minutes); });
    phase("goals",()=>{ b.intentions?.update?.(minutes); b.goalsPlanning?.update?.(minutes); });
    s.coordinator.cycle=(s.coordinator.cycle||0)+1; s.coordinator.lastPhases=phases; s.coordinator.lastTickAt=Date.now();
  }
  blockedBy(action){
    const b=this.brain, s=b.state, id=action?.actionId||"";
    if(!action) return "empty";
    // Сон/непритомність-подібні стани блокують звичайні плани. Пробудження та sleep-механіка проходять.
    if((s.activity==="sleeping" || s.action?.actionId==="sleep") && !["sleep","wakeUp"].includes(id)) return "sleeping";
    // Робочий час не дозволяє дозвіллю перехопити кермо.
    if(b.dailyLife?.isWorkTime?.() && ["leisure","goal_plan"].includes(action.category) && !String(id).toLowerCase().includes("work")) return "work_time";
    return null;
  }
  collectPriorityActions(situation){
    const b=this.brain;
    const sources=[
      ["health",b.health,1000],["accidents",b.accidents,950],["dailyLife",b.dailyLife,900],
      ["workLife",b.workLife,850],["goalsPlanning",b.goalsPlanning,800],["intentions",b.intentions,700],
      ["food",b.food,650],["household",b.household,550],["leisure",b.leisure,450]
    ];
    const out=[];
    for(const [source,module,base] of sources){
      let action=null; try{ action=module?.getPriorityAction?.(situation)||null; }catch(e){ console.warn(`Priority source ${source} failed`,e); }
      if(!action) continue;
      const blocked=this.blockedBy(action);
      out.push({source,base,score:Number(action.score)||base,blocked,action});
    }
    return out;
  }
  chooseAction(situation){
    const s=this.brain.state, candidates=this.collectPriorityActions(situation);
    const valid=candidates.filter(x=>!x.blocked).sort((a,b)=>b.score-a.score||b.base-a.base);
    let chosen=valid[0]||null;
    // Якщо пріоритетних дій немає, старий багатовимірний decision engine лишається fallback.
    let action=chosen?.action || this.brain.decision?.decide?.(situation) || null;
    const conflict=candidates.length>1 ? {at:Date.now(),candidates:candidates.map(x=>({source:x.source,actionId:x.action?.actionId||null,score:x.score,blocked:x.blocked||null})),chosen:chosen?.source||"decision"} : null;
    s.coordinator.lastConflict=conflict;
    s.coordinator.lastDecision={at:Date.now(),source:chosen?.source||"decision",actionId:action?.actionId||null,reason:action?.reason||null};
    return action;
  }
  onActionFinished(action){
    const s=this.brain.state; if(!s.coordinator) return;
    s.coordinator.lastCompleted={at:Date.now(),actionId:action?.actionId||null,category:action?.category||null};
  }
}
window.AkiraBrainCoordinator=AkiraBrainCoordinator;
