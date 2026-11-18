import type { Slot, Weekday } from "../src/shared";
import type { SeedModule } from "../src/server/db/seeds/types";
import { readWeekStartDay } from "../src/server/lib/household-date";
import {
  replaceSeedRollingMealEntries,
  upsertSeedMealEntry,
  upsertSeedMealPlan,
  upsertSeedRecipe,
} from "../src/server/modules/meals";

const PLAN_ID = "demo:meal-plan:semana-en-casa";
const LUNCH_PLAN_ID = "demo:meal-plan:taper-oficina";

type RecurringSeed = readonly [
  weekday: Weekday,
  slot: Slot,
  content: { recipeId?: string; note?: string },
];

/** Menú semanal de casa: `demo:meal-entry:recurring:<weekday>:<slot>`. */
const HOME_ENTRIES: readonly RecurringSeed[] = [
  ["mon", "dinner", { recipeId: "demo:recipe:crema-calabaza" }],
  ["tue", "dinner", { note: "Sobras" }],
  ["wed", "dinner", { recipeId: "demo:recipe:salmon-plancha" }],
  ["fri", "dinner", { recipeId: "demo:recipe:pizza-casera" }],
  ["sat", "breakfast", { recipeId: "demo:recipe:tostadas-tomate" }],
  ["sun", "lunch", { recipeId: "demo:recipe:paella-valenciana" }],
];

/** Tápers para el trabajo: `demo:meal-entry:recurring:taper-oficina:<weekday>:<slot>`. */
const LUNCH_ENTRIES: readonly RecurringSeed[] = [
  ["mon", "lunch", { recipeId: "demo:recipe:lentejas" }],
  ["tue", "lunch", { recipeId: "demo:recipe:pollo-horno" }],
  ["wed", "lunch", { recipeId: "demo:recipe:pasta-pesto" }],
  ["thu", "lunch", { recipeId: "demo:recipe:arroz-al-horno" }],
  ["fri", "snack", { recipeId: "demo:recipe:bocadillo-almuerzo" }],
  ["fri", "lunch", { note: "Comida fuera" }],
];

const RECIPES = [
  {
    id: "demo:recipe:paella-valenciana",
    name: "Paella valenciana",
    ingredients: [
      "arroz bomba",
      "pollo",
      "conejo",
      "judía ferraura",
      "garrofó",
      "tomate",
      "azafrán",
    ],
    instructions:
      "Sofríe la carne, añade verdura y tomate, moja con agua, echa el arroz y deja 18 minutos sin remover.",
    slots: ["lunch"] as Slot[],
  },
  {
    id: "demo:recipe:arroz-al-horno",
    name: "Arròs al forn",
    ingredients: ["arroz", "costilla", "garbanzos", "morcilla", "patata", "tomate"],
    instructions:
      "Sofríe la costilla y la morcilla, mezcla con el arroz y el caldo en cazuela de barro y hornea 20 minutos.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:lentejas",
    name: "Lentejas con verduras",
    ingredients: ["lentejas", "zanahoria", "pimiento", "cebolla", "pimentón"],
    instructions: "Sofríe la verdura, añade lentejas y agua y cuece a fuego lento 40 minutos.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:tortilla-patatas",
    name: "Tortilla de patatas",
    ingredients: ["patatas", "huevos", "cebolla", "aceite de oliva"],
    instructions: "Confita patata y cebolla, mezcla con el huevo batido y cuaja por ambos lados.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:ensalada-valenciana",
    name: "Ensalada valenciana",
    ingredients: ["lechuga", "tomate", "cebolla", "olivas", "atún", "huevo duro"],
    instructions: "Corta todo, aliña con aceite, sal y vinagre.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:pollo-horno",
    name: "Pollo al horno con patatas",
    ingredients: ["muslos de pollo", "patatas", "limón", "ajo", "romero"],
    instructions: "Hornea a 200 °C unos 50 minutos dándole la vuelta a mitad.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:crema-calabaza",
    name: "Crema de calabaza",
    ingredients: ["calabaza", "puerro", "patata", "caldo de verduras"],
    instructions: "Cuece la verdura en el caldo y tritura hasta que quede fina.",
    slots: ["dinner"] as Slot[],
  },
  {
    id: "demo:recipe:salmon-plancha",
    name: "Salmón a la plancha con verduras",
    ingredients: ["salmón", "calabacín", "espárragos", "limón"],
    instructions: "Marca el salmón por ambos lados y saltea las verduras.",
    slots: ["dinner"] as Slot[],
  },
  {
    id: "demo:recipe:pasta-pesto",
    name: "Pasta al pesto",
    ingredients: ["pasta", "albahaca", "piñones", "parmesano", "ajo"],
    instructions: "Cuece la pasta y mézclala con el pesto triturado.",
    slots: ["lunch", "dinner"] as Slot[],
  },
  {
    id: "demo:recipe:bocadillo-almuerzo",
    name: "Bocadillo de almuerzo",
    ingredients: ["pan", "lomo", "queso", "pimientos"],
    instructions: "Plancha el lomo y los pimientos y monta el bocadillo.",
    slots: ["breakfast", "snack"] as Slot[],
  },
  {
    id: "demo:recipe:tostadas-tomate",
    name: "Tostadas con tomate y aceite",
    ingredients: ["pan", "tomate rallado", "aceite de oliva", "sal"],
    instructions: "Tuesta el pan y cúbrelo con tomate y aceite.",
    slots: ["breakfast"] as Slot[],
  },
  {
    id: "demo:recipe:yogur-avena",
    name: "Yogur con avena y fruta",
    ingredients: ["yogur natural", "avena", "plátano", "nueces"],
    instructions: "Mezcla en un bol y sirve.",
    slots: ["breakfast", "snack"] as Slot[],
  },
  {
    id: "demo:recipe:horchata-fartons",
    name: "Horchata con fartons",
    ingredients: ["horchata", "fartons"],
    instructions: "Sirve la horchata bien fría y moja los fartons.",
    slots: ["snack"] as Slot[],
  },
  {
    id: "demo:recipe:pizza-casera",
    name: "Pizza casera",
    ingredients: ["masa", "tomate", "mozzarella", "orégano"],
    instructions: "Estira la masa, añade los ingredientes y hornea a 250 °C 10 minutos.",
    slots: ["dinner"] as Slot[],
  },
  {
    id: "demo:recipe:tortilla-proteica",
    name: "Revuelto de claras con espinacas",
    ingredients: ["claras", "espinacas", "pavo"],
    instructions: "Saltea las espinacas y el pavo y cuaja las claras encima.",
    slots: ["breakfast", "dinner"] as Slot[],
  },
];

type RollingEntry = { date: string; slot: Slot; suffix: string; recipeId?: string; note?: string };

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Pure, deterministic three-week fixture: previous/current/next household weeks. */
export function buildRollingMealEntries(asOfDate: string, weekStartDay: number): RollingEntry[] {
  const weekday = new Date(`${asOfDate}T00:00:00.000Z`).getUTCDay();
  const offset = (weekday - weekStartDay + 7) % 7;
  const weekStart = addDays(asOfDate, -offset);
  const at = (
    offsetFromWeekStart: number,
    slot: Slot,
    suffix: string,
    content: { recipeId?: string; note?: string }
  ) => ({ date: addDays(weekStart, offsetFromWeekStart), slot, suffix, ...content });
  // Together with the recurring plans, every day of the current week gets breakfast, lunch and
  // dinner; the previous and next weeks get a lighter, still navigable spread.
  return [
    at(-7, "breakfast", "previous-mon-breakfast", { recipeId: "demo:recipe:yogur-avena" }),
    at(-5, "dinner", "previous-wed-dinner", { recipeId: "demo:recipe:tortilla-patatas" }),
    at(-3, "dinner", "previous-dinner", { recipeId: "demo:recipe:ensalada-valenciana" }),
    at(-2, "dinner", "previous-sat-dinner", { note: "Cena fuera" }),
    at(-1, "lunch", "previous-lunch", { note: "Comida familiar" }),
    at(0, "breakfast", "current-breakfast", { recipeId: "demo:recipe:yogur-avena" }),
    at(1, "breakfast", "current-tue-breakfast", { recipeId: "demo:recipe:tostadas-tomate" }),
    at(1, "snack", "current-tue-snack", { recipeId: "demo:recipe:horchata-fartons" }),
    at(2, "breakfast", "current-wed-breakfast", { recipeId: "demo:recipe:tortilla-proteica" }),
    at(3, "breakfast", "current-thu-breakfast", { recipeId: "demo:recipe:yogur-avena" }),
    at(3, "dinner", "current-thu-dinner", { recipeId: "demo:recipe:tortilla-patatas" }),
    at(4, "breakfast", "current-fri-breakfast", { recipeId: "demo:recipe:tostadas-tomate" }),
    at(5, "lunch", "current-sat-lunch", { note: "Tapas en el Mercado Central" }),
    at(5, "dinner", "current-sat-dinner", { recipeId: "demo:recipe:ensalada-valenciana" }),
    at(6, "breakfast", "current-sun-breakfast", { recipeId: "demo:recipe:yogur-avena" }),
    at(6, "dinner", "current-sunday", { recipeId: "demo:recipe:crema-calabaza" }),
    at(8, "dinner", "next-tue-dinner", { recipeId: "demo:recipe:pollo-horno" }),
    at(10, "breakfast", "next-thu-breakfast", { recipeId: "demo:recipe:tortilla-proteica" }),
    at(12, "dinner", "next-sat-dinner", { note: "Cumpleaños de un amigo" }),
    at(13, "lunch", "next-sun-lunch", { note: "Bocadillos para la ruta" }),
  ];
}

const mealsSeed: SeedModule = {
  id: "meals:demo",
  run({ asOfDate, nowMs }) {
    for (const recipe of RECIPES) upsertSeedRecipe({ ...recipe, nowMs });
    upsertSeedMealPlan({ id: PLAN_ID, nowMs, name: "Semana en casa" });
    // One millisecond later, so the home plan keeps the first plan colour (creation order).
    upsertSeedMealPlan({ id: LUNCH_PLAN_ID, nowMs: nowMs + 1, name: "Táper de la oficina" });
    for (const [weekday, slot, content] of HOME_ENTRIES) {
      upsertSeedMealEntry({
        id: `demo:meal-entry:recurring:${weekday}:${slot}`,
        nowMs,
        kind: "recurring",
        mealPlanId: PLAN_ID,
        weekday,
        slot,
        ...content,
      });
    }
    for (const [weekday, slot, content] of LUNCH_ENTRIES) {
      upsertSeedMealEntry({
        id: `demo:meal-entry:recurring:taper-oficina:${weekday}:${slot}`,
        nowMs,
        kind: "recurring",
        mealPlanId: LUNCH_PLAN_ID,
        weekday,
        slot,
        ...content,
      });
    }
    const rollingEntries = buildRollingMealEntries(asOfDate, readWeekStartDay());
    const rollingIds = rollingEntries.map(
      (entry) => `demo:meal-entry:rolling:${entry.date}:${entry.slot}:${entry.suffix}`
    );
    replaceSeedRollingMealEntries(asOfDate, rollingIds);
    for (const entry of rollingEntries) {
      upsertSeedMealEntry({
        id: `demo:meal-entry:rolling:${entry.date}:${entry.slot}:${entry.suffix}`,
        nowMs,
        kind: "oneoff",
        date: entry.date,
        slot: entry.slot,
        recipeId: entry.recipeId,
        note: entry.note,
      });
    }
  },
};

export default mealsSeed;
