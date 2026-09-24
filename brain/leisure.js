// leisure.js
// Автономне дозвілля Акіри поза роботою та побутовими рутинами.
// Модуль не генерує репліки. Він вирішує, КОЛИ виникає бажання кудись піти
// або чимось зайнятися, і веде ланцюжок: намір -> дорога -> дія -> повернення.
class AkiraLeisure {
  constructor(brain) { this.brain = brain; this.config = {}; }

  init() {
    this.config = this.brain.data?.leisure?.leisure || {};
    const s = this.brain.state;
    s.leisure = s.leisure || {};
    s.leisure.pendingAction ||= null;
    s.leisure.returnPending ||= false;
    s.leisure.lastPlans ||= {};
    s.leisure.lastReason ||= null;
    s.leisure.lastDestination ||= null;
    return this;
  }

  minutes(t) {
    const m = String(t || "00:00").match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }
  hour() { return Math.floor(this.minutes(this.brain.state?.world?.time) / 60); }
  location() { return this.brain.state?.world?.location || "home"; }
  isWorkday() { return this.brain.dailyLife?.isWorkday?.() ?? false; }
  num(...v) { for (const x of v) if (Number.isFinite(Number(x))) return Number(x); return 0; }
  clamp(v,a=0,b=100){ return Math.max(a,Math.min(b,v)); }
  dayKey(){ return this.brain.state?.world?.date || new Date().toISOString().slice(0,10); }

  weather() { return this.brain.getCurrentWeather?.() || this.brain.state?.world?.weather || {}; }
  weatherComfort() {
    const w = this.weather();
    let c = this.num(w.outdoorComfort, w.comfort, 60);
    const temp = this.num(w.temperature, w.temp, 18);
    const rain = this.num(w.precipitation, w.precip, 0);
    const wind = this.num(w.windSpeed, w.wind, 0);
    if (temp < 5 || temp > 29) c -= 22;
    else if (temp < 10 || temp > 26) c -= 10;
    if (rain > 50) c -= 30; else if (rain > 20) c -= 12;
    if (wind > 10) c -= 15;
    if (["thunderstorm","hail","heavyRain"].includes(w.condition)) c -= 45;
    return this.clamp(c);
  }

  cooldownReady(id, hours) {
    const last = this.brain.state.leisure?.lastPlans?.[id];
    if (!last) return true;
    return Date.now() - Number(last) >= hours * 3600000;
  }

  action(id, duration, reason, extra={}) {
    return { type:"action", actionId:id, category:"leisure", duration, reason,
      score:1050, factors:{leisure:1050}, ...extra };
  }

  // Не запускаємо дозвілля щохвилини. Воно виникає з нудьги, цікавості,
  // енергії, часу, погоди й невеликої варіативності.
  scoreOpportunity(o) {
    const s = this.brain.state;
    const h = this.hour();
    if (o.hours && (h < o.hours[0] || h >= o.hours[1])) return -Infinity;
    if (o.weekendOnly && !["saturday","sunday"].includes(this.brain.dailyLife?.dayName?.())) return -Infinity;
    if (!this.cooldownReady(o.id, o.cooldownHours || 12)) return -Infinity;
    if (this.num(s.energy,50) < (o.minEnergy || 0)) return -Infinity;

    let score = Number(o.base || 0);
    score += (this.num(s.boredom,30) - 35) * (o.boredomWeight ?? 0.35);
    score += (this.num(s.curiosity,50) - 50) * (o.curiosityWeight ?? 0.25);
    score += (this.num(s.energy,50) - 50) * (o.energyWeight ?? 0.12);

    if (o.outdoor) {
      const wc = this.weatherComfort();
      score += (wc - 50) * (o.weatherWeight ?? 0.75);
      const season = s.world?.season;
      if (["spring","autumn"].includes(season)) score += 8;
      if (season === "winter") score -= 8;
    }

    if (o.eveningBonus && h >= 17 && h < 22) score += o.eveningBonus;
    if (o.weekendBonus && ["saturday","sunday"].includes(this.brain.dailyLife?.dayName?.())) score += o.weekendBonus;
    if (this.isWorkday() && h >= 9 && h < 17) score -= 100;

    // Варіативність лише трохи хитає вже осмислену оцінку.
    score += (Math.random() - 0.5) * 12;
    return score;
  }

  getPriorityAction() {
    if (this.brain.state.action) return null;
    const s = this.brain.state;
    const leisure = s.leisure;

    // Після дороги виконуємо саме заплановану дію, а не кидаємо намір.
    if (leisure.pendingAction && this.location() === leisure.pendingAction.destination) {
      const a = leisure.pendingAction;
      leisure.pendingAction = null;
      leisure.lastReason = a.reason;
      return this.action(a.actionId, a.duration, a.reason, a.extra || {});
    }

    // Після зовнішнього дозвілля повертаємося додому.
    if (leisure.returnPending && this.location() !== "home") {
      leisure.returnPending = false;
      return this.action("returnHomeLeisure", 25, "повертаюся додому після прогулянки або дозвілля", {targetLocation:"home"});
    }

    if (this.location() !== "home") return null;

    const opportunities = this.config.opportunities || [];
    const scored = opportunities
      .map(o => ({o, score:this.scoreOpportunity(o)}))
      .filter(x => Number.isFinite(x.score))
      .sort((a,b)=>b.score-a.score);

    const best = scored[0];
    const threshold = Number(this.config.activationThreshold ?? 58);
    if (!best || best.score < threshold) return null;

    const o = best.o;
    s.leisure.lastPlans[o.id] = Date.now();
    s.leisure.lastReason = o.reason;

    // Домашнє дозвілля стартує одразу й далі daily_life відведе у потрібну кімнату.
    if (!o.destination || o.destination === "home") {
      return this.action(o.actionId, o.duration, o.reason, o.extra || {});
    }

    leisure.pendingAction = {
      actionId:o.actionId, duration:o.duration, reason:o.reason,
      destination:o.destination, extra:o.extra || {}
    };
    leisure.lastDestination = o.destination;
    return this.action("travelToLeisure", o.travelMinutes || 25, `вирішив: ${o.reason}`, {
      targetLocation:o.destination,
      destinationName:o.destinationName || o.destination,
      plannedAction:o.actionId
    });
  }

  completeAction(action) {
    const id = action?.actionId;
    if (!id) return;
    const s = this.brain.state;
    const leisure = s.leisure;

    if (id === "travelToLeisure" && action.targetLocation) {
      s.world.location = action.targetLocation;
      if (s.dailyLife) s.dailyLife.homeRoom = null;
      return;
    }
    if (id === "returnHomeLeisure") {
      s.world.location = "home";
      if (s.dailyLife) s.dailyLife.homeRoom = "hallway";
      return;
    }

    const external = new Set(["walk","cycle","visitMuseum","visitPlanetarium","visitTheatre","visitConcert","goToCinema"]);
    if (external.has(id) && this.location() !== "home") {
      leisure.returnPending = true;
    }
  }
}
window.AkiraLeisure = AkiraLeisure;
