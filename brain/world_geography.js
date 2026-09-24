// world_geography.js — v45.9
// Єдине джерело фізичної правди для зовнішніх локацій і переміщень.
class AkiraWorldGeography {
  constructor(brain){this.brain=brain;this.data={};}
  init(){this.data=this.brain.data?.world_geography?.worldGeography||{};const s=this.brain.state;s.worldGeography=s.worldGeography||{};s.worldGeography.travel=s.worldGeography.travel||null;this.reconcileLegacyLocation();return this;}
  locations(){return this.data.locations||{};} get(id){return this.locations()[id]||null;} phrase(id){return this.get(id)?.phrase||null;} isKnown(id){return !!this.get(id);}
  reconcileLegacyLocation(){const s=this.brain.state;const aliases={workplace:'techsmith',work:'techsmith',supermarket:'massmarket',store:'smallShop'};if(aliases[s.world?.location])s.world.location=aliases[s.world.location];}
  travelSpec(action){const id=action?.actionId||'';const spec=this.data.travelActions?.[id];if(spec)return {...spec,destination:spec.destinationFromAction?(action.targetLocation||null):spec.destination};if(action?.targetLocation&&/^(travel|return|commute)/i.test(id))return {destination:action.targetLocation,mode:'travel',transitPhrase:'у дорозі'};return null;}
  actionAllowedHere(action,location=this.brain.state.world?.location){if(!action?.actionId)return true;const spec=this.travelSpec(action);if(spec)return true;const place=this.get(location);if(!place)return false;const declared=action.allowedLocations||action.locations;if(Array.isArray(declared)&&declared.length)return declared.includes(location);const physical=new Set([].concat(...Object.values(this.locations()).map(x=>x.activities||[])));if(!physical.has(action.actionId))return true;return (place.activities||[]).includes(action.actionId);}
  onActionStarted(action){const spec=this.travelSpec(action);if(!spec)return;const s=this.brain.state,origin=action.worldStarted?.location||s.world?.location||null;s.worldGeography.travel={actionId:action.actionId,origin,destination:spec.destination||action.targetLocation||null,mode:spec.mode||'travel',phrase:spec.transitPhrase||'у дорозі',startedAt:Date.now(),endsAt:action.endsAt||null};s.world.location='transit';if(s.dailyLife)s.dailyLife.homeRoom=null;}
  completeAction(action){const s=this.brain.state,travel=s.worldGeography?.travel;if(!travel||travel.actionId!==action?.actionId)return;if(s.world.location==='transit'&&travel.destination)s.world.location=travel.destination;if(travel.destination==='home'&&s.dailyLife)s.dailyLife.homeRoom='hallway';s.worldGeography.lastTravel={...travel,finishedAt:Date.now()};s.worldGeography.travel=null;}
  transitStage(t){
    if(!t)return null; const total=Math.max(1,Number(t.endsAt||Date.now())-Number(t.startedAt||Date.now())); const p=Math.max(0,Math.min(1,(Date.now()-Number(t.startedAt||Date.now()))/total));
    if(t.actionId==='commuteToWork') return p<0.12?'Вийшов з дому, йду вулицею до метро «Сутінки».':p<0.55?'Я зараз у метро «Сутінки», їду на роботу.':p<0.9?'Їду тролейбусом №25. Мені три зупинки.':'Вийшов із тролейбуса, йду вулицею до TechSmith.';
    if(t.actionId==='commuteHome') return p<0.18?'Вийшов із TechSmith, іду вулицею до зупинки.':p<0.48?'Їду тролейбусом №25.':p<0.88?'Я зараз у метро «Сутінки», їду додому.':'Вийшов із метро, йду вулицею до дому.';
    if(t.mode==='walk') return t.destination==='massmarket'?'Іду вулицею до масмаркету.':'Іду вулицею додому.';
    return t.phrase?`Я зараз ${t.phrase}.`:'Я зараз у дорозі.';
  }
  describeCurrent(){const s=this.brain.state;if(s.world?.location==='transit')return this.transitStage(s.worldGeography?.travel);if(s.world?.location==='home')return null;const p=this.get(s.world?.location);return p?.phrase?`Я зараз ${p.phrase}.`:null;}
}
window.AkiraWorldGeography=AkiraWorldGeography;
