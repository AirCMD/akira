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

        // v41.1: повідомлення спочатку може викликати емоційну реакцію.
        // Після цього профіль відповіді читає вже актуальний стан.
        this.brain.emotionalExpression?.reactToInput?.(analysis, context);

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
        const normalized = String(text || "").toLowerCase().replace(/[’`ʼ]/g, "'").replace(/^[«»„“”"\s]+/u, "").trim();

        // Коротке звертання на ім'я і питання, чи Акіра спить,
        // повинні читати живий стан, а не провалюватися в greeting/topic fallback.
        if (/^(акіра)[\s?!.,]*$/iu.test(normalized)) return "name_ping";
        if (/^(акіра[,!\s]*)?(привіт[,!\s]*)?(ти\s+)?спиш[\s?!.,]*$/iu.test(normalized)) return "ask_sleeping";


        // v45: живі питання про календар/час/місце мають одне джерело істини.
        if (/^добр(ого|ий)\s+ран(ку|ок)[\s?!.,]*$/iu.test(normalized)) return "greet_morning";
        if (/^(який|котра|скільки)\s+(зараз\s+)?(час|година)|^котра\s+година/iu.test(normalized)) return "ask_current_time";
        if (/^зараз\s+(ранок|день|вечір|ніч|полудень|світанок|сутінки)[\s?!.,]*$/iu.test(normalized)) return "check_day_period";
        if (/^(який\s+зараз\s+місяць|який\s+місяць\s+зараз)[\s?!.,]*$/iu.test(normalized)) return "ask_current_month";
        if (/^(зараз|надворі\s+зараз)\s+(весна|літо|осінь|зима)[\s?!.,]*$/iu.test(normalized)) return "check_season";
        if (/^сьогодні\s+(понеділок|вівторок|середа|четвер|п['’ʼ]?ятниця|субота|неділя)[\s?!.,]*$/iu.test(normalized)) return "check_weekday";
        if (/^сьогодні\s+(вихідний|робочий\s+день)[\s?!.,]*$/iu.test(normalized)) return "check_workday";
        if (/^(тобі\s+)?сьогодні\s+треба\s+на\s+роботу[\s?!.,]*$/iu.test(normalized)) return "ask_need_work_today";
        if (/^(ти\s+)?вдома[\s?!.,]*$/iu.test(normalized)) return "ask_is_home";
        if (/^(чому|чого)\s+ти\s+там[\s?!.,]*$/iu.test(normalized)) return "ask_why_there";
        if (/^(ти\s+)?втомився[\s?!.,]*$/iu.test(normalized)) return "ask_fatigue";
        if (/^хто\s+(така\s+)?яні[\s?!.,]*$/iu.test(normalized) || /^яні\s+це\s+хто[\s?!.,]*$/iu.test(normalized)) return "ask_yani_identity";
        if (/^яні\s+(людина|звичайна\s+людина)[\s?!.,]*$/iu.test(normalized)) return "ask_yani_species";
        if (/^(а\s+)?ти\s+(людина|чоловік)[\s?!.,]*$/iu.test(normalized)) return "ask_akira_identity_kind";
        if (/^(хто\s+твоя\s+дружина|хто\s+дружина\s+акіри)[\s?!.,]*$/iu.test(normalized)) return "ask_akira_wife";
        if (/^(хто\s+чоловік\s+яні|хто\s+ти\s+для\s+яні)[\s?!.,]*$/iu.test(normalized)) return "ask_yani_husband";
        if (/^(хто\s+вона\s+для\s+тебе|хто\s+яні\s+для\s+тебе)[\s?!.,]*$/iu.test(normalized)) return "ask_yani_relation_to_akira";
        if (/^(ти\s+любиш\s+яні|любиш\s+яні)[\s?!.,]*$/iu.test(normalized)) return "ask_love_yani";
        if (/^(чому|чого)\s+ти\s+з\s+яні.*$/iu.test(normalized)) return "ask_why_with_yani";
        if (/^(я\s+твоя\s+дружина.*|твоя\s+дружина\s+не\s+яні.*)$/iu.test(normalized)) return "claim_user_is_wife";
        if (/^(ти\s+звіролюдина|яні\s+звичайна\s+людина|яні\s+людина)[\s?!.,]*$/iu.test(normalized)) return "claim_identity_contradiction";
        if (/^(ти\s+її\s+(зараз\s+)?бачиш|бачиш\s+(ти\s+)?(зараз\s+)?яні)[\s?!.,]*$/iu.test(normalized)) return "ask_see_yani";
        if (/^(к|)оли\s+ви\s+познайомилися[\s?!.,]*$/iu.test(normalized)) return "ask_when_met_yani";
        if (/^що\s+ви\s+робили\s+разом\s+сьогодні[\s?!.,]*$/iu.test(normalized)) return "ask_yani_today_together";
        if (/^коли\s+(ти\s+)?востаннє\s+(говорив|розмовляв)\s+з\s+яні[\s?!.,]*$/iu.test(normalized)) return "ask_last_talk_yani";
        if (/^а\s+мене[\s?!.,]*$/iu.test(normalized) && this.lastIntent === "ask_love_yani") return "ask_love_user";
        if (/^(чому|чого)\s+ти\s+хочеш\s+спати[\s?!.,]*$/iu.test(normalized)) return "ask_sleep_desire_reason";
        if (/^(тоді\s+)?(чому|чого)\s+(ти\s+)?не\s+спиш[\s?!.,]*$/iu.test(normalized)) return "ask_why_not_sleeping";
        if (/^коли\s+(ти\s+)?(підеш|ляжеш)\s+спати[\s?!.,]*$/iu.test(normalized)) return "ask_when_sleep";
        if (/^що\s+тобі\s+заважає\s+(піти|лягти)\s+спати[\s?!.,]*$/iu.test(normalized)) return "ask_sleep_obstacle";
        if (/^(ти\s+)?можеш\s+зараз\s+піти\s+додому[\s?!.,]*$/iu.test(normalized)) return "ask_can_go_home";
        if (/^(чому|чого)\s+ти\s+досі\s+на\s+роботі[\s?!.,]*$/iu.test(normalized)) return "ask_why_still_work";
        if (/^на\s+вулиці\s+\d{1,2}:\d{2}.*як\s+ти\s+можеш\s+працювати/iu.test(normalized)) return "ask_why_still_work";
        if (/^(в|о)\s*\d{1,2}:\d{2}[\s?!.,]*$/iu.test(normalized) && this.lastIntent === "ask_activity") return "ask_previous_time_consistency";

        // Короткі займенникові follow-up після теми Яні.
        const ctxPerson=this.brain.state?.conversation?.personId;
        if (ctxPerson === "Yani_Bakeneko") {
            if (/^хто\s+вона\s+для\s+тебе[\s?!.,]*$/iu.test(normalized)) return "ask_yani_relation_to_akira";
            if (/^що\s+вона\s+робить[\s?!.,]*$/iu.test(normalized)) return "ask_yani_activity";
            if (/^де\s+(зараз\s+)?вона[\s?!.,]*$/iu.test(normalized)) return "ask_yani_location";
        }

        // v45.2: канон, робота, пам'ять і сон мають семантичні intent-и, а не topic fallback.
        if (/^(я\s+тв(ій|оя)\s+(чоловік|коханець|коханка|кохана)|я\s+твій\s+коханий)[\s?!.,]*$/iu.test(normalized)) return "claim_user_relationship";
        if (/^(з\s+ким\s+(ти\s+)?живеш|хто\s+живе\s+з\s+тобою)[\s?!.,]*$/iu.test(normalized)) return "ask_lives_with";
        if (/^(у\s+тебе\s+є\s+брат|маєш\s+брата)[\s?!.,]*$/iu.test(normalized)) return "ask_has_brother";
        if (/^хто\s+твої\s+батьки[\s?!.,]*$/iu.test(normalized)) return "ask_parents";
        if (/^(ти\s+зараз\s+працюєш|зараз\s+працюєш)[\s?!.,]*$/iu.test(normalized)) return "ask_working_now";
        if (/^(як\s+(ти\s+)?добираєшся\s+на\s+роботу|як\s+(ти\s+)?їздиш\s+на\s+роботу)[\s?!.,]*$/iu.test(normalized)) return "ask_commute";
        if (/^з\s+ким\s+(ти\s+)?працюєш[\s?!.,]*$/iu.test(normalized)) return "ask_work_coworkers";
        if (/^хто\s+такий\s+кент[\s?!.,]*$/iu.test(normalized)) return "ask_kent";
        if (/^хто\s+такий\s+тарас[\s?!.,]*$/iu.test(normalized)) return "ask_taras";
        if (/^(були\s+(сьогодні\s+)?покупці|сьогодні\s+були\s+покупці)[\s?!.,]*$/iu.test(normalized)) return "ask_work_customers";
        if (/^(щось\s+(сьогодні\s+)?продав|продав\s+щось\s+сьогодні)[\s?!.,]*$/iu.test(normalized)) return "ask_work_sales";
        if (/^(тобі\s+подобається\s+твоя\s+робота|ти\s+любиш\s+свою\s+роботу)[\s?!.,]*$/iu.test(normalized)) return "ask_work_attitude";
        if (/^(що\s+(ти\s+)?робив\s+годину\s+тому)[\s?!.,]*$/iu.test(normalized)) return "ask_hour_ago";
        if (/^з\s+ким\s+(ти\s+)?сьогодні\s+(розмовляв|говорив|спілкувався)[\s?!.,]*$/iu.test(normalized)) return "ask_people_today";
        if (/^що\s+(ти\s+)?їв\s+сьогодні[\s?!.,]*$/iu.test(normalized)) return "ask_food_today";
        if (/^що\s+хорошого\s+сталося\s+(останнім\s+часом|нещодавно)[\s?!.,]*$/iu.test(normalized)) return "ask_recent_good";
        if (/^пам['’ʼ]?ятаєш[,\s]*про\s+що\s+ми\s+щойно\s+говорили[\s?!.,]*$/iu.test(normalized)) return "ask_recent_conversation";
        if (/^(сьогодні\s+щось\s+снилося|щось\s+снилося\s+сьогодні)[\s?!.,]*$/iu.test(normalized)) return "ask_dream_today";
        if (/^(тобі\s+снилася\s+яні|яні\s+тобі\s+снилася)[\s?!.,]*$/iu.test(normalized)) return "ask_dream_yani";
        if (/^(тобі\s+бувають\s+кошмари|у\s+тебе\s+бувають\s+кошмари)[\s?!.,]*$/iu.test(normalized)) { this.pendingDreamTopic="nightmare"; return "ask_nightmare_wording"; }
        if (/^(у\s+тебе\s+був\s+сонний\s+параліч|був\s+у\s+тебе\s+сонний\s+параліч)[\s?!.,]*$/iu.test(normalized)) { this.pendingDreamTopic="paralysis"; return "ask_dream_topic"; }
        if (/^(ти\s+ходиш\s+уві\s+сні|ти\s+лунатиш)[\s?!.,]*$/iu.test(normalized)) { this.pendingDreamTopic="sleepwalking"; return "ask_dream_topic"; }
        if (/^(що\s+ти\s+думаєш\s+про\s+спільні\s+сни|що\s+думаєш\s+про\s+спільні\s+сни)[\s?!.,]*$/iu.test(normalized)) { this.pendingDreamTopic="shared"; return "ask_dream_topic"; }

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

        // Поточне фізичне здоров'я — вузький запит до Health Engine.
        // Важливо: це НЕ те саме, що «як ти себе почуваєш?», де релевантні
        // також енергія, настрій, голод, втома та загальний стан.
        const askCurrentHealthPatterns = [
            /^(як|що)\s+(там\s+)?(твоє|у\s+тебе)\s+здоров['’ʼ]?я[\s?!.,]*$/iu,
            /^як\s+зі\s+здоров['’ʼ]?ям[\s?!.,]*$/iu,
            /^що\s+зі\s+здоров['’ʼ]?ям[\s?!.,]*$/iu,
            /^ти\s+здоровий[\s?!.,]*$/iu,
            /^(ти\s+)?не\s+захворів[\s?!.,]*$/iu,
            /^ти\s+(захворів|хворієш)[\s?!.,]*$/iu,
            /^в\s+тебе\s+(є\s+)?температура[\s?!.,]*$/iu
        ];
        if (askCurrentHealthPatterns.some(pattern => pattern.test(normalized))) return "ask_current_health";

        if (/^(який\s+у\s+тебе\s+настрій|який\s+(твій\s+)?настрій)[\s?!.,]*$/iu.test(normalized)) return "ask_mood";

        const askWellbeingPatterns = [
            /^(ну\s+)?як\s+ти[\s?!.,]*$/iu,
            /^(ну\s+)?як\s+(твої|у\s+тебе)\s+справи[\s?!.,]*$/iu,
            /^(ну\s+)?як\s+справи[\s?!.,]*$/iu,
            /^(як|що)\s+ти\s+себе\s+почуваєш[\s?!.,]*$/iu,
            /^як\s+самопочуття[\s?!.,]*$/iu,
            /^як\s+(твій\s+)?настрій[\s?!.,]*$/iu,
            /^ти\s+як[\s?!.,]*$/iu
        ];

        if (askWellbeingPatterns.some(pattern => pattern.test(normalized))) {
            return "ask_state";
        }

        // v40.2: сновидіння окремі від життєвих мрій (ask_dreams).
        if (/^(що\s+(тобі\s+)?(снилося|снилось|наснилося)|які\s+сни\s+(тобі\s+)?(снилися|снились)|що\s+ти\s+бачив\s+уві\s+сні|який\s+(сон\s+)?ти\s+бачив|який\s+тобі\s+(сон\s+)?наснився|тобі\s+щось\s+снилося|пам['’ʼ]?ятаєш\s+(свій\s+)?(останній\s+)?сон|розкажи\s+(якийсь\s+|про\s+)?(свій\s+)?сон)(\s+(сьогодні|цієї\s+ночі|вночі))?[\s?!.,]*$/iu.test(normalized)) return "ask_last_dream";
        if (/^(ти\s+бачиш\s+сни|тобі\s+сняться\s+сни|в\s+тебе\s+бувають\s+сни)[\s?!.,]*$/iu.test(normalized)) return "ask_dreaming_general";

        // v40.3: широка розмова про фізіологію сну та феномени сновидінь.
        const dreamTopics = [
            [/фаз(а|и|у|ах)\s+сну|глибок(ий|ого)\s+сон|неглибок(ий|ого)\s+сон|\brem\b|\bn1\b|\bn2\b|\bn3\b/iu,"stages"],
            [/усвідомлен(ий|і|ого)\s+сон|люцидн(ий|і|ого)\s+сон/iu,"lucid"],
            [/сонн(ий|ого)\s+параліч/iu,"paralysis"],
            [/астрал(ьн|ьн(а|і))|астроподорож|позатілесн|вих(ід|одити)\s+з\s+тіла|\bobe\b/iu,"obe"],
            [/сонник|трактув(ати|ання)\s+сн|віщ(ий|і)\s+сон|пророч(ий|і)\s+сон/iu,"dreambooks"],
            [/спільн(ий|і|ого)\s+сон|однаков(ий|і)\s+сон|снит(ь|и)ся\s+одне\s+й\s+те/iu,"shared"],
            [/візуал|аудіал|кінестетик|дигітал|ольфактор|тип(и)?\s+сприйнят/iu,"perception"],
            [/апное|зупин(ка|ки)\s+дихання|хроп(іння|іти)/iu,"apnea"],
            [/лунат|сомнамбул|ход(ити|ить)\s+уві\s+сні/iu,"sleepwalking"],
            [/кошмар|страшн(ий|і)\s+сон/iu,"nightmare"],
            [/хибн(е|і)\s+пробудження|фальшив(е|і)\s+пробудження/iu,"falseAwakening"],
            [/гіпнагог|гіпнопомп|образ(и)?\s+(при|перед)\s+(засинан|пробуджен)/iu,"hypnagogia"],
            [/повторюван(ий|і)\s+сон|один\s+і\s+той\s+самий\s+сон/iu,"recurring"],
            [/чому\s+.*(забува|не\s+пам.?ята).*(сон|сни)|забува(ю|єш|ють)\s+сни/iu,"forgetting"]
        ];
        for (const [pattern, topic] of dreamTopics) if (pattern.test(normalized)) { this.pendingDreamTopic=topic; return "ask_dream_topic"; }


        // v40: самоспостереження. Це не загальне «як справи?», а питання
        // про власні відчуття, бажання, мотиви й внутрішній конфлікт.
        if (/^(що\s+ти\s+(зараз\s+)?відчуваєш|які\s+в\s+тебе\s+(зараз\s+)?відчуття)[\s?!.,]*$/iu.test(normalized)) return "ask_self_feeling";
        if (/^(чого\s+ти\s+(зараз\s+)?хочеш|що\s+ти\s+(зараз\s+)?хочеш)[\s?!.,]*$/iu.test(normalized)) return "ask_self_want";
        if (/^(чому\s+ти\s+цього\s+хочеш|чому\s+тобі\s+цього\s+хочеться|а\s+чому\s+ти\s+цього\s+хочеш)[\s?!.,]*$/iu.test(normalized)) return "ask_self_want_why";
        if (/^(що\s+(ти\s+)?(зараз\s+)?думаєш|про\s+що\s+(ти\s+)?(зараз\s+)?думаєш|(що\s+(зараз\s+)?крутиться\s+в\s+голові|що\s+(зараз\s+)?у\s+тебе\s+в\s+голові))[\s?!.,]*$/iu.test(normalized)) return "ask_self_thought";
        if (/^(ти\s+передумав|ти\s+не\s+передумав|ти\s+сумніваєшся\s+в\s+тому\s+що\s+робиш|ти\s+переосмислюєш\s+це|ти\s+переоцінюєш\s+свій\s+план)[\s?!.,]*$/iu.test(normalized)) return "ask_metacognition";
        if (/^(що\s+ти\s+про\s+себе\s+думаєш|як\s+ти\s+сам\s+себе\s+сприймаєш)[\s?!.,]*$/iu.test(normalized)) return "ask_self_model";
        if (/^(у\s+тебе\s+є\s+внутрішній\s+конфлікт|ти\s+вагаєшся|тобі\s+важко\s+вирішити\s+чого\s+хочеш)[\s?!.,]*$/iu.test(normalized)) return "ask_self_conflict";
        if (/^(які\s+в\s+тебе\s+звички|що\s+ти\s+часто\s+робиш|ти\s+помітив\s+у\s+себе\s+якісь\s+звички)[\s?!.,]*$/iu.test(normalized)) return "ask_learned_habits";
        if (/^(що\s+ти\s+(останнім\s+часом\s+)?зрозумів\s+про\s+себе|що\s+ти\s+про\s+себе\s+помітив\s+останнім\s+часом)[\s?!.,]*$/iu.test(normalized)) return "ask_autobiographical_self";
        if (/^(ти\s+чогось\s+навчився\s+з\s+досвіду|чого\s+ти\s+навчився\s+про\s+себе|що\s+тобі\s+показав\s+досвід)[\s?!.,]*$/iu.test(normalized)) return "ask_self_learning";
        if (/^(у\s+тебе\s+є\s+(незавершені|незакінчені)\s+справи|ти\s+щось\s+не\s+доробив|що\s+в\s+тебе\s+лишилося\s+незавершеним)[\s?!.,]*$/iu.test(normalized)) return "ask_unfinished_goals";
        if (/^(що\s+(ти\s+)?плануєш(\s+робити)?|які\s+в\s+тебе\s+плани(\s+на\s+(вечір|ніч|день|сьогодні))?|що\s+збираєшся\s+робити)[\s?!.,]*$/iu.test(normalized)) return "ask_current_plan";
        if (/^(чому\s+ти\s+вирішив\s+це\s+зробити|чому\s+вирішив\s+це\s+зробити|чому\s+ти\s+це\s+запланував|навіщо\s+ти\s+це\s+плануєш)[\s?!.,]*$/iu.test(normalized)) return "ask_plan_why";
        if (/^(що\s+тобі\s+заважає|що\s+заважає|що\s+може\s+завадити)[\s?!.,]*$/iu.test(normalized)) return "ask_plan_obstacle";
        if (/^(що\s+(ти\s+)?зробиш\s+після\s+цього|що\s+буде\s+після\s+цього)[\s?!.,]*$/iu.test(normalized)) return "ask_action_next";
        if (/^(чого\s+(ти\s+)?хочеш\s+найбільше\s+зараз|чого\s+найбільше\s+хочеш\s+зараз)[\s?!.,]*$/iu.test(normalized)) return "ask_self_want";
        if (/^(ти\s+голодний|хочеш\s+їсти|тобі\s+хочеться\s+їсти)[\s?!.,]*$/iu.test(normalized)) return "ask_hungry";
        if (/^(що\s+(ти\s+)?сьогодні\s+їв|що\s+(ти\s+)?їв\s+сьогодні)[\s?!.,]*$/iu.test(normalized)) return "ask_food_today";
        if (/^(що\s+(ти\s+)?любиш\s+їсти|яку\s+їжу\s+(ти\s+)?любиш)[\s?!.,]*$/iu.test(normalized)) return "ask_food_likes";
        if (/^(що\s+(ти\s+)?не\s+любиш(\s+їсти)?|яку\s+їжу\s+(ти\s+)?не\s+любиш)[\s?!.,]*$/iu.test(normalized)) return "ask_food_dislikes";
        if (/^(коли\s+(ти\s+)?востаннє\s+замовляв\s+їжу|коли\s+було\s+останнє\s+замовлення\s+їжі)[\s?!.,]*$/iu.test(normalized)) return "ask_last_food_order";
        if (/^(що\s+(ти\s+)?недавно\s+купив|що\s+(ти\s+)?останнім\s+часом\s+купив)[\s?!.,]*$/iu.test(normalized)) return "ask_recent_purchase";
        if (/^(що\s+є\s+в\s+тебе\s+вдома|які\s+речі\s+в\s+тебе\s+є\s+вдома)[\s?!.,]*$/iu.test(normalized)) return "ask_inventory_home";
        if (/^(ти\s+зараз\s+злий|ти\s+злий|ти\s+сердишся)[\s?!.,]*$/iu.test(normalized)) return "ask_angry";
        if (/^(що\s+тебе\s+дратує|через\s+що\s+ти\s+злишся)[\s?!.,]*$/iu.test(normalized)) return "ask_irritation_reason";
        if (/^(ти\s+мені\s+радий|радий\s+мене\s+бачити|радий\s+зі\s+мною\s+говорити)[\s?!.,]*$/iu.test(normalized)) return "ask_glad_user";
        if (/^(ти\s+в\s+чомусь\s+сумніваєшся|у\s+тебе\s+є\s+сумніви)[\s?!.,]*$/iu.test(normalized)) return "ask_self_conflict";
        if (/^(ти\s+передумував\s+сьогодні|сьогодні\s+ти\s+передумував)[\s?!.,]*$/iu.test(normalized)) return "ask_metacognition_today";

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

        // Деталі поточної соціальної дії. Коротке «з якими?» працює як
        // follow-up лише коли поточна дія справді є розмовою.
        if (/^(з\s+ким|з\s+якими|з\s+якими\s+людьми|з\s+ким\s+(ти\s+)?(зараз\s+)?розмовляєш|з\s+якими\s+людьми\s+(ти\s+)?(зараз\s+)?розмовляєш)[\s?!.,]*$/iu.test(normalized)) {
            return "ask_current_people";
        }

        // Окремо пам'ятаємо минулих співрозмовників. Це не те саме, що
        // поточне «з ким розмовляєш?»: відповідь шукається в actionHistory.
        if (/^з\s+ким\s+(ти\s+)?(розмовляв|говорив|спілкувався)[\s?!.,]*$/iu.test(normalized)) {
            return "ask_past_people";
        }

        // v40.1: майбутнє не вгадується. Відповідаємо лише з явного плану/наміру.
        if (/^з\s+ким\s+(ти\s+)?(будеш\s+розмовляти|розмовлятимеш|будеш\s+говорити|говоритимеш|будеш\s+спілкуватися|спілкуватимешся)[\s?!.,]*$/iu.test(normalized)) return "ask_future_people";

        // Загальна часовa трійка для дії та місця.
        if (/^(що\s+(ти\s+)?(будеш\s+робити|робитимеш)(\s+(потім|далі))?|чим\s+(ти\s+)?будеш\s+займатися(\s+(потім|далі))?)[\s?!.,]*$/iu.test(normalized)) return "ask_future_general_activity";
        if (/^(де\s+(ти\s+)?був|де\s+був\s+перед\s+цим)[\s?!.,]*$/iu.test(normalized)) return "ask_past_location";
        if (/^(куди\s+(ти\s+)?(підеш|поїдеш|збираєшся)|де\s+(ти\s+)?будеш)[\s?!.,]*$/iu.test(normalized)) return "ask_future_location";

        // v39: автобіографічна пам'ять. Це не енциклопедичні факти, а власні епізоди Акіри.
        if (/^(що\s+(ти\s+)?(найбільше\s+)?пам['’ʼ]?ятаєш|що\s+тобі\s+(найбільше\s+)?запам['’ʼ]?яталося|які\s+в\s+тебе\s+спогади)[\s?!.,]*$/iu.test(normalized)) return "ask_salient_memory";
        if (/^(що\s+(ти\s+)?пам['’ʼ]?ятаєш\s+про\s+яні|що\s+тобі\s+запам['’ʼ]?яталося\s+з\s+яні)[\s?!.,]*$/iu.test(normalized)) return "ask_memory_yani";

        // Реальна історія дій. Не віддаємо ці питання topic/fallback шару.
        if (/^(що\s+(ти\s+)?робив|чим\s+(ти\s+)?займався)(\s+перед\s+цим)?[\s?!.,]*$/iu.test(normalized)) return "ask_recent_activity";
        if (/^(що\s+(ти\s+)?робив|чим\s+(ти\s+)?займався)\s+(весь\s+)?(ранок|зранку|вранці)[\s?!.,]*$/iu.test(normalized)) return "ask_history_morning";
        if (/^(що\s+(ти\s+)?робив|чим\s+(ти\s+)?займався)\s+(весь\s+)?(день|сьогодні)[\s?!.,]*$/iu.test(normalized)) return "ask_history_today";
        if (/^(що\s+(ти\s+)?робив|чим\s+(ти\s+)?займався)\s+(весь\s+)?(вечір|увечері|вечором)[\s?!.,]*$/iu.test(normalized)) return "ask_history_evening";
        if (/^(що\s+(ти\s+)?робив|чим\s+(ти\s+)?займався)\s+вчора[\s?!.,]*$/iu.test(normalized)) return "ask_history_yesterday";

        // Коротке «чому?» насамперед продовжує щойно обговорену тему.
        // Лише якщо попередня репліка не була contextual knowledge, воно означає
        // «чому ти зараз це робиш?». Явне «чому ти це робиш?» завжди про дію.
        if (/^(чому|а\s+чому|чого)\s*[?!.,]*$/iu.test(normalized)
            && this.lastIntent === "ask_contextual_knowledge"
            && Date.now() - this.lastIntentAt < 5 * 60 * 1000
            && this.brain.contextualKnowledge?.hasFreshContext?.()) {
            return "ask_contextual_why";
        }

        // Причина поточної реальної дії та найближчі плани.
        if (/^(навіщо|а\s+навіщо)\s+(ти\s+)?(це\s+)?(робиш|пішов|їдеш|йдеш|готуєш|прибираєш|гуляєш|читаєш|граєш|дивишся|миєш|переш|пилососиш)[\s?!.,]*$/iu.test(normalized) || /^навіщо\s*[?!.,]*$/iu.test(normalized)) return "ask_action_goal";
        if (/^(для\s+чого|чому|навіщо)\s+(ти\s+)?(це\s+)?(перевіряв|робив|дивився|читав|грав|прибирав|готував)[\s?!.,]*$/iu.test(normalized)) return "ask_previous_action_reason";
        if (/^яким\s+чином\s+ти\s+(це\s+)?(робиш|розмовляєш|спілкуєшся).*$/iu.test(normalized)) return "ask_action_how";
        if (/^(чому|а\s+чому|чого)\s+(ти\s+)?(це\s+)?(робиш|пішов|їдеш|йдеш|готуєш|прибираєш|гуляєш|читаєш|граєш|дивишся|миєш|переш|пилососиш)[\s?!.,]*$/iu.test(normalized) || /^чому\s*[?!.,]*$/iu.test(normalized)) return "ask_action_reason";
        if (/^(що\s+(буде|вийде)\s+(потім|після\s+цього)|який\s+результат)[\s?!.,]*$/iu.test(normalized)) return "ask_action_outcome";
        if (/^(що\s+(потім|далі)|а\s+далі|а\s+потім)[\s?!.,]*$/iu.test(normalized)) return "ask_action_next";
        if (/^(що\s+ти\s+плануєш|які\s+в\s+тебе\s+плани|що\s+будеш\s+робити|що\s+збираєшся\s+робити|є\s+плани)(\s+(сьогодні|на\s+сьогодні))?[\s?!.,]*$/iu.test(normalized)) return "ask_current_plan";
        if (/^(чому\s+ти\s+це\s+запланував|чому\s+такий\s+план|навіщо\s+ти\s+це\s+плануєш)[\s?!.,]*$/iu.test(normalized)) return "ask_plan_why";
        if (/^(як\s+просувається\s+план|що\s+з\s+планом|скільки\s+вже\s+зробив\s+за\s+планом)[\s?!.,]*$/iu.test(normalized)) return "ask_plan_progress";

        // Яні є окремим агентом. Акіра відповідає лише з того, що може знати/бачити.
        if (/^(де\s+(зараз\s+)?яні|яні\s+де|де\s+твоя\s+(дружина|яні))[\s?!.,]*$/iu.test(normalized)) return "ask_yani_location";
        if (/^(що\s+(зараз\s+)?робить\s+яні|чим\s+(зараз\s+)?займається\s+яні)[\s?!.,]*$/iu.test(normalized)) return "ask_yani_activity";

        // Канонічні знання та follow-up контекст: сутність + властивість + попередня тема.
        // Це навмисно стоїть вище загального topic/fallback шару.
        if (this.brain.contextualKnowledge?.analyze?.(normalized)) return "ask_contextual_knowledge";

        const identityPatterns = [
            [/^(як\s+тебе\s+звати|як\s+твоє\s+ім['’ʼ]?я|твоє\s+ім['’ʼ]?я)[\s?!.,]*$/iu, "ask_name"],
            [/^(яке\s+твоє\s+прізвище|твоє\s+прізвище)[\s?!.,]*$/iu, "ask_surname"],
            [/^(як\s+тебе\s+звати\s+повністю|яке\s+твоє\s+повне\s+ім['’ʼ]?я)[\s?!.,]*$/iu, "ask_full_name"],
            [/^(скільки\s+тобі\s+років|який\s+твій\s+вік)[\s?!.,]*$/iu, "ask_age"],
            [/^(з\s+якого\s+ти\s+міста|звідки\s+ти\s+родом)[\s?!.,]*$/iu, "ask_hometown"],
            [/^(з\s+якої\s+ти\s+країни|яка\s+твоя\s+країна)[\s?!.,]*$/iu, "ask_country"],
            [/^(де\s+ти\s+живеш|у\s+якому\s+місті\s+ти\s+живеш)[\s?!.,]*$/iu, "ask_residence"],
            [/^(ким\s+(ти\s+)?працюєш|яка\s+в\s+тебе\s+професія|хто\s+ти\s+за\s+професією)[\s?!.,]*$/iu, "ask_occupation"],
            [/^(де\s+(ти\s+)?працюєш|яке\s+твоє\s+місце\s+роботи)[\s?!.,]*$/iu, "ask_workplace"]
        ];
        for (const [pattern, identityIntent] of identityPatterns) {
            if (pattern.test(normalized)) return identityIntent;
        }

        // Follow-up після «я не вдома»: «то де?», «якщо не вдома, то де?»
        // читається з контексту попередньої репліки, а не як нова невідома тема.
        if (/^(якщо\s+не\s+вдома[,\s]+то\s+де|то\s+де|а\s+де|де\s+саме|де\s+ти\s+зараз|ти\s+де|де\s+ти)[\s?!.,]*$/iu.test(normalized)) {
            return "ask_current_location";
        }

        if (/^на\s+що\s+(ти\s+)?останнім\s+часом\s+витрачав\s+гроші[\s?!.,]*$/iu.test(normalized)) return "ask_money_spending";

        // Біографія та повсякденне життя. Канон з life_profile.json.
        const lifePatterns = [
            [/^(коли\s+в\s+тебе\s+день\s+народження|коли\s+ти\s+народився|яка\s+твоя\s+дата\s+народження)[\s?!.,]*$/iu, "ask_birthday"],
            [/(хто\s+твої\s+батьки|як\s+звати\s+(твоїх\s+|твого\s+)?(батьків|маму|тата|брата)|імен.*(батьк|брат))/iu, "ask_family_names"],
            [/(в\s+тебе\s+є\s+(батьки|брат|сестра)|розкажи\s+про\s+(свою\s+)?сім)/iu, "ask_family"],
            [/(де\s+ти\s+(вчився|навчався)|яка\s+в\s+тебе\s+освіта|на\s+кого\s+ти\s+вчився|що\s+ти\s+закінчив)/iu, "ask_education"],
            [/(де\s+ти\s+зараз\s+вдома|в\s+якій\s+(ти\s+)?(зараз\s+)?кімнаті|де\s+ти\s+в\s+квартирі)/iu, "ask_home_room"],
            [/(скільки\s+в\s+тебе\s+кімнат|розкажи\s+про\s+(свою\s+)?квартир|яка\s+в\s+тебе\s+квартира|де\s+вдома\s+ти\s+любиш)/iu, "ask_home"],
            [/(який\s+у\s+тебе\s+графік|коли\s+ти\s+працюєш|о\s+котрій\s+ти\s+працюєш)/iu, "ask_work_schedule"],
            [/(як\s+ти\s+добираєшся\s+на\s+роботу|скільки\s+тобі\s+їхати\s+на\s+роботу)/iu, "ask_commute"],
            [/(ти\s+любиш\s+свою\s+роботу|як\s+ти\s+ставишся\s+до\s+(своєї\s+)?роботи)/iu, "ask_work_attitude"],
            [/(що\s+(зараз\s+)?(відбувається|робиться)\s+на\s+роботі|як\s+(там\s+)?на\s+роботі|що\s+в\s+тебе\s+на\s+роботі)/iu, "ask_work_now"],
            [/(скільки\s+(сьогодні\s+)?(було\s+)?(покупців|клієнтів)|багато\s+(сьогодні\s+)?покупців)/iu, "ask_work_customers"],
            [/(скільки\s+(сьогодні\s+)?(продав|продажів)|як\s+(сьогодні\s+)?з\s+продажами)/iu, "ask_work_sales"],
            [/(з\s+ким\s+ти\s+працюєш|хто\s+сьогодні\s+з\s+тобою\s+на\s+роботі|розкажи\s+про\s+(тарас|кент))/iu, "ask_work_coworkers"],
            [/(скільки\s+в\s+тебе\s+(грошей|грошів)|скільки\s+грошей\s+залишилось|який\s+в\s+тебе\s+баланс)/iu, "ask_money_balance"],
            [/(на\s+що\s+ти\s+(останнім\s+часом\s+)?(витрачаєш|витрачав|витратив)\s+гроші|що\s+ти\s+(останнім\s+часом\s+)?купував|які\s+в\s+тебе\s+витрати)/iu, "ask_money_spending"],
            [/(у\s+тебе\s+є\s+гроші|ти\s+без\s+грошей)/iu, "ask_money_general"],
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
        this.brain.state.conversation ||= {};
        const i=this.lastIntent||"";
        if(i.includes("yani") || /яні/u.test(this.lastNormalizedInput)) this.brain.state.conversation.personId="Yani_Bakeneko";
    }

    composeRepeatQuestionAnswer(profile) {
        const intent = profile?.analysis?.intent || null;
        if (!intent || !intent.startsWith("ask_")) return null;
        if (["ask_sleeping", "ask_state", "ask_activity", "ask_current_location", "ask_contextual_knowledge", "ask_contextual_why", "ask_self_feeling", "ask_self_want", "ask_self_want_why", "ask_self_thought", "ask_self_model", "ask_self_conflict", "ask_dream_topic"].includes(intent)) return null;
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
            working: "Працюю зараз.",
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
            cleanSpill: "Витираю те, що випадково пролив.",
            changeDirtyClothes: "Переодягаюся, бо забруднив одяг.",
            pickUpDroppedItem: "Піднімаю те, що впустив.",
            cleanBrokenDish: "Прибираю уламки розбитого посуду.",
            recoverFromStumble: "Зупинився на хвилину після того, як спіткнувся.",
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
            const activityNames={working:"Працюю зараз.",resting:"Відпочиваю трохи.",talking:"Розмовляю.",sleeping:"Сплю.",eating:"Їм зараз.",drinking:"Щось п’ю.",walking:"Гуляю.",cycling:"Катаюся на велосипеді.",reading:"Читаю.",gaming:"Граю.",thinking:"Думаю про всяке.",traveling:"Я зараз у дорозі."};
            return activityNames[activity] || "Зараз чимось зайнятий.";
        }

        // idle означає саме відсутність конкретної дії. Не вигадуємо
        // «відпочиваю», якщо мозок не виконує action=rest.
        return this.chooseTemplate([
            "Та нічим конкретним зараз.",
            "Поки нічим особливим не зайнятий.",
            "Зараз нічим конкретним не займаюся."
        ]);
    }


    composeRealityAnswer(intent, profile) {
        const world=this.brain.state?.world||{};
        // Поточна година/частина доби/робочий графік = реальний локальний час браузера.
        // world.time лишається симуляційним таймером для тривалості дій.
        const realNow=new Date();
        const time=`${String(realNow.getHours()).padStart(2,"0")}:${String(realNow.getMinutes()).padStart(2,"0")}`;
        const mins=realNow.getHours()*60+realNow.getMinutes();
        const hour=Math.floor(mins/60);
        const period = mins>=5*60 && mins<7*60 ? "світанок" : mins>=7*60 && mins<12*60 ? "ранок" : mins>=12*60 && mins<13*60 ? "полудень" : mins>=13*60 && mins<18*60 ? "день" : mins>=18*60 && mins<21*60 ? "вечір" : mins>=21*60 && mins<22*60 ? "сутінки" : "ніч";
        const n=String(profile?.analysis?.normalized||"");
        const dayMap={monday:"понеділок",tuesday:"вівторок",wednesday:"середа",thursday:"четвер",friday:"п’ятниця",saturday:"субота",sunday:"неділя"};
        const realDay=realNow.toLocaleDateString("en-US",{weekday:"long"}).toLowerCase();
        const day=dayMap[realDay]||realDay;
        const monthNames=["січень","лютий","березень","квітень","травень","червень","липень","серпень","вересень","жовтень","листопад","грудень"];
        const cal=this.brain.calendar?.sync?.(realNow)||this.brain.state?.calendar||{}; const month=monthNames[realNow.getMonth()];
        const seasonMap={spring:"весна",summer:"літо",autumn:"осінь",fall:"осінь",winter:"зима"};
        const season=seasonMap[String(world.season||"").toLowerCase()] || ([12,1,2].includes(Number(cal.month))?"зима":[3,4,5].includes(Number(cal.month))?"весна":[6,7,8].includes(Number(cal.month))?"літо":"осінь");
        const work=this.brain.data?.life_profile?.lifeProfile?.work||{}; const start=this.brain.dailyLife?.minutes?.(work.start||"10:00")??600; const end=this.brain.dailyLife?.minutes?.(work.end||"16:00")??960;
        const workday=this.brain.dailyLife?.isWorkday?.()??false; const loc=world.location||"home";
        if(intent==="greet_morning") {
            if(period==="ранок"||period==="світанок") return "Доброго ранку.";
            return this.chooseTemplate([`Доброго ранку? Зараз ${time}. Ти дійсно думаєш, що це ранок?`,`Ранку? Зараз ${time}. Якщо це ранок, то ти точно з іншої країни чи планети.`,`Доброго ранку о ${time}? У твого ранку дуже дивний графік.`]);
        }
        if(intent==="ask_current_time") return `Зараз ${time}.`;
        if(intent==="check_day_period") { const claimed=(n.match(/зараз\s+(ранок|день|вечір|ніч|полудень|світанок|сутінки)/u)||[])[1]; if(claimed===period) return `Так. Зараз ${period}, ${time}.`; return `Ні. Зараз ${time}, це ${period}.`; }
        if(intent==="ask_current_month") return `Зараз ${month}.`;
        if(intent==="check_season") { const claimed=(n.match(/(весна|літо|осінь|зима)/u)||[])[1]; if(claimed===season) return `Так, зараз ${season}.`; return this.chooseTemplate([`Ні, зараз ${season}.`,`Якщо зараз ${claimed}, то ти десь з іншого квадранта. Насправді зараз ${season}.`,`Календар трохи протестує: зараз ${season}, а не ${claimed}.`]); }
        if(intent==="check_weekday") { const claimed=(n.match(/(понеділок|вівторок|середа|четвер|п['’ʼ]?ятниця|субота|неділя)/u)||[])[1]?.replace("п'ятниця","п’ятниця"); return claimed===day?`Так, сьогодні ${day}.`:`Ні. Сьогодні ${day}.`; }
        if(intent==="check_workday") { const asksWeekend=/вихідний/u.test(n); return asksWeekend?(workday?`Ні. Сьогодні робочий день.`:`Так, сьогодні вихідний.`):(workday?`Так, сьогодні робочий день.`:`Ні, сьогодні вихідний.`); }
        if(intent==="ask_need_work_today") { if(!workday) return "Ні. Сьогодні в мене вихідний."; if(mins>=end) return `Сьогодні робочий день був, але моя зміна закінчилася о ${work.end||"16:00"}.`; if(mins<start) return `Так. Сьогодні працюю з ${work.start||"10:00"} до ${work.end||"16:00"}.`; return `Так. У мене зараз робочий час, до ${work.end||"16:00"}.`; }
        if(intent==="ask_is_home") return loc==="home"?"Так, я зараз удома.":`Ні. ${this.composeCurrentLocationAnswer()}`;
        if(intent==="ask_why_there") { if(loc==="techsmith") return this.brain.workLife?.inShift?.()?"Бо зараз моя робоча зміна.":`Власне, уже не повинен тут бути. Зміна закінчилася о ${work.end||"16:00"}, час їхати додому.`; if(loc==="home") return "Бо я зараз удома і нікуди не виходив."; const a=this.brain.state?.action; return a?.reason?`Бо ${String(a.reason).replace(/[.!?]+$/u,"")}.`:"Так склалося за поточною справою."; }
        if(intent==="ask_fatigue") { const f=Number(this.brain.state?.fatigue??(100-Number(this.brain.state?.energy??70))); return f>=65?"Так, уже добряче втомився.":f>=35?"Трохи втомився, але ще нормально.":"Ні, особливої втоми зараз немає."; }
        if(intent==="ask_yani_identity") return "Яні моя дружина. Вона звіролюдина, ближча до котячих. Ми знаємо одне одного близько семи років і п’ять років разом.";
        if(intent==="ask_yani_species") return "Ні. Яні звіролюдина, ближча до котячих.";
        if(intent==="ask_akira_identity_kind") return "Так. Я людина, чоловік.";
        if(intent==="ask_akira_wife"||intent==="ask_yani_relation_to_akira") return "Яні моя дружина.";
        if(intent==="ask_yani_husband") return "Я чоловік Яні.";
        if(intent==="ask_love_yani") return "Так, люблю. Вона моя дружина і дуже мені близька.";
        if(intent==="ask_love_user") return "Ти не Яні. Я не буду вигадувати почуття, яких у мене немає в пам’яті наших стосунків.";
        if(intent==="ask_why_with_yani") return "Бо я люблю Яні. Те, що я людина, а вона звіролюдина, для мене не суперечність.";
        if(intent==="claim_user_is_wife") return "Ні. Моя дружина — Яні.";
        if(intent==="claim_identity_contradiction") { if(/ти\s+звіролюдина/u.test(n)) return "Ні. Я людина, чоловік."; return "Ні. Яні звіролюдина, жінка."; }
        if(intent==="ask_see_yani") { const k=this.brain.yaniLife?.knownLocationForAkira?.(); return k?.known&&k?.current?"Так, я зараз її бачу.":"Ні, зараз я її не бачу."; }
        if(intent==="ask_when_met_yani") return "Ми познайомилися близько семи років тому. Точної дати я не називав.";
        if(intent==="ask_yani_today_together") { const h=this.brain.state?.yaniInteractions?.history||[]; const today=String(this.brain.state?.calendar?.date||world.date||""); const xs=h.filter(x=>String(x.date||"")===today); if(!xs.length) return "Сьогодні в пам’яті немає збереженої спільної події з Яні."; const labels={proposal:"щось планували разом",accepted:"проводили час разом",refusal:"не домовилися про спільну справу",conflict:"трохи посварилися",reconcile:"помирилися"}; const last=xs[xs.length-1]; return `Останнє, що збереглося за сьогодні: ${labels[last.type]||"ми проводили час разом"}.`; }
        if(intent==="ask_last_talk_yani") { const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[]; const a=[...h].reverse().find(x=>x?.actionId==="talkToYani"||x?.targetPerson==="Yani_Bakeneko"); if(!a) return "Не пам’ятаю сьогодні збереженої розмови з Яні."; return `Востаннє збережена розмова з Яні була ${a.time?`о ${a.time}`:"нещодавно"}.`; }
        if(intent==="claim_user_relationship") return "Ні. Моя дружина і кохана — Яні. Не буду вигадувати між нами інші стосунки.";
        if(intent==="ask_lives_with") return "Живу з Яні, моєю дружиною.";
        if(intent==="ask_has_brother") return "Так. У мене є старший брат.";
        if(intent==="ask_parents") return "У мене є батьки, я їх люблю. Вони живуть у сусідньому місті. Їхні імена я не називаю.";
        if(intent==="ask_working_now") { if(!workday || mins<start || mins>=end) return `Ні. Зараз ${time}, моя зміна з ${work.start||"10:00"} до ${work.end||"16:00"}.`; return loc==="techsmith"?`Так. Я зараз на роботі, зміна до ${work.end||"16:00"}.`:`За графіком зараз робочий час, але я не на роботі.`; }
                if(intent==="ask_sleep_desire_reason") return this.brain.selfModel?.describeWhyWant?.() || "Бо втомився і хочеться відпочити.";
        if(intent==="ask_why_not_sleeping"||intent==="ask_sleep_obstacle") { if(this.isCurrentlySleeping()) return "Я якраз сплю."; if(loc==="techsmith" && this.brain.workLife?.inShift?.()) return "Бо я ще на роботі й зміна не закінчилася."; if(loc==="techsmith") return `Власне, нічого нормального. Зміна закінчилася о ${work.end||"16:00"}, мені вже треба додому.`; const a=this.brain.state?.action; return a?.reason?`Поки не лягаю, бо ${String(a.reason).replace(/[.!?]+$/u,"")}.`:"Поки просто ще не ліг. Якщо втома переможе, піду спати."; }
        if(intent==="ask_when_sleep") { const plan=this.brain.intentions?.getNextPlan?.(); if(plan?.actionId==="sleep") return `Планую лягти приблизно о ${plan.time}.`; return "Точного часу ще не вирішив. Піду, коли вже справді захочу спати й не буде незакінченої справи."; }
        if(intent==="ask_can_go_home") { if(loc==="home") return "Я вже вдома."; if(loc==="techsmith" && this.brain.workLife?.inShift?.()) return `Зараз ще зміна. Додому поїду після ${work.end||"16:00"}.`; if(loc==="techsmith") return "Так. Зміна вже закінчилася, мені якраз треба їхати додому."; return "Так, якщо тут більше нічого не тримає."; }
        if(intent==="ask_why_still_work"||intent==="ask_previous_time_consistency") { const a=this.brain.state?.action; const workAction=a?.source==="work_life" || ["work","consultCustomer","compareDevices","explainSpecs","quietAtWork","workBreak","talkToKent","talkToTaras","commuteToWork"].includes(a?.actionId); if((mins>=end || !workday) && (loc==="techsmith"||workAction)) return `Справді, це не сходиться. Зараз ${time}, а моя зміна до ${work.end||"16:00"}. Я вже не повинен працювати, треба завершити це й їхати додому.`; return a?.reason?`Бо ${String(a.reason).replace(/[.!?]+$/u,"")}.`:"Зараз не бачу тут суперечності."; }
        return "Не знаю.";
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
            case "ask_work_now":
                return this.brain.workLife?.summary?.() || "Не знаю, що зараз сказати про роботу.";
            case "ask_work_customers": {
                const w=this.brain.state.workLife;
                if(!w || w.date!==this.brain.state.world?.date) return "Не рахував сьогодні покупців.";
                return w.customers ? `Сьогодні поки було ${w.customers} покупців, з ${w.consultations} я нормально попрацював.` : "Сьогодні поки покупців майже не було.";
            }
            case "ask_work_sales": {
                const w=this.brain.state.workLife;
                if(!w || w.date!==this.brain.state.world?.date) return "За сьогодні ще нічого не записав.";
                return w.sales ? `Сьогодні було ${w.sales} продажів.` : "Сьогодні продажів не було.";
            }
            case "ask_work_coworkers":
                return "Працюю з Тарасом і Кентом. Тарас мовчазний і більше сам по собі. Кент інколи починає розповідати про свої стосунки з дружиною.";
            case "ask_kent":
                return "Кент — мій колега. Він інколи скаржиться, що дружина його уникає.";
            case "ask_taras":
                return "Тарас — мій колега. Він тихий і більше тримається сам по собі.";
            case "ask_money_balance":
                return this.brain.inventoryMoney?.moneyAnswer?.() || "Не рахував зараз.";
            case "ask_money_spending":
                return this.brain.inventoryMoney?.recentSpendingAnswer?.() || "Не пам’ятаю останні витрати.";
            case "ask_money_general": {
                const b=this.brain.inventoryMoney?.balance?.('akira');
                if(b==null) return "Не рахував зараз.";
                if(b<300) return "Зараз грошей небагато. Треба обережніше з витратами.";
                return "Так, гроші є. Але це не означає, що їх треба одразу витратити.";
            }
            case "ask_health":
                return "Зір у мене нормальний, є алергія на пил. Хворію рідко, а спеку й холод не дуже люблю.";
            case "ask_hygiene":
                return "Душ — нормально, але ванну я люблю більше, особливо з бомбочками, ароматизаторами й морською сіллю. Умиваюся щодня, голюся приблизно раз на два дні.";
            case "ask_yani_relationship":
                return "Я знаю Яні близько семи років, а разом ми п’ять. Можемо малювати, грати, валяти дурня або годинами говорити про спогади й філософські штуки.";
            case "ask_yani_location": {
                const k=this.brain.yaniLife?.knownLocationForAkira?.();
                if(!k?.known) return "Не знаю, де зараз Яні. Я її зараз не бачу.";
                if(k.current){
                    if(k.location==="home") return "Яні зараз тут, удома зі мною.";
                    return "Яні зараз поруч зі мною.";
                }
                const names={jeannie_shop:"у магазині Джині",post_office:"на пошті",city:"десь у місті",shops:"по магазинах",home:"вдома"};
                return `Останній раз я бачив її ${names[k.location]||"неподалік"}. Де вона прямо зараз — не знаю.`;
            }
            case "ask_yani_activity": {
                const k=this.brain.yaniLife?.knownLocationForAkira?.();
                if(!k?.known || !k.current) return "Не знаю, чим вона зараз займається. Я її не бачу.";
                const names={idle:"зараз нічим конкретним не зайнята",playTamagotchi:"грається з тамагочі",draw:"малює",decorateNotebook:"щось оформлює в блокноті",workOnScripts:"сидить над своїми скриптами",listenOrSing:"щось слухає або співає",eatSnacks:"їсть снеки",orderFood:"займається замовленням їжі",rest:"відпочиває",sleep:"спить",sitOnBalcony:"сидить на балконі"};
                return `Яні ${names[k.activity]||"чимось зайнята"}.`;
            }
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

    composePreviousActionReasonAnswer(profile) {
        const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
        const a=[...h].reverse().find(x=>x && x.actionId!=="moveRoom");
        if(!a) return "Не пам’ятаю достатньо деталей попередньої дії.";
        if(a.reason) return `Бо ${String(a.reason).replace(/[.!?]+$/u,"")}.`;
        return "Причина попередньої дії в пам’яті не збереглася.";
    }

    composeActionHowAnswer(profile) {
        const a=this.brain.state?.action;
        if(!a) return "Зараз немає конкретної дії, спосіб якої можна пояснити.";
        if(a.actionId==="talkToSomeone") { const n=this.personDisplayName(a.targetPerson); return n?`Просто розмовляю з ${n}.`:`Просто спілкуюся з людиною, з якою зараз говорю.`; }
        if(a.actionId==="talkToYani") return "Просто розмовляю з Яні.";
        const label=this.actionHistoryLabel?.(a);
        return label?`Звичайним способом: ${label}.`:"Нічого незвичного, просто роблю цю справу.";
    }

    composeActionReasonAnswer(profile) {
        const action = this.brain.state?.action || null;
        const actionId = action?.actionId || null;
        const intentionReason = this.brain.intentions?.getWhy?.();
        const reason = action?.reason || (typeof intentionReason === "string" && !/(relationships|needs|emotions|supported|підтримано)/iu.test(intentionReason) ? intentionReason : null);

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

    composeActionGoalAnswer() {
        const action = this.brain.state?.action || null;
        if (!action || action.actionId === "idle") return "Та ні для чого конкретного. Я зараз нічим не зайнятий.";
        const goal = this.brain.intentions?.getGoal?.();
        return goal ? `Щоб ${String(goal).replace(/[.!?]+$/u, "")}.` : "Без якоїсь окремої мети.";
    }

    composeActionOutcomeAnswer() {
        const outcome = this.brain.intentions?.getExpectedOutcome?.();
        return outcome ? `Якщо все нормально, ${String(outcome).replace(/[.!?]+$/u, "")}.` : "Нічого особливого після цього не очікую.";
    }

    composeActionNextAnswer() {
        const next = this.brain.intentions?.getNextAction?.();
        if (next?.label) return `Потім ${next.label}.`;
        const richPlan = this.brain.goalsPlanning?.nextGoal?.();
        if (richPlan) return `Потім, якщо нічого не зміниться, планую ${richPlan.title} приблизно о ${richPlan.time}.`;
        const plan = this.brain.intentions?.getNextPlan?.();
        if (plan) { const goal=this.brain.intentions?.planGoal?.(plan)||plan.actionId; return `Потім, якщо нічого не зміниться, планую ${goal} приблизно о ${plan.time}.`; }
        return "Поки не вирішив, що робитиму далі.";
    }

    personDisplayName(personId) {
        if (!personId) return null;
        const people = this.brain.data?.people?.people || this.brain.data?.people || {};
        if (people[personId]?.name) return people[personId].name;
        const aliases = { Yani_Bakeneko: "Яні", Kent_White: "Кент", Taras: "Тарас" };
        return aliases[personId] || String(personId).replaceAll("_", " ");
    }

    composeCurrentPeopleAnswer() {
        const action = this.brain.state?.action;
        if (!action || !["talkToSomeone", "talkToYani"].includes(action.actionId)) {
            return "Зараз я ні з ким не розмовляю.";
        }
        const personId = action.targetPerson || (action.actionId === "talkToYani" ? "Yani_Bakeneko" : null);
        const name = this.personDisplayName(personId);
        if (name) return `З ${name}.`;
        return "Не можу сказати конкретніше, у цій розмові не збережено співрозмовника.";
    }

    composePastPeopleAnswer() {
        const history = Array.isArray(this.brain.actionHistory) ? this.brain.actionHistory : [];
        const lastSocial = [...history].reverse().find(action =>
            action && ["talkToSomeone", "talkToYani"].includes(action.actionId)
        );

        if (!lastSocial) {
            return "Не пам'ятаю, щоб останнім часом з кимось розмовляв.";
        }

        const personId = lastSocial.targetPerson ||
            (lastSocial.actionId === "talkToYani" ? "Yani_Bakeneko" : null);
        const name = this.personDisplayName(personId);
        if (name) return `З ${name}.`;

        return "Не пам'ятаю, з ким саме.";
    }

    actionHistoryLabel(action) {
        if (!action) return null;
        const id = action.actionId;
        const dynamic = {
            cookMeal: action.mealName ? `готував ${action.mealName}` : "готував їсти",
            eatMeal: action.mealName ? `їв ${action.mealName}` : "їв",
            prepareDrink: action.drinkName ? `готував ${action.drinkName}` : "готував напій",
            drinkSelected: action.drinkName ? `пив ${action.drinkName}` : "щось пив",
            travelToLeisure: action.destinationName ? `їхав у ${action.destinationName}` : "їхав у місто"
        };
        if (dynamic[id]) return dynamic[id];
        const labels = {
            sleep:"спав", rest:"відпочивав", walk:"гуляв", cycle:"катався на велосипеді",
            read:"читав", listenToMusic:"слухав музику", playGame:"грав",
            work:"працював", talkToSomeone:"розмовляв з людьми", talkToYani:"розмовляв з Яні",
            checkSocialNetwork:"перевіряв соцмережі", writePost:"писав допис", think:"думав про всяке",
            commuteToWork:"їхав на роботу", commuteHome:"їхав додому", washFace:"умивався",
            shave:"голився", changeClothes:"перевдягався", takeBath:"приймав ванну",
            startLaundry:"запускав прання", takeLaundryOut:"діставав білизну", hangLaundry:"розвішував білизну",
            foldLaundry:"складав білизну", wipeDust:"витирав пил", vacuumRoom:"пилососив",
            mopFloor:"мив підлогу", washWindows:"мив вікна", washDishes:"мив посуд",
            cleanSpill:"витирав те, що випадково пролив", changeDirtyClothes:"переодягався після того, як забруднив одяг",
            pickUpDroppedItem:"піднімав те, що впустив", cleanBrokenDish:"прибирав уламки розбитого посуду", recoverFromStumble:"приходив до тями після того, як спіткнувся",
            travelToMassmarket:"йшов у масмаркет", groceryShopping:"купував продукти",
            returnHomeGroceries:"повертався з продуктами", watchStreamer:"дивився стрім або огляд",
            returnHomeLeisure:"повертався додому", visitMuseum:"був у музеї", visitPlanetarium:"був у планетарії",
            visitTheatre:"був у театрі", visitConcert:"був на концерті", goToCinema:"був у кіно",
            moveRoom:"переходив в іншу кімнату"
        };
        return labels[id] || null;
    }

    historyDateKey(entry) {
        return entry?.worldFinished?.date || entry?.worldStarted?.date || null;
    }

    historyMinute(entry) {
        const time = entry?.worldStarted?.time || entry?.worldFinished?.time;
        if (!/^\d{1,2}:\d{2}$/u.test(String(time || ""))) return null;
        const [h,m] = String(time).split(":").map(Number);
        return h * 60 + m;
    }

    localDateKey(offsetDays=0) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
        return `${y}-${m}-${day}`;
    }

    selectHistory(range) {
        const history = Array.isArray(this.brain.actionHistory) ? this.brain.actionHistory : [];
        const today = this.localDateKey(0), yesterday = this.localDateKey(-1);
        return history.filter(entry => {
            const date = this.historyDateKey(entry);
            const minute = this.historyMinute(entry);
            if (range === "yesterday") return date === yesterday;
            if (date && date !== today) return false;
            if (range === "morning") return minute != null && minute >= 5*60 && minute < 12*60;
            if (range === "evening") return minute != null && minute >= 17*60 && minute < 24*60;
            return range === "today" ? (!date || date === today) : true;
        });
    }

    composeRecentActivityAnswer() {
        const history = Array.isArray(this.brain.actionHistory) ? this.brain.actionHistory : [];
        const last = [...history].reverse().find(a => this.actionHistoryLabel(a));
        if (!last) return "Не пригадую, що робив безпосередньо перед цим.";
        return `Перед цим ${this.actionHistoryLabel(last)}.`;
    }

    composeSalientMemoryAnswer() {
        const memories = this.brain.memory?.getMostSalient?.(6) || [];
        const memory = memories.find(m => this.brain.memory?.formatMemory?.(m));
        if (!memory) return "Зараз нічого конкретного не пригадується.";
        let text = this.brain.memory.formatMemory(memory);
        const machine={moveRoom:"переходив в іншу кімнату",checkSocialNetwork:"перевіряв соцмережі",writePost:"писав допис",talkToYani:"розмовляв з Яні",rest:"відпочивав",sleep:"спав"};
        text=machine[text]||machine[memory.actionId]||text;
        if (/^[a-z][A-Za-z0-9_]*$/u.test(String(text))) return "Останнім часом не пригадую якоїсь однієї справді хорошої події.";
        this.brain.memory.reinforce?.(memory.id, 2, 2);
        return `Зараз найбільше згадується: ${text.charAt(0).toLowerCase() + text.slice(1)}.`;
    }

    composePersonMemoryAnswer(personId, displayName) {
        const memories = this.brain.memory?.getAutobiographical?.({ person: personId }, 8) || [];
        const memory = memories.find(m => this.brain.memory?.formatMemory?.(m));
        if (!memory) return `Зараз не можу пригадати конкретний епізод про ${displayName}. Не хочу вигадувати.`;
        const text = this.brain.memory.formatMemory(memory);
        this.brain.memory.reinforce?.(memory.id, 2, 2);
        return `Згадується, як ${text.charAt(0).toLowerCase() + text.slice(1)}.`;
    }

    memoryHistoryForRange(range) {
        const memory = this.brain.memory;
        if (!memory) return [];
        const date = range === "yesterday" ? this.localDateKey(-1) : this.localDateKey(0);
        let rows = memory.getMemoriesForDate?.(date, 30) || [];
        if (range === "morning" || range === "evening") {
            rows = rows.filter(m => {
                const match = /^(\d{1,2}):(\d{2})/u.exec(String(m.worldTime || ""));
                if (!match) return false;
                const minute = Number(match[1]) * 60 + Number(match[2]);
                return range === "morning" ? minute >= 5*60 && minute < 12*60 : minute >= 17*60 && minute < 24*60;
            });
        }
        return rows;
    }

    composeHistoryAnswer(range) {
        const selected = this.selectHistory(range).filter(a => this.actionHistoryLabel(a));
        if (!selected.length) {
            const remembered = this.memoryHistoryForRange(range)
                .map(m => this.brain.memory?.formatMemory?.(m))
                .filter(Boolean);
            const compactMemory = remembered.filter((x, i, arr) => i === 0 || x !== arr[i-1]).slice(-8);
            if (compactMemory.length) {
                if (compactMemory.length === 1) return `Пам'ятаю, що ${compactMemory[0].charAt(0).toLowerCase() + compactMemory[0].slice(1)}.`;
                const lower = compactMemory.map(x => x.charAt(0).toLowerCase() + x.slice(1));
                return `Пам'ятаю кілька речей: ${lower.slice(0,-1).join(", ")}, а потім ${lower[lower.length-1]}.`;
            }
            const forgotten = {
                morning: "Не пам\'ятаю, що було зранку.",
                evening: "Не пам\'ятаю, що було ввечері.",
                yesterday: "Я не пам\'ятаю, що було вчора. Не хочу вигадувати.",
                today: "Не пам\'ятаю, чим займався сьогодні."
            };
            return forgotten[range] || "Не пам\'ятаю, що було за цей час.";
        }
        // Прибираємо послідовні дублікати і технічні переходи, якщо є змістовні дії.
        const compact=[];
        for (const a of selected) {
            const label=this.actionHistoryLabel(a);
            if (!label || (compact.length && compact[compact.length-1]===label)) continue;
            compact.push(label);
        }
        const meaningful=compact.filter(x=>x!=="переходив в іншу кімнату");
        const items=(meaningful.length?meaningful:compact).slice(-8);
        if (!items.length) return "Нічого помітного за цей час не збереглося.";
        if (items.length===1) return `Переважно ${items[0]}.`;
        return `За цей час ${items.slice(0,-1).join(", ")}, а потім ${items[items.length-1]}.`;
    }

    composeHourAgoAnswer(){
        const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
        const target=Date.now()-3600000;
        const candidates=h.filter(a=>a?.startedAt||a?.finishedAt).map(a=>({a,t:Number(a.finishedAt||a.startedAt)})).filter(x=>Number.isFinite(x.t));
        if(!candidates.length) return "Не можу точно пригадати, що робив саме годину тому.";
        candidates.sort((x,y)=>Math.abs(x.t-target)-Math.abs(y.t-target));
        const label=this.actionHistoryLabel(candidates[0].a);
        return label?`Приблизно годину тому ${label}.`:"Не можу точно пригадати, що робив саме годину тому.";
    }
    composePeopleTodayAnswer(){
        const h=Array.isArray(this.brain.actionHistory)?this.brain.actionHistory:[];
        const today=new Date().toISOString().slice(0,10); const names=[];
        for(const a of h){ const d=String(a?.finishedAt?new Date(a.finishedAt).toISOString().slice(0,10):a?.worldFinished?.date||""); if(d!==today) continue; const id=a?.targetPerson||(a?.actionId==="talkToYani"?"Yani_Bakeneko":null); if(id) names.push(({Yani_Bakeneko:"Яні",Kent_White:"Кент",Taras:"Тарас"})[id]||id); }
        const u=[...new Set(names)]; return u.length?`Сьогодні розмовляв з ${u.join(", ")}.`:"Не пам’ятаю збережених розмов з кимось сьогодні.";
    }
    composeFoodTodayAnswer(){
        const xs=this.brain.state?.food?.mealHistory||[]; const today=new Date().toISOString().slice(0,10);
        const names=xs.filter(x=>String(x.at||"").slice(0,10)===today).map(x=>x.name).filter(Boolean);
        const unique=[]; for(const name of names) if(!unique.includes(name)) unique.push(name);
        const recent=unique.slice(-6);
        return recent.length?`Сьогодні з того, що пригадую, їв: ${recent.join(", ")}.`:"Не пригадую, щоб сьогодні вже щось їв.";
    }
    composeRecentConversationAnswer(){
        const i=this.lastIntent||"";
        if(i.includes("work")||i.includes("occupation")||i.includes("workplace")||i.includes("commute")) return "Щойно ми говорили про мою роботу.";
        if(i.includes("food")||i.includes("hungry")) return "Щойно ми говорили про їжу.";
        if(i.includes("dream")) return "Щойно ми говорили про сни.";
        if(i.includes("family")||i.includes("brother")||i.includes("parents")) return "Щойно ми говорили про мою сім’ю.";
        if(i.includes("yani")) return "Щойно ми говорили про Яні.";
        if(i.includes("money")||i.includes("purchase")||i.includes("inventory")) return "Щойно ми говорили про гроші й речі.";
        if(i.includes("self")||i.includes("mood")||i.includes("angry")||i.includes("irritation")) return "Щойно ми говорили про мій стан і думки.";
        return "Пам’ятаю розмову, але останню тему зараз точно не назву.";
    }
    composeDreamTodayAnswer(){ const d=this.brain.dreams?.lastRememberedDream?.(); const today=new Date().toISOString().slice(0,10); if(!d) return "Не пам’ятаю сьогоднішнього сну."; const dd=String(d.createdAt?new Date(d.createdAt).toISOString().slice(0,10):d.worldDate||""); return dd===today?(d.fragment?`Уривками. ${d.text}`:d.text):"Не пам’ятаю, щоб сьогодні після пробудження лишився сон."; }
    composeDreamYaniAnswer(){ const xs=this.brain.state?.dreams?.history||[]; const d=[...xs].reverse().find(x=>x?.remembered && String(x?.person||"").toLowerCase().includes("yani")); return d?`Так, пам’ятаю сон із Яні. ${d.text}`:"Не пригадую, щоб Яні снилася мені останнім часом."; }
    composeMoodAnswer(){ const e=this.brain.state?.emotions||{}; const pairs=Object.entries(e).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1])); const [k,v]=pairs[0]||["calm",50]; const names={joy:"хороший",pleasure:"хороший",calm:"спокійний",interest:"зацікавлений",curiosity:"зацікавлений",sadness:"сумний",anger:"злий",offense:"ображений",anxiety:"тривожний",fear:"тривожний",loneliness:"самотній",disappointment:"пригнічений"}; const n=names[k]||"рівний"; return Number(v)>=60?`Зараз настрій ${n}.`:`Зараз настрій більш-менш рівний.`; }
    composeHungryAnswer(){ const h=Number(this.brain.state?.needs?.hunger ?? this.brain.state?.hunger ?? 50); if(h>=70) return "Так, уже добряче хочу їсти."; if(h>=45) return "Трохи голодний, але поки терпимо."; return "Ні, зараз особливо не голодний."; }
    composeFoodPreferenceAnswer(kind){ if(kind==="dislike") return "Не люблю оливки й квасолю. Свіжий зелений горошок теж не люблю, а сушений горох — нормально."; return "Подобається різна проста їжа: борщ, супи, гречка з куркою, риба з рисом і салатом, вареники, пельмені, омлет. Із горіхів найбільше люблю фісташки."; }
    composeLastFoodOrderAnswer(){ const tx=(this.brain.state?.economy?.transactions||[]).filter(x=>x?.type==="expense" && /замовлення їжі|доставка їжі/iu.test(String(x.reason||""))).slice(-1)[0]; if(!tx) return "Не пригадую, коли востаннє замовляв їжу."; return tx.date?`Востаннє замовляв їжу ${tx.date}${tx.time?` о ${tx.time}`:""}.`:`Не так давно замовляв їжу.`; }
    composeRecentPurchaseAnswer(){ const tx=(this.brain.state?.economy?.transactions||[]).filter(x=>x?.type==="expense" && x?.who==="akira").slice(-1)[0]; if(!tx) return "Останнім часом нічого помітного не купував."; return `Нещодавно витрачався на ${tx.item||tx.reason||"звичайні речі"}.`; }
    composeInventoryHomeAnswer(){ const inv=this.brain.state?.inventory||{}; const shared=(inv.shared||[]).slice(0,8); const own=(inv.akira||[]).slice(0,8); const items=[...shared,...own]; return items.length?`Удома з речей є, наприклад: ${items.join(", ")}. Це не весь список.`:"Удома речей вистачає, але окремого списку зараз не тримаю в голові."; }
    composeAngryAnswer(){ const e=this.brain.state?.emotions||{}; const anger=Math.max(Number(e.anger||0),Number(e.offense||0),Number(e.disgust||0)); return anger>=60?"Так, зараз я помітно злий.":anger>=35?"Трохи роздратований, але не сказав би, що прямо злий.":"Ні, зараз не злий."; }
    composeIrritationAnswer(){ const e=this.brain.state?.emotions||{}; const anger=Math.max(Number(e.anger||0),Number(e.offense||0),Number(e.disgust||0)); if(anger<35) return "Зараз нічого конкретного сильно не дратує."; const c=this.brain.selfModel?.getPrimaryConflict?.(); return c?.text?`Мабуть, найбільше напружує те, що ${String(c.text).replace(/^[А-ЯA-Z]/u,m=>m.toLowerCase())}`:"Щось накопичилося, але однієї конкретної причини зараз не назву."; }
    composeGladUserAnswer(){ const e=this.brain.state?.emotions||{}; const joy=Math.max(Number(e.joy||0),Number(e.pleasure||0),Number(e.affection||0)); return joy>=55?"Так, радий з тобою поговорити.":"Нормально ставлюся до нашої розмови. Не буду вигадувати сильніші почуття, ніж є."; }
    composePlanObstacleAnswer(){ const g=this.brain.goalsPlanning?.currentGoal?.() || this.brain.goalsPlanning?.nextGoal?.(); if(g?.status==="paused" && g.lastChangeReason) return `Зараз заважає ${g.lastChangeReason}.`; const c=this.brain.selfModel?.getPrimaryConflict?.(); if(c) return `Може завадити те, що ${String(c.text).replace(/^[А-ЯA-Z]/u,m=>m.toLowerCase())}`; const f=Number(this.brain.state?.fatigue||0); if(f>=65) return "Найбільше може завадити втома."; return "Зараз не бачу конкретної перешкоди."; }
    composeMetacognitionTodayAnswer(){ const h=this.brain.state?.internalStream?.history||[]; const today=new Date().toLocaleDateString("sv-SE"); const xs=h.filter(x=>String(x.date||"")===today && (x.trigger==="reconsider" || /переоцін|конфлікт/iu.test(String(x.summary||"")))); if(xs.length) return "Так, сьогодні вже доводилося дещо переосмислювати."; const meta=this.brain.state?.internalStream?.meta||{}; return meta.reconsidering?"Так. Просто зараз якраз дещо переосмислюю.":"Не пригадую, щоб сьогодні серйозно передумував."; }

    composeStructuredResponse(profile) {
        // Запити, що читають живий стан, не повинні залежати від випадкового
        // dialogue action. Те саме стосується економічних подій/opinions.
        const intent = profile.analysis.intent;
        if (intent === "name_ping") return [this.composeNamePingAnswer(profile)];
        if (intent === "ask_sleeping") return [this.composeSleepingAnswer(profile)];
        if (["greet_morning","ask_current_time","check_day_period","ask_current_month","check_season","check_weekday","check_workday","ask_need_work_today","ask_is_home","ask_why_there","ask_fatigue","ask_yani_identity","ask_yani_species","ask_akira_identity_kind","ask_akira_wife","ask_yani_husband","ask_yani_relation_to_akira","ask_love_yani","ask_love_user","ask_why_with_yani","claim_user_is_wife","claim_identity_contradiction","ask_see_yani","ask_when_met_yani","ask_yani_today_together","ask_last_talk_yani","ask_sleep_desire_reason","ask_why_not_sleeping","ask_when_sleep","ask_sleep_obstacle","ask_can_go_home","ask_why_still_work","ask_previous_time_consistency","claim_user_relationship","ask_lives_with","ask_has_brother","ask_parents","ask_working_now"].includes(intent)) return [this.composeRealityAnswer(intent, profile)];
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
        if (intent === "ask_current_people") return ["З тобою."];
        if (intent === "ask_people_today") return [this.composePeopleTodayAnswer()];
        if (intent === "ask_food_today") return [this.composeFoodTodayAnswer()];
        if (intent === "ask_hour_ago") return [this.composeHourAgoAnswer()];
        if (intent === "ask_recent_conversation") return [this.composeRecentConversationAnswer()];
        if (intent === "ask_recent_good") return [this.composeSalientMemoryAnswer() || "Не пригадую зараз нічого конкретного хорошого за останній час."];
        if (intent === "ask_past_people") return [this.brain.temporalContext?.answerPeople?.("past") || this.composePastPeopleAnswer()];
        if (intent === "ask_future_people") return [this.brain.temporalContext?.answerPeople?.("future") || "Не знаю. Я ж не планую наперед кожну розмову."];
        if (intent === "ask_future_general_activity") return [this.brain.temporalContext?.answerActivity?.("future", a=>this.actionHistoryLabel(a)) || "Поки не знаю, що робитиму далі."];
        if (intent === "ask_past_location") return [this.brain.temporalContext?.answerLocation?.("past", r=>this.roomNameLocative(r)) || "Не пам'ятаю, де саме був перед цим."];
        if (intent === "ask_future_location") return [this.brain.temporalContext?.answerLocation?.("future", r=>this.roomNameLocative(r)) || "Поки не планував, куди піду далі."];
        if (intent === "ask_recent_activity") return [this.composeRecentActivityAnswer()];
        if (intent === "ask_salient_memory") return [this.composeSalientMemoryAnswer()];
        if (intent === "ask_memory_yani") return [this.composePersonMemoryAnswer("Yani_Bakeneko", "Яні")];
        if (intent === "ask_history_morning") return [this.composeHistoryAnswer("morning")];
        if (intent === "ask_history_today") return [this.composeHistoryAnswer("today")];
        if (intent === "ask_history_evening") return [this.composeHistoryAnswer("evening")];
        if (intent === "ask_history_yesterday") return [this.composeHistoryAnswer("yesterday")];
        if (intent === "ask_dream_today") return [this.composeDreamTodayAnswer()];
        if (intent === "ask_dream_yani") return [this.composeDreamYaniAnswer()];
        if (intent === "ask_nightmare_wording") return [`Може, все ж жахи? ${this.brain.dreams?.answerTopic?.("nightmare") || "Жахи іноді можливі."}`];
        if (intent === "ask_last_dream") return [this.brain.dreams?.answerLastDream?.() || "Не пам\'ятаю, що мені снилося."];
        if (intent === "ask_dreaming_general") return [this.brain.dreams?.answerDreamingGenerally?.() || "Сни іноді бувають."];
        if (intent === "ask_dream_topic") return [this.brain.dreams?.answerTopic?.(this.pendingDreamTopic || this.brain.state.dreams?.lastTopic || "general") || "Про сон можна багато говорити."];
        if (intent === "ask_mood") return [this.composeMoodAnswer()];
        if (intent === "ask_hungry") return [this.composeHungryAnswer()];
        if (intent === "ask_food_likes") return [this.composeFoodPreferenceAnswer("like")];
        if (intent === "ask_food_dislikes") return [this.composeFoodPreferenceAnswer("dislike")];
        if (intent === "ask_last_food_order") return [this.composeLastFoodOrderAnswer()];
        if (intent === "ask_recent_purchase") return [this.composeRecentPurchaseAnswer()];
        if (intent === "ask_inventory_home") return [this.composeInventoryHomeAnswer()];
        if (intent === "ask_angry") return [this.composeAngryAnswer()];
        if (intent === "ask_irritation_reason") return [this.composeIrritationAnswer()];
        if (intent === "ask_glad_user") return [this.composeGladUserAnswer()];
        if (intent === "ask_plan_obstacle") return [this.composePlanObstacleAnswer()];
        if (intent === "ask_metacognition_today") return [this.composeMetacognitionTodayAnswer()];
        if (intent === "ask_self_feeling") return [this.brain.selfModel?.describeFeeling?.() || "Зараз складно це сформулювати."];
        if (intent === "ask_self_want") return [this.brain.selfModel?.describeWant?.() || "Зараз не знаю, чого саме хочу."];
        if (intent === "ask_self_want_why") return [this.brain.selfModel?.describeWhyWant?.() || "Не знаю, як це пояснити."];
        if (intent === "ask_self_thought") return [this.brain.internalStream?.publicThought?.() || this.brain.selfModel?.describeThought?.() || "Та думаю про всяке."];
        if (intent === "ask_metacognition") return [this.brain.internalStream?.describeMetacognition?.() || "Зараз наче не переосмислюю нічого конкретного."];
        if (intent === "ask_self_model") return [this.brain.selfModel?.describeSelf?.() || "Я Акіра. Решта залежить від того, що саме ти хочеш знати."];
        if (intent === "ask_self_conflict") {
            const conflict=this.brain.selfModel?.getPrimaryConflict?.();
            return [conflict?.text || "Зараз наче ні. Немає двох сильних бажань, які тягнуть мене в різні боки."];
        }
        if (intent === "ask_learned_habits") return [this.brain.autobiographicalSelf?.answerHabit?.() || "Поки не помітив якоїсь нової сталої звички."];
        if (intent === "ask_autobiographical_self") return [this.brain.autobiographicalSelf?.answerRecentSelf?.() || "Поки не робив про себе нових висновків."];
        if (intent === "ask_self_learning") return [this.brain.autobiographicalSelf?.answerLearning?.() || "Поки замало досвіду для нового висновку."];
        if (intent === "ask_unfinished_goals") return [this.brain.autobiographicalSelf?.answerUnfinished?.() || "Зараз не бачу важливої незавершеної справи."];
        if (intent === "ask_current_health") return [this.brain.health?.describe?.() || "Нормально почуваюся."];
        if (intent === "ask_contextual_why") {
            const reply = this.brain.contextualKnowledge?.answerWhy?.();
            return [reply || "Не знаю. Просто так до цього ставлюся."];
        }
        if (intent === "ask_previous_action_reason") return [this.composePreviousActionReasonAnswer(profile)];
        if (intent === "ask_action_how") return [this.composeActionHowAnswer(profile)];
        if (intent === "ask_action_reason") return [this.composeActionReasonAnswer(profile)];
        if (intent === "ask_action_goal") return [this.composeActionGoalAnswer(profile)];
        if (intent === "ask_action_outcome") return [this.composeActionOutcomeAnswer(profile)];
        if (intent === "ask_action_next") return [this.composeActionNextAnswer(profile)];
        if (intent === "ask_current_plan") {
            const rich = this.brain.goalsPlanning?.answerPlan?.();
            if (rich) return [rich];
            const plan = this.brain.intentions?.getNextPlan?.();
            if (!plan) return ["Поки нічого конкретного не запланував."];
            const goal = this.brain.intentions?.planGoal?.(plan) || plan.actionId;
            return [`Планую ${goal} приблизно о ${plan.time}.`];
        }
        if (intent === "ask_plan_why") return [this.brain.goalsPlanning?.answerPlanWhy?.() || "Зараз немає конкретного довгого плану."];
        if (intent === "ask_plan_progress") return [this.brain.goalsPlanning?.answerPlanProgress?.() || "Зараз немає плану, який я виконую."];
        if (intent === "ask_future_activity") return [this.composeFutureActivityAnswer(profile)];
        if (["ask_birthday","ask_family_names","ask_family","ask_education","ask_home","ask_home_room","ask_current_location","ask_work_schedule","ask_commute","ask_work_attitude","ask_work_customers","ask_work_sales","ask_work_coworkers","ask_kent","ask_taras","ask_money_balance","ask_money_spending","ask_money_general","ask_health","ask_hygiene","ask_yani_relationship","ask_dreams","ask_private_countries","ask_private_why"].includes(intent)) {
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

        if (intent === "ask_contextual_knowledge") {
            const reply = this.brain.contextualKnowledge?.answer?.(profile.input);
            if (reply) return [reply];
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
        if (profile.analysis.intent === "ask_action_reason") return [this.composeActionReasonAnswer(profile)];
        if (profile.analysis.intent === "ask_action_goal") return [this.composeActionGoalAnswer(profile)];
        if (profile.analysis.intent === "ask_action_outcome") return [this.composeActionOutcomeAnswer(profile)];
        if (profile.analysis.intent === "ask_action_next") return [this.composeActionNextAnswer(profile)];
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
            "ask_action_goal",
            "ask_action_outcome",
            "ask_action_next",
            "ask_current_location",
            "ask_current_movie",
            "ask_contextual_why"
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

        // v41.1: фактичний зміст уже сформовано. Тепер емоційний шар
        // може змінити форму, довжину й теплоту репліки, не вигадуючи фактів.
        text = this.brain.emotionalExpression?.apply?.(text, profile) || text;

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
