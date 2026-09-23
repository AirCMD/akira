// dreams.js — Sleep & Dream System (v40.3)
// Сновидіння є суб'єктивними переживаннями. Містичні інтерпретації не стають фактами світу.
class AkiraDreams {
  constructor(brain){ this.brain=brain; this.activeSleep=null; }
  init(){
    const s=this.brain.state;
    s.dreams=s.dreams||{};
    Object.assign(s.dreams,{history:s.dreams.history||[],lastDream:s.dreams.lastDream||null,lastSleepDreamAt:s.dreams.lastSleepDreamAt||null,currentStage:s.dreams.currentStage||null,lastTopic:s.dreams.lastTopic||null});
    return this;
  }
  cfg(){ return this.brain.data?.dreams?.dreams||{}; }
  pick(a){ return a?.length?a[Math.floor(Math.random()*a.length)]:null; }
  cap(s){ return s?s.charAt(0).toUpperCase()+s.slice(1):s; }
  update(minutes){
    const a=this.brain.state.action;
    if(a?.actionId!=="sleep"){ this.brain.state.dreams.currentStage=null; return; }
    if(!this.activeSleep||this.activeSleep.actionStartedAt!==a.startedAt) this.activeSleep={actionStartedAt:a.startedAt||Date.now(),minutes:0,date:this.brain.state.world?.date||null,stages:[]};
    this.activeSleep.minutes+=Math.max(0,Number(minutes)||0);
    const stage=this.stageAt(this.activeSleep.minutes);
    this.brain.state.dreams.currentStage=stage;
    if(this.activeSleep.stages.at(-1)!==stage) this.activeSleep.stages.push(stage);
  }
  stageAt(total){
    const cycle=((Math.max(0,total)-1)%(this.cfg().cycleMinutes||90)+1);
    return (this.cfg().stages||[]).find(x=>cycle>=x.from&&cycle<x.to)?.id||"N2";
  }
  completeAction(action){
    if(action?.actionId!=="sleep") return;
    const minutes=this.activeSleep?.minutes||this.estimateMinutes(action);
    const stages=this.activeSleep?.stages||[];
    this.activeSleep=null; this.brain.state.dreams.currentStage=null;
    this.maybeCreateDream(minutes,stages);
  }
  estimateMinutes(a){ const ms=(+a?.endsAt||0)-(+a?.startedAt||0); return ms>0?ms/1000*(this.brain.config?.simulationSpeed||1):0; }
  maybeCreateDream(minutes,stages=[]){
    const c=this.cfg(); if(c.enabled===false||minutes<(c.minimumSleepMinutes??45)) return null;
    const chance=Math.min(.95,(c.baseChance??.5)+(minutes>=300?(c.longSleepBonus??.28):0));
    if(Math.random()>chance){ this.brain.state.dreams.lastSleepDreamAt=Date.now(); return null; }
    const dream=this.generateDream(minutes,stages);
    dream.remembered=Math.random()<(c.rememberChance??.7);
    dream.fragment=dream.remembered&&Math.random()<(c.fragmentChance??.2);
    const d=this.brain.state.dreams; d.lastSleepDreamAt=Date.now(); d.history.push(dream);
    if(d.history.length>(c.maxHistory??50)) d.history.splice(0,d.history.length-(c.maxHistory??50));
    if(dream.remembered) d.lastDream=dream;
    this.storeAsDreamMemory(dream); return dream;
  }
  generateDream(minutes,stages){
    const memories=(this.brain.memory?.memories||[]).filter(m=>m.type!=="dream"&&m.source!=="dream"&&(m.content||m.location||m.people?.length)).slice(-100);
    const first=this.pick(memories), second=this.pick(memories.filter(x=>x.id!==first?.id));
    const people=[...(first?.people||[]),...(second?.people||[])].filter(Boolean); const person=this.pick([...new Set(people)]);
    const location=first?.location||second?.location||this.brain.state.world?.location||"home";
    const transform=this.pick(this.cfg().transformations)||"усе було трохи не таким, як мало бути";
    const phenomenon=this.rollPhenomenon(minutes);
    const sensory=this.makeSensoryProfile();
    const text=this.composeDreamText({person,location,transform,phenomenon,sensory});
    return {id:`dream_${Date.now()}_${Math.floor(Math.random()*10000)}`,createdAt:Date.now(),worldDate:this.brain.state.world?.date||null,worldTime:this.brain.state.world?.time||null,sleepMinutes:Math.round(minutes),stages,phenomenon,sensory,person:person||null,location,sourceMemoryIds:[first?.id,second?.id].filter(Boolean),text};
  }
  rollPhenomenon(minutes){
    const p=this.cfg().phenomena||{}; const pool=[];
    for(const [id,chance] of Object.entries(p)) if(Math.random()<chance) pool.push(id);
    // Рідкісні феномени не нашаровуємо цирковою купою в одну ніч.
    return this.pick(pool)||"ordinary";
  }
  makeSensoryProfile(){
    const r=()=>Math.round(Math.random()*100)/100;
    return {visual:.45+.55*r(),auditory:.15+.7*r(),kinesthetic:.1+.75*r(),olfactory:.03+.4*r(),gustatory:.02+.25*r(),spatial:.2+.75*r(),conceptual:.1+.7*r()};
  }
  composeDreamText({person,location,transform,phenomenon}){
    const who=person?(String(person).toLowerCase().includes("yani")?"Яні":String(person)):null;
    const place=location==="home"?"вдома":location==="techsmith"?"на роботі":location==="city"?"десь у місті":null;
    const special={
      nightmare:"Було тривожно, і сон поступово став схожим на жах.",
      lucid:"У якийсь момент я зрозумів, що сплю, і спробував трохи змінити те, що відбувалося.",
      falseAwakening:"Мені навіть здалося, що я вже прокинувся, але це теж виявилося частиною сну.",
      sleepParalysis:"На межі пробудження було відчуття, ніби я вже прокинувся, але кілька митей не можу поворухнутися.",
      obeLike:"Було дивне відчуття, ніби я спостерігаю за собою й кімнатою не зі звичного місця.",
      recurring:"Частина сну здавалася знайомою, наче я вже бачив щось подібне раніше.",
      hypnagogic:"Перед самим сном миготіли короткі дивні образи, а потім вони перейшли в сюжет.",
      hypnopompic:"Під час пробудження уривок сну ще кілька секунд накладався на кімнату."
    }[phenomenon]||"";
    let base=who&&place?`Снилося щось дивне: я був ${place}, поруч була ${who}, але ${transform}.`:who?`Пам'ятаю сон із ${who}: ${transform}.`:place?`Наснилося, що я був ${place}, але ${transform}.`:`Сон був дивний: ${transform}.`;
    return `${base}${special?" "+special:""} Деталі вже трохи розсипаються.`;
  }
  storeAsDreamMemory(dream){
    this.brain.memory?.remember?.({type:"dream",source:"dream",title:"Сновидіння",content:dream.text,worldDate:dream.worldDate,worldTime:dream.worldTime,people:dream.person?[dream.person]:[],location:dream.location,importance:dream.remembered?32:10,strength:dream.remembered?36:12,vividness:dream.remembered?44:14,forgettable:true,keywords:["сон","сновидіння",dream.phenomenon],metadata:{isDream:true,reality:false,remembered:dream.remembered,fragment:dream.fragment,phenomenon:dream.phenomenon,sensory:dream.sensory,sourceMemoryIds:dream.sourceMemoryIds}});
  }
  lastRememberedDream(){ return [...(this.brain.state.dreams?.history||[])].reverse().find(x=>x.remembered)||null; }
  answerLastDream(){ const d=this.lastRememberedDream(); if(!d)return "Не пам'ятаю останнього сну. Може, щось і снилося, але після пробудження нічого не лишилося."; return d.fragment?`Уривками. ${d.text}`:d.text; }
  answerDreamingGenerally(){ return this.pick(["Сни іноді бачу. Частину пам'ятаю після пробудження, частина зникає майже одразу.","Так. Але вони дуже нерівні: іноді цілий сюжет, а іноді після пробудження лишається одне відчуття."]); }
  setTopic(t){ this.brain.state.dreams.lastTopic=t; return t; }
  answerTopic(topic){
    this.setTopic(topic);
    const d=this.lastRememberedDream(); const had=id=>[...(this.brain.state.dreams?.history||[])].reverse().find(x=>x.remembered&&x.phenomenon===id);
    const variants={
      stages:["Сон не однаковий усю ніч. Є N1, N2, глибший N3 і REM, і вони повторюються циклами. Я б не ділив усе просто на «глибокий» і «неглибокий».","Умовно: N1 — засинання, N2 — легший стабільний сон, N3 — глибокий повільнохвильовий, REM — фаза з дуже активною роботою мозку й частими яскравими снами. За ніч це повторюється кілька разів."],
      lucid:[had("lucid")?`Було. ${had("lucid").text}`:"Знаю це відчуття як ідею: усередині сну раптом розумієш, що спиш. У мене поки немає чіткого спогаду про такий епізод.","Усвідомлений сон для мене цікавий саме моментом, коли розумієш: це сон. Але усвідомлення ще не означає повний контроль над усім сюжетом."],
      paralysis:[had("sleepParalysis")?`Було щось схоже. ${had("sleepParalysis").text}`:"Сонного паралічу в моїх спогадах поки не було. Це стан на межі сну й пробудження, коли свідомість уже повернулася, а рух довільних м'язів ще на короткий час пригнічений.","Моторошна штука через саме відчуття безпорадності. А образи чи відчуття присутності в такому стані я б не сприймав як доказ чогось надприродного."],
      obe:[had("obeLike")?`Було переживання, схоже на це. ${had("obeLike").text}`:"Можу обговорювати «астральні подорожі», але я б називав це позатілесним або OBE-подібним переживанням. Суб'єктивне відчуття може бути дуже переконливим, але саме по собі не доводить, що людина буквально залишила тіло."],
      dreambooks:["Я б не став трактувати сни за сонниками. У сон легко потрапляє те, що ми бачили, думали й переживали протягом дня. Якщо потім шукати передбачення, мозок чіплятиметься за збіги, а незбіги легко забуваються.","Не дуже вірю в сонники. Якщо довго чекати збігів, якийсь обов'язково знайдеться. А коли їх немає, лишається тільки розчарування в черговому трактуванні."],
      shared:["Ідея спільних снів цікава, але схожі сни ще не доводять, що двоє буквально були в одному сні. Спільні події, розмови й очікування можуть дати дуже схожий матеріал.","Якби нам із Яні наснився однаковий сюжет, я б точно здивувався. Але спочатку перевірив би, чи не говорили ми напередодні про те саме."],
      perception:["Про «візуалів, аудіалів, кінестетиків і дигіталів» я знаю, але не люблю робити з цього жорсткі типи людей. У самих снах інша справа: один сон може бути майже весь картинкою, інший — звуком, рухом, запахом або просто відчуттям, що ти щось знаєш.","Ольфакторні сни теж можливі: іноді в сні запам'ятовується запах. Але це не означає, що людину треба назавжди записувати в окремий «тип сприйняття»."],
      apnea:["Апное — це вже не містика снів, а тема дихання під час сну. Наскільки знаю, при ньому дихання повторно зупиняється або сильно порушується. У себе такого я не помічав, та й сам собі надійно це не діагностуєш.","Якщо людина голосно хропе, має помітні паузи дихання уві сні або постійно прокидається розбитою, це вже не тема для сонника. Такі речі варто обговорювати з лікарем."],
      sleepwalking:["Лунатизму в мене немає. Наскільки знаю, це не «людина розігрує свій сон», а окреме явище сну, коли вона може вставати й щось робити, не прокинувшись нормально.","Ні, уві сні квартирою не ходжу. І добре. Мені вистачає шукати речі, коли я не сплю."],
      nightmare:[had("nightmare")?`Жах мені вже траплявся. ${had("nightmare").text}`:"Жахи можливі, але зараз не пригадую свого конкретного. Мені цікавіше, чому мозок узяв саме такі образи, ніж шукати в них пророцтво."],
      falseAwakening:[had("falseAwakening")?`Було. ${had("falseAwakening").text}`:"Хибне пробудження — це коли тобі сниться, що ти вже прокинувся. А потім прокидаєшся насправді й кілька секунд перевіряєш реальність із дуже розумним обличчям."],
      hypnagogia:["На межі засинання або пробудження можуть бути короткі образи, звуки чи дивні відчуття. Для мене це цікава сіра зона між неспанням і повним сном.","Гіпнагогічне — це ближче до засинання, гіпнопомпічне — до пробудження. Вони можуть бути дуже реалістичними, хоча людина ще або вже не перебуває у звичайному сні."],
      recurring:[had("recurring")?`Щось схоже вже повторювалося. ${had("recurring").text}`:"Повторювані сни мені цікаві тим, що мозок може знову збирати знайомий сюжет. Але я б не шукав у повторенні обов'язкове приховане послання."],
      forgetting:["Сни дуже легко розсипаються після пробудження. Іноді пам'ятаєш цілу сцену, відволікся на кілька хвилин — і залишився тільки настрій.","Я не вважаю дивним забути сон. Пам'ять про нього часто нестійка, особливо якщо одразу переключитися на щось інше."],
      general:["Про сон можна довго говорити: фази, жахи, усвідомлені сни, параліч, хибні пробудження, повторювані сюжети, дивні образи на межі засинання. Там вистачає дивного й без додавання магії."]
    };
    return this.pick(variants[topic]||variants.general);
  }
}
window.AkiraDreams=AkiraDreams;
