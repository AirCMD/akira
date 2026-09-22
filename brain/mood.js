/*
 * ЕМОЦІЙНИЙ СТАН АКІРИ
 *
 * mood.js відповідає тільки за ПОТОЧНІ емоції.
 *
 * Розділення:
 *
 * personality.json
 *     ↓
 * риси характеру та емоційні схильності
 *
 * emotions.json
 *     ↓
 * доступні емоції, їхні властивості,
 * базові значення, конфлікти та правила
 *
 * mood.js
 *     ↓
 * поточний емоційний стан
 *
 * decision.js
 *     ↓
 * використовує емоції як один із факторів поведінки
 *
 * dialogue.js
 *     ↓
 * використовує емоції для стилю та реакції
 *
 * Важливо:
 * емоція ≠ настрій ≠ потреба ≠ дія ≠ особистість.
 *
 * Акіра може:
 * - одночасно відчувати суперечливі емоції;
 * - нічого не робити під впливом емоції;
 * - діяти всупереч поточному комфорту;
 * - поступово заспокоюватися;
 * - мати сильну емоцію, яка не обов'язково довго триває;
 * - мати слабку, але тривалу емоцію.
 */

class AkiraMood {
  constructor(brain) {
    this.brain = brain;

    /*
     * Поточні емоції.
     *
     * Формат:
     *
     * {
     *   joy: {
     *     intensity: 65,
     *     source: "event",
     *     age: 0,
     *     duration: 30
     *   }
     * }
     */
    this.emotions = {};

    /*
     * Тимчасові емоційні впливи.
     *
     * Вони не повинні накопичуватися кожного тіку.
     * Вплив створюється один раз і поступово слабшає.
     */
    this.effects = [];

    /*
     * Історія суттєвих емоційних змін.
     */
    this.history = [];

    this.maxHistory = 100;

    /*
     * Останні зміни використовуються для:
     * - уникнення зайвого повторного запису;
     * - аналізу недавніх емоцій;
     * - діалогу;
     * - поведінки.
     */
    this.recentChanges = [];

    this.maxRecentChanges = 30;

    /*
     * Окремі характеристики загального емоційного стану.
     *
     * Це НЕ "один показник настрою".
     *
     * valence:
     *   загальна емоційна спрямованість
     *
     * arousal:
     *   загальна емоційна активність
     */
    this.valence = 0;
    this.arousal = 0;

    this.initialized = false;
  }

  /*
   * ------------------------------------------------------------
   * ІНІЦІАЛІЗАЦІЯ
   * ------------------------------------------------------------
   */

  init() {
    const emotionData = this.brain?.data?.emotions || {};
    const personalityData = this.brain?.data?.personality || {};

    const baseline = this.extractBaseline(emotionData);

    /*
     * Спочатку створюємо всі емоції з emotions.json.
     */
    Object.entries(baseline).forEach(([emotion, value]) => {
      this.emotions[emotion] = {
        intensity: this.clamp(value),
        baseline: this.clamp(value),
        source: "baseline",
        age: 0,
        duration: null,
        lastChange: 0
      };
    });

    /*
     * Якщо brain уже мав збережений емоційний стан,
     * відновлюємо його.
     */
    const savedState = this.brain?.state?.emotions;

    if (savedState && typeof savedState === "object") {
      this.restoreState(savedState);
    }

    /*
     * Перераховуємо емоційний фон.
     */
    this.recalculateGlobalState();

    this.initialized = true;

    return this;
  }

  /*
   * Витягує базові значення з різних можливих структур
   * emotions.json.
   */
  extractBaseline(data) {
    let source = {};

    if (data.baseline && typeof data.baseline === "object") {
      source = data.baseline;
    } else if (data.emotions && typeof data.emotions === "object") {
      source = data.emotions;
    } else if (typeof data === "object") {
      source = data;
    }

    const result = {};

    Object.entries(source).forEach(([name, value]) => {
      if (typeof value === "number") {
        result[name] = this.clamp(value);
        return;
      }

      if (
        value &&
        typeof value === "object" &&
        typeof value.baseline === "number"
      ) {
        result[name] = this.clamp(value.baseline);
      }
    });

    return result;
  }

  /*
   * Відновлення збереженого стану.
   */
  restoreState(savedState) {
    Object.entries(savedState).forEach(([emotion, data]) => {
      if (typeof data === "number") {
        this.ensureEmotion(emotion, data);

        this.emotions[emotion].intensity = this.clamp(data);
        return;
      }

      if (!data || typeof data !== "object") {
        return;
      }

      this.ensureEmotion(
        emotion,
        typeof data.baseline === "number" ? data.baseline : 0
      );

      if (typeof data.intensity === "number") {
        this.emotions[emotion].intensity =
          this.clamp(data.intensity);
      }

      if (typeof data.baseline === "number") {
        this.emotions[emotion].baseline =
          this.clamp(data.baseline);
      }

      if (typeof data.source === "string") {
        this.emotions[emotion].source = data.source;
      }

      if (typeof data.age === "number") {
        this.emotions[emotion].age = data.age;
      }

      if (typeof data.duration === "number") {
        this.emotions[emotion].duration = data.duration;
      }
    });

    this.effects = Array.isArray(this.brain?.state?.emotionEffects)
      ? [...this.brain.state.emotionEffects]
      : [];
  }

  /*
   * ------------------------------------------------------------
   * ЕМОЦІЇ
   * ------------------------------------------------------------
   */

  ensureEmotion(name, baseline = 0) {
    if (!name) {
      return null;
    }

    if (!this.emotions[name]) {
      this.emotions[name] = {
        intensity: this.clamp(baseline),
        baseline: this.clamp(baseline),
        source: "dynamic",
        age: 0,
        duration: null,
        lastChange: 0
      };
    }

    return this.emotions[name];
  }

  get(name) {
    if (!name) {
      return 0;
    }

    return this.emotions[name]?.intensity ?? 0;
  }

  getBaseline(name) {
    if (!name) {
      return 0;
    }

    return this.emotions[name]?.baseline ?? 0;
  }

  getState() {
    const result = {};

    Object.entries(this.emotions).forEach(([name, data]) => {
      result[name] = this.clamp(data.intensity);
    });

    return result;
  }

  getDetailedState() {
    const result = {};

    Object.entries(this.emotions).forEach(([name, data]) => {
      result[name] = {
        intensity: this.clamp(data.intensity),
        baseline: this.clamp(data.baseline),
        source: data.source,
        age: data.age,
        duration: data.duration,
        lastChange: data.lastChange
      };
    });

    return result;
  }

  /*
   * Встановити емоцію напряму.
   *
   * Це використовується для відновлення стану або
   * системних змін, а не для кожного звичайного тіку.
   */
  set(name, intensity, options = {}) {
    const emotion = this.ensureEmotion(
      name,
      options.baseline ?? 0
    );

    if (!emotion) {
      return;
    }

    const previous = emotion.intensity;

    emotion.intensity = this.clamp(intensity);

    if (options.source) {
      emotion.source = options.source;
    }

    if (typeof options.duration === "number") {
      emotion.duration = Math.max(0, options.duration);
    }

    emotion.age = 0;
    emotion.lastChange = emotion.intensity - previous;

    if (
      Math.abs(emotion.intensity - previous) >=
      (options.recordThreshold ?? 2)
    ) {
      this.recordChange(
        name,
        previous,
        emotion.intensity,
        options.source || "direct",
        options.reason || null
      );
    }

    this.recalculateGlobalState();
    this.syncToBrain();
  }

  /*
   * Змінити емоцію на певну величину.
   *
   * Важливо:
   * change() не створює автоматично постійний ефект.
   *
   * Якщо потрібна тимчасова емоція —
   * використовується addEffect().
   */
  change(name, delta, options = {}) {
    if (!Number.isFinite(delta) || delta === 0) {
      return this.get(name);
    }

    const emotion = this.ensureEmotion(
      name,
      options.baseline ?? 0
    );

    const previous = emotion.intensity;

    emotion.intensity = this.clamp(
      emotion.intensity + delta
    );

    emotion.source = options.source || emotion.source || "change";
    emotion.age = 0;
    emotion.lastChange = emotion.intensity - previous;

    if (
      Math.abs(emotion.intensity - previous) >=
      (options.recordThreshold ?? 2)
    ) {
      this.recordChange(
        name,
        previous,
        emotion.intensity,
        options.source || "change",
        options.reason || null
      );
    }

    this.recalculateGlobalState();
    this.syncToBrain();

    return emotion.intensity;
  }

  /*
   * ------------------------------------------------------------
   * ТИМЧАСОВІ ЕМОЦІЙНІ ЕФЕКТИ
   * ------------------------------------------------------------
   *
   * Приклад:
   *
   * addEffect({
   *   emotion: "joy",
   *   amount: 25,
   *   duration: 60,
   *   decay: "linear",
   *   source: "event"
   * });
   *
   * Це НЕ означає:
   *
   * +25 кожну хвилину.
   *
   * Це означає:
   * "емоція отримала тимчасовий вплив +25,
   * який поступово зникає".
   */

  addEffect(effect = {}) {
    if (!effect.emotion) {
      return null;
    }

    const duration = Math.max(
      1,
      Number(effect.duration) || 1
    );

    const amount = Number(effect.amount) || 0;

    if (amount === 0) {
      return null;
    }

    const item = {
      id: effect.id || this.generateId("emotion"),
      emotion: effect.emotion,
      amount,
      initialAmount: amount,
      duration,
      remaining: duration,
      elapsed: 0,
      decay: effect.decay || "linear",
      source: effect.source || "temporaryEffect",
      reason: effect.reason || null,
      metadata: effect.metadata || {}
    };

    this.effects.push(item);

    /*
     * Ефект застосовується одразу один раз.
     */
    this.change(
      item.emotion,
      item.amount,
      {
        source: item.source,
        reason: item.reason
      }
    );

    this.syncToBrain();

    return item;
  }

  updateEffects(minutes = 1) {
    if (!this.effects.length) {
      return;
    }

    const remainingEffects = [];

    this.effects.forEach(effect => {
      const previousRemaining = effect.remaining;

      effect.elapsed += minutes;
      effect.remaining -= minutes;

      /*
       * Вже застосована частина ефекту.
       *
       * Тепер повертаємо відповідну частину назад,
       * якщо ефект вичерпується.
       */
      const previousProgress =
        this.getEffectProgress(
          previousRemaining,
          effect.duration
        );

      const currentProgress =
        this.getEffectProgress(
          effect.remaining,
          effect.duration
        );

      const previousFactor =
        this.getDecayFactor(previousProgress, effect.decay);

      const currentFactor =
        this.getDecayFactor(currentProgress, effect.decay);

      const previousValue =
        effect.initialAmount * previousFactor;

      const currentValue =
        effect.initialAmount * currentFactor;

      const difference =
        currentValue - previousValue;

      if (Math.abs(difference) > 0.001) {
        this.change(
          effect.emotion,
          difference,
          {
            source: effect.source,
            reason: effect.reason,
            recordThreshold: 3
          }
        );
      }

      if (effect.remaining > 0) {
        remainingEffects.push(effect);
      }
    });

    this.effects = remainingEffects;

    this.syncToBrain();
  }

  getEffectProgress(remaining, duration) {
    if (duration <= 0) {
      return 0;
    }

    return this.clamp(
      remaining / duration,
      0,
      1
    );
  }

  getDecayFactor(progress, decayType) {
    const p = this.clamp(progress, 0, 1);

    switch (decayType) {
      case "fast":
        return p * p;

      case "slow":
        return Math.sqrt(p);

      case "exponential":
        return Math.pow(p, 2.5);

      case "linear":
      default:
        return p;
    }
  }

  /*
   * ------------------------------------------------------------
   * ПОТУЖНІСТЬ ЕМОЦІЙ
   * ------------------------------------------------------------
   */

  getDominantEmotions(limit = 3) {
    return Object.entries(this.emotions)
      .map(([name, data]) => ({
        name,
        intensity: this.clamp(data.intensity),
        baseline: this.clamp(data.baseline),
        source: data.source,
        /*
         * Не просто сортуємо за абсолютним значенням.
         *
         * Відхилення від базового стану теж важливе.
         */
        deviation: Math.abs(
          data.intensity - data.baseline
        )
      }))
      .filter(item => item.intensity > 0)
      .sort((a, b) => {
        const scoreA =
          a.intensity * 0.7 +
          a.deviation * 0.3;

        const scoreB =
          b.intensity * 0.7 +
          b.deviation * 0.3;

        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  getConflictingEmotions() {
    const conflicts =
      this.brain?.data?.emotions?.conflicts ||
      this.brain?.data?.emotions?.emotionalConflicts ||
      {};

    const result = [];

    Object.entries(conflicts).forEach(([emotion, oppositeList]) => {
      if (!Array.isArray(oppositeList)) {
        return;
      }

      const firstValue = this.get(emotion);

      if (firstValue < 25) {
        return;
      }

      oppositeList.forEach(opposite => {
        const secondValue = this.get(opposite);

        if (secondValue < 25) {
          return;
        }

        result.push({
          first: emotion,
          second: opposite,
          firstIntensity: firstValue,
          secondIntensity: secondValue
        });
      });
    });

    return result;
  }

  /*
   * ------------------------------------------------------------
   * ВАЛЕНТНІСТЬ ТА ЗБУДЖЕННЯ
   * ------------------------------------------------------------
   *
   * Не є "оцінкою настрою".
   *
   * Це допоміжні характеристики для decision.js.
   */

  recalculateGlobalState() {
    const definitions =
      this.brain?.data?.emotions?.definitions ||
      this.brain?.data?.emotions?.emotions ||
      {};

    let totalWeight = 0;
    let valence = 0;
    let arousal = 0;

    Object.entries(this.emotions).forEach(([name, state]) => {
      const definition = definitions[name] || {};

      const intensity = this.clamp(state.intensity);

      if (intensity <= 0) {
        return;
      }

      const weight = intensity / 100;

      const emotionValence =
        typeof definition.valence === "number"
          ? definition.valence
          : this.inferValence(name);

      const emotionArousal =
        typeof definition.arousal === "number"
          ? definition.arousal
          : this.inferArousal(name);

      valence += emotionValence * weight;
      arousal += emotionArousal * weight;

      totalWeight += weight;
    });

    if (totalWeight > 0) {
      valence /= totalWeight;
      arousal /= totalWeight;
    }

    this.valence = this.clamp(
      ((valence + 1) / 2) * 100
    );

    this.arousal = this.clamp(
      ((arousal + 1) / 2) * 100
    );
  }

  inferValence(name) {
    const positive = [
      "joy",
      "pleasure",
      "interest",
      "curiosity",
      "admiration",
      "trust",
      "sympathy",
      "affection",
      "attachment",
      "tenderness",
      "gratitude",
      "relief",
      "pride"
    ];

    const negative = [
      "sadness",
      "anger",
      "fear",
      "disgust",
      "disappointment",
      "offense",
      "guilt",
      "shame",
      "envy",
      "jealousy",
      "anxiety",
      "loneliness",
      "boredom",
      "distrust",
      "irritation"
    ];

    if (positive.includes(name)) {
      return 1;
    }

    if (negative.includes(name)) {
      return -1;
    }

    return 0;
  }

  inferArousal(name) {
    const high = [
      "anger",
      "fear",
      "surprise",
      "enthusiasm",
      "anxiety",
      "jealousy",
      "curiosity"
    ];

    const low = [
      "calm",
      "relief",
      "sadness",
      "boredom",
      "loneliness"
    ];

    if (high.includes(name)) {
      return 1;
    }

    if (low.includes(name)) {
      return -1;
    }

    return 0;
  }

  getGlobalState() {
    return {
      valence: this.valence,
      arousal: this.arousal
    };
  }

  /*
   * ------------------------------------------------------------
   * ЕМОЦІЙНА РЕАКЦІЯ НА ЗОВНІШНІ ФАКТОРИ
   * ------------------------------------------------------------
   *
   * Тут немає конкретних правил типу:
   *
   * "якщо Яні — +30".
   *
   * Такі правила повинні приходити з даних
   * або від decision/event системи.
   */

  reactToPerson(personId, reaction = {}) {
    if (!reaction || typeof reaction !== "object") {
      return;
    }

    /*
     * reaction може містити:
     *
     * {
     *   emotion: "affection",
     *   amount: 20,
     *   duration: 60,
     *   source: "person"
     * }
     */

    if (reaction.emotion) {
      if (reaction.duration) {
        this.addEffect({
          emotion: reaction.emotion,
          amount: reaction.amount || 0,
          duration: reaction.duration,
          decay: reaction.decay,
          source: reaction.source || "person",
          reason: reaction.reason || personId
        });
      } else {
        this.change(
          reaction.emotion,
          reaction.amount || 0,
          {
            source: reaction.source || "person",
            reason: reaction.reason || personId
          }
        );
      }
    }
  }

  reactToEvent(event = {}) {
    if (!event || typeof event !== "object") {
      return;
    }

    const effects = Array.isArray(event.emotionalEffects)
      ? event.emotionalEffects
      : [];

    effects.forEach(effect => {
      if (effect.duration) {
        this.addEffect({
          ...effect,
          source: effect.source || "event"
        });
      } else {
        this.change(
          effect.emotion,
          effect.amount || 0,
          {
            source: effect.source || "event",
            reason: effect.reason || event.id || event.type
          }
        );
      }
    });
  }

  reactToMemory(memory = {}) {
    if (!memory || typeof memory !== "object") {
      return;
    }

    const emotions = memory.emotions;

    if (!emotions || typeof emotions !== "object") {
      return;
    }

    /*
     * Спогад не відтворюється буквально.
     *
     * Його емоційний вплив залежить від:
     * - сили спогаду;
     * - емоційної інтенсивності;
     * - актуального стану.
     */

    const strength =
      typeof memory.strength === "number"
        ? this.clamp(memory.strength) / 100
        : 1;

    const emotionalIntensity =
      typeof memory.emotionalIntensity === "number"
        ? this.clamp(memory.emotionalIntensity) / 100
        : 1;

    const factor =
      strength * emotionalIntensity;

    Object.entries(emotions).forEach(([emotion, value]) => {
      if (typeof value !== "number") {
        return;
      }

      const amount =
        value * factor * 0.15;

      if (Math.abs(amount) < 0.5) {
        return;
      }

      this.addEffect({
        emotion,
        amount,
        duration: 30 + Math.round(
          factor * 60
        ),
        decay: "slow",
        source: "memory",
        reason: memory.id || "memoryRecall"
      });
    });
  }

  /*
   * ------------------------------------------------------------
   * ОНОВЛЕННЯ
   * ------------------------------------------------------------
   */

  update(minutes = 1) {
    if (!this.initialized) {
      this.init();
    }

    const elapsed =
      Math.max(0, Number(minutes) || 0);

    if (elapsed <= 0) {
      return;
    }

    /*
     * 1. Тимчасові ефекти.
     */
    this.updateEffects(elapsed);

    /*
     * 2. Поступове повернення до базового емоційного стану.
     */
    this.decay(elapsed);

    /*
     * 3. Вік поточних станів.
     */
    Object.values(this.emotions).forEach(emotion => {
      emotion.age += elapsed;
    });

    /*
     * 4. Очищення старих записів.
     */
    this.cleanupRecentChanges();

    /*
     * 5. Перерахунок глобальних параметрів.
     */
    this.recalculateGlobalState();

    /*
     * 6. Передача стану brain.
     */
    this.syncToBrain();
  }

  /*
   * Повернення емоцій до їхніх базових значень.
   *
   * Важливо:
   * це не "обнулення".
   *
   * Сильна емоція може зберігатися довго,
   * слабка — згасати швидше.
   */

  decay(minutes = 1) {
    const emotionData =
      this.brain?.data?.emotions || {};

    const decayRates =
      emotionData.decayRates ||
      emotionData.decay ||
      {};

    Object.entries(this.emotions).forEach(([name, state]) => {
      const baseline = state.baseline;
      const current = state.intensity;

      const difference = baseline - current;

      if (Math.abs(difference) < 0.05) {
        state.intensity = baseline;
        return;
      }

      let rate = decayRates[name];

      if (typeof rate !== "number") {
        rate =
          typeof emotionData.defaultDecayRate === "number"
            ? emotionData.defaultDecayRate
            : 0.02;
      }

      /*
       * rate — частка відстані до baseline за одну
       * симульовану одиницю часу.
       */
      const factor = Math.min(
        1,
        Math.max(0, rate * minutes)
      );

      state.intensity =
        current + difference * factor;

      state.intensity =
        this.clamp(state.intensity);
    });
  }

  /*
   * ------------------------------------------------------------
   * ВПЛИВ ОСОБИСТОСТІ
   * ------------------------------------------------------------
   *
   * Особистість не змінюється разом із настроєм.
   *
   * Вона може лише змінювати:
   * - силу реакції;
   * - швидкість заспокоєння;
   * - виразність емоцій.
   */

  getPersonalityModifier(emotion) {
    const traits =
      this.brain?.data?.personality?.personality?.traits ||
      this.brain?.data?.personality?.traits ||
      {};

    const mapping = {
      curiosity: "curiosity",
      interest: "curiosity",
      admiration: "sensitivity",
      joy: "enthusiasm",
      enthusiasm: "enthusiasm",
      sympathy: "empathy",
      tenderness: "empathy",
      affection: "attachment",
      attachment: "attachment",
      anger: "impulsiveness",
      fear: "sensitivity",
      anxiety: "sensitivity",
      guilt: "responsibility",
      pride: "confidence",
      confidence: "confidence"
    };

    const traitName = mapping[emotion];

    if (!traitName) {
      return 1;
    }

    const value = traits[traitName];

    if (typeof value !== "number") {
      return 1;
    }

    /*
     * 50 = нейтральний вплив.
     */
    return 0.75 + (this.clamp(value) / 100) * 0.5;
  }

  getExpressionModifier() {
    const communication =
      this.brain?.data?.personality?.personality?.communication ||
      this.brain?.data?.personality?.communication ||
      {};

    const expressiveness =
      typeof communication.emotionalExpressiveness === "number"
        ? communication.emotionalExpressiveness
        : this.brain?.data?.personality?.personality
            ?.emotionalStyle?.emotionalExpressiveness;

    if (typeof expressiveness !== "number") {
      return 1;
    }

    return 0.5 + this.clamp(expressiveness) / 100;
  }

  /*
   * ------------------------------------------------------------
   * ПОВЕДІНКОВІ МОДИФІКАТОРИ
   * ------------------------------------------------------------
   *
   * decision.js зможе запитати:
   *
   * brain.mood.getBehaviorModifiers()
   *
   * і вже сам вирішити, яку дію обрати.
   *
   * mood.js не приймає рішення за персонажа.
   */

  getBehaviorModifiers() {
    const joy = this.get("joy");
    const sadness = this.get("sadness");
    const anger = this.get("anger");
    const fear = this.get("fear");
    const interest = this.get("interest");
    const curiosity = this.get("curiosity");
    const anxiety = this.get("anxiety");
    const boredom = this.get("boredom");
    const calm = this.get("calm");
    const affection = this.get("affection");
    const attachment = this.get("attachment");

    return {
      socialInitiative: this.clamp(
        50 +
        joy * 0.15 +
        interest * 0.15 +
        affection * 0.12 +
        attachment * 0.08 -
        sadness * 0.12 -
        anxiety * 0.15
      ),

      exploration: this.clamp(
        50 +
        curiosity * 0.25 +
        interest * 0.15 +
        joy * 0.08 -
        fear * 0.18 -
        anxiety * 0.15
      ),

      activityDrive: this.clamp(
        50 +
        joy * 0.12 +
        interest * 0.15 +
        curiosity * 0.10 +
        calm * 0.05 -
        sadness * 0.12 -
        boredom * 0.08
      ),

      conflictSensitivity: this.clamp(
        50 +
        anger * 0.20 +
        fear * 0.15 +
        anxiety * 0.20 -
        calm * 0.15
      ),

      communicationWarmth: this.clamp(
        50 +
        joy * 0.15 +
        affection * 0.25 +
        attachment * 0.18 +
        sympathySafe(this.get("sympathy")) -
        anger * 0.15 -
        sadness * 0.10
      ),

      withdrawal: this.clamp(
        50 +
        sadness * 0.18 +
        anxiety * 0.20 +
        fear * 0.12 +
        boredom * 0.05 -
        joy * 0.12 -
        interest * 0.10
      ),

      focus: this.clamp(
        50 +
        calm * 0.18 +
        interest * 0.15 -
        anxiety * 0.20 -
        anger * 0.10
      )
    };
  }

  /*
   * ------------------------------------------------------------
   * ІСТОРІЯ
   * ------------------------------------------------------------
   */

  recordChange(
    emotion,
    previous,
    current,
    source = "unknown",
    reason = null
  ) {
    const change = {
      emotion,
      previous: this.clamp(previous),
      current: this.clamp(current),
      delta: current - previous,
      source,
      reason,
      timestamp: this.getCurrentTime()
    };

    this.history.push(change);

    if (this.history.length > this.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.maxHistory
      );
    }

    this.recentChanges.push(change);

    if (
      this.recentChanges.length >
      this.maxRecentChanges
    ) {
      this.recentChanges.splice(
        0,
        this.recentChanges.length -
        this.maxRecentChanges
      );
    }
  }

  cleanupRecentChanges() {
    const now = Date.now();

    this.recentChanges =
      this.recentChanges.filter(change => {
        if (!change.timestamp) {
          return false;
        }

        const time =
          new Date(change.timestamp).getTime();

        return (
          now - time <
          1000 * 60 * 180
        );
      });
  }

  getRecentChanges(limit = 10) {
    return this.recentChanges
      .slice(-limit)
      .reverse();
  }

  getHistory(limit = 20) {
    return this.history
      .slice(-limit)
      .reverse();
  }

  /*
   * ------------------------------------------------------------
   * СИНХРОНІЗАЦІЯ З BRAIN
   * ------------------------------------------------------------
   */

  syncToBrain() {
    if (!this.brain || !this.brain.state) {
      return;
    }

    /*
     * Для сумісності з іншими модулями
     * brain.state.emotions залишається простим об'єктом.
     */
    this.brain.state.emotions = this.getState();

    /*
     * Детальні дані зберігаються окремо.
     */
    this.brain.state.emotionDetails =
      this.getDetailedState();

    this.brain.state.emotionEffects =
      this.effects.map(effect => ({
        ...effect
      }));

    this.brain.state.emotionalGlobal = {
      valence: this.valence,
      arousal: this.arousal
    };
  }

  /*
   * ------------------------------------------------------------
   * ДОПОМІЖНІ ФУНКЦІЇ
   * ------------------------------------------------------------
   */

  getCurrentTime() {
    /*
     * Спочатку намагаємося взяти час симуляції.
     */
    const world =
      this.brain?.state?.world ||
      this.brain?.data?.world;

    if (world?.date && world?.time) {
      return `${world.date}T${world.time}`;
    }

    return new Date().toISOString();
  }

  generateId(prefix = "id") {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 8)
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
 * Допоміжна функція для безпечного використання
 * sympathy у формулах.
 */
function sympathySafe(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    -15,
    Math.min(15, number * 0.15)
  );
}


/*
 * Експорт.
 */

if (typeof window !== "undefined") {
  window.AkiraMood = AkiraMood;
}
