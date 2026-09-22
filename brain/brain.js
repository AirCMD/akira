/*
 * Акіра Бакенеко — програмний мозок
 *
 * Центральний координатор симуляції.
 *
 * ВАЖЛИВО:
 * brain.js не містить особистість персонажа.
 * Характер, інтереси, знання, потреби, емоції,
 * пам'ять, світ та інші дані знаходяться у JSON.
 *
 * Цей файл відповідає за:
 * - завантаження даних;
 * - єдиний стан мозку;
 * - перебіг симуляції;
 * - зв'язок між модулями;
 * - збереження поточного стану;
 * - запуск циклу.
 */

class AkiraBrain {

  constructor() {
    this.data = {};
    this.state = {};
    this.initialized = false;

    this.timer = null;

    /*
     * Один крок симуляції.
     *
     * Поки що 1 реальна секунда = 1 симульована хвилина.
     * Пізніше це можна буде винести у налаштування світу.
     */
    this.realTimeStep = 1000;

    this.simulationMinutesPerStep = 1;

    /*
     * Лічильники для систем, які не повинні
     * виконуватися на кожному кроці.
     */
    this.counters = {
      needs: 0,
      emotions: 0,
      memory: 0,
      events: 0,
      decision: 0,
      save: 0
    };

    /*
     * Історія останніх дій.
     * Не є пам'яттю персонажа.
     * Це технічний контекст для рушія.
     */
    this.history = {
      actions: [],
      conversations: [],
      events: [],
      locations: []
    };

    /*
     * Тимчасовий контекст поточного кроку.
     */
    this.context = {
      time: null,
      location: null,
      activity: null,
      topic: null,
      person: null,
      event: null
    };
  }


  // ============================================================
  // 1. ЗАВАНТАЖЕННЯ ДАНИХ
  // ============================================================

  async loadJSON(path) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(
          `Не вдалося завантажити ${path}: ${response.status}`
        );
      }

      return await response.json();

    } catch (error) {
      console.error(`Помилка завантаження ${path}:`, error);
      throw error;
    }
  }


  async loadData() {

    const files = {
      character: "data/character.json",
      personality: "data/personality.json",
      interests: "data/interests.json",
      language: "data/language.json",
      memories: "data/memories.json",
      emotions: "data/emotions.json",
      needs: "data/needs.json",
      preferences: "data/preferences.json",
      activities: "data/activities.json",
      reactions: "data/reactions.json",
      rules: "data/rules.json",
      weather: "data/weather.json",
      world: "data/world.json",
      people: "data/people.json",
      knowledge: "data/knowledge.json",
      skills: "data/skills.json",
      habits: "data/habits.json",
      topics: "data/topics.json",
      goals: "data/goals.json",
      events: "data/events.json",
      states: "data/states.json",
      socialNetwork: "data/social_network.json",
      dialogueData: "data/dialogue_data.json",
      dialogueTemplates: "data/dialogue_templates.json"
    };

    const entries = Object.entries(files);

    const loaded = await Promise.all(
      entries.map(async ([key, path]) => {
        const data = await this.loadJSON(path);
        return [key, data];
      })
    );

    for (const [key, value] of loaded) {
      this.data[key] = value;
    }

    console.log("Дані персонажа завантажено.");

    return this.data;
  }


  // ============================================================
  // 2. ПОЧАТКОВИЙ СТАН
  // ============================================================

  createInitialState() {

    const world =
      this.data.world?.world ||
      this.data.world ||
      {};

    const states =
      this.data.states?.states ||
      this.data.states ||
      {};

    const emotions =
      this.data.emotions?.emotions ||
      this.data.emotions ||
      {};

    const needs =
      this.data.needs?.needs ||
      this.data.needs ||
      {};

    this.state = {

      /*
       * Поточний час симуляції.
       */
      world: {
        date: world.current?.date || world.date || "2026-09-22",
        time: world.current?.time || world.time || "16:00",
        season: world.current?.season || world.season || "autumn",

        location:
          world.current?.location ||
          "home"
      },


      /*
       * Поточний стан персонажа.
       */
      character: {
        activity: "idle",
        availability: "available",

        energy:
          needs.energy?.current ??
          needs.energy?.default ??
          80,

        fatigue:
          needs.fatigue?.current ??
          needs.fatigue?.default ??
          0,

        socialEnergy:
          needs.social?.current ??
          45,

        boredom:
          needs.fun?.current !== undefined
            ? Math.max(0, 100 - needs.fun.current)
            : 20,

        focus: 70
      },


      /*
       * Поточні емоції.
       *
       * Це КОПІЯ базових значень.
       * Ми не змінюємо JSON.
       */
      emotions: this.cloneEmotionState(emotions),


      /*
       * Поточні потреби.
       *
       * Також окрема копія.
       */
      needs: this.cloneNeedsState(needs),


      /*
       * Поточні цілі.
       */
      goals: {
        active: [],
        current: null
      },


      /*
       * Поточні стосунки.
       *
       * На старті вони беруться з people.json,
       * але фактичний стан надалі може змінюватися.
       */
      relationships: {},


      /*
       * Поточна розмова.
       */
      conversation: {
        active: false,
        person: null,
        topic: null,
        lastMessage: null,
        waitingForReply: false
      },


      /*
       * Поточна ситуація.
       */
      situation: {
        weather: null,
        event: null,
        importantPeopleNearby: [],
        availableActions: []
      }
    };

    this.initializeRelationships();

    this.updateContext();

    return this.state;
  }


  cloneEmotionState(emotions) {

    /*
     * У нашому emotions.json базові емоції знаходяться
     * у відповідній структурі.
     *
     * Якщо структура буде змінена пізніше,
     * цей метод можна буде адаптувати окремо,
     * не чіпаючи решту мозку.
     */

    if (emotions.current) {
      return structuredClone(emotions.current);
    }

    if (emotions.baseline) {
      return structuredClone(emotions.baseline);
    }

    return {};
  }


  cloneNeedsState(needs) {

    const result = {};

    for (const [key, value] of Object.entries(needs)) {

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {

        if (
          value.current !== undefined ||
          value.default !== undefined
        ) {
          result[key] =
            value.current ??
            value.default;
        }
      }
    }

    /*
     * Якщо JSON має простішу структуру,
     * також підтримуємо числові значення.
     */
    for (const [key, value] of Object.entries(needs)) {

      if (
        typeof value === "number" &&
        result[key] === undefined
      ) {
        result[key] = value;
      }
    }

    return result;
  }


  initializeRelationships() {

    const people =
      this.data.people?.people ||
      this.data.people ||
      {};

    for (const [id, person] of Object.entries(people)) {

      /*
       * Не копіюємо весь опис людини в поточний стан.
       *
       * Поточні стосунки мають бути окремим динамічним шаром.
       */
      this.state.relationships[id] = {

        closeness:
          person.relationship?.closeness ??
          person.closeness ??
          0,

        trust:
          person.relationship?.trust ??
          person.trust ??
          0,

        liking:
          person.relationship?.liking ??
          person.liking ??
          0,

        affection:
          person.relationship?.affection ??
          person.affection ??
          0,

        irritation:
          person.relationship?.irritation ??
          person.irritation ??
          0,

        familiarity:
          person.knowledge ??
          person.familiarity ??
          0
      };
    }
  }


  // ============================================================
  // 3. КОНТЕКСТ
  // ============================================================

  updateContext() {

    this.context.time = this.state.world.time;
    this.context.location = this.state.world.location;

    this.context.activity =
      this.state.character.activity;

    this.context.topic =
      this.state.conversation.topic;

    this.context.person =
      this.state.conversation.person;

    this.context.event =
      this.state.situation.event;

    return this.context;
  }


  // ============================================================
  // 4. ПОТОЧНИЙ ЧАС
  // ============================================================

  advanceTime(minutes = 1) {

    const [hours, minutesPart] =
      this.state.world.time
        .split(":")
        .map(Number);

    let totalMinutes =
      hours * 60 +
      minutesPart +
      minutes;

    totalMinutes =
      ((totalMinutes % 1440) + 1440) % 1440;

    const newHours =
      Math.floor(totalMinutes / 60);

    const newMinutes =
      totalMinutes % 60;

    this.state.world.time =
      `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;

    this.updateContext();
  }


  // ============================================================
  // 5. СВІТ
  // ============================================================

  updateWorld() {

    /*
     * Пізніше тут буде:
     *
     * - зміна дня;
     * - календар;
     * - погода;
     * - події світу;
     * - доступність людей;
     * - відкриття/закриття місць;
     * - транспорт;
     * - інші автономні зміни.
     *
     * Поки що просто підтримуємо контекст.
     */

    this.updateContext();
  }


  // ============================================================
  // 6. ПОТРЕБИ
  // ============================================================

  updateNeeds() {

    /*
     * Тут пізніше працюватиме окремий алгоритм:
     *
     * needs.json
     *       ↓
     * час
     *       ↓
     * активність
     *       ↓
     * сон / їжа / робота / відпочинок
     *       ↓
     * нові значення потреб
     *
     * Поки що лише викликаємо загальний хук.
     */

    this.counters.needs++;
  }


  // ============================================================
  // 7. ЕМОЦІЇ
  // ============================================================

  updateEmotions() {

    /*
     * Тут працюватиме mood.js.
     *
     * Емоції будуть залежати не лише від подій,
     * а й від:
     *
     * - потреб;
     * - поточного стану;
     * - людей;
     * - пам'яті;
     * - погоди;
     * - діяльності;
     * - цілей;
     * - інтересів.
     */

    this.counters.emotions++;
  }


  // ============================================================
  // 8. ПАМ'ЯТЬ
  // ============================================================

  updateMemory() {

    /*
     * memory.js пізніше буде відповідати за:
     *
     * - створення спогадів;
     * - посилення повторенням;
     * - згасання;
     * - емоційні асоціації;
     * - пригадування;
     * - зв'язок спогадів із людьми та подіями.
     */

    this.counters.memory++;
  }


  // ============================================================
  // 9. ПОДІЇ
  // ============================================================

  processEvents() {

    /*
     * events.json описує можливі події.
     *
     * Сам brain.js не повинен містити
     * список подій вручну.
     */

    this.counters.events++;
  }


  // ============================================================
  // 10. ОЦІНКА СИТУАЦІЇ
  // ============================================================

  evaluateSituation() {

    /*
     * Тут мозок збиратиме картину "що зараз відбувається".
     *
     * Наприклад:
     *
     * Акіра вдома
     * + енергія 62
     * + соціальна потреба 70
     * + Яні онлайн
     * + вільний час
     * + хороша погода
     * + мета "провести час із Яні"
     *
     * Це ще НЕ рішення.
     *
     * Це лише оцінка ситуації.
     */

    this.updateContext();

    return {
      time: this.state.world.time,
      date: this.state.world.date,
      season: this.state.world.season,

      location: this.state.world.location,

      activity:
        this.state.character.activity,

      energy:
        this.state.character.energy,

      fatigue:
        this.state.character.fatigue,

      socialEnergy:
        this.state.character.socialEnergy,

      boredom:
        this.state.character.boredom,

      emotions:
        this.state.emotions,

      needs:
        this.state.needs,

      goals:
        this.state.goals,

      relationships:
        this.state.relationships,

      conversation:
        this.state.conversation,

      weather:
        this.state.situation.weather,

      event:
        this.state.situation.event
    };
  }


  // ============================================================
  // 11. ВИБІР ДІЇ
  // ============================================================

  decide() {

    /*
     * decision.js пізніше отримає ситуацію
     * та сформує список можливих дій.
     *
     * Наприклад:
     *
     * - поїсти
     * - відпочити
     * - працювати
     * - написати Яні
     * - покататися
     * - почитати
     * - піти до планетарію
     * - перевірити Гуменчат
     * - нічого не робити
     *
     * Кожна дія буде оцінюватися багатьма параметрами.
     */

    const situation =
      this.evaluateSituation();

    this.counters.decision++;

    return {
      action: null,
      situation
    };
  }


  // ============================================================
  // 12. ВИКОНАННЯ ДІЇ
  // ============================================================

  executeAction(action) {

    if (!action) {
      return;
    }

    const previousActivity =
      this.state.character.activity;

    if (action.activity) {
      this.state.character.activity =
        action.activity;
    }

    if (action.location) {
      this.state.world.location =
        action.location;
    }

    /*
     * Зберігаємо технічну історію.
     */
    this.history.actions.push({
      action,
      previousActivity,
      time: this.state.world.time,
      date: this.state.world.date
    });

    /*
     * Не дозволяємо історії нескінченно рости.
     */
    if (this.history.actions.length > 50) {
      this.history.actions.shift();
    }

    this.updateContext();
  }


  // ============================================================
  // 13. ДІАЛОГ
  // ============================================================

  async respond(message, personId = null) {

    /*
     * dialogue.js пізніше буде отримувати:
     *
     * - повідомлення;
     * - визначені topics;
     * - intent;
     * - knowledge;
     * - interest;
     * - emotion;
     * - relationship;
     * - memory;
     * - current state;
     *
     * і вже з цього будувати відповідь.
     */

    this.state.conversation.active = true;
    this.state.conversation.person = personId;
    this.state.conversation.lastMessage = message;

    this.updateContext();

    return null;
  }


  // ============================================================
  // 14. ЗБЕРЕЖЕННЯ
  // ============================================================

  saveState() {

    try {

      localStorage.setItem(
        "akira_brain_state",
        JSON.stringify(this.state)
      );

      localStorage.setItem(
        "akira_brain_history",
        JSON.stringify(this.history)
      );

      this.counters.save++;

    } catch (error) {

      console.error(
        "Не вдалося зберегти стан мозку:",
        error
      );
    }
  }


  loadSavedState() {

    try {

      const savedState =
        localStorage.getItem(
          "akira_brain_state"
        );

      const savedHistory =
        localStorage.getItem(
          "akira_brain_history"
        );

      if (savedState) {
        this.state =
          JSON.parse(savedState);
      }

      if (savedHistory) {
        this.history =
          JSON.parse(savedHistory);
      }

      this.updateContext();

      return true;

    } catch (error) {

      console.error(
        "Не вдалося завантажити збережений стан:",
        error
      );

      return false;
    }
  }


  // ============================================================
  // 15. ОДИН КРОК СИМУЛЯЦІЇ
  // ============================================================

  async tick() {

    if (!this.initialized) {
      return;
    }

    /*
     * 1. Час.
     */
    this.advanceTime(
      this.simulationMinutesPerStep
    );


    /*
     * 2. Світ.
     */
    this.updateWorld();


    /*
     * 3. Потреби.
     */
    this.updateNeeds();


    /*
     * 4. Емоції.
     */
    this.updateEmotions();


    /*
     * 5. Пам'ять.
     */
    this.updateMemory();


    /*
     * 6. Події.
     */
    this.processEvents();


    /*
     * 7. Рішення.
     */
    const decision =
      this.decide();


    /*
     * 8. Виконання рішення.
     */
    if (decision?.action) {
      this.executeAction(
        decision.action
      );
    }


    /*
     * 9. Оновлення контексту.
     */
    this.updateContext();


    /*
     * 10. Автозбереження.
     */
    this.saveState();
  }


  // ============================================================
  // 16. ЗАПУСК
  // ============================================================

  start() {

    if (this.timer) {
      return;
    }

    console.log(
      "Симуляція Акіри запущена."
    );

    this.timer =
      setInterval(
        () => this.tick(),
        this.realTimeStep
      );
  }


  // ============================================================
  // 17. ЗУПИНКА
  // ============================================================

  stop() {

    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);

    this.timer = null;

    console.log(
      "Симуляція Акіри зупинена."
    );

    this.saveState();
  }


  // ============================================================
  // 18. ІНІЦІАЛІЗАЦІЯ
  // ============================================================

  async init() {

    if (this.initialized) {
      return this;
    }

    console.log(
      "Ініціалізація мозку Акіри..."
    );

    /*
     * Спочатку завантажуємо весь будівельний матеріал.
     */
    await this.loadData();


    /*
     * Потім створюємо початковий стан.
     */
    this.createInitialState();


    /*
     * Якщо існує збережений стан,
     * використовуємо його.
     */
    this.loadSavedState();


    /*
     * Фіксуємо готовність.
     */
    this.initialized = true;

    console.log(
      "Мозок Акіри готовий."
    );

    return this;
  }
}


// ============================================================
// ГЛОБАЛЬНИЙ ЕКЗЕМПЛЯР
// ============================================================

const akiraBrain =
  new AkiraBrain();


// ============================================================
// АВТОЗАПУСК ПІСЛЯ ЗАВАНТАЖЕННЯ СТОРІНКИ
// ============================================================

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    try {

      await akiraBrain.init();

      /*
       * Поки що автоматичний запуск
       * можна залишити вимкненим,
       * щоб ми спочатку підключили модулі.
       */

      // akiraBrain.start();

    } catch (error) {

      console.error(
        "Не вдалося запустити мозок Акіри:",
        error
      );
    }
  }
);
