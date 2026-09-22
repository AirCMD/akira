// calendar.js
// Реальний календар Акіри: дата, день тижня, вихідні та календарні свята.
// Не залежить від прискорення внутрішнього часу симуляції.
class AkiraCalendar {
    constructor(brain) {
        this.brain = brain;
        this.data = {};
    }

    init() {
        this.data = this.brain.data?.calendar || {};
        this.sync();
        return this;
    }

    localDate(now = new Date()) {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    sync(now = new Date()) {
        const date = this.localDate(now);
        const day = now.toLocaleDateString("en-US", { weekday: "long" });
        const info = this.getInfo(now);
        this.brain.state.calendar = info;
        // Якщо світ працює у realTime, календарна дата завжди справжня.
        const sim = this.brain.data?.world?.world?.time?.simulation || {};
        if (sim.realTime !== false && this.brain.state.world) {
            this.brain.state.world.date = date;
            this.brain.state.world.day = day;
            this.brain.updateSeason?.(now);
        }
        return info;
    }

    getInfo(now = new Date()) {
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekday = now.getDay(); // 0 Sunday, 6 Saturday
        const holidays = this.data.holidays || this.brain.data?.world?.world?.calendar?.holidays || {};
        const holiday = Object.entries(holidays).find(([, h]) => Number(h.month) === month && Number(h.day) === day);
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const tomorrowHoliday = Object.entries(holidays).find(([, h]) => Number(h.month) === tomorrow.getMonth() + 1 && Number(h.day) === tomorrow.getDate());
        return {
            date: this.localDate(now),
            year: now.getFullYear(), month, day,
            weekday: now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
            isWeekend: weekday === 0 || weekday === 6,
            isWorkday: weekday !== 0 && weekday !== 6,
            holiday: holiday ? holiday[0] : null,
            holidayData: holiday ? holiday[1] : null,
            tomorrowHoliday: tomorrowHoliday ? tomorrowHoliday[0] : null,
            tomorrowHolidayData: tomorrowHoliday ? tomorrowHoliday[1] : null
        };
    }

    getHolidayName(id) {
        const names = { halloween: "Геловін", newYear: "Новий рік", newYearsEve: "переддень Нового року", valentinesDay: "День святого Валентина" };
        return names[id] || id || null;
    }
}
window.AkiraCalendar = AkiraCalendar;
