import { env } from "cloudflare:workers";

type SourceName =
  | "RUHSAT_BILGILERI"
  | "ARAC_TEKNIK"
  | "ARAC_HAREKETLERI"
  | "RUHSAT_TARIHCE"
  | "PLAKA_CEZA"
  | "DENETIM_EKSIK";
type RecordRow = Record<string, string>;

const SOURCES = new Set<SourceName>([
  "RUHSAT_BILGILERI",
  "ARAC_TEKNIK",
  "ARAC_HAREKETLERI",
  "RUHSAT_TARIHCE",
  "PLAKA_CEZA",
  "DENETIM_EKSIK",
]);

async function ensureSchema() {
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

function normalize(value: string) {
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

function valueFor(row: RecordRow, aliases: string[]) {
  const normalized = aliases.map(normalize);
  const key = Object.keys(row).find((candidate) => normalized.includes(normalize(candidate)));
  return key ? String(row[key] ?? "") : "";
}

function summaryFromRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    source: row.source as SourceName,
    fileName: String(row.file_name),
    importedAt: String(row.imported_at),
    rowCount: Number(row.row_count),
    columns: JSON.parse(String(row.columns_json)) as string[],
  };
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const source = url.searchParams.get("source") as SourceName | null;

    if (!source) {
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
      return Response.json({ imports: latest.results.map(summaryFromRow) });
    }

    if (!SOURCES.has(source)) {
      return Response.json({ error: "Geçersiz veri kaynağı." }, { status: 400 });
    }
    const latest = await env.DB.prepare(
      "SELECT * FROM data_imports WHERE source = ? ORDER BY id DESC LIMIT 1",
    ).bind(source).first();
    if (!latest) return Response.json({ rows: [], summary: null });
    const records = await env.DB.prepare(
      "SELECT raw_json FROM imported_records WHERE import_id = ? ORDER BY id",
    ).bind(latest.id).all<{ raw_json: string }>();
    return Response.json({
      summary: summaryFromRow(latest),
      rows: records.results.map((record) => JSON.parse(record.raw_json) as RecordRow),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Kayıtlar okunamadı." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as {
      source?: SourceName;
      fileName?: string;
      columns?: string[];
      rows?: RecordRow[];
    };
    if (!body.source || !SOURCES.has(body.source)) {
      return Response.json({ error: "Geçerli bir rapor türü seçmelisin." }, { status: 400 });
    }
    if (!body.fileName || !body.columns?.length || !body.rows?.length) {
      return Response.json({ error: "Dosya bilgisi veya kayıtlar eksik." }, { status: 400 });
    }
    if (body.rows.length > 100_000) {
      return Response.json({ error: "Tek aktarımda en fazla 100.000 kayıt yüklenebilir." }, { status: 413 });
    }

    const importedAt = new Date().toISOString();
    const imported = await env.DB.prepare(`
      INSERT INTO data_imports (source, file_name, imported_at, row_count, columns_json)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      body.source,
      body.fileName.slice(0, 240),
      importedAt,
      body.rows.length,
      JSON.stringify(body.columns),
    ).first<{ id: number }>();
    if (!imported?.id) throw new Error("Aktarım kaydı oluşturulamadı.");

    const statements = body.rows.map((row) => {
      const plate = valueFor(row, ["Plakası", "Plaka", "Araç Plakası", "PLAKA", "Plaka Numarasi"]).replace(/\s+/g, "").toLocaleUpperCase("tr-TR");
      const owner = valueFor(row, ["Adı Soyadı", "İşletmeci", "Sahibi", "Firma"]);
      const status = valueFor(row, ["Aktif /Pasif", "Aktif/Pasif", "Durum"]);
      return env.DB.prepare(`
        INSERT INTO imported_records (import_id, source, plate, owner_name, status, raw_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(imported.id, body.source, plate || null, owner || null, status || null, JSON.stringify(row));
    });

    for (let index = 0; index < statements.length; index += 75) {
      await env.DB.batch(statements.slice(index, index + 75));
    }

    return Response.json({
      summary: {
        id: imported.id,
        source: body.source,
        fileName: body.fileName,
        importedAt,
        rowCount: body.rows.length,
        columns: body.columns,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dosya aktarılamadı." },
      { status: 500 },
    );
  }
}
