// phone.js — телефон як частина світу Акіри, а не телепатичний канал у dialogue.js.
class AkiraPhone {
    constructor(brain) {
        this.brain = brain;
        this.cfg = brain.data?.phone?.phone || brain.data?.phone || {};
    }
    clamp(v,a=0,b=100){ return Math.max(a, Math.min(b, Number(v)||0)); }
    init(){
        const s=this.brain.state;
        s.phone ||= {
            mode:"on", battery:Number(this.cfg.initialBattery ?? 78), charging:false,
            inbox:[], unreadCount:0, lastModeChangeAt:Date.now(), lastCheckedAt:Date.now()
        };
        s.phone.inbox ||= [];
        s.phone.unreadCount = s.phone.inbox.filter(m=>!m.read).length;
    }
    isSleeping(){ return (this.brain.state.action?.actionId || this.brain.state.activity)==="sleep"; }
    desiredMode(){
        const s=this.brain.state, p=s.phone;
        if ((p.battery ?? 100) <= 1) return "off";
        if (this.isSleeping()) return "silent";
        const fatigue=Number(s.fatigue||0), privacy=Number(s.needs?.privacy ?? s.privacy ?? 0);
        if (fatigue >= Number(this.cfg.autoSilentFatigue ?? 82) || privacy >= Number(this.cfg.autoSilentPrivacy ?? 72)) return "silent";
        return "on";
    }
    setMode(mode, reason="власне рішення"){
        const p=this.brain.state.phone; if(!p || !["on","silent","off"].includes(mode)) return;
        if(p.mode!==mode){ p.mode=mode; p.modeReason=reason; p.lastModeChangeAt=Date.now(); }
    }
    update(minutes=0){
        const s=this.brain.state, p=s.phone; if(!p) return;
        const atHome=s.location==="home" || s.world?.location==="home";
        // Просте заряджання: вдома при дуже низькому заряді він ставить телефон заряджатися.
        if(!p.charging && atHome && p.battery <= Number(this.cfg.lowBatteryAt ?? 18)) p.charging=true;
        if(p.charging && (!atHome || p.battery>=96)) p.charging=false;
        p.battery=this.clamp(p.battery + (p.charging ? Number(this.cfg.chargePerSimMinute ?? .09) : -Number(this.cfg.drainPerSimMinute ?? .006))*minutes);
        const wanted=this.desiredMode();
        if(wanted!==p.mode){
            if(wanted==="silent") this.setMode("silent", this.isSleeping()?"спить":"не хоче відволікатися");
            else if(wanted==="off") this.setMode("off","телефон розрядився");
            else this.setMode("on","знову готовий бачити повідомлення");
        }
        this.reconsiderInbox();
        p.unreadCount=p.inbox.filter(m=>!m.read).length;
    }
    receiveMessage(input, reply){
        const p=this.brain.state.phone;
        const item={ id:`msg_${Date.now()}_${Math.floor(Math.random()*9999)}`, input:String(input||""), replyText:String(reply?.text ?? reply?.response ?? reply?.message ?? reply ?? ""), receivedAt:Date.now(), read:false, status:"received", ready:false };
        p.inbox.push(item); if(p.inbox.length>Number(this.cfg.maxInbox??40)) p.inbox.splice(0,p.inbox.length-Number(this.cfg.maxInbox??40));
        if(p.mode==="off") { item.status="unseen_phone_off"; p.unreadCount++; return {deliverNow:false, unseen:true, reason:"телефон вимкнений", item}; }
        const attention=this.brain.attention?.onMessage?.(input) || {noticed:true};
        if(p.mode==="silent" && !attention.noticed){ item.status="unseen_silent"; p.unreadCount++; return {deliverNow:false, unseen:true, reason:"телефон без звуку і повідомлення не помітив", attention, item}; }
        if(p.mode==="silent" && this.isSleeping()){ item.status="unseen_sleep"; p.unreadCount++; return {deliverNow:false, unseen:true, reason:"спить, телефон без звуку", attention, item}; }
        if(!attention.noticed){ item.status="unseen_attention"; p.unreadCount++; return {deliverNow:false, unseen:true, reason:"не помітив повідомлення", attention, item}; }
        item.read=true; item.status="read_now"; item.readAt=Date.now(); p.unreadCount=p.inbox.filter(m=>!m.read).length;
        return {deliverNow:true, unseen:false, attention, item};
    }
    reconsiderInbox(){
        const p=this.brain.state.phone; if(!p || p.mode==="off" || this.isSleeping()) return;
        const now=Date.now();
        for(const m of p.inbox){
            if(m.read || m.ready) continue;
            // Не перевіряє телефон щотік: повертається до пропущеного через деякий час.
            if(now-m.receivedAt < 12000) continue;
            const a=this.brain.state.attention || {};
            if(Number(a.intensity||25)>72 || Number(this.brain.state.fatigue||0)>90) continue;
            m.read=true; m.readAt=now; m.status="noticed_later"; m.ready=true;
            p.lastCheckedAt=now;
            break;
        }
    }
    supersedePendingReplies(){
        const p=this.brain.state.phone; if(!p) return;
        // v45.7: якщо користувач уже написав нове повідомлення, стара відкладена
        // відповідь не повинна вискочити слідом і створити ефект «двох Акір».
        for(const m of p.inbox){
            if(!m.deliveredLater && (m.ready || (!m.read && m.status!=="received"))){
                m.ready=false; m.deliveredLater=true; m.read=true; m.status="superseded_by_new_message"; m.supersededAt=Date.now();
            }
        }
        p.unreadCount=p.inbox.filter(m=>!m.read).length;
    }
    takeReadyReply(){
        const p=this.brain.state.phone; if(!p) return null;
        const m=p.inbox.find(x=>x.ready && !x.deliveredLater);
        if(!m) return null;
        m.deliveredLater=true; m.ready=false;
        p.unreadCount=p.inbox.filter(x=>!x.read).length;
        return {input:m.input, text:m.replyText, delayed:true};
    }
    status(){ const p=this.brain.state.phone||{}; return {mode:p.mode||"on",battery:Math.round(p.battery||0),charging:!!p.charging,unreadCount:Number(p.unreadCount||0)}; }
}
window.AkiraPhone=AkiraPhone;
