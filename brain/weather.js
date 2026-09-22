// weather.js
// Внутрішня сезонна погода Акіри. Світ генерує погоду незалежно від діалогу;
// Акіра може її помітити, запам'ятати і лише потім згадати у відповіді.
class AkiraWeather {
  constructor(brain){
    this.brain=brain; this.data={}; this.elapsed=0; this.nextChange=180;
  }
  init(){
    this.data=this.brain.data?.weather?.weather || {};
    const saved=this.brain.state?.weatherSimulation;
    if(saved){ this.elapsed=saved.elapsed||0; this.nextChange=saved.nextChange||180; }
    if(!this.brain.state.world.weather || !this.brain.state.world.weather.generatedForDate) this.generate(true);
    return this;
  }
  config(){ return this.data.simulation || {}; }
  season(){ return this.brain.state.world?.season || 'autumn'; }
  weightedChoice(weights){
    const entries=Object.entries(weights||{}); let total=entries.reduce((s,[,v])=>s+Number(v||0),0);
    if(!total) return 'cloudy'; let r=Math.random()*total;
    for(const [k,v] of entries){ r-=Number(v||0); if(r<=0) return k; }
    return entries.at(-1)?.[0] || 'cloudy';
  }
  temperature(condition){
    const range=this.config().temperatureRanges?.[this.season()] || [5,20];
    let t=range[0]+Math.random()*(range[1]-range[0]);
    if(['snow','lightSnow','heavySnow'].includes(condition)) t=Math.min(t,1);
    if(condition==='hail') t=Math.min(t,12);
    return Math.round(t);
  }
  intensity(condition){
    if(['lightRain','lightSnow'].includes(condition)) return 'light';
    if(['heavyRain','heavySnow'].includes(condition)) return 'heavy';
    if(['rain','snow','hail','thunderstorm'].includes(condition)) return ['light','medium','heavy'][Math.floor(Math.random()*3)];
    return 'none';
  }
  updateSnow(condition,temp,previous){
    let depth=Number(previous?.snow?.depth||0);
    const falling=['lightSnow','snow','heavySnow'].includes(condition);
    if(falling && temp<=0) depth += condition==='heavySnow'?3:condition==='snow'?1.5:0.5;
    const melting=temp>0 && depth>0;
    if(melting) depth=Math.max(0,depth-(temp>=5?2:0.7));
    return {falling,depth:Math.round(depth*10)/10,melting,temperature:temp};
  }
  generate(initial=false){
    const prev=this.brain.state.world.weather || {};
    const profile={...(this.config().seasonalProfiles?.[this.season()]||{})};
    // Погода має інерцію: попередній стан трохи підсилюється, але не фіксується назавжди.
    if(prev.condition && profile[prev.condition]!=null) profile[prev.condition]+=Number(this.config().continuityBias||0.45);
    const condition=this.weightedChoice(profile);
    const temp=this.temperature(condition);
    const now=new Date();
    const date=this.brain.calendar?.localDate?.(now) || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const current={
      condition, temperature:temp, feelsLike:temp-(condition==='strongWind'?3:0),
      intensity:this.intensity(condition), generatedForDate:date, generatedAt:Date.now(),
      humidity:Math.round(45+Math.random()*45), windSpeed:Math.round(1+Math.random()*9),
      isDay: now.getHours()>=7 && now.getHours()<20,
      snow:this.updateSnow(condition,temp,prev)
    };
    this.brain.state.world.weather=current;
    this.elapsed=0;
    const c=this.config().changeEverySimulatedMinutes||{};
    this.nextChange=Math.round((c.minimum||120)+Math.random()*((c.maximum||300)-(c.minimum||120)));
    this.brain.state.weatherSimulation={elapsed:this.elapsed,nextChange:this.nextChange};
    if(!initial) this.perceiveChange(prev,current);
    return current;
  }
  update(minutes){
    if(this.config().enabled===false) return;
    const today=this.brain.calendar?.localDate?.(new Date());
    if(this.brain.state.world.weather?.generatedForDate!==today) return this.generate(false);
    this.elapsed+=Number(minutes||0);
    if(this.elapsed>=this.nextChange) this.generate(false);
    this.brain.state.weatherSimulation={elapsed:this.elapsed,nextChange:this.nextChange};
  }
  perceiveChange(previous,current){
    const chance=Number(this.config().awarenessChance ?? 0.75);
    if(Math.random()>chance) return;
    const event={type:'weatherObserved',time:Date.now(),condition:current.condition,temperature:current.temperature,intensity:current.intensity};
    this.brain.state.recentEvents=this.brain.state.recentEvents||[];
    this.brain.state.recentEvents.push(event);
    this.brain.state.recentEvents=this.brain.state.recentEvents.slice(-50);
    this.brain.state.weatherPerception={...event,noticed:true};
    if(this.brain.memory?.remember && (current.intensity==='heavy' || current.condition==='hail' || current.condition==='thunderstorm')){
      this.brain.memory.remember({type:'weather',title:'Незвична погода',content:this.describe(current),topics:['weather'],keywords:[current.condition],importance:55});
    }
  }
  describe(w=this.brain.state.world.weather){
    if(!w) return 'Я щось не звернув уваги на погоду.';
    const names=this.data.conditions||{}; const name=names[w.condition]?.name || w.condition;
    let text=`Зараз ${name}, близько ${w.temperature} °C.`;
    if(w.snow?.depth>0) text+=w.snow.melting?` Снігу приблизно ${w.snow.depth} см, але він тане.`:` Сніговий покрив приблизно ${w.snow.depth} см.`;
    return text;
  }
  getPublicState(){ return {current:{...(this.brain.state.world.weather||{})},perception:{...(this.brain.state.weatherPerception||{})}}; }
}
window.AkiraWeather=AkiraWeather;
