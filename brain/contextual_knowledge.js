// contextual_knowledge.js
// Семантичний шар канонічних знань і короткого контексту розмови.
// Не генерує нових фактів: відповідає лише тим, що є в contextual_knowledge.json.
class AkiraContextualKnowledge {
    constructor(brain) {
        this.brain = brain;
        this.context = { entityId: null, property: null, at: 0 };
        this.contextTtl = 5 * 60 * 1000;
        this.topicTurns = {};
    }

    init() {}

    data() {
        return this.brain.data?.contextual_knowledge || {};
    }

    normalize(text) {
        return String(text || "").toLowerCase().replace(/[’`ʼ]/g, "'").replace(/[?!.,:;]+/g, " ").replace(/\s+/g, " ").trim();
    }

    entities() { return this.data().entities || {}; }

    findEntity(text) {
        const n = this.normalize(text);
        let best = null;
        for (const [id, entity] of Object.entries(this.entities())) {
            for (const alias of (entity.aliases || [])) {
                const a = this.normalize(alias);
                // Шукаємо цілу фразу, а не підрядок усередині іншого слова.
                // Інакше «кіноцефали» легко перетворюються на «кіно».
                const haystack = ` ${n} `;
                const needle = ` ${a} `;
                if (a && haystack.includes(needle) && (!best || a.length > best.alias.length)) best = { id, entity, alias: a };
            }
        }
        return best;
    }

    inferProperty(text) {
        const n = this.normalize(text);
        if (/(^| )(хто такі|хто такий|хто така|що таке|що означає|що значить)( |$)/u.test(n)) return "definition";
        if (/(^| )(які саме|який саме|які конкретно|детальніше|розкажи детальніше)( |$)/u.test(n)) return "details";
        if (/(^| )(подобається|подобаються|любиш|улюблен)/u.test(n)) return "preference";
        if (/(^| )(у тебе є|є у тебе|маєш)( |$)/u.test(n)) return "ownership";
        if (/(^| )(що думаєш|як ставишся|ставлення)( |$)/u.test(n)) return "opinion";
        return null;
    }

    isFollowup(text) {
        const n = this.normalize(text);
        return /^(а\s+)?(які саме|який саме|які|який|а що|що саме|детальніше|розкажи детальніше)$/u.test(n) || /^а\s+[^ ]+(\s+[^ ]+){0,2}$/u.test(n);
    }

    analyze(text) {
        const explicit = this.findEntity(text);
        let property = this.inferProperty(text);
        let entityId = explicit?.id || null;
        let inherited = false;

        // «а коти?» має успадкувати тип питання «які подобаються?» від собак.
        if (entityId && !property && this.context.property && Date.now() - this.context.at < this.contextTtl) {
            property = this.context.property;
            inherited = true;
        }

        // «а які саме?» не називає сутність, тому беремо попередню.
        if (!entityId && this.isFollowup(text) && this.context.entityId && Date.now() - this.context.at < this.contextTtl) {
            entityId = this.context.entityId;
            property = property || "details";
            inherited = true;
        }

        // «а батарейки?» після нічників є окремою пов'язаною сутністю.
        const n = this.normalize(text);
        if (/^(а\s+)?батарейк(и|ах)?$/u.test(n)) {
            entityId = "battery_lights";
            property = this.context.property === "ownership" ? "opinion" : (this.context.property || "preference");
            inherited = true;
        }

        if (!entityId) return null;
        property = property || "opinion";
        return { entityId, property, inherited };
    }

    remember(query) {
        if (!query?.entityId) return;
        this.context = { entityId: query.entityId, property: query.property || "opinion", at: Date.now() };
    }

    hasFreshContext() {
        return Boolean(this.context?.entityId && Date.now() - this.context.at < this.contextTtl);
    }

    answerWhy() {
        if (!this.hasFreshContext()) return null;
        const entity = this.entities()[this.context.entityId];
        if (!entity) return null;
        // Причину беремо лише з канону. Якщо її не задано, не домислюємо.
        return entity.whyAnswer || "Не знаю. Просто так до цього ставлюся.";
    }

    answer(text) {
        const q = this.analyze(text);
        if (!q) return null;
        const entity = this.entities()[q.entityId];
        if (!entity) return null;
        this.remember(q);

        if (q.property === "definition") {
            if (entity.category === "low_interest_terms") {
                const turns = (this.topicTurns[q.entityId] || 0) + 1;
                this.topicTurns[q.entityId] = turns;
                if (turns >= 3) return "Я знаю, що це означає, але вже казав: мені ця тема не цікава. Давай не будемо її розкручувати.";
                const ending = entity.discussion === "avoid"
                    ? " Але такі теми я не хочу особливо обговорювати."
                    : " Але я цим особливо не цікавлюся.";
                return (entity.definition || entity.summary || "Знаю, що це таке.") + ending;
            }
            return entity.definition || entity.detailAnswer || entity.summary || null;
        }
        if (q.property === "details") return entity.detailAnswer || entity.summary || null;
        if (q.property === "preference") return entity.detailAnswer || entity.summary || null;
        if (q.property === "ownership") {
            if (entity.ownership === true) return entity.ownershipAnswer || `Так, у мене є ${entity.name || "таке"}.`;
            if (entity.ownership === false) return entity.ownershipAnswer || `Ні, у мене такого немає.`;
            // Канон не задає володіння. Не вигадуємо предмет у квартирі.
            if (q.entityId === "nightlights") return "Мені такі нічники подобаються, але які саме є в мене вдома, я не пам'ятаю. Не хочу вигадувати.";
            return entity.summary || "Не пам'ятаю, чи є в мене таке.";
        }
        if (q.entityId === "nightlights" && /батарей/u.test(this.normalize(text))) return entity.batteryRelation || entity.summary;
        if (entity.category === "low_interest_terms") {
            const turns = (this.topicTurns[q.entityId] || 0) + 1;
            this.topicTurns[q.entityId] = turns;
            if (turns >= 3) return "Я вже сказав, що мене ця тема не дуже цікавить. Давай про щось інше.";
            if (q.property === "opinion") return entity.summary || "Особливої думки не маю. Просто не моя тема.";
        }
        return entity.summary || entity.detailAnswer || null;
    }
}
window.AkiraContextualKnowledge = AkiraContextualKnowledge;
