class AkiraDailyLife {
  constructor(brain) { this.brain = brain; this.profile = {}; }

  init() {
    this.profile = this.brain.data?.life_profile?.lifeProfile || {};
    const state = this.brain.state;
    state.dailyLife = state.dailyLife || { routines: {}, commute: {}, homeRoom: "secondRoom" };
    state.dailyLife.routines = state.dailyLife.routines || {};
    state.dailyLife.commute = state.dailyLife.commute || {};
    state.dailyLife.homeRoom ||= "secondRoom";
    return this;
  }

  minutes(time) {
    const m = String(time || "00:00").match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  dayKey() { return this.brain.state?.world?.date || new Date().toISOString().slice(0,10); }
  dayName() { return String(this.brain.state?.world?.day || "").toLowerCase(); }
  isWorkday() { return (this.profile.work?.days || []).includes(this.dayName()); }
  location() { return this.brain.state?.world?.location || "home"; }
  last(id) { return this.brain.state.dailyLife?.routines?.[id] || null; }
  daysSince(id) {
    const value = this.last(id); if (!value) return Infinity;
    const d = new Date(value); if (Number.isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  doneToday(id) { return String(this.last(id) || "").slice(0,10) === this.dayKey(); }

  action(actionId, duration, reason, extra={}) {
    return { type:"action", actionId, duration, category:"daily_life", reason, score: 1000, factors:{dailyLife:1000}, ...extra };
  }

  getPriorityAction(situation={}) {
    if (this.brain.state.action) return null;
    const t = this.minutes(situation.time || this.brain.state.world?.time);
    const loc = this.location();
    const work = this.profile.work || {};
    const commute = work.commute || {};
    const start = this.minutes(work.start || "10:00");
    const end = this.minutes(work.end || "16:00");
    const travel = Number(commute.durationMinutes) || 45;

    // Робочий маршрут є частиною дня, а не телепортацією між home/work.
    if (this.isWorkday() && loc === "home" && t >= start - travel - 10 && t < start) {
      return this.action("commuteToWork", travel, "час вирушати на роботу", {targetLocation:"techsmith"});
    }
    if (this.isWorkday() && loc === "techsmith" && t >= end && t < end + 120) {
      return this.action("commuteHome", travel, "робочий день закінчився", {targetLocation:"home"});
    }

    if (loc !== "home") return null;

    // Невеликі побутові рутини. Вони не перебивають сон/роботу, бо викликаються лише між діями.
    if (t >= 7*60 && t < 10*60 && !this.doneToday("washFace")) {
      return this.action("washFace", 5, "ранкова гігієна");
    }
    if (t >= 7*60 && t < 10*60 && this.daysSince("shave") >= (Number(this.profile.hygiene?.shaveEveryDays) || 2)) {
      return this.action("shave", 10, "час поголитися");
    }
    if (t >= 8*60 && t < 11*60 && this.daysSince("changeClothes") >= 4) {
      return this.action("changeClothes", 5, "час змінити одяг");
    }
    if (["saturday","sunday"].includes(this.dayName()) && t >= 11*60 && t < 17*60 && this.daysSince("laundry") >= 7) {
      return this.action("doLaundry", 45, "накопичилося прання");
    }
    if (t >= 19*60 && t < 22*60 && this.daysSince("takeBath") >= 3) {
      return this.action("takeBath", 35, "хочеться відпочити у ванні");
    }
    return null;
  }

  completeAction(action) {
    const id = action?.actionId; if (!id) return;
    const now = new Date().toISOString();
    const routines = this.brain.state.dailyLife.routines;
    if (["washFace","shave","changeClothes","doLaundry","takeBath"].includes(id)) routines[id] = now;

    if (id === "commuteToWork") {
      this.brain.state.world.location = "techsmith";
      this.brain.state.dailyLife.commute.lastArrivalWork = now;
    }
    if (id === "commuteHome") {
      this.brain.state.world.location = "home";
      this.brain.state.dailyLife.commute.lastArrivalHome = now;
      this.brain.state.dailyLife.homeRoom = "secondRoom";
    }
  }
}
window.AkiraDailyLife = AkiraDailyLife;
