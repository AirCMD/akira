/*
 * ПАМ'ЯТЬ АКІРИ
 *
 * Відповідає за:
 * - зберігання поточних спогадів;
 * - створення нових спогадів;
 * - пошук пов'язаних спогадів;
 * - пригадування;
 * - підсилення;
 * - згасання;
 * - емоційне забарвлення;
 * - зв'язки між спогадами;
 * - недавні спогади.
 *
 * ПАМ'ЯТЬ ≠ просто список текстів.
 *
 * Один спогад може мати:
 * - важливість;
 * - емоційну силу;
 * - давність;
 * - частоту пригадування;
 * - людей;
 * - теми;
 * - місце;
 * - подію;
 * - пов'язані спогади.
 */

class AkiraMemory {

  constructor(brain) {

    this.brain = brain;

    this.memories = [];
    this.recentlyRecalled = [];

    this.maxMemories = 1000;

    /*
     * Технічний час останнього оновлення.
     */
    this.lastUpdate = null;
  }


  // ============================================================
  // 1. ІНІЦІАЛІЗАЦІЯ
  // ============================================================

  init() {

    const source =
      this.brain.data.memories;

    /*
     * Підтримуємо кілька можливих структур JSON.
     */

    let seedMemories = [];

    if (Array.isArray(source)) {
      seedMemories = source;
    }

    else if (Array.isArray(source?.memories)) {
      seedMemories = source.memories;
    }

    else if (Array.isArray(source?.memory)) {
      seedMemories = source.memory;
    }

    /*
     * Робимо копії.
     *
     * JSON залишається незмінним.
     */
    this.memories =
      seedMemories.map(
        memory => this.normalizeMemory(memory)
      );

    this.lastUpdate =
      this.getCurrentTime();

    return this;
  }


  // ============================================================
  // 2. НОРМАЛІЗАЦІЯ
  // ============================================================

  normalizeMemory(memory) {

    const now =
      this.getCurrentTime();

    return {

      /*
       * Унікальний ідентифікатор.
       */
      id:
        memory.id ||
        this.generateId("memory"),


      /*
       * Тип спогаду.
       */
      type:
        memory.type ||
        "experience",


      /*
       * Сам зміст.
       *
       * Це може бути не тільки текст.
       */
      content:
        memory.content ||
        memory.description ||
        "",


      /*
       * Коротка назва для пошуку.
       */
      title:
        memory.title ||
        "",


      /*
       * Час виникнення спогаду.
       */
      createdAt:
        memory.createdAt ||
        now,


      /*
       * Час останнього пригадування.
       */
      lastRecalled:
        memory.lastRecalled ||
        null,


      /*
       * Скільки разів спогад пригадувався.
       */
      recallCount:
        Number(memory.recallCount) || 0,


      /*
       * Базова важливість.
       */
      importance:
        this.clamp(
          memory.importance ??
          memory.strength ??
          50
        ),


      /*
       * Поточна сила спогаду.
       *
       * Вона може змінюватися з часом.
       */
      strength:
        this.clamp(
          memory.strength ??
          memory.importance ??
          50
        ),


      /*
       * Емоційна сила.
       */
      emotionalIntensity:
        this.clamp(
          memory.emotionalIntensity ??
          memory.emotionStrength ??
          0
        ),


      /*
       * Типи емоцій.
       *
       * Наприклад:
       * ["love", "joy", "admiration"]
       */
      emotions:
        Array.isArray(memory.emotions)
          ? [...memory.emotions]
          : [],


      /*
       * Пов'язані люди.
       */
      people:
        Array.isArray(memory.people)
          ? [...memory.people]
          : [],


      /*
       * Пов'язані теми.
       */
      topics:
        Array.isArray(memory.topics)
          ? [...memory.topics]
          : [],


      /*
       * Місце.
       */
      location:
        memory.location ||
        null,


      /*
       * Пов'язана подія.
       */
      event:
        memory.event ||
        null,


      /*
       * Пов'язані цілі.
       */
      goals:
        Array.isArray(memory.goals)
          ? [...memory.goals]
          : [],


      /*
       * Пов'язані спогади.
       */
      relatedMemories:
        Array.isArray(memory.relatedMemories)
          ? [...memory.relatedMemories]
          : [],


      /*
       * Ключові слова.
       */
      keywords:
        Array.isArray(memory.keywords)
          ? [...memory.keywords]
          : [],


      /*
       * Чи є спогад особливо важливим.
       */
      permanent:
        memory.permanent === true,


      /*
       * Чи можна його забути.
       */
      forgettable:
        memory.forgettable !== false,


      /* Епізодичний контекст: коли/де це сталося і наскільки живий спогад. */
      worldDate: memory.worldDate || this.brain?.state?.world?.date || null,
      worldTime: memory.worldTime || this.brain?.state?.world?.time || null,
      homeRoom: memory.homeRoom || this.brain?.state?.dailyLife?.homeRoom || null,
      source: memory.source || "experience",
      vividness: this.clamp(memory.vividness ?? Math.max(memory.importance ?? 50, memory.emotionalIntensity ?? 0)),
      valence: Number.isFinite(Number(memory.valence)) ? Math.max(-100, Math.min(100, Number(memory.valence))) : 0,
      actionId: memory.actionId || null,
      targetPerson: memory.targetPerson || null,

      /*
       * Метадані для рушія.
       */
      metadata:
        memory.metadata &&
        typeof memory.metadata === "object"
          ? { ...memory.metadata }
          : {}
    };
  }


  // ============================================================
  // 3. СТВОРЕННЯ НОВОГО СПОГАДУ
  // ============================================================

  remember(data = {}) {

    const memory =
      this.normalizeMemory({
        ...data,
        createdAt:
          data.createdAt ||
          this.getCurrentTime()
      });

    /*
     * Якщо такий спогад уже існує,
     * не створюємо бездумну копію.
     *
     * Спочатку пробуємо знайти дуже схожий.
     */
    const existing =
      this.findSimilarMemory(memory);

    if (existing) {

      this.reinforce(
        existing.id,
        data.emotionalIntensity || 5
      );

      return existing;
    }


    /*
     * Додаємо новий спогад.
     */
    this.memories.push(memory);


    /*
     * Обмеження розміру.
     */
    this.trimMemory();


    /*
     * Повідомляємо мозок про створення.
     */
    this.recordMemoryEvent(
      "created",
      memory
    );

    return memory;
  }


  // ============================================================
  // 4. ПОШУК СХОЖОГО СПОГАДУ
  // ============================================================

  findSimilarMemory(memory) {

    // Епізоди не зливаємо лише через однакову тему. Інакше десять вечерь
    // перетворюються на один безсмертний «їв». Дубль можливий лише для
    // буквально того самого запису в ту саму хвилину.
    if (["episode", "activity", "conversation", "event", "dream"].includes(memory.type)) {
      return this.memories.find(candidate =>
        candidate.type === memory.type &&
        candidate.content === memory.content &&
        candidate.worldDate === memory.worldDate &&
        candidate.worldTime === memory.worldTime
      ) || null;
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const candidate of this.memories) {

      let score = 0;

      /*
       * Однаковий тип.
       */
      if (
        candidate.type &&
        candidate.type === memory.type
      ) {
        score += 10;
      }


      /*
       * Спільні люди.
       */
      score +=
        this.overlapScore(
          candidate.people,
          memory.people
        ) * 25;


      /*
       * Спільні теми.
       */
      score +=
        this.overlapScore(
          candidate.topics,
          memory.topics
        ) * 20;


      /*
       * Спільні ключові слова.
       */
      score +=
        this.overlapScore(
          candidate.keywords,
          memory.keywords
        ) * 15;


      /*
       * Однакове місце.
       */
      if (
        candidate.location &&
        candidate.location === memory.location
      ) {
        score += 10;
      }


      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    /*
     * Порогове значення.
     *
     * Ми не хочемо зливати два просто схожі
     * спогади в один.
     */
    return bestScore >= 45
      ? bestMatch
      : null;
  }


  // ============================================================
  // 5. ПОШУК СПОГАДІВ
  // ============================================================

  search(criteria = {}) {

    const results = [];

    for (const memory of this.memories) {

      let score = 0;


      // --------------------------------------------------------
      // Людина
      // --------------------------------------------------------

      if (criteria.person) {

        if (
          memory.people.includes(
            criteria.person
          )
        ) {
          score += 35;
        }
      }


      // --------------------------------------------------------
      // Тема
      // --------------------------------------------------------

      if (criteria.topic) {

        if (
          memory.topics.includes(
            criteria.topic
          )
        ) {
          score += 30;
        }
      }


      // --------------------------------------------------------
      // Ключове слово
      // --------------------------------------------------------

      if (criteria.keyword) {

        const keyword =
          String(criteria.keyword)
            .toLowerCase();

        const found =
          memory.keywords.some(
            item =>
              String(item)
                .toLowerCase()
                .includes(keyword)
          );

        if (found) {
          score += 20;
        }


        if (
          String(memory.content)
            .toLowerCase()
            .includes(keyword)
        ) {
          score += 15;
        }
      }


      // --------------------------------------------------------
      // Місце
      // --------------------------------------------------------

      if (
        criteria.location &&
        memory.location === criteria.location
      ) {
        score += 15;
      }


      // --------------------------------------------------------
      // Емоція
      // --------------------------------------------------------

      if (criteria.emotion) {

        if (
          memory.emotions.includes(
            criteria.emotion
          )
        ) {
          score += 20;
        }
      }


      // --------------------------------------------------------
      // Мінімальна сила
      // --------------------------------------------------------

      if (
        criteria.minStrength !== undefined &&
        memory.strength <
          criteria.minStrength
      ) {
        continue;
      }


      // --------------------------------------------------------
      // Мінімальна важливість
      // --------------------------------------------------------

      if (
        criteria.minImportance !== undefined &&
        memory.importance <
          criteria.minImportance
      ) {
        continue;
      }


      /*
       * Якщо критеріїв немає,
       * спогад усе одно може бути результатом.
       */
      if (
        score > 0 ||
        Object.keys(criteria).length === 0
      ) {

        /*
         * Невеликий бонус за силу.
         */
        score +=
          memory.strength * 0.15;

        /*
         * Емоційні спогади трохи легше
         * знаходяться.
         */
        score +=
          memory.emotionalIntensity * 0.1;

        results.push({
          memory,
          score
        });
      }
    }


    /*
     * Сильніші спочатку.
     */
    results.sort(
      (a, b) =>
        b.score - a.score
    );

    return results;
  }


  // ============================================================
  // 6. ПРИГАДУВАННЯ
  // ============================================================

  recall(criteria = {}) {

    const candidates =
      this.search(criteria);

    if (!candidates.length) {
      return null;
    }


    /*
     * Не завжди беремо перший.
     *
     * Якщо є кілька достатньо сильних,
     * вибір може бути трохи випадковим.
     */
    const selected =
      this.weightedRandomMemory(
        candidates
      );


    if (!selected) {
      return null;
    }


    /*
     * Підсилюємо спогад самим фактом пригадування.
     */
    selected.lastRecalled =
      this.getCurrentTime();

    selected.recallCount++;

    selected.strength =
      this.clamp(
        selected.strength + 3
      );


    /*
     * Додаємо до списку недавнього пригадування.
     */
    this.recentlyRecalled.push(
      selected.id
    );

    if (
      this.recentlyRecalled.length > 20
    ) {
      this.recentlyRecalled.shift();
    }


    this.recordMemoryEvent(
      "recalled",
      selected
    );


    return selected;
  }


  // ============================================================
  // 7. ЗВАЖЕНИЙ ВИБІР СПОГАДУ
  // ============================================================

  weightedRandomMemory(candidates) {

    if (!candidates.length) {
      return null;
    }


    /*
     * Недавно пригадані спогади отримують штраф.
     * Це не заборона — інколи той самий спогад
     * справді може згадуватися кілька разів.
     */

    const weighted =
      candidates.map(item => {

        let weight =
          Math.max(
            1,
            item.score
          );

        if (
          this.recentlyRecalled
            .includes(item.memory.id)
        ) {
          weight *= 0.35;
        }

        return {
          memory: item.memory,
          weight
        };
      });


    const total =
      weighted.reduce(
        (sum, item) =>
          sum + item.weight,
        0
      );


    let random =
      Math.random() * total;


    for (const item of weighted) {

      random -= item.weight;

      if (random <= 0) {
        return item.memory;
      }
    }


    return weighted[
      weighted.length - 1
    ].memory;
  }


  // ============================================================
  // 8. ПІДСИЛЕННЯ
  // ============================================================

  reinforce(
    memoryId,
    emotionalBonus = 0,
    amount = 5
  ) {

    const memory =
      this.get(memoryId);

    if (!memory) {
      return null;
    }


    memory.strength =
      this.clamp(
        memory.strength +
        amount
      );


    memory.emotionalIntensity =
      this.clamp(
        memory.emotionalIntensity +
        emotionalBonus
      );


    memory.recallCount++;


    /*
     * Важливий спогад може стати фактично
     * довготривалим навіть без постійного повторення.
     */
    if (
      memory.emotionalIntensity >= 90 &&
      memory.importance >= 90
    ) {
      memory.permanent = true;
    }


    return memory;
  }


  // ============================================================
  // 9. ЕМОЦІЙНЕ ПІДСИЛЕННЯ
  // ============================================================

  reinforceByEmotion(
    memoryId,
    emotion,
    intensity = 50
  ) {

    const memory =
      this.get(memoryId);

    if (!memory) {
      return null;
    }


    /*
     * Якщо цієї емоції ще не було,
     * додаємо її як асоціацію.
     */
    if (
      emotion &&
      !memory.emotions.includes(emotion)
    ) {
      memory.emotions.push(emotion);
    }


    memory.emotionalIntensity =
      this.clamp(
        memory.emotionalIntensity +
        intensity * 0.2
      );


    memory.strength =
      this.clamp(
        memory.strength +
        intensity * 0.1
      );


    return memory;
  }


  // ============================================================
  // 10. ЗГАСАННЯ
  // ============================================================

  decay(hours = 1) {

    for (const memory of this.memories) {

      /*
       * Постійні спогади не забуваються звичайним
       * механізмом згасання.
       */
      if (memory.permanent) {
        continue;
      }


      if (!memory.forgettable) {
        continue;
      }


      /*
       * Важливі та емоційні спогади згасають повільніше.
       */
      const protection =
        (
          memory.importance +
          memory.emotionalIntensity
        ) / 200;


      const baseDecay =
        0.15 * hours;


      const actualDecay =
        baseDecay *
        (1 - protection * 0.8);


      memory.strength =
        Math.max(
          0,
          memory.strength -
          actualDecay
        );
    }


    /*
     * Дуже слабкі спогади можна видаляти.
     */
    this.removeForgottenMemories();
  }


  // ============================================================
  // 11. ВИДАЛЕННЯ ЗАБУТИХ СПОГАДІВ
  // ============================================================

  removeForgottenMemories() {

    this.memories =
      this.memories.filter(
        memory => {

          if (memory.permanent) {
            return true;
          }

          if (!memory.forgettable) {
            return true;
          }


          /*
           * Важливий спогад не видаляємо занадто рано.
           */
          if (
            memory.importance >= 80
          ) {
            return memory.strength > 5;
          }


          return memory.strength > 2;
        }
      );
  }


  // ============================================================
  // 12. ПОШУК ЗА ЛЮДИНОЮ
  // ============================================================

  recallAboutPerson(personId) {

    return this.recall({
      person: personId
    });
  }


  getMemoriesAboutPerson(personId) {

    return this.search({
      person: personId
    }).map(
      item => item.memory
    );
  }


  // ============================================================
  // 13. ПОШУК ЗА ТЕМОЮ
  // ============================================================

  recallAboutTopic(topic) {

    return this.recall({
      topic
    });
  }


  getMemoriesAboutTopic(topic) {

    return this.search({
      topic
    }).map(
      item => item.memory
    );
  }


  // ============================================================
  // 14. ПОШУК ЗА ЕМОЦІЄЮ
  // ============================================================

  recallEmotionalMemory(emotion) {

    return this.recall({
      emotion
    });
  }


  // ============================================================
  // 15. НАЙВАЖЛИВІШІ СПОГАДИ
  // ============================================================

  getImportantMemories(limit = 10) {

    return [...this.memories]
      .sort(
        (a, b) => {

          const scoreA =
            a.importance * 0.6 +
            a.emotionalIntensity * 0.4;

          const scoreB =
            b.importance * 0.6 +
            b.emotionalIntensity * 0.4;

          return scoreB - scoreA;
        }
      )
      .slice(0, limit);
  }


  // ============================================================
  // 16. НЕДАВНІ СПОГАДИ
  // ============================================================

  getRecentMemories(limit = 10) {

    return [...this.memories]
      .sort(
        (a, b) =>
          this.getTimestamp(
            b.createdAt
          ) -
          this.getTimestamp(
            a.createdAt
          )
      )
      .slice(0, limit);
  }


  // ============================================================
  // 17. ОСТАННІ ПРИГАДУВАННЯ
  // ============================================================

  getRecentlyRecalled(limit = 10) {

    const ids =
      this.recentlyRecalled
        .slice(-limit)
        .reverse();

    return ids
      .map(id => this.get(id))
      .filter(Boolean);
  }


  // ============================================================
  // 18. ПОВ'ЯЗАНІ СПОГАДИ
  // ============================================================

  getRelatedMemories(memoryId) {

    const memory =
      this.get(memoryId);

    if (!memory) {
      return [];
    }


    const results = [];


    /*
     * Явно пов'язані.
     */
    for (
      const relatedId
      of memory.relatedMemories
    ) {

      const related =
        this.get(relatedId);

      if (related) {
        results.push(related);
      }
    }


    /*
     * Неявно пов'язані через людей і теми.
     */
    for (const candidate of this.memories) {

      if (
        candidate.id === memory.id
      ) {
        continue;
      }


      const personOverlap =
        this.overlapScore(
          memory.people,
          candidate.people
        );


      const topicOverlap =
        this.overlapScore(
          memory.topics,
          candidate.topics
        );


      if (
        personOverlap > 0 ||
        topicOverlap > 0
      ) {
        results.push(candidate);
      }
    }


    /*
     * Прибираємо дублікати.
     */
    return [
      ...new Map(
        results.map(
          item => [item.id, item]
        )
      ).values()
    ];
  }


  // ============================================================
  // 19. ЕПІЗОДИЧНА / АВТОБІОГРАФІЧНА ПАМ'ЯТЬ (v39)
  // ============================================================

  rememberEpisode(data = {}) {
    const state = this.brain?.state || {};
    const emotions = state.emotions || {};
    const dominant = Object.entries(emotions)
      .filter(([, value]) => typeof value === "number")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);

    return this.remember({
      type: "episode",
      importance: data.importance ?? this.estimateEpisodeImportance(data),
      emotionalIntensity: data.emotionalIntensity ?? this.estimateEmotionalIntensity(),
      emotions: data.emotions || dominant,
      source: data.source || "life",
      ...data
    });
  }

  rememberAction(action = {}) {
    if (!action.actionId) return null;
    const person = action.targetPerson || (action.actionId === "talkToYani" ? "Yani_Bakeneko" : null);
    const label = this.describeAction(action);
    return this.rememberEpisode({
      title: label,
      content: label,
      actionId: action.actionId,
      targetPerson: person,
      topics: [action.actionId],
      keywords: [action.actionId, ...this.actionKeywords(action.actionId)],
      people: person ? [person] : [],
      location: this.brain?.state?.world?.location || null,
      importance: this.estimateActionImportance(action),
      metadata: { reason: action.reason || null, goal: action.goal || null }
    });
  }

  describeAction(action = {}) {
    const map = {
      sleep:"Спав", rest:"Відпочивав", eat:"Їв", drink:"Пив", cook:"Готував їжу",
      talkToYani:"Розмовляв з Яні", talkToSomeone:"Розмовляв з людьми",
      commuteToWork:"Їхав на роботу", commuteHome:"Повертався додому", work:"Працював",
      walk:"Гуляв містом", cycling:"Катався на велосипеді", watchMovie:"Дивився фільм",
      playGame:"Грав", draw:"Малював", takeBath:"Приймав ванну", shower:"Приймав душ",
      washFace:"Умивався", shave:"Голився", doLaundry:"Займався пранням",
      vacuum:"Пилососив", mop:"Мив підлогу", wipeDust:"Витирав пил", washDishes:"Мив посуд",
      groceryShopping:"Купував продукти", orderDelivery:"Замовляв доставку",
      museum:"Ходив до музею", planetarium:"Ходив до планетарію", cinema:"Ходив у кіно",
      theater:"Ходив до театру", concert:"Ходив на концерт"
    };
    return map[action.actionId] || `Займався справою: ${action.actionId}`;
  }

  actionKeywords(actionId) {
    const map = {
      talkToYani:["яні","розмова"], work:["робота","техсмітник"], commuteToWork:["робота","дорога"],
      commuteHome:["дорога","дім"], eat:["їжа"], cook:["їжа","готування"], sleep:["сон"],
      walk:["прогулянка","місто"], cycling:["велосипед"], groceryShopping:["покупки","продукти"]
    };
    return map[actionId] || [];
  }

  estimateActionImportance(action = {}) {
    let value = 18;
    if (action.targetPerson) value += 8;
    if (["talkToYani","museum","planetarium","concert","cinema","cycling"].includes(action.actionId)) value += 10;
    if (["sleep","rest","washFace","shave"].includes(action.actionId)) value -= 5;
    return this.clamp(value, 8, 70);
  }

  estimateEpisodeImportance(data = {}) {
    let value = 25;
    if (data.people?.length) value += 10;
    if (data.event) value += 15;
    return this.clamp(value);
  }

  estimateEmotionalIntensity() {
    const values = Object.values(this.brain?.state?.emotions || {}).filter(v => typeof v === "number");
    return values.length ? this.clamp(Math.max(...values)) : 20;
  }

  getAutobiographical(criteria = {}, limit = 8) {
    const rows = this.search(criteria)
      .filter(item => ["episode","activity","event","conversation","experience"].includes(item.memory.type));
    return rows.slice(0, limit).map(item => item.memory);
  }

  getMemoriesForDate(date, limit = 12) {
    return this.memories
      .filter(memory => memory.worldDate === date || String(memory.createdAt || "").startsWith(date || "__"))
      .sort((a,b) => String(a.worldTime || "").localeCompare(String(b.worldTime || "")))
      .slice(-limit);
  }

  getMostSalient(limit = 5) {
    return [...this.memories]
      .map(memory => ({ memory, score: memory.importance * .35 + memory.strength * .25 + memory.emotionalIntensity * .25 + memory.vividness * .15 }))
      .sort((a,b) => b.score - a.score)
      .slice(0, limit)
      .map(x => x.memory);
  }

  formatMemory(memory) {
    if (!memory) return null;
    let text = memory.content || memory.title || "";
    if (!text) return null;
    text = text.replace(/^Акіра завершив дію:\s*/u, "");
    return text;
  }

  // ============================================================
  // 20. ОТРИМАТИ СПОГАД
  // ============================================================

  get(memoryId) {

    return this.memories.find(
      memory =>
        memory.id === memoryId
    ) || null;
  }


  // ============================================================
  // 20. ЗАГАЛЬНИЙ ОНОВЛЮВАЧ
  // ============================================================

  update(hours = 1) {

    this.decay(hours);

    this.lastUpdate =
      this.getCurrentTime();
  }


  // ============================================================
  // 21. ОБМЕЖЕННЯ КІЛЬКОСТІ
  // ============================================================

  trimMemory() {

    if (
      this.memories.length <=
      this.maxMemories
    ) {
      return;
    }


    /*
     * Видаляємо найменш цінні спогади.
     *
     * Постійні та дуже важливі захищені.
     */
    this.memories.sort(
      (a, b) => {

        const valueA =
          a.importance * 0.45 +
          a.strength * 0.35 +
          a.emotionalIntensity * 0.20;

        const valueB =
          b.importance * 0.45 +
          b.strength * 0.35 +
          b.emotionalIntensity * 0.20;

        /*
         * Постійні спогади завжди вище.
         */
        if (
          a.permanent &&
          !b.permanent
        ) {
          return -1;
        }

        if (
          !a.permanent &&
          b.permanent
        ) {
          return 1;
        }

        return valueB - valueA;
      }
    );


    /*
     * Залишаємо найцінніші.
     */
    this.memories =
      this.memories.slice(
        0,
        this.maxMemories
      );
  }


  // ============================================================
  // 22. СТАТИСТИКА ПАМ'ЯТІ
  // ============================================================

  getStats() {

    let permanent = 0;
    let emotional = 0;
    let important = 0;

    for (const memory of this.memories) {

      if (memory.permanent) {
        permanent++;
      }

      if (
        memory.emotionalIntensity >= 70
      ) {
        emotional++;
      }

      if (
        memory.importance >= 70
      ) {
        important++;
      }
    }


    return {
      total: this.memories.length,
      permanent,
      emotional,
      important,
      recentlyRecalled:
        this.recentlyRecalled.length
    };
  }


  // ============================================================
  // 23. ТЕХНІЧНА ІСТОРІЯ
  // ============================================================

  recordMemoryEvent(
    type,
    memory
  ) {

    if (
      !this.brain.history
    ) {
      return;
    }


    if (
      !this.brain.history.memory
    ) {
      this.brain.history.memory = [];
    }


    this.brain.history.memory.push({

      type,

      memoryId:
        memory.id,

      time:
        this.getCurrentTime()
    });


    if (
      this.brain.history.memory.length > 50
    ) {
      this.brain.history.memory.shift();
    }
  }


  // ============================================================
  // 24. ДОПОМІЖНІ ФУНКЦІЇ
  // ============================================================

  overlapScore(a = [], b = []) {

    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      !a.length ||
      !b.length
    ) {
      return 0;
    }


    const setB =
      new Set(b);


    const common =
      a.filter(
        item => setB.has(item)
      ).length;


    return common /
      Math.max(
        a.length,
        b.length
      );
  }


  clamp(value, min = 0, max = 100) {

    const number =
      Number(value);

    if (Number.isNaN(number)) {
      return min;
    }

    return Math.min(
      max,
      Math.max(min, number)
    );
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


    return new Date().toISOString();
  }


  getTimestamp(value) {

    if (!value) {
      return 0;
    }

    const timestamp =
      Date.parse(value);

    return Number.isNaN(timestamp)
      ? 0
      : timestamp;
  }
}


// ============================================================
// СТВОРЕННЯ МОДУЛЯ
// ============================================================
//
// brain.js може підключити його так:
//
// const memory = new AkiraMemory(akiraBrain);
// memory.init();
//
// ============================================================

if (
  typeof window !== "undefined"
) {
  window.AkiraMemory =
    AkiraMemory;
}
