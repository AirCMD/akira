// v38: речі та гроші мають стан. Суми — параметри симуляційної економіки, не біографічний канон.
class AkiraInventoryMoney {
  constructor(brain){ this.brain=brain; this.data={}; }
  init(){
    this.data=this.brain.data?.inventory_money?.inventoryMoney||{};
    const s=this.brain.state;
    s.economy=s.economy||{};
    s.economy.wallets=s.economy.wallets||JSON.parse(JSON.stringify(this.data.startingBalances||{akira:0,yani:0,household:0}));
    s.economy.transactions=Array.isArray(s.economy.transactions)?s.economy.transactions:[];
    s.economy.lastAkiraPayDate=s.economy.lastAkiraPayDate||null;
    s.inventory=s.inventory||JSON.parse(JSON.stringify(this.data.owned||{shared:[],akira:[],yani:[]}));
    return this;
  }
  n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
  balance(who='akira'){ return this.n(this.brain.state.economy?.wallets?.[who]); }
  tx(type,who,amount,reason,item=null){
    const e=this.brain.state.economy; amount=Math.max(0,this.n(amount));
    if(type==='expense' && this.balance(who)<amount) return false;
    e.wallets[who]=this.balance(who)+(type==='income'?amount:-amount);
    e.transactions.push({type,who,amount,reason,item,date:this.brain.state.world?.date,time:this.brain.state.world?.time,at:Date.now()});
    if(e.transactions.length>120)e.transactions.splice(0,e.transactions.length-120); return true;
  }
  spend(who,amount,reason,item=null){ return this.tx('expense',who,amount,reason,item); }
  earn(who,amount,reason){ return this.tx('income',who,amount,reason); }
  addItem(owner,item){ if(!item)return; const a=this.brain.state.inventory[owner]||(this.brain.state.inventory[owner]=[]); a.push(item); if(a.length>100)a.shift(); }
  hasItem(owner,needle){ const q=String(needle||'').toLocaleLowerCase('uk-UA'); return (this.brain.state.inventory?.[owner]||[]).some(x=>String(x).toLocaleLowerCase('uk-UA').includes(q)); }
  groceryCost(list=[]){ return Math.max(0,list.length)*this.n(this.data.prices?.groceriesUnit||0); }
  payAkiraForWorkday(){
    const e=this.brain.state.economy,d=this.brain.state.world?.date;
    if(!d || e.lastAkiraPayDate===d)return false;
    const amount=this.n(this.data.income?.akiraWorkday); if(!amount)return false;
    if(this.earn('akira',amount,'оплата за робочий день')){e.lastAkiraPayDate=d;return true;} return false;
  }
  onYaniActionFinished(a){
    if(!a)return;
    const p=this.data.prices||{};
    if(a.actionId==='orderFood') this.spend('yani',p.deliveryFood,'замовлення їжі','доставка їжі');
    if(a.actionId==='eatSnacks') this.spend('yani',p.snacks,'снеки','снеки');
    if(a.actionId==='browseCollectibles' && Math.random()<.35){ const item=Math.random()<.45?'фігурка':'матеріали або канцелярія'; if(this.spend('yani',p.collectible,'імпульсивна покупка',item))this.addItem('yani',item); }
    if(a.actionId==='visitJeannieShop' && Math.random()<.22){ if(this.spend('yani',p.tamagotchi,'новий тамагочі','тамагочі'))this.addItem('yani','тамагочі'); }
  }
  moneyAnswer(){ const b=this.balance('akira'); return `Зараз у мене приблизно ${Math.round(b)} ${this.data.currency||'умовних одиниць'}. Я витрачаю їх на звичайні речі й інколи відкладаю на те, що хочу купити.`; }
  recentSpendingAnswer(){ const xs=(this.brain.state.economy?.transactions||[]).filter(x=>x.type==='expense'&&x.who==='akira').slice(-3); if(!xs.length)return 'Останнім часом нічого помітного не купував.'; return 'Останні витрати: '+xs.map(x=>`${x.reason} — ${Math.round(x.amount)}`).join(', ')+'.'; }
}
window.AkiraInventoryMoney=AkiraInventoryMoney;
