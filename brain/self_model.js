// self_model.js — внутрішня модель Акіри про власний поточний стан.
// Це модель самоспостереження для симуляції, а не твердження про свідомість.
class AkiraSelfModel {
  constructor(brain){ this.brain=brain; this.config={}; this.elapsed=0; }

  init(){
    this.config=this.brain.data?.self_model?.selfModel || {};
    const s=this.brain.state;
    s.selfModel ||= {};
    s.selfModel.identity ||= [...(this.config.identity?.core || [])];
    s.selfModel.current ||= {};
    s.selfModel.desires ||= [];
    s.selfModel.conflicts ||= [];
    s.selfModel.reflections ||= [];
    s.selfModel.lastReflectionAt ||= null;
    this.refresh(true);
    return this;
  }

  clamp(v){ return Math.max(0,Math.min(100,Number(v)||0)); }
  need(name,fallback=50){ return Number(this.brain.state?.needs?.[name] ?? fallback); }
  strongestEmotion(){
    const e=this.brain.state?.emotions || {};
    return Object.entries(e).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1]))[0] || ["calm",50];
  }

  buildDesires(){
    const s=this.brain.state, out=[];
    const add=(id,label,strength,reason)=>out.push({id,label,strength:this.clamp(strength),reason});
    const hunger=this.need("hunger",20), thirst=this.need("thirst",20), sleep=this.need("sleep",80), rest=this.need("rest",60);
    const social=this.need("social",45), fun=this.need("fun",55), privacy=this.need("privacy",55), achievement=this.need("achievement",50);
    if(hunger>35) add("eat","поїсти",hunger,`бо голод уже відчувається (${Math.round(hunger)}/100)`);
    if(thirst>35) add("drink","щось випити",thirst,`бо хочеться пити (${Math.round(thirst)}/100)`);
    if(sleep<55 || s.fatigue>45) add("sleep","відпочити або поспати",Math.max(100-sleep,s.fatigue),"бо накопичилася втома");
    if(rest<45) add("rest","трохи відпочити",100-rest,"бо давно не було нормального перепочинку");
    if(social<38) add("company","побути з кимось близьким",100-social,"бо бракує спілкування");
    if(privacy<35 || s.socialEnergy<30) add("alone","побути самому",Math.max(100-privacy,100-s.socialEnergy),"бо соціальної енергії мало");
    if(fun<38 || s.boredom>45) add("fun","зайнятися чимось приємним",Math.max(100-fun,s.boredom),"бо стає нудно");
    if(achievement<38) add("achievement","зробити щось корисне",100-achievement,"бо хочеться відчуття результату");
    const cur=this.brain.intentions?.getCurrentIntention?.();
    if(cur?.goal) add("currentGoal",cur.goal,72,cur.reason || "бо я вже цим займаюся");
    return out.sort((a,b)=>b.strength-a.strength).slice(0,6);
  }

  buildConflicts(desires){
    const s=this.brain.state, c=[];
    const by=id=>desires.find(x=>x.id===id);
    const alone=by("alone"), company=by("company"), rest=by("rest")||by("sleep"), goal=by("currentGoal");
    if(alone && company) c.push({between:[alone.id,company.id],strength:Math.min(alone.strength,company.strength),text:"Хочеться і спілкування, і щоб мене трохи залишили в спокої."});
    if(rest && goal && rest.strength>45) c.push({between:[rest.id,goal.id],strength:Math.min(rest.strength,goal.strength),text:"Хочу довести справу до кінця, але водночас уже хочеться відпочити."});
    if(s.world?.location==="techsmith" && s.fatigue>55) c.push({between:["work","rest"],strength:this.clamp(s.fatigue),text:"Треба працювати, хоча сил уже помітно менше."});
    return c.sort((a,b)=>b.strength-a.strength);
  }

  refresh(force=false){
    const s=this.brain.state;
    const [emotion,emotionValue]=this.strongestEmotion();
    const desires=this.buildDesires();
    const conflicts=this.buildConflicts(desires);
    s.selfModel.current={
      at:Date.now(), activity:s.activity, actionId:s.action?.actionId||null,
      location:s.world?.location||null, room:s.dailyLife?.homeRoom||null,
      energy:Math.round(Number(s.energy)||0), fatigue:Math.round(Number(s.fatigue)||0),
      socialEnergy:Math.round(Number(s.socialEnergy)||0), boredom:Math.round(Number(s.boredom)||0),
      dominantEmotion:emotion, dominantEmotionValue:Math.round(Number(emotionValue)||0),
      currentGoal:this.brain.intentions?.getGoal?.()||null,
      currentReason:this.brain.intentions?.getWhy?.()||null
    };
    s.selfModel.desires=desires;
    s.selfModel.conflicts=conflicts;
    return s.selfModel;
  }

  update(minutes){
    this.elapsed += Number(minutes)||0;
    this.refresh();
    const every=Number(this.config.reflectionIntervalMinutes)||20;
    if(this.elapsed<every) return;
    this.elapsed=0;
    this.reflect();
  }

  reflect(){
    const sm=this.refresh();
    const top=sm.desires?.[0];
    const conflict=sm.conflicts?.[0];
    const cur=sm.current||{};
    let text;
    if(conflict) text=conflict.text;
    else if(top) text=`Зараз найбільше хочеться ${top.label}, ${top.reason}.`;
    else if(cur.currentGoal) text=`Зараз тримаю в голові одне: ${cur.currentGoal}.`;
    else text="Зараз у мене немає якогось одного сильного бажання.";
    const item={at:Date.now(),date:this.brain.state.world?.date,time:this.brain.state.world?.time,text,desire:top?.id||null,conflict:conflict?.between||null};
    sm.reflections ||= [];
    const last=sm.reflections[sm.reflections.length-1];
    if(!last || last.text!==text) sm.reflections.push(item);
    sm.reflections=sm.reflections.slice(-(Number(this.config.historyLimit)||80));
    sm.lastReflectionAt=item.at;
    return item;
  }

  getPrimaryDesire(){ return this.refresh().desires?.[0]||null; }
  getPrimaryConflict(){ return this.refresh().conflicts?.[0]||null; }
  describeFeeling(){
    const sm=this.refresh(), c=sm.current, conflict=sm.conflicts?.[0];
    if(conflict) return conflict.text;
    if(c.fatigue>=65) return "Відчуваю, що сильно втомився. Через це зараз важче зосередитися.";
    if(c.socialEnergy<=25) return "Відчуваю, що трохи перевантажився людьми. Хочеться тиші.";
    const names={joy:"радісно",sadness:"сумно",anger:"злюся",fear:"тривожно",anxiety:"тривожно",calm:"спокійно",interest:"цікаво",boredom:"нуднувато",pleasure:"приємно"};
    const word=names[c.dominantEmotion]||"загалом нормально";
    return `Зараз мені ${word}. Енергії десь ${c.energy} зі 100, втома ${c.fatigue} зі 100.`;
  }
  describeWant(){
    const d=this.getPrimaryDesire();
    return d ? `Зараз найбільше хочу ${d.label}.` : "Зараз немає якогось одного сильного бажання.";
  }
  describeWhyWant(){
    const d=this.getPrimaryDesire();
    return d ? `Бо ${String(d.reason||"мені цього зараз хочеться").replace(/^бо\s+/iu,"")}.` : "Не знаю. Зараз немає одного конкретного бажання, яке треба пояснювати.";
  }
  describeSelf(){
    const cur=this.refresh().current;
    const goal=cur.currentGoal ? ` Зараз у мене в голові ще й ціль: ${cur.currentGoal}.` : "";
    return `Я Акіра. У мене є свої справи, бажання й межі. Зараз я ${this.brain.state.activity||"чимось зайнятий"}.${goal}`;
  }
  describeThought(){
    const conflict=this.getPrimaryConflict();
    if(conflict) return conflict.text;
    const d=this.getPrimaryDesire();
    if(d) return `Думаю про те, що зараз хочеться ${d.label}.`;
    const r=this.brain.state.selfModel?.reflections?.slice(-1)[0];
    return r?.text || "Та думаю про всяке. Нічого одного зараз не крутиться в голові.";
  }
}
window.AkiraSelfModel=AkiraSelfModel;
