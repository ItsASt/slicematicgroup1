// Generates a SQL seed migration from the menu txt files, so the Supabase
// GitHub integration can load the menu automatically alongside the schema.
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { parseMenuFile } from "../lib/menu-parser";

const FILES: { file: string; table: string }[] = [
  { file: "Types_of_Base.txt", table: "bases" },
  { file: "Types_of_Pizza.txt", table: "pizzas" },
  { file: "Types_of_Toppings.txt", table: "toppings" },
  { file: "Types_of_Beverages.txt", table: "beverages" },
];

const esc = (s: string) => s.replace(/'/g, "''");
let sql = "-- Menu seed, generated from data/*.txt by scripts/gen-seed-migration.ts.\n-- Regenerate after editing the txt files: npx tsx scripts/gen-seed-migration.ts\n";

for (const { file, table } of FILES) {
  const { items, skipped } = parseMenuFile(readFileSync(path.join("data", file), "utf8"));
  if (skipped.length) console.warn(`[${file}] skipped: ${skipped.join(" | ")}`);
  if (items.length === 0) throw new Error(`${file} has no valid items`);
  sql += `\ninsert into ${table} (id, name, price) values\n`;
  sql += items.map((i) => `  ('${esc(i.id)}', '${esc(i.name)}', ${i.price})`).join(",\n");
  sql += "\non conflict (id) do update set name = excluded.name, price = excluded.price;\n";
}

const out = "supabase/migrations/20260705190000_seed_menu.sql";
writeFileSync(out, sql);
console.log(`Wrote ${out}`);
