// contextual_knowledge.js
// Семантичний шар канонічних знань і короткого контексту розмови.
// Не генерує нових фактів: відповідає лише тим, що є в contextual_knowledge.json.
class AkiraContextualKnowledge {
    constructor(brain) {
        this.brain = brain;
        this.context = { entityId: null, property: null, at: 0 };
        this.contextTtl = 5 * 60 * 1000;
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
                if (a && n.includes(a) && (!best || a.length > best.alias.length)) best = { id, entity, alias: a };
            }
        }
        return best;
    }

    inferProperty(text) {
        const n = this.normalize(text);
        if (/\b(які саме|який саме|які конкретно|детальніше|розкажи детальніше)\b/u.test(n)) return "details";
        if (/\b(подобається|подобаються|любиш|улюблен)/u.test(n)) return "preference";
        if (/\b(у тебе є|є у тебе|маєш)\b/u.test(n)) return "ownership";
        if (/\b(що думаєш|як ставишся|ставлення)\b/u.test(n)) return "opinion";
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

    answer(text) {
        const q = this.analyze(text);
        if (!q) return null;
        const entity = this.entities()[q.entityId];
        if (!entity) return null;
        this.remember(q);

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
        return entity.summary || entity.detailAnswer || null;
    }
}
window.AkiraContextualKnowledge = AkiraContextualKnowledge;
