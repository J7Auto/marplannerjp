import { validateWeekdays } from "../src/shared/weekdays";
import type { SeedModule } from "../src/server/db/seeds/types";
import { readWeekStartDay } from "../src/server/lib/household-date";
import { ALL_BLOCK_TYPES } from "../src/server/modules/daily-briefing/corpora/block-types";

const DAILY_MESSAGES = [
  { memberId: "demo:member:jorge", dateOffset: 0, text: "Hoy cocina Tamara: tú friegas 😉" },
  {
    memberId: "demo:member:tamara",
    dateOffset: 0,
    text: "Esta noche videollamada con la familia a las 21:00.",
  },
  {
    memberId: "demo:member:jorge",
    dateOffset: 1,
    text: "Mañana cena con amigos: reserva hecha a las 21:00.",
  },
] as const;

/**
 * Mensajes por semana: las claves son días desde el inicio de la semana actual
 * (-7..-1 semana anterior, 0..6 semana actual, 7..13 semana siguiente). Los mensajes
 * relativos a hoy de arriba ganan si coinciden miembro y fecha.
 */
const WEEK_MESSAGES: Record<string, Record<number, string>> = {
  "demo:member:jorge": {
    [-5]: "ITV a las 9:30: lleva la documentación del coche.",
    [-2]: "¡Escapada! Revisa que no se quede nada enchufado.",
    0: "Lunes: toca entreno al salir del trabajo.",
    1: "Martes: te toca hacer la cena.",
    2: "Reunión de proyecto a las 19:30.",
    3: "Jueves: revisa la lista de la compra.",
    4: "Viernes de pizza casera 🍕",
    5: "Te toca la limpieza del finde.",
    6: "Paella a las 14:00. Leña y garrofó listos.",
    9: "Pádel a las 20:00. Raqueta en el maletero.",
    13: "Ruta por la Calderona: agua y crema solar.",
  },
  "demo:member:tamara": {
    [-6]: "Devuelve el paquete antes del viernes.",
    [-1]: "Comida familiar a las 14:00.",
    0: "Semana nueva: ¿qué cenamos?",
    1: "Peluquería a las 19:00.",
    2: "Hoy cocinas tú, Jorge friega.",
    3: "Cine a las 21:30, las entradas están en el móvil.",
    4: "Viernes: plan tranquilo en casa.",
    5: "Mañana en el Mercado Central 🧺",
    6: "Te toca la limpieza del finde.",
    8: "Revisión médica a las 9:00.",
    12: "Cumpleaños de un amigo: ¿quién compra el regalo?",
  },
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type SeedMessage = { id: string; memberId: string; date: string; text: string };

/** Deterministic rolling messages for the previous, current and next household weeks. */
export function buildDailyMessages(asOfDate: string, weekStartDay: number): SeedMessage[] {
  const weekday = new Date(`${asOfDate}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(asOfDate, -((weekday - weekStartDay + 7) % 7));
  const byKey = new Map<string, SeedMessage>();
  const put = (memberId: string, date: string, text: string) => {
    const id = `demo:daily-message:${memberId.slice("demo:member:".length)}:${date}`;
    byKey.set(id, { id, memberId, date, text });
  };
  for (const [memberId, messages] of Object.entries(WEEK_MESSAGES)) {
    for (const [offset, text] of Object.entries(messages)) {
      put(memberId, addDays(weekStart, Number(offset)), text);
    }
  }
  for (const message of DAILY_MESSAGES) {
    put(message.memberId, addDays(asOfDate, message.dateOffset), message.text);
  }
  return [...byKey.values()].sort((left, right) => left.id.localeCompare(right.id));
}

const BRIEFING_OPT_INS = [
  { memberId: "demo:member:jorge", enabled: true },
  { memberId: "demo:member:tamara", enabled: true },
] as const;

const BRIEFING_BLOCK_ORDER = ALL_BLOCK_TYPES.map((type) =>
  type === "dadJoke" ? { type, params: { difficulty: "easy" } } : { type }
);

const MEMBER_BLOCK_SETTINGS = [
  ...BRIEFING_OPT_INS.map(({ memberId }) => ({
    memberId,
    blockType: "message",
    enabled: true,
    weekdays: null,
    params: null,
  })),
  // Bloques pensados para niños, apagados para adultos (se pueden activar en Administración).
  ...BRIEFING_OPT_INS.map(({ memberId }) => ({
    memberId,
    blockType: "phonics",
    enabled: false,
    weekdays: [],
    params: null,
  })),
  ...BRIEFING_OPT_INS.map(({ memberId }) => ({
    memberId,
    blockType: "onThisDay",
    enabled: true,
    weekdays: null,
    params: null,
  })),
] as const;
/**
 * Public demo content for Daily Messages and Daily Briefing settings.
 *
 * These writes use the canonical tables directly so seed-owned IDs and timestamps remain stable;
 * the generic authoring helpers intentionally allocate random IDs or read Date.now. The
 * corresponding public/domain reads remain the verification boundary for this seed.
 */
const seedDailyContent: SeedModule = {
  id: "daily:content:demo",
  run({ db, asOfDate, nowMs }) {
    const upsertMessage = db.prepare(
      `INSERT INTO daily_messages (id, member_id, date, text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id, date) DO UPDATE SET
         id = excluded.id,
         text = excluded.text,
         updated_at = excluded.updated_at
       WHERE id IS NOT excluded.id
          OR text IS NOT excluded.text`
    );
    const messages = buildDailyMessages(asOfDate, readWeekStartDay());
    const keep = new Set(messages.map((message) => message.id));
    const removeStale = db.prepare("DELETE FROM daily_messages WHERE id = ?");
    const seedOwned = db
      .prepare("SELECT id FROM daily_messages WHERE id GLOB 'demo:daily-message:*'")
      .all() as { id: string }[];
    for (const { id } of seedOwned) {
      if (!keep.has(id)) removeStale.run(id);
    }
    for (const message of messages) {
      upsertMessage.run(message.id, message.memberId, message.date, message.text, nowMs, nowMs);
    }

    const upsertOptIn = db.prepare(
      `INSERT INTO daily_briefing_optin (member_id, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at
       WHERE enabled IS NOT excluded.enabled`
    );
    for (const optIn of BRIEFING_OPT_INS) {
      upsertOptIn.run(optIn.memberId, optIn.enabled ? 1 : 0, nowMs, nowMs);
    }

    const orderJson = JSON.stringify(BRIEFING_BLOCK_ORDER);
    db.prepare(
      `INSERT INTO daily_briefing_block_order (id, order_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         order_json = excluded.order_json,
         updated_at = excluded.updated_at
       WHERE order_json IS NOT excluded.order_json`
    ).run(orderJson, nowMs);

    db.prepare(
      `INSERT INTO daily_briefing_settings (id, generation_time, auto_print_trigger, updated_at)
       VALUES (1, '06:30', 'morning_complete', ?)
       ON CONFLICT(id) DO UPDATE SET
         generation_time = excluded.generation_time,
         auto_print_trigger = excluded.auto_print_trigger,
         updated_at = excluded.updated_at
       WHERE generation_time IS NOT excluded.generation_time
          OR auto_print_trigger IS NOT excluded.auto_print_trigger`
    ).run(nowMs);

    const upsertMemberBlockSettings = db.prepare(
      `INSERT INTO daily_briefing_member_block_settings
         (member_id, block_type, enabled, weekdays, params, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id, block_type) DO UPDATE SET
         enabled = excluded.enabled,
         weekdays = excluded.weekdays,
         params = excluded.params,
         updated_at = excluded.updated_at
       WHERE enabled IS NOT excluded.enabled
          OR weekdays IS NOT excluded.weekdays
          OR params IS NOT excluded.params`
    );
    for (const setting of MEMBER_BLOCK_SETTINGS) {
      upsertMemberBlockSettings.run(
        setting.memberId,
        setting.blockType,
        setting.enabled ? 1 : 0,
        setting.weekdays === null ? null : JSON.stringify(validateWeekdays(setting.weekdays)),
        setting.params === null ? null : JSON.stringify(setting.params),
        nowMs,
        nowMs
      );
    }
  },
};

export default seedDailyContent;
