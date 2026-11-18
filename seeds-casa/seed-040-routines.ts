import {
  CANONICAL_WEEKDAY_ORDER,
  validateWeekdays,
  type WeekdayCode,
} from "../src/shared/weekdays";
import type { SeedModule } from "../src/server/db/seeds/types";
import { readWeekStartDay } from "../src/server/lib/household-date";

const MON_TO_FRI = ["mon", "tue", "wed", "thu", "fri"] as const;
const EVERY_DAY = CANONICAL_WEEKDAY_ORDER;

const JORGE = "demo:member:jorge";
const TAMARA = "demo:member:tamara";

const ROUTINES = [
  { id: "demo:routine:manana", name: "Arranque de la mañana", dayPeriodId: "morning" },
  { id: "demo:routine:entreno", name: "Entreno en casa", dayPeriodId: "afternoon" },
  { id: "demo:routine:cocina", name: "Cocina y cena", dayPeriodId: "evening" },
  { id: "demo:routine:cierre", name: "Cerrar el día", dayPeriodId: "night" },
  { id: "demo:routine:limpieza-finde", name: "Limpieza del finde", dayPeriodId: "morning" },
] as const;

type SeedChore = { id: string; routineId: string; name: string; icon: string; sortOrder: number };

function chores(routineSlug: string, items: readonly [slug: string, name: string, icon: string][]) {
  return items.map(([slug, name, icon], sortOrder): SeedChore => ({
    id: `demo:chore:${routineSlug}:${slug}`,
    routineId: `demo:routine:${routineSlug}`,
    name,
    icon,
    sortOrder,
  }));
}

const CHORES: readonly SeedChore[] = [
  ...chores("manana", [
    ["hacer-cama", "Hacer la cama", "🛏️"],
    ["ventilar", "Ventilar la casa", "🪟"],
    ["lavavajillas", "Vaciar el lavavajillas", "🍽️"],
  ]),
  ...chores("entreno", [
    ["entrenar", "Entrenar", "🏋️"],
    ["estirar", "Estirar", "🧘"],
  ]),
  ...chores("cocina", [
    ["cena", "Preparar la cena", "🍳"],
    ["recoger-cocina", "Recoger la cocina", "🧽"],
    ["tupper", "Dejar el táper de mañana", "🥡"],
  ]),
  ...chores("cierre", [
    ["luces", "Apagar luces y regletas", "💡"],
    ["moviles", "Móviles a cargar", "🔌"],
    ["leer", "Leer un rato", "📖"],
  ]),
  ...chores("limpieza-finde", [
    ["aspirar", "Aspirar y fregar", "🧹"],
    ["lavadora", "Poner lavadoras", "🧺"],
    ["banos", "Limpiar baños", "🚿"],
    ["plantas", "Regar las plantas", "🪴"],
  ]),
];

type SeedAssignment = {
  id: string;
  routineId: string;
  memberId: string;
  weekdays: readonly WeekdayCode[];
};

function assign(routineSlug: string, memberId: string, weekdays: readonly WeekdayCode[]) {
  return {
    id: `demo:routine-assignment:${routineSlug}:${memberId.slice("demo:member:".length)}`,
    routineId: `demo:routine:${routineSlug}`,
    memberId,
    weekdays,
  };
}

const ASSIGNMENTS: readonly SeedAssignment[] = [
  assign("manana", JORGE, MON_TO_FRI),
  assign("manana", TAMARA, MON_TO_FRI),
  assign("entreno", JORGE, ["mon", "wed", "fri"]),
  assign("entreno", TAMARA, ["tue", "thu"]),
  assign("cocina", JORGE, ["tue", "thu", "sat"]),
  assign("cocina", TAMARA, ["mon", "wed", "fri", "sun"]),
  assign("cierre", JORGE, EVERY_DAY),
  assign("cierre", TAMARA, EVERY_DAY),
  assign("limpieza-finde", JORGE, ["sat"]),
  assign("limpieza-finde", TAMARA, ["sun"]),
];

/** Progreso de hoy: unas pocas marcadas para que el tablero parezca un día en marcha. */
const TODAY_COMPLETIONS = [
  { choreId: "demo:chore:manana:hacer-cama", memberId: JORGE },
  { choreId: "demo:chore:manana:ventilar", memberId: TAMARA },
  { choreId: "demo:chore:manana:lavavajillas", memberId: TAMARA },
] as const;

/** UTC hour used for a history completion, by the routine's day period. */
const COMPLETION_HOUR_UTC: Record<string, string> = {
  morning: "06:30",
  afternoon: "15:30",
  evening: "18:30",
  night: "19:30",
};

type SeedCompletion = {
  id: string;
  legacyId: string;
  choreId: string;
  memberId: string;
  date: string;
  completedAt: number;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayOfDate(date: string): WeekdayCode {
  // getUTCDay(): 0=Sunday; the canonical order starts on Monday.
  return CANONICAL_WEEKDAY_ORDER[(new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7];
}

function completion(choreId: string, memberId: string, date: string, completedAt: number) {
  const legacyId = `demo:chore-completion:${choreId.slice("demo:chore:".length)}:${memberId.slice(
    "demo:member:".length
  )}`;
  return { id: `${legacyId}:${date}`, legacyId, choreId, memberId, date, completedAt };
}

/**
 * Deterministic completion history: every scheduled chore from the first day of the previous
 * household week up to yesterday, with an occasional miss so streaks look lived-in, plus a
 * partially completed today. Nothing is ever completed in the future.
 */
export function buildSeedCompletions(asOfDate: string, weekStartDay: number): SeedCompletion[] {
  const weekday = new Date(`${asOfDate}T00:00:00.000Z`).getUTCDay();
  const historyStart = addDays(asOfDate, -((weekday - weekStartDay + 7) % 7) - 7);
  const periodOf = new Map<string, string>(ROUTINES.map((r) => [r.id, r.dayPeriodId]));
  const completions: SeedCompletion[] = [];
  for (let date = historyStart, day = 0; date < asOfDate; date = addDays(date, 1), day += 1) {
    const dayOfWeek = weekdayOfDate(date);
    ASSIGNMENTS.forEach((assignment, memberSlot) => {
      if (!assignment.weekdays.includes(dayOfWeek)) return;
      const completedAt = Date.parse(
        `${date}T${COMPLETION_HOUR_UTC[periodOf.get(assignment.routineId) ?? "evening"]}:00.000Z`
      );
      CHORES.filter((chore) => chore.routineId === assignment.routineId).forEach((chore) => {
        if ((day * 3 + chore.sortOrder + memberSlot) % 7 === 0) return; // an occasional miss
        completions.push(completion(chore.id, assignment.memberId, date, completedAt));
      });
    });
  }
  const todayAt = Date.parse(`${asOfDate}T18:00:00.000Z`);
  for (const { choreId, memberId } of TODAY_COMPLETIONS) {
    completions.push(completion(choreId, memberId, asOfDate, todayAt));
  }
  return completions;
}

const seedRoutines: SeedModule = {
  id: "routines:demo",
  run({ db, asOfDate, nowMs }) {
    const upsertRoutine = db.prepare(
      `INSERT INTO routines (id, name, day_period_id, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         day_period_id = excluded.day_period_id,
         active = excluded.active,
         updated_at = excluded.updated_at
       WHERE name IS NOT excluded.name
          OR day_period_id IS NOT excluded.day_period_id
          OR active IS NOT excluded.active`
    );
    for (const routine of ROUTINES) {
      upsertRoutine.run(routine.id, routine.name, routine.dayPeriodId, nowMs, nowMs);
    }

    const upsertChore = db.prepare(
      `INSERT INTO chores (id, routine_id, name, icon, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         routine_id = excluded.routine_id,
         name = excluded.name,
         icon = excluded.icon,
         sort_order = excluded.sort_order,
         active = excluded.active,
         updated_at = excluded.updated_at
       WHERE routine_id IS NOT excluded.routine_id
          OR name IS NOT excluded.name
          OR icon IS NOT excluded.icon
          OR sort_order IS NOT excluded.sort_order
          OR active IS NOT excluded.active`
    );
    for (const chore of CHORES) {
      upsertChore.run(
        chore.id,
        chore.routineId,
        chore.name,
        chore.icon,
        chore.sortOrder,
        nowMs,
        nowMs
      );
    }

    const upsertAssignment = db.prepare(
      `INSERT INTO routine_assignments
         (id, routine_id, member_id, weekdays, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(routine_id, member_id) DO UPDATE SET
         id = excluded.id,
         weekdays = excluded.weekdays,
         active = excluded.active,
         updated_at = excluded.updated_at
       WHERE id IS NOT excluded.id
          OR weekdays IS NOT excluded.weekdays
          OR active IS NOT excluded.active`
    );
    for (const assignment of ASSIGNMENTS) {
      upsertAssignment.run(
        assignment.id,
        assignment.routineId,
        assignment.memberId,
        JSON.stringify(validateWeekdays(assignment.weekdays)),
        nowMs,
        nowMs
      );
    }

    const completions = buildSeedCompletions(asOfDate, readWeekStartDay());
    const keep = new Set(completions.map((entry) => entry.id));
    const removeStale = db.prepare("DELETE FROM chore_completions WHERE id = ?");
    const seedOwned = db
      .prepare("SELECT id FROM chore_completions WHERE id GLOB 'demo:chore-completion:*'")
      .all() as { id: string }[];
    for (const { id } of seedOwned) {
      if (!keep.has(id)) removeStale.run(id);
    }
    const upsertCompletion = db.prepare(
      `INSERT INTO chore_completions (id, chore_id, member_id, date, completed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(member_id, chore_id, date) DO UPDATE SET
         id = excluded.id,
         completed_at = excluded.completed_at
       WHERE (id = excluded.id OR id = ?)
         AND (id IS NOT excluded.id OR completed_at IS NOT excluded.completed_at)`
    );
    for (const entry of completions) {
      upsertCompletion.run(
        entry.id,
        entry.choreId,
        entry.memberId,
        entry.date,
        entry.completedAt,
        entry.legacyId
      );
    }
  },
};

export default seedRoutines;
