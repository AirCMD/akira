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

        // Короткочасний контекст поточної розмови. Потрібен для
        // природних follow-up запитань і реакції на повтор одного питання.
        this.lastIntent = null;
        this.lastIntentAt = 0;
        this.lastNormalizedInput = null;

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

        // Якщо людина щойно поставила те саме змістове питання ще раз,
        // Акіра це помічає. Звертання на ім'я та короткі перевірки стану
        // навмисно не вважаємо настирливим повтором.
        const repeatReply = this.composeRepeatQuestionAnswer(profile);
        if (repeatReply) {
            const finalized = this.finalizeResponse([repeatReply], profile);
            this.recordDialogue(text, finalized, profile);
            this.rememberTurn(profile);
            return finalized;
        }

        // Структуровані наміри обробляємо ДО випадкового вибору діалогової дії.
        // Інакше коректно розпізнана економічна подія могла бути перехоплена
        // changeTopic/staySilent або звичайною темою food.
        const structuredResponse = this.composeStructuredResponse(profile);
        if (structuredResponse) {
            const finalized = this.finalizeResponse(structuredResponse, profile);
            this.recordDialogue(text, finalized, profile);
            this.rememberTurn(profile);
            return finalized;
        }

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
        this.rememberTurn(profile);

        return finalized;
    }


    // =========================================================
    // АНАЛІЗ ПОВІДОМЛЕННЯ
    // =========================================================

    analyzeInput(input) {

        const text = input
            .toLowerCase()
            .replace(/[’`ʼ]/g, "'");

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

        // Питання про самого Акіру мають пріоритет над загальним question.
        // Інакше «як ти?» бачиться лише як слово «як» + знак питання.
        const normalized = String(text || "").toLowerCase().replace(/[’`ʼ]/g, "'").trim();

        // Коротке звертання на ім'я і питання, чи Акіра спить,
        // повинні читати живий стан, а не провалюватися в greeting/topic fallback.
        if (/^(акіра)[\s?!.,]*$/iu.test(normalized)) return "name_ping";
        if (/^(акіра[,!\s]*)?(привіт[,!\s]*)?(ти\s+)?спиш[\s?!.,]*$/iu.test(normalized)) return "ask_sleeping";

        // «Яке кіно ти дивишся?» = поточна дія. «Яке кіно подобається?» = смак.
        if (/^(яке|який|що\s+за)\s+(кіно|фільм)\s+ти\s+(зараз\s+)?дивишся[\s?!.,]*$/iu.test(normalized)) return "ask_current_movie";
        if (/^(яке|які|який|що\s+за)\s+(кіно|фільми?|жанри?\s+кіно)\s+(тобі\s+)?(подобається|подобаються|любиш)[\s?!.,]*$/iu.test(normalized) || /^(які\s+фільми\s+ти\s+любиш)[\s?!.,]*$/iu.test(normalized)) return "ask_movie_preferences";

        const askDatePatterns = [
            /^(який|котрий)\s+сьогодні\s+(день|день\s+тижня|дата)[\s?!.,]*$/iu,
            /^що\s+сьогодні\s+за\s+(день|дата)[\s?!.,]*$/iu,
            /^сьогодні\s+який\s+(день|день\s+тижня)[\s?!.,]*$/iu,
            /^яке\s+сьогодні\s+число[\s?!.,]*$/iu
        ];
        if (askDatePatterns.some(pattern => pattern.test(normalized))) return "ask_date";

        const askHolidayPatterns = [
            /^(яке|який|що\s+за)\s+сьогодні\s+свято[\s?!.,]*$/iu,
            /^сьогодні\s+(геловін|хелловін|новий\s+рік)[\s?!.,]*$/iu,
            /^(коли|скоро)\s+(геловін|хелловін|новий\s+рік)[\s?!.,]*$/iu
        ];
        if (askHolidayPatterns.some(pattern => pattern.test(normalized))) return "ask_holiday";

        const askWeatherPatterns = [
            /^(яка|що\s+за)\s+(сьогодні\s+|зараз\s+)?погода[\s?!.,]*$/iu,
            /^що\s+(там\s+)?(зараз\s+)?(надворі|на\s+вулиці)[\s?!.,]*$/iu,
            /^(зараз\s+)?(дощить|сніжить)[\s?!.,]*$/iu,
            /^яка\s+(зараз\s+)?температура[\s?!.,]*$/iu
        ];
        if (askWeatherPatterns.some(pattern => pattern.test(normalized))) return "ask_weather";

        const askWellbeingPatterns = [
            /^(ну\s+)?як\s+ти[\s?!.,]*$/iu,
            /^(ну\s+)?як\s+(твої|у\s+тебе)\s+справи[\s?!.,]*$/iu,
            /^(ну\s+)?як\s+справи[\s?!.,]*$/iu,
            /^(як|що)\s+ти\s+себе\s+почуваєш[\s?!.,]*$/iu,
            /^як\s+(твій\s+)?настрій[\s?!.,]*$/iu,
            /^ти\s+як[\s?!.,]*$/iu
        ];

        if (askWellbeingPatterns.some(pattern => pattern.test(normalized))) {
            return "ask_state";
        }

        const askActivityPatterns = [
            /^що\s+(ти\s+)?(зараз\s+)?робиш[\s?!.,]*$/iu,
            /^чим\s+(ти\s+)?(зараз\s+)?займаєшся[\s?!.,]*$/iu,
            /^чим\s+зайнятий[\s?!.,]*$/iu,
            /^ти\s+зараз\s+що\s+робиш[\s?!.,]*$/iu
        ];

        if (/^(що|чого)\s+(ти\s+)?(їси|їсиш)[\s?!.,]*$/iu.test(normalized)) return "ask_current_food";
        if (/^(що|чого)\s+(ти\s+)?(п['’ʼ]?єш|пєш)[\s?!.,]*$/iu.test(normalized)) return "ask_current_drink";
        if (/^(що|чого)\s+(ти\s+)?готуєш[\s?!.,]*$/iu.test(normalized)) return "ask_current_cooking";

        if (askActivityPatterns.some(pattern => pattern.test(normalized))) {
            return "ask_activity";
        }

        // Причина поточної реальної дії та найближчі плани.
        if (/^(чому|навіщо|а\s+чому|а\s+навіщо|чого)\s+(ти\s+)?(це\s+)?(робиш|пішов|їдеш|йдеш|готуєш|прибираєш|гуляєш|читаєш|граєш|дивишся|миєш|переш|пилососиш)[\s?!.,]*$/iu.test(normalized) || /^(навіщо|чому)\s*[?!.,]*$/iu.test(normalized)) return "ask_action_reason";
        if (/^(що\s+ти\s+плануєш|які\s+в\s+тебе\s+плани|що\s+будеш\s+робити|що\s+збираєшся\s+робити|є\s+плани)(\s+(сьогодні|на\s+сьогодні))?[\s?!.,]*$/iu.test(normalized)) return "ask_current_plan";

        const identityPatterns = [
            [/^(як\s+тебе\s+звати|як\s+твоє\s+ім['’ʼ]?я|твоє\s+ім['’ʼ]?я)[\s?!.,]*$/iu, "ask_name"],
            [/^(яке\s+твоє\s+прізвище|твоє\s+прізвище)[\s?!.,]*$/iu, "ask_surname"],
            [/^(як\s+тебе\s+звати\s+повністю|яке\s+твоє\s+повне\s+ім['’ʼ]?я)[\s?!.,]*$/iu, "ask_full_name"],
            [/^(скільки\s+тобі\s+років|який\s+твій\s+вік)[\s?!.,]*$/iu, "ask_age"],
            [/^(з\s+якого\s+ти\s+міста|звідки\s+ти\s+родом)[\s?!.,]*$/iu, "ask_hometown"],
            [/^(з\s+якої\s+ти\s+країни|яка\s+твоя\s+країна)[\s?!.,]*$/iu, "ask_country"],
            [/^(де\s+ти\s+живеш|у\s+якому\s+місті\s+ти\s+живеш)[\s?!.,]*$/iu, "ask_residence"],
            [/^(ким\s+(ти\s+)?працюєш|яка\s+в\s+тебе\s+професія|хто\s+ти\s+за\s+професією)[\s?!.,]*$/iu, "ask_occupation"],
            [/^(де\s+ти\s+працюєш|яке\s+твоє\s+місце\s+роботи)[\s?!.,]*$/iu, "ask_workplace"]
        ];
        for (const [pattern, identityIntent] of identityPatterns) {
            if (pattern.test(normalized)) return identityIntent;
        }

        // Follow-up після «я не вдома»: «то де?», «якщо не вдома, то де?»
        // читається з контексту попередньої репліки, а не як нова невідома тема.
        if (/^(якщо\s+не\s+вдома[,\s]+то\s+де|то\s+де|а\s+де|де\s+саме|де\s+ти\s+зараз|ти\s+де|де\s+ти)[\s?!.,]*$/iu.test(normalized)) {
            return "ask_current_location";
        }

        // Біографія та повсякденне життя. Канон з life_profile.json.
        const lifePatterns = [
            [/^(коли\s+в\s+тебе\s+день\s+народження|коли\s+ти\s+народився|яка\s+твоя\s+дата\s+народження)[\s?!.,]*$/iu, "ask_birthday"],
            [/(хто\s+твої\s+батьки|як\s+звати\s+(твоїх\s+|твого\s+)?(батьків|маму|тата|брата)|імен.*(батьк|брат))/iu, "ask_family_names"],
            [/(в\s+тебе\s+є\s+(батьки|брат|сестра)|розкажи\s+про\s+(свою\s+)?сім)/iu, "ask_family"],
            [/(де\s+ти\s+вчився|яка\s+в\s+тебе\s+освіта|на\s+кого\s+ти\s+вчився|що\s+ти\s+закінчив)/iu, "ask_education"],
            [/(де\s+ти\s+зараз\s+вдома|в\s+якій\s+(ти\s+)?(зараз\s+)?кімнаті|де\s+ти\s+в\s+квартирі)/iu, "ask_home_room"],
            [/(скільки\s+в\s+тебе\s+кімнат|розкажи\s+про\s+(свою\s+)?квартир|яка\s+в\s+тебе\s+квартира|де\s+вдома\s+ти\s+любиш)/iu, "ask_home"],
            [/(який\s+у\s+тебе\s+графік|коли\s+ти\s+працюєш|о\s+котрій\s+ти\s+працюєш)/iu, "ask_work_schedule"],
            [/(як\s+ти\s+добираєшся\s+на\s+роботу|скільки\s+тобі\s+їхати\s+на\s+роботу)/iu, "ask_commute"],
            [/(ти\s+любиш\s+свою\s+роботу|як\s+ти\s+ставишся\s+до\s+(своєї\s+)?роботи)/iu, "ask_work_attitude"],
            [/(в\s+тебе\s+є\s+алергі|який\s+у\s+тебе\s+зір|ти\s+часто\s+хворієш)/iu, "ask_health"],
            [/(ти\s+любиш\s+ванну|як\s+часто\s+ти\s+голишся|як\s+ти\s+доглядаєш\s+за\s+собою)/iu, "ask_hygiene"],
            [/(скільки\s+ти\s+знаєш\s+яні|скільки\s+ви\s+з\s+яні\s+разом|що\s+ви\s+з\s+яні\s+робите)/iu, "ask_yani_relationship"],
            [/(про\s+що\s+ти\s+мрієш|яка\s+в\s+тебе\s+мрія|чого\s+ти\s+хочеш\s+досягти)/iu, "ask_dreams"],
            [/(в\s+яких\s+країнах\s+ти\s+був|які\s+країни\s+ти\s+відвідав)/iu, "ask_private_countries"]
        ];
        for (const [pattern, lifeIntent] of lifePatterns) {
            if (pattern.test(normalized)) return lifeIntent;
        }

        // Зовнішність, догляд, одяг і особисті межі.
        // Ці intent-и стоять вище звичайних topics, щоб "волосся" або "родимки"
        // не перехоплювалися випадковою тематичною відповіддю.
        const appearancePatterns = [
            [/^(як\s+ти\s+виглядаєш|опиши\s+(свою\s+)?зовнішність|яка\s+в\s+тебе\s+зовнішність)[\s?!.,]*$/iu, "ask_appearance"],
            [/^(якого\s+кольору\s+в\s+тебе\s+очі|які\s+в\s+тебе\s+очі|який\s+колір\s+твоїх\s+очей)[\s?!.,]*$/iu, "ask_eyes"],
            [/^(яке\s+в\s+тебе\s+волосся|якого\s+кольору\s+в\s+тебе\s+волосся|яка\s+в\s+тебе\s+зачіска)[\s?!.,]*$/iu, "ask_hair"],
            [/^(який\s+у\s+тебе\s+зріст|якого\s+ти\s+зросту|скільки\s+в\s+тобі\s+зросту)[\s?!.,]*$/iu, "ask_height"],
            [/^(яка\s+в\s+тебе\s+статура|яке\s+в\s+тебе\s+тіло)[\s?!.,]*$/iu, "ask_build"],
            [/^(ти\s+любиш\s+(довге|коротке)\s+волосся|яку\s+довжину\s+волосся\s+ти\s+любиш|тобі\s+подобається\s+коротке\s+волосся)[\s?!.,]*$/iu, "ask_hair_preference"],
            [/^(тобі\s+треба\s+підстригтися|ти\s+хочеш\s+підстригтися|коли\s+будеш\s+стригтися)[\s?!.,]*$/iu, "ask_haircut_need"],
            [/^(коли\s+ти\s+(востаннє|останній\s+раз)\s+стригся)[\s?!.,]*$/iu, "ask_last_haircut"],
            [/^(у\s+що\s+ти\s+(зараз\s+)?одягнений|що\s+на\s+тобі\s+(зараз\s+)?одягнено)[\s?!.,]*$/iu, "ask_outfit"],
            [/^(ти\s+(зараз\s+)?у\s+навушниках|в\s+тебе\s+(зараз\s+)?є\s+навушники)[\s?!.,]*$/iu, "ask_earbuds"],
            [/^(що\s+ти\s+вдягнеш\s+на\s+(прогулянку|вулицю)|як\s+ти\s+вдягнешся\s+на\s+(прогулянку|вулицю))[\s?!.,]*$/iu, "ask_outdoor_outfit"],
            [/(родимк.*лоб|лоб.*родимк)/iu, "ask_moles_forehead"],
            [/(родимк.*(щок|облич)|((щок|облич).*родимк))/iu, "ask_moles_cheek"],
            [/^(де\s+в\s+тебе\s+родимки|скільки\s+в\s+тебе\s+родимок|розкажи\s+про\s+(свої\s+)?родимки)[\s?!.,]*$/iu, "ask_moles_general"]
        ];
        for (const [pattern, appearanceIntent] of appearancePatterns) {
            if (pattern.test(normalized)) return appearanceIntent;
        }

        if (/^(чому|а\s+чому|чому\s+ні|чому\s+не\s+хочеш|чому\s+не\s+скажеш|а\s+чому\s+не\s+скажеш)[\s?!.,]*$/iu.test(normalized)) {
            if (this.brain.state?.conversation?.lastPrivateTopic) return "ask_private_why";
            if (this.brain.state?.conversation?.lastBoundaryTopic) return "ask_boundary_why";
        }

        const askFutureActivityPatterns = [
            /^(ти\s+)?(ще\s+)?будеш\s+.*(велосипед|покат|катат|гулят|прогулян)/iu,
            /^(ти\s+)?(плануєш|збираєшся|хочеш)\s+.*(велосипед|покат|катат|гулят|прогулян)/iu
        ];
        if (askFutureActivityPatterns.some(pattern => pattern.test(normalized))) {
            return "ask_future_activity";
        }

        const topicData =
            this.brain.data?.topics?.intentPatterns ||
            this.brain.data?.topics?.intents ||
            {};

        for (const [intent, patterns] of Object.entries(topicData)) {

            if (!Array.isArray(patterns)) {
                continue;
            }

            for (const pattern of patterns) {

                if (typeof pattern === "string") {
                    const normalizedPattern = pattern.toLowerCase().trim();
                    const escaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const matches = normalizedPattern.includes(" ")
                        ? text.includes(normalizedPattern)
                        : new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu").test(text);

                    if (matches) {
                        return intent;
                    }
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

        const knowledgeRoot =
            this.brain.data?.knowledge?.knowledge ||
            this.brain.data?.knowledge ||
            {};

        const data =
            knowledgeRoot.domains ||
            knowledgeRoot ||
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

        const moodState = this.brain.mood.getState?.() || {};

        return {
            values:
                moodState.emotions || moodState.current || {},

            dominant:
                this.brain.mood.getDominantEmotions?.() || moodState.dominant || [],

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
                this.brain.state?.availability || "available",

            action:
                this.brain.state?.action || null,

            needs:
                this.brain.needs?.getState?.() || this.brain.state?.needs || {}
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
    // ВІДПОВІДІ ПРО ВЛАСНИЙ СТАН
    // =========================================================

    composeStateAnswer(profile) {
        const needs = profile.state?.needs || {};
        const emotions = profile.emotions?.values || {};

        const needValue = (name, fallback = 50) => {
            const item = needs[name];
            if (item && typeof item === "object") {
                return this.number(item.value ?? item.current, fallback);
            }
            return this.number(item, fallback);
        };

        const energy = needValue("energy", profile.state?.energy ?? 70);
        const hunger = needValue("hunger", 20);
        const thirst = needValue("thirst", 20);
        const rest = needValue("rest", 60);

        const emotion = name => this.number(emotions[name], 0);

        let pool;

        if (energy <= 20) {
            pool = ["Дуже втомився. Енергії майже немає.", "Якось зовсім без сил зараз."];
        } else if (hunger >= 75) {
            pool = ["Загалом нормально, але я вже добряче голодний.", "Нормально. Тільки їсти хочеться страшенно."];
        } else if (thirst >= 75) {
            pool = ["Нормально, тільки пити вже дуже хочеться.", "Та нічого. Треба б води випити."];
        } else if (emotion("sadness") >= 60 || emotion("disappointment") >= 65) {
            pool = ["Бувало й краще. Настрій сьогодні трохи паршивий.", "Не дуже. Трохи сумно сьогодні."];
        } else if (emotion("anger") >= 60 || emotion("offense") >= 65) {
            pool = ["Якось не дуже. Я зараз трохи злий.", "Не найкращий момент. Дещо мене дратує."];
        } else if (emotion("anxiety") >= 60 || emotion("fear") >= 55) {
            pool = ["Трохи тривожно, якщо чесно. Але тримаюсь.", "Нормально, хоча є якась тривога."];
        } else if (energy <= 40 || rest <= 30) {
            pool = ["Трохи втомився, якщо чесно. А так нормально.", "Нормально. Просто хочеться трохи відпочити."];
        } else if (emotion("joy") >= 65 || emotion("pleasure") >= 65) {
            pool = ["Добре. Навіть настрій сьогодні непоганий.", "Усе добре. Сьогодні я в непоганому настрої."];
        } else if (emotion("calm") >= 60) {
            pool = ["Нормально. Сьогодні якось спокійно.", "Усе гаразд. Досить спокійний день."];
        } else {
            pool = ["Нормально. Потроху.", "Та загалом усе гаразд.", "Непогано. Живу своїм життям."];
        }

        return this.chooseTemplate(pool) || pool[0];
    }


    composeFutureActivityAnswer(profile) {
        const text = String(profile.input || "").toLowerCase();
        const asksCycle = /(велосипед|покат|катат)/u.test(text);
        const asksWalk = /(гулят|прогулян)/u.test(text);
        const hour = Number(this.brain.getKyivHour?.());
        const isNight = Number.isFinite(hour) ? (hour >= 22 || hour < 6) : Boolean(this.brain.isNightInKyiv?.());
        const weather = this.brain.state?.world?.weather || {};
        const condition = String(weather.condition || "");
        const energy = Number(this.brain.state?.needs?.energy ?? this.brain.state?.energy ?? 50);

        if (isNight) {
            if (asksCycle) return "Зараз уже ні. Надворі ніч, тож кататися на велосипеді в такий час я не планую. Краще вже вдень.";
            if (asksWalk) return "Зараз уже ні. Для прогулянки запізно, краще залишу це на день.";
        }

        if (["thunderstorm", "hail", "heavyRain", "heavySnow"].includes(condition)) {
            return asksCycle
                ? "За такої погоди я б зараз на велосипеді не їхав. Краще дочекаюся нормальніших умов."
                : "За такої погоди гуляти особливо не тягне. Краще перечекаю.";
        }

        if (energy < 30) {
            return asksCycle
                ? "Навряд чи зараз. Енергії малувато для велосипеда, спершу краще відпочити."
                : "Може пізніше. Зараз я трохи виснажений для прогулянки.";
        }

        if (asksCycle) return "Можливо. Якщо погода й самопочуття не зіпсуються, вдень я цілком можу покататися.";
        if (asksWalk) return "Можливо. Якщо нічого не завадить, вдень можна буде прогулятися.";
        return "Поки не вирішив. Подивлюся на час, погоду й свій стан.";
    }

    rememberTurn(profile) {
        this.lastIntent = profile?.analysis?.intent || null;
        this.lastIntentAt = Date.now();
        this.lastNormalizedInput = String(profile?.analysis?.normalized || "").trim();
    }

    composeRepeatQuestionAnswer(profile) {
        const intent = profile?.analysis?.intent || null;
        if (!intent || !intent.startsWith("ask_")) return null;
        if (["ask_sleeping", "ask_state", "ask_activity", "ask_current_location"].includes(intent)) return null;
        if (this.lastIntent !== intent || Date.now() - this.lastIntentAt > 90000) return null;
        return this.chooseTemplate([
            "Навіщо ти знову це питаєш?",
            "Я ж щойно на це відповів.",
            "Ти вирішила перевірити, чи моя відповідь змінилася за хвилину?",
            "Знову те саме питання? 🙂"
        ]);
    }

    roomNameLocative(room) {
        if (!room) return null;
        const forms = {
            kitchen: "кухні",
            bathroom: "ванній",
            toilet: "туалеті",
            balcony: "широкому балконі",
            hallway: "коридорі",
            glassBedroom: "скляній спальні",
            cozyRoom: "затишній другій кімнаті",
            spaceRoom: "кімнаті в космічному стилі",
            seaRoom: "кімнаті в морському стилі"
        };
        return forms[room.id] || forms[room.key] || room.locativeName || room.name;
    }

    composeCurrentLocationAnswer() {
        const loc = this.brain.state?.world?.location || "home";
        if (loc === "home") {
            const room = this.brain.dailyLife?.currentRoom?.();
            const roomName = this.roomNameLocative(room);
            return roomName ? `Я вдома, зараз у ${roomName}.` : "Я зараз удома.";
        }
        const places = this.brain.data?.world?.world?.location?.places || {};
        const place = places?.[loc];
        if (loc === "techsmith") return "Я зараз на роботі, у «Техсмітнику».";
        if (place?.name) return `Я зараз у місці «${place.name}».`;
        return "Я зараз не вдома, але точніше місце в мене не зафіксоване.";
    }

    composeMoviePreferencesAnswer() {
        const cinema = this.brain.data?.preferences?.preferences?.cinema || {};
        const likesSlice = Number(cinema.sliceOfLife?.liking || 0) >= 60;
        const likesUnusual = Number(cinema.unusualCinema?.liking || 0) >= 60 || Number(cinema.arthouse?.liking || 0) >= 60;
        const parts = [];
        if (likesSlice) parts.push("повсякденні, атмосферні історії");
        if (likesUnusual) parts.push("незвичайне й трохи дивне кіно");
        if (Number(cinema.drama?.liking || 0) >= 60) parts.push("драми");
        if (Number(cinema.doramas?.liking || 0) >= 60) parts.push("дорами");
        const list = parts.length ? parts.slice(0,4).join(", ") : "незвичайне кіно";
        return `Мені подобаються ${list}. Особливо коли фільм не просто шумить дві години, а залишає після себе якусь думку.`;
    }

    isCurrentlySleeping() {
        const action = this.brain.state?.action;
        if (!action || action.actionId !== "sleep") return false;

        // Sleep is a real running action, not a conversational coin flip.
        // Ignore a stale activity="sleeping" flag if the action has already ended.
        if (action.endsAt && Date.now() >= action.endsAt) return false;
        return true;
    }

    composeSleepingAnswer() {
        if (this.isCurrentlySleeping()) {
            return this.chooseTemplate([
                "Так, сплю.",
                "Сплю. Повідомлення побачив, але ще не прокинувся.",
                "Так. Я зараз сплю, не питай як я тобі відповідаю.",
                "Мгм... сплю.",
                "Сплю. Що сталося?"
            ]);
        }
        return this.chooseTemplate([
            "Ні, не сплю.",
            "Не сплю. Що сталося?",
            "Ні. Я ще не сплю.",
            "Ніт, я тут."
        ]);
    }

    composeNamePingAnswer() {
        if (this.isCurrentlySleeping()) {
            return this.chooseTemplate(["Мм?..", "Що?..", "Я сплю...", "Чого?.. я спав."]);
        }
        return this.chooseTemplate([
            "?",
            "Що?",
            "Чого тобі?",
            "Так, я Акіра. Ти про щось хочеш поговорити?"
        ]);
    }

    composeCurrentMovieAnswer() {
        const action = this.brain.state?.action || {};
        const id = action.actionId || "";
        const title = action.movieTitle || action.filmTitle || action.title || null;
        if (["watchMovie", "watchFilm", "cinema"].includes(id)) {
            return title ? `Зараз дивлюся «${title}».` : "Дивлюся зараз кіно, але назву я не зафіксував.";
        }
        return this.chooseTemplate([
            "Зараз ніяке. Я кіно не дивлюся.",
            "Ніяке зараз не дивлюся.",
            "Зараз я не дивлюся фільм."
        ]);
    }

    composeFoodStateAnswer(kind) {
        const action=this.brain.state?.action||{};
        const food=this.brain.state?.food||{};
        if(kind==="food") {
            if(action.actionId==="eatMeal") return action.mealName ? `Їм ${action.mealName}.` : "Їм зараз.";
            if(action.actionId==="cookMeal") return action.mealName ? `Ще не їм, готую ${action.mealName}.` : "Ще не їм, готую собі щось.";
            return "Зараз нічого не їм.";
        }
        if(kind==="drink") {
            if(action.actionId==="drinkSelected") return action.drinkName ? `П'ю ${action.drinkName}.` : "П'ю щось.";
            if(action.actionId==="prepareDrink") return action.drinkName ? `Зараз готую собі ${action.drinkName}.` : "Готую собі щось випити.";
            return "Зараз нічого не п'ю.";
        }
        if(action.actionId==="cookMeal") return action.mealName ? `Готую ${action.mealName}.` : "Готую собі їсти.";
        return "Зараз нічого не готую.";
    }

    composeActivityAnswer(profile) {
        const action = profile.state?.action;
        const id = action?.actionId || "";

        if (id === "moveRoom") {
            const destination = action?.targetRoomPhrase || "іншу кімнату";
            const prefix = String(destination).startsWith("на ") ? "" : "в ";
            return this.chooseTemplate([
                `Йду ${prefix}${destination}.`,
                `Переходжу зараз ${prefix}${destination}.`,
                `Та йду ${prefix}${destination}.`
            ]);
        }

        const names = {
            sleep: "Сплю. Хоча якщо я тобі відповідаю, то вже не дуже переконливо.",
            eat: "Їм зараз.",
            drink: "Вирішив щось випити.",
            rest: "Відпочиваю трохи.",
            walk: "Гуляю.",
            cycle: "Катаюся на велосипеді.",
            read: "Читаю зараз.",
            listenToMusic: "Слухаю музику.",
            playGame: "Граю трохи.",
            work: "Працюю зараз.",
            talkToSomeone: "Розмовляю з людьми.",
            talkToYani: "Розмовляю з Яні.",
            checkSocialNetwork: "Перевіряю соцмережі.",
            writePost: "Пишу допис.",
            think: "Та думаю про всяке.",
            organizeDesk: "Трохи прибираю на столі.",
            commuteToWork: "Їду на роботу.",
            commuteHome: "Їду додому.",
            washFace: "Умиваюся.",
            shave: "Голюся перед дзеркалом.",
            changeClothes: "Перевдягаюся.",
            doLaundry: "Займаюся пранням.",
            startLaundry: "Завантажую брудну білизну в пральну машину.",
            takeLaundryOut: "Дістаю випрану білизну з машинки.",
            hangLaundry: "Розвішую мокру білизну.",
            foldLaundry: "Складаю суху білизну.",
            wipeDust: "Витираю пил.",
            vacuumRoom: "Пилосошу кімнату.",
            mopFloor: "Мию підлогу.",
            washWindows: "Мию вікна.",
            takeBath: "Приймаю ванну.",
            cookMeal: action?.mealName ? `Готую ${action.mealName}.` : "Готую собі їсти.",
            eatMeal: action?.mealName ? `Їм ${action.mealName}.` : "Їм зараз.",
            prepareDrink: action?.drinkName ? `Готую собі ${action.drinkName}.` : "Готую щось випити.",
            drinkSelected: action?.drinkName ? `П'ю ${action.drinkName}.` : "П'ю щось.",
            washDishes: "Мию посуд.",
            travelToMassmarket: "Йду в масмаркет по продукти.",
            groceryShopping: "Купую продукти в масмаркеті.",
            returnHomeGroceries: "Повертаюся додому з продуктами.",
            watchStreamer: "Дивлюся стрім або огляд.",
            travelToLeisure: action?.destinationName ? `Їду зараз у ${action.destinationName}.` : "Кудись вибрався з дому.",
            returnHomeLeisure: "Повертаюся додому.",
            visitMuseum: "Я зараз у музеї.",
            visitPlanetarium: "Я зараз у планетарії.",
            visitTheatre: "Я зараз у театрі.",
            visitConcert: "Я зараз на концерті.",
            goToCinema: "Я зараз у кіно."
        };

        if (id && names[id]) {
            return names[id];
        }

        const activity = profile.state?.activity;
        if (activity && activity !== "idle") {
            return `Зараз я зайнятий: ${activity}.`;
        }

        // idle означає саме відсутність конкретної дії. Не вигадуємо
        // «відпочиваю», якщо мозок не виконує action=rest.
        return this.chooseTemplate([
            "Та нічим конкретним зараз.",
            "Поки нічим особливим не зайнятий.",
            "Зараз нічим конкретним не займаюся."
        ]);
    }


    composeWeatherAnswer() {
        const weather = this.brain.state?.world?.weather;
        if (!weather) return "Я щось не звернув уваги на погоду.";
        const noticed = this.brain.state?.weatherPerception?.noticed;
        // Пряме питання змушує Акіру подивитися/уточнити поточний стан світу,
        // але сама погода від питання не генерується.
        if (!noticed) {
            this.brain.state.weatherPerception = {type:"weatherChecked", time:Date.now(), condition:weather.condition, temperature:weather.temperature, noticed:true};
        }
        return this.brain.weather?.describe?.(weather) || `Зараз близько ${weather.temperature} °C.`;
    }

    composeDateAnswer() {
        const info = this.brain.calendar?.sync?.() || this.brain.state?.calendar || {};
        const now = new Date();
        const weekdays = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п’ятниця", "субота"];
        const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
        let text = `Сьогодні ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} року, ${weekdays[now.getDay()]}.`;
        if (info.holiday) text += ` Сьогодні ${this.brain.calendar.getHolidayName(info.holiday)}.`;
        else if (info.isWeekend) text += " У мене вихідний день.";
        return text;
    }

    composeHolidayAnswer(profile) {
        const info = this.brain.calendar?.sync?.() || this.brain.state?.calendar || {};
        const text = profile.analysis.normalized;
        if (info.holiday) return `Сьогодні ${this.brain.calendar.getHolidayName(info.holiday)}.`;

        const target = text.includes("геловін") || text.includes("хелловін") ? {id:"halloween", month:10, day:31, name:"Геловін"}
            : text.includes("новий рік") ? {id:"newYear", month:1, day:1, name:"Новий рік"} : null;
        if (target) {
            const now = new Date();
            let next = new Date(now.getFullYear(), target.month - 1, target.day);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (next < today) next = new Date(now.getFullYear() + 1, target.month - 1, target.day);
            const days = Math.round((next - today) / 86400000);
            if (days === 0) return `Так, сьогодні ${target.name}.`;
            if (/^сьогодні/u.test(text)) return `Ні, сьогодні не ${target.name}.`;
            return `До ${target.name === "Новий рік" ? "Нового року" : "Геловіну"} ще ${days} дн.`;
        }
        if (info.tomorrowHoliday) return `Сьогодні звичайний день, а завтра ${this.brain.calendar.getHolidayName(info.tomorrowHoliday)}.`;
        return "Сьогодні в моєму календарі немає окремого свята.";
    }

    // =========================================================
    // СКЛАДАННЯ
    // =========================================================

    composeIdentityAnswer(intent) {
        const character = this.brain.data?.character?.identity || {};
        const residence = character.residence || {};
        const world = this.brain.data?.world?.world || this.brain.data?.world || {};
        const schedule = world.workSchedule || {};
        const locations = world.location?.locations || world.locations || {};
        const workplaceId = schedule.workplace;
        const workplaceName = locations?.[workplaceId]?.name || workplaceId || null;
        const occupation = schedule.position || null;

        switch (intent) {
            case "ask_name":
                return character.firstName ? `Мене звати ${character.firstName}.` : "У моєму профілі ім'я поки не задане.";
            case "ask_surname":
                return character.lastName ? `Моє прізвище — ${character.lastName}.` : "У моєму профілі прізвище поки не задане.";
            case "ask_full_name":
                return character.fullName ? `Мене звати ${character.fullName}.` : (character.firstName ? `Мене звати ${character.firstName}.` : "Повне ім'я в моєму профілі поки не задане.");
            case "ask_age": {
                const age = character.age;
                if (age !== null && age !== undefined && age !== "" && Number.isFinite(Number(age))) return `Мені ${Number(age)} років.`;
                if (character.birthDate) {
                    const born = new Date(character.birthDate);
                    if (!Number.isNaN(born.getTime())) {
                        const now = new Date();
                        let years = now.getFullYear() - born.getFullYear();
                        const beforeBirthday = now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
                        if (beforeBirthday) years -= 1;
                        const map = character.birthDatePrivacy?.digitMap || {};
                        const encodedYears = [...String(years)].map(ch => map[ch] || ch).join("");
                        return character.birthDatePrivacy?.displayMode === "encoded"
                            ? `Мені ${encodedYears} років.`
                            : `Мені ${years} років.`;
                    }
                }
                return "Мій вік у профілі поки не заданий.";
            }
            case "ask_country":
                return residence.country ? `Я живу в країні ${residence.country}.` : "Країна в моєму профілі поки не задана.";
            case "ask_residence":
                return residence.city ? `Я живу в місті ${residence.city}.` : "Місце проживання в моєму профілі поки не задане.";
            case "ask_hometown":
                if (character.hometown?.city) return `Я родом з міста ${character.hometown.city}.`;
                if (character.hometown) return `Я родом з ${character.hometown}.`;
                return "Місто, звідки я родом, у моєму профілі поки не задане.";
            case "ask_occupation":
                return occupation ? `За професією я ${occupation}.` : "Моя професія в профілі поки не задана.";
            case "ask_workplace":
                return workplaceName ? `Я працюю в «${workplaceName}».` : "Місце роботи в профілі поки не задане.";
            default:
                return null;
        }
    }

    composeLifeAnswer(intent) {
        const life = this.brain.data?.life_profile?.lifeProfile || {};
        const character = this.brain.data?.character?.identity || {};
        const encodeDate = () => {
            const map = character.birthDatePrivacy?.digitMap || {};
            const raw = "27.05.1995";
            return [...raw].map(ch => map[ch] || ch).join("");
        };
        switch (intent) {
            case "ask_birthday":
                return `Дата? ${encodeDate()}. Розбирайся самостійно.`;
            case "ask_family_names": {
                const pool = life.family?.privacy?.responses || ["Імена моїх близьких людей — це особисте."];
                this.brain.state.conversation = this.brain.state.conversation || {};
                this.brain.state.conversation.lastPrivateTopic = "family_names";
                this.brain.state.conversation.lastPrivateAt = Date.now();
                return pool[Math.floor(Date.now() / 86400000) % pool.length];
            }
            case "ask_private_why": {
                const topic = this.brain.state?.conversation?.lastPrivateTopic;
                if (topic === "family_names") return this.chooseTemplate([
                    "Бо імена моїх близьких людей — це особисте.",
                    "Не хочу називати імена близьких. Нехай це залишиться особистим.",
                    "Бо це вже їхня приватність, не тільки моя.",
                    "Таємниця. Родинний архів з іменами, мабуть, знову з’їв кіт."
                ]);
                if (topic === "visited_countries") return this.chooseTemplate([
                    "Бо не хочу про це розповідати. Нехай залишиться секретом.",
                    "Не скажу. Мені подобається залишати деякі речі при собі."
                ]);
                return "Не хочу про це розповідати. Це особисте.";
            }
            case "ask_family":
                return "У мене є батьки й старший брат. Батьки живуть у сусідньому місті. Ми рідко телефонуємо одне одному, переважно на свята. Пам’ятаю, як ми з татом і братом ходили на рибалку о шостій ранку.";
            case "ask_education":
                return "У мене повна вища освіта, я ІТ-фахівець. Ще проходив курси масажу та малювання картин.";
            case "ask_home":
                return "У нас із Яні чотирикімнатна квартира в Теріяківському районі. Є широкий балкон, кімнати в космічному й морському стилях. Найбільше люблю другу кімнату — вона затишна.";
            case "ask_home_room": {
                if (this.brain.state?.world?.location !== "home") return this.chooseTemplate([
                    "Я зараз не вдома.",
                    "Я зараз не вдома 🙂",
                    "У жодній. Я ж зараз не вдома 🙂"
                ]);
                const room = this.brain.dailyLife?.currentRoom?.();
                const roomName = this.roomNameLocative(room);
                return roomName ? `Я зараз у ${roomName}.` : "Я вдома, але конкретну кімнату зараз не відмітив.";
            }
            case "ask_current_location":
                return this.composeCurrentLocationAnswer();
            case "ask_work_schedule":
                return "Працюю з понеділка по п’ятницю, з 10:00 до 16:00. Субота й неділя — вихідні.";
            case "ask_commute":
                return "До роботи приблизно 45 хвилин: метро до станції «Сутінки», потім 25-й тролейбус, три зупинки.";
            case "ask_work_attitude":
                return "Ставлюся до роботи як до способу заробляти гроші. Робота мені не сім’я, хоча до колег я вже звик.";
            case "ask_health":
                return "Зір у мене нормальний, є алергія на пил. Хворію рідко, а спеку й холод не дуже люблю.";
            case "ask_hygiene":
                return "Душ — нормально, але ванну я люблю більше, особливо з бомбочками, ароматизаторами й морською сіллю. Умиваюся щодня, голюся приблизно раз на два дні.";
            case "ask_yani_relationship":
                return "Я знаю Яні близько семи років, а разом ми п’ять. Можемо малювати, грати, валяти дурня або годинами говорити про спогади й філософські штуки.";
            case "ask_dreams":
                return "Хочу побачити світ, подорожувати, відкривати велосипедні маршрути й фотографувати побачене. І ще хочу стати програмістом високого рівня.";
            case "ask_private_countries":
                this.brain.state.conversation = this.brain.state.conversation || {};
                this.brain.state.conversation.lastPrivateTopic = "visited_countries";
                this.brain.state.conversation.lastPrivateAt = Date.now();
                return "У двох країнах був. У яких саме — не скажу. Секрет.";
            default:
                return null;
        }
    }

    composeAppearanceAnswer(intent, profile) {
        const identity = this.brain.data?.character?.identity || {};
        const appearance = identity.appearance || {};
        const appearanceEngine = this.brain.appearance;
        const appearanceData = this.brain.data?.appearance?.appearance || {};
        const hairStatus = appearanceEngine?.getHairStatus?.() || {};
        const outfit = appearanceEngine?.getOutfit?.() || null;

        const setBoundary = (topic) => {
            this.brain.state.conversation.lastBoundaryTopic = topic;
            this.brain.state.conversation.lastBoundaryAt = Date.now();
        };
        const clearBoundary = () => {
            if (intent !== "ask_boundary_why") {
                this.brain.state.conversation.lastBoundaryTopic = null;
                this.brain.state.conversation.lastBoundaryAt = null;
            }
        };
        const boundaryReply = (topic) => {
            setBoundary(topic);
            const cfg = appearanceData.boundaries?.[topic] || {};
            const emotions = profile?.emotions?.values || {};
            const fatigue = Number(profile?.state?.fatigue || 0);
            const irritated = Number(emotions.irritation || emotions.anger || 0) >= 45;
            const pool = irritated ? (cfg.irritated || cfg.neutral) : fatigue >= 65 ? (cfg.tired || cfg.neutral) : cfg.neutral;
            if (!Array.isArray(pool) || !pool.length) return "Я не хочу обговорювати цю частину моєї зовнішності.";
            const repeat = this.brain.state.conversation.boundaryRepeatCount || 0;
            this.brain.state.conversation.boundaryRepeatCount = repeat + 1;
            return pool[Math.min(repeat, pool.length - 1) % pool.length];
        };

        if (intent === "ask_boundary_why") {
            const topic = this.brain.state?.conversation?.lastBoundaryTopic;
            if (!topic) return null;
            const reasons = appearanceData.boundaryReason || ["Моя зовнішність не предмет для обговорень."];
            return reasons[0] || "Моя зовнішність не предмет для обговорень.";
        }
        if (intent === "ask_moles_forehead") return boundaryReply("moles_forehead");
        if (intent === "ask_moles_cheek") return boundaryReply("moles_cheek");
        if (intent === "ask_moles_general") {
            setBoundary("moles_general");
            return "Я не хочу обговорювати мої родимки.";
        }

        clearBoundary();
        switch (intent) {
            case "ask_appearance":
                return `Я худої статури, зростом ${appearance.heightCm || 182} см. У мене блакитні очі й коротке чорне волосся.`;
            case "ask_eyes":
                return appearance.eyes?.color ? `У мене ${appearance.eyes.color === "блакитний" ? "блакитні" : appearance.eyes.color} очі.` : null;
            case "ask_hair":
                return "У мене чорне коротке волосся. Я не люблю заростати.";
            case "ask_height":
                return appearance.heightCm ? `Мій зріст — ${appearance.heightCm} см.` : null;
            case "ask_build":
                return "Я худої статури.";
            case "ask_hair_preference":
                return "Я надаю перевагу короткому волоссю. Не люблю заростати, тому намагаюся вчасно стригтися.";
            case "ask_haircut_need":
                if (hairStatus.wantsHaircut) return "Схоже, вже час підстригтися. Я не люблю, коли волосся відростає занадто сильно.";
                if (hairStatus.currentLength === "growing") return "Волосся вже трохи відросло, але поки не критично. Я все одно довго заростати не люблю.";
                return "Поки ні. Волосся ще достатньо коротке.";
            case "ask_last_haircut":
                return hairStatus.lastHaircutDate ? `Останній раз я стригся ${hairStatus.lastHaircutDate}.` : "Я не пам'ятаю точної дати останньої стрижки.";
            case "ask_earbuds":
                return this.brain.state.appearance?.earbuds ? "Так, зараз у мене у вухах чорні навушники-краплі." : "Ні, зараз я без навушників.";
            case "ask_outfit": {
                if (!outfit) return "Зараз я не можу точно сказати, у що одягнений.";
                const parts=[];
                if (outfit.outerwear) parts.push(`${outfit.outerwear.color} ${outfit.outerwear.type} з капюшоном`);
                if (outfit.sweater) parts.push(`${outfit.sweater.color} светр${outfit.sweater.print ? " з принтом" : ""}`);
                if (!parts.length) return "Зараз я вдома, тому одягнувся просто й зручно.";
                return `Зараз на мені ${parts.join(" і ")}.`;
            }
            case "ask_outdoor_outfit": {
                const weather=this.brain.state.world?.weather || {};
                const temp=Number(weather.temperature ?? 18);
                if (temp <= 16) return "Якщо піду надвір, вдягну светр і коричневу куртку з капюшоном. У прохолодну погоду мені так зручніше.";
                return "Якщо піду надвір, вдягну щось легше й зручне. До конкретних кольорів я не прив'язаний.";
            }
            default: return null;
        }
    }

    analyzeEconomicMessage(text = "") {
        // Резервний parser у dialogue: structured routing не залежить від того,
        // чи встиг/зміг ініціалізуватися модуль opinions.
        if (this.brain.opinions?.analyzeMessage) return this.brain.opinions.analyzeMessage(text);
        const normalized = String(text).toLowerCase().replace(/[’`ʼ]/g, "'").replace(/\s+/g, " ").trim();
        let topic = null;
        if (/(доставк|кур'єр)/u.test(normalized)) topic = "delivery_prices";
        else if (/(транспорт|проїзд|метро|автобус|трамва|тролейб)/u.test(normalized)) topic = "transport_prices";
        else if (/(їж|продукт|харч)/u.test(normalized)) topic = "food_prices";
        else if (/(комунал|опален|електроенерг|тариф)/u.test(normalized)) topic = "utilities_prices";
        const opinionRequest = /(що\s+(ти\s+)?думаєш|як\s+ти\s+ставишся|твоя\s+думка|що\s+скажеш)/u.test(normalized);
        let eventKind = null;
        if (/(підвищ|піднял|подорожч|зросл|виросл|дорожч)/u.test(normalized)) eventKind = "priceIncrease";
        else if (/(зниз|зменш|здешев|подешев|дешевш)/u.test(normalized)) eventKind = "priceDecrease";
        return { normalized, topic, opinionRequest, eventKind };
    }

    composeActionReasonAnswer(profile) {
        const action = this.brain.state?.action || null;
        const actionId = action?.actionId || null;
        const reason = this.brain.intentions?.getWhy?.();

        // Відсутність активної дії не є секретом. Не дозволяємо generic/private
        // fallback вигадувати таємничу причину для звичайного idle.
        if (!action || actionId === "idle") {
            return this.chooseTemplate([
                "Та просто нічим зараз не зайнятий.",
                "Нічого особливого. Просто зараз немає конкретної справи.",
                "Так вийшло. Поки нічим конкретним не займаюся.",
                "Нічого не планував на цей момент, тому просто байдикую."
            ]);
        }

        if (reason) {
            return `Бо ${String(reason).replace(/[.!?]+$/u, "")}.`;
        }

        return this.chooseTemplate([
            "Та без якоїсь особливої причини. Просто зараз цим займаюся.",
            "Особливої причини немає. Просто так склалося.",
            "Не знаю, тут немає якоїсь окремої причини."
        ]);
    }

    composeStructuredResponse(profile) {
        // Запити, що читають живий стан, не повинні залежати від випадкового
        // dialogue action. Те саме стосується економічних подій/opinions.
        const intent = profile.analysis.intent;
        if (intent === "name_ping") return [this.composeNamePingAnswer(profile)];
        if (intent === "ask_sleeping") return [this.composeSleepingAnswer(profile)];
        if (intent === "ask_current_movie") return [this.composeCurrentMovieAnswer(profile)];
        if (intent === "ask_movie_preferences") return [this.composeMoviePreferencesAnswer(profile)];
        if (intent === "ask_current_location") return [this.composeCurrentLocationAnswer(profile)];
        if (intent === "ask_date") return [this.composeDateAnswer(profile)];
        if (intent === "ask_holiday") return [this.composeHolidayAnswer(profile)];
        if (intent === "ask_weather") return [this.composeWeatherAnswer(profile)];
        if (intent === "ask_state") return [this.composeStateAnswer(profile)];
        if (intent === "ask_current_food") return [this.composeFoodStateAnswer("food")];
        if (intent === "ask_current_drink") return [this.composeFoodStateAnswer("drink")];
        if (intent === "ask_current_cooking") return [this.composeFoodStateAnswer("cooking")];
        if (intent === "ask_activity") return [this.composeActivityAnswer(profile)];
        if (intent === "ask_action_reason") {
            return [this.composeActionReasonAnswer(profile)];
        }
        if (intent === "ask_current_plan") {
            const plan = this.brain.intentions?.getNextPlan?.();
            if (!plan) return ["Поки нічого конкретного не запланував."];
            const goal = this.brain.intentions?.planGoal?.(plan) || plan.actionId;
            return [`Планую ${goal} приблизно о ${plan.time}.`];
        }
        if (intent === "ask_future_activity") return [this.composeFutureActivityAnswer(profile)];
        if (["ask_birthday","ask_family_names","ask_family","ask_education","ask_home","ask_home_room","ask_current_location","ask_work_schedule","ask_commute","ask_work_attitude","ask_health","ask_hygiene","ask_yani_relationship","ask_dreams","ask_private_countries","ask_private_why"].includes(intent)) {
            const lifeReply = this.composeLifeAnswer(intent);
            if (lifeReply) return [lifeReply];
        }
        if (["ask_appearance","ask_eyes","ask_hair","ask_height","ask_build","ask_hair_preference","ask_haircut_need","ask_last_haircut","ask_outfit","ask_earbuds","ask_outdoor_outfit","ask_moles_forehead","ask_moles_cheek","ask_moles_general","ask_boundary_why"].includes(intent)) {
            const appearanceReply = this.composeAppearanceAnswer(intent, profile);
            if (appearanceReply) return [appearanceReply];
        }
        if (intent.startsWith("ask_") && ["ask_name","ask_surname","ask_full_name","ask_age","ask_hometown","ask_country","ask_residence","ask_occupation","ask_workplace"].includes(intent)) {
            const identityReply = this.composeIdentityAnswer(intent);
            if (identityReply) return [identityReply];
        }

        const opinionAnalysis = this.analyzeEconomicMessage(profile.input);
        if (opinionAnalysis?.opinionRequest && opinionAnalysis.topic) {
            const reply = opinionAnalysis.eventKind
                ? this.brain.opinions.describeChangeOpinion?.(opinionAnalysis)
                : this.brain.opinions.describeOpinion?.(profile.input);
            return reply ? [reply] : null;
        }
        if (opinionAnalysis?.eventKind && opinionAnalysis.topic) {
            const reaction = this.brain.opinions.reactToText?.(profile.input);
            const reply = this.brain.opinions.describeReaction?.(reaction);
            return reply ? [reply] : null;
        }
        return null;
    }

    composeResponse(profile, action) {

        const components = [];

        const templates = this.getDialogueTemplates();
        const conversation =
            this.brain.data?.language?.conversation || {};

        // Питання про поточний стан відповідають з живого стану мозку,
        // а не з випадкового fallback-шаблону.
        if (profile.analysis.intent === "name_ping") return [this.composeNamePingAnswer(profile)];
        if (profile.analysis.intent === "ask_sleeping") return [this.composeSleepingAnswer(profile)];
        if (profile.analysis.intent === "ask_current_movie") return [this.composeCurrentMovieAnswer(profile)];
        if (profile.analysis.intent === "ask_movie_preferences") return [this.composeMoviePreferencesAnswer(profile)];
        if (profile.analysis.intent === "ask_current_location") return [this.composeCurrentLocationAnswer(profile)];
        if (profile.analysis.intent === "ask_date") {
            return [this.composeDateAnswer(profile)];
        }

        if (profile.analysis.intent === "ask_holiday") {
            return [this.composeHolidayAnswer(profile)];
        }

        if (profile.analysis.intent === "ask_weather") {
            return [this.composeWeatherAnswer(profile)];
        }

        if (profile.analysis.intent === "ask_state") {
            return [this.composeStateAnswer(profile)];
        }

        if (profile.analysis.intent === "ask_current_food") return [this.composeFoodStateAnswer("food")];
        if (profile.analysis.intent === "ask_current_drink") return [this.composeFoodStateAnswer("drink")];
        if (profile.analysis.intent === "ask_current_cooking") return [this.composeFoodStateAnswer("cooking")];
        if (profile.analysis.intent === "ask_activity") {
            return [this.composeActivityAnswer(profile)];
        }
        if (profile.analysis.intent === "ask_action_reason") {
            return [this.composeActionReasonAnswer(profile)];
        }
        if (profile.analysis.intent === "ask_current_plan") {
            const plan = this.brain.intentions?.getNextPlan?.();
            if (!plan) return ["Поки нічого конкретного не запланував."];
            const goal = this.brain.intentions?.planGoal?.(plan) || plan.actionId;
            return [`Планую ${goal} приблизно о ${plan.time}.`];
        }

        if (profile.analysis.intent === "ask_future_activity") {
            return [this.composeFutureActivityAnswer(profile)];
        }

        // Питання про думку лише читає накопичене ставлення. Воно не повинно
        // саме по собі вважатися новою подією й повторно змінювати attitude.
        if (this.brain.opinions?.isOpinionQuestion?.(profile.input)) {
            const opinionReply = this.brain.opinions.describeOpinion?.(profile.input);
            if (opinionReply) return [opinionReply];
        }

        // Побутові суспільні/економічні події оцінюються через власні
        // цінності та особистий вплив, а не через наперед задану політичну позицію.
        const opinionReaction = this.brain.opinions?.reactToText?.(profile.input);
        if (opinionReaction) {
            const reply = this.brain.opinions.describeReaction(opinionReaction);
            if (reply) return [reply];
        }

        // Базові соціальні репліки мають реагувати безпосередньо
        // на зміст повідомлення, а не провалюватися у fallback.
        if (profile.analysis.containsGreeting) {
            const greeting = this.chooseTemplate(conversation.greetings);
            if (greeting) return [greeting];
        }

        if (profile.analysis.intent === "thanks") {
            const reply = this.chooseTemplate(
                conversation.responsesToThanks || [
                    "Будь ласка.",
                    "Та нема за що.",
                    "Радий, що допоміг.",
                    "Звертайся."
                ]
            );
            if (reply) return [reply];
        }

        if (profile.analysis.intent === "apology") {
            const apologyBlock = templates.apology;
            const reply = this.chooseFromBlocks([
                apologyBlock?.accept,
                conversation.apology
            ]);
            if (reply) return [reply];
        }

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
                    templates.neutralOpeners ||
                    templates.neutral?.openers
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
                    templates.transitions ||
                    templates.neutral?.closings ||
                    templates.neutral?.transitions
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

    getDialogueTemplates() {

        const root = this.brain.data?.dialogue_templates || {};
        return root.dialogueTemplates || root;
    }


    getTopicTemplate(topic) {

        const data = this.getDialogueTemplates();

        if (!data) {
            return null;
        }

        const topics =
            data.topics ||
            data.topicBlocks ||
            data;

        const block = topics[topic];
        if (!block || typeof block !== "object") {
            return null;
        }

        // Старі JSON-блоки використовують observation/opinion/knowledge/question,
        // тоді як рушій очікує main/explanations/questions. Нормалізуємо обидві схеми.
        return {
            ...block,
            main: block.main || block.opinion || block.observation || block.knowledge,
            statements: block.statements || block.observation || block.opinion,
            explanations: block.explanations || block.knowledge,
            details: block.details || block.knowledge,
            reactions: block.reactions || block.opinion,
            questions: block.questions || block.question
        };
    }


    getEmotionalTemplate(profile) {

        const data = this.getDialogueTemplates();

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

        const data = this.getDialogueTemplates();

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

        const data = this.getDialogueTemplates();

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
            this.getDialogueTemplates()?.composition;

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

        const dialogueTemplates = this.getDialogueTemplates();
        const templates =
            dialogueTemplates?.boredom?.changeTopic ||
            dialogueTemplates?.changeTopic;

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

        const dialogueTemplates = this.getDialogueTemplates();
        const templates =
            dialogueTemplates?.conversation?.end ||
            this.brain.data?.language?.conversation?.farewells ||
            dialogueTemplates?.neutral?.closings ||
            dialogueTemplates?.closings;

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

    isLiveStateIntent(intent) {
        return [
            "ask_sleeping",
            "ask_state",
            "ask_activity",
            "ask_action_reason",
            "ask_current_location",
            "ask_current_movie"
        ].includes(intent);
    }

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

        // Для запитів про живий стан повтор тієї самої правдивої відповіді
        // кращий за випадковий fallback. Інакше п'яте «спиш?» раптом
        // перетворювалося на «Щось я втратив нитку».
        if (
            this.settings.avoidImmediateRepeat &&
            this.isImmediateRepeat(text) &&
            !this.isLiveStateIntent(profile?.analysis?.intent)
        ) {
            text = this.fallbackResponse(profile);
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

        const dialogueTemplates = this.getDialogueTemplates();
        const templates =
            dialogueTemplates?.fallback ||
            dialogueTemplates?.confusion?.short ||
            this.brain.data?.language?.conversation?.confusion;

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

                this.brain.memory.remember?.({
                    type: "conversation",
                    title: `Розмова: ${profile.topic}`,
                    content: response.text,
                    topics: [profile.topic],
                    people: profile.personId ? [profile.personId] : [],
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
