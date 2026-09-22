/*
 * ============================================================
 * BRAIN.JS
 * Центральний координатор програмного мозку Акіри
 * ============================================================
 *
 * brain.js НЕ містить усю логіку персонажа.
 *
 * Він координує окремі системи:
 *
 * character.json
 * personality.json
 * interests.json
 * language.json
 * memories.json
 * emotions.json
 * needs.json
 * preferences.json
 * activities.json
 * reactions.json
 * rules.json
 * weather.json
 * world.json
 * people.json
 * knowledge.json
 * skills.json
 * habits.json
 * topics.json
 * goals.json
 * events.json
 * states.json
 * social_network.json
 * dialogue_data.json
 * dialogue_templates.json
 *
 *        ↓
 *
 * brain.js
 *        ↓
 * ┌──────────────┬──────────────┬──────────────┐
 * │    memory    │     mood     │   decision   │
 * │   пам'ять    │   емоції     │   рішення    │
 * └──────────────┴──────────────┴──────────────┘
 *                       ↓
 *                   dialogue
 *
 * brain.js координує системи,
 * але не замінює їх.
 * ============================================================
 */

class AkiraBrain {
  constructor(options = {}) {
    this.options = {
      dataPath: options.dataPath || "./data/",
      tickInterval: options.tickInterval || 1000,
      simulatedMinutesPerTick:
        options.simulatedMinutesPerTick || 1
    };

    /*
     * Усі JSON-дані.
     */
    this.data = {};

    /*
     * Поточний стан персонажа.
     */
    this.state = {
      initialized: false,

      world: {
        date: null,
        time: null,
        season: null,
        location: null,
        weather: null
      },

      activity: {
        current: "idle",
        startedAt: null,
        duration: 0
      },

      needs: {},

      emotions: {},
      emotionDetails: {},
      emotionEffects: {},
      emotionalGlobal: {
        valence: 50,
        arousal: 50
      },

      relationships: {},

      goals: [],

      currentGoal: null,

      physical: {
        energy: 80,
        fatigue: 0
      },

      mental: {
        focus: 70,
        stress: 10
      },

      social: {
        socialEnergy: 60,
        availability: "available"
      },

      behavior: {
        lastAction: null,
        recentActions: [],
        nextDecisionAt: null
      },

      conversation: {
        active: false,
        topic: null,
        history: []
      },

      situation: {
        topics: [],
        people: [],
        events: [],
        context: {}
      },

      recentEvents: [],

      initializedAt: null,
      lastTick: null
    };

    /*
     * Окремі механізми.
     */
    this.memory = null;
    this.mood = null;
    this.decision = null;
    this.dialogue = null;

    /*
     * Службові дані.
     */
    this.running = false;
    this.tickTimer = null;
    this.lastTickRealTime = null;

    /*
     * Захист від повторної обробки одного й того ж
     * емоційного ефекту.
     */
    this.processedEventIds = new Set();
  }


  /*
   * ==========================================================
   * ЗАВАНТАЖЕННЯ ДАНИХ
   * ==========================================================
   */

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
      "dialogue_templates"
    ];

    for (const file of files) {
      try {
        const response = await fetch(
          `${this.options.dataPath}${file}.json`
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        this.data[file] = await response.json();
      } catch (error) {
        console.error(
          `[AkiraBrain] Не вдалося завантажити ${file}.json`,
          error
        );

        /*
         * Не падаємо повністю через один відсутній JSON.
         */
        this.data[file] = {};
      }
    }

    return this.data;
  }


  /*
   * ==========================================================
   * ІНІЦІАЛІЗАЦІЯ
   * ==========================================================
   */

  async init() {
    if (this.state.initialized) {
      return this;
    }

    await this.loadData();

    this.initializeWorld();
    this.initializeRelationships();
    this.initializeNeeds();
    this.initializeGoals();
    this.initializeState();

    /*
     * --------------------------------------------------------
     * ПІДКЛЮЧЕННЯ ПАМ'ЯТІ
     * --------------------------------------------------------
     */

    if (window.AkiraMemory) {
      this.memory = new window.AkiraMemory(this);

      if (typeof this.memory.init === "function") {
        this.memory.init();
      }
    } else {
      console.warn(
        "[AkiraBrain] AkiraMemory не знайдений."
      );
    }

    /*
     * --------------------------------------------------------
     * ПІДКЛЮЧЕННЯ НОВОЇ ЕМОЦІЙНОЇ СИСТЕМИ
     * --------------------------------------------------------
     */

    if (window.AkiraMood) {
      this.mood = new window.AkiraMood(this);

      if (typeof this.mood.init === "function") {
        this.mood.init();
      }

      /*
       * mood.js після init синхронізує свій стан
       * назад у brain.state.
       */
      this.mood.syncToBrain();
    } else {
      console.warn(
        "[AkiraBrain] AkiraMood не знайдений."
      );
    }

    /*
     * --------------------------------------------------------
     * РІШЕННЯ
     * --------------------------------------------------------
     */

    if (window.AkiraDecision) {
      this.decision = new window.AkiraDecision(this);

      if (typeof this.decision.init === "function") {
        this.decision.init();
      }
    }

    /*
     * --------------------------------------------------------
     * ДІАЛОГ
     * --------------------------------------------------------
     */

    if (window.AkiraDialogue) {
      this.dialogue = new window.AkiraDialogue(this);

      if (typeof this.dialogue.init === "function") {
        this.dialogue.init();
      }
    }

    this.state.initialized = true;
    this.state.initializedAt =
      this.getCurrentTimestamp();

    this.state.lastTick =
      this.getCurrentTimestamp();

    this.lastTickRealTime = Date.now();

    this.loadSavedState();

    /*
     * Після відновлення стану ще раз синхронізуємо
     * емоційну систему.
     */
    if (this.mood) {
      this.mood.syncToBrain();
    }

    return this;
  }


  /*
   * ==========================================================
   * ПОЧАТКОВИЙ СВІТ
   * ==========================================================
   */

  initializeWorld() {
    const world = this.data.world || {};
    const current = world.current || {};

    this.state.world = {
      date:
        current.date ||
        world.date ||
        "2026-09-22",

      time:
        current.time ||
        world.time ||
        "16:00",

      season:
        current.season ||
        world.season ||
        "autumn",

      location:
        current.location ||
        world.location ||
        "home",

      weather:
        current.weather ||
        world.weather ||
        "partlyCloudy"
    };
  }


  /*
   * ==========================================================
   * ПОТРЕБИ
   * ==========================================================
   */

  initializeNeeds() {
    const data = this.data.needs || {};

    if (data.needs && typeof data.needs === "object") {
      this.state.needs = {};

      Object.entries(data.needs).forEach(
        ([name, value]) => {
          if (typeof value === "number") {
            this.state.needs[name] = value;
          } else if (
            value &&
            typeof value === "object"
          ) {
            if (typeof value.current === "number") {
              this.state.needs[name] =
                value.current;
            } else if (
              typeof value.initial === "number"
            ) {
              this.state.needs[name] =
                value.initial;
            }
          }
        }
      );
    }

    /*
     * Якщо структура JSON інша —
     * використовуємо безпечні базові значення.
     */
    if (!Object.keys(this.state.needs).length) {
      this.state.needs = {
        energy: 80,
        sleep: 80,
        hunger: 20,
        thirst: 20,
        social: 45,
        fun: 55,
        rest: 60,
        curiosity: 65,
        safety: 90,
        privacy: 55,
        achievement: 50,
        comfort: 65
      };
    }
  }


  /*
   * ==========================================================
   * ВЗАЄМИНИ
   * ==========================================================
   */

  initializeRelationships() {
    const people = this.data.people || {};

    const source =
      people.people ||
      people.characters ||
      people;

    if (!source || typeof source !== "object") {
      return;
    }

    this.state.relationships = {};

    Object.entries(source).forEach(
      ([id, person]) => {
        if (!person || typeof person !== "object") {
          return;
        }

        this.state.relationships[id] = {
          type:
            person.relationship?.type ||
            person.relationshipType ||
            "acquaintance",

          closeness:
            person.relationship?.closeness ??
            person.closeness ??
            0,

          trust:
            person.relationship?.trust ??
            person.trust ??
            0,

          respect:
            person.relationship?.respect ??
            person.respect ??
            0,

          liking:
            person.relationship?.liking ??
            person.liking ??
            0,

          affection:
            person.relationship?.affection ??
            person.affection ??
            0,

          attraction:
            person.relationship?.attraction ??
            person.attraction ??
            0,

          jealousy:
            person.relationship?.jealousy ??
            person.jealousy ??
            0,

          irritation:
            person.relationship?.irritation ??
            person.irritation ??
            0,

          fear:
            person.relationship?.fear ??
            person.fear ??
            0,

          desireForContact:
            person.relationship?.desireForContact ??
            person.desireForContact ??
            0,

          desireToKnowMore:
            person.relationship?.desireToKnowMore ??
            person.desireToKnowMore ??
            0,

          lastInteraction: null,

          interactionCount: 0
        };
      }
    );
  }


  /*
   * ==========================================================
   * ЦІЛІ
   * ==========================================================
   */

  initializeGoals() {
    const data = this.data.goals || {};

    const source =
      data.activeGoals ||
      data.goals ||
      [];

    if (Array.isArray(source)) {
      this.state.goals = source.map(goal => ({
        ...goal
      }));
    }
  }


  /*
   * ==========================================================
   * ПОЧАТКОВИЙ СТАН
   * ==========================================================
   */

  initializeState() {
    const world = this.state.world;

    this.state.activity = {
      current: "idle",
      startedAt:
        `${world.date}T${world.time}`,
      duration: 0
    };

    this.state.physical = {
      energy: 80,
      fatigue: 0
    };

    this.state.mental = {
      focus: 70,
      stress: 10
    };

    this.state.social = {
      socialEnergy: 60,
      availability: "available"
    };

    this.state.behavior = {
      lastAction: null,
      recentActions: [],
      nextDecisionAt: null
    };
  }


  /*
   * ==========================================================
   * СИМУЛЯЦІЯ ЧАСУ
   * ==========================================================
   */

  advanceTime(minutes = 1) {
    const amount =
      Math.max(0, Number(minutes) || 0);

    if (!amount) {
      return;
    }

    let date = this.state.world.date;
    let time = this.state.world.time;

    if (!date || !time) {
      return;
    }

    const parts = time.split(":");
    let hours = Number(parts[0]) || 0;
    let minutesValue = Number(parts[1]) || 0;

    minutesValue += amount;

    while (minutesValue >= 60) {
      minutesValue -= 60;
      hours++;
    }

    while (hours >= 24) {
      hours -= 24;

      const currentDate =
        new Date(`${date}T00:00:00`);

      currentDate.setDate(
        currentDate.getDate() + 1
      );

      date =
        currentDate.toISOString()
          .slice(0, 10);
    }

    this.state.world.date = date;

    this.state.world.time =
      `${String(hours).padStart(2, "0")}:${String(
        Math.floor(minutesValue)
      ).padStart(2, "0")}`;

    this.updateSeason();
  }


  updateSeason() {
    const date = this.state.world.date;

    if (!date) {
      return;
    }

    const month =
      Number(date.slice(5, 7));

    if ([12, 1, 2].includes(month)) {
      this.state.world.season = "winter";
    } else if ([3, 4, 5].includes(month)) {
      this.state.world.season = "spring";
    } else if ([6, 7, 8].includes(month)) {
      this.state.world.season = "summer";
    } else {
      this.state.world.season = "autumn";
    }
  }


  /*
   * ==========================================================
   * ОНОВЛЕННЯ ПОТРЕБ
   * ==========================================================
   *
   * needs.js у майбутньому може бути винесений
   * в окремий клас.
   *
   * Поки brain лише координує базове оновлення.
   */

  updateNeeds(minutes = 1) {
    const data = this.data.needs || {};

    const drift =
      data.driftPerHour ||
      data.drift ||
      {};

    Object.entries(drift).forEach(
      ([need, rate]) => {
        if (
          typeof rate !== "number" ||
          typeof this.state.needs[need] !== "number"
        ) {
          return;
        }

        const change =
          rate * (minutes / 60);

        this.state.needs[need] =
          this.clamp(
            this.state.needs[need] + change
          );
      }
    );

    /*
     * Окремо синхронізуємо енергію/втому,
     * оскільки ними користуються mood і decision.
     */
    if (
      typeof this.state.needs.energy === "number"
    ) {
      this.state.physical.energy =
        this.state.needs.energy;
    }
  }


  /*
   * ==========================================================
   * ОНОВЛЕННЯ ЕМОЦІЙ
   * ==========================================================
   *
   * ВАЖЛИВО:
   *
   * brain.js більше НЕ містить власної логіки
   * зміни емоцій.
   *
   * Усе передаємо AkiraMood.
   */

  updateEmotions(minutes = 1) {
    if (!this.mood) {
      return;
    }

    this.mood.update(minutes);

    /*
     * Після mood.update() state вже синхронізований
     * через mood.syncToBrain().
     */
    this.state.emotions =
      this.mood.getState();

    this.state.emotionDetails =
      this.mood.getDetailedState();

    this.state.emotionalGlobal =
      this.mood.getGlobalState();
  }


  /*
   * ==========================================================
   * ОБРОБКА ПОДІЙ
   * ==========================================================
   */

  processEvents() {
    const events =
      Array.isArray(this.state.recentEvents)
        ? this.state.recentEvents
        : [];

    events.forEach(event => {
      if (!event || !event.id) {
        return;
      }

      /*
       * Одна подія не повинна нескінченно
       * повторно впливати на емоції.
       */
      if (
        this.processedEventIds.has(event.id)
      ) {
        return;
      }

      this.processedEventIds.add(event.id);

      /*
       * Передаємо емоційні ефекти новому mood.js.
       */
      if (
        this.mood &&
        Array.isArray(event.emotionalEffects)
      ) {
        this.mood.reactToEvent(event);
      }

      /*
       * Якщо подія містить ефект для пам'яті,
       * memory.js отримає її окремо.
       */
      if (
        this.memory &&
        event.memory
      ) {
        try {
          this.memory.remember(
            event.memory
          );
        } catch (error) {
          console.warn(
            "[AkiraBrain] Помилка запису пам'яті:",
            error
          );
        }
      }
    });

    /*
     * Не дозволяємо Set рости нескінченно.
     */
    if (this.processedEventIds.size > 500) {
      const ids =
        [...this.processedEventIds];

      this.processedEventIds =
        new Set(ids.slice(-250));
    }
  }


  /*
   * ==========================================================
   * ОНОВЛЕННЯ ПАМ'ЯТІ
   * ==========================================================
   */

  updateMemory(minutes = 1) {
    if (!this.memory) {
      return;
    }

    if (
      typeof this.memory.update === "function"
    ) {
      this.memory.update(minutes / 60);
    }
  }


  /*
   * ==========================================================
   * ОЦІНКА СИТУАЦІЇ
   * ==========================================================
   */

  evaluateSituation() {
    const situation = {
      time: this.state.world.time,
      date: this.state.world.date,
      season: this.state.world.season,

      location:
        this.state.world.location,

      weather:
        this.state.world.weather,

      activity:
        this.state.activity.current,

      energy:
        this.state.physical.energy,

      fatigue:
        this.state.physical.fatigue,

      focus:
        this.state.mental.focus,

      stress:
        this.state.mental.stress,

      socialEnergy:
        this.state.social.socialEnergy,

      needs:
        {
          ...this.state.needs
        },

      emotions:
        this.mood
          ? this.mood.getState()
          : {
              ...this.state.emotions
            },

      emotionalGlobal:
        this.mood
          ? this.mood.getGlobalState()
          : {
              ...this.state.emotionalGlobal
            },

      dominantEmotions:
        this.mood
          ? this.mood.getDominantEmotions()
          : [],

      emotionalConflicts:
        this.mood
          ? this.mood.getConflictingEmotions()
          : [],

      behaviorModifiers:
        this.mood
          ? this.mood.getBehaviorModifiers()
          : {},

      currentGoal:
        this.state.currentGoal,

      recentAction:
        this.state.behavior.lastAction,

      recentEvents:
        this.state.recentEvents.slice(-5)
    };

    this.state.situation = situation;

    return situation;
  }


  /*
   * ==========================================================
   * РІШЕННЯ
   * ==========================================================
   */

  decide() {
    if (!this.decision) {
      return {
        type: "nothing",
        reason: "decisionSystemUnavailable"
      };
    }

    try {
      if (
        typeof this.decision.decide === "function"
      ) {
        return this.decision.decide(
          this.state.situation
        );
      }
    } catch (error) {
      console.error(
        "[AkiraBrain] Помилка decision.js:",
        error
      );
    }

    return {
      type: "nothing",
      reason: "noDecision"
    };
  }


  /*
   * ==========================================================
   * ВИКОНАННЯ ДІЇ
   * ==========================================================
   */

  executeAction(action) {
    if (!action) {
      return;
    }

    const actionType =
      typeof action === "string"
        ? action
        : action.type;

    if (!actionType) {
      return;
    }

    const previous =
      this.state.behavior.lastAction;

    this.state.behavior.lastAction =
      actionType;

    this.state.behavior.recentActions.push({
      type: actionType,
      timestamp:
        this.getCurrentTimestamp(),
      previous
    });

    if (
      this.state.behavior.recentActions.length >
      30
    ) {
      this.state.behavior.recentActions.shift();
    }

    /*
     * Поточна активність.
     */
    this.state.activity.current =
      actionType;

    this.state.activity.startedAt =
      this.getCurrentTimestamp();

    /*
     * Якщо decision.js повернув тривалість —
     * запам'ятовуємо її.
     */
    this.state.activity.duration =
      Number(action.duration) || 0;

    /*
     * Окремі системи можуть реагувати на дію.
     *
     * Наприклад:
     * - потреби;
     * - емоції;
     * - пам'ять;
     * - цілі.
     *
     * Але brain не повинен містити великий список
     * правил для кожної діяльності.
     */

    if (
      this.data.activities?.effects?.[actionType]
    ) {
      const effects =
        this.data.activities.effects[actionType];

      this.applyActivityEffects(effects);
    }
  }


  /*
   * Обробка загальних ефектів активності,
   * якщо вони описані в activities.json.
   */
  applyActivityEffects(effects) {
    if (!effects || typeof effects !== "object") {
      return;
    }

    if (effects.needs) {
      Object.entries(effects.needs)
        .forEach(([need, delta]) => {
          if (
            typeof this.state.needs[need] ===
              "number" &&
            typeof delta === "number"
          ) {
            this.state.needs[need] =
              this.clamp(
                this.state.needs[need] + delta
              );
          }
        });
    }

    if (
      effects.emotions &&
      this.mood
    ) {
      Object.entries(effects.emotions)
        .forEach(([emotion, delta]) => {
          if (typeof delta === "number") {
            this.mood.change(
              emotion,
              delta,
              {
                source: "activity",
                reason: this.state.activity.current
              }
            );
          }
        });
    }
  }


  /*
   * ==========================================================
   * ДІАЛОГ
   * ==========================================================
   */

  respond(input, context = {}) {
    if (!this.dialogue) {
      return {
        type: "fallback",
        text: "Мені поки нема чого відповісти."
      };
    }

    try {
      return this.dialogue.respond(
        input,
        {
          ...context,

          brain: this,

          situation:
            this.state.situation,

          emotions:
            this.mood
              ? this.mood.getState()
              : this.state.emotions
        }
      );
    } catch (error) {
      console.error(
        "[AkiraBrain] Помилка dialogue.js:",
        error
      );

      return {
        type: "fallback",
        text: "Я трохи загубив думку."
      };
    }
  }


  /*
   * ==========================================================
   * ГОЛОВНИЙ ТІК
   * ==========================================================
   */

  tick() {
    if (!this.state.initialized) {
      return;
    }

    const minutes =
      this.options.simulatedMinutesPerTick;

    /*
     * --------------------------------------------------------
     * 1. Час
     * --------------------------------------------------------
     */

    this.advanceTime(minutes);

    /*
     * --------------------------------------------------------
     * 2. Світ
     * --------------------------------------------------------
     */

    this.updateWorld(minutes);

    /*
     * --------------------------------------------------------
     * 3. Потреби
     * --------------------------------------------------------
     */

    this.updateNeeds(minutes);

    /*
     * --------------------------------------------------------
     * 4. Події
     * --------------------------------------------------------
     */

    this.processEvents();

    /*
     * --------------------------------------------------------
     * 5. Емоції
     * --------------------------------------------------------
     *
     * Саме тут тепер працює НОВИЙ mood.js.
     *
     * Він:
     * - згасає до baseline;
     * - оновлює тимчасові ефекти;
     * - рахує valence/arousal;
     * - синхронізує state.
     */

    this.updateEmotions(minutes);

    /*
     * --------------------------------------------------------
     * 6. Пам'ять
     * --------------------------------------------------------
     */

    this.updateMemory(minutes);

    /*
     * --------------------------------------------------------
     * 7. Поточна ситуація
     * --------------------------------------------------------
     */

    this.evaluateSituation();

    /*
     * --------------------------------------------------------
     * 8. Автономне рішення
     * --------------------------------------------------------
     */

    if (this.shouldMakeDecision()) {
      const action =
        this.decide();

      if (action) {
        this.executeAction(action);
      }
    }

    /*
     * --------------------------------------------------------
     * 9. Збереження
     * --------------------------------------------------------
     */

    this.state.lastTick =
      this.getCurrentTimestamp();

    this.saveState();
  }


  /*
   * ==========================================================
   * СВІТ
   * ==========================================================
   */

  updateWorld(minutes = 1) {
    /*
     * Поки що world.json є джерелом початкового світу.
     *
     * Пізніше сюди можна підключити:
     * - зміну погоди;
     * - події;
     * - доступність людей;
     * - міські події;
     * - рух персонажа.
     */

    const world =
      this.data.world || {};

    if (
      world.locationChanges &&
      typeof world.locationChanges === "object"
    ) {
      /*
       * Навмисно без автоматичної зміни місця.
       * Місце має змінюватися через дію персонажа.
       */
    }
  }


  /*
   * ==========================================================
   * ЧИ ПОТРІБНО ПРИЙМАТИ РІШЕННЯ
   * ==========================================================
   */

  shouldMakeDecision() {
    const currentTime =
      this.getMinutesOfDay(
        this.state.world.time
      );

    const nextDecision =
      this.state.behavior.nextDecisionAt;

    if (typeof nextDecision === "number") {
      if (currentTime < nextDecision) {
        return false;
      }
    }

    /*
     * Базовий інтервал.
     */
    const minDelay = 5;
    const maxDelay = 30;

    const delay =
      minDelay +
      Math.floor(
        Math.random() *
        (maxDelay - minDelay + 1)
      );

    this.state.behavior.nextDecisionAt =
      (currentTime + delay) % 1440;

    return true;
  }


  /*
   * ==========================================================
   * ЗБЕРЕЖЕННЯ
   * ==========================================================
   */

  saveState() {
    try {
      const saveData = {
        world:
          this.state.world,

        activity:
          this.state.activity,

        needs:
          this.state.needs,

        emotions:
          this.state.emotions,

        emotionDetails:
          this.state.emotionDetails,

        emotionEffects:
          this.state.emotionEffects,

        emotionalGlobal:
          this.state.emotionalGlobal,

        relationships:
          this.state.relationships,

        goals:
          this.state.goals,

        currentGoal:
          this.state.currentGoal,

        physical:
          this.state.physical,

        mental:
          this.state.mental,

        social:
          this.state.social,

        behavior:
          this.state.behavior,

        recentEvents:
          this.state.recentEvents,

        lastTick:
          this.state.lastTick
      };

      localStorage.setItem(
        "akira_brain_state_v2",
        JSON.stringify(saveData)
      );
    } catch (error) {
      console.warn(
        "[AkiraBrain] Не вдалося зберегти стан:",
        error
      );
    }
  }


  /*
   * ==========================================================
   * ВІДНОВЛЕННЯ
   * ==========================================================
   */

  loadSavedState() {
    try {
      const raw =
        localStorage.getItem(
          "akira_brain_state_v2"
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
       * Відновлюємо лише динамічний стан.
       * JSON-файли залишаються джерелом конфігурації.
       */

      const fields = [
        "world",
        "activity",
        "needs",
        "emotions",
        "emotionDetails",
        "emotionEffects",
        "emotionalGlobal",
        "relationships",
        "goals",
        "currentGoal",
        "physical",
        "mental",
        "social",
        "behavior",
        "recentEvents",
        "lastTick"
      ];

      fields.forEach(field => {
        if (
          saved[field] !== undefined
        ) {
          this.state[field] =
            saved[field];
        }
      });

      /*
       * Якщо mood уже створений,
       * передаємо йому відновлені емоції.
       */
      if (this.mood) {
        this.mood.restoreState(
          this.state.emotionDetails ||
          this.state.emotions ||
          {}
        );

        this.mood.syncToBrain();
      }

      return true;
    } catch (error) {
      console.warn(
        "[AkiraBrain] Не вдалося відновити стан:",
        error
      );

      return false;
    }
  }


  /*
   * ==========================================================
   * ЗАПУСК / ЗУПИНКА
   * ==========================================================
   */

  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    this.lastTickRealTime =
      Date.now();

    this.tickTimer =
      setInterval(() => {
        this.tick();
      }, this.options.tickInterval);
  }


  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    this.saveState();
  }


  /*
   * ==========================================================
   * ДОПОМІЖНІ ФУНКЦІЇ
   * ==========================================================
   */

  getCurrentTimestamp() {
    if (
      this.state.world.date &&
      this.state.world.time
    ) {
      return (
        `${this.state.world.date}T` +
        `${this.state.world.time}`
      );
    }

    return new Date().toISOString();
  }


  getMinutesOfDay(time) {
    if (!time) {
      return 0;
    }

    const [hours, minutes] =
      time.split(":").map(Number);

    return (
      (hours || 0) * 60 +
      (minutes || 0)
    );
  }


  clamp(value, min = 0, max = 100) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.max(
      min,
      Math.min(max, number)
    );
  }
}


/*
 * ============================================================
 * ГЛОБАЛЬНИЙ ЕКЗЕМПЛЯР
 * ============================================================
 */

if (typeof window !== "undefined") {
  window.AkiraBrain = AkiraBrain;

  /*
   * Створюємо мозок одразу,
   * але НЕ запускаємо автономну симуляцію автоматично.
   */

  window.akiraBrain =
    new AkiraBrain({
      dataPath: "./data/",
      tickInterval: 1000,
      simulatedMinutesPerTick: 1
    });

  /*
   * Ініціалізація після завантаження сторінки.
   */
  window.addEventListener(
    "DOMContentLoaded",
    async () => {
      try {
        await window.akiraBrain.init();

        console.log(
          "[AkiraBrain] Акіра готовий."
        );

        console.log(
          "[AkiraBrain] Поточні емоції:",
          window.akiraBrain.mood
            ?.getState()
        );

        console.log(
          "[AkiraBrain] Глобальний емоційний стан:",
          window.akiraBrain.mood
            ?.getGlobalState()
        );

      } catch (error) {
        console.error(
          "[AkiraBrain] Помилка ініціалізації:",
          error
        );
      }
    }
  );
}
