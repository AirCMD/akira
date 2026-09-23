class AkiraHousehold {
  constructor(brain){ this.brain=brain; this.data={}; }

  init(){
    this.data=this.brain.data?.household?.household || {};
    const s=this.brain.state;
    s.household=s.household||{};
    s.household.rooms=s.household.rooms||{};
    const rooms=this.brain.data?.home?.home?.rooms||{};
    const initial=this.data.initial||{};
    for(const id of Object.keys(rooms)){
      s.household.rooms[id]=s.household.rooms[id]||{
        dust:this.n(initial.dust,18),
        floorDirt:this.n(initial.floorDirt,16),
        windowDirt:(this.data.windowRooms||[]).includes(id)?this.n(initial.windowDirt,22):0
      };
    }
    s.household.laundry=s.household.laundry||{
      dirty:this.n(initial.dirtyLaundry,3), wet:0, dry:0, stage:'idle', readyAt:null
    };
    s.household.lastCleanAt=s.household.lastCleanAt||null;
    s.household.lastUpdateAt=s.household.lastUpdateAt||Date.now();
    return this;
  }

  n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
  clamp(v){ return Math.max(0,Math.min(100,this.n(v))); }
  loc(){ return this.brain.state?.world?.location||'home'; }
  room(){ return this.brain.state?.dailyLife?.homeRoom||null; }
  action(actionId,duration,reason,extra={}){
    return {type:'action',actionId,duration,category:'household',reason,score:1150,factors:{household:1150},...extra};
  }

  update(simMinutes=0){
    const s=this.brain.state.household; if(!s||simMinutes<=0) return;
    const cfg=this.data.settings||{};
    const mult=this.data.roomUseMultiplier||{};
    for(const [id,r] of Object.entries(s.rooms||{})){
      const use=this.n(mult[id],1);
      r.dust=this.clamp(r.dust + simMinutes*this.n(cfg.dustPerSimMinute,.0022)*use);
      r.floorDirt=this.clamp(r.floorDirt + simMinutes*this.n(cfg.floorDirtPerSimMinute,.0018)*use);
      if((this.data.windowRooms||[]).includes(id)) r.windowDirt=this.clamp(r.windowDirt + simMinutes*this.n(cfg.windowDirtPerSimMinute,.00045)*use);
    }
    // Одяг накопичується поступово від самого життя, а не виникає раз на суботу за наказом календаря.
    s.laundry.dirty=Math.min(30,this.n(s.laundry.dirty)+simMinutes*this.n(cfg.laundryPerSimMinute,.0008));
    if(s.laundry.stage==='drying' && s.laundry.readyAt && Date.now()>=s.laundry.readyAt){
      s.laundry.dry+=this.n(s.laundry.wet); s.laundry.wet=0; s.laundry.stage='dry'; s.laundry.readyAt=null;
    }
    s.lastUpdateAt=Date.now();
  }

  dirtiest(metric, allowed){
    const rooms=this.brain.state.household?.rooms||{};
    return (allowed||Object.keys(rooms)).map(id=>({id,value:this.n(rooms[id]?.[metric])})).sort((a,b)=>b.value-a.value)[0]||null;
  }

  getPriorityAction(){
    if(this.brain.state.action || this.loc()!=='home') return null;
    const s=this.brain.state.household, cfg=this.data.settings||{}, laundry=s.laundry;
    const hunger=this.n(this.brain.state?.needs?.hunger?.value ?? this.brain.state?.needs?.hunger,0);
    const energy=this.n(this.brain.state?.energy,70);
    if(hunger>65 || energy<25) return null;

    // Повний цикл прання: кошик -> машинка -> мокра білизна -> балкон -> сушіння -> складання.
    if(laundry.stage==='idle' && this.n(laundry.dirty)>=this.n(cfg.laundryStartAt,6))
      return this.action('startLaundry',8,'накопичилося достатньо брудної білизни',{homeRoom:'bathroom'});
    if(laundry.stage==='washing' && laundry.readyAt && Date.now()>=laundry.readyAt)
      return this.action('takeLaundryOut',5,'прання закінчилося, треба дістати білизну',{homeRoom:'bathroom'});
    if(laundry.stage==='wet' && this.n(laundry.wet)>0)
      return this.action('hangLaundry',12,'треба розвісити мокру білизну',{homeRoom:'balcony'});
    if(laundry.stage==='dry' && this.n(laundry.dry)>0)
      return this.action('foldLaundry',12,'білизна висохла, треба її скласти',{homeRoom:'cozyRoom'});

    const dust=this.dirtiest('dust',this.data.dustRooms);
    if(dust && dust.value>=this.n(cfg.noticeDustAt,55))
      return this.action('wipeDust',10+Math.round(dust.value/12),'помітив пил і він уже дратує',{homeRoom:dust.id,targetRoom:dust.id});

    const vac=this.dirtiest('floorDirt',this.data.vacuumRooms);
    if(vac && vac.value>=this.n(cfg.noticeFloorAt,58))
      return this.action('vacuumRoom',12+Math.round(vac.value/10),'підлога вже брудна, час пропилососити',{homeRoom:vac.id,targetRoom:vac.id});

    const mop=this.dirtiest('floorDirt',this.data.mopRooms);
    if(mop && mop.value>=this.n(cfg.noticeFloorAt,58)+5)
      return this.action('mopFloor',14+Math.round(mop.value/10),'підлогу пора помити',{homeRoom:mop.id,targetRoom:mop.id});

    const win=this.dirtiest('windowDirt',this.data.windowRooms);
    const weather=this.brain.state?.world?.weather||{};
    const precip=String(weather.precipitation||weather.condition||'').toLowerCase();
    const badWeather=/rain|дощ|snow|сніг|hail|град/.test(precip);
    if(win && win.value>=this.n(cfg.noticeWindowsAt,72) && !badWeather)
      return this.action('washWindows',25,'вікна вже помітно брудні',{homeRoom:win.id,targetRoom:win.id});

    return null;
  }

  completeAction(a){
    if(!a) return; const s=this.brain.state.household, l=s.laundry, now=new Date().toISOString();
    const room=s.rooms?.[a.targetRoom];
    if(a.actionId==='wipeDust' && room){ room.dust=4; s.lastCleanAt=now; }
    if(a.actionId==='vacuumRoom' && room){ room.floorDirt=Math.min(room.floorDirt,12); s.lastCleanAt=now; }
    if(a.actionId==='mopFloor' && room){ room.floorDirt=3; s.lastCleanAt=now; }
    if(a.actionId==='washWindows' && room){ room.windowDirt=3; s.lastCleanAt=now; }
    if(a.actionId==='startLaundry'){
      const load=Math.min(10,Math.floor(this.n(l.dirty)));
      l.dirty=Math.max(0,this.n(l.dirty)-load); l.wet=load; l.stage='washing';
      // 50 симульованих хвилин = 50 реальних секунд при speed=1.
      l.readyAt=Date.now()+50*1000/Math.max(.01,this.n(this.brain.config?.simulationSpeed,1));
    }
    if(a.actionId==='takeLaundryOut'){ l.stage='wet'; l.readyAt=null; }
    if(a.actionId==='hangLaundry'){
      l.stage='drying';
      l.readyAt=Date.now()+180*1000/Math.max(.01,this.n(this.brain.config?.simulationSpeed,1));
    }
    if(a.actionId==='foldLaundry'){ l.dry=0; l.stage='idle'; l.readyAt=null; }
  }
}
window.AkiraHousehold=AkiraHousehold;
