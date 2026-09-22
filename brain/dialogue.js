// dialogue.js
// Мовний рушій Акіри.
// Не є ШІ та не генерує нові факти.
// Вибирає й комбінує заготовлені мовні блоки
// відповідно до поточного стану персонажа.

class AkiraDialogue {

    constructor(brain) {
        this.brain = brain;

        this.history = [];
        this.recentTemplates = [];
        this.recentResponses = [];

        this.maxHistory = 50;
        this.maxRecentTemplates = 12;
        this.maxRecentResponses = 8;

        this.settings = {
            randomness: 18,
            maxWords: 120,
            maxQuestions: 2,
            maxEmoji: 1,
            avoidImmediateRepeat: true,
            avoidRecentTemplates: true
        };
    }


    // =========================================================
    // ОСНОВНА ВІДПОВІДЬ
    // =========================================================

    respond(input, context = {}) {

        const text = String(input || "").trim();

        if (!text) {
            return this.createSilence("порожнє повідомлення");
        }

        const profile = this.buildDialogueProfile(text, context);

        const action = this.selectDialogueAction(profile);

        if (action === "staySilent") {
            return this.createSilence(
                this.chooseSilenceReason(profile)
            );
        }

        if (action === "endConversation") {
            return this.composeClosing(profile);
        }

        if (action === "changeTopic") {
            return this.composeTopicChange(profile);
        }

        const response = this.composeResponse(profile, action);

        const finalized = this.finalizeResponse(response, profile);

        this.recordDialogue(text, finalized, profile);

        return finalized;
    }


    // =========================================================
    // АНАЛІЗ ПОВІДОМЛЕННЯ
    // =========================================================

    analyzeInput(input) {

        const text = input.toLowerCase();

        return {
            raw: input,
            normalized: text,

            topic: this.detectTopic(text),
            topics: this.detectTopics(text),

            intent: this.detectIntent(text),

            sentiment: this.detectSentiment(text),

            question: this.isQuestion(text),

            directAddress: this.isDirectAddress(text),

            containsGreeting: this.containsGreeting(text),
            containsFarewell: this.containsFarewell(text)
        };
    }


    // =========================================================
    // ПРОФІЛЬ ДІАЛОГУ
    // =========================================================

    buildDialogueProfile(input, context = {}) {

        const analysis = this.analyzeInput(input);

        const topic = analysis.topic;

        const knowledge = this.getKnowledge(topic);
        const interest = this.getInterest(topic);
        const relationship = this.getRelationship(context);

        const emotions = this.getEmotionProfile();
        const state = this.getCurrentState();
        const personality = this.getPersonality();

        const novelty = this.calculateNovelty(
            topic,
            analysis,
            context
        );

        const responseLength = this.selectResponseLength({
            analysis,
            knowledge,
            interest,
            emotions,
            state,
            personality,
            relationship
        });

        return {
            input,
            context,

            analysis,

            topic,
            topics: analysis.topics,

            knowledge,
            interest,
            relationship,

            emotions,
            state,
            personality,

            novelty,
            responseLength,

            memory: this.findRelevantMemory(
                topic,
                analysis,
                context
            ),

            preferences: this.getPreferences(topic),

            language: this.brain.data?.language || {},

            timestamp: Date.now()
        };
    }


    // =========================================================
    // ТЕМИ
    // =========================================================

    detectTopics(text) {

        const result = [];

        const topicData =
            this.brain.data?.topics?.topics ||
            this.brain.data?.topics ||
            {};

        for (const [topicId, topic] of Object.entries(topicData)) {

            if (!topic || typeof topic !== "object") {
                continue;
            }

            const keywords = Array.isArray(topic.keywords)
                ? topic.keywords
                : [];

            let score = 0;

            for (const keyword of keywords) {

                if (
                    typeof keyword === "string" &&
                    text.includes(keyword.toLowerCase())
                ) {
                    score += 1;
                }
            }

            if (score > 0) {
                result.push({
                    id: topicId,
                    score
                });
            }
        }

        result.sort((a, b) => b.score - a.score);

        return result.slice(0, 5);
    }


    detectTopic(text) {

        const topics = this.detectTopics(text);

        if (topics.length) {
            return topics[0].id;
        }

        // Мінімальний універсальний запасний шар.
        const fallback = {

            greeting: [
                "привіт",
                "вітаю",
                "добрий день",
                "добрий вечір",
                "доброго ранку"
            ],

            farewell: [
                "бувай",
                "до побачення",
                "до зустрічі",
                "па-па"
            ],

            technology: [
                "технолог",
                "техніка",
                "гаджет",
                "пристрій"
            ],

            electronics: [
                "електрон",
                "телефон",
                "смартфон",
                "ноутбук",
                "комп'ютер"
            ],

            cycling: [
                "велосипед",
                "вел",
                "велосипедом",
                "кататись",
                "кататися"
            ],

            flowers: [
                "квіт",
                "троянд",
                "ромаш",
                "квітка"
            ],

            animals: [
                "тварин",
                "кіт",
                "кот",
                "пес",
                "собак"
            ],

            space: [
                "космос",
                "зірк",
                "галактик",
                "планет",
                "астроном"
            ],

            cinema: [
                "фільм",
                "кіно",
                "кінематограф"
            ],

            games: [
                "гра",
                "грати",
                "ігров",
                "шахи",
                "шашки"
            ],

            music: [
                "музик",
                "пісн",
                "трек",
                "мелод"
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
                "прац",
                "магазин",
                "покупець",
                "клієнт"
            ]
        };

        let bestTopic = null;
        let bestScore = 0;

        for (const [topic, words] of Object.entries(fallback)) {

            let score = 0;

            for (const word of words) {

                if (text.includes(word)) {
                    score++;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestTopic = topic;
            }
        }

        return bestTopic || "general";
    }


    // =========================================================
    // НАМІР
    // =========================================================

    detectIntent(text) {

        const topicData =
            this.brain.data?.topics?.intentPatterns ||
            this.brain.data?.topics?.intents ||
            {};

        for (const [intent, patterns] of Object.entries(topicData)) {

            if (!Array.isArray(patterns)) {
                continue;
            }

            for (const pattern of patterns) {

                if (
                    typeof pattern === "string" &&
                    text.includes(pattern.toLowerCase())
                ) {
                    return intent;
                }
            }
        }

        if (this.isQuestion(text)) {
            return "question";
        }

        if (
            text.includes("можеш") ||
            text.includes("допоможи") ||
            text.includes("допомог")
        ) {
            return "request";
        }

        if (
            text.includes("подобається") ||
            text.includes("подобається тобі") ||
            text.includes("любиш")
        ) {
            return "question";
        }

        if (
            text.includes("запрошую") ||
            text.includes("ходімо") ||
            text.includes("підемо")
        ) {
            return "invitation";
        }

        if (
            text.includes("дякую") ||
            text.includes("спасибі")
        ) {
            return "thanks";
        }

        if (
            text.includes("вибач") ||
            text.includes("перепрошую")
        ) {
            return "apology";
        }

        return "statement";
    }


    isQuestion(text) {

        return (
            text.includes("?") ||
            /^(що|хто|де|коли|чому|навіщо|як|який|яка|яке|які|скільки|чи)\b/i
                .test(text)
        );
    }


    detectSentiment(text) {

        const positive = [
            "круто",
            "чудово",
            "клас",
            "подобається",
            "люблю",
            "приємно",
            "супер",
            "дякую"
        ];

        const negative = [
            "погано",
            "ненавиджу",
            "дратує",
            "жах",
            "жахливо",
            "сумно",
            "злюсь",
            "злюся"
        ];

        let score = 0;

        for (const word of positive) {
            if (text.includes(word)) {
                score++;
            }
        }

        for (const word of negative) {
            if (text.includes(word)) {
                score--;
            }
        }

        if (score > 0) return "positive";
        if (score < 0) return "negative";

        return "neutral";
    }


    isDirectAddress(text) {

        const name =
            this.brain.data?.character?.identity?.firstName ||
            "Акіра";

        return text.includes(name.toLowerCase());
    }


    containsGreeting(text) {

        return [
            "привіт",
            "вітаю",
            "добрий день",
            "добрий вечір",
            "доброго ранку"
        ].some(word => text.includes(word));
    }


    containsFarewell(text) {

        return [
            "бувай",
            "до побачення",
            "до зустрічі",
            "па-па"
        ].some(word => text.includes(word));
    }


    // =========================================================
    // ЗНАННЯ
    // =========================================================

    getKnowledge(topic) {

        const data =
            this.brain.data?.knowledge?.domains ||
            this.brain.data?.knowledge ||
            {};

        const value = data[topic];

        if (typeof value === "number") {
            return {
                level: value,
                confidence: value
            };
        }

        if (value && typeof value === "object") {

            return {
                level: this.number(value.level, 50),
                confidence: this.number(
                    value.confidence,
                    value.theoretical ?? 50
                ),
                practical: this.number(value.practical, 50),
                theoretical: this.number(value.theoretical, 50),
                explanation: this.number(value.explanation, 50)
            };
        }

        return {
            level: 40,
            confidence: 40,
            practical: 40,
            theoretical: 40,
            explanation: 40
        };
    }


    // =========================================================
    // ІНТЕРЕС
    // =========================================================

    getInterest(topic) {

        const root = this.brain.data?.interests;

        if (!root) {
            return this.defaultInterest();
        }

        const data = root.interests || root;

        const value = data[topic];

        if (typeof value === "number") {
            return {
                interest: value,
                liking: value,
                curiosity: value,
                initiative: value,
                frequency: 50,
                novelty: 50,
                importance: 30
            };
        }

        if (value && typeof value === "object") {

            return {
                interest: this.number(value.interest, 50),
                liking: this.number(value.liking, 50),
                curiosity: this.number(value.curiosity, 50),
                initiative: this.number(value.initiative, 50),
                frequency: this.number(value.frequency, 50),
                novelty: this.number(value.novelty, 50),
                importance: this.number(value.importance, 30),
                knowledge: this.number(value.knowledge, 50)
            };
        }

        return this.defaultInterest();
    }


    defaultInterest() {

        return {
            interest: 50,
            liking: 50,
            curiosity: 50,
            initiative: 50,
            frequency: 50,
            novelty: 50,
            importance: 30
        };
    }


    // =========================================================
    // СТОСУНКИ
    // =========================================================

    getRelationship(context = {}) {

        if (context.relationship) {
            return context.relationship;
        }

        if (context.personId) {

            const relationship =
                this.brain.state?.relationships?.[context.personId];

            if (relationship) {
                return relationship;
            }
        }

        if (this.brain.state?.conversation?.personId) {

            const relationship =
                this.brain.state.relationships?.[
                    this.brain.state.conversation.personId
                ];

            if (relationship) {
                return relationship;
            }
        }

        return {
            type: "unknown",
            closeness: 0,
            trust: 0,
            liking: 0,
            affection: 0,
            familiarity: 0
        };
    }


    // =========================================================
    // ЕМОЦІЇ
    // =========================================================

    getEmotionProfile() {

        if (!this.brain.mood) {
            return {
                values: {},
                dominant: [],
                conflicting: [],
                expression: {},
                modifiers: {}
            };
        }

        return {
            values:
                this.brain.mood.getState?.() || {},

            dominant:
                this.brain.mood.getDominantEmotions?.() || [],

            conflicting:
                this.brain.mood.getConflictingEmotions?.() || [],

            expression:
                this.brain.mood.getExpressionModifier?.() || {},

            modifiers:
                this.brain.mood.getBehaviorModifiers?.() || {}
        };
    }


    // =========================================================
    // ПОТОЧНИЙ СТАН
    // =========================================================

    getCurrentState() {

        return {
            activity:
                this.brain.state?.activity || "idle",

            location:
                this.brain.state?.location || "home",

            energy:
                this.number(
                    this.brain.state?.energy,
                    70
                ),

            fatigue:
                this.number(
                    this.brain.state?.fatigue,
                    20
                ),

            socialEnergy:
                this.number(
                    this.brain.state?.socialEnergy,
                    60
                ),

            boredom:
                this.number(
                    this.brain.state?.boredom,
                    20
                ),

            focus:
                this.number(
                    this.brain.state?.focus,
                    60
                ),

            availability:
                this.brain.state?.availability || "available"
        };
    }


    // =========================================================
    // ОСОБИСТІСТЬ
    // =========================================================

    getPersonality() {

        const data =
            this.brain.data?.personality?.traits ||
            this.brain.data?.personality ||
            {};

        return data;
    }


    // =========================================================
    // УПОДОБАННЯ
    // =========================================================

    getPreferences(topic) {

        const root = this.brain.data?.preferences;

        if (!root) {
            return {};
        }

        const preferences =
            root.preferences ||
            root;

        return preferences[topic] || {};
    }


    // =========================================================
    // ПАМ'ЯТЬ
    // =========================================================

    findRelevantMemory(topic, analysis, context) {

        const memory = this.brain.memory;

        if (!memory) {
            return null;
        }

        if (context.personId) {

            const memories =
                memory.getMemoriesAboutPerson?.(
                    context.personId
                );

            if (memories?.length) {
                return this.chooseMemory(memories);
            }
        }

        if (topic) {

            const memories =
                memory.getMemoriesAboutTopic?.(topic);

            if (memories?.length) {
                return this.chooseMemory(memories);
            }
        }

        return null;
    }


    chooseMemory(memories) {

        if (!Array.isArray(memories) || !memories.length) {
            return null;
        }

        const weighted = memories.map(memory => {

            const importance =
                this.number(memory.importance, 20);

            const strength =
                this.number(memory.strength, 50);

            const emotional =
                this.number(
                    memory.emotionalIntensity,
                    30
                );

            return {
                memory,
                weight:
                    importance * 0.45 +
                    strength * 0.35 +
                    emotional * 0.20
            };
        });

        weighted.sort(
            (a, b) => b.weight - a.weight
        );

        // Пам'ять не повинна автоматично використовуватися
        // кожного разу. Частина спогадів просто не згадується.
        if (Math.random() > 0.72) {
            return null;
        }

        return weighted[0]?.memory || null;
    }


    // =========================================================
    // НОВИЗНА
    // =========================================================

    calculateNovelty(topic, analysis, context) {

        if (!topic) {
            return 50;
        }

        const recent =
            this.history
                .slice(-10)
                .filter(item =>
                    item.profile?.topic === topic
                );

        let novelty = 70;

        novelty -= recent.length * 10;

        if (context.newTopic) {
            novelty += 20;
        }

        return this.clamp(novelty, 0, 100);
    }


    // =========================================================
    // ДОВЖИНА ВІДПОВІДІ
    // =========================================================

    selectResponseLength(profile) {

        const interest =
            profile.interest.interest;

        const curiosity =
            profile.interest.curiosity;

        const knowledge =
            profile.knowledge.level;

        const socialEnergy =
            profile.state.socialEnergy;

        const boredom =
            profile.state.boredom;

        let score = 50;

        score += (interest - 50) * 0.35;
        score += (curiosity - 50) * 0.20;
        score += (knowledge - 50) * 0.15;

        score += (socialEnergy - 50) * 0.20;

        score -= (boredom - 50) * 0.25;

        if (
            profile.analysis.intent === "question"
        ) {
            score += 15;
        }

        if (
            profile.analysis.intent === "thanks" ||
            profile.analysis.intent === "apology"
        ) {
            score -= 20;
        }

        if (score < 30) {
            return "short";
        }

        if (score < 65) {
            return "medium";
        }

        return "long";
    }


    // =========================================================
    // ВИБІР ДІЇ ДІАЛОГУ
    // =========================================================

    selectDialogueAction(profile) {

        const intent = profile.analysis.intent;
        const state = profile.state;
        const emotions = profile.emotions;

        if (
            profile.analysis.containsFarewell ||
            intent === "farewell"
        ) {
            return "endConversation";
        }

        if (
            state.socialEnergy < 15 &&
            intent === "statement" &&
            Math.random() < 0.30
        ) {
            return "staySilent";
        }

        if (
            state.boredom > 80 &&
            profile.interest.interest < 30 &&
            Math.random() < 0.25
        ) {
            return "changeTopic";
        }

        if (
            profile.analysis.containsGreeting
        ) {
            return "answer";
        }

        if (
            intent === "question"
        ) {
            return "answer";
        }

        if (
            intent === "request"
        ) {
            return "answer";
        }

        if (
            intent === "invitation"
        ) {
            return "answer";
        }

        if (
            intent === "thanks" ||
            intent === "apology"
        ) {
            return "answer";
        }

        // Емоційний стан може змінити спосіб відповіді,
        // але не наказує персонажу конкретну репліку.
        if (
            emotions.values?.embarrassment > 70 ||
            emotions.values?.offense > 75
        ) {
            return Math.random() < 0.25
                ? "staySilent"
                : "answer";
        }

        return "answer";
    }


    // =========================================================
    // СКЛАДАННЯ
    // =========================================================

    composeResponse(profile, action) {

        const components = [];

        const templates =
            this.brain.data?.dialogue_templates || {};

        const topicBlock =
            this.getTopicTemplate(profile.topic);

        const emotionalBlock =
            this.getEmotionalTemplate(profile);

        const relationshipBlock =
            this.getRelationshipTemplate(profile);

        const intentBlock =
            this.getIntentTemplate(profile);

        // -----------------------------------------------------
        // Початок
        // -----------------------------------------------------

        if (
            this.shouldUseComponent(
                "opener",
                profile,
                0.45
            )
        ) {

            const opener =
                this.chooseTemplate(
                    templates.openers ||
                    templates.neutralOpeners
                );

            if (opener) {
                components.push(opener);
            }
        }

        // -----------------------------------------------------
        // Основна думка
        // -----------------------------------------------------

        const main =
            this.chooseFromBlocks([
                intentBlock?.main,
                topicBlock?.main,
                topicBlock?.statements,
                relationshipBlock?.main
            ]);

        if (main) {
            components.push(main);
        }

        // -----------------------------------------------------
        // Пояснення
        // -----------------------------------------------------

        if (
            profile.responseLength !== "short" &&
            profile.knowledge.level >= 45 &&
            this.shouldUseComponent(
                "explanation",
                profile,
                profile.responseLength === "long"
                    ? 0.65
                    : 0.35
            )
        ) {

            const explanation =
                this.chooseFromBlocks([
                    topicBlock?.explanations,
                    topicBlock?.details,
                    intentBlock?.explanation
                ]);

            if (explanation) {
                components.push(explanation);
            }
        }

        // -----------------------------------------------------
        // Особиста реакція
        // -----------------------------------------------------

        if (
            profile.interest.interest >= 65 ||
            profile.emotions.dominant.length
        ) {

            if (
                this.shouldUseComponent(
                    "emotionalReaction",
                    profile,
                    0.55
                )
            ) {

                const emotional =
                    this.chooseFromBlocks([
                        emotionalBlock,
                        topicBlock?.reactions,
                        relationshipBlock?.reaction
                    ]);

                if (emotional) {
                    components.push(emotional);
                }
            }
        }

        // -----------------------------------------------------
        // Питання
        // -----------------------------------------------------

        if (
            this.shouldAskQuestion(profile)
        ) {

            const question =
                this.chooseFromBlocks([
                    intentBlock?.questions,
                    topicBlock?.questions,
                    templates.questions
                ]);

            if (question) {
                components.push(question);
            }
        }

        // -----------------------------------------------------
        // Завершення
        // -----------------------------------------------------

        if (
            profile.responseLength !== "short" &&
            this.shouldUseComponent(
                "closing",
                profile,
                0.25
            )
        ) {

            const closing =
                this.chooseTemplate(
                    templates.closings ||
                    templates.transitions
                );

            if (closing) {
                components.push(closing);
            }
        }

        return components;
    }


    // =========================================================
    // ШАБЛОНИ
    // =========================================================

    getTopicTemplate(topic) {

        const data =
            this.brain.data?.dialogue_templates;

        if (!data) {
            return null;
        }

        const topics =
            data.topics ||
            data.topicBlocks ||
            {};

        return topics[topic] || null;
    }


    getEmotionalTemplate(profile) {

        const data =
            this.brain.data?.dialogue_templates;

        if (!data) {
            return null;
        }

        const emotional =
            data.emotional ||
            data.emotions ||
            {};

        const dominant =
            profile.emotions.dominant?.[0];

        if (dominant && emotional[dominant]) {
            return emotional[dominant];
        }

        return emotional.neutral || null;
    }


    getRelationshipTemplate(profile) {

        const data =
            this.brain.data?.dialogue_templates;

        if (!data) {
            return null;
        }

        const relationships =
            data.relationships ||
            {};

        const type =
            profile.relationship?.type ||
            "unknown";

        return (
            relationships[type] ||
            relationships.unknown ||
            null
        );
    }


    getIntentTemplate(profile) {

        const data =
            this.brain.data?.dialogue_templates;

        if (!data) {
            return null;
        }

        const intents =
            data.intents ||
            data.intentBlocks ||
            {};

        return intents[
            profile.analysis.intent
        ] || null;
    }


    chooseFromBlocks(blocks) {

        const valid = blocks.filter(Boolean);

        if (!valid.length) {
            return null;
        }

        const block =
            valid[
                Math.floor(
                    Math.random() * valid.length
                )
            ];

        return this.chooseTemplate(block);
    }


    chooseTemplate(source) {

        if (!source) {
            return null;
        }

        if (typeof source === "string") {
            return source;
        }

        if (!Array.isArray(source)) {
            return null;
        }

        const available =
            source.filter(template =>
                !this.recentTemplates.includes(template)
            );

        const pool =
            available.length
                ? available
                : source;

        if (!pool.length) {
            return null;
        }

        const template =
            pool[
                Math.floor(
                    Math.random() * pool.length
                )
            ];

        this.recentTemplates.push(template);

        if (
            this.recentTemplates.length >
            this.maxRecentTemplates
        ) {
            this.recentTemplates.shift();
        }

        return template;
    }


    // =========================================================
    // ПИТАННЯ
    // =========================================================

    shouldAskQuestion(profile) {

        if (
            profile.responseLength === "short"
        ) {
            return false;
        }

        if (
            profile.analysis.intent === "thanks" ||
            profile.analysis.intent === "apology"
        ) {
            return false;
        }

        const curiosity =
            profile.interest.curiosity;

        const initiative =
            profile.interest.initiative;

        let probability =
            0.10 +
            curiosity / 250 +
            initiative / 400;

        if (
            profile.analysis.intent === "question"
        ) {
            probability += 0.15;
        }

        if (
            profile.state.socialEnergy < 30
        ) {
            probability -= 0.20;
        }

        return Math.random() < probability;
    }


    // =========================================================
    // КОМПОНЕНТИ
    // =========================================================

    shouldUseComponent(
        component,
        profile,
        probability
    ) {

        const config =
            this.brain.data
                ?.dialogue_templates
                ?.composition;

        let chance = probability;

        if (
            config &&
            typeof config[component] === "number"
        ) {
            chance *= config[component];
        }

        if (
            profile.responseLength === "short"
        ) {
            chance *= 0.55;
        }

        return Math.random() < chance;
    }


    // =========================================================
    // ЗМІНА ТЕМИ
    // =========================================================

    composeTopicChange(profile) {

        const templates =
            this.brain.data
                ?.dialogue_templates
                ?.boredom
                ?.changeTopic ||
            this.brain.data
                ?.dialogue_templates
                ?.changeTopic;

        const text =
            this.chooseTemplate(templates) ||
            "До речі, давай про щось інше.";

        return {
            type: "text",
            text,
            action: "changeTopic",
            timestamp: Date.now()
        };
    }


    // =========================================================
    // ЗАВЕРШЕННЯ
    // =========================================================

    composeClosing(profile) {

        const templates =
            this.brain.data
                ?.dialogue_templates
                ?.conversation
                ?.end ||
            this.brain.data
                ?.dialogue_templates
                ?.closings;

        const text =
            this.chooseTemplate(templates) ||
            "Гаразд, до зустрічі.";

        const result = {
            type: "text",
            text,
            action: "endConversation",
            timestamp: Date.now()
        };

        this.recordDialogue(
            profile.input,
            result,
            profile
        );

        return result;
    }


    // =========================================================
    // МОВЧАННЯ
    // =========================================================

    createSilence(reason) {

        const duration =
            800 +
            Math.floor(
                Math.random() * 2200
            );

        return {
            type: "silence",
            text: "",
            duration,
            reason,
            timestamp: Date.now()
        };
    }


    chooseSilenceReason(profile) {

        const reasons = [
            "немає потреби щось додавати",
            "низька соціальна енергія",
            "пауза в розмові",
            "не знайшов доречної відповіді",
            "потреба побути мовчки"
        ];

        if (
            profile.state.socialEnergy < 25
        ) {
            return "низька соціальна енергія";
        }

        if (
            profile.knowledge.level < 25
        ) {
            return "не впевнений, що знає достатньо";
        }

        return reasons[
            Math.floor(
                Math.random() * reasons.length
            )
        ];
    }


    // =========================================================
    // ФІНАЛІЗАЦІЯ
    // =========================================================

    finalizeResponse(parts, profile) {

        let text =
            parts
                .filter(Boolean)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();

        if (!text) {

            text =
                this.fallbackResponse(profile);
        }

        text =
            this.limitWords(
                text,
                this.settings.maxWords
            );

        text =
            this.limitQuestions(
                text,
                this.settings.maxQuestions
            );

        text =
            this.limitEmoji(
                text,
                this.settings.maxEmoji
            );

        if (
            this.settings.avoidImmediateRepeat &&
            this.isImmediateRepeat(text)
        ) {
            text =
                this.fallbackResponse(profile);
        }

        return {
            type: "text",
            text,
            topic: profile.topic,
            intent: profile.analysis.intent,
            responseLength: profile.responseLength,
            timestamp: Date.now()
        };
    }


    fallbackResponse(profile) {

        const templates =
            this.brain.data
                ?.dialogue_templates
                ?.fallback;

        const fallback =
            this.chooseTemplate(templates);

        if (fallback) {
            return fallback;
        }

        if (
            profile.analysis.intent === "question"
        ) {
            return "Не можу зараз дати впевнену відповідь.";
        }

        return "Мм, зрозумів.";
    }


    limitWords(text, maxWords) {

        const words =
            text.split(/\s+/);

        if (words.length <= maxWords) {
            return text;
        }

        return (
            words
                .slice(0, maxWords)
                .join(" ")
                .replace(/[,:;—-]+$/, "") +
            "…"
        );
    }


    limitQuestions(text, maxQuestions) {

        let count = 0;

        return text
            .split(/(?<=[.!?])\s+/)
            .filter(sentence => {

                if (sentence.includes("?")) {
                    count++;

                    if (count > maxQuestions) {
                        return false;
                    }
                }

                return true;
            })
            .join(" ");
    }


    limitEmoji(text, maxEmoji) {

        const emojiRegex =
            /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

        const matches =
            text.match(emojiRegex) || [];

        if (matches.length <= maxEmoji) {
            return text;
        }

        let count = 0;

        return text.replace(
            emojiRegex,
            emoji => {

                count++;

                return count <= maxEmoji
                    ? emoji
                    : "";
            }
        );
    }


    isImmediateRepeat(text) {

        const last =
            this.recentResponses[
                this.recentResponses.length - 1
            ];

        if (!last) {
            return false;
        }

        return (
            last.toLowerCase() ===
            text.toLowerCase()
        );
    }


    // =========================================================
    // ЗАПИС ДІАЛОГУ
    // =========================================================

    recordDialogue(input, response, profile) {

        const record = {
            input,
            response,
            profile: {
                topic: profile.topic,
                intent: profile.analysis.intent,
                responseLength: profile.responseLength,
                relationship:
                    profile.relationship?.type ||
                    "unknown"
            },
            timestamp: Date.now()
        };

        this.history.push(record);

        if (
            this.history.length >
            this.maxHistory
        ) {
            this.history.shift();
        }

        if (response?.text) {

            this.recentResponses.push(
                response.text
            );

            if (
                this.recentResponses.length >
                this.maxRecentResponses
            ) {
                this.recentResponses.shift();
            }
        }

        // Діалог може ставати пам'яттю,
        // але не кожна репліка повинна нею ставати.
        if (
            this.brain.memory &&
            response?.text &&
            profile.topic
        ) {

            if (Math.random() < 0.20) {

                this.brain.memory.recordMemoryEvent?.({
                    type: "conversation",
                    content: response.text,
                    topic: profile.topic,
                    importance: 15,
                    emotionalIntensity:
                        this.getConversationEmotionalIntensity(
                            profile
                        )
                });
            }
        }
    }


    getConversationEmotionalIntensity(profile) {

        const emotions =
            profile.emotions?.values || {};

        const values =
            Object.values(emotions)
                .filter(value =>
                    typeof value === "number"
                );

        if (!values.length) {
            return 20;
        }

        return Math.max(
            10,
            Math.min(
                100,
                Math.max(...values)
            )
        );
    }


    // =========================================================
    // ДОПОМІЖНЕ
    // =========================================================

    number(value, fallback) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }


    clamp(value, min, max) {

        return Math.max(
            min,
            Math.min(max, value)
        );
    }


    getHistory() {
        return [...this.history];
    }


    clearHistory() {

        this.history = [];
        this.recentTemplates = [];
        this.recentResponses = [];
    }
}


// =============================================================
// ЕКСПОРТ
// =============================================================

window.AkiraDialogue = AkiraDialogue;
