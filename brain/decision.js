/*
 * Akira Decision Engine
 *
 * Вибирає дію на основі поточного стану персонажа.
 *
 * decision.js НЕ:
 * - генерує текст;
 * - не містить характер конкретного персонажа;
 * - не знає імен конкретних людей;
 * - не визначає особистість;
 * - не замінює personality.json;
 *
 * Він лише відповідає на питання:
 *
 * "Які дії зараз мають сенс для персонажа
 *  і яка з них найбільш доречна?"
 *
 * Рішення багатовимірне:
 *
 * потреби
 * цілі
 * емоції
 * інтереси
 * уподобання
 * звички
 * погода
 * час
 * стосунки
 * цікавість
 * новизна
 * поточний стан
 * повторюваність
 * випадкова варіативність
 *
 * Жоден фактор не є абсолютним.
 */

class AkiraDecision {

    constructor(brain) {

        this.brain = brain;

        this.actions = {};

        this.history = [];

        this.maxHistory = 100;

        this.settings = {

            /*
             * Наскільки сильно випадковість
             * може змінити оцінку.
             *
             * Це не випадковий вибір дії.
             */
            randomness: 8,

            /*
             * Штраф за повторення.
             */
            repetitionPenalty: 25,

            /*
             * Скільки найкращих кандидатів
             * допускаємо до варіативного вибору.
             */
            selectionPool: 5,

            /*
             * Мінімальний бал, нижче якого
             * дія практично не розглядається.
             */
            minimumScore: -100,

            /*
             * Вага факторів.
             *
             * Це не "оцінка персонажа".
             * Це лише сила конкретного фактора
             * в механізмі прийняття рішення.
             */
            weights: {

                needs: 1.35,

                goals: 1.25,

                emotions: 0.85,

                interests: 0.90,

                preferences: 0.75,

                habits: 0.45,

                weather: 0.65,

                time: 0.70,

                relationships: 0.90,

                curiosity: 0.55,

                novelty: 0.35,

                state: 0.90,

                repetition: 1.00
            }
        };
    }


    /* =========================================================
       INITIALIZATION
       ========================================================= */

    init() {

        this.loadSettings();

        this.loadActions();

        return this;
    }


    loadSettings() {

        const data =
            this.brain?.data?.rules ||
            {};

        const decision =
            data.decision ||
            data.decisionSystem ||
            {};

        if (
            typeof decision.randomness ===
            "number"
        ) {
            this.settings.randomness =
                decision.randomness;
        }

        if (
            typeof decision.repetitionPenalty ===
            "number"
        ) {
            this.settings.repetitionPenalty =
                decision.repetitionPenalty;
        }

        if (
            typeof decision.selectionPool ===
            "number"
        ) {
            this.settings.selectionPool =
                decision.selectionPool;
        }


        if (
            decision.weights &&
            typeof decision.weights ===
            "object"
        ) {

            this.settings.weights = {
                ...this.settings.weights,
                ...decision.weights
            };
        }
    }


    /* =========================================================
       ACTION LOADING
       ========================================================= */

    loadActions() {

        this.actions = {};

        const data =
            this.brain?.data?.activities ||
            {};

        const source =
            data.activities ||
            data.actions ||
            data.list ||
            data;


        /*
         * Масив дій.
         */
        if (Array.isArray(source)) {

            for (const action of source) {

                if (!this.isValidAction(action)) {
                    continue;
                }

                const id =
                    action.id ||
                    action.actionId;

                this.actions[id] = {
                    ...action,
                    id
                };
            }
        }


        /*
         * Об'єкт:
         *
         * {
         *   "sleep": {...},
         *   "walk": {...}
         * }
         */
        else if (
            source &&
            typeof source === "object"
        ) {

            for (
                const [id, action]
                of Object.entries(source)
            ) {

                if (
                    !action ||
                    typeof action !== "object"
                ) {
                    continue;
                }


                /*
                 * Не дозволяємо службовим
                 * полям стати діями.
                 */
                if (
                    this.isMetadataKey(id)
                ) {
                    continue;
                }


                /*
                 * Якщо це схоже на конфіг,
                 * а не на діяльність — пропускаємо.
                 */
                if (
                    !this.looksLikeAction(
                        id,
                        action
                    )
                ) {
                    continue;
                }


                this.actions[id] = {
                    ...action,
                    id
                };
            }
        }


        /*
         * Резервні базові дії.
         *
         * Вони не замінюють activities.json.
         * Потрібні лише, щоб рушій не зламався,
         * якщо якийсь запис відсутній.
         */
        this.addFallbackActions();
    }


    isValidAction(action) {

        if (
            !action ||
            typeof action !== "object"
        ) {
            return false;
        }

        const id =
            action.id ||
            action.actionId;

        if (!id) {
            return false;
        }

        if (
            action.enabled === false ||
            action.available === false
        ) {
            return false;
        }

        return true;
    }


    isMetadataKey(key) {

        return [
            "system",
            "settings",
            "rules",
            "categories",
            "behavior",
            "preferences",
            "effects",
            "description",
            "principles"
        ].includes(key);
    }


    looksLikeAction(id, action) {

        if (
            action.action === true ||
            action.activity === true
        ) {
            return true;
        }


        const knownFields = [
            "category",
            "duration",
            "effects",
            "needs",
            "requirements",
            "conditions",
            "targets",
            "targetType",
            "goalTypes",
            "topics"
        ];


        if (
            knownFields.some(
                key =>
                    Object.prototype.hasOwnProperty.call(
                        action,
                        key
                    )
            )
        ) {
            return true;
        }


        /*
         * Не відкидаємо прості записи,
         * якщо їхній ключ схожий на дію.
         */
        return (
            typeof id === "string" &&
            id.length > 0
        );
    }


    addFallbackActions() {

        const fallback = {

            sleep: {
                id: "sleep",
                category: "basic",
                duration: 60,
                tags: [
                    "sleep",
                    "rest",
                    "recovery"
                ]
            },

            eat: {
                id: "eat",
                category: "basic",
                duration: 20,
                tags: [
                    "food",
                    "hunger"
                ]
            },

            drink: {
                id: "drink",
                category: "basic",
                duration: 5,
                tags: [
                    "drink",
                    "thirst"
                ]
            },

            rest: {
                id: "rest",
                category: "basic",
                duration: 20,
                tags: [
                    "rest",
                    "recovery"
                ]
            },

            work: {
                id: "work",
                category: "work",
                duration: 60,
                tags: [
                    "work"
                ]
            },

            walk: {
                id: "walk",
                category: "outdoor",
                duration: 30,
                tags: [
                    "walk",
                    "cityWalk",
                    "outdoor"
                ]
            },

            cycle: {
                id: "cycle",
                category: "outdoor",
                duration: 45,
                tags: [
                    "cycling",
                    "outdoor",
                    "exercise"
                ]
            },

            read: {
                id: "read",
                category: "quiet",
                duration: 30,
                tags: [
                    "reading",
                    "books",
                    "quiet"
                ]
            },

            listenToMusic: {
                id: "listenToMusic",
                category: "relaxing",
                duration: 30,
                tags: [
                    "music",
                    "relaxing"
                ]
            },

            playGame: {
                id: "playGame",
                category: "entertainment",
                duration: 30,
                tags: [
                    "games",
                    "fun"
                ]
            },

            checkSocialNetwork: {
                id: "checkSocialNetwork",
                category: "social",
                duration: 15,
                tags: [
                    "social",
                    "internet"
                ]
            },

            talkToSomeone: {
                id: "talkToSomeone",
                category: "social",
                duration: 20,
                tags: [
                    "social",
                    "conversation"
                ],
                targetType: "person"
            },

            visitMuseum: {
                id: "visitMuseum",
                category: "culture",
                duration: 90,
                tags: [
                    "museum",
                    "culture",
                    "city"
                ]
            },

            visitPlanetarium: {
                id: "visitPlanetarium",
                category: "culture",
                duration: 90,
                tags: [
                    "planetarium",
                    "space",
                    "astronomy"
                ]
            },

            visitTheatre: {
                id: "visitTheatre",
                category: "culture",
                duration: 120,
                tags: [
                    "theatre",
                    "culture"
                ]
            },

            visitConcert: {
                id: "visitConcert",
                category: "culture",
                duration: 120,
                tags: [
                    "concert",
                    "music",
                    "culture"
                ]
            },

            goToCinema: {
                id: "goToCinema",
                category: "culture",
                duration: 120,
                tags: [
                    "cinema",
                    "film"
                ]
            },

            boatRide: {
                id: "boatRide",
                category: "outdoor",
                duration: 60,
                tags: [
                    "boat",
                    "water",
                    "outdoor"
                ]
            },

            fishing: {
                id: "fishing",
                category: "outdoor",
                duration: 90,
                tags: [
                    "fishing",
                    "water",
                    "outdoor"
                ]
            },

            lookAtFlowers: {
                id: "lookAtFlowers",
                category: "outdoor",
                duration: 20,
                tags: [
                    "flowers",
                    "nature"
                ]
            },

            observeAnimals: {
                id: "observeAnimals",
                category: "outdoor",
                duration: 30,
                tags: [
                    "animals",
                    "nature"
                ]
            },

            stargazing: {
                id: "stargazing",
                category: "outdoor",
                duration: 40,
                tags: [
                    "space",
                    "astronomy",
                    "stars"
                ]
            },

            checkPhone: {
                id: "checkPhone",
                category: "everyday",
                duration: 5,
                tags: [
                    "phone"
                ]
            },

            organizeDesk: {
                id: "organizeDesk",
                category: "everyday",
                duration: 15,
                tags: [
                    "organizing",
                    "home"
                ]
            },

            think: {
                id: "think",
                category: "mental",
                duration: 15,
                tags: [
                    "thinking",
                    "quiet"
                ]
            },

            rememberSomeone: {
                id: "rememberSomeone",
                category: "mental",
                duration: 10,
                tags: [
                    "memory",
                    "people"
                ]
            },

            doNothing: {
                id: "doNothing",
                category: "idle",
                duration: 10,
                tags: [
                    "idle",
                    "rest"
                ]
            }
        };


        for (
            const [id, action]
            of Object.entries(fallback)
        ) {

            if (!this.actions[id]) {
                this.actions[id] =
                    action;
            }
        }
    }


    /* =========================================================
       MAIN DECISION
       ========================================================= */

    decide(context = {}) {

        const situation =
            this.buildSituation(
                context
            );


        const candidates =
            this.buildCandidates(
                situation
            );


        if (!candidates.length) {

            return this.finalizeAction(
                this.actions.doNothing,
                situation,
                {
                    total: 0,
                    factors: {}
                }
            );
        }


        const scored =
            candidates
                .map(
                    action =>
                        this.scoreAction(
                            action,
                            situation
                        )
                )
                .sort(
                    (a, b) =>
                        b.score -
                        a.score
                );


        const selected =
            this.selectWithVariation(
                scored
            );


        const result =
            this.finalizeAction(
                selected.action,
                situation,
                selected
            );


        this.recordDecision(
            result,
            scored
        );


        return result;
    }


    /* =========================================================
       SITUATION
       ========================================================= */

    buildSituation(context) {

        const brainState =
            this.brain?.state || {};

        const situation =
            brainState.situation ||
            {};


        const mood =
            this.brain?.mood;


        let moodState = null;

        if (
            mood &&
            typeof mood.getState ===
            "function"
        ) {

            try {
                moodState =
                    mood.getState();
            } catch {
                moodState = null;
            }
        }


        let behaviorModifiers = {
            socialInitiative: 50,
            exploration: 50,
            activityDrive: 50,
            communicationDrive: 50,
            caution: 50,
            emotionalExpressiveness: 50
        };


        if (
            mood &&
            typeof mood.getBehaviorModifiers ===
            "function"
        ) {

            try {

                behaviorModifiers = {
                    ...behaviorModifiers,
                    ...mood.getBehaviorModifiers()
                };

            } catch {
                // Залишаємо нейтральні значення.
            }
        }


        return {

            ...situation,

            ...context,

            time:
                context.time ||
                situation.time ||
                brainState.world?.time ||
                "12:00",

            date:
                context.date ||
                situation.date ||
                brainState.world?.date ||
                null,

            season:
                context.season ||
                situation.season ||
                brainState.world?.season ||
                null,

            weather:
                context.weather ??
                situation.weather ??
                this.brain.getCurrentWeather?.() ??
                null,

            location:
                context.location ||
                situation.location ||
                brainState.world?.location ||
                "home",

            activity:
                context.activity ||
                situation.activity ||
                brainState.activity?.id ||
                "idle",

            energy:
                this.numberOr(
                    context.energy,
                    situation.energy,
                    brainState.energy,
                    50
                ),

            fatigue:
                this.numberOr(
                    context.fatigue,
                    situation.fatigue,
                    brainState.fatigue,
                    50
                ),

            socialEnergy:
                this.numberOr(
                    context.socialEnergy,
                    situation.socialEnergy,
                    brainState.socialEnergy,
                    50
                ),

            boredom:
                this.numberOr(
                    context.boredom,
                    situation.boredom,
                    brainState.boredom,
                    50
                ),

            focus:
                this.numberOr(
                    context.focus,
                    situation.focus,
                    brainState.focus,
                    50
                ),

            needs:
                context.needs ||
                situation.needs ||
                brainState.needs ||
                {},

            emotions:
                context.emotions ||
                situation.emotions ||
                brainState.emotions ||
                {},

            relationships:
                context.relationships ||
                situation.relationships ||
                brainState.relationships ||
                {},

            goals:
                context.goals ||
                brainState.goals ||
                [],

            currentGoal:
                context.currentGoal ||
                situation.currentGoal ||
                brainState.currentGoal ||
                null,

            recentAction:
                context.recentAction ||
                situation.recentAction ||
                brainState.recentActions?.[0] ||
                null,

            recentEvent:
                context.recentEvent ||
                situation.recentEvent ||
                brainState.recentEvents?.[0] ||
                null,

            moodState,

            behaviorModifiers
        };
    }


    /* =========================================================
       CANDIDATES
       ========================================================= */

    buildCandidates(situation) {

        const candidates = [];


        for (
            const action
            of Object.values(this.actions)
        ) {

            if (
                !this.isAvailable(
                    action,
                    situation
                )
            ) {
                continue;
            }

            candidates.push(action);
        }


        return candidates;
    }


    isAvailable(
        action,
        situation
    ) {

        if (!action) {
            return false;
        }


        if (
            action.enabled === false ||
            action.available === false
        ) {
            return false;
        }


        /*
         * Сон не вибирається, якщо персонаж
         * вже спить.
         */
        if (
            action.id === "sleep" &&
            situation.activity ===
            "sleeping"
        ) {
            return false;
        }


        /*
         * Дія, що вимагає енергії.
         */
        const minEnergy =
            this.readRequirement(
                action,
                "energy",
                "min"
            );


        if (
            minEnergy !== null &&
            situation.energy <
            minEnergy
        ) {

            return false;
        }


        /*
         * Максимальна втома.
         */
        const maxFatigue =
            this.readRequirement(
                action,
                "fatigue",
                "max"
            );


        if (
            maxFatigue !== null &&
            situation.fatigue >
            maxFatigue
        ) {

            return false;
        }


        /*
         * Вимоги до локації.
         */
        const locations =
            action.locations ||
            action.allowedLocations ||
            null;


        if (
            Array.isArray(locations) &&
            locations.length > 0 &&
            !locations.includes(
                situation.location
            )
        ) {

            /*
             * Не всі дії вимагають точної
             * локації — перевіряємо тільки
             * якщо поле явно задане.
             */
            return false;
        }


        /*
         * Часові обмеження.
         */
        if (
            !this.checkTimeRequirements(
                action,
                situation
            )
        ) {
            return false;
        }


        /*
         * Загальні conditions з JSON.
         */
        if (
            !this.checkConditions(
                action,
                situation
            )
        ) {
            return false;
        }


        return true;
    }


    /* =========================================================
       SCORING
       ========================================================= */

    scoreAction(
        action,
        situation
    ) {

        const factors = {};


        factors.needs =
            this.scoreNeeds(
                action,
                situation
            );


        factors.goals =
            this.scoreGoals(
                action,
                situation
            );


        factors.emotions =
            this.scoreEmotions(
                action,
                situation
            );


        factors.interests =
            this.scoreInterests(
                action,
                situation
            );


        factors.preferences =
            this.scorePreferences(
                action,
                situation
            );


        factors.habits =
            this.scoreHabits(
                action,
                situation
            );


        factors.weather =
            this.scoreWeather(
                action,
                situation
            );


        // Власний досвід і ставлення Акіри можуть трохи змінювати
        // практичний вибір, але не перекривають потреби, погоду чи цілі.
        factors.opinions =
            this.brain.opinions?.scoreAction?.(action, situation) ?? 0;


        factors.time =
            this.scoreTime(
                action,
                situation
            );


        factors.relationships =
            this.scoreRelationships(
                action,
                situation
            );


        factors.curiosity =
            this.scoreCuriosity(
                action,
                situation
            );


        factors.novelty =
            this.scoreNovelty(
                action,
                situation
            );


        factors.state =
            this.scoreCurrentState(
                action,
                situation
            );


        factors.repetition =
            this.scoreRepetition(
                action,
                situation
            );


        let total = 0;


        for (
            const [factor, value]
            of Object.entries(factors)
        ) {

            const weight =
                this.settings.weights[
                    factor
                ] ?? 1;


            total +=
                value *
                weight;
        }


        /*
         * Невелика випадкова варіативність.
         *
         * Вона не повинна перевернути
         * очевидний критичний вибір.
         */
        const randomFactor =
            (
                Math.random() * 2 -
                1
            ) *
            this.settings.randomness;


        total +=
            randomFactor;


        return {

            action,

            score: total,

            factors,

            randomFactor
        };
    }


    /* =========================================================
       NEEDS
       ========================================================= */

    scoreNeeds(
        action,
        situation
    ) {

        const needs =
            situation.needs ||
            {};


        let score = 0;


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


        const rest =
            this.readNeed(
                needs,
                "rest"
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
         * Значення потреб у нашій моделі:
         *
         * 0 = потреба майже задоволена
         * 100 = потреба сильно потребує уваги
         *
         * Але sleep/fun/social можуть мати
         * іншу семантику залежно від JSON.
         *
         * Тому action-specific needs мають
         * перевагу.
         */


        if (
            action.id === "eat"
        ) {

            score +=
                hunger *
                1.1;
        }


        if (
            action.id === "drink"
        ) {

            score +=
                thirst *
                1.1;
        }


        if (
            action.id === "sleep"
        ) {

            score +=
                sleep *
                1.2;
        }


        if (
            action.id === "rest"
        ) {

            score +=
                rest *
                0.9;

            score +=
                situation.fatigue *
                0.45;
        }


        if (
            this.isSocialAction(action)
        ) {

            score +=
                social *
                0.55;
        }


        if (
            this.isEntertainmentAction(action)
        ) {

            score +=
                fun *
                0.45;
        }


        if (
            this.hasTag(
                action,
                "curiosity"
            )
        ) {

            score +=
                curiosity *
                0.40;
        }


        /*
         * Енергія сама по собі не робить
         * відпочинок автоматично переможцем.
         *
         * Вона лише змінює доступність
         * та привабливість витратних дій.
         */

        if (
            situation.energy < 30
        ) {

            if (
                this.isEnergyExpensive(
                    action
                )
            ) {
                score -= 35;
            }

            if (
                action.id === "rest" ||
                action.id === "sleep"
            ) {
                score += 25;
            }
        }


        if (
            situation.fatigue > 70
        ) {

            if (
                this.isEnergyExpensive(
                    action
                )
            ) {
                score -= 30;
            }

            if (
                action.id === "rest" ||
                action.id === "sleep"
            ) {
                score += 30;
            }
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       GOALS
       ========================================================= */

    scoreGoals(
        action,
        situation
    ) {

        let score = 0;


        const goals =
            Array.isArray(
                situation.goals
            )
                ? situation.goals
                : [];


        for (const goal of goals) {

            if (!goal) {
                continue;
            }


            const priority =
                this.goalPriority(
                    goal
                );


            if (priority <= 0) {
                continue;
            }


            const actions =
                goal.actions ||
                goal.possibleActions ||
                goal.actionIds ||
                [];


            if (
                Array.isArray(actions) &&
                actions.includes(action.id)
            ) {

                score +=
                    priority *
                    0.8;
            }


            const tags =
                goal.tags ||
                goal.topics ||
                [];


            if (
                this.actionMatchesList(
                    action,
                    tags
                )
            ) {

                score +=
                    priority *
                    0.35;
            }
        }


        /*
         * Поточна головна мета має
         * додаткову вагу.
         */
        const currentGoal =
            situation.currentGoal;


        if (currentGoal) {

            const actions =
                currentGoal.actions ||
                currentGoal.possibleActions ||
                currentGoal.actionIds ||
                [];


            if (
                Array.isArray(actions) &&
                actions.includes(action.id)
            ) {

                score +=
                    30;
            }
        }


        return this.clampScore(
            score
        );
    }


    goalPriority(goal) {

        return (

            this.numberOr(
                goal.importance,
                0
            ) * 0.35 +

            this.numberOr(
                goal.urgency,
                0
            ) * 0.30 +

            this.numberOr(
                goal.motivation,
                0
            ) * 0.20 +

            this.numberOr(
                goal.emotionalValue,
                0
            ) * 0.15
        );
    }


    /* =========================================================
       EMOTIONS
       ========================================================= */

    scoreEmotions(
        action,
        situation
    ) {

        const emotions =
            situation.emotions ||
            {};


        let score = 0;


        const get =
            name =>
                this.numberOr(
                    emotions[name],
                    0
                );


        const modifiers =
            situation.behaviorModifiers ||
            {};


        /*
         * Соціальна ініціатива.
         */
        if (
            this.isSocialAction(action)
        ) {

            const initiative =
                this.numberOr(
                    modifiers.socialInitiative,
                    50
                );

            score +=
                (initiative - 50) *
                0.55;
        }


        /*
         * Дослідження.
         */
        if (
            this.isExplorationAction(
                action
            )
        ) {

            const exploration =
                this.numberOr(
                    modifiers.exploration,
                    50
                );

            score +=
                (exploration - 50) *
                0.55;
        }


        /*
         * Загальний потяг до активності.
         */
        const activityDrive =
            this.numberOr(
                modifiers.activityDrive,
                50
            );


        if (
            this.isActiveAction(
                action
            )
        ) {

            score +=
                (activityDrive - 50) *
                0.35;
        }


        /*
         * Конкретні емоції.
         */
        if (
            action.id === "rest" ||
            action.id === "sleep"
        ) {

            score +=
                get("fatigue") *
                0.35;

            score +=
                get("anxiety") *
                0.15;
        }


        if (
            this.isSocialAction(action)
        ) {

            score +=
                get("affection") *
                0.20;

            score +=
                get("loneliness") *
                0.25;

            score -=
                get("anxiety") *
                0.20;
        }


        if (
            this.hasTag(
                action,
                "curiosity"
            )
        ) {

            score +=
                get("curiosity") *
                0.35;

            score +=
                get("interest") *
                0.25;
        }


        if (
            this.isEntertainmentAction(
                action
            )
        ) {

            score +=
                get("boredom") *
                0.35;

            score +=
                get("joy") *
                0.10;
        }


        /*
         * Високий страх/тривога зменшує
         * привабливість ризикованих дій.
         */
        const caution =
            this.numberOr(
                modifiers.caution,
                50
            );


        if (
            this.isRiskyAction(
                action
            )
        ) {

            score -=
                (caution - 50) *
                0.45;
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       INTERESTS
       ========================================================= */

    scoreInterests(
        action,
        situation
    ) {

        const interests =
            this.getInterestData();


        if (!interests) {
            return 0;
        }


        let score = 0;


        const topics =
            this.getActionTopics(
                action
            );


        for (const topic of topics) {

            const interest =
                this.findMultidimensionalValue(
                    interests,
                    topic
                );


            if (!interest) {
                continue;
            }


            /*
             * Інтерес не дорівнює одному числу.
             */
            score +=
                this.numberOr(
                    interest.interest,
                    0
                ) * 0.35;


            score +=
                this.numberOr(
                    interest.initiative,
                    0
                ) * 0.25;


            score +=
                this.numberOr(
                    interest.curiosity,
                    0
                ) * 0.20;


            score +=
                this.numberOr(
                    interest.novelty,
                    0
                ) * 0.10;


            /*
             * Частота не повинна сама
             * перетворюватися на інтерес.
             */
            score +=
                this.numberOr(
                    interest.frequency,
                    0
                ) * 0.05;
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       PREFERENCES
       ========================================================= */

    scorePreferences(
        action,
        situation
    ) {

        const preferences =
            this.brain?.data?.preferences;


        if (!preferences) {
            return 0;
        }


        let score = 0;


        const topics =
            this.getActionTopics(
                action
            );


        for (const topic of topics) {

            const pref =
                this.findMultidimensionalValue(
                    preferences,
                    topic
                );


            if (!pref) {
                continue;
            }


            score +=
                this.numberOr(
                    pref.liking,
                    0
                ) * 0.30;


            score +=
                this.numberOr(
                    pref.comfort,
                    0
                ) * 0.20;


            score +=
                this.numberOr(
                    pref.practicality,
                    0
                ) * 0.10;


            score +=
                this.numberOr(
                    pref.aesthetic,
                    0
                ) * 0.10;


            score +=
                this.numberOr(
                    pref.emotionalValue,
                    0
                ) * 0.15;


            score +=
                this.numberOr(
                    pref.novelty,
                    0
                ) * 0.10;
        }


        /*
         * Вподобання можуть бути негативними.
         * Наприклад:
         *
         * mosquitoes = -100
         *
         * Це не просто "низький інтерес".
         */
        score +=
            this.scoreNegativePreferences(
                action,
                preferences
            );


        return this.clampScore(
            score
        );
    }


    scoreNegativePreferences(
        action,
        preferences
    ) {

        let score = 0;


        const topics =
            this.getActionTopics(
                action
            );


        for (const topic of topics) {

            const value =
                this.findPreferenceScalar(
                    preferences,
                    topic
                );


            if (
                typeof value !== "number"
            ) {
                continue;
            }


            if (value < 0) {

                score +=
                    value *
                    0.30;
            }
        }


        return score;
    }


    /* =========================================================
       HABITS
       ========================================================= */

    scoreHabits(
        action,
        situation
    ) {

        const habits =
            this.brain?.data?.habits;


        if (!habits) {
            return 0;
        }


        let score = 0;


        const time =
            this.getMinutesOfDay(
                situation.time
            );


        const hour =
            Math.floor(
                time / 60
            );


        const source =
            habits.habits ||
            habits;


        /*
         * Читаємо кілька можливих структур,
         * не вимагаючи конкретного формату.
         */

        const candidates = [];


        this.collectHabitCandidates(
            source,
            action.id,
            candidates
        );


        this.collectTimeHabitCandidates(
            source,
            hour,
            candidates
        );


        for (const habit of candidates) {

            if (
                typeof habit === "number"
            ) {

                score +=
                    habit * 0.25;

                continue;
            }


            if (!habit || typeof habit !== "object") {
                continue;
            }


            const probability =
                this.numberOr(
                    habit.probability,
                    habit.chance,
                    habit.weight,
                    0
                );


            score +=
                probability *
                0.25;
        }


        return this.clampScore(
            score
        );
    }


    collectHabitCandidates(
        source,
        actionId,
        result
    ) {

        if (!source || typeof source !== "object") {
            return;
        }


        const direct =
            source[actionId];


        if (typeof direct === "number") {
            result.push(direct);
        }


        if (
            direct &&
            typeof direct === "object"
        ) {
            result.push(direct);
        }


        for (const value of Object.values(source)) {

            if (
                !value ||
                typeof value !== "object"
            ) {
                continue;
            }


            const actions =
                value.actions ||
                value.actionIds ||
                value.activities ||
                [];


            if (
                Array.isArray(actions) &&
                actions.includes(actionId)
            ) {

                result.push(value);
            }
        }
    }


    collectTimeHabitCandidates(
        source,
        hour,
        result
    ) {

        if (!source || typeof source !== "object") {
            return;
        }


        const timeSections = [
            "morning",
            "daytime",
            "afternoon",
            "evening",
            "night"
        ];


        let section = null;


        if (hour >= 5 && hour < 10) {
            section = "morning";
        }

        else if (hour >= 10 && hour < 15) {
            section = "daytime";
        }

        else if (hour >= 15 && hour < 18) {
            section = "afternoon";
        }

        else if (hour >= 18 && hour < 23) {
            section = "evening";
        }

        else {
            section = "night";
        }


        if (
            section &&
            source[section]
        ) {

            const value =
                source[section];


            if (Array.isArray(value)) {

                for (const item of value) {
                    result.push(item);
                }
            }

            else if (
                value &&
                typeof value === "object"
            ) {

                const action =
                    value[actionId];


                if (action !== undefined) {
                    result.push(action);
                }
            }
        }
    }


    /* =========================================================
       WEATHER
       ========================================================= */

    scoreWeather(
        action,
        situation
    ) {

        const weather =
            situation.weather;


        if (!weather) {
            return 0;
        }


        let score = 0;


        const outdoor =
            this.isOutdoorAction(
                action
            );


        const precipitation =
            this.numberOr(
                weather.precipitation,
                weather.precip,
                0
            );


        const wind =
            this.numberOr(
                weather.wind,
                weather.windSpeed,
                0
            );


        const temperature =
            this.numberOr(
                weather.temperature,
                weather.temp,
                18
            );


        const comfort =
            this.numberOr(
                weather.outdoorComfort,
                weather.comfort,
                50
            );

        // Точний модифікатор конкретної активності з weather.json.
        // 1.0 = нейтрально, >1 = погода сприяє, <1 = заважає.
        const actionId = action?.id || action?.actionId || null;
        const activityModifier = actionId
            ? this.numberOr(weather.activityModifiers?.[actionId], 1)
            : 1;
        score += (activityModifier - 1) * 70;

        // Небезпечна погода майже прибирає необов'язкові виходи надвір,
        // але критична потреба все одно може переважити через інші фактори рішення.
        if (outdoor && ['thunderstorm', 'hail'].includes(weather.condition)) {
            score -= weather.condition === 'thunderstorm' ? 55 : 35;
        }


        if (outdoor) {

            score +=
                (comfort - 50) *
                0.70;


            if (precipitation > 60) {
                score -= 35;
            }

            else if (precipitation > 30) {
                score -= 15;
            }


            if (wind > 12) {
                score -= 20;
            }

            else if (wind > 7) {
                score -= 8;
            }


            if (temperature < 0) {
                score -= 30;
            }

            else if (temperature < 8) {
                score -= 12;
            }

            else if (temperature > 32) {
                score -= 25;
            }
        }


        /*
         * Погана погода може підштовхувати
         * до затишних домашніх дій.
         */
        if (
            !outdoor &&
            precipitation > 50
        ) {

            if (
                this.isQuietAction(
                    action
                )
            ) {
                score += 12;
            }
        }


        /*
         * Яскравий вечір/ніч може підсилювати
         * спостереження за небом.
         */
        if (
            this.hasTag(
                action,
                "astronomy"
            )
        ) {

            if (
                this.isNight(
                    situation.time
                )
            ) {

                score += 25;

            } else {

                score -= 20;
            }
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       TIME
       ========================================================= */

scoreTime(
    action,
    situation
) {

    const minutes =
        this.getMinutesOfDay(
            situation.time
        );

    const hour =
        Math.floor(
            minutes / 60
        );

    // Реальний час Києва (якщо доступний)
    const isNight = this.brain.isNightInKyiv?.() || hour >= 22 || hour < 6;
    const dayPeriod = this.brain.getDayPeriod?.() || null;

    let score = 0;


    /*
     * Робочий час.
     */
    if (
        this.isWorkTime(
            situation
        )
    ) {

        if (
            this.isWorkAction(
                action
            )
        ) {

            score += 40;

        } else {

            score -= 20;
        }
    }


    /*
     * Після роботи / вечір.
     */
    if (
        hour >= 18 &&
        hour < 22 ||
        dayPeriod === "вечеря" ||
        dayPeriod === "вечір"
    ) {

        if (
            this.isLeisureAction(
                action
            )
        ) {

            score += 20;
        }

        if (
            this.isWorkAction(
                action
            )
        ) {

            score -= 30;
        }
    }


    /*
     * Ніч (реальний час Києва + симуляція)
     * Бонус не абсолютний — емоції і втома впливають
     */
    if (isNight) {

        if (action.id === "sleep") {

            // Базовий бонус за ніч
            score += 28;

            // Сильно втомлений → хоче спати сильніше
            if (situation.energy < 25 || situation.fatigue > 70) {
                score += 25;
            }

            // Ще відносно бадьорий → може почекати
            if (situation.energy > 50) {
                score -= 10;
            }

        } else if (
            this.isOutdoorAction(
                action
            )
        ) {

            score -= 25;
        }
    }


    /*
     * Ранок.
     */
    if (
        hour >= 6 &&
        hour < 10 ||
        dayPeriod === "світанок" ||
        dayPeriod === "сніданок"
    ) {

        if (
            action.id === "checkCalendar" ||
            action.id === "checkPhone" ||
            action.id === "eat" ||
            action.id === "drink"
        ) {

            score += 12;
        }
    }


    return this.clampScore(
        score
    );
}

    /* =========================================================
       RELATIONSHIPS
       ========================================================= */

    scoreRelationships(
        action,
        situation
    ) {

        if (
            !this.isSocialAction(
                action
            )
        ) {
            return 0;
        }


        const relationships =
            situation.relationships ||
            {};


        let score = 0;


        /*
         * Соціальна дія сама по собі
         * отримує загальну підтримку від
         * сильних зв'язків.
         */
        for (
            const relationship
            of Object.values(
                relationships
            )
        ) {

            if (
                !relationship ||
                typeof relationship !== "object"
            ) {
                continue;
            }


            const closeness =
                this.numberOr(
                    relationship.closeness,
                    0
                );


            const desire =
                this.numberOr(
                    relationship.desireForContact,
                    0
                );


            const trust =
                this.numberOr(
                    relationship.trust,
                    0
                );


            const irritation =
                this.numberOr(
                    relationship.irritation,
                    0
                );


            score +=
                closeness *
                0.10;


            score +=
                desire *
                0.20;


            score +=
                trust *
                0.08;


            score -=
                irritation *
                0.20;
        }


        /*
         * Якщо дія має targetPerson,
         * використовуємо конкретні стосунки.
         */
        const target =
            action.targetPerson ||
            action.target ||
            action.person ||
            null;


        if (target) {

            const relationship =
                relationships[target];


            if (relationship) {

                score +=
                    this.numberOr(
                        relationship.closeness,
                        0
                    ) *
                    0.35;


                score +=
                    this.numberOr(
                        relationship.desireForContact,
                        0
                    ) *
                    0.45;


                score -=
                    this.numberOr(
                        relationship.irritation,
                        0
                    ) *
                    0.40;
            }
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       CURIOSITY
       ========================================================= */

    scoreCuriosity(
        action,
        situation
    ) {

        const curiosity =
            this.readNeed(
                situation.needs,
                "curiosity"
            );


        let score = 0;


        if (
            curiosity <= 0
        ) {
            return 0;
        }


        if (
            this.hasTag(
                action,
                "curiosity"
            )
        ) {

            score +=
                curiosity *
                0.50;
        }


        if (
            this.isExplorationAction(
                action
            )
        ) {

            score +=
                curiosity *
                0.35;
        }


        /*
         * Висока curiosity також може
         * підштовхнути до нової активності,
         * але не обов'язково до будь-якої.
         */
        if (
            situation.boredom > 60 &&
            this.isNovelAction(action)
        ) {

            score += 15;
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       NOVELTY
       ========================================================= */

    scoreNovelty(
        action,
        situation
    ) {

        let score = 0;


        const recent =
            situation.recentAction;


        if (!recent) {

            /*
             * На початку немає причини
             * уникати нової дії.
             */
            return 5;
        }


        const recentId =
            recent.actionId ||
            recent.id ||
            null;


        if (
            recentId === action.id
        ) {

            return -15;
        }


        if (
            this.isNovelAction(
                action
            )
        ) {

            score += 8;
        }


        return score;
    }


    /* =========================================================
       CURRENT STATE
       ========================================================= */

    scoreCurrentState(
        action,
        situation
    ) {

        let score = 0;


        /*
         * Не перериваємо поточну дію
         * без причини.
         */
        if (
            situation.activity &&
            situation.activity !== "idle"
        ) {

            if (
                action.id ===
                situation.activity
            ) {

                score += 35;

            } else {

                score -= 20;
            }
        }


        /*
         * Висока втома.
         */
        if (
            situation.fatigue > 75
        ) {

            if (
                this.isRestorativeAction(
                    action
                )
            ) {

                score += 30;

            } else if (
                this.isEnergyExpensive(
                    action
                )
            ) {

                score -= 25;
            }
        }


        /*
         * Низька енергія.
         */
        if (
            situation.energy < 25
        ) {

            if (
                this.isEnergyExpensive(
                    action
                )
            ) {

                score -= 35;
            }
        }


        /*
         * Низький socialEnergy не означає
         * "ніколи не спілкуватися".
         */
        if (
            situation.socialEnergy < 25 &&
            this.isSocialAction(action)
        ) {

            score -= 15;
        }


        /*
         * Висока нудьга.
         */
        if (
            situation.boredom > 70
        ) {

            if (
                this.isEntertainmentAction(
                    action
                ) ||
                this.isActiveAction(
                    action
                )
            ) {

                score += 20;
            }
        }


        return this.clampScore(
            score
        );
    }


    /* =========================================================
       REPETITION
       ========================================================= */

    scoreRepetition(
        action,
        situation
    ) {

        const recent =
            this.brain?.state?.recentActions ||
            [];


        if (!recent.length) {
            return 0;
        }


        let penalty = 0;


        for (
            let i = 0;
            i < recent.length;
            i++
        ) {

            const entry =
                recent[i];


            if (
                !entry ||
                entry.actionId !==
                action.id
            ) {
                continue;
            }


            /*
             * Найсвіжіше повторення штрафує
             * найсильніше.
             */
            const freshness =
                Math.max(
                    0,
                    1 -
                    i / 10
                );


            penalty +=
                this.settings.repetitionPenalty *
                freshness;
        }


        return -penalty;
    }


    /* =========================================================
       SELECTION
       ========================================================= */

    selectWithVariation(
        scored
    ) {

        if (!scored.length) {
            return null;
        }


        /*
         * Якщо є дуже явний переможець,
         * не дозволяємо випадковості
         * безглуздо перевернути рішення.
         */
        const top =
            scored[0];


        const second =
            scored[1];


        if (
            !second ||
            top.score -
            second.score >
            35
        ) {

            return top;
        }


        /*
         * Беремо невелику групу близьких
         * кандидатів.
         */
        const pool =
            scored.slice(
                0,
                Math.max(
                    1,
                    this.settings.selectionPool
                )
            );


        /*
         * Перетворюємо оцінки на позитивні
         * ваги.
         *
         * Math.random() використовується
         * лише для вибору всередині цієї
         * обмеженої групи.
         */
        const minScore =
            Math.min(
                ...pool.map(
                    item =>
                        item.score
                )
            );


        const weights =
            pool.map(
                item =>
                    Math.max(
                        0.1,
                        item.score -
                        minScore +
                        1
                    )
            );


        const selected =
            this.weightedRandom(
                pool,
                weights
            );


        return selected ||
            top;
    }


    weightedRandom(
        items,
        weights
    ) {

        if (!items.length) {
            return null;
        }


        const total =
            weights.reduce(
                (
                    sum,
                    value
                ) =>
                    sum +
                    Math.max(
                        0,
                        value
                    ),
                0
            );


        if (total <= 0) {

            return items[
                Math.floor(
                    Math.random() *
                    items.length
                )
            ];
        }


        let random =
            Math.random() *
            total;


        for (
            let i = 0;
            i < items.length;
            i++
        ) {

            random -=
                Math.max(
                    0,
                    weights[i]
                );


            if (random <= 0) {
                return items[i];
            }
        }


        return items[
            items.length - 1
        ];
    }


    /* =========================================================
       FINAL ACTION
       ========================================================= */

    finalizeAction(
        action,
        situation,
        scored
    ) {

        if (!action) {

            action =
                this.actions.doNothing;
        }


        const duration =
            this.getActionDuration(
                action,
                situation
            );


        const targetPerson =
            this.selectTargetPerson(
                action,
                situation
            );


        return {

            type: "action",

            actionId:
                action.id,

            duration,

            category:
                action.category ||
                "unknown",

            targetPerson,

            reason:
                this.generateReason(
                    scored
                ),

            score:
                Number(
                    scored?.score
                ) || 0,

            factors:
                scored?.factors ||
                {},

            timestamp:
                this.brain.getCurrentTimestamp?.() ||
                {
                    realTime:
                        new Date().toISOString()
                }
        };
    }


    getActionDuration(
        action,
        situation
    ) {

        if (
            typeof action.duration ===
            "number"
        ) {

            return Math.max(
                1,
                action.duration
            );
        }


        if (
            action.duration &&
            typeof action.duration ===
            "object"
        ) {

            const min =
                this.numberOr(
                    action.duration.min,
                    5
                );


            const max =
                this.numberOr(
                    action.duration.max,
                    min
                );


            return Math.round(
                min +
                Math.random() *
                Math.max(
                    0,
                    max - min
                )
            );
        }


        return 10;
    }


    selectTargetPerson(
        action,
        situation
    ) {

        const target =
            action.targetPerson ||
            action.target ||
            action.person ||
            null;


        if (target) {
            return target;
        }


        if (
            action.targetType !==
            "person"
        ) {

            return null;
        }


        const relationships =
            situation.relationships ||
            {};


        const candidates =
            Object.entries(
                relationships
            )
            .filter(
                ([, relationship]) => {

                    if (
                        !relationship ||
                        typeof relationship !==
                        "object"
                    ) {
                        return false;
                    }


                    const irritation =
                        this.numberOr(
                            relationship.irritation,
                            0
                        );


                    const contact =
                        this.numberOr(
                            relationship.desireForContact,
                            0
                        );


                    return (
                        irritation < 70 &&
                        contact > 10
                    );
                }
            );


        if (!candidates.length) {
            return null;
        }


        /*
         * Вибір теж не прив'язаний до конкретної
         * людини.
         */
        const weighted =
            candidates.map(
                ([id, relationship]) => {

                    const closeness =
                        this.numberOr(
                            relationship.closeness,
                            0
                        );


                    const contact =
                        this.numberOr(
                            relationship.desireForContact,
                            0
                        );


                    return {

                        id,

                        weight:
                            Math.max(
                                1,
                                closeness *
                                0.55 +
                                contact *
                                0.45
                            )
                    };
                }
            );


        return this.weightedRandom(
            weighted,
            weighted.map(
                item =>
                    item.weight
            )
        )?.id || null;
    }


    /* =========================================================
       HUMAN-READABLE DEBUG REASON
       ========================================================= */

    generateReason(
        scored
    ) {

        if (
            !scored ||
            !scored.factors
        ) {

            return "варіант дії без додаткових факторів";
        }


        /*
         * Це НЕ chain-of-thought.
         *
         * Це коротка технічна мітка
         * для налагодження системи.
         */

        const positive =
            Object.entries(
                scored.factors
            )
            .filter(
                ([, value]) =>
                    Number(value) > 10
            )
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(
                0,
                3
            )
            .map(
                ([name]) =>
                    name
            );


        const negative =
            Object.entries(
                scored.factors
            )
            .filter(
                ([, value]) =>
                    Number(value) < -10
            )
            .sort(
                (a, b) =>
                    a[1] - b[1]
            )
            .slice(
                0,
                2
            )
            .map(
                ([name]) =>
                    name
            );


        if (
            positive.length &&
            negative.length
        ) {

            return (
                `підтримано: ${positive.join(", ")}; ` +
                `стримано: ${negative.join(", ")}`
            );
        }


        if (positive.length) {

            return (
                `підтримано: ${positive.join(", ")}`
            );
        }


        if (negative.length) {

            return (
                `стримано: ${negative.join(", ")}`
            );
        }


        return "нейтральне рішення";
    }


    /* =========================================================
       HISTORY
       ========================================================= */

    recordDecision(
        result,
        scored
    ) {

        this.history.unshift({

            timestamp:
                result.timestamp,

            actionId:
                result.actionId,

            score:
                result.score,

            factors:
                result.factors,

            alternatives:
                scored
                    .slice(
                        0,
                        5
                    )
                    .map(
                        item => ({
                            actionId:
                                item.action.id,

                            score:
                                item.score
                        })
                    )
        });


        this.history =
            this.history.slice(
                0,
                this.maxHistory
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
       DATA HELPERS
       ========================================================= */

    getInterestData() {

        const data =
            this.brain?.data?.interests;


        if (!data) {
            return null;
        }


        return (
            data.interests ||
            data.catalog ||
            data
        );
    }


    getActionTopics(
        action
    ) {

        const result = [];


        const fields = [
            action.topic,
            action.topicId,
            action.interest,
            action.interestId
        ];


        for (const value of fields) {

            if (typeof value === "string") {
                result.push(value);
            }
        }


        const arrays = [
            action.topics,
            action.tags,
            action.interests,
            action.categories
        ];


        for (const array of arrays) {

            if (!Array.isArray(array)) {
                continue;
            }


            for (const value of array) {

                if (
                    typeof value ===
                    "string"
                ) {

                    result.push(value);
                }
            }
        }


        return [
            ...new Set(result)
        ];
    }


    findMultidimensionalValue(
        source,
        key
    ) {

        if (
            !source ||
            typeof source !== "object"
        ) {
            return null;
        }


        const direct =
            source[key];


        if (
            direct &&
            typeof direct === "object"
        ) {

            return direct;
        }


        /*
         * Пошук за id/name.
         */
        for (
            const [id, value]
            of Object.entries(source)
        ) {

            if (
                id === key &&
                value &&
                typeof value ===
                "object"
            ) {
                return value;
            }


            if (
                value &&
                typeof value ===
                "object" &&
                (
                    value.id === key ||
                    value.topic === key ||
                    value.name === key
                )
            ) {

                return value;
            }
        }


        return null;
    }


    findPreferenceScalar(
        source,
        key
    ) {

        const item =
            this.findMultidimensionalValue(
                source,
                key
            );


        if (!item) {
            return null;
        }


        if (
            typeof item ===
            "number"
        ) {
            return item;
        }


        for (
            const field of [
                "liking",
                "preference",
                "value",
                "score"
            ]
        ) {

            if (
                typeof item[field] ===
                "number"
            ) {
                return item[field];
            }
        }


        return null;
    }


    /* =========================================================
       REQUIREMENTS / CONDITIONS
       ========================================================= */

    readRequirement(
        action,
        resource,
        type
    ) {

        const requirements =
            action.requirements ||
            action.conditions ||
            {};


        const value =
            requirements[resource];


        if (
            value &&
            typeof value === "object"
        ) {

            if (
                typeof value[type] ===
                "number"
            ) {

                return value[type];
            }
        }


        const field =
            `${type}${this.capitalize(
                resource
            )}`;


        if (
            typeof action[field] ===
            "number"
        ) {

            return action[field];
        }


        return null;
    }


    checkTimeRequirements(
        action,
        situation
    ) {

        const minutes =
            this.getMinutesOfDay(
                situation.time
            );


        const min =
            action.minTime ??
            action.time?.min ??
            null;


        const max =
            action.maxTime ??
            action.time?.max ??
            null;


        if (
            min !== null &&
            minutes < this.getMinutesOfDay(min)
        ) {
            return false;
        }


        if (
            max !== null &&
            minutes > this.getMinutesOfDay(max)
        ) {
            return false;
        }


        return true;
    }


    checkConditions(
        action,
        situation
    ) {

        const conditions =
            action.conditions;


        if (
            !conditions ||
            typeof conditions !==
            "object"
        ) {

            return true;
        }


        if (
            conditions.location
        ) {

            const allowed =
                Array.isArray(
                    conditions.location
                )
                    ? conditions.location
                    : [
                        conditions.location
                    ];


            if (
                !allowed.includes(
                    situation.location
                )
            ) {

                return false;
            }
        }


        if (
            conditions.season
        ) {

            const allowed =
                Array.isArray(
                    conditions.season
                )
                    ? conditions.season
                    : [
                        conditions.season
                    ];


            if (
                !allowed.includes(
                    situation.season
                )
            ) {

                return false;
            }
        }


        return true;
    }


    /* =========================================================
       ACTION CATEGORIES
       ========================================================= */

    isSocialAction(action) {

        return (
            action.category === "social" ||
            this.hasAnyTag(
                action,
                [
                    "social",
                    "conversation",
                    "person"
                ]
            ) ||
            action.targetType === "person"
        );
    }


    isEntertainmentAction(action) {

        return (
            action.category === "entertainment" ||
            this.hasAnyTag(
                action,
                [
                    "fun",
                    "entertainment",
                    "games",
                    "music",
                    "cinema"
                ]
            )
        );
    }


    isExplorationAction(action) {

        return (
            action.category === "exploration" ||
            action.category === "outdoor" ||
            action.category === "culture" ||
            this.hasAnyTag(
                action,
                [
                    "exploration",
                    "discovery",
                    "museum",
                    "planetarium",
                    "travel",
                    "city"
                ]
            )
        );
    }


    isActiveAction(action) {

        return (
            action.category === "outdoor" ||
            action.category === "physical" ||
            this.hasAnyTag(
                action,
                [
                    "cycling",
                    "walking",
                    "outdoor",
                    "active",
                    "exercise"
                ]
            )
        );
    }


    isOutdoorAction(action) {

        return (
            action.category === "outdoor" ||
            this.hasAnyTag(
                action,
                [
                    "outdoor",
                    "cityWalk",
                    "nature",
                    "cycling",
                    "fishing",
                    "boat"
                ]
            )
        );
    }


    isQuietAction(action) {

        return (
            action.category === "quiet" ||
            action.category === "relaxing" ||
            this.hasAnyTag(
                action,
                [
                    "quiet",
                    "reading",
                    "rest",
                    "relaxing"
                ]
            )
        );
    }


    isRestorativeAction(action) {

        return (
            action.id === "sleep" ||
            action.id === "rest" ||
            this.hasAnyTag(
                action,
                [
                    "rest",
                    "recovery",
                    "sleep"
                ]
            )
        );
    }


    isEnergyExpensive(action) {

        return (
            action.energyCost > 0 ||
            action.category === "physical" ||
            action.category === "outdoor" ||
            this.hasAnyTag(
                action,
                [
                    "cycling",
                    "active",
                    "exercise",
                    "physical"
                ]
            )
        );
    }


    isRiskyAction(action) {

        return (
            action.risky === true ||
            action.risk === true ||
            this.hasAnyTag(
                action,
                [
                    "risk",
                    "danger",
                    "competition"
                ]
            )
        );
    }


    isLeisureAction(action) {

        return (
            !this.isWorkAction(action) &&
            (
                this.isEntertainmentAction(action) ||
                this.isQuietAction(action) ||
                this.isSocialAction(action) ||
                this.isExplorationAction(action)
            )
        );
    }


    isWorkAction(action) {

        return (
            action.category === "work" ||
            this.hasAnyTag(
                action,
                [
                    "work",
                    "job",
                    "customer"
                ]
            )
        );
    }


    isNovelAction(action) {

        return (
            action.novel === true ||
            action.novelty === true ||
            this.hasAnyTag(
                action,
                [
                    "new",
                    "novelty",
                    "discovery",
                    "exploration"
                ]
            )
        );
    }


    hasTag(
        action,
        tag
    ) {

        const tags =
            action.tags ||
            [];


        return (
            Array.isArray(tags) &&
            tags.includes(tag)
        );
    }


    hasAnyTag(
        action,
        tags
    ) {

        const own =
            action.tags ||
            [];


        if (!Array.isArray(own)) {
            return false;
        }


        return tags.some(
            tag =>
                own.includes(tag)
        );
    }


    actionMatchesList(
        action,
        list
    ) {

        if (!Array.isArray(list)) {
            return false;
        }


        const actionTopics =
            this.getActionTopics(
                action
            );


        return list.some(
            item =>
                actionTopics.includes(item) ||
                this.hasTag(
                    action,
                    item
                )
        );
    }


    /* =========================================================
       TIME HELPERS
       ========================================================= */

    getMinutesOfDay(time) {

        if (
            typeof time === "number"
        ) {
            return time;
        }


        if (
            typeof time !== "string"
        ) {
            return 0;
        }


        const parts =
            time.split(":");


        if (parts.length < 2) {
            return 0;
        }


        const hours =
            Number(parts[0]);


        const minutes =
            Number(parts[1]);


        if (
            !Number.isFinite(hours) ||
            !Number.isFinite(minutes)
        ) {
            return 0;
        }


        return (
            hours * 60 +
            minutes
        );
    }


    isNight(time) {

        const minutes =
            this.getMinutesOfDay(
                time
            );


        const hour =
            Math.floor(
                minutes / 60
            );


        return (
            hour >= 22 ||
            hour < 6
        );
    }


    isWorkTime(situation) {

        const world =
            this.brain?.data?.world ||
            {};


        const schedule =
            world.workSchedule ||
            world.work ||
            {};


        const day =
            situation.day ||
            this.brain?.state?.world?.day ||
            "";


        const weekdays =
            schedule.weekdays ||
            [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday"
            ];


        if (
            !weekdays.includes(day)
        ) {
            return false;
        }


        const time =
            this.getMinutesOfDay(
                situation.time
            );


        const start =
            this.getMinutesOfDay(
                schedule.start ||
                "10:00"
            );


        const end =
            this.getMinutesOfDay(
                schedule.end ||
                "18:00"
            );


        return (
            time >= start &&
            time < end
        );
    }


    /* =========================================================
       GENERIC HELPERS
       ========================================================= */

    readNeed(
        source,
        name
    ) {

        if (
            !source ||
            typeof source !== "object"
        ) {
            return 50;
        }


        const value =
            source[name];


        if (
            typeof value ===
            "number"
        ) {

            return value;
        }


        if (
            value &&
            typeof value.value ===
            "number"
        ) {

            return value.value;
        }


        return 50;
    }


    numberOr(
        ...values
    ) {

        for (const value of values) {

            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {

                return value;
            }
        }


        return 0;
    }


    clampScore(
        value
    ) {

        if (
            !Number.isFinite(value)
        ) {
            return 0;
        }


        return Math.max(
            this.settings.minimumScore,
            Math.min(
                500,
                value
            )
        );
    }


    capitalize(
        text
    ) {

        if (
            typeof text !== "string" ||
            !text
        ) {
            return "";
        }


        return (
            text.charAt(0).toUpperCase() +
            text.slice(1)
        );
    }
}


/* =========================================================
   GLOBAL EXPORT
   ========================================================= */

window.AkiraDecision =
    AkiraDecision;
