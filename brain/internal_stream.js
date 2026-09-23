// internal_stream.js — приватний короткий потік станів уваги та метакогніція.
// Зберігає компактні семантичні маркери, а не прихований покроковий chain-of-thought.
class AkiraInternalStream {
  constructor(brain){ this.brain=brain; this.config={}; this.elapsed=0; this.lastActionId=null; this.lastEmotion=null; }
  init(){
    this.config=this.brain.data?.internal_stream?.internalStream||{};
    const s=this.brain.state;
    s.internalStream ||= {current:null,history:[],meta:{},lastAt:null};
    s.internalStream.history ||= []; s.internalStream.meta ||= {};
    this.lastActionId=s.action?.actionId||null;
    this.lastEmotion=this.strongestEmotion()[0];
    return this;
  }
  now(){ return Date.now(); }
  strongestEmotion(){
    const e=this.brain.state?.emotions||{};
    return Object.entries(e).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1]))[0]||["calm",50];
  }
  snapshot(trigger="periodic"){
    const s=this.brain.state, sm=this.brain.selfModel?.refresh?.()||s.selfModel||{};
    const desire=sm.desires?.[0]||null, conflict=sm.conflicts?.[0]||null;
    const [emotion,emotionValue]=this.strongestEmotion();
    const intention=this.brain.intentions?.getCurrentIntention?.()||null;
    const recentMemory=this.pickAssociation();
    let focus="current_state", subject=null, summary="";
    if(conflict){ focus="conflict"; subject=conflict.between?.join("+")||null; summary=conflict.text; }
    else if(intention?.goal){ focus="goal"; subject=intention.actionId||null; summary=`Тримаю в голові ціль: ${intention.goal}.`; }
    else if(desire){ focus="desire"; subject=desire.id; summary=`Зараз помітне бажання: ${desire.label}.`; }
    else if(recentMemory){ focus="association"; subject=recentMemory.type||recentMemory.actionId||"memory"; summary="Щось із недавнього досвіду знову привернуло увагу."; }
    else { summary=`Зараз увага переважно на ${s.activity||"поточному моменті"}.`; }
    const item={at:this.now(),date:s.world?.date,time:s.world?.time,trigger,focus,subject,summary,
      actionId:s.action?.actionId||null,location:s.world?.location||null,room:s.dailyLife?.homeRoom||null,
      emotion,emotionValue:Math.round(Number(emotionValue)||0),desireId:desire?.id||null,
      conflict:conflict?.between||null,memoryId:recentMemory?.id||null};
    this.push(item); this.metacognitiveCheck(item,sm); return item;
  }
  pickAssociation(){
    if(Math.random()>Number(this.config.associationChance??0.28)) return null;
    const episodes=this.brain.state?.memory?.episodes||this.brain.memory?.episodes||[];
    if(!Array.isArray(episodes)||!episodes.length) return null;
    const pool=episodes.slice(-12); return pool[Math.floor(Math.random()*pool.length)]||null;
  }
  push(item){
    const st=this.brain.state.internalStream, last=st.history[st.history.length-1];
    st.current=item; st.lastAt=item.at;
    if(!last || last.summary!==item.summary || last.trigger!==item.trigger) st.history.push(item);
    st.history=st.history.slice(-(Number(this.config.historyLimit)||120));
  }
  metacognitiveCheck(item,sm){
    const s=this.brain.state, meta=s.internalStream.meta;
    const conflict=sm.conflicts?.[0];
    const fatigue=Number(s.fatigue||0);
    meta.lastCheckAt=this.now(); meta.reconsidering=false; meta.reason=null;
    if(conflict && Number(conflict.strength||0)>=Number(this.config.reconsiderConflictAbove||62)){
      meta.reconsidering=true; meta.reason="внутрішній конфлікт став сильним";
    } else if(s.action && fatigue>=Number(this.config.reconsiderFatigueAbove||72) && !["sleep","rest"].includes(s.action.actionId)){
      meta.reconsidering=true; meta.reason="втома стала сильнішою за бажання продовжувати";
    }
    // v41 лише позначає переоцінку. Реальне перепланування належить v42.
    meta.currentGoal=this.brain.intentions?.getGoal?.()||null;
    meta.currentAction=s.action?.actionId||null;
  }
  update(minutes){
    this.elapsed+=Number(minutes)||0;
    const actionId=this.brain.state.action?.actionId||null;
    const [emotion]=this.strongestEmotion();
    if(actionId!==this.lastActionId){ this.lastActionId=actionId; this.snapshot("action_change"); this.elapsed=0; return; }
    if(emotion!==this.lastEmotion){ this.lastEmotion=emotion; this.snapshot("emotion_shift"); this.elapsed=0; return; }
    if(this.elapsed>=Number(this.config.thoughtIntervalMinutes||12)){ this.elapsed=0; this.snapshot("periodic"); }
  }
  onActionFinished(action){ if(action) this.snapshot("action_finished"); }
  publicThought(){
    const s=this.brain.state, sm=this.brain.selfModel?.refresh?.()||s.selfModel||{};
    const conflict=sm.conflicts?.[0]; if(conflict) return conflict.text;
    const meta=s.internalStream?.meta||{};
    if(meta.reconsidering && meta.reason) return `Зараз думаю, чи варто продовжувати як задумав. ${meta.reason.charAt(0).toUpperCase()+meta.reason.slice(1)}.`;
    const d=sm.desires?.[0]; if(d) return `Зараз найбільше крутиться в голові те, що хочеться ${d.label}.`;
    const cur=s.internalStream?.current;
    if(cur?.focus==="goal" && cur.summary) return cur.summary;
    return "Та різне. Зараз немає однієї думки, яка перекриває все інше.";
  }
  describeMetacognition(){
    const meta=this.brain.state.internalStream?.meta||{};
    if(meta.reconsidering) return `Так, зараз трохи переоцінюю те, що роблю: ${meta.reason}.`;
    const conflict=this.brain.selfModel?.getPrimaryConflict?.();
    if(conflict) return `Помічаю, що мене тягне в різні боки. ${conflict.text}`;
    return "Зараз ніби все узгоджується: я розумію, чого хочу і навіщо роблю поточну справу.";
  }
}
window.AkiraInternalStream=AkiraInternalStream;
