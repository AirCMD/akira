/*
 * Akira Mood Engine
 *
 * Відповідає тільки за емоційний стан.
 *
 * mood.js НЕ:
 * - генерує репліки;
 * - не обирає дії;
 * - не містить конкретних персонажів;
 * - не містить сюжетних правил;
 * - не замінює personality.json.
 *
 * Розділення:
 *
 * emotions.json
 *      ↓
 * baseline — базові емоційні схильності
 *      ↓
 * current — поточний емоційний стан
 *      ↓
 * effects — тимчасові впливи
 *      ↓
 * behaviorModifiers — вплив емоцій на поведінку
 *
 * Емоція ≠ дія.
 * Емоція ≠ особистість.
 * Емоція ≠ один загальний "настрій".
 */

class AkiraMood {

    constructor(brain) {

        this.brain = brain;

        this.baseline = {};
        this.current = {};
        this.effects = [];

        this.history = [];

        this.maxHistory = 100;

        this.lastUpdate = null;

        this.initialized = false;

        this.settings = {
            min: 0,
            max: 100,

            /*
             * Наскільки швидко поточна емоція
             * повертається до baseline.
             */
            naturalReturnPerHour: 4,

            /*
             * Наскільки швидко згасають тимчасові ефекти.
             */
            effectDecayPerHour: 12,

            /*
             * Мінімальна сила ефекту, після якої
             * його можна видалити.
             */
            effectThreshold: 0.5,

            /*
             * Скільки історії тримати.
             */
            maxHistory: 100
        };
    }


    /* =========================================================
       INITIALIZATION
       ========================================================= */

    init() {

        const data =
            this.brain?.data?.emotions || {};

        this.loadSettings(data);

        this.loadBaseline(data);

        this.loadCurrentState(data);

        this.lastUpdate = Date.now();

        this.initialized = true;

        this.syncToBrain();

        return this;
    }


    loadSettings(data) {

        const system =
            data.system ||
            data.settings ||
            {};

        if (
            typeof system.naturalReturnPerHour ===
            "number"
        ) {
            this.settings.naturalReturnPerHour =
                system.naturalReturnPerHour;
        }

        if (
            typeof system.effectDecayPerHour ===
            "number"
        ) {
            this.settings.effectDecayPerHour =
                system.effectDecayPerHour;
        }

        if (
            typeof system.effectThreshold ===
            "number"
        ) {
            this.settings.effectThreshold =
                system.effectThreshold;
        }

        if (
            typeof system.maxHistory ===
            "number"
        ) {
            this.settings.maxHistory =
                system.maxHistory;
        }
    }


    loadBaseline(data) {

        const source =
            data.baseline ||
            data.base ||
            data.emotions ||
            data;

        this.baseline = {};

        if (
            !source ||
            typeof source !== "object"
        ) {
            return;
        }

        for (const [emotion, value] of Object.entries(source)) {

            const normalized =
                this.extractEmotionValue(value);

            if (normalized !== null) {

                this.baseline[emotion] =
                    this.clamp(
                        normalized
                    );
            }
        }
    }


    loadCurrentState(data) {

        this.current = {};

        /*
         * Спочатку baseline.
         */
        for (const [emotion, value] of Object.entries(
            this.baseline
        )) {

            this.current[emotion] =
                value;
        }


        /*
         * Якщо з emotions.json є початковий
         * поточний стан — він має перевагу.
         */
        const source =
            data.current ||
            data.initial ||
            data.state ||
            null;

        if (
            source &&
            typeof source === "object"
        ) {

            for (
                const [emotion, value]
                of Object.entries(source)
            ) {

                const normalized =
                    this.extractEmotionValue(value);

                if (normalized !== null) {

                    this.current[emotion] =
                        this.clamp(
                            normalized
                        );
                }
            }
        }
    }


    extractEmotionValue(value) {

        if (typeof value === "number") {
            return value;
        }

        if (
            value &&
            typeof value === "object"
        ) {

            if (
                typeof value.value ===
                "number"
            ) {
                return value.value;
            }

            if (
                typeof value.intensity ===
                "number"
            ) {
                return value.intensity;
            }

            if (
                typeof value.baseline ===
                "number"
            ) {
                return value.baseline;
            }
        }

        return null;
    }


    /* =========================================================
       BASIC ACCESS
       ========================================================= */

    get(emotion) {

        if (
            typeof this.current[emotion] !==
            "number"
        ) {
            return 0;
        }

        return this.current[emotion];
    }


    getBaseline(emotion) {

        if (
            typeof this.baseline[emotion] !==
            "number"
        ) {
            return 0;
        }

        return this.baseline[emotion];
    }


    set(
        emotion,
        value,
        source = "system"
    ) {

        if (!emotion) {
            return;
        }

        const oldValue =
            this.get(emotion);

        const newValue =
            this.clamp(value);

        this.current[emotion] =
            newValue;

        this.recordChange(
            emotion,
            oldValue,
            newValue,
            source
        );

        this.syncToBrain();
    }


    change(
        emotion,
        delta,
        source = "system"
    ) {

        if (
            typeof delta !==
            "number"
        ) {
            return;
        }

        this.set(
            emotion,
            this.get(emotion) + delta,
            source
        );
    }


    /* =========================================================
       TEMPORARY EFFECTS
       ========================================================= */

    addEffect({

        emotion,

        amount = 0,

        duration = 60,

        source = "unknown",

        decay = null,

        id = null

    } = {}) {

        if (!emotion) {
            return null;
        }

        /*
         * Важливо:
         *
         * effect НЕ додається до current одразу
         * назавжди.
         *
         * Він живе окремо, а current обчислюється
         * з урахуванням активних ефектів.
         */

        const effect = {

            id:
                id ||
                this.generateId(),

            emotion,

            amount,

            remaining:
                Math.max(
                    0,
                    Number(duration) || 0
                ),

            originalDuration:
                Math.max(
                    0,
                    Number(duration) || 0
                ),

            source,

            decay:
                typeof decay === "number"
                    ? decay
                    : this.settings.effectDecayPerHour,

            createdAt:
                this.getTimestamp()
        };


        this.effects.push(effect);

        this.recordChange(
            emotion,
            this.get(emotion),
            this.getEffectiveValue(emotion),
            `effect:${source}`
        );

        this.syncToBrain();

        return effect;
    }


    removeEffect(effectId) {

        const index =
            this.effects.findIndex(
                effect =>
                    effect.id === effectId
            );

        if (index === -1) {
            return false;
        }

        this.effects.splice(
            index,
            1
        );

        this.syncToBrain();

        return true;
    }


    clearEffects(source = null) {

        if (!source) {
            this.effects = [];
        } else {

            this.effects =
                this.effects.filter(
                    effect =>
                        effect.source !== source
                );
        }

        this.recalculateCurrent();

        this.syncToBrain();
    }


    updateEffects(minutes) {

        if (
            !Number.isFinite(minutes) ||
            minutes <= 0
        ) {
            return;
        }

        for (const effect of this.effects) {

            effect.remaining -=
                minutes;

            /*
             * Ефект не зменшуємо вдвічі кожен
             * tick. Його сила залишається
             * стабільною до моменту завершення.
             *
             * Тривалість відповідає часу життя.
             */
        }

        this.effects =
            this.effects.filter(
                effect =>
                    effect.remaining >
                    0 &&
                    Math.abs(effect.amount) >=
                    this.settings.effectThreshold
            );
    }


    getEffectiveValue(emotion) {

        const base =
            this.current[emotion] ??
            this.baseline[emotion] ??
            0;

        let value = base;

        for (const effect of this.effects) {

            if (
                effect.emotion !== emotion
            ) {
                continue;
            }

            value +=
                effect.amount;
        }

        return this.clamp(value);
    }


    recalculateCurrent() {

        /*
         * Current не перераховується просто
         * як baseline + effects, бо current
         * може містити самостійний емоційний стан.
         *
         * Тут лише обмежуємо значення.
         */

        for (const emotion of Object.keys(
            this.current
        )) {

            this.current[emotion] =
                this.clamp(
                    this.current[emotion]
                );
        }
    }


    /* =========================================================
       NATURAL RETURN TO BASELINE
       ========================================================= */

    returnTowardBaseline(minutes) {

        if (
            !Number.isFinite(minutes) ||
            minutes <= 0
        ) {
            return;
        }

        const perHour =
            this.settings.naturalReturnPerHour;

        const amount =
            perHour *
            (minutes / 60);


        for (const emotion of Object.keys(
            this.baseline
        )) {

            const base =
                this.baseline[emotion];

            const current =
                this.current[emotion] ??
                base;

            const difference =
                base - current;

            if (
                Math.abs(difference) <
                0.01
            ) {
                continue;
            }

            /*
             * Не допускаємо миттєвого стрибка.
             */
            const step =
                Math.min(
                    Math.abs(difference),
                    amount
                );

            const direction =
                difference > 0
                    ? 1
                    : -1;

            this.current[emotion] =
                this.clamp(
                    current +
                    step *
                    direction
                );
        }
    }


    /* =========================================================
       NEEDS
       ========================================================= */

    updateFromNeeds() {

        const needs =
            this.brain?.state?.needs ||
            {};

        /*
         * Тут немає жорсткого сценарію.
         *
         * Потреба впливає на емоцію,
         * але не перетворюється автоматично
         * на дію.
         */

        const hunger =
            this.readNeed(
                needs,
                "hunger"
            );

        const thirst =
            this.readNeed(
                needs,
                "thirst"
            );

        const sleep =
            this.readNeed(
                needs,
                "sleep"
            );

        const social =
            this.readNeed(
                needs,
                "social"
            );

        const fun =
            this.readNeed(
                needs,
                "fun"
            );

        const curiosity =
            this.readNeed(
                needs,
                "curiosity"
            );


        /*
         * Голод.
         */
        this.applyNeedInfluence(
            "hunger",
            hunger,
            {
                lowThreshold: 65,
                emotion: "irritation",
                amount: 4
            }
        );


        /*
         * Спрага.
         */
        this.applyNeedInfluence(
            "thirst",
            thirst,
            {
                lowThreshold: 65,
                emotion: "irritation",
                amount: 3
            }
        );


        /*
         * Недосип.
         */
        if (sleep > 70) {

            this.change(
                "fatigue",
                2,
                "need:sleep"
            );

        } else if (sleep < 30) {

            this.change(
                "anxiety",
                1.5,
                "need:sleep"
            );
        }


        /*
         * Низька соціальна потреба.
         */
        if (social > 75) {

            this.change(
                "loneliness",
                1.2,
                "need:social"
            );
        }


        /*
         * Низька потреба у розвазі.
         */
        if (fun > 75) {

            this.change(
                "boredom",
                1.2,
                "need:fun"
            );
        }


        /*
         * Нереалізована цікавість.
         */
        if (curiosity > 75) {

            this.change(
                "curiosity",
                1.5,
                "need:curiosity"
            );
        }
    }


    applyNeedInfluence(
        needName,
        value,
        config
    ) {

        if (
            typeof value !== "number"
        ) {
            return;
        }

        if (
            value >= config.lowThreshold
        ) {

            this.change(
                config.emotion,
                config.amount *
                0.05,
                `need:${needName}`
            );
        }
    }


    readNeed(
        needs,
        name
    ) {

        const value =
            needs[name];

        if (typeof value === "number") {
            return value;
        }

        if (
            value &&
            typeof value.value === "number"
        ) {
            return value.value;
        }

        return 50;
    }


    /* =========================================================
       BEHAVIOR MODIFIERS
       ========================================================= */

    getBehaviorModifiers() {

        const emotions =
            this.current;

        const get =
            name =>
                Number(
                    emotions[name] ??
                    this.baseline[name] ??
                    0
                );


        /*
         * Базове значення 50 означає нейтральність.
         *
         * 70 → сильний вплив
         * 30 → протилежний вплив
         */

        const socialInitiative =
            this.clamp(
                50 +

                (get("joy") - 50) * 0.30 +

                (get("affection") - 50) * 0.30 +

                (get("loneliness") - 50) * 0.25 -

                (get("anxiety") - 50) * 0.35 -

                (get("anger") - 50) * 0.15
            );


        const exploration =
            this.clamp(
                50 +

                (get("curiosity") - 50) * 0.55 +

                (get("interest") - 50) * 0.25 +

                (get("surprise") - 50) * 0.10 +

                (get("fear") - 50) * -0.30 +

                (get("anxiety") - 50) * -0.20
            );


        const activityDrive =
            this.clamp(
                50 +

                (get("joy") - 50) * 0.20 +

                (get("interest") - 50) * 0.30 +

                (get("enthusiasm") - 50) * 0.35 +

                (get("boredom") - 50) * 0.30 +

                (get("fatigue") - 50) * -0.45 +

                (get("anxiety") - 50) * -0.15
            );


        const communicationDrive =
            this.clamp(
                50 +

                (get("joy") - 50) * 0.20 +

                (get("interest") - 50) * 0.25 +

                (get("affection") - 50) * 0.30 +

                (get("loneliness") - 50) * 0.25 +

                (get("boredom") - 50) * 0.10 -

                (get("fatigue") - 50) * 0.25
            );


        const caution =
            this.clamp(
                50 +

                (get("fear") - 50) * 0.55 +

                (get("anxiety") - 50) * 0.45 +

                (get("distrust") - 50) * 0.30 +

                (get("anger") - 50) * 0.10
            );


        const emotionalExpressiveness =
            this.clamp(
                50 +

                (get("joy") - 50) * 0.25 +

                (get("sadness") - 50) * 0.15 +

                (get("affection") - 50) * 0.30 +

                (get("anger") - 50) * 0.15 +

                (get("surprise") - 50) * 0.15
            );


        return {

            socialInitiative,

            exploration,

            activityDrive,

            communicationDrive,

            caution,

            emotionalExpressiveness
        };
    }


    /* =========================================================
       VALENCE / AROUSAL
       ========================================================= */

    getValence() {

        /*
         * Valence — умовний напрямок емоційного стану,
         * але НЕ є "загальним настроєм".
         *
         * Він лише допомагає іншим системам
         * оцінити загальний емоційний фон.
         */

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
            "pride",
            "enthusiasm"
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


        let positiveSum = 0;
        let negativeSum = 0;

        for (const emotion of positive) {
            positiveSum +=
                this.get(emotion);
        }

        for (const emotion of negative) {
            negativeSum +=
                this.get(emotion);
        }


        const total =
            positiveSum +
            negativeSum;


        if (total <= 0) {
            return 0;
        }


        return this.clamp(
            (
                (
                    positiveSum -
                    negativeSum
                ) /
                total
            ) *
            100,
            -100,
            100
        );
    }


    getArousal() {

        const high = [
            "anger",
            "fear",
            "surprise",
            "enthusiasm",
            "joy",
            "anxiety",
            "curiosity"
        ];

        const low = [
            "calm",
            "sadness",
            "boredom",
            "relief"
        ];


        let highSum = 0;
        let lowSum = 0;


        for (const emotion of high) {
            highSum +=
                this.get(emotion);
        }

        for (const emotion of low) {
            lowSum +=
                this.get(emotion);
        }


        const total =
            highSum +
            lowSum;


        if (total <= 0) {
            return 50;
        }


        return this.clamp(
            50 +
            (
                (
                    highSum -
                    lowSum
                ) /
                total
            ) *
            50
        );
    }


    /* =========================================================
       DOMINANT EMOTIONS
       ========================================================= */

    getDominantEmotions(
        limit = 5
    ) {

        const emotions =
            Object.keys(
                this.current
            )
            .map(name => {

                const value =
                    this.get(name);

                const baseline =
                    this.getBaseline(name);

                /*
                 * Важлива відмінність:
                 *
                 * 90 calm при baseline 90
                 * не обов'язково важливіше,
                 * ніж curiosity 75 при baseline 40.
                 *
                 * Тому враховуємо відхилення.
                 */

                const deviation =
                    Math.abs(
                        value - baseline
                    );

                const salience =
                    value * 0.35 +
                    deviation * 0.65;


                return {
                    emotion: name,
                    value,
                    baseline,
                    deviation,
                    salience
                };
            })
            .sort(
                (a, b) =>
                    b.salience -
                    a.salience
            );


        return emotions.slice(
            0,
            limit
        );
    }


    getConflictingEmotions() {

        const conflicts = [];


        this.checkConflict(
            conflicts,
            "joy",
            "sadness"
        );

        this.checkConflict(
            conflicts,
            "trust",
            "distrust"
        );

        this.checkConflict(
            conflicts,
            "affection",
            "anger"
        );

        this.checkConflict(
            conflicts,
            "curiosity",
            "fear"
        );

        this.checkConflict(
            conflicts,
            "attachment",
            "loneliness"
        );

        this.checkConflict(
            conflicts,
            "interest",
            "boredom"
        );


        return conflicts;
    }


    checkConflict(
        result,
        first,
        second
    ) {

        const a =
            this.get(first);

        const b =
            this.get(second);


        if (
            a >= 45 &&
            b >= 45
        ) {

            result.push({
                emotions: [
                    first,
                    second
                ],

                intensity:
                    Math.min(
                        a,
                        b
                    )
            });
        }
    }


    /* =========================================================
       REACTIONS
       ========================================================= */

    reactToPerson(
        person,
        context = {}
    ) {

        if (!person) {
            return;
        }


        /*
         * Тут немає перевірки "якщо це Яні".
         *
         * Стосунки передаються сюди вже
         * як дані конкретної людини.
         */

        const relationship =
            this.findRelationship(
                person
            );


        if (!relationship) {
            return;
        }


        const liking =
            Number(
                relationship.liking ||
                0
            );

        const affection =
            Number(
                relationship.affection ||
                0
            );

        const trust =
            Number(
                relationship.trust ||
                0
            );

        const irritation =
            Number(
                relationship.irritation ||
                0
            );


        if (liking > 60) {

            this.addEffect({
                emotion: "sympathy",
                amount:
                    liking * 0.05,
                duration: 30,
                source: "person:liking"
            });
        }


        if (affection > 70) {

            this.addEffect({
                emotion: "affection",
                amount:
                    affection * 0.06,
                duration: 30,
                source: "person:affection"
            });
        }


        if (trust > 70) {

            this.addEffect({
                emotion: "trust",
                amount:
                    trust * 0.04,
                duration: 30,
                source: "person:trust"
            });
        }


        if (irritation > 60) {

            this.addEffect({
                emotion: "anger",
                amount:
                    irritation * 0.05,
                duration: 30,
                source: "person:irritation"
            });
        }
    }


    findRelationship(person) {

        const id =
            typeof person === "string"
                ? person
                : person.id ||
                  person.personId ||
                  null;


        if (!id) {
            return null;
        }


        return (
            this.brain?.state?.relationships?.[id] ||
            null
        );
    }


    reactToEvent(
        event
    ) {

        if (!event) {
            return;
        }


        const effects =
            event.emotionalEffects ||
            event.emotions ||
            null;


        if (
            effects &&
            typeof effects === "object"
        ) {

            for (
                const [emotion, amount]
                of Object.entries(effects)
            ) {

                if (
                    typeof amount !==
                    "number"
                ) {
                    continue;
                }


                this.addEffect({

                    emotion,

                    amount,

                    duration:
                        Number(
                            event.emotionDuration
                        ) ||
                        60,

                    source:
                        `event:${event.id || "unknown"}`
                });
            }
        }
    }


    reactToMemory(
        memory
    ) {

        if (!memory) {
            return;
        }


        const emotions =
            memory.emotions ||
            {};


        for (
            const [emotion, intensity]
            of Object.entries(emotions)
        ) {

            if (
                typeof intensity !==
                "number"
            ) {
                continue;
            }


            this.addEffect({

                emotion,

                amount:
                    intensity * 0.25,

                duration: 45,

                source:
                    `memory:${memory.id || "unknown"}`
            });
        }
    }


    /* =========================================================
       WEATHER
       ========================================================= */

    updateFromWeather(
        weather
    ) {

        if (!weather) {
            return;
        }


        const effects =
            weather.emotionalEffects ||
            weather.moodEffects ||
            null;


        if (
            effects &&
            typeof effects === "object"
        ) {

            for (
                const [emotion, amount]
                of Object.entries(effects)
            ) {

                if (
                    typeof amount !==
                    "number"
                ) {
                    continue;
                }


                this.addEffect({

                    emotion,

                    amount,

                    duration: 60,

                    source:
                        "weather"
                });
            }

            return;
        }


        /*
         * Якщо weather.json має тільки
         * базові характеристики — не вигадуємо
         * конкретні емоції.
         *
         * decision.js зможе використати
         * саму погоду окремо.
         */
    }


    /* =========================================================
       ACTIVITY
       ========================================================= */

    updateFromActivity(
        activity
    ) {

        if (!activity) {
            return;
        }


        const effects =
            activity.emotionalEffects ||
            activity.moodEffects ||
            null;


        if (
            effects &&
            typeof effects === "object"
        ) {

            for (
                const [emotion, amount]
                of Object.entries(effects)
            ) {

                if (
                    typeof amount !==
                    "number"
                ) {
                    continue;
                }


                this.addEffect({

                    emotion,

                    amount,

                    duration:
                        Number(
                            activity.duration
                        ) ||
                        30,

                    source:
                        `activity:${
                            activity.id ||
                            "unknown"
                        }`
                });
            }
        }
    }


    /* =========================================================
       UPDATE
       ========================================================= */

    update(minutes = null) {

        if (!this.initialized) {
            this.init();
        }


        if (
            !Number.isFinite(minutes)
        ) {

            const now =
                Date.now();

            minutes =
                this.lastUpdate
                    ? (
                        now -
                        this.lastUpdate
                    ) / 60000
                    : 1;

            this.lastUpdate =
                now;
        }


        minutes =
            Math.max(
                0,
                Math.min(
                    60,
                    minutes
                )
            );


        /*
         * 1. Тимчасові ефекти живуть
         *    визначений час.
         */
        this.updateEffects(
            minutes
        );


        /*
         * 2. Поточні емоції повільно
         *    повертаються до baseline.
         */
        this.returnTowardBaseline(
            minutes
        );


        /*
         * 3. Потреби можуть створювати
         *    невеликий емоційний тиск.
         *
         * Важливо: це не викликається
         * нескінченним накопиченням.
         */
        this.updateFromNeeds();


        /*
         * 4. Перераховуємо значення.
         */
        this.recalculateCurrent();


        /*
         * 5. Передаємо brain поточний стан.
         */
        this.syncToBrain();
    }


    /* =========================================================
       EXPRESSION
       ========================================================= */

    getExpressionModifier() {

        const modifiers =
            this.getBehaviorModifiers();


        return {

            expressiveness:
                modifiers.emotionalExpressiveness,

            socialInitiative:
                modifiers.socialInitiative,

            communicationDrive:
                modifiers.communicationDrive,

            exploration:
                modifiers.exploration,

            activityDrive:
                modifiers.activityDrive,

            caution:
                modifiers.caution,

            valence:
                this.getValence(),

            arousal:
                this.getArousal()
        };
    }


    /* =========================================================
       FULL STATE
       ========================================================= */

    getState() {

        const effective = {};

        for (
            const emotion of Object.keys(
                this.current
            )
        ) {

            effective[emotion] =
                this.getEffectiveValue(
                    emotion
                );
        }


        return {

            emotions: {
                ...effective
            },

            baseline: {
                ...this.baseline
            },

            current: {
                ...this.current
            },

            effects:
                this.effects.map(
                    effect => ({
                        ...effect
                    })
                ),

            behaviorModifiers:
                this.getBehaviorModifiers(),

            valence:
                this.getValence(),

            arousal:
                this.getArousal(),

            dominant:
                this.getDominantEmotions(),

            conflicts:
                this.getConflictingEmotions()
        };
    }


    /* =========================================================
       BRAIN SYNCHRONIZATION
       ========================================================= */

    syncToBrain() {

        if (!this.brain?.state) {
            return;
        }


        const effective = {};


        for (
            const emotion of Object.keys(
                this.current
            )
        ) {

            effective[emotion] =
                this.getEffectiveValue(
                    emotion
                );
        }


        this.brain.state.emotions =
            effective;


        /*
         * Не копіюємо сюди baseline,
         * effects та всю внутрішню структуру.
         *
         * brain.state.emotions —
         * тільки актуальний стан,
         * доступний іншим системам.
         */
    }


    /* =========================================================
       HISTORY
       ========================================================= */

    recordChange(
        emotion,
        oldValue,
        newValue,
        source
    ) {

        if (
            !Number.isFinite(oldValue) ||
            !Number.isFinite(newValue)
        ) {
            return;
        }


        if (
            Math.abs(
                newValue -
                oldValue
            ) < 0.01
        ) {
            return;
        }


        this.history.unshift({

            emotion,

            from:
                oldValue,

            to:
                newValue,

            delta:
                newValue -
                oldValue,

            source,

            timestamp:
                this.getTimestamp()
        });


        this.history =
            this.history.slice(
                0,
                this.settings.maxHistory
            );
    }


    getHistory(
        limit = 20
    ) {

        return this.history.slice(
            0,
            limit
        );
    }


    /* =========================================================
       HELPERS
       ========================================================= */

    clamp(
        value,
        min = this.settings.min,
        max = this.settings.max
    ) {

        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return min;
        }

        return Math.max(
            min,
            Math.min(
                max,
                number
            )
        );
    }


    generateId() {

        return (
            "effect_" +
            Date.now().toString(36) +
            "_" +
            Math.random()
                .toString(36)
                .slice(2, 8)
        );
    }


    getTimestamp() {

        if (
            this.brain &&
            typeof this.brain.getCurrentTimestamp ===
            "function"
        ) {

            return this.brain.getCurrentTimestamp();
        }

        return {
            realTime:
                new Date().toISOString()
        };
    }
}


/* =========================================================
   GLOBAL EXPORT
   ========================================================= */

window.AkiraMood =
    AkiraMood;
