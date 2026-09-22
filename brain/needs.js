// needs.js
// Рушій потреб програмного мозку Акіри.
// Не містить конкретного характеру або реплік персонажа.
// Працює з даними з needs.json.

class AkiraNeeds {

    constructor(brain) {

        this.brain = brain;

        this.data = {};

        this.needs = {};

        this.initialized = false;

        this.lastUpdate = Date.now();
    }


    // =========================================================
    // ІНІЦІАЛІЗАЦІЯ
    // =========================================================

    init() {

        this.data =
            this.brain.data.needs || {};

        this.initializeNeeds();

        this.syncToBrain();

        this.initialized = true;

        return this;
    }


    // =========================================================
    // ПОЧАТКОВІ ПОТРЕБИ
    // =========================================================

    initializeNeeds() {

        const source =
            this.data.needs || {};

        this.needs = {};

        for (
            const [name, config]
            of Object.entries(source)
        ) {

            if (
                !config ||
                typeof config !== "object"
            ) {
                continue;
            }

            this.needs[name] = {

                value:
                    this.clamp(
                        config.value
                    ),

                minimumComfort:
                    this.clamp(
                        config.minimumComfort,
                        0,
                        100
                    ),

                critical:
                    this.clamp(
                        config.critical,
                        0,
                        100
                    ),

                recovery:
                    this.copyObject(
                        config.recovery
                    )
            };
        }
    }


    // =========================================================
    // ОНОВЛЕННЯ
    // =========================================================

    update(minutes) {

        if (!this.initialized) {
            return;
        }

        const elapsed =
            this.brain.number(
                minutes,
                0
            );

        if (elapsed <= 0) {
            return;
        }

        this.applyDrift(elapsed);

        this.updateDerivedState();

        this.syncToBrain();

        this.lastUpdate =
            Date.now();
    }


    // =========================================================
    // ПРИРОДНА ЗМІНА ПОТРЕБ
    // =========================================================

    applyDrift(minutes) {

        const drift =
            this.data.drift || {};

        if (drift.enabled === false) {
            return;
        }

        const rates =
            drift.perHour || {};

        const hours =
            minutes / 60;

        for (
            const [name, rate]
            of Object.entries(rates)
        ) {

            if (
                !this.needs[name]
            ) {
                continue;
            }

            const change =
                this.brain.number(
                    rate,
                    0
                ) * hours;

            this.needs[name].value =
                this.clamp(
                    this.needs[name].value +
                    change
                );
        }
    }


    // =========================================================
    // ЗНАЧЕННЯ ПОТРЕБИ
    // =========================================================

    get(name) {

        return (
            this.needs[name]?.value ??
            0
        );
    }


    // =========================================================
    // ПОВНА ІНФОРМАЦІЯ ПРО ПОТРЕБУ
    // =========================================================

    getNeed(name) {

        const need =
            this.needs[name];

        if (!need) {
            return null;
        }

        return {
            ...need,

            status:
                this.getStatus(name),

            deficit:
                this.getDeficit(name),

            urgency:
                this.getUrgency(name)
        };
    }


    // =========================================================
    // УСІ ПОТРЕБИ
    // =========================================================

    getState() {

        const result = {};

        for (
            const [name, need]
            of Object.entries(this.needs)
        ) {

            result[name] = {

                ...need,

                status:
                    this.getStatus(name),

                deficit:
                    this.getDeficit(name),

                urgency:
                    this.getUrgency(name)
            };
        }

        return result;
    }


    // =========================================================
    // ВСТАНОВЛЕННЯ ЗНАЧЕННЯ
    // =========================================================

    set(name, value) {

        if (
            !this.needs[name]
        ) {
            return false;
        }

        const oldValue =
            this.needs[name].value;

        this.needs[name].value =
            this.clamp(value);

        this.syncToBrain();

        this.brain.emit(
            "needChanged",
            {
                need: name,
                oldValue,
                value:
                    this.needs[name].value,
                change:
                    this.needs[name].value -
                    oldValue
            }
        );

        return true;
    }


    // =========================================================
    // ЗМІНА ЗНАЧЕННЯ
    // =========================================================

    change(name, amount) {

        if (
            !this.needs[name]
        ) {
            return false;
        }

        const value =
            this.brain.number(
                amount,
                0
            );

        return this.set(
            name,
            this.get(name) + value
        );
    }


    // =========================================================
    // ЕФЕКТИ ДІЇ
    // =========================================================

    applyActivity(activityId) {

        const activities =
            this.data.activities || {};

        const activity =
            activities[activityId];

        if (
            !activity ||
            typeof activity !== "object"
        ) {
            return false;
        }

        const effects =
            activity.effects || {};

        for (
            const [need, amount]
            of Object.entries(effects)
        ) {

            this.change(
                need,
                amount
            );
        }

        this.updateDerivedState();

        this.syncToBrain();

        this.brain.emit(
            "needsActivity",
            {
                activity:
                    activityId,

                effects:
                    { ...effects }
            }
        );

        return true;
    }


    // =========================================================
    // СТАН ПОТРЕБИ
    // =========================================================

    getStatus(name) {

        const need =
            this.needs[name];

        if (!need) {
            return "unknown";
        }

        const value =
            need.value;

        if (
            value <=
            need.critical
        ) {
            return "critical";
        }

        if (
            value <
            need.minimumComfort
        ) {
            return "low";
        }

        return "normal";
    }


    // =========================================================
    // ДЕФІЦИТ
    // =========================================================

    getDeficit(name) {

        const need =
            this.needs[name];

        if (!need) {
            return 0;
        }

        return Math.max(
            0,
            need.minimumComfort -
            need.value
        );
    }


    // =========================================================
    // ТЕРМІНОВІСТЬ
    // =========================================================

    getUrgency(name) {

        const need =
            this.needs[name];

        if (!need) {
            return 0;
        }

        const value =
            need.value;

        if (
            value <=
            need.critical
        ) {
            return 3;
        }

        if (
            value <
            need.minimumComfort
        ) {
            return 2;
        }

        return 1;
    }


    // =========================================================
    // ПРІОРИТЕТИ
    // =========================================================

    getPriority(name) {

        const need =
            this.needs[name];

        if (!need) {
            return 0;
        }

        const priority =
            this.data.priority || {};

        const status =
            this.getStatus(name);

        let multiplier =
            this.brain.number(
                priority.normalNeedMultiplier,
                1
            );

        if (
            status === "critical"
        ) {

            multiplier =
                this.brain.number(
                    priority.criticalNeedMultiplier,
                    3
                );

        } else if (
            status === "low"
        ) {

            multiplier =
                this.brain.number(
                    priority.lowNeedMultiplier,
                    2
                );
        }

        return (
            this.getDeficit(name) *
            multiplier
        );
    }


    // =========================================================
    // НАЙБІЛЬШ ПРОБЛЕМНА ПОТРЕБА
    // =========================================================

    getMostUrgentNeed() {

        let result = null;

        for (
            const name
            of Object.keys(this.needs)
        ) {

            const urgency =
                this.getUrgency(name);

            const priority =
                this.getPriority(name);

            if (
                !result ||
                urgency >
                    result.urgency ||
                (
                    urgency ===
                    result.urgency &&
                    priority >
                    result.priority
                )
            ) {

                result = {

                    name,

                    value:
                        this.get(name),

                    status:
                        this.getStatus(name),

                    urgency,

                    priority
                };
            }
        }

        return result;
    }


    // =========================================================
    // УСІ ПОТРЕБИ, ЯКІ ПОТРЕБУЮТЬ УВАГИ
    // =========================================================

    getNeedsRequiringAttention() {

        return Object.keys(
            this.needs
        )
            .map(
                name =>
                    this.getNeed(name)
            )
            .filter(
                need =>
                    need &&
                    need.urgency > 1
            )
            .sort(
                (a, b) => {

                    if (
                        b.urgency !==
                        a.urgency
                    ) {
                        return (
                            b.urgency -
                            a.urgency
                        );
                    }

                    return (
                        b.priority -
                        a.priority
                    );
                }
            );
    }


    // =========================================================
    // СОН
    // =========================================================

    getSleepState() {

        const sleep =
            this.data.sleep || {};

        const tirednessThreshold =
            this.brain.number(
                sleep.decision
                    ?.tirednessThreshold,
                35
            );

        const criticalEnergyThreshold =
            this.brain.number(
                sleep.decision
                    ?.criticalEnergyThreshold,
                15
            );

        const sleepValue =
            this.get("sleep");

        const energyValue =
            this.get("energy");

        const shouldSleep =
            sleepValue <=
                tirednessThreshold ||
            energyValue <=
                criticalEnergyThreshold;

        return {

            shouldSleep,

            sleepValue,

            energyValue,

            tirednessThreshold,

            criticalEnergyThreshold,

            preferredStart:
                sleep.preferredStart ?? 1,

            preferredEnd:
                sleep.preferredEnd ?? 9,

            variationHours:
                sleep.variationHours ?? 2,

            canSleepOutsidePreferredHours:
                sleep.decision
                    ?.canSleepOutsidePreferredHours
                    ?? true
        };
    }


    // =========================================================
    // СОЦІАЛЬНА ПОТРЕБА
    // =========================================================

    getSocialState() {

        const config =
            this.data.socialBehavior || {};

        const social =
            this.get("social");

        const minimum =
            this.brain.number(
                config
                    .minimumSocialNeedForInitiatingConversation,
                35
            );

        const preferred =
            this.brain.number(
                config.preferredSocialNeed,
                60
            );

        return {

            value:
                social,

            minimumForInitiating:
                minimum,

            preferred,

            canInitiate:
                social >= minimum,

            needsSocialContact:
                social < minimum
        };
    }


    // =========================================================
    // СОЦІАЛЬНА ВТОМА
    // =========================================================

    applySocialFatigue(
        conversations = 1
    ) {

        const config =
            this.data.socialBehavior
                ?.socialFatigue;

        if (
            !config ||
            config.enabled === false
        ) {
            return;
        }

        const count =
            Math.max(
                0,
                this.brain.number(
                    conversations,
                    1
                )
            );

        const fatigue =
            this.brain.number(
                config.fatiguePerConversation,
                0
            );

        /*
         * Соціальна втома впливає
         * насамперед на energy.
         *
         * Саму social потребу
         * розмова, навпаки,
         * задовольняє через activity effect.
         */

        this.change(
            "energy",
            -fatigue * count
        );
    }


    // =========================================================
    // АВТОНОМНІСТЬ
    // =========================================================

    getAutonomy() {

        const autonomy =
            this.data.autonomy || {};

        return {

            enabled:
                autonomy.enabled !== false,

            canInitiateActions:
                autonomy.canInitiateActions !== false,

            actions:
                Array.isArray(
                    autonomy.actions
                )
                    ? [
                        ...autonomy.actions
                    ]
                    : []
        };
    }


    // =========================================================
    // ПОТРЕБА → МОЖЛИВА ДІЯ
    // =========================================================

    getSuggestedActions() {

        const suggestions = [];

        const urgent =
            this.getMostUrgentNeed();

        if (!urgent) {
            return suggestions;
        }

        switch (urgent.name) {

            case "energy":
            case "sleep":

                suggestions.push(
                    "sleep",
                    "rest"
                );

                break;


            case "hunger":

                suggestions.push(
                    "eat"
                );

                break;


            case "thirst":

                suggestions.push(
                    "drink"
                );

                break;


            case "social":

                suggestions.push(
                    "talkToSomeone"
                );

                break;


            case "fun":

                suggestions.push(
                    "playGame",
                    "walk",
                    "read"
                );

                break;


            case "rest":

                suggestions.push(
                    "rest",
                    "walk"
                );

                break;


            case "curiosity":

                suggestions.push(
                    "read",
                    "walk"
                );

                break;


            case "achievement":

                suggestions.push(
                    "work",
                    "cycle"
                );

                break;


            case "privacy":

                suggestions.push(
                    "rest"
                );

                break;


            case "comfort":

                suggestions.push(
                    "rest"
                );

                break;
        }

        return [
            ...new Set(
                suggestions
            )
        ];
    }


    // =========================================================
    // СИНХРОНІЗАЦІЯ З BRAIN
    // =========================================================

    syncToBrain() {

        if (!this.brain.state) {
            return;
        }

        /*
         * Старий brain.js зберігає
         * state.needs як прості числа.
         *
         * Тому назовні передаємо
         * саме значення, а повна
         * інформація залишається
         * всередині рушія.
         */

        const result = {};

        for (
            const [name, need]
            of Object.entries(
                this.needs
            )
        ) {

            result[name] =
                need.value;
        }

        this.brain.state.needs =
            result;
    }


    // =========================================================
    // СЛУЖБОВІ
    // =========================================================

    updateDerivedState() {

        const social =
            this.getSocialState();

        this.brain.state.socialNeed =
            social.value;
    }


    clamp(
        value,
        min = 0,
        max = 100
    ) {

        const number =
            this.brain.number(
                value,
                min
            );

        return Math.max(
            min,
            Math.min(
                max,
                number
            )
        );
    }


    copyObject(value) {

        if (
            !value ||
            typeof value !== "object"
        ) {
            return {};
        }

        return {
            ...value
        };
    }
}


// =============================================================
// ГЛОБАЛЬНИЙ КЛАС
// =============================================================

window.AkiraNeeds =
    AkiraNeeds;