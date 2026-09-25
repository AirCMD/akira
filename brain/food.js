class AkiraFood {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.food?.food || {};
    const s=this.brain.state;
    s.food=s.food||{};
    s.food.inventory=s.food.inventory||JSON.parse(JSON.stringify(this.data.initialInventory||{}));
    s.food.mealHistory=Array.isArray(s.food.mealHistory)?s.food.mealHistory:[];
    s.food.drinkHistory=Array.isArray(s.food.drinkHistory)?s.food.drinkHistory:[];
    s.food.dirtyDishes=Number(s.food.dirtyDishes)||0;
    s.food.pendingAction=s.food.pendingAction||null;
    s.food.currentMeal=s.food.currentMeal||null;
    s.food.currentDrink=s.food.currentDrink||null;
    s.food.lastShoppingAt=s.food.lastShoppingAt||null;
    s.food.lastMealAt=s.food.lastMealAt||null;
    s.food.lastDrinkAt=s.food.lastDrinkAt||null;
    s.food.groceryTrip=s.food.groceryTrip||null;
    return this;
  }
  n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
  need(id){ return this.n(this.brain.state?.needs?.[id]?.value ?? this.brain.state?.needs?.[id],0); }
  loc(){ return this.brain.state?.world?.location||'home'; }
  timeMinutes(){ const m=String(this.brain.state?.world?.time||'00:00').match(/(\d{1,2}):(\d{2})/); return m?+m[1]*60 + +m[2]:0; }
  mealType(){ const t=this.timeMinutes(); if(t<660) return 'breakfast'; if(t<960) return 'lunch'; if(t<1260) return 'dinner'; return 'snack'; }
  has(ingredients){ const inv=this.brain.state.food.inventory; return Object.entries(ingredients||{}).every(([k,v])=>this.n(inv[k])>=this.n(v)); }
  consume(ingredients){ const inv=this.brain.state.food.inventory; for(const [k,v] of Object.entries(ingredients||{})) inv[k]=Math.max(0,this.n(inv[k])-this.n(v)); }
  recentIds(){ return this.brain.state.food.mealHistory.slice(-this.n(this.data.settings?.recentMealAvoidCount,4)).map(x=>x.id); }
  chooseMeal(){
    const type=this.mealType(), recent=new Set(this.recentIds());
    let pool=(this.data.meals||[]).filter(m=>(m.mealTypes||[]).includes(type)&&this.has(m.ingredients));
    if(!pool.length) pool=(this.data.meals||[]).filter(m=>this.has(m.ingredients));
    const fresh=pool.filter(m=>!recent.has(m.id)); if(fresh.length) pool=fresh;
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }
  chooseDrink(){
    const t=this.timeMinutes(); const period=t<660?'morning':t<1080?'day':'evening';
    let pool=(this.data.drinks||[]).filter(d=>this.has(d.ingredients)&&((d.times||[]).includes('any')||(d.times||[]).includes(period)));
    if(!pool.length) pool=(this.data.drinks||[]).filter(d=>this.has(d.ingredients));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }
  simMinutesSince(value){
    if(!value) return Infinity; const t=typeof value==='number'?value:new Date(value).getTime();
    if(!Number.isFinite(t)) return Infinity;
    return Math.max(0,(Date.now()-t)*Math.max(.01,this.brain.config?.simulationSpeed||1)/1000);
  }
  mealCooldownReady(hunger){ return hunger>=this.n(this.data.settings?.criticalHungerThreshold,78) || this.simMinutesSince(this.brain.state.food.lastMealAt)>=this.n(this.data.settings?.mealCooldownMinutes,150); }
  shoppingCooldownReady(){ return this.simMinutesSince(this.brain.state.food.lastShoppingAt)>=this.n(this.data.settings?.shoppingCooldownMinutes,360); }
  action(actionId,duration,reason,extra={}){ return {type:'action',actionId,duration,category:'food',reason,score:650,factors:{food:650},...extra}; }
  lowInventory(){ const inv=this.brain.state.food.inventory; const target=this.data.restockTo||{}; const important=['water','eggs','yogurt','potato','buckwheat','chicken','fruit']; return important.filter(k=>this.n(inv[k])<=Math.max(1,Math.floor(this.n(target[k])*0.2))); }
  queue(a){ this.brain.state.food.pendingAction=a; }
  getPriorityAction(){
    if(this.brain.state.action) return null;
    const s=this.brain.state.food;
    if(s.pendingAction){ const a=s.pendingAction; s.pendingAction=null; return a; }
    const loc=this.loc(), t=this.timeMinutes();
    if(loc==='massmarket'){
      if(!s.groceryTrip) s.groceryTrip={phase:'shopping',startedAt:Date.now(),shoppingList:this.lowInventory()};
      s.groceryTrip.phase='shopping';
      return this.action('groceryShopping',25,'треба купити продукти',{shoppingList:s.groceryTrip.shoppingList||this.lowInventory()});
    }
    if(loc!=='home') return null;
    const hunger=this.need('hunger'), thirst=this.need('thirst');
    if(thirst>=this.n(this.data.settings?.thirstThreshold,38)){
      const d=this.chooseDrink(); if(d){ s.currentDrink={...d}; return this.action('prepareDrink',Math.max(1,d.id.includes('Tea')?7:2),`хочу випити ${d.name}`,{drinkId:d.id,drinkName:d.name,ingredients:d.ingredients,homeRoom:'kitchen'}); }
    }
    if(hunger>=this.n(this.data.settings?.hungerCookThreshold,42) && this.mealCooldownReady(hunger)){
      const m=this.chooseMeal();
      if(m){ s.currentMeal={...m}; return this.action('cookMeal',this.n(m.minutes,15),`зголоднів і захотів ${m.name}`,{mealId:m.id,mealName:m.name,ingredients:m.ingredients,homeRoom:'kitchen',goal:`приготувати ${m.name}, щоб поїсти`,expectedOutcome:`${m.name} буде готовий`,nextAction:{actionId:'eatMeal',label:`поїсти ${m.name}`}}); }
      if(t>=8*60 && t<=21*60 && this.shoppingCooldownReady() && !s.groceryTrip){
        const shoppingList=this.lowInventory(); s.groceryTrip={phase:'outbound',startedAt:Date.now(),shoppingList};
        return this.action('travelToMassmarket',14,'вдома немає з чого нормально приготувати',{targetLocation:'massmarket',shoppingList});
      }
    }
    const low=this.lowInventory();
    if(low.length>=3 && t>=10*60 && t<=20*60 && hunger<55 && this.shoppingCooldownReady() && !s.groceryTrip){
      s.groceryTrip={phase:'outbound',startedAt:Date.now(),shoppingList:[...low]};
      return this.action('travelToMassmarket',14,'закінчуються продукти, треба зайти в масмаркет',{targetLocation:'massmarket',shoppingList:low});
    }
    if(s.dirtyDishes>=this.n(this.data.settings?.dishWashThreshold,3) && hunger<45){
      return this.action('washDishes',10+Math.min(15,s.dirtyDishes*2),'накопичився брудний посуд',{homeRoom:'kitchen'});
    }
    return null;
  }
  completeAction(a){
    if(!a) return; const s=this.brain.state.food, now=new Date().toISOString();
    if(a.actionId==='cookMeal'){
      this.consume(a.ingredients); this.queue(this.action('eatMeal',20,`щойно приготував ${a.mealName}`,{mealId:a.mealId,mealName:a.mealName,homeRoom:'kitchen',originReason:a.reason||`зголоднів і захотів ${a.mealName}`,goal:'втамувати голод',expectedOutcome:'стану менш голодним'}));
    } else if(a.actionId==='eatMeal'){
      s.mealHistory.push({id:a.mealId,name:a.mealName,at:now}); if(s.mealHistory.length>20)s.mealHistory.shift(); s.dirtyDishes+=1; s.currentMeal=null; s.lastMealAt=Date.now();
      this.brain.needs?.applyActivity?.('eat');
    } else if(a.actionId==='prepareDrink'){
      this.consume(a.ingredients); this.queue(this.action('drinkSelected',5,`приготував ${a.drinkName}`,{drinkId:a.drinkId,drinkName:a.drinkName,homeRoom:'kitchen'}));
    } else if(a.actionId==='drinkSelected'){
      s.drinkHistory.push({id:a.drinkId,name:a.drinkName,at:now}); if(s.drinkHistory.length>20)s.drinkHistory.shift(); s.currentDrink=null; s.lastDrinkAt=Date.now();
      this.brain.needs?.applyActivity?.('drink');
    } else if(a.actionId==='travelToMassmarket'){
      s.groceryTrip=s.groceryTrip||{startedAt:Date.now(),shoppingList:a.shoppingList||[]}; s.groceryTrip.phase='shopping';
      this.brain.state.world.location='massmarket'; this.brain.state.dailyLife.homeRoom=null;
    } else if(a.actionId==='groceryShopping'){
      const inv=s.inventory,target=this.data.restockTo||{};
      const missing=Object.entries(target).filter(([k,v])=>this.n(inv[k])<this.n(v)).map(([k])=>k);
      const cost=this.brain.inventoryMoney?.groceryCost?.(missing)||0;
      const paid=!cost || this.brain.inventoryMoney?.spend?.('akira',cost,'продукти',missing.join(', '));
      if(paid){ for(const [k,v] of Object.entries(target)) if(this.n(inv[k])<this.n(v)) inv[k]=this.n(v); s.lastShoppingAt=now; }
      if(s.groceryTrip) s.groceryTrip.phase='returning';
      this.queue(this.action('returnHomeGroceries',18,paid?'купив продукти, повертаюся додому':'не вистачило грошей на покупки, повертаюся додому',{targetLocation:'home'}));
    } else if(a.actionId==='returnHomeGroceries'){
      this.brain.state.world.location='home'; this.brain.state.dailyLife.homeRoom='hallway'; s.groceryTrip=null;
    } else if(a.actionId==='washDishes') s.dirtyDishes=0;
  }
}
window.AkiraFood=AkiraFood;
