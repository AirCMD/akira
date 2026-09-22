/*
 * ЕМОЦІЙНИЙ СТАН АКІРИ
 *
 * mood.js відповідає за поточні емоції.
 *
 * Важливо:
 *
 * personality.json
 *     ↓
 * базова схильність характеру
 *
 * emotions.json
 *     ↓
 * набір доступних емоцій та їхні правила
 *
 * mood.js
 *     ↓
 * ПОТОЧНИЙ емоційний стан
 *
 * Поточний стан не є особистістю.
 * Він постійно змінюється.
 */


class AkiraMood {

  constructor(brain) {

    this.brain = brain;

    /*
     * Поточні значення емоцій.
     *
     * Наприклад:
     *
     * {
     *   joy: 60,
     *   curiosity: 72,
     *   calm: 55
     * }
     */
    this.emotions = {};

    /*
     * Причини останніх змін.
     *
     * Це потрібно не лише для налагодження,
     * а й для можливого пояснення поведінки
     * іншими модулями.
     */
    this.recentChanges = [];

    /*
     * Тимчасові емоційні ефекти.
     *
     * Наприклад:
     *
     * {
     *   source: "messageFromYani",
     *   emotion: "joy",
     *   amount: 25,
     *   remaining: 30
     * }
     */
    this.effects = [];

    /*
     * Історія емоційних станів.
     */
    this.history = [];

    this.maxHistory = 100;
  }


  // ============================================================
  // 1. ІНІЦІАЛІЗАЦІЯ
  // ============================================================

  init() {

    const source =
      this.brain.data.emotions || {};


    /*
     * Шукаємо базовий набір емоцій
     * у кількох можливих структурах.
     */
    let baseline = null;

    if (source.baseline) {
      baseline = source.baseline;
    }

    else if (source.current) {
      baseline = source.current;
    }

    else if (source.emotions) {
      baseline = source.emotions;
    }

    else {
      baseline = source;
    }


    /*
     * Беремо тільки числові емоційні значення.
     */
    for (
      const [emotion, value]
      of Object.entries(baseline)
    ) {

      if (
        typeof value === "number"
      ) {

        this.emotions[emotion] =
          this.clamp(value);
      }

      /*
       * Підтримуємо структуру:
       *
       * joy: {
       *   baseline: 60
       * }
       */
      else if (
        value &&
        typeof value === "object"
      ) {

        if (
          typeof value.baseline === "number"
        ) {

          this.emotions[emotion] =
            this.clamp(
              value.baseline
            );
        }

        else if (
          typeof value.default === "number"
        ) {

          this.emotions[emotion] =
            this.clamp(
              value.default
            );
        }

        else if (
          typeof value.current === "number"
        ) {

          this.emotions[emotion] =
            this.clamp(
              value.current
            );
        }
      }
    }


    /*
     * Якщо brain уже має збережені емоції,
     * вони мають пріоритет.
     */
    if (
      this.brain.state?.emotions &&
      Object.keys(
        this.brain.state.emotions
      ).length
    ) {

      this.emotions = {
        ...this.emotions,
        ...this.brain.state.emotions
      };
    }


    this.syncToBrain();

    return this;
  }


  // ============================================================
  // 2. ОТРИМАТИ ЕМОЦІЮ
  // ============================================================

  get(emotion) {

    return (
      this.emotions[emotion] ??
      0
    );
  }


  // ============================================================
  // 3. ВСТАНОВИТИ ЕМОЦІЮ
  // ============================================================

  set(
    emotion,
    value,
    reason = "unknown"
  ) {

    const previous =
      this.get(emotion);

    const next =
      this.clamp(value);


    this.emotions[emotion] =
      next;


    const change =
      next - previous;


    if (
      Math.abs(change) >= 0.1
    ) {

      this.recordChange({
        emotion,
        previous,
        value: next,
        change,
        reason
      });
    }


    this.syncToBrain();

    return next;
  }


  // ============================================================
  // 4. ЗМІНИТИ ЕМОЦІЮ
  // ============================================================

  change(
    emotion,
    amount,
    reason = "unknown",
    options = {}
  ) {

    const previous =
      this.get(emotion);

    /*
     * Модифікатор інтенсивності.
     *
     * Наприклад, дуже сильна подія може
     * мати intensity = 1.5.
     */
    const intensity =
      options.intensity ??
      1;


    let actualAmount =
      amount * intensity;


    /*
     * Якщо вказана тривалість,
     * ефект може зберігатися довше.
     *
     * Це не збільшує емоцію напряму,
     * а створює тимчасовий ефект.
     */
    const duration =
      options.duration ?? 0;


    /*
     * Змінюємо поточну емоцію.
     */
    const next =
      this.clamp(
        previous +
        actualAmount
      );


    this.emotions[emotion] =
      next;


    this.recordChange({

      emotion,

      previous,

      value: next,

      change:
        next - previous,

      reason,

      timestamp:
        this.getCurrentTime()
    });


    /*
     * Додаємо тимчасовий ефект.
     */
    if (
      duration > 0
    ) {

      this.effects.push({

        emotion,

        amount:
          actualAmount,

        remaining:
          duration,

        reason
      });
    }


    this.syncToBrain();

    return next;
  }


  // ============================================================
  // 5. ЕМОЦІЙНИЙ ЕФЕКТ
  // ============================================================

  addEffect(
    emotion,
    amount,
    duration,
    reason = "unknown"
  ) {

    this.effects.push({

      emotion,

      amount,

      remaining:
        Math.max(
          1,
          duration
        ),

      reason
    });


    /*
     * Перший імпульс застосовуємо одразу.
     */
    this.change(
      emotion,
      amount,
      reason
    );
  }


  // ============================================================
  // 6. ОНОВЛЕННЯ ЕФЕКТІВ
  // ============================================================

  updateEffects(minutes = 1) {

    const active = [];

    for (
      const effect
      of this.effects
    ) {

      effect.remaining -= minutes;


      /*
       * Ефект поступово згасає.
       */
      if (
        effect.remaining > 0
      ) {

        /*
         * Замість повного повторного
         * застосування використовуємо
         * малу частину сили.
         */
        const fadeAmount =
          effect.amount *
          0.02 *
          minutes;


        this.change(
          effect.emotion,
          effect.amount > 0
            ? fadeAmount
            : -Math.abs(fadeAmount),
          `продовження ефекту: ${effect.reason}`
        );


        active.push(effect);
      }
    }


    this.effects = active;
  }


  // ============================================================
  // 7. ВПЛИВ ПОТРЕБ
  // ============================================================

  updateFromNeeds() {

    const needs =
      this.brain.state?.needs ||
      {};


    /*
     * Енергія.
     */
    if (
      needs.energy !== undefined
    ) {

      const energy =
        Number(needs.energy);


      if (
        energy < 20
      ) {

        this.change(
          "fatigue",
          1.5,
          "дуже низька енергія"
        );

        this.change(
          "irritation",
          0.5,
          "дуже низька енергія"
        );

        this.change(
          "joy",
          -0.3,
          "дуже низька енергія"
        );
      }

      else if (
        energy > 75
      ) {

        this.change(
          "fatigue",
          -0.8,
          "висока енергія"
        );
      }
    }


    /*
     * Соціальна потреба.
     */
    if (
      needs.social !== undefined
    ) {

      const social =
        Number(needs.social);


      if (
        social < 20
      ) {

        this.change(
          "loneliness",
          1,
          "низька соціальна насиченість"
        );
      }

      else if (
        social > 80
      ) {

        this.change(
          "loneliness",
          -1,
          "висока соціальна насиченість"
        );
      }
    }


    /*
     * Потреба у відпочинку.
     */
    if (
      needs.rest !== undefined
    ) {

      const rest =
        Number(needs.rest);


      if (
        rest < 20
      ) {

        this.change(
          "fatigue",
          1,
          "низька потреба у відпочинку"
        );
      }
    }


    /*
     * Цікавість.
     */
    if (
      needs.curiosity !== undefined
    ) {

      const curiosity =
        Number(needs.curiosity);


      if (
        curiosity > 75
      ) {

        this.change(
          "curiosity",
          0.5,
          "висока потреба у пізнанні"
        );
      }
    }
  }


  // ============================================================
  // 8. ВПЛИВ ОСОБИСТОСТІ
  // ============================================================

  getPersonalityModifier(emotion) {

    const personality =
      this.brain.data.personality
        ?.personality
        ?.traits ||
      {};


    /*
     * Особистість не задає поточну емоцію.
     *
     * Вона лише змінює схильність.
     */

    const map = {

      curiosity:
        personality.curiosity,

      sympathy:
        personality.empathy,

      sensitivity:
        personality.sensitivity,

      calm:
        personality.calmness,

      confidence:
        personality.confidence,

      enthusiasm:
        personality.enthusiasm,

      attachment:
        personality.attachment,

      jealousy:
        personality.jealousy,

      patience:
        personality.patience,

      anger:
        personality.impulsiveness,

      anxiety:
        100 -
        (personality.calmness ?? 50)
    };


    const value =
      map[emotion];


    if (
      value === undefined
    ) {
      return 0;
    }


    /*
     * Перетворюємо 0–100
     * у невеликий модифікатор.
     */
    return (
      value - 50
    ) * 0.02;
  }


  // ============================================================
  // 9. ВПЛИВ ПОГОДИ
  // ============================================================

  updateFromWeather() {

    const weather =
      this.brain.data.weather
        ?.current ||
      this.brain.state
        ?.situation
        ?.weather;


    if (!weather) {
      return;
    }


    /*
     * Сонячна/приємна погода.
     */
    if (
      weather.comfort !== undefined &&
      weather.comfort >= 75
    ) {

      this.change(
        "joy",
        0.4,
        "комфортна погода"
      );

      this.change(
        "calm",
        0.2,
        "комфортна погода"
      );
    }


    /*
     * Сильний дискомфорт.
     */
    if (
      weather.comfort !== undefined &&
      weather.comfort <= 25
    ) {

      this.change(
        "irritation",
        0.5,
        "некомфортна погода"
      );
    }
  }


  // ============================================================
  // 10. ВПЛИВ ДІЯЛЬНОСТІ
  // ============================================================

  updateFromActivity() {

    const activity =
      this.brain.state
        ?.character
        ?.activity;


    if (!activity) {
      return;
    }


    const effects = {

      cycling: {
        joy: 0.5,
        pleasure: 0.5,
        boredom: -0.5
      },

      walking: {
        calm: 0.3,
        joy: 0.2,
        boredom: -0.3
      },

      reading: {
        calm: 0.3,
        curiosity: 0.3,
        boredom: -0.2
      },

      gaming: {
        pleasure: 0.3,
        boredom: -0.5
      },

      resting: {
        calm: 0.5,
        fatigue: -0.5
      },

      sleeping: {
        calm: 0.8,
        fatigue: -1
      },

      working: {
        achievement: 0.2,
        fatigue: 0.3
      },

      talking: {
        loneliness: -0.4,
        sympathy: 0.2
      },

      thinking: {
        curiosity: 0.2
      }
    };


    const activityEffects =
      effects[activity];


    if (!activityEffects) {
      return;
    }


    for (
      const [emotion, amount]
      of Object.entries(
        activityEffects
      )
    ) {

      this.change(
        emotion,
        amount,
        `діяльність: ${activity}`
      );
    }
  }


  // ============================================================
  // 11. ВПЛИВ СТОСУНКІВ
  // ============================================================

  reactToPerson(
    personId,
    event = "presence"
  ) {

    const relationship =
      this.brain.state
        ?.relationships
        ?.[personId];


    if (!relationship) {
      return;
    }


    const liking =
      relationship.liking ??
      0;

    const closeness =
      relationship.closeness ??
      0;

    const irritation =
      relationship.irritation ??
      0;

    const affection =
      relationship.affection ??
      0;


    /*
     * Позитивна прихильність.
     */
    if (
      liking > 60 ||
      affection > 60
    ) {

      this.change(
        "joy",
        0.5,
        `контакт із ${personId}`
      );

      this.change(
        "affection",
        0.5,
        `контакт із ${personId}`
      );
    }


    /*
     * Близькість підсилює реакцію.
     */
    if (
      closeness > 80
    ) {

      this.change(
        "attachment",
        0.5,
        `близька людина: ${personId}`
      );
    }


    /*
     * Роздратування.
     */
    if (
      irritation > 60
    ) {

      this.change(
        "irritation",
        0.7,
        `негативний контакт із ${personId}`
      );
    }


    /*
     * Особливий випадок Яні.
     *
     * Тут немає жорсткого "якщо ім'я Яні → любов".
     * Її ефект визначається вже даними
     * стосунків.
     */
    if (
      affection > 90 &&
      closeness > 90
    ) {

      this.change(
        "tenderness",
        0.7,
        `дуже близька людина: ${personId}`
      );

      this.change(
        "pleasure",
        0.5,
        `дуже близька людина: ${personId}`
      );
    }


    /*
     * Подія контакту теж може бути різною.
     */
    if (
      event === "message"
    ) {

      this.change(
        "interest",
        0.5,
        `повідомлення від ${personId}`
      );
    }
  }


  // ============================================================
  // 12. РЕАКЦІЯ НА ПОДІЮ
  // ============================================================

  reactToEvent(event) {

    if (!event) {
      return;
    }


    /*
     * Загальні поля події можуть містити:
     *
     * event.emotionalEffects
     * event.effects
     * event.emotions
     */

    const effects =
      event.emotionalEffects ||
      event.emotions ||
      {};


    for (
      const [emotion, amount]
      of Object.entries(effects)
    ) {

      if (
        typeof amount !== "number"
      ) {
        continue;
      }


      this.change(
        emotion,
        amount,
        `подія: ${event.id || event.type || "невідома"}`
      );
    }


    /*
     * Якщо подія пов'язана з людиною,
     * окремо враховуємо стосунки.
     */
    if (
      event.person
    ) {

      this.reactToPerson(
        event.person,
        event.subtype ||
        event.type ||
        "event"
      );
    }
  }


  // ============================================================
  // 13. РЕАКЦІЯ НА СПОГАД
  // ============================================================

  reactToMemory(memory) {

    if (!memory) {
      return;
    }


    /*
     * Емоційно сильний спогад може
     * тимчасово підняти відповідну емоцію.
     */
    const intensity =
      memory.emotionalIntensity ??
      0;


    if (
      intensity <= 0
    ) {
      return;
    }


    for (
      const emotion
      of memory.emotions || []
    ) {

      /*
       * Невеликий ефект.
       *
       * Сам факт згадування не повинен
       * миттєво перетворювати стан на крайній.
       */
      this.change(
        emotion,
        intensity * 0.08,
        "пригадування"
      );
    }


    /*
     * Важливий спогад також може
     * трохи підняти цікавість.
     */
    if (
      memory.importance >= 70
    ) {

      this.change(
        "interest",
        0.3,
        "важливий спогад"
      );
    }
  }


  // ============================================================
  // 14. ЗГАСАННЯ ЕМОЦІЙ
  // ============================================================

  decay(minutes = 1) {

    const source =
      this.brain.data.emotions ||
      {};

    /*
     * У emotions.json можуть бути
     * індивідуальні швидкості згасання.
     */
    const decayRates =
      source.decayRates ||
      source.decay ||
      {};


    for (
      const emotion
      of Object.keys(
        this.emotions
      )
    ) {

      /*
       * Базова швидкість.
       */
      let rate =
        Number(
          decayRates[emotion]
        );


      if (
        Number.isNaN(rate)
      ) {
        rate = 0.03;
      }


      /*
       * Якщо емоція зараз дуже сильна,
       * її зміна може бути повільнішою.
       */
      const current =
        this.get(emotion);


      const strengthProtection =
        Math.min(
          1,
          current / 100
        );


      const actualRate =
        rate *
        (1 -
          strengthProtection * 0.25);


      /*
       * Повертаємо емоцію до базової
       * схильності поступово.
       */
      const baseline =
        this.getBaseline(emotion);


      if (
        current > baseline
      ) {

        this.emotions[emotion] =
          Math.max(
            baseline,
            current -
            actualRate *
            minutes
          );
      }

      else if (
        current < baseline
      ) {

        this.emotions[emotion] =
          Math.min(
            baseline,
            current +
            actualRate *
            minutes
          );
      }
    }


    this.syncToBrain();
  }


  // ============================================================
  // 15. БАЗОВА ЕМОЦІЯ
  // ============================================================

  getBaseline(emotion) {

    const source =
      this.brain.data.emotions ||
      {};

    const baseline =
      source.baseline ||
      source.emotions ||
      source;


    const value =
      baseline?.[emotion];


    if (
      typeof value === "number"
    ) {
      return this.clamp(value);
    }


    if (
      value &&
      typeof value === "object"
    ) {

      if (
        typeof value.baseline === "number"
      ) {
        return this.clamp(
          value.baseline
        );
      }

      if (
        typeof value.default === "number"
      ) {
        return this.clamp(
          value.default
        );
      }
    }


    return 50;
  }


  // ============================================================
  // 16. ПОТОЧНИЙ СТАН
  // ============================================================

  getState() {

    return {
      ...this.emotions
    };
  }


  // ============================================================
  // 17. НАЙСИЛЬНІШІ ЕМОЦІЇ
  // ============================================================

  getDominantEmotions(
    limit = 3
  ) {

    return Object.entries(
      this.emotions
    )
      .map(
        ([emotion, value]) => ({
          emotion,
          value
        })
      )
      .sort(
        (a, b) =>
          b.value - a.value
      )
      .slice(0, limit);
  }


  // ============================================================
  // 18. ЕМОЦІЙНІ КОНФЛІКТИ
  // ============================================================

  getConflictingEmotions() {

    /*
     * Одночасно високі суперечливі емоції
     * — нормальна частина людської поведінки.
     *
     * Наприклад:
     *
     * affection + anxiety
     * joy + sadness
     * curiosity + fear
     * anger + attachment
     */

    const conflicts = [

      ["joy", "sadness"],

      ["affection", "anxiety"],

      ["curiosity", "fear"],

      ["anger", "attachment"],

      ["pleasure", "guilt"],

      ["interest", "boredom"],

      ["trust", "distrust"],

      ["calm", "anxiety"],

      ["joy", "offense"]
    ];


    const result = [];


    for (
      const [a, b]
      of conflicts
    ) {

      const valueA =
        this.get(a);

      const valueB =
        this.get(b);


      if (
        valueA >= 55 &&
        valueB >= 55
      ) {

        result.push({

          emotions: [a, b],

          intensity:
            (valueA + valueB) / 2
        });
      }
    }


    return result;
  }


  // ============================================================
  // 19. ЕМОЦІЙНА ВИРАЗНІСТЬ
  // ============================================================

  getExpressionModifier() {

    const personality =
      this.brain.data.personality
        ?.personality
        ?.emotionalStyle ||
      {};


    const expressiveness =
      personality.emotionalExpressiveness ??
      50;


    return {
      expressiveness,

      /*
       * Висока емоційна виразність →
       * сильніше проявляє емоції в діалозі.
       */
      visibleIntensity:
        expressiveness / 100
    };
  }


  // ============================================================
  // 20. ЗАПИС ЗМІНИ
  // ============================================================

  recordChange(change) {

    this.recentChanges.push(
      change
    );


    if (
      this.recentChanges.length > 50
    ) {
      this.recentChanges.shift();
    }


    /*
     * Історія зберігає не кожну дрібну
     * зміну назавжди.
     */
    this.history.push({

      timestamp:
        change.timestamp ||
        this.getCurrentTime(),

      emotion:
        change.emotion,

      value:
        change.value,

      change:
        change.change,

      reason:
        change.reason
    });


    if (
      this.history.length >
      this.maxHistory
    ) {
      this.history.shift();
    }
  }


  // ============================================================
  // 21. ОНОВЛЕННЯ
  // ============================================================

  update(minutes = 1) {

    /*
     * Спочатку короткочасні ефекти.
     */
    this.updateEffects(
      minutes
    );


    /*
     * Потім вплив поточного стану.
     */
    this.updateFromNeeds();

    this.updateFromWeather();

    this.updateFromActivity();


    /*
     * Потім поступове згасання
     * і повернення до базових схильностей.
     */
    this.decay(minutes);


    /*
     * Зберігаємо результат.
     */
    this.syncToBrain();
  }


  // ============================================================
  // 22. СИНХРОНІЗАЦІЯ З BRAIN
  // ============================================================

  syncToBrain() {

    if (!this.brain.state) {
      return;
    }


    this.brain.state.emotions = {
      ...this.emotions
    };
  }


  // ============================================================
  // 23. ДОПОМІЖНІ ФУНКЦІЇ
  // ============================================================

  clamp(
    value,
    min = 0,
    max = 100
  ) {

    const number =
      Number(value);


    if (
      Number.isNaN(number)
    ) {
      return min;
    }


    return Math.min(
      max,
      Math.max(
        min,
        number
      )
    );
  }


  getCurrentTime() {

    if (
      this.brain?.state?.world
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

  window.AkiraMood =
    AkiraMood;
}
