import { validateWeekdays, type WeekdayCode } from "../src/shared/weekdays";
import type { SeedModule } from "../src/server/db/seeds/types";

const WORK_DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
const JORGE = "demo:member:jorge";
const TAMARA = "demo:member:tamara";

type SeedReminder = {
  id: string;
  kind: "scheduled" | "calendar_gated";
  targetingMode: "specific" | "apply_to_all";
  text: string;
  /** Rule-level weekdays: only for a scheduled `apply_to_all` rule. */
  weekdays: readonly WeekdayCode[] | null;
  query: string | null;
  queryFields: readonly ("title" | "description")[] | null;
};

/** Listed oldest first; each rule's `created_at` follows this order so reads stay deterministic. */
/** Listed oldest first; each rule's `created_at` follows this order so reads stay deterministic. */
const REMINDERS: readonly SeedReminder[] = [
  {
    id: "demo:reminder:llaves-cartera",
    kind: "scheduled",
    targetingMode: "specific",
    text: "Llaves, cartera y móvil",
    weekdays: null,
    query: null,
    queryFields: null,
  },
  {
    id: "demo:reminder:taper",
    kind: "scheduled",
    targetingMode: "specific",
    text: "Coger el táper de la nevera",
    weekdays: null,
    query: null,
    queryFields: null,
  },
  {
    id: "demo:reminder:agua-plantas",
    kind: "scheduled",
    targetingMode: "specific",
    text: "Regar las plantas del balcón",
    weekdays: null,
    query: null,
    queryFields: null,
  },
  {
    id: "demo:reminder:reciclaje",
    kind: "scheduled",
    targetingMode: "apply_to_all",
    text: "Bajar el reciclaje",
    weekdays: ["tue", "fri"],
    query: null,
    queryFields: null,
  },
  {
    id: "demo:reminder:lista-compra",
    kind: "scheduled",
    targetingMode: "specific",
    text: "Revisar la lista de la compra",
    weekdays: null,
    query: null,
    queryFields: null,
  },
  {
    id: "demo:reminder:regalo",
    kind: "calendar_gated",
    targetingMode: "specific",
    text: "Llevar el regalo",
    weekdays: null,
    query: "cumpleaños",
    queryFields: ["title"],
  },
  {
    id: "demo:reminder:documentacion-coche",
    kind: "calendar_gated",
    targetingMode: "specific",
    text: "Llevar la documentación del coche",
    weekdays: null,
    query: "ITV",
    queryFields: ["title"],
  },
  {
    id: "demo:reminder:calzado-ruta",
    kind: "calendar_gated",
    targetingMode: "apply_to_all",
    text: "Preparar mochila y calzado de montaña",
    weekdays: null,
    query: "ruta",
    queryFields: ["title"],
  },
];

const ASSIGNMENTS: readonly {
  id: string;
  reminderId: string;
  memberId: string;
  weekdays: readonly WeekdayCode[];
}[] = [
  {
    id: "demo:reminder-assignment:llaves-cartera:jorge",
    reminderId: "demo:reminder:llaves-cartera",
    memberId: JORGE,
    weekdays: WORK_DAYS,
  },
  {
    id: "demo:reminder-assignment:llaves-cartera:tamara",
    reminderId: "demo:reminder:llaves-cartera",
    memberId: TAMARA,
    weekdays: WORK_DAYS,
  },
  {
    id: "demo:reminder-assignment:taper:jorge",
    reminderId: "demo:reminder:taper",
    memberId: JORGE,
    weekdays: WORK_DAYS,
  },
  {
    id: "demo:reminder-assignment:agua-plantas:tamara",
    reminderId: "demo:reminder:agua-plantas",
    memberId: TAMARA,
    weekdays: ["wed", "sun"],
  },
  {
    id: "demo:reminder-assignment:lista-compra:jorge",
    reminderId: "demo:reminder:lista-compra",
    memberId: JORGE,
    weekdays: ["fri", "sat"],
  },
  {
    id: "demo:reminder-assignment:regalo:tamara",
    reminderId: "demo:reminder:regalo",
    memberId: TAMARA,
    weekdays: [],
  },
  {
    id: "demo:reminder-assignment:documentacion-coche:jorge",
    reminderId: "demo:reminder:documentacion-coche",
    memberId: JORGE,
    weekdays: [],
  },
];

const seedReminders: SeedModule = {
  id: "reminders:demo",
  run({ db, nowMs }) {
    const upsertReminder = db.prepare(
      `INSERT INTO reminder
         (id, kind, targeting_mode, text, weekdays, query, query_fields, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         targeting_mode = excluded.targeting_mode,
         text = excluded.text,
         weekdays = excluded.weekdays,
         query = excluded.query,
         query_fields = excluded.query_fields,
         active = excluded.active,
         updated_at = excluded.updated_at
       WHERE kind IS NOT excluded.kind
          OR targeting_mode IS NOT excluded.targeting_mode
          OR text IS NOT excluded.text
          OR weekdays IS NOT excluded.weekdays
          OR query IS NOT excluded.query
          OR query_fields IS NOT excluded.query_fields
          OR active IS NOT excluded.active`
    );
    REMINDERS.forEach((reminder, index) => {
      upsertReminder.run(
        reminder.id,
        reminder.kind,
        reminder.targetingMode,
        reminder.text,
        reminder.weekdays === null ? null : JSON.stringify(validateWeekdays(reminder.weekdays)),
        reminder.query,
        reminder.queryFields === null ? null : JSON.stringify(reminder.queryFields),
        nowMs + index,
        nowMs
      );
    });

    const upsertAssignment = db.prepare(
      `INSERT INTO reminder_assignment
         (id, reminder_id, member_id, weekdays, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(reminder_id, member_id) DO UPDATE SET
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
        assignment.reminderId,
        assignment.memberId,
        JSON.stringify(validateWeekdays(assignment.weekdays)),
        nowMs,
        nowMs
      );
    }
  },
};

export default seedReminders;
