/*
 * Akira Brain
 * Центральний рушій стану та автономної поведінки персонажа.
 *
 * brain.js НЕ:
 * - генерує текст;
 * - не містить характер Акіри;
 * - не містить конкретних реплік;
 * - не вирішує все одним "mood" числом.
 *
 * brain.js:
 * - завантажує дані;
 * - створює підсистеми;
 * - підтримує поточний стан;
 * - просуває час;
 * - оновлює потреби, емоції та пам'ять;
 * - запускає події;
 * - передає ситуацію decision.js;
 * - виконує обрану дію;
 * - зберігає стан.
 */

class AkiraBrain {

    constructor(options = {}) {

        this.options = {
            dataPath: "data/",
            autoStart: false,

            // 1 реальна секунда = 1 змодельована хвилина
            simulationMinutesPerRealSecond: 1,

            tickInterval: 1000,

            saveInterval: 30000,

            ...options
        };

        this.data = {};

        this.state = {
            initialized: false,
            running: false,

            world: {
                date: null,
                time: null,
                day: null,
                season: null,
                location: "home"
            },

            activity: {
                id: "idle",
                startedAt: null,
                duration: 0,
                remaining: 0
            },

            energy: 80,
            fatigue: 10,
            socialEnergy: 65,
            boredom: 10,
            focus: 60,

            needs: {},

            emotions: {},

            relationships: {},

            goals: [],

            currentGoal: null,

            currentAction: null,

            recentActions: [],
            recentEvents: [],

            conversation: {
                active: false,
                topic: null,
                person: null,
                lastInput: null,
                lastResponse: null
            },

            situation: {
                time: null,
                date: null,
                season: null,
                weather: null,
                location: null,
                activity: null,

                energy: 80,
                fatigue: 10,
                socialEnergy: 65,
                boredom: 10,
                focus: 60,

                needs: {},
                emotions: {},
                relationships: {},

                currentGoal: null,
                recentAction: null,
                recentEvent: null
            }
        };

        this.memory = null;
        this.mood = null;
        this.decision = null;
        this.dialogue = null;

        this.timer = null;
        this.saveTimer = null;

        this.lastTick = null;
        this.lastSave = null;

        this.listeners = {};

        this._isTicking = false;
    }


    /* =========================================================
       EVENTS
       ========================================================= */

    on(eventName, callback) {

        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }

        this.listeners[eventName].push(callback);
    }


    emit(eventName, data = null) {

        const listeners = this.listeners[eventName];

        if (!listeners) {
            return;
        }

        for (const callback of listeners) {

            try {
                callback(data);
            } catch (error) {
                console.error(
                    `[AkiraBrain] Event listener error: ${eventName}`,
                    error
                );
            }
        }
    }


    /* =========================================================
       INITIALIZATION
       ========================================================= */

    async init() {

        if (this.state.initialized) {
            return this;
        }

        console.log("[AkiraBrain] Initializing...");

        await this.loadAllData();

        this.initializeWorld();
        this.initializeState();
        this.initializeRelationships();
        this.initializeGoals();

        this.createSystems();

        this.loadSavedState();

        this.syncSituation();

        this.state.initialized = true;

        this.lastTick = Date.now();
        this.lastSave = Date.now();

        this.emit("initialized", this);

        console.log("[AkiraBrain] Initialized.");

        if (this.options.autoStart) {
            this.start();
        }

        return this;
    }


    /* =========================================================
       DATA LOADING
       ========================================================= */

    async loadAllData() {

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
            "dialogue_templates"
        ];

        const results = await Promise.all(
            files.map(async (name) => {

                const url = `${this.options.dataPath}${name}.json`;

                try {

                    const response = await fetch(url, {
                        cache: "no-cache"
                    });

                    if (!response.ok) {
                        throw new Error(
                            `HTTP ${response.status}: ${url}`
                        );
                    }

                    const data = await response.json();

                    return {
                        name,
                        data
                    };

                } catch (error) {

                    console.error(
                        `[AkiraBrain] Failed to load ${url}`,
                        error
                    );

                    return {
                        name,
                        data: null,
                        error
                    };
                }
            })
        );

        for (const result of results) {

            this.data[result.name] = result.data;

            if (result.error) {
                console.warn(
                    `[AkiraBrain] Data unavailable: ${result.name}`
                );
            }
        }
    }


    /* =========================================================
       WORLD
       ========================================================= */

    initializeWorld() {

        const world = this.data.world || {};

        const current =
            world.current ||
            world.timeState ||
            world.simulation ||
            {};

        this.state.world.date =
            current.date ||
            world.currentDate ||
            "2026-09-22";

        this.state.world.time =
            current.time ||
            world.currentTime ||
            "16:00";

        this.state.world.day =
            current.day ||
            current.weekday ||
            world.currentDay ||
            "Tuesday";

        this.state.world.season =
            current.season ||
            world.currentSeason ||
            "autumn";

        this.state.world.location =
            current.location ||
            world.currentLocation ||
            "home";
    }


    getWorldTime() {
        return this.state.world.time;
    }


    getWorldDate() {
        return this.state.world.date;
    }


    getCurrentTimestamp() {

        return {
            date: this.state.world.date,
            time: this.state.world.time
        };
    }


    /* =========================================================
       STATE INITIALIZATION
       ========================================================= */

    initializeState() {

        const stateData =
            this.data.states?.current ||
            this.data.states?.initial ||
            {};

        const needsData =
            this.data.needs?.current ||
            this.data.needs?.baseline ||
            this.data.needs ||
            {};

        const emotionsData =
            this.data.emotions?.current ||
            this.data.emotions?.baseline ||
            this.data.emotions?.initial ||
            {};

        this.state.energy =
            stateData.energy ??
            needsData.energy ??
            80;

        this.state.fatigue =
            stateData.fatigue ??
            10;

        this.state.socialEnergy =
            stateData.socialEnergy ??
            65;

        this.state.boredom =
            stateData.boredom ??
            10;

        this.state.focus =
            stateData.focus ??
            60;

        this.state.needs =
            this.extractNumericObject(needsData);

        this.state.emotions =
            this.extractNumericObject(emotionsData);
    }


    extractNumericObject(source) {

        const result = {};

        if (!source || typeof source !== "object") {
            return result;
        }

        for (const [key, value] of Object.entries(source)) {

            if (typeof value === "number") {
                result[key] = value;
                continue;
            }

            if (
                value &&
                typeof value === "object" &&
                typeof value.value === "number"
            ) {
                result[key] = value.value;
            }
        }

        return result;
    }


    /* =========================================================
       RELATIONSHIPS
       ========================================================= */

    initializeRelationships() {

        const people = this.data.people;

        if (!people) {
            return;
        }

        const source =
            people.people ||
            people.characters ||
            people.relationships ||
            people;

        if (!source || typeof source !== "object") {
            return;
        }

        for (const [id, person] of Object.entries(source)) {

            if (!person || typeof person !== "object") {
                continue;
            }

            this.state.relationships[id] = {
                id,

                name:
                    person.name ||
                    person.fullName ||
                    id,

                type:
                    person.relationship?.type ||
                    person.relationshipType ||
                    person.type ||
                    "acquaintance",

                closeness:
                    this.getNumber(
                        person.relationship?.closeness,
                        person.closeness,
                        0
                    ),

                trust:
                    this.getNumber(
                        person.relationship?.trust,
                        person.trust,
                        0
                    ),

                respect:
                    this.getNumber(
                        person.relationship?.respect,
                        person.respect,
                        0
                    ),

                liking:
                    this.getNumber(
                        person.relationship?.liking,
                        person.liking,
                        0
                    ),

                affection:
                    this.getNumber(
                        person.relationship?.affection,
                        person.affection,
                        0
                    ),

                attraction:
                    this.getNumber(
                        person.relationship?.attraction,
                        person.attraction,
                        0
                    ),

                jealousy:
                    this.getNumber(
                        person.relationship?.jealousy,
                        person.jealousy,
                        0
                    ),

                irritation:
                    this.getNumber(
                        person.relationship?.irritation,
                        person.irritation,
                        0
                    ),

                desireForContact:
                    this.getNumber(
                        person.relationship?.desireForContact,
                        person.desireForContact,
                        0
                    ),

                desireToKnowMore:
                    this.getNumber(
                        person.relationship?.desireToKnowMore,
                        person.desireToKnowMore,
                        0
                    )
            };
        }
    }


    /* =========================================================
       GOALS
       ========================================================= */

    initializeGoals() {

        const goals = this.data.goals;

        if (!goals) {
            return;
        }

        const source =
            goals.active ||
            goals.current ||
            goals.goals ||
            [];

        if (Array.isArray(source)) {

            this.state.goals = source.map(goal => ({
                ...goal
            }));

        } else if (typeof source === "object") {

            this.state.goals = Object.entries(source)
                .map(([id, goal]) => ({
                    id,
                    ...goal
                }));
        }

        this.updateCurrentGoal();
    }


    updateCurrentGoal() {

        if (!Array.isArray(this.state.goals)) {
            this.state.currentGoal = null;
            return;
        }

        const active = this.state.goals
            .filter(goal => {
                if (goal.active === false) {
                    return false;
                }

                if (goal.completed === true) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => {

                const scoreA =
                    this.goalPriority(a);

                const scoreB =
                    this.goalPriority(b);

                return scoreB - scoreA;
            });

        this.state.currentGoal =
            active.length > 0
                ? active[0]
                : null;
    }


    goalPriority(goal) {

        if (!goal) {
            return 0;
        }

        return (
            (Number(goal.importance) || 0) * 0.35 +
            (Number(goal.urgency) || 0) * 0.30 +
            (Number(goal.motivation) || 0) * 0.20 +
            (Number(goal.emotionalValue) || 0) * 0.15
        );
    }


    /* =========================================================
       SYSTEMS
       ========================================================= */

    createSystems() {

        if (
            window.AkiraMemory &&
            !this.memory
        ) {
            this.memory =
                new window.AkiraMemory(this);

            if (typeof this.memory.init === "function") {
                this.memory.init();
            }
        }


        if (
            window.AkiraMood &&
            !this.mood
        ) {
            this.mood =
                new window.AkiraMood(this);

            if (typeof this.mood.init === "function") {
                this.mood.init();
            }
        }


        if (
            window.AkiraDecision &&
            !this.decision
        ) {
            this.decision =
                new window.AkiraDecision(this);

            if (typeof this.decision.init === "function") {
                this.decision.init();
            }
        }


        if (
            window.AkiraDialogue &&
            !this.dialogue
        ) {
            this.dialogue =
                new window.AkiraDialogue(this);
        }


        if (!this.memory) {
            console.warn(
                "[AkiraBrain] memory.js is not loaded."
            );
        }

        if (!this.mood) {
            console.warn(
                "[AkiraBrain] mood.js is not loaded."
            );
        }

        if (!this.decision) {
            console.warn(
                "[AkiraBrain] decision.js is not loaded."
            );
        }

        if (!this.dialogue) {
            console.warn(
                "[AkiraBrain] dialogue.js is not loaded."
            );
        }
    }


    /* =========================================================
       SIMULATION CLOCK
       ========================================================= */

    advanceTime(minutes) {

        if (!Number.isFinite(minutes) || minutes <= 0) {
            return;
        }

        let totalMinutes =
            this.timeToMinutes(
                this.state.world.time
            );

        totalMinutes += minutes;

        let daysPassed = 0;

        while (totalMinutes >= 1440) {
            totalMinutes -= 1440;
            daysPassed++;
        }

        this.state.world.time =
            this.minutesToTime(totalMinutes);

        if (daysPassed > 0) {
            this.advanceDate(daysPassed);
        }

        this.updateDayName();
    }


    timeToMinutes(time) {

        if (typeof time !== "string") {
            return 0;
        }

        const parts = time.split(":");

        if (parts.length < 2) {
            return 0;
        }

        const hours =
            Number(parts[0]) || 0;

        const minutes =
            Number(parts[1]) || 0;

        return (
            Math.max(0, Math.min(23, hours)) * 60 +
            Math.max(0, Math.min(59, minutes))
        );
    }


    minutesToTime(minutes) {

        minutes =
            Math.max(
                0,
                Math.min(1439, Math.floor(minutes))
            );

        const hours =
            Math.floor(minutes / 60);

        const mins =
            minutes % 60;

        return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }


    advanceDate(days) {

        if (!this.state.world.date) {
            return;
        }

        const date =
            new Date(
                `${this.state.world.date}T00:00:00`
            );

        if (Number.isNaN(date.getTime())) {
            return;
        }

        date.setDate(
            date.getDate() + days
        );

        this.state.world.date =
            date.toISOString().slice(0, 10);
    }


    updateDayName() {

        const date =
            new Date(
                `${this.state.world.date}T00:00:00`
            );

        if (Number.isNaN(date.getTime())) {
            return;
        }

        const names = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        this.state.world.day =
            names[date.getDay()];
    }


    /* =========================================================
       WORLD UPDATE
       ========================================================= */

    updateWorld(minutes) {

        this.advanceTime(minutes);

        const world =
            this.data.world || {};

        const current =
            world.current ||
            world.simulation ||
            {};

        if (current.season) {
            this.state.world.season =
                current.season;
        }

        if (current.location) {
            this.state.world.location =
                current.location;
        }
    }


    /* =========================================================
       NEEDS
       ========================================================= */

    updateNeeds(minutes) {

        if (!this.state.needs) {
            this.state.needs = {};
        }

        const needsData =
            this.data.needs || {};

        const drift =
            needsData.driftPerHour ||
            needsData.drift ||
            {};

        const hours =
            minutes / 60;

        for (const [need, value] of Object.entries(drift)) {

            if (typeof value !== "number") {
                continue;
            }

            if (
                typeof this.state.needs[need] !== "number"
            ) {
                this.state.needs[need] = 50;
            }

            this.state.needs[need] +=
                value * hours;

            this.state.needs[need] =
                this.clamp(
                    this.state.needs[need],
                    0,
                    100
                );
        }


        /*
         * Основні фізичні показники.
         * Це не заміна needs.js — лише місток
         * між симуляцією часу та станом brain.
         */

        const sleep =
            this.getNeed("sleep", 80);

        const hunger =
            this.getNeed("hunger", 20);

        const thirst =
            this.getNeed("thirst", 20);

        if (sleep < 40) {
            this.state.fatigue +=
                minutes * 0.04;
        }

        if (sleep < 20) {
            this.state.fatigue +=
                minutes * 0.08;
        }

        if (hunger > 70) {
            this.state.energy -=
                minutes * 0.015;
        }

        if (thirst > 70) {
            this.state.energy -=
                minutes * 0.02;
        }

        this.state.fatigue =
            this.clamp(
                this.state.fatigue,
                0,
                100
            );

        this.state.energy =
            this.clamp(
                this.state.energy,
                0,
                100
            );
    }


    getNeed(name, fallback = 50) {

        const value =
            this.state.needs?.[name];

        return typeof value === "number"
            ? value
            : fallback;
    }


    /* =========================================================
       EMOTIONS
       ========================================================= */

    updateEmotions(minutes) {

        if (!this.mood) {
            return;
        }

        /*
         * Уся логіка поточних емоцій знаходиться
         * в mood.js.
         *
         * brain.js лише передає час.
         */

        try {

            if (typeof this.mood.update === "function") {
                this.mood.update(minutes);
            }

        } catch (error) {

            console.error(
                "[AkiraBrain] Mood update failed:",
                error
            );
        }


        this.syncEmotionState();
    }


    syncEmotionState() {

        if (!this.mood) {
            return;
        }

        try {

            if (
                typeof this.mood.getState === "function"
            ) {

                const state =
                    this.mood.getState();

                if (state && typeof state === "object") {

                    this.state.emotions =
                        this.extractNumericObject(
                            state.emotions ||
                            state
                        );
                }
            }

        } catch (error) {

            console.warn(
                "[AkiraBrain] Could not sync mood state.",
                error
            );
        }
    }


    /* =========================================================
       MEMORY
       ========================================================= */

    updateMemory(minutes) {

        if (!this.memory) {
            return;
        }

        try {

            if (
                typeof this.memory.update === "function"
            ) {
                this.memory.update(
                    minutes / 60
                );
            }

        } catch (error) {

            console.error(
                "[AkiraBrain] Memory update failed:",
                error
            );
        }
    }


    /* =========================================================
       EVENTS
       ========================================================= */

    processEvents() {

        /*
         * events.js ще немає окремим модулем.
         * Тому зараз brain тільки читає
         * зовнішні/заплановані події, якщо вони
         * описані у world/events.json.
         *
         * Окремий Event Engine краще підключити
         * пізніше, не роздуваючи brain.js.
         */

        const events =
            this.data.events;

        if (!events) {
            return;
        }

        const currentTime =
            this.timeToMinutes(
                this.state.world.time
            );

        const scheduled =
            events.scheduled ||
            events.current ||
            [];

        if (!Array.isArray(scheduled)) {
            return;
        }

        for (const event of scheduled) {

            if (!event || !event.time) {
                continue;
            }

            const eventTime =
                this.timeToMinutes(
                    event.time
                );

            if (
                Math.abs(
                    eventTime - currentTime
                ) < 1
            ) {

                this.recordEvent(event);
            }
        }
    }


    recordEvent(event) {

        if (!event) {
            return;
        }

        const entry = {
            id:
                event.id ||
                `event_${Date.now()}`,

            type:
                event.type ||
                "world",

            title:
                event.title ||
                event.name ||
                null,

            timestamp:
                this.getCurrentTimestamp(),

            data: event
        };

        this.state.recentEvents.unshift(
            entry
        );

        this.state.recentEvents =
            this.state.recentEvents.slice(
                0,
                30
            );

        this.emit(
            "event",
            entry
        );


        if (this.mood) {

            try {

                if (
                    typeof this.mood.reactToEvent ===
                    "function"
                ) {
                    this.mood.reactToEvent(
                        event
                    );
                }

            } catch (error) {

                console.warn(
                    "[AkiraBrain] Event emotion reaction failed.",
                    error
                );
            }
        }


        if (this.memory) {

            try {

                if (
                    typeof this.memory.recordMemoryEvent ===
                    "function"
                ) {
                    this.memory.recordMemoryEvent(
                        event
                    );
                }

            } catch (error) {

                console.warn(
                    "[AkiraBrain] Event memory recording failed.",
                    error
                );
            }
        }
    }


    /* =========================================================
       SITUATION
       ========================================================= */

    syncSituation() {

        this.updateCurrentGoal();

        this.state.situation = {

            time:
                this.state.world.time,

            date:
                this.state.world.date,

            season:
                this.state.world.season,

            day:
                this.state.world.day,

            weather:
                this.getCurrentWeather(),

            location:
                this.state.world.location,

            activity:
                this.state.activity.id,

            energy:
                this.state.energy,

            fatigue:
                this.state.fatigue,

            socialEnergy:
                this.state.socialEnergy,

            boredom:
                this.state.boredom,

            focus:
                this.state.focus,

            needs:
                {
                    ...this.state.needs
                },

            emotions:
                {
                    ...this.state.emotions
                },

            relationships:
                this.state.relationships,

            currentGoal:
                this.state.currentGoal,

            recentAction:
                this.state.recentActions[0] ||
                null,

            recentEvent:
                this.state.recentEvents[0] ||
                null
        };
    }


    evaluateSituation() {

        this.syncSituation();

        return {
            ...this.state.situation
        };
    }


    getCurrentWeather() {

        const weather =
            this.data.weather;

        if (!weather) {
            return null;
        }

        return (
            weather.current ||
            weather.state ||
            weather
        );
    }


    /* =========================================================
       DECISION
       ========================================================= */

    decide(context = {}) {

        if (!this.decision) {
            console.warn(
                "[AkiraBrain] Decision system unavailable."
            );

            return null;
        }

        const situation =
            this.evaluateSituation();

        const decisionContext = {
            ...situation,
            ...context
        };

        try {

            const result =
                this.decision.decide(
                    decisionContext
                );

            if (result) {
                this.state.currentAction =
                    result;
            }

            return result;

        } catch (error) {

            console.error(
                "[AkiraBrain] Decision failed:",
                error
            );

            return null;
        }
    }


    /* =========================================================
       ACTION EXECUTION
       ========================================================= */

    executeAction(action) {

        if (!action) {
            return null;
        }

        const actionId =
            action.actionId ||
            action.id ||
            action.type ||
            "doNothing";

        const duration =
            Number(action.duration) ||
            5;


        const startedAt =
            this.getCurrentTimestamp();


        this.state.currentAction = {
            ...action,

            actionId,

            startedAt,

            duration,

            remaining: duration
        };


        this.state.activity = {
            id: actionId,

            startedAt,

            duration,

            remaining: duration
        };


        this.applyActionEffects(
            actionId,
            action,
            duration
        );


        this.state.recentActions.unshift({

            actionId,

            timestamp:
                startedAt,

            duration,

            targetPerson:
                action.targetPerson ||
                null,

            reason:
                action.reason ||
                null
        });


        this.state.recentActions =
            this.state.recentActions.slice(
                0,
                30
            );


        this.emit(
            "action",
            this.state.currentAction
        );


        return this.state.currentAction;
    }


    applyActionEffects(
        actionId,
        action,
        duration
    ) {

        const minutes =
            Math.max(
                1,
                Number(duration) || 1
            );


        /*
         * Базові фізичні ефекти.
         *
         * Детальні ефекти діяльностей мають
         * залишатися в activities.json.
         */

        const activity =
            this.findActivity(actionId);


        if (activity) {

            const effects =
                activity.effects ||
                activity.stateEffects ||
                {};


            this.applyNumericEffects(
                effects,
                minutes
            );
        }


        /*
         * Загальні fallback-ефекти.
         */

        switch (actionId) {

            case "sleep":

                this.state.energy +=
                    minutes * 0.7;

                this.state.fatigue -=
                    minutes * 0.8;

                this.setNeedDelta(
                    "sleep",
                    -minutes * 0.8
                );

                break;


            case "eat":

                this.state.energy +=
                    minutes * 0.3;

                this.setNeedDelta(
                    "hunger",
                    -minutes * 1.2
                );

                break;


            case "drink":

                this.setNeedDelta(
                    "thirst",
                    -minutes * 1.5
                );

                break;


            case "rest":

                this.state.fatigue -=
                    minutes * 0.4;

                this.state.energy +=
                    minutes * 0.15;

                break;


            case "walk":
            case "cycle":

                this.state.energy -=
                    minutes * 0.18;

                this.state.fatigue +=
                    minutes * 0.10;

                this.state.boredom -=
                    minutes * 0.12;

                break;


            case "talkToSomeone":

                this.state.socialEnergy -=
                    minutes * 0.08;

                this.state.boredom -=
                    minutes * 0.10;

                break;


            case "talkToYani":

                this.state.socialEnergy -=
                    minutes * 0.05;

                this.state.boredom -=
                    minutes * 0.15;

                break;


            case "read":

                this.state.focus +=
                    minutes * 0.05;

                this.state.boredom -=
                    minutes * 0.08;

                break;


            case "playGame":

                this.state.boredom -=
                    minutes * 0.18;

                this.state.focus +=
                    minutes * 0.03;

                break;


            case "checkSocialNetwork":

                this.state.boredom -=
                    minutes * 0.08;

                break;


            case "doNothing":

                this.state.boredom +=
                    minutes * 0.03;

                break;
        }


        this.state.energy =
            this.clamp(
                this.state.energy,
                0,
                100
            );

        this.state.fatigue =
            this.clamp(
                this.state.fatigue,
                0,
                100
            );

        this.state.socialEnergy =
            this.clamp(
                this.state.socialEnergy,
                0,
                100
            );

        this.state.boredom =
            this.clamp(
                this.state.boredom,
                0,
                100
            );

        this.state.focus =
            this.clamp(
                this.state.focus,
                0,
                100
            );
    }


    findActivity(actionId) {

        const data =
            this.data.activities;

        if (!data) {
            return null;
        }

        const source =
            data.activities ||
            data.actions ||
            data;

        if (Array.isArray(source)) {

            return source.find(
                activity =>
                    activity &&
                    (
                        activity.id === actionId ||
                        activity.actionId === actionId
                    )
            ) || null;
        }

        if (typeof source === "object") {

            if (source[actionId]) {
                return {
                    id: actionId,
                    ...source[actionId]
                };
            }
        }

        return null;
    }


    applyNumericEffects(
        effects,
        minutes
    ) {

        if (!effects || typeof effects !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(effects)) {

            if (typeof value !== "number") {
                continue;
            }

            if (key === "energy") {
                this.state.energy +=
                    value * minutes;
            }

            else if (key === "fatigue") {
                this.state.fatigue +=
                    value * minutes;
            }

            else if (key === "socialEnergy") {
                this.state.socialEnergy +=
                    value * minutes;
            }

            else if (key === "boredom") {
                this.state.boredom +=
                    value * minutes;
            }

            else if (key === "focus") {
                this.state.focus +=
                    value * minutes;
            }

            else {
                this.setNeedDelta(
                    key,
                    value * minutes
                );
            }
        }
    }


    setNeedDelta(
        need,
        delta
    ) {

        if (!this.state.needs) {
            this.state.needs = {};
        }

        if (
            typeof this.state.needs[need] !==
            "number"
        ) {
            this.state.needs[need] = 50;
        }

        this.state.needs[need] =
            this.clamp(
                this.state.needs[need] + delta,
                0,
                100
            );
    }


    /* =========================================================
       ACTION PROGRESS
       ========================================================= */

    updateCurrentAction(minutes) {

        const activity =
            this.state.activity;

        if (!activity) {
            return;
        }

        if (
            !activity.id ||
            activity.id === "idle"
        ) {
            return;
        }

        activity.remaining -= minutes;

        if (activity.remaining <= 0) {

            const finished =
                this.state.currentAction;

            this.finishAction(
                finished
            );
        }
    }


    finishAction(action) {

        if (!action) {
            return;
        }

        this.state.activity = {
            id: "idle",
            startedAt: null,
            duration: 0,
            remaining: 0
        };

        this.state.currentAction = null;

        this.emit(
            "actionFinished",
            action
        );
    }


    /* =========================================================
       AUTONOMOUS TICK
       ========================================================= */

    async tick() {

        if (
            !this.state.initialized ||
            this._isTicking
        ) {
            return;
        }

        this._isTicking = true;

        try {

            const now = Date.now();

            const elapsed =
                this.lastTick
                    ? now - this.lastTick
                    : this.options.tickInterval;

            this.lastTick = now;


            let minutes =
                (
                    elapsed / 1000
                ) *
                this.options.simulationMinutesPerRealSecond;


            /*
             * Захист від величезкого стрибка часу,
             * якщо вкладку залишили відкритою після
             * довгої паузи.
             */

            minutes =
                this.clamp(
                    minutes,
                    0,
                    60
                );


            this.updateWorld(minutes);

            this.updateCurrentAction(minutes);

            this.updateNeeds(minutes);

            this.updateEmotions(minutes);

            this.updateMemory(minutes);

            this.processEvents();

            this.updateBoredom(minutes);

            this.syncSituation();


            /*
             * Якщо дія завершилась — Акіра може
             * вибрати наступну.
             */

            if (
                !this.state.currentAction
            ) {

                const action =
                    this.decide();

                if (action) {
                    this.executeAction(
                        action
                    );
                }
            }


            this.syncSituation();

            this.emit(
                "tick",
                this.state
            );


            if (
                Date.now() - this.lastSave >=
                this.options.saveInterval
            ) {

                this.saveState();

                this.lastSave =
                    Date.now();
            }

        } catch (error) {

            console.error(
                "[AkiraBrain] Tick error:",
                error
            );

        } finally {

            this._isTicking = false;
        }
    }


    updateBoredom(minutes) {

        const fun =
            this.getNeed(
                "fun",
                55
            );

        const social =
            this.getNeed(
                "social",
                45
            );

        if (fun < 30) {

            this.state.boredom +=
                minutes * 0.03;
        }

        if (social < 25) {

            this.state.boredom +=
                minutes * 0.02;
        }

        this.state.boredom =
            this.clamp(
                this.state.boredom,
                0,
                100
            );
    }


    /* =========================================================
       START / STOP
       ========================================================= */

    start() {

        if (this.state.running) {
            return;
        }

        if (!this.state.initialized) {
            console.warn(
                "[AkiraBrain] Call init() before start()."
            );

            return;
        }

        this.state.running = true;
        this.lastTick = Date.now();

        this.timer =
            setInterval(
                () => this.tick(),
                this.options.tickInterval
            );

        this.emit(
            "started",
            this.state
        );

        console.log(
            "[AkiraBrain] Simulation started."
        );
    }


    stop() {

        if (!this.state.running) {
            return;
        }

        clearInterval(
            this.timer
        );

        this.timer = null;

        this.state.running = false;

        this.saveState();

        this.emit(
            "stopped",
            this.state
        );

        console.log(
            "[AkiraBrain] Simulation stopped."
        );
    }


    /* =========================================================
       CONVERSATION
       ========================================================= */

    async respond(input, context = {}) {

        if (!this.dialogue) {

            console.warn(
                "[AkiraBrain] Dialogue system unavailable."
            );

            return {
                type: "silence",
                text: ""
            };
        }

        this.state.conversation.lastInput =
            input;

        try {

            const result =
                await this.dialogue.respond(
                    input,
                    {
                        ...context,

                        situation:
                            this.evaluateSituation()
                    }
                );

            if (result) {

                this.state.conversation.lastResponse =
                    result.text ||
                    "";

                this.emit(
                    "response",
                    result
                );
            }

            return result;

        } catch (error) {

            console.error(
                "[AkiraBrain] Dialogue failed:",
                error
            );

            return {
                type: "silence",
                text: ""
            };
        }
    }


    /* =========================================================
       STATE SAVE / LOAD
       ========================================================= */

    saveState() {

        try {

            const saveData = {

                version: 1,

                savedAt:
                    new Date().toISOString(),

                world:
                    this.state.world,

                activity:
                    this.state.activity,

                energy:
                    this.state.energy,

                fatigue:
                    this.state.fatigue,

                socialEnergy:
                    this.state.socialEnergy,

                boredom:
                    this.state.boredom,

                focus:
                    this.state.focus,

                needs:
                    this.state.needs,

                emotions:
                    this.state.emotions,

                relationships:
                    this.state.relationships,

                goals:
                    this.state.goals,

                currentGoal:
                    this.state.currentGoal,

                currentAction:
                    this.state.currentAction,

                recentActions:
                    this.state.recentActions,

                recentEvents:
                    this.state.recentEvents,

                conversation:
                    this.state.conversation
            };


            localStorage.setItem(
                "akira_brain_state_v3",
                JSON.stringify(
                    saveData
                )
            );


            /*
             * Окремі системи можуть мати
             * власні механізми збереження.
             */

            if (
                this.memory &&
                typeof this.memory.save === "function"
            ) {
                this.memory.save();
            }


            this.emit(
                "saved",
                saveData
            );


            return true;

        } catch (error) {

            console.error(
                "[AkiraBrain] Save failed:",
                error
            );

            return false;
        }
    }


    loadSavedState() {

        try {

            const raw =
                localStorage.getItem(
                    "akira_brain_state_v3"
                );

            if (!raw) {
                return false;
            }

            const saved =
                JSON.parse(raw);

            if (!saved || typeof saved !== "object") {
                return false;
            }


            /*
             * Не завантажуємо blindly весь state.
             * Дані JSON залишаються джерелом
             * базової конфігурації.
             */

            if (saved.world) {
                this.state.world = {
                    ...this.state.world,
                    ...saved.world
                };
            }

            if (saved.activity) {
                this.state.activity = {
                    ...this.state.activity,
                    ...saved.activity
                };
            }

            if (typeof saved.energy === "number") {
                this.state.energy =
                    saved.energy;
            }

            if (typeof saved.fatigue === "number") {
                this.state.fatigue =
                    saved.fatigue;
            }

            if (
                typeof saved.socialEnergy ===
                "number"
            ) {
                this.state.socialEnergy =
                    saved.socialEnergy;
            }

            if (typeof saved.boredom === "number") {
                this.state.boredom =
                    saved.boredom;
            }

            if (typeof saved.focus === "number") {
                this.state.focus =
                    saved.focus;
            }

            if (saved.needs) {
                this.state.needs =
                    {
                        ...this.state.needs,
                        ...saved.needs
                    };
            }

            if (saved.emotions) {
                this.state.emotions =
                    {
                        ...this.state.emotions,
                        ...saved.emotions
                    };
            }

            if (saved.relationships) {
                this.state.relationships =
                    saved.relationships;
            }

            if (Array.isArray(saved.goals)) {
                this.state.goals =
                    saved.goals;
            }

            if (saved.currentGoal) {
                this.state.currentGoal =
                    saved.currentGoal;
            }

            if (Array.isArray(saved.recentActions)) {
                this.state.recentActions =
                    saved.recentActions;
            }

            if (Array.isArray(saved.recentEvents)) {
                this.state.recentEvents =
                    saved.recentEvents;
            }

            if (saved.conversation) {
                this.state.conversation =
                    {
                        ...this.state.conversation,
                        ...saved.conversation
                    };
            }


            this.emit(
                "loaded",
                saved
            );


            return true;

        } catch (error) {

            console.warn(
                "[AkiraBrain] Could not load saved state.",
                error
            );

            return false;
        }
    }


    resetState() {

        localStorage.removeItem(
            "akira_brain_state_v3"
        );

        location.reload();
    }


    /* =========================================================
       HELPERS
       ========================================================= */

    getNumber(...values) {

        for (const value of values) {

            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                return value;
            }
        }

        return 0;
    }


    clamp(
        value,
        min,
        max
    ) {

        return Math.max(
            min,
            Math.min(
                max,
                Number(value) || 0
            )
        );
    }


    getState() {

        return this.state;
    }


    getData(name) {

        return this.data[name];
    }
}


/* =========================================================
   GLOBAL INSTANCE
   ========================================================= */

window.AkiraBrain = AkiraBrain;

window.akiraBrain =
    new AkiraBrain({
        autoStart: false
    });


/* =========================================================
   AUTO INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await window.akiraBrain.init();

            /*
             * Навмисно НЕ запускаємо симуляцію автоматично.
             *
             * Поки що:
             *
             * akiraBrain.start()
             *
             * має запускатися окремо.
             */

        } catch (error) {

            console.error(
                "[AkiraBrain] Initialization failed:",
                error
            );
        }
    }
);
