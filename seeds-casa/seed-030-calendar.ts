import { upsertExternalSource, upsertSeedEvent } from "../src/server/modules/calendar";
import { upsertSeedHighlightRule } from "../src/server/modules/calendar/highlights";
import { wallClockToInstant } from "../src/server/modules/calendar/recurrence";
import type { SeedContext, SeedModule } from "../src/server/db/seeds/types";
import { readWeekStartDay } from "../src/server/lib/household-date";

const POLL_INTERVAL_MINUTES = 60;
const HOUSEHOLD_TIMEZONE = "Europe/Madrid";
const PUBLIC_ADDRESS = { address: "1.1.1.1", family: 4 } as const;

const SOURCES = [
  {
    id: "demo:calendar:source:spain-holidays",
    name: "Festivos de España (2026)",
    provider: "worldpublicholiday",
    feedUrl: "https://web-api.worldpublicholiday.com/v1/holidays/calendar.ics?country=ES&year=2026",
  },
  {
    id: "demo:calendar:source:astronomy",
    name: "Calendario astronómico",
    provider: "astronomy",
    feedUrl: "https://cantonbecker.com/astronomy-calendar/astrocal.ics",
  },
] as const;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localInstant(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return wallClockToInstant(HOUSEHOLD_TIMEZONE, {
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
  }).toISOString();
}

const JORGE = "demo:member:jorge";
const TAMARA = "demo:member:tamara";
const CASA = [JORGE, TAMARA];

/** Eventos relativos a hoy (ayer / hoy / mañana) para que la portada siempre tenga algo. */
function localEvents(asOfDate: string) {
  const yesterday = shiftDate(asOfDate, -1);
  const tomorrow = shiftDate(asOfDate, 1);
  return [
    timedEvent("dentista", "Dentista", yesterday, "17:00", "17:45", [TAMARA]),
    timedEvent(
      "recoger-paquete",
      "Recoger paquete en el punto de entrega",
      asOfDate,
      "18:30",
      "19:00",
      [JORGE]
    ),
    timedEvent("llamar-familia", "Videollamada con la familia", asOfDate, "21:00", "21:30", CASA),
    timedEvent("farmacia", "Pasar por la farmacia", tomorrow, "13:30", "14:00", [TAMARA]),
    timedEvent("cena-amigos", "Cena con amigos", tomorrow, "21:00", "23:30", CASA),
  ];
}

/** First day of the household week containing `asOfDate` (weekStartDay: 0=Sunday, 1=Monday). */
export function weekStartOf(asOfDate: string, weekStartDay: number): string {
  const weekday = new Date(`${asOfDate}T00:00:00.000Z`).getUTCDay();
  return shiftDate(asOfDate, -((weekday - weekStartDay + 7) % 7));
}

/**
 * Week-relative demo events. Offsets count days from the first day of the current household
 * week, so the previous (-7..-1), current (0..6) and next (7..13) weeks are always populated.
 */
function weekEvents(weekStart: string) {
  const day = (offset: number) => shiftDate(weekStart, offset);
  const allDay = (slug: string, title: string, offset: number, memberIds: string[]) => ({
    id: `demo:calendar:event:${slug}`,
    title,
    allDay: true,
    startDate: day(offset),
    endDate: day(offset + 1),
    memberIds,
  });
  const timed = (
    slug: string,
    title: string,
    offset: number,
    start: string,
    end: string,
    memberIds: string[]
  ) => timedEvent(slug, title, day(offset), start, end, memberIds);
  return [
    // Semana anterior
    timed("itv-passat", "ITV del Passat", -5, "09:30", "10:30", [JORGE]),
    allDay("escapada", "Escapada de fin de semana", -2, CASA),
    timed("comida-familiar", "Comida familiar", -1, "14:00", "17:00", CASA),
    // Semana actual
    timed("peluqueria", "Peluquería", 1, "19:00", "20:00", [TAMARA]),
    timed("reunion-proyecto", "Reunión de proyecto", 2, "19:30", "21:00", [JORGE]),
    timed("cine", "Cine", 3, "21:30", "23:30", CASA),
    allDay("mercado-central", "Mañana en el Mercado Central", 5, CASA),
    timed("paella-domingo", "Paella del domingo", 6, "14:00", "17:00", CASA),
    // Semana siguiente
    timed("revision-medica", "Revisión médica", 8, "09:00", "10:00", [TAMARA]),
    timed("partido-padel", "Pádel con amigos", 9, "20:00", "21:30", [JORGE]),
    allDay("teletrabajo", "Día de teletrabajo", 10, [JORGE]),
    timed("cumple-amigo", "Cumpleaños de un amigo", 12, "21:00", "23:59", CASA),
    timed("ruta-montana", "Ruta por la Calderona", 13, "09:00", "14:00", CASA),
  ];
}

/** Weekly recurring events anchored in the previous week, so they repeat across every week. */
function recurringEvents(weekStart: string) {
  const weekly = (
    slug: string,
    title: string,
    offset: number,
    start: string,
    end: string,
    byDay: string,
    memberIds: string[]
  ) => ({
    ...timedEvent(slug, title, shiftDate(weekStart, offset - 7), start, end, memberIds),
    rrule: `FREQ=WEEKLY;BYDAY=${byDay}`,
  });
  return [
    weekly("trabajo-jorge", "Trabajo", 0, "09:00", "18:00", "MO,TU,WE,TH,FR", [JORGE]),
    weekly("entreno-jorge", "Entreno", 0, "19:00", "20:00", "MO,WE,FR", [JORGE]),
    weekly("deporte-tamara", "Clase de deporte", 1, "19:00", "20:00", "TU,TH", [TAMARA]),
    weekly("compra-semanal", "Compra semanal", 5, "10:00", "11:30", "SA", CASA),
    weekly("serie-domingo", "Serie del domingo", 6, "22:00", "23:00", "SU", CASA),
  ];
}

function timedEvent(
  slug: string,
  title: string,
  date: string,
  start: string,
  end: string,
  memberIds: string[]
) {
  return {
    id: `demo:calendar:event:${slug}`,
    title,
    allDay: false,
    startUtc: localInstant(date, start),
    endUtc: localInstant(date, end),
    tzid: HOUSEHOLD_TIMEZONE,
    memberIds,
  };
}

const SAFE_SOURCE_HOSTS = new Set(SOURCES.map((source) => new URL(source.feedUrl).hostname));

const seedCalendar: SeedModule = {
  id: "calendar:demo",

  async run(context) {
    upsertSeedHighlightRule({
      id: "demo:calendar:highlight:food",
      emoji: "🥘",
      keywords: ["paella", "cena", "comida"],
      nowMs: context.nowMs,
    });
    upsertSeedHighlightRule({
      id: "demo:calendar:highlight:pharmacy",
      emoji: "💊",
      keywords: ["farmacia"],
      nowMs: context.nowMs,
    });
    for (const source of SOURCES) {
      if (isCanonicalSource(context, source)) continue;
      await upsertExternalSource(
        { ...source, enabled: true, pollIntervalMin: POLL_INTERVAL_MINUTES },
        { lookup: resolveSeedSourceHost }
      );
    }

    const upsertAssignment = context.db.prepare(
      `INSERT INTO calendar_assignments (id, event_id, member_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(event_id, member_id) DO NOTHING`
    );
    const weekStart = weekStartOf(context.asOfDate, readWeekStartDay());
    const events = [
      ...localEvents(context.asOfDate),
      ...weekEvents(weekStart),
      ...recurringEvents(weekStart),
    ];
    for (const { memberIds, ...event } of events) {
      upsertSeedEvent({ ...event, nowMs: context.nowMs });
      for (const memberId of memberIds) {
        upsertAssignment.run(
          `demo:calendar:assignment:${event.id.split(":").at(-1)}:${memberId.split(":").at(-1)}`,
          event.id,
          memberId,
          context.nowMs
        );
      }
    }
  },
};

function isCanonicalSource(context: SeedContext, source: (typeof SOURCES)[number]): boolean {
  const row = context.db
    .prepare(
      `SELECT name, provider, feed_url, enabled, poll_interval_min
       FROM calendar_external_sources WHERE id = ?`
    )
    .get(source.id) as
    | {
        name: string;
        provider: string;
        feed_url: string;
        enabled: number;
        poll_interval_min: number;
      }
    | undefined;
  return (
    row?.name === source.name &&
    row.provider === "ics_generic" &&
    row.feed_url === source.feedUrl &&
    row.enabled === 1 &&
    row.poll_interval_min === POLL_INTERVAL_MINUTES
  );
}

async function resolveSeedSourceHost(hostname: string) {
  if (!SAFE_SOURCE_HOSTS.has(hostname)) {
    throw new Error("Unexpected Calendar demo source hostname");
  }
  return [PUBLIC_ADDRESS];
}

export default seedCalendar;
