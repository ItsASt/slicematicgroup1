export interface MenuLine {
  id: string;
  name: string;
  price: number;
}

/** Parses one `ID ; Name ; Price` line. Returns null for any malformed line. */
export function parseMenuLine(line: string): MenuLine | null {
  const parts = line.split(";").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [id, name, priceRaw] = parts;
  if (!id || !name || !priceRaw) return null;
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { id, name, price };
}

/** Parses a whole menu file, skipping (and reporting) malformed lines. */
export function parseMenuFile(content: string): { items: MenuLine[]; skipped: string[] } {
  const items: MenuLine[] = [];
  const skipped: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const parsed = parseMenuLine(line);
    if (parsed) items.push(parsed);
    else skipped.push(line);
  }
  return { items, skipped };
}
