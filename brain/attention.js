// attention.js
// Обмежена увага Акіри: що зараз займає його голову, наскільки глибоко
// він занурений у справу і чи достатньо помітний новий стимул.
class AkiraAttention {
    constructor(brain) {
        this.brain = brain;
        this.cfg = brain.data?.attention?.attention || brain.data?.attention || {};
    }

    clamp(v, a=0, b=100) { return Math.max(a, Math.min(b, Number(v) || 0)); }

    init() {
        const s = this.brain.state;
        s.attention ||= {
            focus: "idle",
            target: null,
            intensity: 28,
            occupied: 20,
            lastSwitchAt: Date.now(),
            lastStimulus: null,
            missedStimuli: 0,
            noticedStimuli: 0
        };
        this.syncToAction(true);
    }

    actionId() { return this.brain.state.action?.actionId || this.brain.state.activity || "idle"; }

    actionIntensity(id) {
        const map = this.cfg.focusByAction || {};
        if (Number.isFinite(Number(map[id]))) return Number(map[id]);
        if (id === "idle") return 25;
        return 55;
    }

    syncToAction(force=false) {
        const s = this.brain.state;
        const a = s.attention;
        if (!a) return;
        const id = this.actionId();
        const target = s.action?.targetPerson || s.action?.mealId || s.action?.drinkId || s.action?.homeRoom || null;
        if (force || a.focus !== id || a.target !== target) {
            a.focus = id;
            a.target = target;
            a.intensity = this.actionIntensity(id);
            a.occupied = a.intensity;
            a.lastSwitchAt = Date.now();
        }
    }

    update(minutes=0) {
        this.syncToAction(false);
        const a = this.brain.state.attention;
        if (!a) return;
        const fatigue = Number(this.brain.state.fatigue || 0);
        // Втома не робить увагу "сильнішою": вона знижує контроль і збільшує відволікання.
        a.control = this.clamp(100 - fatigue * 0.55);
        a.distractibility = this.clamp(20 + fatigue * 0.55 + Math.max(0, 45 - Number(this.brain.state.energy || 0)) * 0.35);
        a.updatedAt = Date.now();
    }

    messageSalience(input="") {
        const text = String(input || "").trim().toLowerCase();
        let salience = Number(this.cfg.messageBaseSalience || 62);
        if (/акір|akira/.test(text)) salience += 12;
        if (/\?$/.test(text)) salience += 5;
        if (/термінов|важлив|допомож/.test(text)) salience += 14;
        if (text.length <= 8) salience -= 3;
        return this.clamp(salience);
    }

    evaluateStimulus(type, payload={}) {
        const a = this.brain.state.attention || {};
        const fatigue = Number(this.brain.state.fatigue || 0);
        const action = this.actionId();
        const salience = type === "message" ? this.messageSalience(payload.input) : this.clamp(payload.salience ?? 50);
        let barrier = Number(a.intensity || 25) * 0.72;
        if (action === "sleep") barrier += 35;
        if (["cycle", "cookMeal"].includes(action)) barrier += 8;
        barrier += fatigue >= 80 ? 7 : 0;

        // Не чистий random-ignore: випадковість лише моделює межові випадки,
        // а рішення задають поточний фокус і помітність стимулу.
        const margin = salience - barrier;
        let noticed = margin >= 0;
        if (margin > -12 && margin < 12) {
            noticed = (Math.random() * 24 - 12) < margin;
        }

        a.lastStimulus = { type, salience, noticed, at: Date.now(), focusAtArrival: action };
        if (noticed) a.noticedStimuli = Number(a.noticedStimuli || 0) + 1;
        else a.missedStimuli = Number(a.missedStimuli || 0) + 1;
        return { noticed, salience, barrier, focus: action, margin };
    }

    onMessage(input) {
        const result = this.evaluateStimulus("message", { input });
        if (result.noticed) {
            const a = this.brain.state.attention;
            a.previousFocus = a.focus;
            a.messageFocusAt = Date.now();
        }
        return result;
    }
}
window.AkiraAttention = AkiraAttention;
