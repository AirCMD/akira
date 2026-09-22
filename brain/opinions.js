class AkiraOpinions {
    constructor(brain) {
        this.brain = brain;
        this.data = brain.data?.opinions || {};
    }

    init() {
        const existing = this.brain.state.opinions || {};
        this.brain.state.opinions = {
            attitudes: { ...(existing.attitudes || {}) },
            experiences: Array.isArray(existing.experiences) ? existing.experiences : [],
            lastEvent: existing.lastEvent || null
        };
        return this;
    }

    getTopic(topic) {
        const base = this.data.topics?.[topic] || {};
        const learned = this.brain.state.opinions?.attitudes?.[topic];
        return {
            ...base,
            attitude: Number.isFinite(learned) ? learned : Number(base.attitude || 0)
        };
    }

    clamp(value, min = -100, max = 100) {
        return Math.max(min, Math.min(max, Number(value) || 0));
    }

    evaluateEvent(event = {}) {
        const topic = event.topic || "government_decisions";
        const kind = event.kind || "neutral";
        const rule = this.data.rules?.[kind] || { baseImpact: 0, emotion: {} };
        const topicData = this.getTopic(topic);
        const sensitivity = Number(topicData.sensitivity ?? 50) / 100;
        const personalImpact = Math.max(0, Math.min(1, Number(event.personalImpact ?? 0.6)));
        const change = Number(rule.baseImpact || 0) * (0.45 + sensitivity * 0.35 + personalImpact * 0.4);
        const oldAttitude = Number(topicData.attitude || 0);
        const newAttitude = this.clamp(oldAttitude + change);

        this.brain.state.opinions.attitudes[topic] = newAttitude;
        const record = {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            time: Date.now(), topic, kind,
            source: event.source || "conversation",
            description: event.description || "",
            personalImpact,
            attitudeBefore: oldAttitude,
            attitudeAfter: newAttitude
        };
        this.brain.state.opinions.lastEvent = record;
        this.brain.state.opinions.experiences.push(record);
        this.brain.state.opinions.experiences = this.brain.state.opinions.experiences.slice(-80);

        for (const [emotion, amount] of Object.entries(rule.emotion || {})) {
            const scaled = Number(amount) * (0.6 + personalImpact * 0.6);
            this.brain.mood?.change?.(emotion, scaled, `opinion:${topic}`);
            this.brain.emotions?.change?.(emotion, scaled, `opinion:${topic}`);
        }
        return { topic, kind, attitude: newAttitude, change, record };
    }

    inferTopic(text = "") {
        const t = String(text).toLowerCase().replace(/[’`ʼ]/g, "'");

        // Специфічні теми перевіряємо раніше за загальні.
        // Інакше «доставка їжі» помилково стає просто food_prices.
        if (/(доставк|кур'єр)/u.test(t)) return "delivery_prices";
        if (/(транспорт|проїзд|метро|автобус|трамва|тролейб)/u.test(t)) return "transport_prices";
        if (/(комунал|електроенерг|опален|тариф.*вод|вод.*тариф)/u.test(t)) return "utilities_prices";
        if (/(їж|продукт|харч|магазин)/u.test(t)) return "food_prices";
        if (/(влад|уряд|мері|міськ|рішенн)/u.test(t)) return "government_decisions";
        if (/(цін|вартіст|подорожч|здешев|дорожч|дешевш)/u.test(t)) return "cost_of_living";
        return null;
    }

    inferEvent(text = "") {
        const t = String(text).toLowerCase().replace(/[’`ʼ]/g, "'");
        const topic = this.inferTopic(t);
        if (!topic) return null;

        let kind = null;
        if (/(підвищ|піднял|подорожч|зросл|виросл|дорожч|стала\s+дорож|стало\s+дорож|стали\s+дорож)/u.test(t)) kind = "priceIncrease";
        else if (/(зниз|зменш|здешев|подешев|дешевш|стала\s+дешев|стало\s+дешев|стали\s+дешев)/u.test(t)) kind = "priceDecrease";
        else if (/(погірш|скасув|закрил)/u.test(t)) kind = "serviceWorsening";
        else if (/(покращ|зручніш|відкрили|додали)/u.test(t)) kind = "serviceImprovement";
        if (!kind) return null;

        const personalImpact = ["food_prices", "transport_prices", "utilities_prices"].includes(topic) ? 0.8 : 0.55;
        return { topic, kind, personalImpact, description: String(text), source: "conversation" };
    }

    isOpinionQuestion(text = "") {
        const t = String(text).toLowerCase().replace(/[’`ʼ]/g, "'").trim();
        return /(що\s+(ти\s+)?думаєш|як\s+ти\s+ставишся|твоя\s+думка|що\s+скажеш)/u.test(t);
    }

    describeOpinion(text = "") {
        const topic = this.inferTopic(text);
        if (!topic) return null;
        const info = this.getTopic(topic);
        const attitude = Number(info.attitude || 0);
        const names = {
            transport_prices: "ціни на транспорт і проїзд",
            food_prices: "ціни на їжу та продукти",
            delivery_prices: "вартість доставки",
            utilities_prices: "вартість комунальних послуг",
            cost_of_living: "зростання повсякденних витрат",
            government_decisions: "такі рішення влади"
        };
        const subject = names[topic] || "це";
        if (attitude <= -45) return `Я до цього ставлюся негативно. ${subject[0].toUpperCase() + subject.slice(1)} вже не раз мене дратували своїм впливом на звичайні витрати.`;
        if (attitude <= -10) return `Скоріше негативно. Мені не подобається, коли ${subject} роблять повсякденне життя дорожчим або менш зручним.`;
        if (attitude >= 45) return `Скоріше позитивно. Якщо ${subject} реально полегшують повсякденне життя, я це підтримую.`;
        if (attitude >= 10) return `Загалом позитивно, але дивився б на конкретні наслідки. Для мене важливо, як ${subject} позначаються на звичайному житті.`;
        return `Поки ставлюся нейтрально. Про ${subject} я б судив за конкретними наслідками, а не лише за формулюванням.`;
    }

    reactToText(text) {
        const event = this.inferEvent(text);
        if (!event) return null;
        const result = this.evaluateEvent(event);
        return { ...result, event };
    }

    // Повертає силу накопиченого негативного/позитивного досвіду теми
    // у діапазоні приблизно -1..1. Це міст між "думкою" і поведінкою.
    getPressure(topic) {
        const attitude = Number(this.getTopic(topic)?.attitude || 0);
        return this.clamp(attitude, -100, 100) / 100;
    }

    getBehaviorContext() {
        return {
            transport: this.getPressure("transport_prices"),
            food: this.getPressure("food_prices"),
            delivery: this.getPressure("delivery_prices"),
            utilities: this.getPressure("utilities_prices"),
            costOfLiving: this.getPressure("cost_of_living")
        };
    }

    // Оцінка впливу власного досвіду на вже наявні дії.
    // Негативне значення attitude означає, що тема стала для Акіри
    // менш прийнятною після подорожчань/погіршень.
    scoreAction(action = {}) {
        const id = action.id || action.actionId || "";
        const category = action.category || "";
        const tags = Array.isArray(action.tags) ? action.tags : [];
        const ctx = this.getBehaviorContext();
        let score = 0;

        // Подорожчання транспорту робить безкоштовні способи пересування
        // привабливішими, якщо інші фактори (погода, енергія) це дозволяють.
        if (ctx.transport < 0) {
            const pressure = Math.abs(ctx.transport);
            if (id === "cycle") score += 18 * pressure;
            if (id === "walk") score += 11 * pressure;

            // Міські розваги часто потребують дороги й витрат. Це лише
            // невеликий штраф, а не заборона: інтерес/ціль можуть переважити.
            if (["visitMuseum", "visitPlanetarium", "visitTheatre", "visitConcert", "goToCinema"].includes(id)) {
                score -= 7 * pressure;
            }
        }

        // Загальне зростання вартості життя трохи підсилює мотивацію
        // працювати, але не перетворює персонажа на калькулятор зарплати.
        if (ctx.costOfLiving < 0 && id === "work") {
            score += 5 * Math.abs(ctx.costOfLiving);
        }

        return score;
    }

    // Гачки для наступного food/delivery модуля. Вони вже відображають
    // накопичений досвід, але не вигадують неіснуючі зараз дії замовлення.
    getFoodChoiceModifiers() {
        const ctx = this.getBehaviorContext();
        return {
            cookAtHome: 1 + Math.max(0, -ctx.food) * 0.25 + Math.max(0, -ctx.delivery) * 0.35,
            orderDelivery: Math.max(0.35, 1 - Math.max(0, -ctx.delivery) * 0.55 - Math.max(0, -ctx.costOfLiving) * 0.20),
            economicalMeal: 1 + Math.max(0, -ctx.food) * 0.35 + Math.max(0, -ctx.costOfLiving) * 0.25
        };
    }

    describeReaction(result) {
        if (!result) return null;
        const topicNames = {
            transport_prices: "проїзд",
            food_prices: "їжу й продукти",
            delivery_prices: "доставку",
            utilities_prices: "комунальні послуги",
            cost_of_living: "повсякденні витрати",
            government_decisions: "це рішення"
        };
        const subject = topicNames[result.topic] || "це";
        if (result.kind === "priceIncrease") {
            return `Мені таке не дуже подобається. Коли дорожчає ${subject}, це просто додає повсякденних витрат.`;
        }
        if (result.kind === "priceDecrease") {
            return `Оце вже приємніше. Якщо ${subject} стає дешевше, я скоріше це підтримаю.`;
        }
        if (result.kind === "serviceImprovement") {
            return "Якщо від цього справді стає зручніше в повсякденному житті, я до такого ставлюся позитивно.";
        }
        if (result.kind === "serviceWorsening") {
            return "Мені це не подобається. Не люблю рішення, після яких звичайне життя стає менш зручним.";
        }
        return null;
    }
}
window.AkiraOpinions = AkiraOpinions;
