/*
 * ДІАЛОГОВИЙ РУШІЙ АКІРИ
 *
 * dialogue.js
 *
 * Відповідає за формування реплік.
 *
 * ВАЖЛИВО:
 *
 * Це НЕ AI-генератор.
 *
 * Модуль не вигадує нові факти та не генерує
 * довільний текст із мовної моделі.
 *
 * Він:
 *
 *   1. визначає тему;
 *   2. визначає намір співрозмовника;
 *   3. перевіряє знання Акіри;
 *   4. перевіряє його інтерес;
 *   5. враховує емоції;
 *   6. враховує стосунки;
 *   7. дістає відповідні мовні блоки з JSON;
 *   8. комбінує їх;
 *   9. перевіряє повтори;
 *  10. повертає готову репліку.
 *
 *
 * dialogue.js
 *      ↑
 *      │
 * dialogue_data.json
 * dialogue_templates.json
 * language.json
 * topics.json
 * knowledge.json
 * personality.json
 * emotions
 * relationships
 * memories
 * state
 *
 */


class AkiraDialogue {

  constructor(brain) {

    this.brain = brain;

    /*
     * Історія сказаного.
     */
    this.history = [];

    this.maxHistory = 100;

    /*
     * Останні використані мовні блоки.
     */
    this.recentTemplates = [];

    this.maxRecentTemplates = 20;

    /*
     * Щоб однакові репліки не сипалися поспіль.
     */
    this.recentResponses = [];

    this.maxRecentResponses = 15;
  }


  // ============================================================
  // 1. ОСНОВНИЙ МЕТОД
  // ============================================================

  respond(input = "", context = {}) {

    const analysis =
      this.analyzeInput(
        input,
        context
      );


    const profile =
      this.buildDialogueProfile(
        analysis,
        context
      );


    const action =
      this.selectDialogueAction(
        profile
      );


    /*
     * Мовчання — повноцінний результат.
     *
     * Не кожне повідомлення обов'язково
     * має породжувати довгу відповідь.
     */
    if (
      action === "staySilent"
    ) {

      return this.createSilence(
        profile
      );
    }


    const content =
      this.selectContent(
        profile,
        action
      );


    const response =
      this.composeResponse(
        content,
        profile,
        action
      );


    const finalResponse =
      this.finalizeResponse(
        response,
        profile
      );


    this.recordDialogue({

      input,

      response:
        finalResponse,

      topic:
        analysis.topic,

      topics:
        analysis.topics,

      intent:
        analysis.intent,

      action,

      timestamp:
        this.getCurrentTime()
    });


    return finalResponse;
  }


  // ============================================================
  // 2. АНАЛІЗ ВХІДНОГО ПОВІДОМЛЕННЯ
  // ============================================================

  analyzeInput(
    input,
    context = {}
  ) {

    const text =
      String(input || "")
        .trim()
        .toLowerCase();


    const topics =
      this.detectTopics(
        text
      );


    const topic =
      topics[0]?.id ||
      context.topic ||
      null;


    const intent =
      this.detectIntent(
        text,
        context
      );


    return {

      text,

      topic,

      topics,

      intent,

      hasInput:
        text.length > 0,

      isQuestion:
        intent === "question",

      isRequest:
        intent === "request",

      isInvitation:
        intent === "invitation",

      isPositive:
        intent === "positive",

      isNegative:
        intent === "negative",

      isUncertain:
        intent === "uncertain"
    };
  }


  // ============================================================
  // 3. ВИЗНАЧЕННЯ ТЕМИ
  // ============================================================

  detectTopics(text) {

    const topicData =
      this.brain.data.topics ||
      {};


    const topics =
      topicData.topics ||
      topicData;


    const found = [];


    for (
      const [id, topic]
      of Object.entries(
        topics
      )
    ) {

      if (
        !topic ||
        typeof topic !== "object"
      ) {
        continue;
      }


      const keywords =
        topic.keywords ||
        topic.words ||
        [];


      let matches = 0;


      for (
        const keyword
        of keywords
      ) {

        if (
          text.includes(
            String(keyword)
              .toLowerCase()
          )
        ) {

          matches++;
        }
      }


      if (
        matches > 0
      ) {

        found.push({

          id,

          matches,

          depth:
            topic.depth ??
            0
        });
      }
    }


    /*
     * Додаткові явні ключові слова.
     *
     * Це резервний шар, щоб діалог працював
     * навіть якщо topics.json буде розширюватися.
     */
    const fallback = {

      Yani_Bakeneko: [
        "яні",
        "яні бакенеко"
      ],

      technology: [
        "технолог",
        "техніка",
        "пристрій",
        "гаджет"
      ],

      electronics: [
        "електрон",
        "електроніка"
      ],

      computers: [
        "комп'ютер",
        "комп",
        "пк",
        "ноутбук"
      ],

      cycling: [
        "велосипед",
        "велосипеді",
        "велосипедом",
        "велосипедом"
      ],

      space: [
        "космос",
        "галактик",
        "планет"
      ],

      astronomy: [
        "астроном",
        "зорі",
        "зірки",
        "сузір'я"
      ],

      planetarium: [
        "планетар"
      ],

      cinema: [
        "кіно",
        "фільм"
      ],

      music: [
        "музик",
        "пісн",
        "трек"
      ],

      games: [
        "гра",
        "ігри",
        "грати"
      ],

      reading: [
        "книг",
        "читати",
        "читання"
      ],

      museums: [
        "музей",
        "музеї"
      ],

      weather: [
        "погод",
        "дощ",
        "сніг",
        "вітер",
        "температур"
      ],

      work: [
        "робот",
        "роботі",
        "працюєш",
        "працювати"
      ]
    };


    for (
      const [id, keywords]
      of Object.entries(
        fallback
      )
    ) {

      let matches = 0;


      for (
        const keyword
        of keywords
      ) {

        if (
          text.includes(
            keyword
          )
        ) {

          matches++;
        }
      }


      if (
        matches > 0
      ) {

        const existing =
          found.find(
            item =>
              item.id === id
          );


        if (existing) {

          existing.matches +=
            matches;
        }

        else {

          found.push({

            id,

            matches,

            depth: 0
          });
        }
      }
    }


    /*
     * Більше збігів → вище тема.
     */
    found.sort(
      (a, b) => {

        if (
          b.matches !==
          a.matches
        ) {

          return (
            b.matches -
            a.matches
          );
        }


        return (
          a.depth -
          b.depth
        );
      }
    );


    return found.slice(
      0,
      5
    );
  }


  // ============================================================
  // 4. ВИЗНАЧЕННЯ НАМІРУ
  // ============================================================

  detectIntent(
    text,
    context = {}
  ) {

    const topicData =
      this.brain.data.topics ||
      {};


    const patterns =
      topicData.intentPatterns ||
      topicData.intents ||
      {};


    /*
     * Спочатку використовуємо patterns
     * із JSON.
     */
    for (
      const [intent, values]
      of Object.entries(
        patterns
      )
    ) {

      if (
        !Array.isArray(values)
      ) {
        continue;
      }


      for (
        const pattern
        of values
      ) {

        if (
          text.includes(
            String(pattern)
              .toLowerCase()
          )
        ) {

          return intent;
        }
      }
    }


    /*
     * Базове визначення.
     */

    if (
      text.endsWith("?") ||
      /^(хто|що|де|коли|чому|навіщо|як|який|яка|чи)\b/i
        .test(text)
    ) {

      return "question";
    }


    if (
      /^(можеш|можна|зроби|допоможи|порадь|покажи|розкажи)/i
        .test(text)
    ) {

      return "request";
    }


    if (
      /(давай|ходімо|підемо|пішли|зіграємо)/i
        .test(text)
    ) {

      return "invitation";
    }


    if (
      /(не подоб|ненавид|жах|погано|дурн|дратує)/i
        .test(text)
    ) {

      return "negative";
    }


    if (
      /(подоба|клас|чудов|супер|цікав|люблю)/i
        .test(text)
    ) {

      return "positive";
    }


    if (
      /(можливо|мабуть|не знаю|напевно)/i
        .test(text)
    ) {

      return "uncertain";
    }


    return "neutral";
  }


  // ============================================================
  // 5. ПРОФІЛЬ ДІАЛОГУ
  // ============================================================

  buildDialogueProfile(
    analysis,
    context
  ) {

    const topic =
      analysis.topic;


    const knowledge =
      this.getKnowledge(
        topic
      );


    const interest =
      this.getInterest(
        topic
      );


    const relationship =
      this.getRelationship(
        context
      );


    const emotions =
      this.getEmotionProfile();


    const state =
      this.brain.state ||
      {};


    return {

      ...analysis,

      topic,

      knowledge,

      interest,

      relationship,

      emotions,

      state,

      personality:
        this.getPersonality(),

      responseLength:
        this.selectResponseLength(
          analysis,
          topic
        ),

      novelty:
        this.calculateNovelty(
          topic
        )
    };
  }


  // ============================================================
  // 6. ЗНАННЯ
  // ============================================================

  getKnowledge(topic) {

    if (!topic) {

      return {
        knowledge: 0,
        confidence: 0,
        practical: 0,
        explanation: 0
      };
    }


    const knowledgeData =
      this.brain.data.knowledge ||
      {};


    const domains =
      knowledgeData.domains ||
      knowledgeData;


    const data =
      domains[topic];


    if (!data) {

      return {

        knowledge: 0,

        confidence: 0,

        practical: 0,

        explanation: 0
      };
    }


    return {

      knowledge:
        Number(
          data.knowledge ??
          data.value ??
          0
        ),

      confidence:
        Number(
          data.confidence ??
          0
        ),

      practical:
        Number(
          data.practical ??
          data.practicalKnowledge ??
          0
        ),

      explanation:
        Number(
          data.explanation ??
          data.explanationSkill ??
          0
        )
    };
  }


  // ============================================================
  // 7. ІНТЕРЕС
  // ============================================================

  getInterest(topic) {

    if (!topic) {

      return {

        interest: 0,

        liking: 0,

        curiosity: 0,

        initiative: 0
      };
    }


    const interests =
      this.brain.data.interests ||
      {};


    const data =
      interests[topic];


    if (!data) {

      return {

        interest: 0,

        liking: 0,

        curiosity: 0,

        initiative: 0
      };
    }


    return {

      interest:
        Number(
          data.interest ??
          0
        ),

      liking:
        Number(
          data.liking ??
          0
        ),

      curiosity:
        Number(
          data.curiosity ??
          0
        ),

      initiative:
        Number(
          data.initiative ??
          0
        ),

      familiarity:
        Number(
          data.familiarity ??
          0
        )
    };
  }


  // ============================================================
  // 8. СТОСУНКИ
  // ============================================================

  getRelationship(
    context = {}
  ) {

    const personId =
      context.personId ||
      context.target ||
      this.detectPersonFromContext(
        context
      );


    if (!personId) {

      return {

        personId: null,

        type: "unknown",

        closeness: 0,

        trust: 0,

        liking: 0,

        affection: 0,

        irritation: 0
      };
    }


    const relation =
      this.brain.state
        ?.relationships
        ?.[personId] ||
      this.brain.data.people
        ?.[personId] ||
      {};


    return {

      personId,

      type:
        relation.type ||
        "unknown",

      closeness:
        Number(
          relation.closeness ??
          0
        ),

      trust:
        Number(
          relation.trust ??
          0
        ),

      liking:
        Number(
          relation.liking ??
          0
        ),

      affection:
        Number(
          relation.affection ??
          0
        ),

      irritation:
        Number(
          relation.irritation ??
          0
        ),

      desireForContact:
        Number(
          relation.desireForContact ??
          0
        )
    };
  }


  detectPersonFromContext(
    context
  ) {

    if (
      context.topic ===
      "Yani_Bakeneko"
    ) {

      return "Yani_Bakeneko";
    }


    return null;
  }


  // ============================================================
  // 9. ЕМОЦІЇ
  // ============================================================

  getEmotionProfile() {

    if (
      this.brain.mood
    ) {

      return {

        state:
          this.brain.mood
            .getState(),

        dominant:
          this.brain.mood
            .getDominantEmotions(5),

        conflicts:
          this.brain.mood
            .getConflictingEmotions(),

        expression:
          this.brain.mood
            .getExpressionModifier()
      };
    }


    return {

      state: {},

      dominant: [],

      conflicts: [],

      expression: {

        expressiveness: 50,

        visibleIntensity: 0.5
      }
    };
  }


  // ============================================================
  // 10. ОСОБИСТІСТЬ
  // ============================================================

  getPersonality() {

    return (
      this.brain.data
        .personality
        ?.personality
        ?.traits ||
      {}
    );
  }


  // ============================================================
  // 11. ДОВЖИНА ВІДПОВІДІ
  // ============================================================

  selectResponseLength(
    analysis,
    topic
  ) {

    const data =
      this.brain.data
        .dialogue_data ||
      {};


    const modes =
      data.responseModes ||
      {};


    /*
     * Якщо тема дуже цікава,
     * Акіра схильний розгорнути відповідь.
     */
    const interest =
      this.getInterest(
        topic
      );


    if (
      interest.interest >= 85 &&
      interest.initiative >= 60
    ) {

      return (
        modes.long
          ? "long"
          : "medium"
      );
    }


    if (
      interest.interest <= 25
    ) {

      return (
        modes.short
          ? "short"
          : "medium"
      );
    }


    /*
     * Питання зазвичай потребує
     * трохи більше змісту.
     */
    if (
      analysis.intent ===
      "question"
    ) {

      return (
        modes.medium
          ? "medium"
          : "short"
      );
    }


    return "medium";
  }


  // ============================================================
  // 12. ВИБІР ДІАЛОГОВОЇ ДІЇ
  // ============================================================

  selectDialogueAction(
    profile
  ) {

    const data =
      this.brain.data
        .dialogue_data ||
      {};


    const actions =
      data.conversationActions ||
      {};


    /*
     * Сильне роздратування або
     * соціальна втома можуть скоротити діалог.
     */
    const emotions =
      profile.emotions.state;


    const socialEnergy =
      Number(
        profile.state
          ?.character
          ?.socialEnergy ??
        50
      );


    if (
      socialEnergy < 15
    ) {

      return "endConversation";
    }


    if (
      emotions.irritation >= 85 &&
      profile.relationship
        .irritation >= 60
    ) {

      return "endConversation";
    }


    /*
     * Невідомий або порожній ввід.
     */
    if (
      !profile.hasInput
    ) {

      return "continue";
    }


    /*
     * Питання.
     */
    if (
      profile.intent ===
      "question"
    ) {

      return "answer";
    }


    /*
     * Запит.
     */
    if (
      profile.intent ===
      "request"
    ) {

      return "answer";
    }


    /*
     * Запрошення.
     */
    if (
      profile.intent ===
      "invitation"
    ) {

      return "answer";
    }


    /*
     * Дуже низький інтерес →
     * можливість короткої відповіді
     * або зміни теми.
     */
    if (
      profile.interest.interest < 20 &&
      profile.emotions.state.boredom >= 60
    ) {

      const random =
        Math.random();


      if (
        random < 0.25
      ) {

        return "changeTopic";
      }
    }


    /*
     * Невпевненість.
     */
    if (
      profile.intent ===
      "uncertain"
    ) {

      return "answer";
    }


    /*
     * Звичайна розмова.
     */
    return "answer";
  }


  // ============================================================
  // 13. ВИБІР МОВНОГО МАТЕРІАЛУ
  // ============================================================

  selectContent(
    profile,
    action
  ) {

    const templates =
      this.brain.data
        .dialogue_templates ||
      {};


    const result = {

      opener: null,

      mainStatement: null,

      explanation: null,

      personalOpinion: null,

      emotionalReaction: null,

      question: null,

      followUp: null,

      closing: null
    };


    /*
     * 1. Спочатку тема.
     */
    const topicBlocks =
      this.getTopicBlocks(
        profile.topic,
        templates
      );


    /*
     * 2. Потім емоційний матеріал.
     */
    const emotionalBlocks =
      this.getEmotionalBlocks(
        profile,
        templates
      );


    /*
     * 3. Стосунки.
     */
    const relationshipBlocks =
      this.getRelationshipBlocks(
        profile,
        templates
      );


    /*
     * 4. Намір.
     */
    const intentBlocks =
      this.getIntentBlocks(
        profile,
        templates
      );


    /*
     * Відкривач.
     */
    result.opener =
      this.pickTemplate(
        [
          ...intentBlocks.openers,
          ...topicBlocks.openers,
          ...emotionalBlocks.openers,
          ...relationshipBlocks.openers,
          ...this.getGenericOpeners(
            templates
          )
        ]
      );


    /*
     * Основна думка.
     */
    result.mainStatement =
      this.pickTemplate(
        [
          ...topicBlocks.main,
          ...intentBlocks.main,
          ...relationshipBlocks.main
        ]
      );


    /*
     * Пояснення потрібне тільки
     * коли знань достатньо.
     */
    if (
      profile.knowledge.knowledge >= 55
    ) {

      result.explanation =
        this.pickTemplate(
          topicBlocks.explanation
        );
    }


    /*
     * Особиста реакція.
     */
    result.personalOpinion =
      this.pickTemplate(
        [
          ...topicBlocks.opinion,
          ...relationshipBlocks.opinion
        ]
      );


    /*
     * Емоційна реакція.
     */
    result.emotionalReaction =
      this.pickTemplate(
        emotionalBlocks.reactions
      );


    /*
     * Питання.
     */
    if (
      this.shouldAskQuestion(
        profile
      )
    ) {

      result.question =
        this.pickTemplate(
          [
            ...topicBlocks.questions,
            ...intentBlocks.questions,
            ...relationshipBlocks.questions
          ]
        );
    }


    /*
     * Завершення.
     */
    result.closing =
      this.pickTemplate(
        this.getClosings(
          templates
        )
      );


    return result;
  }


  // ============================================================
  // 14. БЛОКИ ТЕМИ
  // ============================================================

  getTopicBlocks(
    topic,
    templates
  ) {

    const topicData =
      templates.topics ||
      {};


    const block =
      topicData[topic] ||
      {};


    return {

      openers:
        this.ensureArray(
          block.openers
        ),

      main:
        this.ensureArray(
          block.main ||
          block.mainStatement
        ),

      explanation:
        this.ensureArray(
          block.explanation
        ),

      opinion:
        this.ensureArray(
          block.opinion ||
          block.personalOpinion
        ),

      questions:
        this.ensureArray(
          block.questions
        )
    };
  }


  // ============================================================
  // 15. ЕМОЦІЙНІ БЛОКИ
  // ============================================================

  getEmotionalBlocks(
    profile,
    templates
  ) {

    const emotions =
      profile.emotions.state;


    const result = {

      openers: [],

      reactions: []
    };


    const emotionalData =
      templates.emotions ||
      {};


    /*
     * Обираємо кілька найсильніших
     * поточних емоцій.
     */
    const dominant =
      profile.emotions.dominant ||
      [];


    for (
      const item
      of dominant
    ) {

      const block =
        emotionalData[
          item.emotion
        ];


      if (!block) {
        continue;
      }


      result.openers.push(
        ...this.ensureArray(
          block.openers
        )
      );


      result.reactions.push(
        ...this.ensureArray(
          block.reactions
        )
      );
    }


    /*
     * Спеціальні стани.
     */
    if (
      emotions.boredom >= 65
    ) {

      result.reactions.push(
        ...this.ensureArray(
          emotionalData
            .boredom
            ?.reactions
        )
      );
    }


    if (
      emotions.irritation >= 65
    ) {

      result.reactions.push(
        ...this.ensureArray(
          emotionalData
            .irritation
            ?.reactions
        )
      );
    }


    if (
      emotions.joy >= 70
    ) {

      result.reactions.push(
        ...this.ensureArray(
          emotionalData
            .joy
            ?.reactions
        )
      );
    }


    return result;
  }


  // ============================================================
  // 16. БЛОКИ СТОСУНКІВ
  // ============================================================

  getRelationshipBlocks(
    profile,
    templates
  ) {

    const result = {

      openers: [],

      main: [],

      opinion: [],

      questions: []
    };


    const relation =
      profile.relationship;


    const relationshipData =
      templates.relationships ||
      {};


    /*
     * Тип стосунків.
     */
    const type =
      relation.type;


    if (
      relationshipData[type]
    ) {

      const block =
        relationshipData[type];


      result.openers.push(
        ...this.ensureArray(
          block.openers
        )
      );


      result.main.push(
        ...this.ensureArray(
          block.main
        )
      );


      result.opinion.push(
        ...this.ensureArray(
          block.opinion
        )
      );


      result.questions.push(
        ...this.ensureArray(
          block.questions
        )
      );
    }


    /*
     * Яні має окремий набір матеріалу
     * у dialogue_templates.json.
     */
    if (
      relation.personId ===
      "Yani_Bakeneko"
    ) {

      const yani =
        templates.yani ||
        templates.Yani ||
        {};


      result.openers.push(
        ...this.ensureArray(
          yani.openers
        )
      );


      result.main.push(
        ...this.ensureArray(
          yani.main
        )
      );


      result.opinion.push(
        ...this.ensureArray(
          yani.opinion
        )
      );


      result.questions.push(
        ...this.ensureArray(
          yani.questions
        )
      );
    }


    return result;
  }


  // ============================================================
  // 17. БЛОКИ НАМІРУ
  // ============================================================

  getIntentBlocks(
    profile,
    templates
  ) {

    const intents =
      templates.intents ||
      {};


    const block =
      intents[
        profile.intent
      ] ||
      {};


    return {

      openers:
        this.ensureArray(
          block.openers
        ),

      main:
        this.ensureArray(
          block.main
        ),

      questions:
        this.ensureArray(
          block.questions
        )
    };
  }


  // ============================================================
  // 18. ЗАГАЛЬНІ ВІДКРИВАЧІ
  // ============================================================

  getGenericOpeners(
    templates
  ) {

    return this.ensureArray(
      templates.neutral
        ?.openers
    );
  }


  // ============================================================
  // 19. ЗАВЕРШЕННЯ
  // ============================================================

  getClosings(
    templates
  ) {

    return this.ensureArray(
      templates.neutral
        ?.closings ||
      templates.closings
    );
  }


  // ============================================================
  // 20. ЧИ СТАВИТИ ПИТАННЯ
  // ============================================================

  shouldAskQuestion(
    profile
  ) {

    /*
     * Не перетворюємо Акіру на бота,
     * який закінчує кожну репліку питанням.
     */

    const communication =
      profile.personality
        ?.communication ||
      this.brain.data.personality
        ?.personality
        ?.communication ||
      {};


    const initiative =
      Number(
        communication.initiative ??
        50
      );


    const openness =
      Number(
        communication.openness ??
        50
      );


    let probability =
      0.15 +
      initiative / 300 +
      openness / 400;


    /*
     * Високий інтерес збільшує
     * бажання продовжити тему.
     */
    probability +=
      profile.interest.interest /
      500;


    /*
     * Соціальна втома зменшує.
     */
    const socialEnergy =
      Number(
        profile.state
          ?.character
          ?.socialEnergy ??
        50
      );


    if (
      socialEnergy < 30
    ) {

      probability *=
        0.45;
    }


    /*
     * Максимум близько 70%.
     */
    probability =
      Math.min(
        0.70,
        probability
      );


    return (
      Math.random() <
      probability
    );
  }


  // ============================================================
  // 21. ВИБІР ШАБЛОНУ
  // ============================================================

  pickTemplate(
    candidates
  ) {

    const valid =
      this.ensureArray(
        candidates
      )
        .filter(
          item =>
            typeof item ===
            "string" &&
            item.trim()
        );


    if (
      !valid.length
    ) {

      return null;
    }


    /*
     * Не використовуємо недавно вибраний
     * шаблон, якщо є інші варіанти.
     */
    let available =
      valid.filter(
        item =>
          !this.recentTemplates
            .includes(item)
      );


    if (
      !available.length
    ) {

      available =
        valid;
    }


    const index =
      Math.floor(
        Math.random() *
        available.length
      );


    const selected =
      available[index];


    this.recentTemplates.push(
      selected
    );


    if (
      this.recentTemplates.length >
      this.maxRecentTemplates
    ) {

      this.recentTemplates.shift();
    }


    return selected;
  }


  // ============================================================
  // 22. СКЛАДАННЯ РЕПЛІКИ
  // ============================================================

  composeResponse(
    content,
    profile,
    action
  ) {

    const parts = [];


    /*
     * Не всі компоненти обов'язкові.
     *
     * Саме це не дає кожній відповіді
     * перетворюватися на:
     *
     * «Привіт! Основна думка. Пояснення.
     * Особиста думка. Емоція. Питання. Бувай!»
     */

    if (
      content.opener
    ) {

      parts.push(
        content.opener
      );
    }


    if (
      content.mainStatement
    ) {

      parts.push(
        content.mainStatement
      );
    }


    if (
      content.explanation &&
      this.shouldUseExplanation(
        profile
      )
    ) {

      parts.push(
        content.explanation
      );
    }


    if (
      content.personalOpinion &&
      this.shouldUseOpinion(
        profile
      )
    ) {

      parts.push(
        content.personalOpinion
      );
    }


    if (
      content.emotionalReaction
    ) {

      parts.push(
        content.emotionalReaction
      );
    }


    if (
      content.question &&
      this.shouldUseQuestion(
        profile
      )
    ) {

      parts.push(
        content.question
      );
    }


    /*
     * Завершення використовуємо
     * не завжди.
     */
    if (
      content.closing &&
      parts.length >= 2 &&
      Math.random() < 0.35
    ) {

      parts.push(
        content.closing
      );
    }


    /*
     * Якщо взагалі нічого не знайшли,
     * даємо коротку реакцію.
     */
    if (
      !parts.length
    ) {

      return this.createFallbackResponse(
        profile
      );
    }


    return parts
      .join(" ")
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }


  // ============================================================
  // 23. ПОЯСНЕННЯ
  // ============================================================

  shouldUseExplanation(
    profile
  ) {

    if (
      profile.responseLength ===
      "short"
    ) {
      return false;
    }


    return (
      profile.knowledge.knowledge >=
      55
    );
  }


  // ============================================================
  // 24. ОСОБИСТА ДУМКА
  // ============================================================

  shouldUseOpinion(
    profile
  ) {

    const expressiveness =
      profile.emotions
        .expression
        .visibleIntensity;


    return (
      expressiveness >= 0.35 &&
      Math.random() < 0.60
    );
  }


  // ============================================================
  // 25. ПИТАННЯ
  // ============================================================

  shouldUseQuestion(
    profile
  ) {

    /*
     * Якщо це вже відповідь на питання,
     * не обов'язково одразу задавати своє.
     */
    if (
      profile.intent ===
      "question"
    ) {

      return (
        Math.random() < 0.35
      );
    }


    return (
      profile.question !== null
    );
  }


  // ============================================================
  // 26. ЗМІНА ТЕМИ
  // ============================================================

  createTopicChange(
    profile
  ) {

    const templates =
      this.brain.data
        .dialogue_templates ||
      {};


    const blocks =
      templates.boredom ||
      templates.topicChange ||
      {};


    return (
      this.pickTemplate(
        this.ensureArray(
          blocks
            .changeTopic
        )
      ) ||
      "До речі, давай про щось інше."
    );
  }


  // ============================================================
  // 27. МОВЧАННЯ
  // ============================================================

  createSilence(
    profile
  ) {

    /*
     * Повертаємо спеціальний об'єкт,
     * а не просто порожній рядок.
     *
     * UI зможе вирішити,
     * чи показувати «...», чи взагалі
     * нічого не показувати.
     */
    return {

      type:
        "silence",

      text:
        "",

      duration:
        this.getSilenceDuration(
          profile
        ),

      reason:
        this.getSilenceReason(
          profile
        ),

      timestamp:
        this.getCurrentTime()
    };
  }


  getSilenceDuration(
    profile
  ) {

    const socialEnergy =
      Number(
        profile.state
          ?.character
          ?.socialEnergy ??
        50
      );


    if (
      socialEnergy < 20
    ) {
      return 30;
    }


    if (
      profile.emotions
        .state
        .boredom > 70
    ) {
      return 15;
    }


    return 5;
  }


  getSilenceReason(
    profile
  ) {

    const emotions =
      profile.emotions.state;


    if (
      emotions.fatigue >= 75
    ) {

      return "втома";
    }


    if (
      emotions.boredom >= 75
    ) {

      return "низький інтерес";
    }


    if (
      emotions.anxiety >= 70
    ) {

      return "невпевненість";
    }


    return "немає потреби відповідати";
  }


  // ============================================================
  // 28. ЗАПАСНА ВІДПОВІДЬ
  // ============================================================

  createFallbackResponse(
    profile
  ) {

    const short =
      this.brain.data
        .language
        ?.shortReplies;


    const candidates =
      this.ensureArray(
        short
      );


    if (
      candidates.length
    ) {

      return this.pickTemplate(
        candidates
      );
    }


    /*
     * Кілька базових варіантів.
     */
    const fallback = [

      "Мм.",

      "Цікаво.",

      "Не знаю.",

      "Можливо.",

      "Зараз навіть не знаю, що сказати."
    ];


    return this.pickTemplate(
      fallback
    );
  }


  // ============================================================
  // 29. ФІНАЛЬНА ОБРОБКА
  // ============================================================

  finalizeResponse(
    response,
    profile
  ) {

    if (
      typeof response !==
      "string"
    ) {

      return response;
    }


    let result =
      response.trim();


    /*
     * Прибираємо випадкові подвійні пробіли.
     */
    result =
      result.replace(
        /\s+/g,
        " "
      );


    /*
     * Не дозволяємо нескінченний
     * потік однакових відповідей.
     */
    if (
      this.recentResponses
        .includes(result)
    ) {

      const alternative =
        this.createFallbackResponse(
          profile
        );


      if (
        alternative !== result
      ) {

        result =
          alternative;
      }
    }


    /*
     * Не більше одного emoji.
     */
    result =
      this.limitEmoji(
        result
      );


    /*
     * Обмежуємо довжину.
     */
    const maxWords =
      120;


    const words =
      result.split(
        /\s+/
      );


    if (
      words.length >
      maxWords
    ) {

      result =
        words
          .slice(
            0,
            maxWords
          )
          .join(" ")
          .trim();


      if (
        !/[.!?…]$/.test(
          result
        )
      ) {

        result +=
          "…";
      }
    }


    this.recentResponses.push(
      result
    );


    if (
      this.recentResponses.length >
      this.maxRecentResponses
    ) {

      this.recentResponses.shift();
    }


    return result;
  }


  // ============================================================
  // 30. ОБМЕЖЕННЯ EMOJI
  // ============================================================

  limitEmoji(
    text
  ) {

    /*
     * Простий набір Unicode-діапазонів.
     */
    let found = 0;


    return text.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
      match => {

        found++;

        return found <= 1
          ? match
          : "";
      }
    );
  }


  // ============================================================
  // 31. НОВИЗНА ТЕМИ
  // ============================================================

  calculateNovelty(
    topic
  ) {

    if (!topic) {
      return 100;
    }


    const recent =
      this.history
        .slice(-10);


    const count =
      recent.filter(
        item =>
          item.topic === topic
      ).length;


    return Math.max(
      0,
      100 -
      count * 15
    );
  }


  // ============================================================
  // 32. ЗАПИС ДІАЛОГУ
  // ============================================================

  recordDialogue(
    item
  ) {

    this.history.push(
      item
    );


    if (
      this.history.length >
      this.maxHistory
    ) {

      this.history.shift();
    }


    /*
     * Даємо memory.js можливість
     * пізніше перетворити важливі діалоги
     * на спогади.
     */
    if (
      this.brain.memory &&
      typeof this.brain.memory
        .recordMemoryEvent ===
      "function"
    ) {

      this.brain.memory
        .recordMemoryEvent({

          type:
            "dialogue",

          content:
            item.response,

          topic:
            item.topic,

          timestamp:
            item.timestamp
        });
    }
  }


  // ============================================================
  // 33. ДОПОМІЖНІ ФУНКЦІЇ
  // ============================================================

  ensureArray(
    value
  ) {

    if (
      Array.isArray(value)
    ) {

      return value;
    }


    if (
      typeof value ===
      "string"
    ) {

      return [value];
    }


    return [];
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

  window.AkiraDialogue =
    AkiraDialogue;
}
