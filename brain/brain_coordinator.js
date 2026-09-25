// brain_coordinator.js — v44 Integration / Brain Coordinator
// Єдина точка оркестрації автономного циклу. Не містить характеру чи реплік.
class AkiraBrainCoordinator {
  constructor(brain){ this.brain=brain; this.config={}; }
  init(){
    this.config=this.brain.data?.brain_coordinator?.brainCoordinator || {};
    const s=this.brain.state;
    s.coordinator ||= {cycle:0,lastPhases:[],lastDecision:null,lastConflict:null,lastTickAt:null};
    this.repairImpossibleWorkHistory();
    this.reconcileOnBoot();
    return this;
  }
  runUpdates(minutes){
    const b=this.brain, s=b.state, phases=[];
    const phase=(name,fn)=>{ try{ fn?.(); phases.push(name); }catch(e){ console.warn(`Coordinator phase ${name} failed`,e); } };
    // Порядок навмисний: тіло і світ раніше за інтерпретацію та плани.
    this.reconcileState();
    phase("body",()=>{ b.updateNeeds(minutes); b.health?.update?.(minutes); b.dreams?.update?.(minutes); });
    phase("environment",()=>{ b.naturalLife?.update?.(minutes); b.household?.update?.(minutes); b.accidents?.update?.(minutes); b.phone?.update?.(minutes); b.yaniLife?.update?.(minutes); b.yaniInteractions?.update?.(minutes); b.workLife?.ensureDay?.(); });
    phase("attention",()=>b.attention?.update?.(minutes));
    phase("emotion",()=>b.updateMood(minutes));
    phase("memory",()=>b.updateMemory(minutes));
    phase("self",()=>{ b.selfModel?.update?.(minutes); b.autobiographicalSelf?.update?.(minutes); b.internalStream?.update?.(minutes); });
    phase("goals",()=>{ b.intentions?.update?.(minutes); b.goalsPlanning?.update?.(minutes); });
    s.coordinator.cycle=(s.coordinator.cycle||0)+1; s.coordinator.lastPhases=phases; s.coordinator.lastTickAt=Date.now();
  }
  isCriticalHealthAction(action){
    const id=String(action?.actionId||"");
    return action?.category==="health" && /medicine|recover|sick|health|emergency/iu.test(id+" "+String(action?.reason||""));
  }
  isWorkAction(action){
    const id=action?.actionId||"";
    return action?.source==="work_life" || new Set(["work","consultCustomer","compareDevices","explainSpecs","makeSale","quietAtWork","workBreak","talkToKent","talkToTaras","talkToManager","talkToParents","talkToBrother","talkToYani"]).has(id);
  }
  clearHomeQueues(){
    const s=this.brain.state;
    if(s.dailyLife) s.dailyLife.queuedAction=null;
    if(s.food) s.food.pendingAction=null;
  }
  blockedBy(action){
    const b=this.brain, s=b.state, id=action?.actionId||"";
    if(!action) return "empty";
    if(id==="sleep" && b.naturalLife?.blockSleepAction?.()) return "temporary_insomnia";
    if(b.worldGeography?.actionAllowedHere && !b.worldGeography.actionAllowedHere(action)) return "wrong_location";
    if((s.activity==="sleeping" || s.action?.actionId==="sleep") && !["sleep","wakeUp"].includes(id)) return "sleeping";

    // v45.4 Reality Gate: під час реальної зміни домашні справи, сон, їжа,
    // дозвілля та випадкові цілі не можуть існувати паралельно з роботою.
    if(b.dailyLife?.isWorkTime?.()){
      if(this.isCriticalHealthAction(action)) return null;
      if(id==="commuteToWork") return s.world?.location==="home" ? null : "bad_commute_origin";
      // Коротка розмова з Яні телефоном/у повідомленнях не телепортує Акіру
      // додому і не скасовує зміну. Особиста розмова можлива лише коли Яні
      // справді фізично перебуває в TechSmith.
      if(id==="talkToYani"){
        if(s.world?.location!=="techsmith") return "not_at_work";
        if(["message","phoneCall"].includes(action.interactionChannel)) return null;
        if(action.interactionChannel==="inPerson" && b.social?.samePlaceWithYani?.()) return null;
        return "yani_not_present";
      }
      if(this.isWorkAction(action)) return s.world?.location==="techsmith" ? null : "not_at_work";
      return "work_shift";
    }
    return null;
  }
  timestampFallsInShift(ts){
    const d=new Date(Number(ts)||ts); if(Number.isNaN(d.getTime())) return false;
    const work=this.brain.data?.life_profile?.lifeProfile?.work||{};
    const days=work.days||[]; const day=d.toLocaleDateString("en-US",{weekday:"long"}).toLowerCase();
    const mins=d.getHours()*60+d.getMinutes();
    const parse=v=>{const m=String(v||"00:00").match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60 + +m[2]:0;};
    return days.includes(day) && mins>=parse(work.start||"10:00") && mins<parse(work.end||"16:00");
  }
  repairImpossibleWorkHistory(){
    const b=this.brain;
    const homeOnly=new Set(["moveRoom","cookMeal","eatMeal","prepareDrink","drinkSelected","washDishes","washFace","shave","changeClothes","takeBath","startLaundry","takeLaundryOut","hangLaundry","foldLaundry","wipeDust","vacuumRoom","mopFloor","washWindows","playGame","watchStreamer"]);
    if(Array.isArray(b.actionHistory)) b.actionHistory=b.actionHistory.filter(x=>!(homeOnly.has(x?.actionId) && this.timestampFallsInShift(x?.finishedAt||x?.startedAt)));
    if(Array.isArray(b.state?.food?.mealHistory)) b.state.food.mealHistory=b.state.food.mealHistory.filter(x=>!this.timestampFallsInShift(x?.at));
    if(Array.isArray(b.state?.food?.drinkHistory)) b.state.food.drinkHistory=b.state.food.drinkHistory.filter(x=>!this.timestampFallsInShift(x?.at));
  }
  reconcileOnBoot(){
    const b=this.brain,s=b.state;
    if(!b.dailyLife?.isWorkTime?.()) return;
    // Після reload/localStorage відновлюємо стан поточного дня, а не старий
    // домашній кадр. Це boot catch-up, не жива телепортація між тиками.
    if(s.world?.location==="home"){
      const old=s.action;
      this.clearHomeQueues();
      s.action=null; s.activity="working"; s.actionStartedAt=null; s.actionEndsAt=null;
      s.world.location="techsmith";
      if(s.dailyLife) s.dailyLife.homeRoom=null;
      s.coordinator ||= {};
      s.coordinator.lastRepair={at:Date.now(),type:"boot_work_catchup",cancelledAction:old?.actionId||null,location:"techsmith"};
    }
  }
  reconcileState(){
    const b=this.brain,s=b.state,a=s.action;
    const inShift=!!b.dailyLife?.isWorkTime?.();

    if(inShift){
      // Якщо суперечність виникла вже під час відкритої симуляції, не
      // телепортуємо. Скасовуємо неможливу домашню дію, а dailyLife нижче
      // створить нормальний commuteToWork.
      if(a && this.blockedBy(a)){
        s.coordinator ||= {};
        s.coordinator.lastRepair={at:Date.now(),type:"work_shift_cancel",actionId:a.actionId,location:s.world?.location};
        s.action=null; s.activity="idle"; s.actionStartedAt=null; s.actionEndsAt=null;
        this.clearHomeQueues();
        if(s.intentions?.current?.actionId===a.actionId) s.intentions.current=null;
      }
      if(s.world?.location==="techsmith" && s.dailyLife) s.dailyLife.homeRoom=null;
      return;
    }

    if(!a) return;
    const isWork=this.isWorkAction(a) || a.actionId==="commuteToWork";
    if(isWork && a.actionId!=="commuteHome" && !b.workLife?.inShift?.()){
      s.coordinator ||= {};
      s.coordinator.lastRepair={at:Date.now(),type:"invalid_work_action",actionId:a.actionId,time:s.world?.time,location:s.world?.location};
      s.action=null; s.activity="idle"; s.actionStartedAt=null; s.actionEndsAt=null;
      if(s.intentions?.current?.actionId===a.actionId) s.intentions.current=null;
    }
  }
  allowAction(action){ return !this.blockedBy(action); }
  recentCategoryPenalty(action){
    const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory.slice(-8):[]; const id=String(action?.actionId||'');
    const food=new Set(['cookMeal','eatMeal','prepareDrink','drinkSelected','travelToMassmarket','groceryShopping','returnHomeGroceries']);
    const recentFood=h.filter(x=>food.has(x?.actionId)).length, same=h.filter(x=>x?.actionId===id).length;
    return food.has(id)?recentFood*75+same*100:same*20;
  }
  yaniPriorityAction(){
    const b=this.brain,s=b.state; if(s.action||s.world?.location!=='home'||!b.yaniInteractions?.together?.()||s.yani?.sleeping)return null;
    const last=Number(s.yaniInteractions?.lastInteractionAt||0), simMin=(Date.now()-last)*Math.max(.01,b.config?.simulationSpeed||1)/1000;
    if(last&&simMin<45)return null; const recent=(b.actionHistory||[]).slice(-10).some(x=>x?.actionId==='talkToYani');
    if(Math.random()>(recent?.06:.18))return null;
    return {type:'action',actionId:'talkToYani',category:'social',duration:15+Math.floor(Math.random()*16),targetPerson:'Yani_Bakeneko',reason:'хочеться трохи побути й поговорити з Яні',score:620,factors:{relationship:620}};
  }
  collectPriorityActions(situation){
    // ВАЖЛИВО: getPriorityAction у старих модулів не є pure-функцією.
    // Тому не викликаємо всі джерела для "голосування": accidents/food/goals/leisure
    // можуть зняти pending або змінити plan уже самим викликом.
    const b=this.brain;
    const sources=[["health",b.health,1000],["accidents",b.accidents,950],["dailyLife",b.dailyLife,900],["workLife",b.workLife,850],["goalsPlanning",b.goalsPlanning,800],["intentions",b.intentions,700],["food",b.food,650],["yani",{getPriorityAction:()=>this.yaniPriorityAction()},620],["household",b.household,550],["leisure",b.leisure,520],["naturalLife",b.naturalLife,180]];
    const out=[];
    for(const [source,module,base] of sources){
      let action=null; try{ action=module?.getPriorityAction?.(situation)||null; }catch(e){ console.warn(`Priority source ${source} failed`,e); }
      if(!action) continue;
      const penalty=this.recentCategoryPenalty(action), effective=(Number(action.score)||base)-penalty; const blocked=this.blockedBy(action);
      if(!blocked && penalty>0 && effective<260) continue;
      out.push({source,base,score:effective,blocked,action}); if(!blocked) break;
    }
    return out;
  }
  chooseAction(situation){
    this.reconcileState();
    const s=this.brain.state, candidates=this.collectPriorityActions(situation);
    const chosen=candidates.find(x=>!x.blocked)||null;
    const action=chosen?.action || this.brain.decision?.decide?.(situation) || null;
    s.coordinator.lastConflict=candidates.length>1?{at:Date.now(),candidates:candidates.map(x=>({source:x.source,actionId:x.action?.actionId||null,score:x.score,blocked:x.blocked||null})),chosen:chosen?.source||"decision"}:null;
    s.coordinator.lastDecision={at:Date.now(),source:chosen?.source||"decision",actionId:action?.actionId||null,reason:action?.reason||null};
    return action;
  }
  onActionFinished(action){
    const s=this.brain.state; if(!s.coordinator) return;
    s.coordinator.lastCompleted={at:Date.now(),actionId:action?.actionId||null,category:action?.category||null};
  }
}
window.AkiraBrainCoordinator=AkiraBrainCoordinator;
