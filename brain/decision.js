/*
 * РУШІЙ РІШЕНЬ АКІРИ
 *
 * decision.js
 *
 * Відповідає за вибір ДІЇ.
 *
 * Він НЕ:
 *   - генерує текст;
 *   - змінює особистість;
 *   - вирішує, що Акіра "повинен" хотіти;
 *   - визначає його моральність.
 *
 * Він порівнює доступні дії з поточним станом персонажа.
 *
 * Джерела:
 *   потреби
 *   емоції
 *   цілі
 *   інтереси
 *   уподобання
 *   звички
 *   стосунки
 *   пам'ять
 *   навички
 *   знання
 *   погода
 *   світ
 *   поточний стан
 *   нещодавні дії
 *   випадковість
 *
 * Важливо:
 * одна й та сама дія може бути хорошою
 * в один момент і зовсім недоречною в інший.
 */


class AkiraDecision {

  constructor(brain) {

    this.brain = brain;

    /*
     * Останнє рішення.
     */
    this.lastDecision = null;

    /*
     * Історія рішень.
     */
    this.history = [];

    this.maxHistory = 100;

    /*
     * Невелика випадковість потрібна для того,
     * щоб поведінка не була механічно однаковою.
     */
    this.randomness = 18;

    /*
     * Скільки останніх дій враховуємо
     * при покаранні повторення.
     */
    this.recentActionLimit = 8;
  }


  // ============================================================
  // 1. ОСНОВНИЙ ВИБІР
  // ============================================================

  decide(context = {}) {

    const actions =
      this.getAvailableActions(context);


    if (
      !actions.length
    ) {

      return this.createNothingDecision(
        "немає доступних дій"
      );
    }


    const candidates = [];


    for (
      const action
      of actions
    ) {

      const evaluation =
        this.evaluateAction(
          action,
          context
        );


      candidates.push(
        evaluation
      );
    }


    /*
     * Сортуємо від найбільш імовірної
     * до найменш імовірної дії.
     */
    candidates.sort(
      (a, b) =>
        b.score - a.score
    );


    /*
     * Дозволяємо випадковість.
     *
     * Не завжди обираємо абсолютний максимум.
     */
    const selected =
      this.selectCandidate(
        candidates
      );


    const decision = {

      action:
        selected.action,

      target:
        selected.target ??
        null,

      duration:
        selected.duration ??
        null,

      score:
        selected.score,

      factors:
        selected.factors,

      alternatives:
        candidates
          .slice(0, 5)
          .map(
            candidate => ({
              action:
                candidate.action,

              score:
                candidate.score
            })
          ),

      timestamp:
        this.getCurrentTime()
    };


    this.lastDecision =
      decision;


    this.recordDecision(
      decision
    );


    return decision;
  }


  // ============================================================
  // 2. ДОСТУПНІ ДІЇ
  // ============================================================

  getAvailableActions(
    context = {}
  ) {

    const data =
      this.brain.data.activities;


    /*
     * Якщо activities.json має каталог actions,
     * беремо його.
     */
    let actions =
      data?.actions;


    /*
     * Підтримуємо також activities.
     */
    if (
      !actions
    ) {

      actions =
        data?.activities;
    }


    /*
     * Якщо JSON ще не підключений,
     * використовуємо базовий набір.
     *
     * Це тимчасовий запасний варіант.
     */
    if (
      !actions
    ) {

      actions = {

        sleep: {
          enabled: true
        },

        eat: {
          enabled: true
        },

        drink: {
          enabled: true
        },

        rest: {
          enabled: true
        },

        work: {
          enabled: true
        },

        walk: {
          enabled: true
        },

        cycle: {
          enabled: true
        },

        read: {
          enabled: true
        },

        listenToMusic: {
          enabled: true
        },

        playGame: {
          enabled: true
        },

        checkSocialNetwork: {
          enabled: true
        },

        writePost: {
          enabled: true
        },

        talkToSomeone: {
          enabled: true
        },

        talkToYani: {
          enabled: true
        },

        visitMuseum: {
          enabled: true
        },

        visitPlanetarium: {
          enabled: true
        },

        visitTheatre: {
          enabled: true
        },

        visitConcert: {
          enabled: true
        },

        goToCinema: {
          enabled: true
        },

        boatRide: {
          enabled: true
        },

        fishing: {
          enabled: true
        },

        craftWithClay: {
          enabled: true
        },

        lookAtFlowers: {
          enabled: true
        },

        observeAnimals: {
          enabled: true
        },

        stargazing: {
          enabled: true
        },

        checkCalendar: {
          enabled: true
        },

        checkPhone: {
          enabled: true
        },

        lookOutWindow: {
          enabled: true
        },

        organizeDesk: {
          enabled: true
        },

        think: {
          enabled: true
        },

        rememberSomeone: {
          enabled: true
        },

        nothing: {
          enabled: true
        }
      };
    }


    const result = [];


    for (
      const [id, definition]
      of Object.entries(actions)
    ) {

      if (
        definition === false
      ) {
        continue;
      }


      if (
        definition?.enabled === false
      ) {
        continue;
      }


      /*
       * Перетворюємо запис JSON
       * на єдиний формат.
       */
      result.push({

        action:
          id,

        ...(
          typeof definition === "object"
            ? definition
            : {}
        )
      });
    }


    /*
     * Завжди залишаємо можливість
     * нічого не робити.
     */
    if (
      !result.some(
        item =>
          item.action === "nothing"
      )
    ) {

      result.push({
        action: "nothing",
        enabled: true
      });
    }


    /*
     * Фільтрація контекстом.
     */
    return result.filter(
      action =>
        this.isActionPossible(
          action,
          context
        )
    );
  }


  // ============================================================
  // 3. ЧИ МОЖЛИВА ДІЯ
  // ============================================================

  isActionPossible(
    action,
    context
  ) {

    const id =
      action.action;


    /*
     * Сон.
     */
    if (
      id === "sleep"
    ) {

      /*
       * Якщо персонаж уже спить,
       * повторно вибирати sleep не треба.
       */
      if (
        this.getActivity() ===
        "sleeping"
      ) {
        return false;
      }
    }


    /*
     * Робота.
     */
    if (
      id === "work" ||
      id === "working"
    ) {

      if (
        !this.isWorkTime()
      ) {
        return false;
      }
    }


    /*
     * Дії поза домом.
     */
    const outdoorActions = [

      "walk",
      "cycle",
      "visitMuseum",
      "visitPlanetarium",
      "visitTheatre",
      "visitConcert",
      "goToCinema",
      "boatRide",
      "fishing",
      "lookAtFlowers",
      "observeAnimals",
      "stargazing"
    ];


    if (
      outdoorActions.includes(id)
    ) {

      /*
       * Якщо світ або стан забороняє
       * вихід — дія недоступна.
       */
      if (
        context.outdoorAvailable === false
      ) {
        return false;
      }
    }


    /*
     * Стежимо за фізичним станом.
     */
    if (
      context.physicalActivityBlocked
    ) {

      const demanding = [

        "cycle",
        "boatRide",
        "fishing",
        "walk"
      ];


      if (
        demanding.includes(id)
      ) {
        return false;
      }
    }


    return true;
  }


  // ============================================================
  // 4. ОЦІНКА ДІЇ
  // ============================================================

  evaluateAction(
    action,
    context = {}
  ) {

    const id =
      action.action;


    let score = 0;


    const factors = {};


    /*
     * ----------------------------------------------------------
     * ПОТРЕБИ
     * ----------------------------------------------------------
     */

    const needsScore =
      this.evaluateNeeds(
        id
      );


    score +=
      needsScore.total;


    factors.needs =
      needsScore;


    /*
     * ----------------------------------------------------------
     * ЕМОЦІЇ
     * ----------------------------------------------------------
     */

    const emotionScore =
      this.evaluateEmotions(
        id
      );


    score +=
      emotionScore.total;


    factors.emotions =
      emotionScore;


    /*
     * ----------------------------------------------------------
     * ЦІЛІ
     * ----------------------------------------------------------
     */

    const goalScore =
      this.evaluateGoals(
        id
      );


    score +=
      goalScore.total;


    factors.goals =
      goalScore;


    /*
     * ----------------------------------------------------------
     * ІНТЕРЕСИ
     * ----------------------------------------------------------
     */

    const interestScore =
      this.evaluateInterests(
        id,
        action
      );


    score +=
      interestScore.total;


    factors.interests =
      interestScore;


    /*
     * ----------------------------------------------------------
     * УПОДОБАННЯ
     * ----------------------------------------------------------
     */

    const preferenceScore =
      this.evaluatePreferences(
        id,
        action
      );


    score +=
      preferenceScore.total;


    factors.preferences =
      preferenceScore;


    /*
     * ----------------------------------------------------------
     * ЗВИЧКИ
     * ----------------------------------------------------------
     */

    const habitScore =
      this.evaluateHabits(
        id,
        context
      );


    score +=
      habitScore.total;


    factors.habits =
      habitScore;


    /*
     * ----------------------------------------------------------
     * СТОСУНКИ
     * ----------------------------------------------------------
     */

    const relationshipScore =
      this.evaluateRelationships(
        id,
        action
      );


    score +=
      relationshipScore.total;


    factors.relationships =
      relationshipScore;


    /*
     * ----------------------------------------------------------
     * ПОГОДА
     * ----------------------------------------------------------
     */

    const weatherScore =
      this.evaluateWeather(
        id
      );


    score +=
      weatherScore.total;


    factors.weather =
      weatherScore;


    /*
     * ----------------------------------------------------------
     * ЧАС
     * ----------------------------------------------------------
     */

    const timeScore =
      this.evaluateTime(
        id
      );


    score +=
      timeScore.total;


    factors.time =
      timeScore;


    /*
     * ----------------------------------------------------------
     * МІСЦЕ
     * ----------------------------------------------------------
     */

    const locationScore =
      this.evaluateLocation(
        id
      );


    score +=
      locationScore.total;


    factors.location =
      locationScore;


    /*
     * ----------------------------------------------------------
     * НОВИЗНА
     * ----------------------------------------------------------
     */

    const noveltyScore =
      this.evaluateNovelty(
        id
      );


    score +=
      noveltyScore.total;


    factors.novelty =
      noveltyScore;


    /*
     * ----------------------------------------------------------
     * НЕЩОДАВНІ ПОВТОРИ
     * ----------------------------------------------------------
     */

    const repetitionScore =
      this.evaluateRepetition(
        id
      );


    score +=
      repetitionScore.total;


    factors.repetition =
      repetitionScore;


    /*
     * ----------------------------------------------------------
     * ЕНЕРГІЯ
     * ----------------------------------------------------------
     */

    const energyScore =
      this.evaluateEnergy(
        id
      );


    score +=
      energyScore.total;


    factors.energy =
      energyScore;


    /*
     * ----------------------------------------------------------
     * ВИПАДКОВІСТЬ
     * ----------------------------------------------------------
     */

    const randomScore =
      this.randomVariation();


    score +=
      randomScore;


    factors.random =
      randomScore;


    /*
     * Базовий пріоритет дії.
     */
    const base =
      Number(
        action.priority ??
        action.basePriority ??
        0
      );


    score +=
      base;


    factors.base =
      base;


    /*
     * Межі.
     *
     * Це не рейтинг персонажа,
     * а технічний бал конкретного рішення.
     */
    score =
      Math.round(
        score * 100
      ) / 100;


    return {

      action: id,

      target:
        action.target ??
        this.findNaturalTarget(id),

      duration:
        action.duration ??
        this.estimateDuration(id),

      score,

      factors
    };
  }


  // ============================================================
  // 5. ПОТРЕБИ
  // ============================================================

  evaluateNeeds(action) {

    const needs =
      this.brain.state?.needs ||
      {};


    let total = 0;

    const factors = {};


    const hunger =
      Number(
        needs.hunger ?? 0
      );


    const thirst =
      Number(
        needs.thirst ?? 0
      );


    const energy =
      Number(
        needs.energy ?? 50
      );


    const sleep =
      Number(
        needs.sleep ?? 50
      );


    const rest =
      Number(
        needs.rest ?? 50
      );


    const social =
      Number(
        needs.social ?? 50
      );


    const fun =
      Number(
        needs.fun ?? 50
      );


    const curiosity =
      Number(
        needs.curiosity ?? 50
      );


    const comfort =
      Number(
        needs.comfort ?? 50
      );


    /*
     * Їжа.
     */
    if (
      action === "eat"
    ) {

      const value =
        hunger * 0.45;

      total += value;

      factors.hunger =
        value;
    }


    /*
     * Напій.
     */
    if (
      action === "drink"
    ) {

      const value =
        thirst * 0.45;

      total += value;

      factors.thirst =
        value;
    }


    /*
     * Сон.
     */
    if (
      action === "sleep"
    ) {

      const value =
        (
          (100 - sleep) +
          (100 - energy)
        ) * 0.35;

      total += value;

      factors.sleep =
        value;
    }


    /*
     * Відпочинок.
     */
    if (
      action === "rest"
    ) {

      const value =
        (
          (100 - rest) +
          (100 - energy)
        ) * 0.25;

      total += value;

      factors.rest =
        value;
    }


    /*
     * Соціальна взаємодія.
     */
    const socialActions = [

      "talkToSomeone",
      "talkToYani",
      "checkSocialNetwork",
      "writePost"
    ];


    if (
      socialActions.includes(
        action
      )
    ) {

      const value =
        social * 0.25;

      total += value;

      factors.social =
        value;
    }


    /*
     * Розваги.
     */
    const funActions = [

      "playGame",
      "listenToMusic",
      "goToCinema",
      "walk",
      "cycle",
      "visitTheatre",
      "visitConcert"
    ];


    if (
      funActions.includes(
        action
      )
    ) {

      const value =
        fun * 0.20;

      total += value;

      factors.fun =
        value;
    }


    /*
     * Цікавість.
     */
    const curiosityActions = [

      "read",
      "visitMuseum",
      "visitPlanetarium",
      "think",
      "stargazing",
      "checkSocialNetwork",
      "explore"
    ];


    if (
      curiosityActions.includes(
        action
      )
    ) {

      const value =
        curiosity * 0.22;

      total += value;

      factors.curiosity =
        value;
    }


    /*
     * Комфорт.
     */
    if (
      action === "rest" ||
      action === "organizeDesk" ||
      action === "listenToMusic"
    ) {

      const value =
        comfort * 0.12;

      total += value;

      factors.comfort =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 6. ЕМОЦІЇ
  // ============================================================

  evaluateEmotions(action) {

    const mood =
      this.brain.mood;


    if (!mood) {

      return {
        total: 0,
        factors: {}
      };
    }


    const effects = {

      cycling: {
        joy: 0.18,
        boredom: -0.20,
        pleasure: 0.12
      },

      walk: {
        calm: 0.15,
        boredom: -0.16
      },

      reading: {
        calm: 0.12,
        curiosity: 0.18,
        boredom: -0.10
      },

      planetarium: {
        curiosity: 0.28,
        interest: 0.25,
        pleasure: 0.20
      },

      museum: {
        curiosity: 0.22,
        interest: 0.20
      },

      music: {
        pleasure: 0.16,
        calm: 0.14
      },

      gaming: {
        pleasure: 0.14,
        boredom: -0.18
      },

      talkToYani: {
        affection: 0.25,
        attachment: 0.20,
        loneliness: -0.18,
        joy: 0.16
      },

      talkToSomeone: {
        loneliness: -0.15,
        sympathy: 0.12
      },

      rest: {
        fatigue: -0.25,
        calm: 0.20
      },

      sleep: {
        fatigue: -0.35,
        anxiety: -0.15,
        calm: 0.20
      }
    };


    const normalized =
      action === "listenToMusic"
        ? "music"
        : action === "playGame"
          ? "gaming"
          : action;


    const map =
      effects[normalized] ||
      {};


    let total = 0;

    const factors = {};


    for (
      const [emotion, coefficient]
      of Object.entries(map)
    ) {

      const value =
        mood.get(emotion) *
        coefficient;


      total += value;

      factors[emotion] =
        value;
    }


    /*
     * Якщо дія суперечить поточній емоції,
     * вона може отримати штраф.
     *
     * Наприклад:
     * сильна втома → довга прогулянка менш імовірна.
     */
    const fatigue =
      mood.get("fatigue");


    if (
      fatigue > 75
    ) {

      const demanding = [

        "cycle",
        "walk",
        "fishing",
        "boatRide"
      ];


      if (
        demanding.includes(
          action
        )
      ) {

        total -=
          (fatigue - 75) *
          0.30;

        factors.fatiguePenalty =
          -(fatigue - 75) *
          0.30;
      }
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 7. ЦІЛІ
  // ============================================================

  evaluateGoals(action) {

    const goals =
      this.brain.state?.goals ||
      [];


    let total = 0;

    const factors = {};


    /*
     * Підтримуємо як масив,
     * так і об'єкт activeGoals.
     */
    const activeGoals =
      Array.isArray(goals)
        ? goals
        : (
          goals.activeGoals ||
          []
        );


    for (
      const goal
      of activeGoals
    ) {

      if (
        !goal ||
        goal.status === "completed" ||
        goal.active === false
      ) {
        continue;
      }


      const possibleActions =
        goal.possibleActions ||
        goal.actions ||
        [];


      if (
        !possibleActions.includes(
          action
        )
      ) {
        continue;
      }


      const importance =
        Number(
          goal.importance ?? 50
        );


      const urgency =
        Number(
          goal.urgency ?? 50
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


      const value =
        importance * 0.20 +
        urgency * 0.16 +
        motivation * 0.14 +
        (100 - progress) * 0.05 +
        (100 - flexibility) * 0.03;


      total += value;


      factors[
        goal.id ||
        goal.name ||
        "goal"
      ] =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 8. ІНТЕРЕСИ
  // ============================================================

  evaluateInterests(
    action,
    definition
  ) {

    const interests =
      this.brain.data.interests ||
      {};


    let total = 0;

    const factors = {};


    /*
     * Зв'язок дія → тема.
     */
    const actionTopics = {

      cycle: ["cycling"],

      walk: [
        "cityWalks",
        "city",
        "parks"
      ],

      read: [
        "reading",
        "books"
      ],

      visitMuseum: [
        "museums",
        "culture"
      ],

      visitPlanetarium: [
        "planetarium",
        "space",
        "astronomy"
      ],

      stargazing: [
        "space",
        "astronomy"
      ],

      goToCinema: [
        "cinema"
      ],

      playGame: [
        "games"
      ],

      talkToYani: [
        "relationships",
        "Yani"
      ],

      lookAtFlowers: [
        "flowers"
      ],

      observeAnimals: [
        "animals"
      ],

      fishing: [
        "fishing"
      ],

      boatRide: [
        "boatRides"
      ],

      visitTheatre: [
        "theatre"
      ],

      visitConcert: [
        "concerts"
      ],

      craftWithClay: [
        "clayCrafting"
      ]
    };


    const topics =
      actionTopics[action] ||
      definition.topics ||
      [];


    for (
      const topic
      of topics
    ) {

      const data =
        interests[topic];


      if (!data) {
        continue;
      }


      const interest =
        Number(
          data.interest ??
          data.value ??
          0
        );


      const initiative =
        Number(
          data.initiative ??
          0
        );


      const frequency =
        Number(
          data.frequency ??
          0
        );


      const novelty =
        Number(
          data.novelty ??
          0
        );


      const value =
        interest * 0.18 +
        initiative * 0.10 +
        frequency * 0.04 +
        novelty * 0.05;


      total += value;


      factors[topic] =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 9. УПОДОБАННЯ
  // ============================================================

  evaluatePreferences(
    action,
    definition
  ) {

    const preferences =
      this.brain.data.preferences ||
      {};


    let total = 0;

    const factors = {};


    const mapping = {

      cycle: [
        ["activities", "cycling"]
      ],

      walk: [
        ["activities", "cityWalks"]
      ],

      visitMuseum: [
        ["activities", "museums"]
      ],

      visitPlanetarium: [
        ["activities", "planetarium"]
      ],

      goToCinema: [
        ["activities", "cinema"]
      ],

      visitTheatre: [
        ["activities", "theatre"]
      ],

      visitConcert: [
        ["activities", "concerts"]
      ],

      boatRide: [
        ["activities", "boatRides"]
      ],

      fishing: [
        ["activities", "fishing"]
      ],

      read: [
        ["activities", "reading"]
      ],

      craftWithClay: [
        ["activities", "clay"]
      ],

      lookAtFlowers: [
        ["nature", "flowers"]
      ],

      observeAnimals: [
        ["nature", "animals"]
      ]
    };


    const entries =
      mapping[action] ||
      [];


    for (
      const [category, key]
      of entries
    ) {

      const data =
        preferences?.[category]?.[key];


      if (!data) {
        continue;
      }


      /*
       * Тут навмисно використовуємо
       * кілька параметрів, а не один.
       */
      const liking =
        Number(
          data.liking ??
          0
        );


      const comfort =
        Number(
          data.comfort ??
          0
        );


      const practicality =
        Number(
          data.practicality ??
          0
        );


      const aesthetic =
        Number(
          data.aesthetic ??
          0
        );


      const value =
        liking * 0.16 +
        comfort * 0.06 +
        practicality * 0.03 +
        aesthetic * 0.03;


      total += value;


      factors[
        `${category}.${key}`
      ] =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 10. ЗВИЧКИ
  // ============================================================

  evaluateHabits(
    action,
    context
  ) {

    const habits =
      this.brain.data.habits ||
      {};


    let total = 0;

    const factors = {};


    /*
     * Шукаємо всі звички, пов'язані з дією.
     */
    const allHabits =
      habits.habits ||
      habits;


    for (
      const [id, habit]
      of Object.entries(
        allHabits
      )
    ) {

      if (
        !habit ||
        typeof habit !== "object"
      ) {
        continue;
      }


      const possibleActions =
        habit.actions ||
        habit.activities ||
        [];


      if (
        !possibleActions.includes(
          action
        )
      ) {
        continue;
      }


      let probability =
        Number(
          habit.probability ??
          habit.chance ??
          habit.frequency ??
          0
        );


      /*
       * Якщо звичка прив'язана до часу,
       * перевіряємо контекст.
       */
      if (
        habit.time &&
        !this.matchesTimeCondition(
          habit.time
        )
      ) {

        probability *=
          0.25;
      }


      /*
       * Погода теж може змінити звичку.
       */
      if (
        habit.weather &&
        !this.matchesWeatherCondition(
          habit.weather
        )
      ) {

        probability *=
          0.30;
      }


      /*
       * Нещодавній повтор послаблює звичку.
       */
      const recentPenalty =
        this.getRecentActionPenalty(
          action
        );


      const value =
        probability *
        0.08 *
        (1 - recentPenalty);


      total += value;


      factors[id] =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 11. СТОСУНКИ
  // ============================================================

  evaluateRelationships(
    action,
    definition
  ) {

    const relationships =
      this.brain.state
        ?.relationships ||
      {};


    let total = 0;

    const factors = {};


    if (
      action === "talkToYani"
    ) {

      const relationship =
        relationships
          .Yani_Bakeneko;


      if (
        relationship
      ) {

        const closeness =
          Number(
            relationship.closeness ??
            0
          );


        const affection =
          Number(
            relationship.affection ??
            0
          );


        const contact =
          Number(
            relationship.desireForContact ??
            0
          );


        const value =
          closeness * 0.18 +
          affection * 0.20 +
          contact * 0.22;


        total += value;


        factors.Yani =
          value;
      }
    }


    /*
     * Загальна потреба в компанії.
     */
    if (
      action === "talkToSomeone"
    ) {

      const social =
        Number(
          this.brain.state
            ?.needs
            ?.social ??
          50
        );


      const value =
        social * 0.15;


      total += value;


      factors.social =
        value;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 12. ПОГОДА
  // ============================================================

  evaluateWeather(action) {

    const weather =
      this.brain.data.weather
        ?.current ||
      {};


    let total = 0;

    const factors = {};


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
      outdoor.includes(
        action
      )
    ) {

      const comfort =
        Number(
          weather.outdoorComfort ??
          weather.comfort ??
          50
        );


      const value =
        (comfort - 50) *
        0.30;


      total += value;


      factors.outdoorComfort =
        value;
    }


    /*
     * Нічне спостереження не дуже
     * добре узгоджується з днем.
     */
    if (
      action === "stargazing"
    ) {

      const isNight =
        this.isNight();


      if (isNight) {

        total += 30;

        factors.night =
          30;
      }

      else {

        total -= 30;

        factors.dayPenalty =
          -30;
      }
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 13. ЧАС
  // ============================================================

  evaluateTime(action) {

    let total = 0;

    const factors = {};


    const hour =
      this.getHour();


    /*
     * Робота.
     */
    if (
      action === "work"
    ) {

      if (
        hour >= 10 &&
        hour < 18
      ) {

        total += 35;

        factors.workHours =
          35;
      }
      else {

        total -= 80;

        factors.outsideWorkHours =
          -80;
      }
    }


    /*
     * Сон.
     */
    if (
      action === "sleep"
    ) {

      if (
        hour >= 22 ||
        hour < 8
      ) {

        total += 35;

        factors.sleepTime =
          35;
      }
    }


    /*
     * Планетарій/музей/театр тощо
     * частіше доречні вдень/увечері.
     */
    const cultural = [

      "visitMuseum",
      "visitPlanetarium",
      "visitTheatre",
      "visitConcert",
      "goToCinema"
    ];


    if (
      cultural.includes(
        action
      )
    ) {

      if (
        hour >= 10 &&
        hour <= 21
      ) {

        total += 10;

        factors.openHours =
          10;
      }
      else {

        total -= 20;

        factors.lateHours =
          -20;
      }
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 14. МІСЦЕ
  // ============================================================

  evaluateLocation(action) {

    const location =
      this.brain.state
        ?.character
        ?.location ||
      this.brain.state
        ?.location ||
      "home";


    let total = 0;

    const factors = {};


    const directActions = {

      organizeDesk:
        ["home", "techsmith"],

      work:
        ["techsmith"],

      fishing:
        ["water"],

      boatRide:
        ["water"],

      stargazing:
        ["rooftop"],

      lookAtFlowers:
        ["park"],

      observeAnimals:
        ["park"],

      visitMuseum:
        ["museum"],

      visitPlanetarium:
        ["planetarium"],

      visitTheatre:
        ["theatre"],

      visitConcert:
        ["concertHall"],

      goToCinema:
        ["cinema"]
    };


    const idealLocations =
      directActions[action];


    if (
      idealLocations?.includes(
        location
      )
    ) {

      total += 25;

      factors.correctLocation =
        25;
    }


    /*
     * Якщо дія потребує переходу,
     * це невеликий штраф, а не заборона.
     */
    else if (
      idealLocations
    ) {

      total -= 8;

      factors.travelCost =
        -8;
    }


    /*
     * Домашні дії.
     */
    const homeActions = [

      "rest",
      "read",
      "listenToMusic",
      "playGame",
      "checkPhone",
      "checkSocialNetwork",
      "think",
      "rememberSomeone"
    ];


    if (
      homeActions.includes(
        action
      ) &&
      location === "home"
    ) {

      total += 15;

      factors.homeComfort =
        15;
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 15. НОВИЗНА
  // ============================================================

  evaluateNovelty(action) {

    const recent =
      this.getRecentActions();


    const count =
      recent.filter(
        item =>
          item === action
      ).length;


    /*
     * Якщо дія давно не виконувалась,
     * новизна трохи підвищує її шанс.
     */
    if (
      count === 0
    ) {

      return {
        total: 8,
        factors: {
          newAction: 8
        }
      };
    }


    return {
      total:
        Math.max(
          -10,
          8 - count * 4
        ),

      factors: {
        previousUse:
          Math.max(
            -10,
            8 - count * 4
          )
      }
    };
  }


  // ============================================================
  // 16. ПОВТОРЕННЯ
  // ============================================================

  evaluateRepetition(action) {

    const recent =
      this.getRecentActions();


    const index =
      recent.indexOf(
        action
      );


    if (
      index === -1
    ) {

      return {
        total: 0,
        factors: {}
      };
    }


    /*
     * Чим ближче останній повтор,
     * тим сильніше покарання.
     */
    const penalty =
      Math.max(
        -35,
        -25 +
        index * 4
      );


    return {
      total: penalty,

      factors: {
        recentRepeat:
          penalty
      }
    };
  }


  // ============================================================
  // 17. ЕНЕРГІЯ
  // ============================================================

  evaluateEnergy(action) {

    const energy =
      Number(
        this.brain.state
          ?.needs
          ?.energy ??
        50
      );


    const demanding = [

      "cycle",
      "walk",
      "boatRide",
      "fishing",
      "work"
    ];


    const relaxing = [

      "rest",
      "sleep",
      "read",
      "listenToMusic",
      "think"
    ];


    let total = 0;

    const factors = {};


    if (
      demanding.includes(
        action
      )
    ) {

      if (
        energy < 25
      ) {

        total -= 30;

        factors.lowEnergy =
          -30;
      }

      else if (
        energy > 70
      ) {

        total += 10;

        factors.highEnergy =
          10;
      }
    }


    if (
      relaxing.includes(
        action
      )
    ) {

      if (
        energy < 40
      ) {

        total += 18;

        factors.lowEnergy =
          18;
      }
    }


    return {
      total,
      factors
    };
  }


  // ============================================================
  // 18. ВИПАДКОВА ВАРІАЦІЯ
  // ============================================================

  randomVariation() {

    return (
      Math.random() * 2 - 1
    ) * this.randomness;
  }


  // ============================================================
  // 19. ВИБІР КАНДИДАТА
  // ============================================================

  selectCandidate(
    candidates
  ) {

    if (
      !candidates.length
    ) {

      return {
        action: "nothing",
        score: 0,
        factors: {}
      };
    }


    /*
     * Найкращий кандидат має найбільшу
     * ймовірність, але не абсолютну гарантію.
     *
     * Використовуємо softmax-подібний вибір.
     */
    const temperature =
      20;


    const values =
      candidates.map(
        candidate =>
          Math.exp(
            candidate.score /
            temperature
          )
      );


    const sum =
      values.reduce(
        (a, b) =>
          a + b,
        0
      );


    let random =
      Math.random() * sum;


    for (
      let i = 0;
      i < candidates.length;
      i++
    ) {

      random -=
        values[i];


      if (
        random <= 0
      ) {

        return candidates[i];
      }
    }


    return candidates[0];
  }


  // ============================================================
  // 20. ПРИРОДНА ЦІЛЬ ДІЇ
  // ============================================================

  findNaturalTarget(
    action
  ) {

    if (
      action === "talkToYani"
    ) {

      return "Yani_Bakeneko";
    }


    if (
      action === "work"
    ) {

      return "Techsmith";
    }


    if (
      action === "talkToSomeone"
    ) {

      return this.findSocialTarget();
    }


    return null;
  }


  findSocialTarget() {

    const relationships =
      this.brain.state
        ?.relationships ||
      {};


    /*
     * Шукаємо людину з найбільшим
     * бажанням контакту.
     */
    let best = null;

    let bestValue =
      -Infinity;


    for (
      const [personId, relation]
      of Object.entries(
        relationships
      )
    ) {

      const value =
        Number(
          relation.desireForContact ??
          relation.liking ??
          0
        );


      if (
        value > bestValue
      ) {

        bestValue =
          value;

        best =
          personId;
      }
    }


    return best;
  }


  // ============================================================
  // 21. ТРИВАЛІСТЬ
  // ============================================================

  estimateDuration(
    action
  ) {

    const durations = {

      sleep: 480,

      eat: 20,

      drink: 5,

      rest: 30,

      work: 60,

      walk: 45,

      cycle: 60,

      read: 40,

      listenToMusic: 30,

      playGame: 40,

      checkSocialNetwork: 15,

      writePost: 20,

      talkToSomeone: 20,

      talkToYani: 30,

      visitMuseum: 120,

      visitPlanetarium: 120,

      visitTheatre: 150,

      visitConcert: 120,

      goToCinema: 130,

      boatRide: 90,

      fishing: 120,

      craftWithClay: 60,

      lookAtFlowers: 20,

      observeAnimals: 30,

      stargazing: 45,

      checkCalendar: 5,

      checkPhone: 5,

      lookOutWindow: 5,

      organizeDesk: 20,

      think: 15,

      rememberSomeone: 5,

      nothing: 15
    };


    return (
      durations[action] ??
      15
    );
  }


  // ============================================================
  // 22. ЧАС РОБОТИ
  // ============================================================

  isWorkTime() {

    const hour =
      this.getHour();


    return (
      hour >= 10 &&
      hour < 18 &&
      this.getDayOfWeek() >= 1 &&
      this.getDayOfWeek() <= 5
    );
  }


  // ============================================================
  // 23. НЕЩОДАВНІ ДІЇ
  // ============================================================

  getRecentActions() {

    const actions =
      this.brain.state
        ?.recentActions;


    if (
      Array.isArray(actions)
    ) {

      return actions
        .slice(
          -this.recentActionLimit
        )
        .map(
          item =>
            typeof item === "string"
              ? item
              : item.action
        );
    }


    return this.history
      .slice(
        -this.recentActionLimit
      )
      .map(
        item =>
          item.action
      );
  }


  getRecentActionPenalty(
    action
  ) {

    const recent =
      this.getRecentActions();


    const index =
      recent.lastIndexOf(
        action
      );


    if (
      index === -1
    ) {
      return 0;
    }


    const distance =
      recent.length -
      1 -
      index;


    return Math.max(
      0,
      1 -
      distance /
      this.recentActionLimit
    );
  }


  // ============================================================
  // 24. УМОВИ ЧАСУ
  // ============================================================

  matchesTimeCondition(
    condition
  ) {

    if (!condition) {
      return true;
    }


    const hour =
      this.getHour();


    if (
      typeof condition === "string"
    ) {

      if (
        condition === "morning"
      ) {
        return hour >= 6 &&
          hour < 12;
      }

      if (
        condition === "day"
      ) {
        return hour >= 12 &&
          hour < 18;
      }

      if (
        condition === "evening"
      ) {
        return hour >= 18 &&
          hour < 23;
      }

      if (
        condition === "night"
      ) {
        return hour >= 23 ||
          hour < 6;
      }
    }


    return true;
  }


  // ============================================================
  // 25. УМОВИ ПОГОДИ
  // ============================================================

  matchesWeatherCondition(
    condition
  ) {

    const weather =
      this.brain.data.weather
        ?.current ||
      {};


    if (
      typeof condition !== "string"
    ) {
      return true;
    }


    if (
      condition === "good"
    ) {

      return (
        Number(
          weather.outdoorComfort ??
          weather.comfort ??
          50
        ) >= 60
      );
    }


    if (
      condition === "bad"
    ) {

      return (
        Number(
          weather.outdoorComfort ??
          weather.comfort ??
          50
        ) < 60
      );
    }


    return true;
  }


  // ============================================================
  // 26. «НІЧОГО НЕ РОБИТИ»
  // ============================================================

  createNothingDecision(
    reason
  ) {

    const decision = {

      action:
        "nothing",

      target:
        null,

      duration:
        15,

      score:
        0,

      factors: {

        reason
      },

      alternatives: [],

      timestamp:
        this.getCurrentTime()
    };


    this.lastDecision =
      decision;


    this.recordDecision(
      decision
    );


    return decision;
  }


  // ============================================================
  // 27. ІСТОРІЯ
  // ============================================================

  recordDecision(
    decision
  ) {

    this.history.push({

      action:
        decision.action,

      target:
        decision.target,

      score:
        decision.score,

      timestamp:
        decision.timestamp
    });


    if (
      this.history.length >
      this.maxHistory
    ) {

      this.history.shift();
    }


    /*
     * Зберігаємо також у brain.state,
     * щоб інші модулі бачили недавню поведінку.
     */
    if (
      this.brain.state
    ) {

      if (
        !Array.isArray(
          this.brain.state.recentActions
        )
      ) {

        this.brain.state.recentActions =
          [];
      }


      this.brain.state
        .recentActions
        .push({

          action:
            decision.action,

          target:
            decision.target,

          timestamp:
            decision.timestamp
        });


      if (
        this.brain.state
          .recentActions
          .length > 20
      ) {

        this.brain.state
          .recentActions
          .shift();
      }
    }
  }


  // ============================================================
  // 28. ДОПОМОГА
  // ============================================================

  getActivity() {

    return (
      this.brain.state
        ?.character
        ?.activity ??
      this.brain.state
        ?.activity ??
      "idle"
    );
  }


  getHour() {

    const time =
      this.brain.state
        ?.world
        ?.time;


    if (
      typeof time === "string"
    ) {

      return Number(
        time.split(":")[0]
      );
    }


    return new Date()
      .getHours();
  }


  getDayOfWeek() {

    /*
     * Якщо brain уже має дату світу,
     * використовуємо її.
     */
    const date =
      this.brain.state
        ?.world
        ?.date;


    if (date) {

      const parsed =
        new Date(date);


      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {

        return parsed.getDay() || 7;
      }
    }


    const day =
      new Date()
        .getDay();


    return day || 7;
  }


  isNight() {

    const hour =
      this.getHour();


    return (
      hour >= 21 ||
      hour < 6
    );
  }


  getCurrentTime() {

    if (
      this.brain.state
        ?.world
    ) {

      return (
        this.brain.state.world.date +
        "T" +
        this.brain.state.world.time
      );
    }


    return new Date()
      .toISOString();
  }
}


// ============================================================
// ЕКСПОРТ
// ============================================================

if (
  typeof window !== "undefined"
) {

  window.AkiraDecision =
    AkiraDecision;
}
