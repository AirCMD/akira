// emotional_expression.js — v41.1
// Перетворює вже сформований зміст відповіді на емоційно забарвлену форму.
// Не створює нових фактів і не змінює відповідь на протилежну.
class AkiraEmotionalExpression {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.emotional_expression || {};
    if(!this.brain.state.emotionalExpression) this.brain.state.emotionalExpression={lastStyle:"neutral",lastIntensity:0,lastAt:0};
    return this;
  }
  n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
  values(){ return this.brain.state?.emotions || {}; }
  relationship(profile){ return profile?.relationship || {}; }
  reactToInput(analysis){
    if(!analysis || !this.brain.mood) return;
    const t=String(analysis.normalized||"");
    if(analysis.sentiment==="positive") this.brain.mood.trigger?.("positiveInteraction");
    const insult=/(дурень|ідіот|дебіл|тупий|мудак|довбойоб|уйоб)/u.test(t);
    const rude=/(відвали|заткнись|пішов нах|пішов на х)/u.test(t);
    if(insult) this.brain.mood.trigger?.("insult");
    else if(rude) this.brain.mood.trigger?.("rudeBehavior");
  }
  profile(dialogueProfile={}){
    const e=this.values();
    const fatigue=this.n(this.brain.state?.fatigue,20);
    const social=this.n(this.brain.state?.socialEnergy,60);
    const rel=this.relationship(dialogueProfile);
    const affection=Math.max(this.n(rel.affection),this.n(e.affection));
    const closeness=this.n(rel.closeness);
    const irritation=Math.max(this.n(e.anger),this.n(e.offense),this.n(e.disgust));
    const sadness=Math.max(this.n(e.sadness),this.n(e.disappointment),this.n(e.loneliness));
    const anxiety=Math.max(this.n(e.anxiety),this.n(e.fear));
    const joy=Math.max(this.n(e.joy),this.n(e.pleasure));
    const curiosity=Math.max(this.n(e.curiosity),this.n(e.interest));
    const calm=this.n(e.calm);
    let style="neutral", intensity=0;
    const candidates=[
      ["tired",Math.max(fatigue,100-social)], ["irritated",irritation], ["sad",sadness],
      ["anxious",anxiety], ["joyful",joy], ["curious",curiosity], ["calm",calm]
    ].sort((a,b)=>b[1]-a[1]);
    if(candidates[0][1]>=45){ [style,intensity]=candidates[0]; }
    const warm=(affection>=65 || closeness>=70) && irritation<60;
    return {style,intensity,warm,fatigue,social,joy,irritation,sadness,anxiety,curiosity,calm,affection,closeness};
  }
  pick(arr){ return Array.isArray(arr)&&arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; }
  protectedIntent(intent){ return (this.data.protectedIntents||[]).includes(intent); }
  shorten(text, maxSentences=1){
    const parts=String(text).match(/[^.!?]+[.!?]?/g)||[String(text)];
    return parts.slice(0,maxSentences).join(" ").trim();
  }
  apply(text, dialogueProfile={}){
    let out=String(text||"").trim(); if(!out) return out;
    const p=this.profile(dialogueProfile); const intent=dialogueProfile?.analysis?.intent;
    const factualIntents=new Set(["ask_current_time","check_day_period","ask_current_month","check_season","check_weekday","check_workday","ask_need_work_today","ask_is_home","ask_current_location","ask_home_room","ask_why_there","ask_activity","ask_activity_at_location","ask_recent_activity","ask_action_reason","ask_action_next","ask_date","ask_holiday","ask_yani_identity","ask_yani_species","greeting","greeting_mismatch","time_greeting"]);
    const isFallback=/не зовсім зрозумів|втратив нитку|можливо, я щось упускаю|треба було б розібратися детальніше|мм, цікаво/i.test(out);
    const semanticFact = /^(ask_(work|yani|akira|family|parents|has_brother|lives_with|dream|food|hungry|money|recent_purchase|inventory|hour_ago|people_today|recent_conversation|recent_good|current|past|future|history|self|angry|irritation|glad|plan|unfinished|metacognition)|claim_)/.test(String(intent||""));
    const timeCorrection=/зараз\s+\d{1,2}:\d{2}|якщо це ранок|це вже не ранок/iu.test(out);
    const isBoundary=this.protectedIntent(intent) || factualIntents.has(intent) || semanticFact || isFallback || timeCorrection || /це особисте|не хочу (говорити|відповідати|обговорювати)/iu.test(out);
    // Втома і соціальне виснаження змінюють насамперед кількість інформації.
    if(!isBoundary && (p.fatigue>=82 || p.social<=18) && out.split(/\s+/).length>18) out=this.shorten(out,1);
    // Сильне роздратування робить довгі відповіді прямішими, не змінюючи фактів.
    if(!isBoundary && p.irritation>=72 && out.split(/\s+/).length>24) out=this.shorten(out,2);
    let prefix=null, suffix=null;
    const styles=this.data.styles||{};
    // Не приклеюємо емоційну приписку до кожної репліки: стан має відчуватися, а не кричати про себе.
    if(!isBoundary){
      if(p.style==="tired" && p.intensity>=72 && Math.random()<0.55) prefix=this.pick(styles.tired);
      else if(p.style==="irritated" && p.intensity>=65 && Math.random()<0.62) prefix=this.pick(styles.irritated);
      else if(p.style==="sad" && p.intensity>=65 && Math.random()<0.42) suffix=this.pick(styles.sad);
      else if(p.style==="anxious" && p.intensity>=68 && Math.random()<0.38) prefix=this.pick(styles.anxious);
      else if(p.style==="joyful" && p.intensity>=70 && p.social>=45 && Math.random()<0.34) suffix=this.pick(styles.joyful);
      else if(p.style==="curious" && p.intensity>=75 && dialogueProfile?.interest?.interest>=55 && Math.random()<0.28) suffix=this.pick(styles.curious);
      if(p.warm && p.social>=35 && Math.random()<0.18 && !suffix) suffix=this.pick(styles.warm);
    }
    if(prefix) out=`${prefix} ${out}`;
    if(suffix) out=`${out} ${suffix}`;
    this.brain.state.emotionalExpression={lastStyle:p.style,lastIntensity:Math.round(p.intensity),lastAt:Date.now()};
    return out.replace(/\s+/g," ").trim();
  }
}
window.AkiraEmotionalExpression=AkiraEmotionalExpression;
