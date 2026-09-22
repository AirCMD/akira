/*
 * mood.js
 * Поточний емоційний стан Акіри.
 *
 * Важливо:
 * - це НЕ характер;
 * - це НЕ потреби;
 * - це НЕ цілі;
 * - це НЕ рішення;
 * - це НЕ готовий текст відповіді.
 *
 * Модуль лише зберігає та оновлює поточні емоції.
 */

class AkiraMood {

    constructor(brain) {

        this.brain = brain;

        /*
         * Поточний стан емоцій.
         *
         * Формат:
         *
         * {
         *     joy: {
         *         value: 60,
         *         source: "...",
         *         lastChanged: ...,
         *         duration: 0
         *     }
         * }
         */

        this.emotions = {};

        /*
         * Історія змін.
         * Не повинна нескінченно рости.
         */

        this.history = [];

        this.maxHistory = 100;

        /*
         * Час останнього оновлення.
         */

        this.lastUpdate = Date.now();

        /*
         * Максимальний час між оновленнями,
         * щоб великий стрибок часу не створював
         * дивних значень.
         */

        this.maxDeltaHours = 24;

        /*
         * Чи ініціалізований модуль.
         */

        this.initialized = false;
    }


    /* =========================================================
       ІНІЦІАЛІЗАЦІЯ
       ========================================================= */

    async init() {

        const data =
            this.brain?.data?.emotions;

        if (!data) {

            console.warn(
                "AkiraMood: data.emotions не знайдено."
            );

            this.initialized = true;

            return this;
        }


        /*
         * У нашому emotions.json базові емоції
         * знаходяться в об'єкті baseline.
         */

        const baseline =
            data.baseline ||
            data.emotions ||
            data;


        if (
            !baseline ||
            typeof baseline !== "object"
        ) {

            console.warn(
                "AkiraMood: не вдалося знайти базові емоції."
            );

            this.initialized = true;

            return this;
        }


        for (const [name, rawValue] of Object.entries(baseline)) {

            /*
             * Якщо JSON має просто:
             *
             * "joy": 60
             *
             * це нормально.
             *
             * Якщо пізніше буде:
             *
             * "joy": {
             *     "value": 60,
             *     "decay": 2
             * }
             *
             * це теж підтримується.
             */

            const value =
                typeof rawValue === "number"
                    ? rawValue
                    : rawValue?.value ?? 0;


            this.emotions[name] = {

                value:
                    this.normalizeEmotion(value),

                baseline:
                    this.normalizeEmotion(value),

                source:
                    "baseline",

                lastChanged:
                    Date.now(),

                duration:
                    0,

                decay:
                    typeof rawValue === "object"
                        ? rawValue?.decay ?? null
                        : null
            };
        }


        /*
         * Важливо: baseline залишається окремо.
         *
         * Поточна емоція може відхилитися від нього,
         * але характер Акіри від цього не змінюється.
         */

        this.lastUpdate =
            Date.now();

        this.initialized =
            true;


        return this;
    }


    /* =========================================================
       НОРМАЛІЗАЦІЯ
       ========================================================= */

    normalizeEmotion(value) {

        const number =
            Number(value);


        if (!Number.isFinite(number)) {
            return 0;
        }


        return Math.max(
            0,
            Math.min(
                100,
                number
            )
        );
    }


    /* =========================================================
       ОТРИМАННЯ ЕМОЦІЇ
       ========================================================= */

    get(name) {

        const emotion =
            this.emotions[name];


        if (!emotion) {
            return 0;
        }


        return emotion.value;
    }


    getData(name) {

        return this.emotions[name] || null;
    }


    getState() {

        const result = {};


        for (
            const [name, emotion]
            of Object.entries(this.emotions)
        ) {

            result[name] =
                emotion.value;
        }


        return result;
    }


    /* =========================================================
       ВСТАНОВЛЕННЯ ЕМОЦІЇ
       ========================================================= */

    set(
        name,
        value,
        source = "unknown"
    ) {

        const normalized =
            this.normalizeEmotion(value);


        /*
         * Якщо емоція ще не існувала,
         * створюємо її.
         */

        if (!this.emotions[name]) {

            this.emotions[name] = {

                value:
                    normalized,

                baseline:
                    0,

                source,

                lastChanged:
                    Date.now(),

                duration:
                    0,

                decay:
                    null
            };

        } else {

            const previous =
                this.emotions[name].value;


            this.emotions[name].value =
                normalized;

            this.emotions[name].source =
                source;

            this.emotions[name].lastChanged =
                Date.now();


            /*
             * Фіксуємо лише реальну зміну.
             */

            if (
                Math.abs(
                    previous - normalized
                ) >= 0.01
            ) {

                this.recordChange(
                    name,
                    previous,
                    normalized,
                    source
                );
            }
        }


        return normalized;
    }


    /* =========================================================
       ЗМІНА ЕМОЦІЇ
       ========================================================= */

    change(
        name,
        delta,
        source = "unknown"
    ) {

        const current =
            this.get(name);


        return this.set(
            name,
            current + Number(delta || 0),
            source
        );
    }


    /* =========================================================
       ЗАПИС ЗМІНИ
       ========================================================= */

    recordChange(
        name,
        previous,
        current,
        source
    ) {

        this.history.push({

            emotion:
                name,

            previous:
                previous,

            current:
                current,

            delta:
                current - previous,

            source:
                source,

            timestamp:
                Date.now()
        });


        /*
         * Не дозволяємо історії
         * нескінченно розростатися.
         */

        if (
            this.history.length >
            this.maxHistory
        ) {

            this.history.shift();
        }
    }


    /* =========================================================
       ТРИГЕРИ
       ========================================================= */

    applyTrigger(trigger) {

        if (!trigger) {
            return;
        }


        /*
         * Варіант:
         *
         * {
         *     emotion: "joy",
         *     delta: 10,
         *     source: "goodNews"
         * }
         */

        if (
            trigger.emotion &&
            trigger.delta !== undefined
        ) {

            this.change(
                trigger.emotion,
                trigger.delta,
                trigger.source ||
                    "trigger"
            );
        }


        /*
         * Або кілька емоцій одразу:
         *
         * {
         *     changes: {
         *         joy: 10,
         *         anxiety: -5
         *     }
         * }
         */

        if (
            trigger.changes &&
            typeof trigger.changes === "object"
        ) {

            for (
                const [name, delta]
                of Object.entries(trigger.changes)
            ) {

                this.change(
                    name,
                    delta,
                    trigger.source ||
                        "trigger"
                );
            }
        }
    }


    /* =========================================================
       ПОТРЕБИ → ЕМОЦІЇ
       ========================================================= */

    applyNeedEffects() {

        const needs =
            this.brain?.state?.needs ||
            this.brain?.needs;


        if (!needs) {
            return;
        }


        /*
         * Енергія.
         */

        const energy =
            Number(needs.energy ?? 50);


        if (energy < 20) {

            this.change(
                "fatigue",
                2,
                "lowEnergy"
            );

            this.change(
                "irritation",
                0.5,
                "lowEnergy"
            );

            this.change(
                "calm",
                -0.5,
                "lowEnergy"
            );

        } else if (energy > 75) {

            this.change(
                "fatigue",
                -1,
                "highEnergy"
            );

            this.change(
                "joy",
                0.3,
                "highEnergy"
            );
        }


        /*
         * Сон.
         */

        const sleep =
            Number(needs.sleep ?? 50);


        if (sleep < 20) {

            this.change(
                "fatigue",
                2,
                "sleepDebt"
            );

            this.change(
                "irritation",
                0.7,
                "sleepDebt"
            );

            this.change(
                "calm",
                -0.7,
                "sleepDebt"
            );

        } else if (sleep > 75) {

            this.change(
                "fatigue",
                -1,
                "goodSleep"
            );

            this.change(
                "calm",
                0.5,
                "goodSleep"
            );
        }


        /*
         * Соціальна потреба.
         */

        const social =
            Number(needs.social ?? 50);


        if (social < 15) {

            this.change(
                "loneliness",
                1,
                "lowSocialNeed"
            );

        } else if (social > 75) {

            this.change(
                "loneliness",
                -1,
                "satisfiedSocialNeed"
            );
        }


        /*
         * Розваги.
         */

        const fun =
            Number(needs.fun ?? 50);


        if (fun < 15) {

            this.change(
                "boredom",
                1,
                "lowFun"
            );

        } else if (fun > 75) {

            this.change(
                "boredom",
                -1,
                "highFun"
            );
        }


        /*
         * Безпека.
         */

        const safety =
            Number(needs.safety ?? 50);


        if (safety < 30) {

            this.change(
                "anxiety",
                1.5,
                "lowSafety"
            );

            this.change(
                "fear",
                1,
                "lowSafety"
            );
        }


        /*
         * Цікавість.
         */

        const curiosity =
            Number(needs.curiosity ?? 50);


        if (curiosity > 80) {

            this.change(
                "curiosity",
                0.8,
                "highCuriosity"
            );

        } else if (curiosity < 20) {

            this.change(
                "curiosity",
                -0.5,
                "lowCuriosity"
            );
        }
    }


    /* =========================================================
       СТОСУНКИ → ЕМОЦІЇ
       ========================================================= */

    applyRelationshipEffects() {

        const relationships =
            this.brain?.state?.relationships;


        if (!relationships) {
            return;
        }


        /*
         * Стосунки не повинні постійно
         * збільшувати емоції на кожному tick.
         *
         * Тому тут використовується дуже
         * слабкий довготривалий вплив.
         */

        for (
            const [personId, relation]
            of Object.entries(relationships)
        ) {

            if (!relation) {
                continue;
            }


            const closeness =
                Number(
                    relation.closeness ??
                    0
                );


            const liking =
                Number(
                    relation.liking ??
                    0
                );


            const trust =
                Number(
                    relation.trust ??
                    0
                );


            /*
             * Близькість підтримує
             * прихильність.
             */

            if (closeness > 70) {

                this.change(
                    "attachment",
                    0.1,
                    `relationship:${personId}`
                );
            }


            /*
             * Сильна симпатія трохи
             * підтримує affection.
             */

            if (liking > 80) {

                this.change(
                    "affection",
                    0.1,
                    `relationship:${personId}`
                );
            }


            /*
             * Низька довіра може підтримувати
             * обережність.
             */

            if (trust < 20) {

                this.change(
                    "distrust",
                    0.1,
                    `relationship:${personId}`
                );
            }
        }
    }


    /* =========================================================
       ЕМОЦІЇ З ПАМ'ЯТІ
       ========================================================= */

    applyMemoryEmotion(memory) {

        if (!memory) {
            return;
        }


        /*
         * Спогад може містити:
         *
         * emotions: {
         *     joy: 70,
         *     affection: 80
         * }
         */

        if (
            memory.emotions &&
            typeof memory.emotions === "object"
        ) {

            for (
                const [name, intensity]
                of Object.entries(
                    memory.emotions
                )
            ) {

                /*
                 * Спогад не повинен миттєво
                 * встановлювати емоцію на повну силу.
                 *
                 * Він лише трохи повертає
                 * відповідний емоційний стан.
                 */

                const influence =
                    Number(intensity || 0) *
                    0.08;


                this.change(
                    name,
                    influence,
                    `memory:${memory.id || "unknown"}`
                );
            }
        }


        /*
         * Загальна емоційна інтенсивність
         * спогаду.
         */

        const intensity =
            Number(
                memory.emotionalIntensity ??
                0
            );


        if (intensity > 70) {

            this.change(
                "interest",
                0.5,
                "emotionalMemory"
            );
        }
    }


    /* =========================================================
       ДЕКАЙ ЕМОЦІЙ
       ========================================================= */

    decay(hours = 1) {

        const safeHours =
            Math.max(
                0,
                Math.min(
                    this.maxDeltaHours,
                    Number(hours) || 0
                )
            );


        if (safeHours <= 0) {
            return;
        }


        for (
            const [name, emotion]
            of Object.entries(
                this.emotions
            )
        ) {

            const current =
                emotion.value;


            const baseline =
                emotion.baseline;


            /*
             * Якщо в JSON заданий
             * власний decay — використовуємо його.
             *
             * Інакше стандартний дуже повільний
             * рух назад до baseline.
             */

            const configuredDecay =
                Number(
                    emotion.decay
                );


            const rate =
                Number.isFinite(
                    configuredDecay
                )
                    ? configuredDecay
                    : 2;


            /*
             * Емоції не повинні миттєво
             * повертатися до базового рівня.
             */

            const difference =
                baseline - current;


            const movement =
                difference *
                (rate / 100) *
                safeHours;


            /*
             * Дуже слабке згасання.
             */

            const next =
                current + movement;


            if (
                Math.abs(
                    next - current
                ) > 0.01
            ) {

                this.set(
                    name,
                    next,
                    "emotionalDecay"
                );
            }


            emotion.duration +=
                safeHours;
        }
    }


    /* =========================================================
       ОНОВЛЕННЯ
       ========================================================= */

    update(hours = null) {

        if (!this.initialized) {
            return;
        }


        let deltaHours =
            hours;


        /*
         * Якщо brain передав hours —
         * використовуємо їх.
         *
         * Інакше визначаємо реальний
         * час між оновленнями.
         */

        if (
            deltaHours === null ||
            deltaHours === undefined
        ) {

            const now =
                Date.now();


            deltaHours =
                (
                    now -
                    this.lastUpdate
                ) /
                3600000;


            this.lastUpdate =
                now;
        }


        deltaHours =
            Math.max(
                0,
                Math.min(
                    this.maxDeltaHours,
                    Number(deltaHours) || 0
                )
            );


        if (deltaHours <= 0) {
            return;
        }


        /*
         * Спочатку емоції трохи
         * повертаються до свого baseline.
         */

        this.decay(
            deltaHours
        );


        /*
         * Потім поточні потреби
         * можуть трохи змінити стан.
         */

        this.applyNeedEffects();


        /*
         * І довготривалі стосунки.
         */

        this.applyRelationshipEffects();


        /*
         * Після всіх змін нормалізуємо
         * значення.
         */

        this.normalizeAll();


        this.lastUpdate =
            Date.now();
    }


    /* =========================================================
       НОРМАЛІЗАЦІЯ ВСІХ ЕМОЦІЙ
       ========================================================= */

    normalizeAll() {

        for (
            const emotion
            of Object.values(
                this.emotions
            )
        ) {

            emotion.value =
                this.normalizeEmotion(
                    emotion.value
                );
        }
    }


    /* =========================================================
       НАЙСИЛЬНІШІ ЕМОЦІЇ
       ========================================================= */

    getDominantEmotions(limit = 5) {

        return Object.entries(
            this.emotions
        )

            .map(
                ([name, data]) => ({
                    name,
                    value:
                        data.value
                })
            )

            .sort(
                (a, b) =>
                    b.value -
                    a.value
            )

            .slice(
                0,
                limit
            );
    }


    /* =========================================================
       ПРОТИЛЕЖНІ / СУПЕРЕЧЛИВІ ЕМОЦІЇ
       ========================================================= */

    getConflictingEmotions() {

        /*
         * Це не означає, що емоції
         * реально взаємовиключні.
         *
         * Навпаки — вони можуть
         * існувати одночасно.
         */

        const conflicts = [];


        const pairs = [

            ["joy", "sadness"],

            ["calm", "anxiety"],

            ["trust", "distrust"],

            ["pleasure", "disappointment"],

            ["affection", "anger"],

            ["affection", "fear"],

            ["interest", "boredom"],

            ["confidence", "embarrassment"]

        ];


        for (
            const [first, second]
            of pairs
        ) {

            const firstValue =
                this.get(first);

            const secondValue =
                this.get(second);


            /*
             * Обидві емоції мають бути
             * достатньо сильними.
             */

            if (
                firstValue >= 55 &&
                secondValue >= 35
            ) {

                conflicts.push({

                    first,
                    firstValue,

                    second,
                    secondValue
                });
            }
        }


        return conflicts;
    }


    /* =========================================================
       ПРОФІЛЬ ВИРАЖЕННЯ
       ========================================================= */

    getExpressionProfile() {

        const dominant =
            this.getDominantEmotions(5);


        const result = {

            intensity: 0,

            expressiveness: 50,

            emotions: dominant,

            likelyExpressions: [],

            restrained: false
        };


        /*
         * Середня інтенсивність
         * найсильніших емоцій.
         */

        if (dominant.length) {

            const sum =
                dominant.reduce(
                    (total, emotion) =>
                        total +
                        emotion.value,
                    0
                );


            result.intensity =
                sum /
                dominant.length;
        }


        /*
         * Виразність залежить
         * від personality.emotionalStyle.
         */

        const emotionalStyle =
            this.brain?.data
                ?.personality
                ?.personality
                ?.emotionalStyle;


        if (emotionalStyle) {

            result.expressiveness =
                Number(
                    emotionalStyle
                        .emotionalExpressiveness
                    ?? 50
                );
        }


        /*
         * Низька виразність не означає,
         * що емоції слабкі.
         */

        result.expressiveness =
            Math.max(
                0,
                Math.min(
                    100,
                    result.expressiveness
                )
            );


        /*
         * Визначаємо можливі зовнішні прояви.
         *
         * Це не готові репліки.
         */

        for (
            const emotion
            of dominant
        ) {

            if (
                emotion.value < 45
            ) {
                continue;
            }


            switch (
                emotion.name
            ) {

                case "joy":

                    result.likelyExpressions
                        .push("пожвавлення");

                    break;


                case "sadness":

                    result.likelyExpressions
                        .push("стриманість");

                    break;


                case "anger":

                    result.likelyExpressions
                        .push("різкість");

                    break;


                case "interest":

                    result.likelyExpressions
                        .push("уважність");

                    break;


                case "curiosity":

                    result.likelyExpressions
                        .push("зацікавленість");

                    break;


                case "surprise":

                    result.likelyExpressions
                        .push("здивування");

                    break;


                case "anxiety":

                    result.likelyExpressions
                        .push("обережність");

                    break;


                case "calm":

                    result.likelyExpressions
                        .push("спокійний тон");

                    break;


                case "affection":

                    result.likelyExpressions
                        .push("тепліша реакція");

                    break;


                case "boredom":

                    result.likelyExpressions
                        .push("коротші відповіді");

                    break;


                case "embarrassment":

                    result.likelyExpressions
                        .push("ніяковіння");

                    break;
            }
        }


        /*
         * Якщо емоції сильні,
         * але виразність низька —
         * персонаж може відчувати багато,
         * але показувати мало.
         */

        result.restrained =
            result.expressiveness < 45;


        /*
         * Прибираємо дублікати.

         */

        result.likelyExpressions =
            [
                ...new Set(
                    result.likelyExpressions
                )
            ];


        return result;
    }


    /* =========================================================
       ВАЛЕНТНІСТЬ
       ========================================================= */

    getValence() {

        const positive = [

            "joy",
            "pleasure",
            "interest",
            "curiosity",
            "admiration",
            "relief",
            "trust",
            "sympathy",
            "affection",
            "attachment",
            "tenderness",
            "gratitude",
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
            "distrust"

        ];


        let positiveValue = 0;
        let negativeValue = 0;


        for (
            const name
            of positive
        ) {

            positiveValue +=
                this.get(name);
        }


        for (
            const name
            of negative
        ) {

            negativeValue +=
                this.get(name);
        }


        const total =
            positiveValue +
            negativeValue;


        if (total <= 0) {
            return 0;
        }


        /*
         * Результат:
         *
         * -100 = дуже негативно
         *   0  = нейтрально
         * +100 = дуже позитивно
         */

        return (
            (
                positiveValue -
                negativeValue
            ) /
            total
        ) * 100;
    }


    /* =========================================================
       ЗБУДЖЕНІСТЬ
       ========================================================= */

    getArousal() {

        const highArousal = [

            "anger",
            "fear",
            "surprise",
            "joy",
            "anxiety",
            "enthusiasm",
            "interest",
            "curiosity"

        ];


        const lowArousal = [

            "calm",
            "sadness",
            "boredom",
            "relief",
            "sleepiness"

        ];


        let high = 0;
        let low = 0;


        for (
            const name
            of highArousal
        ) {

            high +=
                this.get(name);
        }


        for (
            const name
            of lowArousal
        ) {

            low +=
                this.get(name);
        }


        const total =
            high + low;


        if (total <= 0) {
            return 50;
        }


        /*
         * 0 = дуже низька збудженість
         * 100 = дуже висока
         */

        return (
            high /
            total
        ) * 100;
    }


    /* =========================================================
       ПОВЕДІНКОВІ МОДИФІКАТОРИ
       ========================================================= */

    getBehaviorModifiers() {

        const joy =
            this.get("joy");

        const sadness =
            this.get("sadness");

        const anger =
            this.get("anger");

        const fear =
            this.get("fear");

        const interest =
            this.get("interest");

        const curiosity =
            this.get("curiosity");

        const anxiety =
            this.get("anxiety");

        const calm =
            this.get("calm");

        const boredom =
            this.get("boredom");

        const affection =
            this.get("affection");

        const fatigue =
            this.get("fatigue");


        return {

            /*
             * Наскільки охоче взаємодіє.
             */

            socialActivity:
                this.calculateModifier(
                    joy +
                    interest +
                    affection +
                    calm -
                    anxiety -
                    sadness
                ),


            /*
             * Бажання говорити.
             */

            talkativeness:
                this.calculateModifier(
                    joy +
                    interest +
                    curiosity -
                    sadness -
                    boredom -
                    fatigue
                ),


            /*
             * Ініціатива.
             */

            initiative:
                this.calculateModifier(
                    joy +
                    curiosity +
                    interest -
                    anxiety -
                    fatigue
                ),


            /*
             * Обережність.
             */

            caution:
                this.calculateModifier(
                    anxiety +
                    fear +
                    distrust
                ),


            /*
             * Терпіння.
             */

            patience:
                this.calculateModifier(
                    calm +
                    joy -
                    anger -
                    fatigue
                ),


            /*
             * Потреба змінити заняття.
             */

            noveltySeeking:
                this.calculateModifier(
                    curiosity +
                    boredom +
                    interest
                ),


            /*
             * Ймовірність короткої відповіді.
             */

            shortResponse:
                this.calculateModifier(
                    boredom +
                    fatigue +
                    sadness +
                    anxiety
                ),


            /*
             * Емоційна виразність.
             */

            expressiveness:
                this.getExpressionProfile()
                    .expressiveness
        };
    }


    calculateModifier(value) {

        /*
         * Вхідні суми можуть бути >100,
         * тому переводимо їх приблизно
         * у діапазон -1...+1.
         */

        const normalized =
            Math.max(
                -100,
                Math.min(
                    100,
                    Number(value) || 0
                )
            );


        return normalized / 100;
    }


    /* =========================================================
       ОСТАННІ ЗМІНИ
       ========================================================= */

    getRecentChanges(limit = 10) {

        return this.history
            .slice(-limit)
            .reverse();
    }


    /* =========================================================
       СКИДАННЯ ДО BASELINE
       ========================================================= */

    resetToBaseline() {

        for (
            const emotion
            of Object.values(
                this.emotions
            )
        ) {

            emotion.value =
                emotion.baseline;

            emotion.source =
                "baselineReset";

            emotion.lastChanged =
                Date.now();

            emotion.duration =
                0;
        }


        this.lastUpdate =
            Date.now();
    }


    /* =========================================================
       ЗБЕРЕЖЕННЯ СТАНУ
       ========================================================= */

    getSerializableState() {

        return {

            emotions:
                JSON.parse(
                    JSON.stringify(
                        this.emotions
                    )
                ),

            history:
                this.history.slice(
                    -this.maxHistory
                ),

            lastUpdate:
                this.lastUpdate
        };
    }


    /* =========================================================
       ВІДНОВЛЕННЯ СТАНУ
       ========================================================= */

    loadState(state) {

        if (!state) {
            return;
        }


        if (
            state.emotions &&
            typeof state.emotions === "object"
        ) {

            this.emotions =
                JSON.parse(
                    JSON.stringify(
                        state.emotions
                    )
                );
        }


        if (
            Array.isArray(
                state.history
            )
        ) {

            this.history =
                state.history.slice(
                    -this.maxHistory
                );
        }


        if (
            Number.isFinite(
                state.lastUpdate
            )
        ) {

            this.lastUpdate =
                state.lastUpdate;
        }


        this.normalizeAll();
    }
}


/*
 * Робимо клас доступним
 * для brain.js та інших модулів.
 */

window.AkiraMood =
    AkiraMood;
