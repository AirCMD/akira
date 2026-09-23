// brain.js
// Центральний координатор програмного мозку Акіри.
// Не містить характеру, реплік або конкретних правил персонажа.
// Працює як зв'язка між даними та окремими рушіями.

class AkiraBrain {

    constructor(config = {}) {

        this.config = {
            dataPath: config.dataPath || "./data/",
            saveKey: config.saveKey || "akira_brain_state_v3",

            // 1 реальна секунда = 1 симульована хвилина.
            simulationSpeed:
                Number(config.simulationSpeed) || 1,

            tickInterval:
                Number(config.tickInterval) || 1000,

            autoStart:
                config.autoStart ?? false
        };

        this.data = {};

        this.state = this.createInitialState();

        this.memory = null;
        this.mood = null;
        this.needs = null;
        this.decision = null;
        this.dialogue = null;
        this.relationships = null;
        this.perception = null;
        this.activities = null;
        this.social = null;
        this.tickCount = 0;

        this.running = false;
        this.initialized = false;

        this.timer = null;

        this.lastTick = Date.now();
        this.lastDecision = 0;
        this.lastEventCheck = 0;
        this.lastMemoryUpdate = 0;

        this.actionHistory = [];
        this.eventHistory = [];
        this.dialogueHistory = [];

        this.listeners = {};
    }


    // =========================================================
    // ПОЧАТКОВИЙ СТАН
    // =========================================================

    createInitialState() {

        return {

            initialized: false,

            // -------------------------------------------------
            // Світ
            // -------------------------------------------------

            world: {
                date: null,
                time: null,
                day: null,
                season: null,
                location: "home",
                weather: null
            },

            // -------------------------------------------------
            // Поточна дія
            // -------------------------------------------------

            activity: "idle",

            action: null,

            actionStartedAt: null,

            actionEndsAt: null,

            // -------------------------------------------------
            // Фізичний стан
            // -------------------------------------------------

            energy: 80,

            fatigue: 20,

            focus: 70,

            physicalComfort: 70,

            // -------------------------------------------------
            // Соціальний стан
            // -------------------------------------------------

            socialEnergy: 60,

            socialNeed: 45,

            availability: "available",

            currentPerson: null,

            // -------------------------------------------------
            // Поведінковий стан
            // -------------------------------------------------

            boredom: 20,

            curiosity: 65,

            initiative: 55,

            // -------------------------------------------------
            // Емоції
            // -------------------------------------------------

            emotions: {},

            // -------------------------------------------------
            // Потреби
            // -------------------------------------------------

            needs: {},

            // -------------------------------------------------
            // Цілі
            // -------------------------------------------------

            goals: {
                active: [],
                current: null
            },

            // -------------------------------------------------
            // Стосунки
            // -------------------------------------------------

            relationships: {},

            // -------------------------------------------------
            // Розмова
            // -------------------------------------------------

            conversation: {

                active: false,

                personId: null,

                topic: null,

                topics: [],

                lastInput: null,

                lastResponse: null,

                startedAt: null,

                lastInteractionAt: null
            },

            // -------------------------------------------------
            // Події
            // -------------------------------------------------

            recentEvents: [],

            currentEvent: null,

            // -------------------------------------------------
            // Останні дії
            // -------------------------------------------------

            recentActions: [],

            // -------------------------------------------------
            // Поточна ситуація
            // -------------------------------------------------

            situation: {},

            // -------------------------------------------------
            // Службове
            // -------------------------------------------------

            lastUpdate: null,

            version: 3
        };
    }


    // =========================================================
    // ЗАВАНТАЖЕННЯ ДАНИХ
    // =========================================================

    async loadData() {

        const files = [

            "character",
            "personality",
            "interests",
            "language",
            "memories",
            "emotions",
            "needs",
            "preferences",
            "activities",
            "reactions",
            "rules",
            "weather",
            "world",
            "people",
            "knowledge",
            "skills",
            "habits",
            "topics",
            "goals",
            "events",
            "states",
            "social_network",
            "dialogue_data",
            "dialogue_templates",
            "relationships",
            "calendar",
            "games",
            "media",
            "social",
            "opinions",
            "appearance",
            "life_profile",
            "home",
            "leisure",
            "food",
            "household",
            "intentions",
            "health",
            "accidents",
            "attention",
            "phone",
            "contextual_knowledge",
            "yani"
        ];

        const results = {};

        for (const file of files) {

            try {

                const response =
                    await fetch(
                        `${this.config.dataPath}${file}.json`
                    );

                if (!response.ok) {
                    throw new Error(
                        `${response.status} ${response.statusText}`
                    );
                }

                results[file] =
                    await response.json();

            } catch (error) {

                console.warn(
                    `Не вдалося завантажити ${file}.json`,
                    error
                );

                results[file] = {};
            }
        }

        this.data = results;

        return this.data;
    }


    // =========================================================
    // ІНІЦІАЛІЗАЦІЯ
    // =========================================================

    async init() {

        if (this.initialized) {
            return this;
        }

        await this.loadData();

        this.initializeWorld();
        this.initializeRelationships();
        this.initializeGoals();

        // Спочатку відновлюємо збережений стан.
        this.loadSavedState();

        // Потім створюємо рушії, які працюють
        // поверх поточного стану.
        this.initializeNeeds();

        this.initializeMemory();
        this.initializeMood();
        this.initializeDecision();
        this.initializeDialogue();
        this.initializeExtendedModules();

        this.state.initialized = true;
        this.initialized = true;

        this.lastTick = Date.now();

        this.emit("initialized", this.state);

        if (this.config.autoStart) {
            this.start();
        }

        return this;
    }


    // =========================================================
    // ПОЧАТКОВИЙ СВІТ
    // =========================================================

    initializeWorld() {
        const root = this.data.world || {};
        const world = root.world || root;
        const calendar = world.calendar || {};
        const timeCfg = world.time || {};
        const timeCurrent = timeCfg.current || {};
        const locationCfg = world.location || {};

        const realCalendar = timeCfg.simulation?.realTime !== false;
        const date = realCalendar
            ? this.getToday()
            : ((calendar.year && calendar.month && calendar.day)
                ? `${calendar.year}-${String(calendar.month).padStart(2,"0")}-${String(calendar.day).padStart(2,"0")}`
                : (world.date || this.getToday()));

        const time = (Number.isFinite(Number(timeCurrent.hour)))
            ? `${String(Number(timeCurrent.hour)).padStart(2,"0")}:${String(Number(timeCurrent.minute)||0).padStart(2,"0")}`
            : (typeof world.time === "string" ? world.time : "16:00");

        const parsed = new Date(`${date}T12:00:00`);
        this.state.world = {
            date,
            time,
            day: Number.isNaN(parsed.getTime()) ? this.getDayName() : parsed.toLocaleDateString("en-US", {weekday:"long"}),
            season: calendar.season?.current || world.season || "autumn",
            location: locationCfg.current || world.location || "home",
            weather: this.data.weather?.current || this.data.weather?.weather?.current || null
        };
    }


    // =========================================================
    // СТОСУНКИ
    // =========================================================

    initializeRelationships() {

        const people =
            this.data.people || {};

        const source =
            people.people ||
            people.characters ||
            people;

        const relationships = {};

        for (
            const [personId, person]
            of Object.entries(source)
        ) {

            if (
                !person ||
                typeof person !== "object"
            ) {
                continue;
            }

            relationships[personId] = {

                type:
                    person.relationship?.type ||
                    person.type ||
                    "acquaintance",

                closeness:
                    this.number(
                        person.relationship?.closeness ??
                        person.closeness,
                        0
                    ),

                trust:
                    this.number(
                        person.relationship?.trust ??
                        person.trust,
                        0
                    ),

                respect:
                    this.number(
                        person.relationship?.respect ??
                        person.respect,
                        0
                    ),

                liking:
                    this.number(
                        person.relationship?.liking ??
                        person.liking,
                        0
                    ),

                affection:
                    this.number(
                        person.relationship?.affection ??
                        person.affection,
                        0
                    ),

                attraction:
                    this.number(
                        person.relationship?.attraction ??
                        person.attraction,
                        0
                    ),

                familiarity:
                    this.number(
                        person.relationship?.familiarity ??
                        person.familiarity,
                        0
                    ),

                interestInLife:
                    this.number(
                        person.relationship?.interestInLife ??
                        person.interestInLife,
                        0
                    ),

                desireForContact:
                    this.number(
                        person.relationship?.desireForContact ??
                        person.desireForContact,
                        0
                    ),

                desireToKnowMore:
                    this.number(
                        person.relationship?.desireToKnowMore ??
                        person.desireToKnowMore,
                        0
                    )
            };
        }

        this.state.relationships =
            relationships;
    }


    // =========================================================
    // ПОТРЕБИ
    // =========================================================

    initializeNeeds() {

        if (
            typeof window.AkiraNeeds !==
            "function"
        ) {
            console.warn(
                "AkiraNeeds ще не підключений."
            );

            return;
        }

        this.needs =
            new window.AkiraNeeds(this);

        this.needs.init();
    }


    updateNeeds(minutes) {

        if (!this.needs) {
            return;
        }

        if (
            typeof this.needs.update !==
            "function"
        ) {
            return;
        }

        this.needs.update(minutes);
    }


    // =========================================================
    // ЦІЛІ
    // =========================================================

    initializeGoals() {

        const goals =
            this.data.goals || {};

        const source =
            goals.active ||
            goals.goals ||
            [];

        if (Array.isArray(source)) {

            this.state.goals.active =
                source.map(goal =>
                    ({ ...goal })
                );

        } else {

            this.state.goals.active =
                Object.entries(source)
                    .map(([id, goal]) => ({
                        id,
                        ...goal
                    }));
        }

        this.state.goals.current =
            this.state.goals.active[0] ||
            null;
    }


    // =========================================================
    // МОДУЛІ
    // =========================================================

    initializeMemory() {

        if (
            typeof window.AkiraMemory !==
            "function"
        ) {
            console.warn(
                "AkiraMemory ще не підключений."
            );

            return;
        }

        this.memory =
            new window.AkiraMemory(this);

        this.memory.init?.();

        // Динамічні спогади мають переживати перезавантаження сторінки.
        if (this._savedMemoryState) {
            if (Array.isArray(this._savedMemoryState.memories)) {
                this.memory.memories = this._savedMemoryState.memories
                    .map(memory => this.memory.normalizeMemory(memory));
            }
            if (Array.isArray(this._savedMemoryState.recentlyRecalled)) {
                this.memory.recentlyRecalled = [...this._savedMemoryState.recentlyRecalled];
            }
            this._savedMemoryState = null;
        }
    }


    initializeMood() {

        if (
            typeof window.AkiraMood !==
            "function"
        ) {
            console.warn(
                "AkiraMood ще не підключений."
            );

            return;
        }

        this.mood =
            new window.AkiraMood(this);

        this.mood.init?.();
    }


    initializeDecision() {

        if (
            typeof window.AkiraDecision !==
            "function"
        ) {
            console.warn(
                "AkiraDecision ще не підключений."
            );

            return;
        }

        this.decision =
            new window.AkiraDecision(this);

        this.decision.init?.();
    }


    initializeDialogue() {

        if (
            typeof window.AkiraDialogue !==
            "function"
        ) {
            console.warn(
                "AkiraDialogue ще не підключений."
            );

            return;
        }

        this.dialogue =
            new window.AkiraDialogue(this);
    }


    initializeExtendedModules() {
        const modules = [
            ["relationships", "AkiraRelationships"],
            ["perception", "AkiraPerception"],
            ["activities", "AkiraActivities"],
            ["social", "AkiraSocial"],
            ["calendar", "AkiraCalendar"],
            ["weather", "AkiraWeather"],
            ["opinions", "AkiraOpinions"],
            ["appearance", "AkiraAppearance"],
            ["dailyLife", "AkiraDailyLife"],
            ["leisure", "AkiraLeisure"],
            ["food", "AkiraFood"],
            ["household", "AkiraHousehold"],
            ["intentions", "AkiraIntentions"],
            ["health", "AkiraHealth"],
            ["accidents", "AkiraAccidents"],
            ["attention", "AkiraAttention"],
            ["phone", "AkiraPhone"],
            ["contextualKnowledge", "AkiraContextualKnowledge"],
            ["yaniLife", "AkiraYaniLife"]
        ];
        for (const [property, globalName] of modules) {
            const Ctor = window[globalName];
            if (typeof Ctor !== "function") continue;
            this[property] = new Ctor(this);
            this[property].init?.();
        }
    }

    // =========================================================
    // ЗАПУСК
    // =========================================================

    start() {

        if (this.running) {
            return;
        }

        if (!this.initialized) {

            console.warn(
                "Спочатку потрібно виконати brain.init()."
            );

            return;
        }

        this.running = true;

        this.lastTick = Date.now();

        this.timer =
            setInterval(
                () => this.tick(),
                this.config.tickInterval
            );

        this.emit("started");
    }


    stop() {

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.running = false;

        this.emit("stopped");
    }


    // =========================================================
    // ГОЛОВНИЙ ТАКТ
    // =========================================================

    tick() {

        if (!this.initialized) {
            return;
        }

        const now = Date.now();

        const elapsedRealSeconds =
            Math.max(
                0,
                (now - this.lastTick) / 1000
            );

        this.lastTick = now;

        const simulatedMinutes =
            elapsedRealSeconds *
            this.config.simulationSpeed;

        this.advanceWorld(
            simulatedMinutes
        );

        this.updateNeeds(
            simulatedMinutes
        );

        this.updateMood(
            simulatedMinutes
        );

        this.household?.update?.(simulatedMinutes);
        this.intentions?.update?.(simulatedMinutes);
        this.health?.update?.(simulatedMinutes);
        this.accidents?.update?.(simulatedMinutes);
        this.attention?.update?.(simulatedMinutes);
        this.phone?.update?.(simulatedMinutes);
        this.yaniLife?.update?.(simulatedMinutes);

        this.updateMemory(
            simulatedMinutes
        );

        this.processEvents(
            simulatedMinutes
        );

        this.updateAction(
            simulatedMinutes
        );

        this.evaluateSituation();

        this.considerAutonomousDecision();

        this.state.lastUpdate =
            Date.now();

        this.tickCount++;
        if (this.tickCount % 10 === 0) this.saveState();

        this.emit(
            "tick",
            this.getPublicState()
        );
    }


    // =========================================================
    // ЧАС
    // =========================================================

    advanceWorld(minutes) {

        if (!Number.isFinite(minutes)) {
            return;
        }

        const world =
            this.state.world;

        if (!world.time) {
            world.time = "00:00";
        }

        let [hours, mins] =
            world.time
                .split(":")
                .map(Number);

        mins += minutes;

        while (mins >= 60) {
            mins -= 60;
            hours++;
        }

        while (hours >= 24) {
            hours -= 24;
            const realCalendar = this.data?.world?.world?.time?.simulation?.realTime !== false;
            if (!realCalendar) this.advanceCalendarDay();
        }

        this.calendar?.sync?.();
        this.weather?.update?.(minutes);
        this.appearance?.update?.(minutes);

        world.time =
            `${String(
                Math.floor(hours)
            ).padStart(2, "0")}:${
                String(
                    Math.floor(mins)
                ).padStart(2, "0")
            }`;
    }


    advanceCalendarDay() {

        const date =
            new Date(
                this.state.world.date ||
                this.getToday()
            );

        date.setDate(
            date.getDate() + 1
        );

        this.state.world.date =
            date.toISOString()
                .slice(0, 10);

        this.state.world.day =
            date.toLocaleDateString(
                "en-US",
                {
                    weekday: "long"
                }
            );

        this.updateSeason(date);
    }


    updateSeason(date) {

        const month =
            date.getMonth() + 1;

        if (
            month === 12 ||
            month <= 2
        ) {

            this.state.world.season =
                "winter";

        } else if (
            month <= 5
        ) {

            this.state.world.season =
                "spring";

        } else if (
            month <= 8
        ) {

            this.state.world.season =
                "summer";

        } else {

            this.state.world.season =
                "autumn";
        }
    }


    // =========================================================
    // ЕМОЦІЇ
    // =========================================================

    updateMood(minutes) {

        if (!this.mood) {
            return;
        }

        if (
            typeof this.mood.update ===
            "function"
        ) {

            this.mood.update({
                minutes,
                state: this.state,
                world: this.state.world
            });
        }

        if (
            typeof this.mood.syncToBrain ===
            "function"
        ) {
            this.mood.syncToBrain();
        }
    }


    // =========================================================
    // ПАМ'ЯТЬ
    // =========================================================

    updateMemory(minutes) {

        if (!this.memory) {
            return;
        }

        if (
            typeof this.memory.update ===
            "function"
        ) {

            this.memory.update(
                minutes / 60
            );
        }
    }


    // =========================================================
    // ПОДІЇ
    // =========================================================

    processEvents(minutes) {

        const events =
            this.data.events;

        if (!events) {
            return;
        }

        const now =
            Date.now();

        if (
            now - this.lastEventCheck <
            5000
        ) {
            return;
        }

        this.lastEventCheck = now;

        const generator =
            events.generate ||
            events.generation ||
            null;

        if (!generator) {
            return;
        }

        this.emit(
            "eventCheck",
            {
                minutes,
                generator
            }
        );
    }


    // =========================================================
    // ПОТОЧНА ДІЯ
    // =========================================================

    updateAction(minutes) {

        const action =
            this.state.action;

        if (!action) {
            return;
        }

        if (
            action.endsAt &&
            Date.now() >= action.endsAt
        ) {

            this.finishAction();

            return;
        }
    }


finishAction() {

    const action = this.state.action;

    if (!action) {
        return;
    }

    // Застосовуємо наслідки лише один раз, до очищення action.
    if (!action.effectsApplied && this.needs && action.actionId) {
        this.needs.applyActivity(action.actionId);
        action.effectsApplied = true;
    }

    this.social?.completeAction?.(action);
    this.dailyLife?.completeAction?.(action);
    this.leisure?.completeAction?.(action);
    this.food?.completeAction?.(action);
    this.household?.completeAction?.(action);
    this.intentions?.onActionFinished?.(action);
    this.health?.completeAction?.(action);
    this.accidents?.completeAction?.(action);

    // Використовуємо тільки тригери, які прямо описані в emotions.json.
    if (action.actionId === "rest") {
        this.mood?.trigger?.("rest");
    }
    if (action.actionId === "talkToSomeone" || action.actionId === "talkToYani") {
        this.mood?.trigger?.("positiveInteraction");
    }

    const memoryPerson = action.targetPerson ||
        (action.actionId === "talkToYani" ? "Yani_Bakeneko" : null);

    this.memory?.remember?.({
        type: "activity",
        title: `Завершена дія: ${action.actionId}`,
        content: `Акіра завершив дію: ${action.actionId}`,
        importance: 20,
        topics: [action.actionId],
        keywords: [action.actionId],
        people: memoryPerson ? [memoryPerson] : []
    });

    this.actionHistory.push({
        ...action,
        finishedAt: Date.now(),
        worldFinished: {
            date: this.state.world?.date || null,
            time: this.state.world?.time || null,
            location: this.state.world?.location || null,
            homeRoom: this.state.homeRoom || null
        }
    });

    if (this.actionHistory.length > 50) {
        this.actionHistory.shift();
    }

    this.state.recentActions.push(action.actionId);

    if (this.state.recentActions.length > 10) {
        this.state.recentActions.shift();
    }

    this.state.action = null;
    this.state.activity = "idle";
    this.state.actionStartedAt = null;
    this.state.actionEndsAt = null;

    this.saveState();
    this.emit("actionFinished", action);
}

    // =========================================================
    // АВТОНОМНЕ РІШЕННЯ
    // =========================================================

    considerAutonomousDecision() {

        if (!this.decision) {
            return;
        }

        if (this.state.action) {
            return;
        }

        const now =
            Date.now();

        const cooldown =
            this.getDecisionCooldown();

        if (
            now - this.lastDecision <
            cooldown
        ) {
            return;
        }

        this.lastDecision = now;

        const situation =
            this.evaluateSituation();

        const priorityAction =
            this.health?.getPriorityAction?.(situation) ||
            this.accidents?.getPriorityAction?.(situation) ||
            this.dailyLife?.getPriorityAction?.(situation) ||
            this.intentions?.getPriorityAction?.(situation) ||
            this.food?.getPriorityAction?.(situation) ||
            this.household?.getPriorityAction?.(situation) ||
            this.leisure?.getPriorityAction?.(situation) || null;

        const result = priorityAction ||
            this.decision.decide(
                situation
            );

        if (
            result &&
            result.type === "action"
        ) {

            this.executeAction(result);
        }
    }


    getDecisionCooldown() {

        const activity =
            this.data.activities || {};

        const autonomous =
            activity.autonomous ||
            activity.autonomy ||
            {};

        const min =
            this.number(
                autonomous.minDecisionInterval,
                5
            );

        const max =
            this.number(
                autonomous.maxDecisionInterval,
                30
            );

        const minutes =
            min +
            Math.random() *
            Math.max(
                0,
                max - min
            );

        return (minutes * 1000) / Math.max(0.01, this.config.simulationSpeed);
    }


    // =========================================================
    // СИТУАЦІЯ
    // =========================================================

    evaluateSituation() {

        const mood =
            this.mood
                ?.getState?.() || {};

        const dominant =
            this.mood
                ?.getDominantEmotions?.() || [];

        const modifiers =
            this.mood
                ?.getBehaviorModifiers?.() || {};

        this.state.situation = {
            perception: this.perception?.perceive?.() || null,
            kyivTime: this.getKyivTime(),
            dayPeriod: this.getDayPeriod(),
            isNight: this.isNightInKyiv(),
            isTwilight: this.isTwilightInKyiv(),

            date:
                this.state.world.date,

            time:
                this.state.world.time,

            day:
                this.state.world.day,

            season:
                this.state.world.season,

            location:
                this.state.world.location,

            weather:
                this.state.world.weather,

            activity:
                this.state.activity,

            action:
                this.state.action,

            energy:
                this.state.energy,

            fatigue:
                this.state.fatigue,

            focus:
                this.state.focus,

            socialEnergy:
                this.state.socialEnergy,

            boredom:
                this.state.boredom,

            curiosity:
                this.state.curiosity,

            initiative:
                this.state.initiative,

            availability:
                this.state.availability,

            attention:
                this.state.attention ? { ...this.state.attention } : null,

            phone:
                this.state.phone ? { ...this.state.phone, inbox: undefined } : null,

            needs:
                this.state.needs,

            goals:
                this.state.goals,

            relationships:
                this.state.relationships,

            emotions:
                mood,

            dominantEmotions:
                dominant,

            behaviorModifiers:
                modifiers,

            currentEvent:
                this.state.currentEvent,

            recentActions:
                this.state.recentActions,

            recentEvents:
                this.state.recentEvents
        };

        return this.state.situation;
    }


    // =========================================================
    // ВИКОНАННЯ ДІЇ
    // =========================================================

    executeAction(action) {

        if (!action) {
            return null;
        }

        if (
            action.actionId ===
            "doNothing"
        ) {

            this.state.activity =
                "idle";

            this.emit(
                "action",
                action
            );

            return action;
        }

        // Домашній простір є окремим шаром усередині location=home.
        // Це зберігає сумісність зі старими правилами activities, які очікують саме "home".
        action = this.dailyLife?.prepareAction?.(action) || action;

        const duration =
            this.number(
                action.duration,
                10
            );

        const now =
            Date.now();

        // Для автобіографічної історії фіксуємо не лише epoch, а й
        // календар/симульований час світу на момент початку.
        const worldSnapshot = {
            date: this.state.world?.date || null,
            time: this.state.world?.time || null,
            location: this.state.world?.location || null,
            homeRoom: this.state.homeRoom || null
        };

        // Соціальна дія повинна знати, з ким саме Акіра говорить.
        // Інакше follow-up «з ким?» принципово неможливо відповісти чесно.
        if (action.actionId === "talkToSomeone" && !action.targetPerson) {
            const location = this.state.world?.location;
            if (location === "techsmith") {
                const coworkers = ["Taras", "Kent_White"];
                action.targetPerson = coworkers[Math.floor(Math.random() * coworkers.length)];
            } else {
                action.targetPerson = this.social?.choosePerson?.() || null;
            }
        }

        this.state.action = {
            ...action,
            worldStarted: worldSnapshot,

            startedAt: now,

            endsAt:
                now +
                (duration * 1000) / Math.max(0.01, this.config.simulationSpeed)
        };

        this.state.activity =
            this.getActivityState(
                action
            );

        this.intentions?.onActionStarted?.(this.state.action);

        this.state.actionStartedAt =
            now;

        this.state.actionEndsAt =
            this.state.action.endsAt;

        if (
            action.targetPerson
        ) {

            this.state.currentPerson =
                action.targetPerson;
        }

        this.emit(
            "action",
            this.state.action
        );

        return this.state.action;
    }


    getActivityState(action) {

        const id =
            action.actionId || "";

        const map = {

            sleep: "sleeping",

            eat: "eating",

            drink: "drinking",

            rest: "resting",

            walk: "walking",

            cycle: "cycling",

            read: "reading",

            listenToMusic: "listening",

            playGame: "gaming",

            work: "working",

            talkToSomeone: "talking",

            talkToYani: "talking",

            think: "thinking",

            organizeDesk: "organizing",
            watchStreamer: "watching",
            travelToLeisure: "traveling",
            returnHomeLeisure: "traveling",
            visitMuseum: "visiting",
            visitPlanetarium: "visiting",
            visitTheatre: "visiting",
            visitConcert: "visiting",
            goToCinema: "watching",
            moveRoom: "moving"
        };

        return (
            map[id] ||
            action.category ||
            "active"
        );
    }


    // =========================================================
    // ДІАЛОГ
    // =========================================================

    respond(input, context = {}) {

        if (!this.dialogue) {

            return {
                type: "text",

                text:
                    "Я зараз не можу нормально сформулювати відповідь.",

                timestamp:
                    Date.now()
            };
        }

        const response =
            this.dialogue.respond(
                input,
                {
                    ...context,

                    personId:
                        context.personId ||
                        this.state.currentPerson,

                    relationship:
                        context.relationship ||
                        this.getCurrentRelationship()
                }
            );

        this.state.conversation.active =
            true;

        this.state.conversation.lastInput =
            input;

        this.state.conversation.lastResponse =
            response;

        this.state.conversation.lastInteractionAt =
            Date.now();

        if (response.topic) {

            this.state.conversation.topic =
                response.topic;
        }

        this.dialogueHistory.push({
            input,
            response,
            timestamp: Date.now()
        });

        if (
            this.dialogueHistory.length >
            50
        ) {
            this.dialogueHistory.shift();
        }

        this.emit(
            "dialogue",
            response
        );

        return response;
    }


    getCurrentRelationship() {

        const personId =
            this.state.currentPerson;

        if (!personId) {
            return null;
        }

        return (
            this.state.relationships?.[
                personId
            ] || null
        );
    }


    // =========================================================
    // ЗБЕРЕЖЕННЯ
    // =========================================================

    saveState() {

        try {

            const saveData = {

                state: this.state,

                actionHistory:
                    this.actionHistory.slice(-50),

                eventHistory:
                    this.eventHistory.slice(-50),

                dialogueHistory:
                    this.dialogueHistory.slice(-50),

                memoryState: this.memory ? {
                    memories: this.memory.memories || [],
                    recentlyRecalled: this.memory.recentlyRecalled || []
                } : null,

                savedAt:
                    Date.now()
            };

            localStorage.setItem(
                this.config.saveKey,
                JSON.stringify(saveData)
            );

            return true;

        } catch (error) {

            console.warn(
                "Не вдалося зберегти стан Акіри.",
                error
            );

            return false;
        }
    }


    loadSavedState() {

        try {

            const raw =
                localStorage.getItem(
                    this.config.saveKey
                );

            if (!raw) {
                return false;
            }

            const saved =
                JSON.parse(raw);

            if (
                saved.state &&
                typeof saved.state ===
                "object"
            ) {

                this.state = {
                    ...this.state,
                    ...saved.state,

                    world: {
                        ...this.state.world,
                        ...saved.state.world
                    },

                    conversation: {
                        ...this.state.conversation,
                        ...saved.state.conversation
                    },

                    goals: {
                        ...this.state.goals,
                        ...saved.state.goals
                    }
                };
            }

            if (
                Array.isArray(
                    saved.actionHistory
                )
            ) {
                this.actionHistory =
                    saved.actionHistory;
            }

            if (
                Array.isArray(
                    saved.eventHistory
                )
            ) {
                this.eventHistory =
                    saved.eventHistory;
            }

            if (
                Array.isArray(
                    saved.dialogueHistory
                )
            ) {
                this.dialogueHistory =
                    saved.dialogueHistory;
            }

            if (saved.memoryState && typeof saved.memoryState === "object") {
                this._savedMemoryState = saved.memoryState;
            }

            return true;

        } catch (error) {

            console.warn(
                "Не вдалося завантажити збережений стан.",
                error
            );

            return false;
        }
    }


    // =========================================================
    // ПУБЛІЧНИЙ СТАН
    // =========================================================

    getPublicState() {

        return {

            initialized:
                this.initialized,

            running:
                this.running,

            world:
                { ...this.state.world },

            activity:
                this.state.activity,

            action:
                this.state.action,

            energy:
                this.state.energy,

            fatigue:
                this.state.fatigue,

            socialEnergy:
                this.state.socialEnergy,

            socialNeed:
                this.state.socialNeed,

            boredom:
                this.state.boredom,

            curiosity:
                this.state.curiosity,

            availability:
                this.state.availability,

            attention:
                this.state.attention ? { ...this.state.attention } : null,

            phone:
                this.state.phone ? { ...this.state.phone, inbox: undefined } : null,

            currentPerson:
                this.state.currentPerson,

            needs:
                { ...this.state.needs },

            conversation:
                {
                    ...this.state.conversation
                }
        };
    }


    // =========================================================
    // ПОДІЇ ДЛЯ UI
    // =========================================================

    on(event, callback) {

        if (
            typeof callback !==
            "function"
        ) {
            return;
        }

        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }

        this.listeners[event].push(
            callback
        );
    }


    off(event, callback) {

        if (!this.listeners[event]) {
            return;
        }

        this.listeners[event] =
            this.listeners[event]
                .filter(
                    listener =>
                        listener !== callback
                );
    }


    emit(event, data) {

        const listeners =
            this.listeners[event];

        if (!listeners) {
            return;
        }

        for (
            const listener
            of listeners
        ) {

            try {
                listener(data);

            } catch (error) {

                console.error(
                    `Помилка обробника "${event}"`,
                    error
                );
            }
        }
    }

// =========================================================
// РЕАЛЬНИЙ ЧАС КИЄВА
// =========================================================

getKyivTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("uk-UA", {
        timeZone: "Europe/Kyiv",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
    return formatter.format(now); // "HH:MM"
}

getKyivHour() {
    const time = this.getKyivTime();
    return parseInt(time.split(":")[0], 10);
}

getCurrentWeather() {
    return this.state?.world?.weather || null;
}

getDayPeriod() {
    const hour = this.getKyivHour();

    if (hour >= 5 && hour < 8)   return "світанок";
    if (hour >= 8 && hour < 11)  return "сніданок";
    if (hour >= 11 && hour < 14) return "обід";
    if (hour >= 14 && hour < 17) return "день";
    if (hour >= 17 && hour < 20) return "вечеря";
    if (hour >= 20 && hour < 22) return "вечір";
    if (hour >= 22 || hour < 5)  return "ніч";

    return "день";
}

isNightInKyiv() {
    const hour = this.getKyivHour();
    return hour >= 22 || hour < 6;
}

isTwilightInKyiv() {
    const hour = this.getKyivHour();
    // Приблизні сутінки (можна потім уточнити)
    return (hour >= 5 && hour < 7) || (hour >= 20 && hour < 22);
}

    // =========================================================
    // ДОПОМІЖНІ
    // =========================================================

    number(value, fallback = 0) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }


    clamp(
        value,
        min = 0,
        max = 100
    ) {

        return Math.max(
            min,
            Math.min(
                max,
                this.number(
                    value,
                    min
                )
            )
        );
    }


    getToday() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }


    getDayName() {

        return new Date()
            .toLocaleDateString(
                "en-US",
                {
                    weekday: "long"
                }
            );
    }
}


// =============================================================
// ГЛОБАЛЬНИЙ ЕКЗЕМПЛЯР
// =============================================================

window.AkiraBrain =
    AkiraBrain;


// =============================================================
// АВТОМАТИЧНА ІНІЦІАЛІЗАЦІЯ
// =============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            const brain = new AkiraBrain({
                autoStart: true,          // ← увімкнули
                simulationSpeed: 1        // 1 сек = 1 хв
            });

            window.akiraBrain = brain;

            await brain.init();

            console.log("Акіра: мозок ініціалізовано і запущено.");

        } catch (error) {

            console.error(
                "Не вдалося запустити мозок Акіри:",
                error
            );
        }
    }
);