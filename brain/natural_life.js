// natural_life.js — v46.1 Natural Idle + Activity Follow-up Context
class AkiraNaturalLife {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.natural_life?.naturalLife||{};
    const s=this.brain.state;
    s.naturalLife ||= {idle:null, windowScene:null, sleep:{date:null,insomnia:false,earlyWake:false,failedReturn:false}};
    s.naturalLife.sleep ||= {date:null,insomnia:false,earlyWake:false,failedReturn:false};
    this.ensureSleepDay();
    return this;
  }
  dateKey(d=new Date()){ return this.brain.calendar?.localDate?.(d)||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  ensureSleepDay(){
    const s=this.brain.state.naturalLife.sleep, key=this.dateKey();
    if(s.date===key) return s;
    const cfg=this.data.sleepIrregularities||{};
    s.date=key; s.insomnia=Math.random()<Number(cfg.insomniaChance||0.035); s.earlyWake=Math.random()<Number(cfg.earlyWakeChance||0.045);
    s.failedReturn=s.earlyWake && Math.random()<Number(cfg.failedReturnChance||0.45);
    s.earlyWakeHour=s.earlyWake ? 4.5+Math.random()*2 : null;
    s.insomniaUntil=s.insomnia ? 0.5+Math.random()*2 : null;
    s.earlyWakeHandled=false;
    return s;
  }
  blockSleepAction(){
    const s=this.ensureSleepDay(), now=new Date(), h=now.getHours()+now.getMinutes()/60;
    return !!(s.insomnia && (h<3) && h<s.insomniaUntil);
  }
  update(){
    const s=this.ensureSleepDay(), a=this.brain.state?.action, now=new Date(), h=now.getHours()+now.getMinutes()/60;
    if(a?.actionId==='sleep' && s.earlyWake && !s.earlyWakeHandled && h>=s.earlyWakeHour && h<8){
      s.earlyWakeHandled=true;
      s.wokeAt=Date.now();
      if(s.failedReturn){
        // Природне раннє пробудження: завершуємо сон раніше, але не вигадуємо причину.
        this.brain.finishAction?.();
        this.brain.state.activity='idle';
        this.brain.state.naturalLife.idle={kind:'awakeEarly',since:Date.now()};
      }
    }
  }
  seasonPhase(d=new Date()){
    const m=d.getMonth()+1, day=d.getDate();
    if(m===12||m<=2){ if(m===12&&day<15) return 'earlyWinter'; if(m===2&&day>15) return 'lateWinter'; return 'deepWinter'; }
    if(m>=3&&m<=5){ if(m===3||(m===4&&day<10)) return 'earlySpring'; if(m===5&&day>10) return 'lateSpring'; return 'midSpring'; }
    if(m>=6&&m<=8){ if(m===6&&day<20) return 'earlySummer'; if(m===8&&day>10) return 'lateSummer'; return 'highSummer'; }
    if(m===9&&day<18) return 'earlyAutumn'; if(m===11&&day>5) return 'lateAutumn'; return 'midAutumn';
  }
  sunTimes(d=new Date()){
    // Demo: помірна широта. Нам потрібна стабільна побутова сцена, а не астрономічний альманах.
    const m=d.getMonth()+1;
    const table={1:[7.8,16.4],2:[7.2,17.2],3:[6.2,18.1],4:[5.2,19.0],5:[4.4,19.8],6:[4.0,20.3],7:[4.2,20.1],8:[4.8,19.3],9:[5.6,18.2],10:[6.4,17.1],11:[7.2,16.3],12:[7.8,16.0]};
    return table[m]||[6,18];
  }
  dayLightPhase(d=new Date()){
    const h=d.getHours()+d.getMinutes()/60,[rise,set]=this.sunTimes(d);
    if(h<rise-0.55) return 'night'; if(h<rise+0.55) return 'dawn'; if(h<set-0.7) return 'day'; if(h<set+0.5) return 'sunset'; return 'night';
  }
  vegetationText(phase){
    const map={
      earlySpring:'Дерева ще майже голі, подекуди видно залишки торішнього листя і бруд після зими.',
      midSpring:'На деревах уже розпускається свіжа зелень, місцями щось цвіте.',
      lateSpring:'Дерева вже добре вкрилися молодим зеленим листям.',
      earlySummer:'Усе густо зелене, листя ще свіже після весни.',
      highSummer:'Дерева густо зелені, двір виглядає зовсім по-літньому.',
      lateSummer:'Зелені ще багато, але трава й частина листя вже виглядають трохи сухішими.',
      earlyAutumn:'Листя ще переважно зелене, але вже починає жовтіти.',
      midAutumn:'Листя пожовтіло, частина стала помаранчевою, а опале вже лежить на асфальті.',
      lateAutumn:'Дерева вже майже голі, мокре темне листя лежить уздовж дороги й у дворі.',
      earlyWinter:'Дерева голі. Зима вже відчувається, хоча сніг ще не обов’язково лежить постійно.',
      deepWinter:'Дерева голі, усе виглядає по-зимовому.',
      lateWinter:'Дерева ще голі, а зима вже виглядає трохи втомленою.'
    }; return map[phase]||'';
  }
  weatherText(w){
    const c=w?.condition||'cloudy';
    if(c==='clear') return 'Небо чисте.';
    if(c==='partlyCloudy') return 'У небі є хмари, але між ними видно чисті ділянки.';
    if(c==='cloudy'||c==='overcast') return 'Небо сіре й хмарне.';
    if(c==='lightRain') return 'Небо сіре, трохи дощить, асфальт мокрий.';
    if(c==='rain'||c==='heavyRain') return 'Сіре хмарне небо, дощить, асфальт мокрий.';
    if(c==='thunderstorm') return 'Небо темне, грозове, дощить.';
    if(['lightSnow','snow','heavySnow'].includes(c)) return 'Йде сніг.';
    if(c==='fog') return 'Надворі туманно, далекі будинки видно гірше.';
    return '';
  }
  skyText(phase,w){
    const bad=['overcast','cloudy','lightRain','rain','heavyRain','thunderstorm','fog'].includes(w?.condition);
    if(phase==='dawn') return bad?'Світанок сьогодні сірий, без особливих кольорів.':'Світанок, небо місцями рожево-помаранчеве.';
    if(phase==='sunset') return bad?'Сонце сідає десь за хмарами, яскравого заходу сьогодні немає.':'Небо на заході тепле, помаранчево-рожеве.';
    if(phase==='night') return 'Надворі темно, у частині вікон навпроти світиться світло.';
    return '';
  }
  cityText(phase){
    if(phase==='dawn') return 'Місто ще тільки прокидається, людей і машин небагато.';
    if(phase==='night') return 'На дорозі ще трапляються машини, але людей значно менше.';
    return 'На дорозі їздять машини, час від часу проходять люди.';
  }
  snowGround(w,phase){
    const depth=Number(w?.snow?.depth||0);
    if(depth>0 && w?.snow?.melting) return 'Сніг лежить клаптями й тане, біля дороги вже брудна каша.';
    if(depth>0) return `Сніг лежить на землі й дахах${depth>4?', його вже помітно насипало':''}.`;
    if(['deepWinter','lateWinter','earlyWinter'].includes(phase) && Number(w?.temperature)>0) return 'Снігу майже немає, зимовий асфальт виглядає мокрим і бруднуватим.';
    return '';
  }
  describeWindow(){
    const now=new Date(), phase=this.seasonPhase(now), light=this.dayLightPhase(now), w=this.brain.state?.world?.weather||{};
    const parts=[this.skyText(light,w),this.weatherText(w),this.vegetationText(phase),this.snowGround(w,phase),this.cityText(light)].filter(Boolean);
    const unpleasant=['overcast','rain','heavyRain','lightRain'].includes(w.condition) && ['midAutumn','lateAutumn'].includes(phase);
    if(unpleasant) parts.push('Не дуже приємний вид.');
    const sl=this.brain.state?.naturalLife?.sleep;
    if(light==='dawn' && sl?.earlyWakeHandled && sl?.failedReturn) parts.push('Я сьогодні раніше прокинувся і вже не зміг заснути.');
    const text=parts.join(' ');
    this.brain.state.naturalLife.windowScene={date:this.dateKey(now),at:Date.now(),phase,light,condition:w.condition||null,text};
    return text;
  }
  chooseThinkingTopic(){
    const s=this.brain.state||{}, now=new Date();
    const hour=now.getHours();
    const pool=[];
    const action=s.action;
    if(action?.reason) pool.push({id:'recentAction',answer:`Та про те, чим зараз займаюся. ${String(action.reason).replace(/^./,c=>c.toUpperCase())}.`});
    if(hour>=17) pool.push({id:'evening',answer:'Та думаю, що ще робитиму сьогодні ввечері.'});
    if(hour<10) pool.push({id:'dayAhead',answer:'Та про сьогоднішній день. Що треба буде зробити і як усе складеться.'});
    if(s.world?.location==='home') {
      pool.push({id:'home',answer:'Та ні про що надзвичайне. Про домашні справи трохи думаю.'});
      pool.push({id:'yani',answer:'Та про Яні трохи задумався.'});
    }
    if(s.world?.location==='techsmith') pool.push({id:'work',answer:'Та про роботу. Думаю, як решта зміни пройде.'});
    pool.push(
      {id:'plans',answer:'Та думаю, що робитиму далі.'},
      {id:'wandering',answer:'Та ні над чим конкретним. Просто думки самі крутяться.'},
      {id:'city',answer:'Та про місто щось задумався. Іноді дивишся навколо і думки самі чіпляються одна за одну.'}
    );
    return pool[Math.floor(Math.random()*pool.length)];
  }
  activityFollowup(kind){
    const idle=this.brain.state?.naturalLife?.idle;
    if(kind==='thinking') {
      if(idle?.kind!=='think') return null;
      idle.topic ||= this.chooseThinkingTopic();
      return idle.topic?.answer || 'Та ні над чим конкретним. Просто задумався.';
    }
    if(kind==='window') {
      if(idle?.kind!=='lookOutWindow' && this.brain.state?.action?.actionId!=='lookOutWindow') return null;
      return this.describeWindow();
    }
    if(kind==='tv') {
      if(idle?.kind!=='watchTV' && this.brain.state?.action?.actionId!=='idleWatchTV') return null;
      return idle?.detail || 'Та нічого особливого. Просто телевізор увімкнув.';
    }
    if(kind==='phone') {
      if(idle?.kind!=='phone' && this.brain.state?.action?.actionId!=='idlePhone') return null;
      return idle?.detail || 'Та так, переглядаю телефон без якоїсь конкретної мети.';
    }
    return null;
  }
  idleAnswer(){
    const s=this.brain.state, idle=s.naturalLife?.idle;
    if(idle?.kind==='lookOutWindow') return 'У вікно дивлюся.';
    if(idle?.kind==='lieDown') return 'Лежу.';
    if(idle?.kind==='watchTV') return idle.detail||'Дивлюся телевізор.';
    if(idle?.kind==='phone') return 'У телефоні сиджу.';
    if(idle?.kind==='think') return 'Та задумався трохи.';
    if(idle?.kind==='sit') return 'Просто сиджу.';
    return ['Нічого особливо не роблю.','Та нічого особливого.','Поки просто байдикую.'][Math.floor(Math.random()*3)];
  }
  chooseIdleAction(){
    const s=this.brain.state;
    if(s.world?.location!=='home') return null;
    const room=s.dailyLife?.homeRoom||'cozyRoom';
    const sl=this.ensureSleepDay(), light=this.dayLightPhase(new Date());
    let choices=['nothing','nothing','sit','lieDown','phone','think','watchTV'];
    if(['cozyRoom','glassBedroom','balcony'].includes(room)) choices.push('lookOutWindow');
    if(light==='dawn' && sl.earlyWakeHandled) choices.push('lookOutWindow','lookOutWindow');
    const kind=choices[Math.floor(Math.random()*choices.length)];
    const detail=kind==='watchTV' && Math.random()<0.35?'Дивлюся телевізор, одна реклама, нічого цікавого.':null;
    s.naturalLife.idle={kind,detail,since:Date.now()};
    if(kind==='think') s.naturalLife.idle.topic=this.chooseThinkingTopic();
    if(kind==='nothing') return null;
    const actionId={sit:'idleSit',lieDown:'idleLieDown',phone:'idlePhone',think:'idleThink',watchTV:'idleWatchTV',lookOutWindow:'lookOutWindow'}[kind];
    return {type:'action',actionId,category:'idle',duration:8+Math.round(Math.random()*22),reason:'нічим терміновим не зайнятий',score:80,homeRoom:kind==='lookOutWindow'?'cozyRoom':room};
  }
  getPriorityAction(){
    if(this.brain.state.action || this.brain.state.world?.location!=='home') return null;
    // Не кожен цикл: бездіяльність теж є нормальною.
    if(Math.random()<0.45) return null;
    return this.chooseIdleAction();
  }
  completeAction(action){
    if(['idleSit','idleLieDown','idlePhone','idleThink','idleWatchTV','lookOutWindow'].includes(action?.actionId)) this.brain.state.naturalLife.idle=null;
  }
}
window.AkiraNaturalLife=AkiraNaturalLife;
