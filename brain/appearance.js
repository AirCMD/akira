// appearance.js — зовнішність, догляд і поточний одяг Акіри.
// Сталі фізичні риси зберігаються в character.json, а вподобання/гардероб — appearance.json.
class AkiraAppearance {
    constructor(brain) { this.brain = brain; this.data = {}; }
    init() {
        this.data = this.brain.data?.appearance?.appearance || {};
        const state = this.brain.state.appearance ||= {};
        state.hair ||= { currentLength: this.data.hair?.currentLength || "short", growthDays: 0, lastGrowthDate: this.localDateKey() };
        state.outfit ||= null;
        state.earbuds ??= false;
        state.lastOutfitUpdate ||= 0;
        this.syncHairGrowth();
        this.refreshOutfit(true);
    }
    localDateKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    syncHairGrowth() {
        const hair = this.brain.state.appearance?.hair;
        if (!hair) return;
        const today = new Date(`${this.localDateKey()}T00:00:00`);
        const last = new Date(`${hair.lastGrowthDate || this.localDateKey()}T00:00:00`);
        const days = Math.max(0, Math.floor((today-last)/86400000));
        if (days) { hair.growthDays = (hair.growthDays || 0) + days; hair.lastGrowthDate = this.localDateKey(); }
        const cfg = this.data.hair?.growth || {};
        if (hair.growthDays >= (cfg.strongNeedAfterDays || 49)) hair.currentLength = "overgrown";
        else if (hair.growthDays >= (cfg.noticeAfterDays || 21)) hair.currentLength = "growing";
        else hair.currentLength = "short";
    }
    getHairStatus() {
        this.syncHairGrowth();
        const h=this.brain.state.appearance?.hair || {};
        const cfg=this.data.hair?.growth || {};
        return { ...h, prefersShort: this.data.hair?.preferredLength === "short", dislikesOvergrown: !!this.data.hair?.dislikesOvergrownHair,
            wantsHaircut: (h.growthDays||0) >= (cfg.wantsHaircutAfterDays||35) };
    }
    haircut() {
        const h=this.brain.state.appearance.hair;
        h.currentLength="short"; h.growthDays=0; h.lastGrowthDate=this.localDateKey(); h.lastHaircutDate=this.localDateKey();
        this.brain.saveState?.();
    }
    refreshOutfit(force=false) {
        const state=this.brain.state.appearance; if (!state) return;
        if (!force && Date.now()-(state.lastOutfitUpdate||0) < 60*60*1000) return;
        const weather=this.brain.state.world?.weather || {};
        const temp=Number(weather.temperature ?? weather.temp ?? 18);
        const season=this.brain.state.world?.season || this.brain.calendar?.getInfo?.().season || null;
        const location=this.brain.state.world?.location || "home";
        let outerwear=null;
        if ((season === "autumn" || season === "spring" || temp <= 14) && temp <= 16 && location !== "home") {
            outerwear={type:"куртка",color:"коричнева",hood:true,filling:"бавовна"};
        }
        const colors=this.data.wardrobe?.coolSpringAutumn?.sweaters?.commonColors || ["сірий","чорний"];
        const day=new Date().getDate();
        const sweater={type:"светр",color:colors[day % colors.length],print:(day%3===0)};
        const outside=location !== "home";
        const freq=this.data.accessories?.blackEarbuds?.frequency ?? 82;
        state.earbuds = outside && ((new Date().getDate()*37 + new Date().getHours()*11) % 100 < freq);
        state.outfit={outerwear,sweater,location,updatedAt:Date.now()};
        state.lastOutfitUpdate=Date.now();
    }
    update() { this.syncHairGrowth(); this.refreshOutfit(false); }
    getOutfit() { this.refreshOutfit(false); return this.brain.state.appearance?.outfit || null; }
}
window.AkiraAppearance = AkiraAppearance;
