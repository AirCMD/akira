// emotions.js
// Рушій емоцій програмного мозку Акіри.
// Не містить конкретного характеру або реплік персонажа.
// Працює з даними з emotions.json.

class AkiraMood {

    constructor(brain) {

        this.brain = brain;

        this.data = {};

        this.emotions = {};

        this.lastUpdate = Date.now();

        this.initialized = false;
    }


    // =========================================================
    // ІНІЦІАЛІЗАЦІЯ
    // =========================================================

    init() {

        this.data =
            this.brain.data.emotions || {};

        this.initializeEmotions();

        this.syncToBrain();

        this.initialized = true;

        return this;
    }


    // =========================================================
    // ПОЧАТКОВІ ЕМОЦІЇ
    // =========================================================

    initializeEmotions() {

        const source =
            this.data.emotions || {};

        const min =
            this.brain.number(
                this.data.limits?.min,
                0
            );

        const max =
            this.brain.number(
                this.data.limits?.max,
                100
            );

        this.emotions = {};

        for (
            const [name, value]
            of Object.entries(source)
        ) {

            this.emotions[name] =
                this.clamp(
                    value,
                    min,
                    max
                );
        }
    }


    // =========================================================
    // ОНОВЛЕННЯ ЕМОЦІЙ
    // =========================================================

    update(context = {}) {

        if (!this.initialized) {
            return;
        }

        const minutes =
            this.brain.number(
                context.minutes,
                0
            );

        if (minutes <= 0) {
            return;
        }

        this.applyDecay(minutes);

        this.lastUpdate =
            Date.now();
    }


    // =========================================================
    // ЗГАСАННЯ ЕМОЦІЙ
    // =========================================================

    applyDecay(minutes) {

        const decay =
            this.data.decay || {};

        if (decay.enabled === false) {
            return;
        }

        const rates =
            decay.rates || {};

        const hours =
            minutes / 60;

        for (
            const [name, value]
            of Object.entries(this.emotions)
        ) {

            const rate =
                this.brain.number(
                    rates[name],
                    0
                );

            if (!rate) {
                continue;
            }

            /*
             * Емоція поступово повертається
             * до нейтрального рівня 0.
             *
             * Для стійких станів на кшталт
             * attachment, trust, affection
             * швидкість може бути дуже малою.
             */

            const amount =
                rate * hours;

            this.emotions[name] =
                this.clamp(
                    value - amount
                );
        }
    }


    // =========================================================
    // ЗМІНА ОДНІЄЇ ЕМОЦІЇ
    // =========================================================

    change(name, amount) {

        if (
            !Object.prototype.hasOwnProperty.call(
                this.emotions,
                name
            )
        ) {
            return false;
        }

        const value =
            this.brain.number(
                amount,
                0
            );

        this.emotions[name] =
            this.clamp(
                this.emotions[name] + value
            );

        this.syncToBrain();

        this.brain.emit(
            "emotionChanged",
            {
                emotion: name,
                amount: value,
                value: this.emotions[name]
            }
        );

        return true;
    }


    // =========================================================
    // ЗАСТОСУВАННЯ ТРИГЕРА
    // =========================================================

    trigger(triggerName) {

        const triggers =
            this.data.triggers || {};

        const trigger =
            triggers[triggerName];

        if (
            !trigger ||
            typeof trigger !== "object"
        ) {
            return false;
        }

        for (
            const [emotion, amount]
            of Object.entries(trigger)
        ) {

            this.change(
                emotion,
                amount
            );
        }

        return true;
    }


    // =========================================================
    // ВСТАНОВЛЕННЯ ЕМОЦІЇ
    // =========================================================

    set(name, value) {

        if (
            !Object.prototype.hasOwnProperty.call(
                this.emotions,
                name
            )
        ) {
            return false;
        }

        this.emotions[name] =
            this.clamp(value);

        this.syncToBrain();

        return true;
    }


    // =========================================================
    // ОТРИМАННЯ ЕМОЦІЇ
    // =========================================================

    get(name) {

        return this.emotions[name] ?? 0;
    }


    // =========================================================
    // УСІ ЕМОЦІЇ
    // =========================================================

    getState() {

        return {
            ...this.emotions
        };
    }


    // =========================================================
    // ІНТЕНСИВНІСТЬ
    // =========================================================

    getIntensity(value) {

        const thresholds =
            this.data.intensity || {};

        const n =
            this.brain.number(
                value,
                0
            );

        if (
            n >=
            this.brain.number(
                thresholds.veryHigh,
                85
            )
        ) {
            return "veryHigh";
        }

        if (
            n >=
            this.brain.number(
                thresholds.high,
                70
            )
        ) {
            return "high";
        }

        if (
            n >=
            this.brain.number(
                thresholds.moderate,
                50
            )
        ) {
            return "moderate";
        }

        if (
            n >=
            this.brain.number(
                thresholds.low,
                30
            )
        ) {
            return "low";
        }

        return "veryLow";
    }


    // =========================================================
    // ДОМІНАНТНІ ЕМОЦІЇ
    // =========================================================

    getDominantEmotions(limit = 3) {

        return Object.entries(
            this.emotions
        )
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, limit)
            .map(
                ([name, value]) => ({
                    name,
                    value,
                    intensity:
                        this.getIntensity(value)
                })
            );
    }


    // =========================================================
    // ГРУПА ЕМОЦІЙ
    // =========================================================

    getGroupValue(groupName) {

        const groups =
            this.data.emotionGroups || {};

        const group =
            groups[groupName];

        if (!Array.isArray(group)) {
            return 0;
        }

        if (!group.length) {
            return 0;
        }

        const values =
            group.map(
                name =>
                    this.get(name)
            );

        return (
            values.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            values.length
        );
    }


    // =========================================================
    // СТАН ПОЗИТИВНИХ / НЕГАТИВНИХ ЕМОЦІЙ
    // =========================================================

    getEmotionalBalance() {

        const positive =
            this.getGroupValue(
                "positive"
            );

        const negative =
            this.getGroupValue(
                "negative"
            );

        return {
            positive,
            negative,
            balance:
                positive - negative
        };
    }


    // =========================================================
    // ЗМІШАНІ ЕМОЦІЇ
    // =========================================================

    getMixedEmotions() {

        if (
            this.data.mixedEmotions?.enabled ===
            false
        ) {
            return [];
        }

        const result = [];

        const positive =
            this.data.emotionGroups?.positive ||
            [];

        const negative =
            this.data.emotionGroups?.negative ||
            [];

        for (
            const positiveEmotion
            of positive
        ) {

            const positiveValue =
                this.get(
                    positiveEmotion
                );

            if (positiveValue < 50) {
                continue;
            }

            for (
                const negativeEmotion
                of negative
            ) {

                const negativeValue =
                    this.get(
                        negativeEmotion
                    );

                if (negativeValue < 50) {
                    continue;
                }

                result.push({
                    positive:
                        positiveEmotion,

                    positiveValue,

                    negative:
                        negativeEmotion,

                    negativeValue
                });
            }
        }

        return result;
    }


    // =========================================================
    // СТИЛЬ ВИРАЖЕННЯ
    // =========================================================

    getExpressionStyles() {

        const expression =
            this.data.expression || {};

        const styles = [];

        for (
            const [stateName, state]
            of Object.entries(expression)
        ) {

            if (
                !state ||
                typeof state !== "object"
            ) {
                continue;
            }

            const threshold =
                this.brain.number(
                    state.threshold,
                    0
                );

            const emotionName =
                this.getExpressionEmotion(
                    stateName
                );

            if (!emotionName) {
                continue;
            }

            if (
                this.get(emotionName) >=
                threshold
            ) {

                if (
                    Array.isArray(
                        state.preferredStyles
                    )
                ) {

                    styles.push(
                        ...state.preferredStyles
                    );
                }
            }
        }

        return [
            ...new Set(styles)
        ];
    }


    // =========================================================
    // ВИЗНАЧЕННЯ ЕМОЦІЇ ДЛЯ СТАНУ ВИРАЖЕННЯ
    // =========================================================

    getExpressionEmotion(stateName) {

        const map = {

            veryHappy:
                "joy",

            calm:
                "calm",

            angry:
                "anger",

            sad:
                "sadness",

            curious:
                "curiosity",

            tired:
                "fatigue"
        };

        return map[stateName] || null;
    }


    // =========================================================
    // МОДИФІКАТОРИ ПОВЕДІНКИ
    // =========================================================

    getBehaviorModifiers() {

        const joy =
            this.get("joy");

        const sadness =
            this.get("sadness");

        const anger =
            this.get("anger");

        const fear =
            this.get("fear");

        const curiosity =
            this.get("curiosity");

        const anxiety =
            this.get("anxiety");

        const calm =
            this.get("calm");

        const boredom =
            this.get("boredom");

        return {

            sociability:
                this.rangeModifier(
                    joy +
                    this.get("affection") -
                    sadness -
                    anxiety
                ),

            curiosity:
                this.rangeModifier(
                    curiosity
                ),

            patience:
                this.rangeModifier(
                    calm -
                    anger -
                    anxiety
                ),

            activity:
                this.rangeModifier(
                    joy +
                    curiosity -
                    fatigueValue(this.brain)
                ),

            caution:
                this.rangeModifier(
                    fear +
                    anxiety
                ),

            irritability:
                this.rangeModifier(
                    anger +
                    this.get("offense")
                ),

            withdrawal:
                this.rangeModifier(
                    sadness +
                    lonelinessValue(this)
                ),

            boredom:
                this.rangeModifier(
                    boredom
                )
        };
    }


    // =========================================================
    // МОДИФІКАТОР У ДІАПАЗОНІ -1 ... +1
    // =========================================================

    rangeModifier(value) {

        const n =
            this.brain.number(
                value,
                0
            );

        return Math.max(
            -1,
            Math.min(
                1,
                (n - 50) / 50
            )
        );
    }


    // =========================================================
    // СИНХРОНІЗАЦІЯ З BRAIN
    // =========================================================

    syncToBrain() {

        if (!this.brain.state) {
            return;
        }

        this.brain.state.emotions =
            this.getState();
    }


    // =========================================================
    // ДОПОМІЖНЕ
    // =========================================================

    clamp(
        value,
        min = 0,
        max = 100
    ) {

        const n =
            this.brain.number(
                value,
                min
            );

        return Math.max(
            min,
            Math.min(
                max,
                n
            )
        );
    }
}


// =============================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// =============================================================

function fatigueValue(brain) {

    return brain.number(
        brain.state?.fatigue,
        0
    );
}


function lonelinessValue(mood) {

    return mood.get(
        "loneliness"
    );
}


// =============================================================
// ГЛОБАЛЬНИЙ КЛАС
// =============================================================

window.AkiraMood =
    AkiraMood;