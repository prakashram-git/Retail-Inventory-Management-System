import { adminClient } from "./_help-env";
import { seedHelpContent } from "../lib/help/seed";

seedHelpContent(adminClient())
  .then((n) => console.log(`Seeded ${n} help workflows (hashes recomputed, drift cleared).`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
