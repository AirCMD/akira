class AkiraDailyLife {
  constructor(brain) { this.brain = brain; this.profile = {}; }

  init() {
    this.profile = this.brain.data?.life_profile?.lifeProfile || {};
    const state = this.brain.state;
    state.dailyLife = state.dailyLife || { routines: {}, commute: {}, homeRoom: "cozyRoom", roomHistory: [], queuedAction: null };
    state.dailyLife.routines = state.dailyLife.routines || {};
    state.dailyLife.commute = state.dailyLife.commute || {};
    state.dailyLife.homeRoom ||= "cozyRoom";
    state.dailyLife.roomHistory = Array.isArray(state.dailyLife.roomHistory) ? state.dailyLife.roomHistory : [];
    state.dailyLife.queuedAction = state.dailyLife.queuedAction || null;
    state.dailyLife.route = state.dailyLife.route || null;
    return this;
  }

  minutes(time) {
    const m = String(time || "00:00").match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  dayKey() { return this.brain.state?.world?.date || new Date().toISOString().slice(0,10); }
  dayName() { return String(this.brain.state?.world?.day || "").toLowerCase(); }
  isWorkday() { const day=new Date().toLocaleDateString("en-US",{weekday:"long"}).toLowerCase(); return (this.profile.work?.days || []).includes(day); }
  location() { return this.brain.state?.world?.location || "home"; }
  isWorkTime() {
    if (!this.isWorkday()) return false;
    const work=this.profile.work||{}, now=new Date(), t=now.getHours()*60+now.getMinutes();
    return t>=this.minutes(work.start||"10:00") && t<this.minutes(work.end||"16:00");
  }
  last(id) { return this.brain.state.dailyLife?.routines?.[id] || null; }
  daysSince(id) {
    const value = this.last(id); if (!value) return Infinity;
    const d = new Date(value); if (Number.isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  doneToday(id) { return String(this.last(id) || "").slice(0,10) === this.dayKey(); }

  getHomeData() { return this.brain.data?.home?.home || {}; }
  getRoom(id) { return this.getHomeData()?.rooms?.[id] || null; }
  currentRoomId() { return this.brain.state?.dailyLife?.homeRoom || null; }
  currentRoom() {
    const id = this.currentRoomId();
    const room = id ? this.getRoom(id) : null;
    return room ? { id, ...room } : null;
  }

  setHomeRoom(roomId, reason="movement") {
    if (this.location() !== "home" || !this.getRoom(roomId)) return false;
    const state = this.brain.state.dailyLife;
    if (state.homeRoom === roomId) return true;
    state.roomHistory.push({ from: state.homeRoom || null, to: roomId, reason, at: new Date().toISOString() });
    if (state.roomHistory.length > 30) state.roomHistory.shift();
    state.homeRoom = roomId;
    return true;
  }

  roomForAction(actionId) {
    const map = {
      sleep:"glassBedroom", rest:"cozyRoom", read:"cozyRoom", playGame:"cozyRoom",
      checkPhone:"cozyRoom", checkSocialNetwork:"cozyRoom", writePost:"cozyRoom",
      listenToMusic:"cozyRoom", watchStreamer:"cozyRoom", eat:"kitchen", drink:"kitchen",
      cookMeal:"kitchen", eatMeal:"kitchen", prepareDrink:"kitchen", drinkSelected:"kitchen", washDishes:"kitchen",
      startLaundry:"bathroom", takeLaundryOut:"bathroom", hangLaundry:"balcony", foldLaundry:"cozyRoom",
      wipeDust:"cozyRoom", vacuumRoom:"cozyRoom", mopFloor:"kitchen", washWindows:"cozyRoom",
      cleanSpill:"kitchen", changeDirtyClothes:"glassBedroom", pickUpDroppedItem:"cozyRoom", cleanBrokenDish:"kitchen", recoverFromStumble:"cozyRoom",
      washFace:"bathroom", shave:"bathroom", takeBath:"bathroom",
      lookOutWindow:"cozyRoom", idleSit:"cozyRoom", idleLieDown:"cozyRoom", idlePhone:"cozyRoom", idleThink:"cozyRoom", idleWatchTV:"glassBedroom", stargazing:"balcony", lookAtFlowers:"balcony",
      commuteToWork:"hallway"
    };
    return map[actionId] || null;
  }

  prepareAction(action) {
    if (!action || this.location() !== "home" || action.actionId === "moveRoom") return action;
    const target = action.homeRoom || this.roomForAction(action.actionId);
    if (!target || !this.getRoom(target) || target === this.currentRoomId()) return action;

    const from=this.currentRoomId();
    const path=this.brain.homeSpatial?.path?.(from,target) || [from,target];
    if(path.length<2) return action;
    this.brain.state.dailyLife.route={path,index:0,finalAction:{...action,homeRoom:target},startedAt:Date.now()};
    this.brain.state.dailyLife.queuedAction=null;
    return this.makeMoveAction(path[0],path[1],target);
  }

  makeMoveAction(from,to,finalTarget=to){
    return {type:"action",actionId:"moveRoom",category:"movement",duration:this.roomTravelMinutes(from,to),reason:`йду з ${this.roomNameGenitive(from)} до ${this.roomDestinationPhrase(finalTarget)}`,fromRoom:from,targetRoom:to,finalTargetRoom:finalTarget,targetRoomName:this.getRoom(to)?.name||to,targetRoomPhrase:this.roomDestinationPhrase(to),score:1100,factors:{spatialMovement:1100}};
  }

  roomNameGenitive(roomId){
    const forms={kitchen:"кухні",hallway:"коридору",bathroom:"ванної",toilet:"туалету",glassBedroom:"скляної спальні",cozyRoom:"затишної другої кімнати",spaceRoom:"кімнати в космічному стилі",seaRoom:"кімнати в морському стилі",balcony:"балкона"};
    return forms[roomId]||this.getRoom(roomId)?.name||roomId;
  }

  roomDestinationPhrase(roomId) {
    const forms = {
      glassBedroom: "скляну спальню",
      cozyRoom: "затишну другу кімнату",
      spaceRoom: "кімнату в космічному стилі",
      seaRoom: "кімнату в морському стилі",
      kitchen: "кухню",
      bathroom: "ванну",
      toilet: "туалет",
      balcony: "на балкон",
      hallway: "коридор"
    };
    return forms[roomId] || (this.getRoom(roomId)?.name || roomId);
  }

  roomTravelMinutes(from, to) {
    if (!from || from === to) return 1;
    const near = new Set([
      "glassBedroom:balcony", "balcony:glassBedroom",
      "cozyRoom:balcony", "balcony:cozyRoom",
      "cozyRoom:hallway", "hallway:cozyRoom",
      "glassBedroom:hallway", "hallway:glassBedroom",
      "kitchen:hallway", "hallway:kitchen",
      "bathroom:hallway", "hallway:bathroom",
      "toilet:hallway", "hallway:toilet",
      "spaceRoom:hallway", "hallway:spaceRoom",
      "seaRoom:hallway", "hallway:seaRoom"
    ]);
    return near.has(`${from}:${to}`) ? 2 : 4;
  }

  action(actionId, duration, reason, extra={}) {
    return { type:"action", actionId, duration, category:"daily_life", reason, score: 1000, factors:{dailyLife:1000}, ...extra };
  }

  getPriorityAction(situation={}) {
    if (this.brain.state.action) return null;

    const now = new Date();
    const t = now.getHours()*60 + now.getMinutes();
    const loc = this.location();
    const work = this.profile.work || {};
    const commute = work.commute || {};
    const start = this.minutes(work.start || "10:00");
    const end = this.minutes(work.end || "16:00");
    const travel = Number(commute.durationMinutes) || 45;

    // Reality Gate має пріоритет над будь-якою queued домашньою дією.
    // Якщо зміна вже почалася, Акіра не може спочатку «доготувати рис».
    if (this.isWorkday() && loc === "home" && t >= start && t < end) {
      this.brain.state.dailyLife.queuedAction = null;
      if (this.brain.state.food) this.brain.state.food.pendingAction = null;
      return this.action("commuteToWork", travel, "треба бути на роботі, зміна вже почалася", {targetLocation:"techsmith", late:true});
    }

    // Дія, заради якої Акіра перейшов у кімнату, виконується наступною лише
    // якщо реальний розклад не створив важливіший обов'язок.
    const route=this.brain.state.dailyLife?.route;
    if(route){
      const current=this.currentRoomId(), idx=route.path.indexOf(current);
      if(idx>=0 && idx<route.path.length-1){
        route.index=idx;
        return this.makeMoveAction(current,route.path[idx+1],route.path[route.path.length-1]);
      }
      if(current===route.path[route.path.length-1]){
        const finalAction=route.finalAction;
        this.brain.state.dailyLife.route=null;
        return finalAction;
      }
      this.brain.state.dailyLife.route=null;
    }
    const queued = this.brain.state.dailyLife?.queuedAction;
    if (queued) {
      const target = queued.homeRoom || this.roomForAction(queued.actionId);
      if (!target || target === this.currentRoomId()) { this.brain.state.dailyLife.queuedAction = null; return queued; }
    }

    // Робочий маршрут є частиною дня, а не телепортацією між home/work.
    if (this.isWorkday() && loc === "home" && t >= start - travel - 15 && t < start) {
      if(!this.doneToday("dressedForWork")) return this.action("dressForWork",5,"збираюся на роботу",{homeRoom:"hallway"});
      return this.action("commuteToWork", travel, "час вирушати на роботу", {targetLocation:"techsmith",homeRoom:"hallway"});
    }
    if (loc === "techsmith" && (!this.isWorkday() || t >= end || t < start - travel - 10)) {
      return this.action("commuteHome", travel, "робочий день закінчився, час додому", {targetLocation:"home"});
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
    if (t >= 19*60 && t < 22*60 && this.daysSince("takeBath") >= 3) {
      return this.action("takeBath", 35, "хочеться відпочити у ванні");
    }
    return null;
  }

  completeAction(action) {
    const id = action?.actionId; if (!id) return;
    const now = new Date().toISOString();
    const routines = this.brain.state.dailyLife.routines;
    if (["washFace","shave","changeClothes","takeBath","dressForWork"].includes(id)) routines[id] = now;

    if (id === "moveRoom" && action.targetRoom) {
      this.setHomeRoom(action.targetRoom, action.reason || "movement");
    }

    if (id === "commuteToWork") {
      this.brain.state.world.location = "techsmith";
      this.brain.state.dailyLife.homeRoom = null;
      this.brain.state.dailyLife.commute.lastArrivalWork = now;
    }
    if (id === "commuteHome") {
      this.brain.state.world.location = "home";
      this.brain.state.dailyLife.commute.lastArrivalHome = now;
      this.brain.state.dailyLife.homeRoom = "hallway";
    }
  }
}
window.AkiraDailyLife = AkiraDailyLife;
