/*
 * ============================================================
 * DECISION.JS
 * Система прийняття рішень Акіри
 * ============================================================
 *
 * decision.js відповідає за питання:
 *
 * "Що Акіра може захотіти / мусити / вирішити
 *  зробити прямо зараз?"
 *
 * Він НЕ:
 * - змінює особистість;
 * - генерує діалог;
 * - створює текст;
 * - сам керує емоціями;
 * - має знати конкретно про Яні;
 *
 * Він отримує інформацію від інших систем.
 *
 *                   brain
 *                     │
 *       ┌─────────────┼──────────────┐
 *       ↓             ↓              ↓
 *    needs          mood         memory
 *       │             │              │
 *       └─────────────┼──────────────┘
 *                     ↓
 *                 decision
 *                     ↓
 *                  action
 *
 * Рішення складається з кількох факторів.
 *
 * Один фактор не повинен повністю визначати поведінку.
 * ============================================================
 */

class AkiraDecision {
  constructor(brain) {
    this.brain = brain;

    this.actions = {};
    this.history = [];

    this.maxHistory = 100;

    this.initialized = false;

    /*
     * Випадковість потрібна для того,
     * щоб персонаж не перетворився на калькулятор.
     */
    this.randomness = 0.12;

    /*
     * Наскільки сильно недавня дія штрафує
     * повторення тієї самої дії.
     */
    this.repetitionPenalty = 0.35;

    /*
     * Максимальна кількість кандидатів,
     * які аналізуємо за один цикл.
     */
    this.maxCandidates = 40;
  }


  /*
   * ==========================================================
   * ІНІЦІАЛІЗАЦІЯ
   * ==========================================================
   */

  init() {
    this.loadActions();

    this.initialized = true;

    return this;
  }


  /*
   * ==========================================================
   * ЗАВАНТАЖЕННЯ ДІЙ
   * ==========================================================
   *
   * activities.json описує,
   * що персонаж ВМІЄ робити.
   *
   * decision.js вирішує,
   * що він хоче/має робити зараз.
   */

  loadActions() {
    const data =
      this.brain?.data?.activities || {};

    let source =
      data.activities ||
      data.actions ||
      data;

    /*
     * Якщо JSON має вкладену структуру,
     * намагаємося її знайти.
     */

    if (
      source &&
      typeof source === "object" &&
      !Array.isArray(source)
    ) {
      Object.entries(source).forEach(
        ([id, action]) => {
          if (!action || typeof action !== "object") {
            return;
          }

          /*
           * Відсікаємо службові поля.
           */
          if (
            [
              "autonomy",
              "rules",
              "decision",
              "system",
              "effects"
            ].includes(id)
          ) {
            return;
          }

          this.actions[id] = {
            id,
            ...action
          };
        }
      );
    }

    /*
     * Якщо activities.json має незручну структуру
     * або поки не містить дій, використовуємо
     * універсальний резервний набір.
     *
     * Це НЕ персонажні переваги.
     * Лише доступні типи дій.
     */

    const fallbackActions = {
      sleep: {
        category: "basic",
        duration: 60,
        requires: {
          energy: "low"
        }
      },

      eat: {
        category: "basic",
        duration: 20
      },

      drink: {
        category: "basic",
        duration: 5
      },

      rest: {
        category: "basic",
        duration: 30
      },

      work: {
        category: "work",
        duration: 60
      },

      walk: {
        category: "outdoor",
        duration: 30
      },

      cycle: {
        category: "outdoor",
        duration: 45
      },

      read: {
        category: "leisure",
        duration: 30
      },

      listenToMusic: {
        category: "leisure",
        duration: 30
      },

      playGame: {
        category: "leisure",
        duration: 30
      },

      talkToSomeone: {
        category: "social",
        duration: 20
      },

      talkToYani: {
        category: "social",
        duration: 30
      },

      visitMuseum: {
        category: "culture",
        duration: 90
      },

      visitPlanetarium: {
        category: "culture",
        duration: 90
      },

      visitTheatre: {
        category: "culture",
        duration: 120
      },

      visitConcert: {
        category: "culture",
        duration: 120
      },

      goToCinema: {
        category: "culture",
        duration: 120
      },

      boatRide: {
        category: "outdoor",
        duration: 60
      },

      fishing: {
        category: "outdoor",
        duration: 120
      },

      lookAtFlowers: {
        category: "leisure",
        duration: 15
      },

      observeAnimals: {
        category: "leisure",
        duration: 20
      },

      stargazing: {
        category: "leisure",
        duration: 30
      },

      checkPhone: {
        category: "routine",
        duration: 5
      },

      checkSocialNetwork: {
        category: "social",
        duration: 15
      },

      organizeDesk: {
        category: "routine",
        duration: 15
      },

      think: {
        category: "mental",
        duration: 15
      },

      rememberSomeone: {
        category: "mental",
        duration: 5
      },

      doNothing: {
        category: "idle",
        duration: 10
      }
    };

    Object.entries(fallbackActions).forEach(
      ([id, action]) => {
        if (!this.actions[id]) {
          this.actions[id] = {
            id,
            ...action
          };
        }
      }
    );
  }


  /*
   * ==========================================================
   * ГОЛОВНЕ РІШЕННЯ
   * ==========================================================
   */

  decide(context = null) {
    if (!this.initialized) {
      this.init();
    }

    const situation =
      context ||
      this.brain.evaluateSituation();

    /*
     * 1. Формуємо список доступних кандидатів.
     */
    const candidates =
      this.buildCandidates(situation);

    /*
     * 2. Розраховуємо оцінки.
     */
    const scored =
      candidates.map(action =>
        this.scoreAction(
          action,
          situation
        )
      );

    /*
     * 3. Сортуємо, але не просто беремо
     * абсолютний максимум.
     */
    scored.sort(
      (a, b) => b.score - a.score
    );

    /*
     * 4. Вибір із верхньої частини.
     *
     * Це створює варіативність:
     *
     * найкраща дія має найбільшу ймовірність,
     * але друга/третя теж іноді можуть перемогти.
     */
    const selected =
      this.selectWithVariation(scored);

    /*
     * 5. Записуємо рішення.
     */
    this.recordDecision(
      selected,
      scored,
      situation
    );

    return selected;
  }


  /*
   * ==========================================================
   * ФОРМУВАННЯ КАНДИДАТІВ
   * ==========================================================
   */

  buildCandidates(situation) {
    const candidates = [];

    Object.values(this.actions).forEach(action => {
      if (!action || !action.id) {
        return;
      }

      if (
        !this.isAvailable(
          action,
          situation
        )
      ) {
        return;
      }

      candidates.push(action);
    });

    /*
     * Додаємо "нічого не робити".
     *
     * Воно має бути справжнім кандидатом,
     * а не аварійною заглушкою.
     */

    if (
      !candidates.some(
        action => action.id === "doNothing"
      )
    ) {
      candidates.push({
        id: "doNothing",
        category: "idle",
        duration: 10
      });
    }

    return candidates.slice(
      0,
      this.maxCandidates
    );
  }


  /*
   * ==========================================================
   * ДОСТУПНІСТЬ ДІЇ
   * ==========================================================
   */

  isAvailable(action, situation) {
    /*
     * Сон.
     */
    if (
      action.id === "sleep" &&
      situation.activity === "sleeping"
    ) {
      return false;
    }

    /*
     * Робота.
     *
     * Поза робочим часом не забороняємо категорично:
     * іноді Акіра може залишитися доробити щось.
     *
     * Але scoreAction сильно зменшить оцінку.
     */

    /*
     * Активності на вулиці.
     */
    const outdoor = [
      "walk",
      "cycle",
      "boatRide",
      "fishing",
      "lookAtFlowers",
      "observeAnimals",
      "stargazing"
    ];

    if (
      outdoor.includes(action.id) &&
      this.isDangerousWeather(situation)
    ) {
      /*
       * Не повністю забороняємо,
       * якщо action дозволяє погану погоду.
       */
      if (!action.allWeather) {
        return false;
      }
    }

    /*
     * Якщо персонаж спить,
     * більшість звичайних дій недоступна.
     */
    if (
      situation.activity === "sleeping" &&
      action.id !== "sleep"
    ) {
      return false;
    }

    return true;
  }


  /*
   * ==========================================================
   * ОЦІНКА ДІЇ
   * ==========================================================
   *
   * Загальна оцінка:
   *
   * score =
   *
   * needs
   * + goals
   * + emotions
   * + interests
   * + preferences
   * + habits
   * + weather
   * + time
   * + relationships
   * + curiosity
   * + novelty
   * + context
   * - repetition
   *
   * Це НЕ рейтинг "наскільки дія хороша".
   *
   * Це приблизна сила поточного потягу
   * до конкретної дії.
   */

  scoreAction(action, situation) {
    const factors = {};

    factors.needs =
      this.scoreNeeds(
        action,
        situation
      );

    factors.goals =
      this.scoreGoals(
        action,
        situation
      );

    factors.emotions =
      this.scoreEmotions(
        action,
        situation
      );

    factors.interests =
      this.scoreInterests(
        action,
        situation
      );

    factors.preferences =
      this.scorePreferences(
        action,
        situation
      );

    factors.habits =
      this.scoreHabits(
        action,
        situation
      );

    factors.weather =
      this.scoreWeather(
        action,
        situation
      );

    factors.time =
      this.scoreTime(
        action,
        situation
      );

    factors.relationships =
      this.scoreRelationships(
        action,
        situation
      );

    factors.curiosity =
      this.scoreCuriosity(
        action,
        situation
      );

    factors.novelty =
      this.scoreNovelty(
        action,
        situation
      );

    factors.state =
      this.scoreCurrentState(
        action,
        situation
      );

    factors.repetition =
      this.scoreRepetition(
        action,
        situation
      );

    /*
     * Ваги.
     *
     * Потреби та цілі сильніші за випадкову цікавість.
     */
    const weights = {
      needs: 1.35,
      goals: 1.25,
      emotions: 0.85,
      interests: 0.90,
      preferences: 0.75,
      habits: 0.45,
      weather: 0.65,
      time: 0.70,
      relationships: 0.90,
      curiosity: 0.55,
      novelty: 0.35,
      state: 0.90,
      repetition: 1.00
    };

    let score = 0;

    Object.entries(factors).forEach(
      ([name, value]) => {
        score +=
          value *
          (weights[name] ?? 1);
      }
    );

    /*
     * Невелика випадковість.
     */
    const randomRange =
      Math.abs(score) *
      this.randomness;

    const randomOffset =
      (Math.random() * 2 - 1) *
      randomRange;

    score += randomOffset;

    /*
     * Нормалізуємо.
     */
    score = this.clamp(
      score,
      -100,
      100
    );

    return {
      ...action,

      score,

      factors,

      reason:
        this.generateReason(
          action,
          factors,
          situation
        )
    };
  }


  /*
   * ==========================================================
   * ПОТРЕБИ
   * ==========================================================
   */

  scoreNeeds(action, situation) {
    const needs =
      situation.needs || {};

    let score = 0;

    /*
     * Сон / енергія.
     */

    const energy =
      Number(
        needs.energy ??
        situation.energy ??
        50
      );

    const sleep =
      Number(
        needs.sleep ?? 50
      );

    if (action.id === "sleep") {
      score +=
        (100 - energy) * 0.65;

      score +=
        (100 - sleep) * 0.35;
    }

    /*
     * Їжа.
     */
    if (action.id === "eat") {
      const hunger =
        Number(needs.hunger ?? 20);

      score += hunger * 0.90;
    }

    /*
     * Напій.
     */
    if (action.id === "drink") {
      const thirst =
        Number(needs.thirst ?? 20);

      score += thirst * 0.90;
    }

    /*
     * Відпочинок.
     */
    if (action.id === "rest") {
      const rest =
        Number(needs.rest ?? 50);

      score +=
        (100 - rest) * 0.55;

      score +=
        Number(
          situation.fatigue ?? 0
        ) * 0.45;
    }

    /*
     * Соціальна потреба.
     */
    if (
      action.category === "social" ||
      action.id === "talkToSomeone" ||
      action.id === "talkToYani"
    ) {
      const social =
        Number(needs.social ?? 50);

      score +=
        (social - 50) * 0.70;
    }

    /*
     * Розваги.
     */
    if (
      [
        "playGame",
        "listenToMusic",
        "goToCinema",
        "visitTheatre",
        "visitConcert",
        "walk",
        "cycle"
      ].includes(action.id)
    ) {
      const fun =
        Number(needs.fun ?? 50);

      score +=
        (fun - 45) * 0.55;
    }

    /*
     * Цікавість.
     */
    if (
      [
        "read",
        "visitMuseum",
        "visitPlanetarium",
        "stargazing",
        "think",
        "checkSocialNetwork",
        "explore"
      ].includes(action.id)
    ) {
      const curiosity =
        Number(needs.curiosity ?? 50);

      score +=
        (curiosity - 45) * 0.45;
    }

    /*
     * Приватність.
     */
    if (
      [
        "rest",
        "read",
        "listenToMusic",
        "think",
        "organizeDesk",
        "doNothing"
      ].includes(action.id)
    ) {
      const privacy =
        Number(needs.privacy ?? 50);

      score +=
        (privacy - 50) * 0.30;
    }

    return score;
  }


  /*
   * ==========================================================
   * ЦІЛІ
   * ==========================================================
   */

  scoreGoals(action, situation) {
    const goals =
      Array.isArray(
        this.brain?.state?.goals
      )
        ? this.brain.state.goals
        : [];

    let score = 0;

    goals.forEach(goal => {
      if (!goal) {
        return;
      }

      const actions =
        Array.isArray(goal.actions)
          ? goal.actions
          : [];

      const possibleActions =
        Array.isArray(goal.possibleActions)
          ? goal.possibleActions
          : [];

      const matches =
        actions.includes(action.id) ||
        possibleActions.includes(action.id);

      if (!matches) {
        return;
      }

      const importance =
        Number(
          goal.importance ?? 50
        );

      const urgency =
        Number(
          goal.urgency ?? 30
        );

      const motivation =
        Number(
          goal.motivation ?? 50
        );

      const progress =
        Number(
          goal.progress ?? 0
        );

      const flexibility =
        Number(
          goal.flexibility ?? 50
        );

      /*
       * Незавершена важлива ціль
       * додає мотивації.
       */
      score +=
        importance * 0.40;

      score +=
        urgency * 0.35;

      score +=
        motivation * 0.35;

      /*
       * Якщо ціль майже виконана,
       * відповідна дія може стати важливішою.
       */
      if (progress > 70) {
        score +=
          (progress - 70) * 0.25;
      }

      /*
       * Гнучкість дозволяє легше відкласти ціль,
       * тому трохи зменшуємо її тиск.
       */
      score -=
        flexibility * 0.08;
    });

    return score;
  }


  /*
   * ==========================================================
   * ЕМОЦІЇ
   * ==========================================================
   */

  scoreEmotions(action, situation) {
    const emotions =
      situation.emotions || {};

    const modifiers =
      situation.behaviorModifiers || {};

    let score = 0;

    /*
     * Загальний поведінковий вплив.
     */

    if (
      action.category === "social"
    ) {
      score +=
        (modifiers.socialInitiative - 50) *
        0.55;
    }

    if (
      action.category === "outdoor" ||
      action.category === "exploration"
    ) {
      score +=
        (modifiers.exploration - 50) *
        0.45;
    }

    if (
      action.category === "leisure"
    ) {
      score +=
        (modifiers.activityDrive - 50) *
        0.35;
    }

    /*
     * Конкретні емоційні тенденції.
     */

    const joy =
      Number(emotions.joy ?? 0);

    const sadness =
      Number(emotions.sadness ?? 0);

    const anxiety =
      Number(emotions.anxiety ?? 0);

    const boredom =
      Number(emotions.boredom ?? 0);

    const curiosity =
      Number(emotions.curiosity ?? 0);

    const calm =
      Number(emotions.calm ?? 0);

    if (action.id === "doNothing") {
      score +=
        calm * 0.10;

      score +=
        sadness * 0.04;

      score +=
        anxiety * 0.06;
    }

    if (
      [
        "read",
        "listenToMusic",
        "walk",
        "visitMuseum",
        "visitPlanetarium",
        "think"
      ].includes(action.id)
    ) {
      score +=
        curiosity * 0.12;
    }

    if (
      [
        "checkPhone",
        "checkSocialNetwork",
        "playGame",
        "walk",
        "cycle",
        "talkToSomeone"
      ].includes(action.id)
    ) {
      score +=
        boredom * 0.10;
    }

    if (
      [
        "rest",
        "read",
        "listenToMusic",
        "doNothing"
      ].includes(action.id)
    ) {
      score +=
        anxiety * 0.06;

      score +=
        calm * 0.05;
    }

    if (
      [
        "talkToSomeone",
        "talkToYani",
        "checkSocialNetwork"
      ].includes(action.id)
    ) {
      score +=
        joy * 0.07;
    }

    if (
      action.category === "social"
    ) {
      score -=
        sadness * 0.06;
    }

    return score;
  }


  /*
   * ==========================================================
   * ІНТЕРЕСИ
   * ==========================================================
   */

  scoreInterests(action, situation) {
    const interestsData =
      this.brain?.data?.interests || {};

    const interests =
      interestsData.interests ||
      interestsData;

    let score = 0;

    /*
     * action.interestTopics може бути заданий
     * безпосередньо в activities.json.
     */

    const topics =
      Array.isArray(action.interestTopics)
        ? action.interestTopics
        : [];

    topics.forEach(topic => {
      const interest =
        interests[topic];

      if (!interest) {
        return;
      }

      if (
        typeof interest === "number"
      ) {
        score +=
          interest * 0.25;

        return;
      }

      if (
        typeof interest.interest === "number"
      ) {
        score +=
          interest.interest * 0.25;
      }

      if (
        typeof interest.liking === "number"
      ) {
        score +=
          interest.liking * 0.15;
      }

      if (
        typeof interest.initiative === "number"
      ) {
        score +=
          interest.initiative * 0.10;
      }
    });

    /*
     * Резервне зіставлення дії з інтересом.
     */
    const map = {
      cycle: ["cycling"],
      walk: ["cityWalks"],
      read: ["reading"],
      visitMuseum: ["museums"],
      visitPlanetarium: ["planetarium", "space"],
      visitTheatre: ["theatre"],
      visitConcert: ["concerts"],
      goToCinema: ["cinema"],
      boatRide: ["boatRides"],
      fishing: ["fishing"],
      lookAtFlowers: ["flowers"],
      observeAnimals: ["animals"],
      stargazing: ["space", "astronomy"],
      playGame: ["games"],
      listenToMusic: ["music"],
      craftWithClay: ["clayCrafting"]
    };

    const mapped =
      map[action.id] || [];

    mapped.forEach(topic => {
      const interest =
        interests[topic];

      if (!interest) {
        return;
      }

      if (
        typeof interest === "number"
      ) {
        score +=
          interest * 0.25;
      } else {
        score +=
          Number(
            interest.interest ?? 0
          ) * 0.22;

        score +=
          Number(
            interest.liking ?? 0
          ) * 0.13;

        score +=
          Number(
            interest.initiative ?? 0
          ) * 0.08;
      }
    });

    return score;
  }


  /*
   * ==========================================================
   * ПЕРЕВАГИ
   * ==========================================================
   */

  scorePreferences(action, situation) {
    const preferencesData =
      this.brain?.data?.preferences || {};

    const preferences =
      preferencesData.preferences ||
      preferencesData;

    let score = 0;

    /*
     * activities.json може містити
     * preferenceTags.
     */

    const tags =
      Array.isArray(action.preferenceTags)
        ? action.preferenceTags
        : [];

    tags.forEach(tag => {
      const preference =
        preferences[tag];

      if (!preference) {
        return;
      }

      if (
        typeof preference === "number"
      ) {
        score +=
          preference * 0.20;

        return;
      }

      score +=
        Number(
          preference.liking ?? 0
        ) * 0.15;

      score +=
        Number(
          preference.comfort ?? 0
        ) * 0.10;

      score +=
        Number(
          preference.practicality ?? 0
        ) * 0.05;
    });

    /*
     * Загальні категорії.
     */

    if (
      action.category === "relaxing"
    ) {
      score +=
        this.getPreferenceValue(
          preferences,
          "relaxing"
        ) * 0.20;
    }

    if (
      action.category === "cultural"
    ) {
      score +=
        this.getPreferenceValue(
          preferences,
          "cultural"
        ) * 0.20;
    }

    if (
      action.category === "outdoor"
    ) {
      score +=
        this.getPreferenceValue(
          preferences,
          "outdoor"
        ) * 0.15;
    }

    return score;
  }


  getPreferenceValue(preferences, key) {
    const value =
      preferences?.activities?.[key] ??
      preferences?.activityPreferences?.[key] ??
      preferences?.[key];

    if (typeof value === "number") {
      return value;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      return Number(
        value.liking ??
        value.interest ??
        value.value ??
        0
      );
    }

    return 0;
  }


  /*
   * ==========================================================
   * ЗВИЧКИ
   * ==========================================================
   */

  scoreHabits(action, situation) {
    const habitsData =
      this.brain?.data?.habits || {};

    let score = 0;

    const time =
      this.getMinutesOfDay(
        situation.time
      );

    /*
     * Ранкові звички.
     */
    if (
      time >= 6 * 60 &&
      time < 10 * 60
    ) {
      if (action.id === "checkPhone") {
        score += 15;
      }

      if (action.id === "checkCalendar") {
        score += 12;
      }

      if (action.id === "drink") {
        score += 8;
      }
    }

    /*
     * Вечірні.
     */
    if (
      time >= 20 * 60
    ) {
      if (action.id === "read") {
        score += 12;
      }

      if (action.id === "listenToMusic") {
        score += 10;
      }

      if (
        action.id === "checkSocialNetwork"
      ) {
        score += 8;
      }
    }

    /*
     * Якщо habits.json містить прямі
     * probability-значення.
     */
    const source =
      habitsData.habits ||
      habitsData;

    if (
      source &&
      typeof source === "object"
    ) {
      Object.values(source)
        .forEach(habit => {
          if (!habit || typeof habit !== "object") {
            return;
          }

          const habitAction =
            habit.action ||
            habit.activity;

          if (
            habitAction !== action.id
          ) {
            return;
          }

          const probability =
            Number(
              habit.probability ??
              habit.chance ??
              0
            );

          score +=
            probability * 0.20;
        });
    }

    return score;
  }


  /*
   * ==========================================================
   * ПОГОДА
   * ==========================================================
   */

  scoreWeather(action, situation) {
    const weather =
      this.getWeatherData(
        situation
      );

    if (!weather) {
      return 0;
    }

    let score = 0;

    const temperature =
      Number(
        weather.temperature ??
        weather.temp ??
        18
      );

    const precipitation =
      Number(
        weather.precipitation ??
        weather.precipitationChance ??
        0
      );

    const wind =
      Number(
        weather.wind ??
        weather.windSpeed ??
        0
      );

    const outdoor = [
      "walk",
      "cycle",
      "boatRide",
      "fishing",
      "lookAtFlowers",
      "observeAnimals",
      "stargazing"
    ];

    if (
      outdoor.includes(action.id)
    ) {
      /*
       * Комфортна температура.
       */
      if (
        temperature >= 10 &&
        temperature <= 25
      ) {
        score += 18;
      }

      /*
       * Холод.
       */
      if (
        temperature < 5
      ) {
        score -= 25;
      }

      /*
       * Сильна спека.
       */
      if (
        temperature > 30
      ) {
        score -= 25;
      }

      /*
       * Дощ.
       */
      score -=
        precipitation * 0.25;

      /*
       * Вітер.
       */
      if (wind > 8) {
        score -=
          (wind - 8) * 2;
      }
    }

    /*
     * Планетарій/музей/кіно/театр
     * можуть бути приємною альтернативою
     * поганій погоді.
     */

    if (
      [
        "visitMuseum",
        "visitPlanetarium",
        "visitTheatre",
        "visitConcert",
        "goToCinema"
      ].includes(action.id)
    ) {
      score +=
        precipitation * 0.10;

      if (temperature < 5) {
        score += 8;
      }

      if (temperature > 30) {
        score += 8;
      }
    }

    return score;
  }


  getWeatherData(situation) {
    const weatherData =
      this.brain?.data?.weather || {};

    if (
      weatherData.current &&
      typeof weatherData.current === "object"
    ) {
      return weatherData.current;
    }

    if (
      situation.weather &&
      typeof situation.weather === "object"
    ) {
      return situation.weather;
    }

    return null;
  }


  isDangerousWeather(situation) {
    const weather =
      this.getWeatherData(
        situation
      );

    if (!weather) {
      return false;
    }

    const precipitation =
      Number(
        weather.precipitation ??
        weather.precipitationChance ??
        0
      );

    const wind =
      Number(
        weather.wind ??
        weather.windSpeed ??
        0
      );

    const temperature =
      Number(
        weather.temperature ??
        weather.temp ??
        18
      );

    return (
      precipitation >= 80 ||
      wind >= 15 ||
      temperature <= -10 ||
      temperature >= 38
    );
  }


  /*
   * ==========================================================
   * ЧАС
   * ==========================================================
   */

  scoreTime(action, situation) {
    const minutes =
      this.getMinutesOfDay(
        situation.time
      );

    let score = 0;

    /*
     * Ніч.
     */
    if (
      minutes >= 23 * 60 ||
      minutes < 6 * 60
    ) {
      if (
        [
          "sleep",
          "read",
          "listenToMusic",
          "think",
          "stargazing"
        ].includes(action.id)
      ) {
        score += 25;
      }

      if (
        [
          "work",
          "visitMuseum",
          "visitTheatre",
          "visitConcert",
          "goToCinema"
        ].includes(action.id)
      ) {
        score -= 40;
      }
    }

    /*
     * Робочий час.
     */
    if (
      minutes >= 10 * 60 &&
      minutes < 18 * 60
    ) {
      if (action.id === "work") {
        score += 30;
      }
    }

    /*
     * Після роботи.
     */
    if (
      minutes >= 18 * 60
    ) {
      if (action.id === "work") {
        score -= 30;
      }

      if (
        [
          "walk",
          "cycle",
          "read",
          "listenToMusic",
          "talkToSomeone",
          "talkToYani"
        ].includes(action.id)
      ) {
        score += 10;
      }
    }

    return score;
  }


  /*
   * ==========================================================
   * СТОСУНКИ
   * ==========================================================
   */

  scoreRelationships(action, situation) {
    let score = 0;

    const relationships =
      this.brain?.state?.relationships ||
      {};

    /*
     * Соціальні дії загалом.
     */
    if (
      action.category === "social"
    ) {
      Object.values(relationships)
        .forEach(relation => {
          const closeness =
            Number(
              relation.closeness ?? 0
            );

          const desire =
            Number(
              relation.desireForContact ?? 0
            );

          score +=
            closeness * 0.05;

          score +=
            desire * 0.08;
        });
    }

    /*
     * Якщо дія прямо пов'язана з людиною,
     * беремо відповідний relationship.
     *
     * Людина задається в activities.json:
     *
     * targetPerson: "Yani_Bakeneko"
     */

    if (action.targetPerson) {
      const relation =
        relationships[
          action.targetPerson
        ];

      if (relation) {
        score +=
          Number(
            relation.desireForContact ?? 0
          ) * 0.35;

        score +=
          Number(
            relation.closeness ?? 0
          ) * 0.20;

        score +=
          Number(
            relation.affection ?? 0
          ) * 0.15;
      }
    }

    /*
     * talkToYani залишаємо як сумісність
     * із поточним activities.json.
     *
     * Це не емоційна логіка,
     * лише прив'язка до relationship data.
     */

    if (action.id === "talkToYani") {
      const relation =
        relationships.Yani_Bakeneko;

      if (relation) {
        score +=
          Number(
            relation.desireForContact ?? 0
          ) * 0.30;
      }
    }

    return score;
  }


  /*
   * ==========================================================
   * ЦІКАВІСТЬ
   * ==========================================================
   */

  scoreCuriosity(action, situation) {
    const curiosity =
      Number(
        situation.needs?.curiosity ??
        50
      );

    if (curiosity <= 50) {
      return 0;
    }

    const exploratoryActions = [
      "read",
      "visitMuseum",
      "visitPlanetarium",
      "stargazing",
      "think",
      "checkSocialNetwork",
      "goToCinema"
    ];

    if (
      exploratoryActions.includes(action.id)
    ) {
      return (
        curiosity - 50
      ) * 0.50;
    }

    return 0;
  }


  /*
   * ==========================================================
   * НОВИЗНА
   * ==========================================================
   */

  scoreNovelty(action, situation) {
    const recent =
      this.brain?.state?.behavior
        ?.recentActions || [];

    if (!recent.length) {
      return 10;
    }

    const last =
      recent[recent.length - 1];

    if (
      !last ||
      last.type !== action.id
    ) {
      return 5;
    }

    /*
     * Новизна падає при повторенні.
     */
    return -15;
  }


  /*
   * ==========================================================
   * ПОТОЧНИЙ СТАН
   * ==========================================================
   */

  scoreCurrentState(action, situation) {
    let score = 0;

    const energy =
      Number(
        situation.energy ?? 50
      );

    const fatigue =
      Number(
        situation.fatigue ?? 0
      );

    const focus =
      Number(
        situation.focus ?? 50
      );

    const stress =
      Number(
        situation.stress ?? 0
      );

    /*
     * Низька енергія.
     */
    if (energy < 30) {
      if (
        [
          "sleep",
          "rest",
          "read",
          "listenToMusic",
          "doNothing"
        ].includes(action.id)
      ) {
        score += 25;
      }

      if (
        [
          "cycle",
          "fishing",
          "work",
          "visitConcert"
        ].includes(action.id)
      ) {
        score -= 20;
      }
    }

    /*
     * Сильна втома.
     */
    if (fatigue > 70) {
      if (
        [
          "sleep",
          "rest",
          "doNothing"
        ].includes(action.id)
      ) {
        score += 30;
      }
    }

    /*
     * Високий стрес.
     */
    if (stress > 60) {
      if (
        [
          "rest",
          "read",
          "listenToMusic",
          "walk",
          "doNothing"
        ].includes(action.id)
      ) {
        score += 15;
      }

      if (
        [
          "work",
          "playGame"
        ].includes(action.id)
      ) {
        score -= 8;
      }
    }

    /*
     * Високий focus допомагає роботі,
     * читанню, навчанню.
     */
    if (focus > 75) {
      if (
        [
          "work",
          "read",
          "think",
          "organizeDesk"
        ].includes(action.id)
      ) {
        score += 12;
      }
    }

    return score;
  }


  /*
   * ==========================================================
   * ПОВТОРЕННЯ
   * ==========================================================
   */

  scoreRepetition(action, situation) {
    const recent =
      this.brain?.state?.behavior
        ?.recentActions || [];

    if (!recent.length) {
      return 0;
    }

    let repeats = 0;

    /*
     * Дивимося останні 5 дій.
     */
    recent
      .slice(-5)
      .forEach(entry => {
        if (
          entry?.type === action.id
        ) {
          repeats++;
        }
      });

    if (!repeats) {
      return 0;
    }

    return (
      -35 *
      repeats *
      this.repetitionPenalty
    );
  }


  /*
   * ==========================================================
   * ВИБІР ІЗ ВАРІАТИВНІСТЮ
   * ==========================================================
   */

  selectWithVariation(scored) {
    if (!scored.length) {
      return {
        type: "nothing",
        reason: "noCandidates"
      };
    }

    /*
     * Не дозволяємо негативним оцінкам
     * повністю зруйнувати вибір.
     */
    const positive =
      scored.map(item => ({
        item,
        weight:
          Math.max(
            0.1,
            item.score + 100
          )
      }));

    /*
     * Беремо максимум із верхньої частини.
     *
     * Нижчі кандидати отримують меншу
     * ймовірність.
     */
    const topCount =
      Math.min(
        5,
        positive.length
      );

    const top =
      positive.slice(0, topCount);

    /*
     * Підсилюємо найкращі варіанти.
     */
    const weighted =
      top.map((entry, index) => ({
        ...entry,
        weight:
          entry.weight /
          (1 + index * 0.8)
      }));

    const total =
      weighted.reduce(
        (sum, entry) =>
          sum + entry.weight,
        0
      );

    let random =
      Math.random() * total;

    for (const entry of weighted) {
      random -= entry.weight;

      if (random <= 0) {
        return this.finalizeAction(
          entry.item
        );
      }
    }

    return this.finalizeAction(
      weighted[0].item
    );
  }


  finalizeAction(action) {
    return {
      type: action.id,

      actionId: action.id,

      duration:
        Number(action.duration) || 10,

      category:
        action.category || "general",

      targetPerson:
        action.targetPerson || null,

      reason:
        action.reason ||
        "currentSituation",

      score:
        typeof action.score === "number"
          ? action.score
          : null,

      factors:
        action.factors || {}
    };
  }


  /*
   * ==========================================================
   * ПОЯСНЕННЯ ДЛЯ ВНУТРІШНЬОГО СТАНУ
   * ==========================================================
   *
   * Це НЕ chain-of-thought.
   *
   * Це короткий структурований опис
   * результату для налагодження системи.
   */

  generateReason(
    action,
    factors,
    situation
  ) {
    const important =
      Object.entries(factors)
        .filter(
          ([, value]) =>
            Math.abs(value) >= 10
        )
        .sort(
          ([, a], [, b]) =>
            Math.abs(b) -
            Math.abs(a)
        )
        .slice(0, 3)
        .map(
          ([name, value]) =>
            `${name}:${Math.round(value)}`
        );

    if (!important.length) {
      return "weakPreference";
    }

    return important.join(", ");
  }


  /*
   * ==========================================================
   * ІСТОРІЯ РІШЕНЬ
   * ==========================================================
   */

  recordDecision(
    selected,
    scored,
    situation
  ) {
    const record = {
      timestamp:
        this.brain.getCurrentTimestamp(),

      selected:
        selected?.type || null,

      score:
        selected?.score ?? null,

      alternatives:
        scored
          .slice(0, 5)
          .map(action => ({
            id: action.id,
            score: action.score
          })),

      context: {
        location:
          situation.location,

        activity:
          situation.activity,

        energy:
          situation.energy,

        fatigue:
          situation.fatigue,

        stress:
          situation.stress
      }
    };

    this.history.push(record);

    if (
      this.history.length >
      this.maxHistory
    ) {
      this.history.shift();
    }
  }


  /*
   * ==========================================================
   * ОТРИМАННЯ ІСТОРІЇ
   * ==========================================================
   */

  getHistory(limit = 20) {
    return this.history
      .slice(-limit)
      .reverse();
  }


  /*
   * ==========================================================
   * ДОПОМІЖНІ
   * ==========================================================
   */

  getMinutesOfDay(time) {
    if (!time) {
      return 0;
    }

    const [hours, minutes] =
      time
        .split(":")
        .map(Number);

    return (
      (hours || 0) * 60 +
      (minutes || 0)
    );
  }


  clamp(
    value,
    min = -100,
    max = 100
  ) {
    const number =
      Number(value);

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
 * ЕКСПОРТ
 * ============================================================
 */

if (typeof window !== "undefined") {
  window.AkiraDecision =
    AkiraDecision;
}
