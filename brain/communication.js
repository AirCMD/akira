// communication.js
// Комунікаційна поведінка Акіри.
// dialogue.js вирішує ЩО сказати, communication.js — ЧИ відправляти
// відповідь і ЯК довго Акіра думає/набирає її.

class AkiraCommunication {
    constructor(brain) {
        this.brain = brain;
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    plan(input, reply) {
        const state = this.brain?.getPublicState?.() || this.brain?.state || {};
        const text = String(reply?.text ?? reply?.response ?? reply?.message ?? reply ?? "");
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const fatigue = Number(state.fatigue ?? 20);
        const socialEnergy = Number(state.socialEnergy ?? 60);
        const actionId = state.action?.actionId || null;

        // Базова затримка залежить від довжини майбутньої відповіді.
        // Це не симуляція кожної клавіші, а людський темп перед відправкою.
        let thinkingMs = 450 + Math.random() * 900;
        let typingMs = 700 + words * (65 + Math.random() * 45);

        if (fatigue >= 65) {
            thinkingMs += 500 + Math.random() * 900;
            typingMs *= 1.2;
        }
        if (socialEnergy <= 35) {
            thinkingMs += 450 + Math.random() * 800;
        }
        if (actionId === "sleep") {
            thinkingMs += 650 + Math.random() * 1000;
            typingMs *= 1.15;
        }

        thinkingMs = this.clamp(Math.round(thinkingMs), 350, 3500);
        typingMs = this.clamp(Math.round(typingMs), 900, 7000);

        // Паузи під час набору. Довші відповіді та втома роблять їх імовірнішими.
        let pauseCount = 0;
        if (words >= 7 && Math.random() < 0.48) pauseCount++;
        if (words >= 18 && Math.random() < 0.38) pauseCount++;
        if (fatigue >= 70 && Math.random() < 0.45) pauseCount++;
        pauseCount = Math.min(2, pauseCount);

        const pauses = [];
        for (let i = 0; i < pauseCount; i++) {
            pauses.push({
                afterMs: Math.round(typingMs * (0.28 + Math.random() * 0.42)),
                durationMs: Math.round(450 + Math.random() * 1250)
            });
        }
        pauses.sort((a, b) => a.afterMs - b.afterMs);

        // Ігнор не є голою випадковістю. Він стає можливим лише тоді,
        // коли соціальної енергії дуже мало або Акіра сильно виснажений.
        let abandonChance = 0;
        if (socialEnergy <= 20) abandonChance += 0.22;
        else if (socialEnergy <= 30) abandonChance += 0.08;
        if (fatigue >= 90) abandonChance += 0.24;
        else if (fatigue >= 80) abandonChance += 0.10;
        abandonChance = this.clamp(abandonChance, 0, 0.55);

        const dialogueSilence = reply && typeof reply === "object" && reply.type === "silence";
        const abandon = !dialogueSilence && abandonChance > 0 && Math.random() < abandonChance;

        return {
            text,
            dialogueSilence,
            thinkingMs,
            typingMs,
            pauses,
            abandon,
            abandonAfterMs: abandon
                ? Math.round(typingMs * (0.35 + Math.random() * 0.45))
                : null,
            reason: abandon ? "передумав відповідати" : null
        };
    }
}

window.AkiraCommunication = AkiraCommunication;
