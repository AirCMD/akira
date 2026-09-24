// home_spatial.js — v46.0 Home topology + room perception
class AkiraHomeSpatial {
  constructor(brain){this.brain=brain;this.data={};}
  init(){
    this.data=this.brain.data?.home_spatial?.homeSpatial||{};
    const s=this.brain.state;
    s.homeSpatial ||= {movement:null,lastPerception:null};
    return this;
  }
  connections(){return this.data.connections||{};}
  adjacent(a,b){return !!a&&!!b&&(this.connections()[a]||[]).includes(b);}
  path(from,to){
    if(!from||!to)return []; if(from===to)return [from];
    const q=[[from]], seen=new Set([from]);
    while(q.length){const p=q.shift(),last=p[p.length-1];for(const n of (this.connections()[last]||[])){if(seen.has(n))continue;const np=[...p,n];if(n===to)return np;seen.add(n);q.push(np);}}
    return [];
  }
  room(id){return this.data.rooms?.[id]||null;}
  roomName(id){return this.brain.dailyLife?.getRoom?.(id)?.name||({hallway:'коридор'}[id])||id;}
  describeRoom(id=this.brain.state?.dailyLife?.homeRoom){
    if(this.brain.state?.world?.location!=='home')return 'Я зараз не вдома.';
    const r=this.room(id); if(!r)return 'Не можу нормально описати це місце.';
    const objects=(r.objects||[]).map(x=>x.name);
    const tail=objects.length?` Тут є ${objects.slice(0,-1).join(', ')}${objects.length>1?' і ':''}${objects.slice(-1)[0]}.`:'';
    this.brain.state.homeSpatial.lastPerception={type:'room',room:id,at:Date.now()};
    return `${r.summary||''}${tail}`.trim();
  }
  findObject(query,roomId=this.brain.state?.dailyLife?.homeRoom){
    const q=String(query||'').toLowerCase(), objs=this.room(roomId)?.objects||[];
    const aliases={window:['вікн'],table:['стол'],fridge:['холодиль'],stove:['плит'],sink:['мийк','умиваль'],mirror:['дзеркал'],frontDoor:['двер'],storageCloset:['шаф'],wardrobe:['шаф'],sofa:['диван'],doubleBed:['ліжк'],largeTV:['телевіз'],computerDesk:['столик','комп’ютер','компьютер']};
    return objs.find(o=>(aliases[o.id]||[o.name.toLowerCase()]).some(a=>q.includes(a)))||null;
  }
  describeNearObject(query){
    if(this.brain.state?.world?.location!=='home')return 'Я зараз не вдома.';
    const room=this.brain.state?.dailyLife?.homeRoom, obj=this.findObject(query,room);
    if(!obj)return 'Не бачу тут такого предмета.';
    return `${obj.name.charAt(0).toUpperCase()+obj.name.slice(1)} ${obj.position||'тут у кімнаті'}.`;
  }
  describeAhead(){
    const a=this.brain.state?.action, room=this.brain.state?.dailyLife?.homeRoom;
    if(a?.actionId==='lookOutWindow')return this.brain.naturalLife?.describeWindow?.()||'Дивлюся у вікно.';
    if(a?.actionId==='moveRoom')return `Переді мною прохід у бік ${this.brain.dailyLife?.roomDestinationPhrase?.(a.targetRoom)||'іншої кімнати'}.`;
    const r=this.room(room), first=r?.objects?.[0];
    return first?`Переді мною ${first.name}.`:`Зараз нічого конкретного перед собою не розглядаю.`;
  }
}
window.AkiraHomeSpatial=AkiraHomeSpatial;
