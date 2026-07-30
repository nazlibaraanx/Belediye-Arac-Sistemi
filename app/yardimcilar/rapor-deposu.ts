import { env } from "cloudflare:workers";

export type RaporKaynagi =
  | "AKOS_RUHSAT"
  | "AKOS_RUHSAT_TARIHCE"
  | "PESLAYN_ARACLAR"
  | "PESLAYN_HAREKETLER"
  | "USYS_PLAKA_CEZA"
  | "USYS_DENETIM_YAPILMAYAN"
  | "USYS_CEZA_KESILMEYEN";

export type HamKayit = Record<string, string>;

export const RAPOR_KAYNAKLARI = new Set<RaporKaynagi>([
  "AKOS_RUHSAT",
  "AKOS_RUHSAT_TARIHCE",
  "PESLAYN_ARACLAR",
  "PESLAYN_HAREKETLER",
  "USYS_PLAKA_CEZA",
  "USYS_DENETIM_YAPILMAYAN",
  "USYS_CEZA_KESILMEYEN",
]);

export async function raporTablolariniHazirla() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS data_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      columns_json TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS imported_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      plate TEXT,
      owner_name TEXT,
      status TEXT,
      raw_json TEXT NOT NULL,
      FOREIGN KEY(import_id) REFERENCES data_imports(id) ON DELETE CASCADE
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS imported_records_import_idx ON imported_records(import_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS imported_records_plate_idx ON imported_records(plate)"),
  ]);
}

function metniNormallestir(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();
}

function satirdanDeger(row: HamKayit, aliases: string[]) {
  const normalized = aliases.map(metniNormallestir);
  const key = Object.keys(row).find((candidate) => normalized.includes(metniNormallestir(candidate)));
  return key ? String(row[key] ?? "") : "";
}

function ozetiDonustur(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    source: row.source as RaporKaynagi,
    fileName: String(row.file_name),
    importedAt: String(row.imported_at),
    rowCount: Number(row.row_count),
    columns: JSON.parse(String(row.columns_json)) as string[],
  };
}

export async function sonRaporOzetleriniGetir() {
  const latest = await env.DB.prepare(`
    SELECT data_imports.*
    FROM data_imports
    INNER JOIN (
      SELECT source, MAX(id) AS latest_id
      FROM data_imports
      GROUP BY source
    ) latest ON latest.latest_id = data_imports.id
    ORDER BY data_imports.source
  `).all();
  return latest.results.map(ozetiDonustur);
}

export async function sonRaporuGetir(source: RaporKaynagi) {
  const latest = await env.DB.prepare(
    "SELECT * FROM data_imports WHERE source = ? ORDER BY id DESC LIMIT 1",
  ).bind(source).first();
  if (!latest) return { rows: [], summary: null };

  const records = await env.DB.prepare(
    "SELECT raw_json FROM imported_records WHERE import_id = ? ORDER BY id",
  ).bind(latest.id).all<{ raw_json: string }>();

  return {
    summary: ozetiDonustur(latest),
    rows: records.results.map((record) => JSON.parse(record.raw_json) as HamKayit),
  };
}

export async function raporuKaydet(input: {
  source: RaporKaynagi;
  fileName: string;
  columns: string[];
  rows: HamKayit[];
}) {
  const importedAt = new Date().toISOString();
  const imported = await env.DB.prepare(`
    INSERT INTO data_imports (source, file_name, imported_at, row_count, columns_json)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).bind(
    input.source,
    input.fileName.slice(0, 240),
    importedAt,
    input.rows.length,
    JSON.stringify(input.columns),
  ).first<{ id: number }>();
  if (!imported?.id) throw new Error("Aktarım kaydı oluşturulamadı.");

  const statements = input.rows.map((row) => {
    const plate = satirdanDeger(
      row,
      ["Plakası", "Plaka", "Araç Plakası", "PLAKA", "Plaka Numarasi"],
    ).replace(/\s+/g, "").toLocaleUpperCase("tr-TR");
    const owner = satirdanDeger(row, ["Adı Soyadı", "İşletmeci", "Sahibi", "Firma"]);
    const status = satirdanDeger(row, ["Aktif /Pasif", "Aktif/Pasif", "Durum"]);
    return env.DB.prepare(`
      INSERT INTO imported_records (import_id, source, plate, owner_name, status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(imported.id, input.source, plate || null, owner || null, status || null, JSON.stringify(row));
  });

  for (let index = 0; index < statements.length; index += 75) {
    await env.DB.batch(statements.slice(index, index + 75));
  }

  return {
    id: imported.id,
    source: input.source,
    fileName: input.fileName,
    importedAt,
    rowCount: input.rows.length,
    columns: input.columns,
  };
}

export async function tumRaporlariTemizle() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM imported_records"),
    env.DB.prepare("DELETE FROM data_imports"),
  ]);
}
