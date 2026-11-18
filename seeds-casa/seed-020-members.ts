import type { MemberColorKey } from "../src/shared";
import type { SeedModule } from "../src/server/db/seeds/types";

type DemoMember = {
  id: string;
  displayName: string;
  role: "parent" | "child";
  colorKey: MemberColorKey;
  birthDate: { month: number; day: number; year: number | null };
};

/** Hogar de Jorge y Tamara. Cumpleaños de ejemplo: cámbialos en Administración → Miembros. */
const CANONICAL_MEMBERS: readonly DemoMember[] = [
  {
    id: "demo:member:jorge",
    displayName: "Jorge",
    role: "parent",
    colorKey: "blue",
    birthDate: { month: 3, day: 14, year: null },
  },
  {
    id: "demo:member:tamara",
    displayName: "Tamara",
    role: "parent",
    colorKey: "violet",
    birthDate: { month: 9, day: 22, year: null },
  },
];

const seedMembers: SeedModule = {
  id: "members:demo",
  run({ db, nowMs }) {
    const upsert = db.prepare(
      `INSERT INTO members
        (id, display_name, color_key, role, lifecycle, birth_month, birth_day, birth_year, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         color_key = excluded.color_key,
         role = excluded.role,
         lifecycle = excluded.lifecycle,
         birth_month = excluded.birth_month,
         birth_day = excluded.birth_day,
         birth_year = excluded.birth_year,
         updated_at = excluded.updated_at
       WHERE display_name IS NOT excluded.display_name
          OR color_key IS NOT excluded.color_key
          OR role IS NOT excluded.role
          OR lifecycle IS NOT excluded.lifecycle
          OR birth_month IS NOT excluded.birth_month
          OR birth_day IS NOT excluded.birth_day
          OR birth_year IS NOT excluded.birth_year`
    );

    for (const member of CANONICAL_MEMBERS) {
      upsert.run(
        member.id,
        member.displayName,
        member.colorKey,
        member.role,
        member.birthDate.month,
        member.birthDate.day,
        member.birthDate.year,
        nowMs,
        nowMs
      );
    }
  },
};

export default seedMembers;
