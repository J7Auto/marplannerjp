import type { SeedModule } from "../src/server/db/seeds/types";
import { writeSettingsObject } from "../src/server/modules/settings";
import { DEFAULT_PRINTER_SETTINGS } from "../src/shared/printing";

const settingsSeed: SeedModule = {
  id: "public:settings",
  run({ db }) {
    writeSettingsObject(
      "locale",
      { timezone: "Europe/Madrid", language: "es", weekStartDay: 1 },
      db
    );
    writeSettingsObject("weather", { lat: 39.4627, lon: -0.4206, label: "Aldaia" }, db);
    writeSettingsObject("printer", DEFAULT_PRINTER_SETTINGS, db);
  },
};

export default settingsSeed;
