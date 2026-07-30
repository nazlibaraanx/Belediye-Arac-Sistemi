import {
  RAPOR_KAYNAKLARI,
  raporTablolariniHazirla,
  raporuKaydet,
  sonRaporOzetleriniGetir,
  sonRaporuGetir,
  tumRaporlariTemizle,
  type HamKayit,
  type RaporKaynagi,
} from "../../yardimcilar/rapor-deposu";

function hataYaniti(error: unknown, fallback: string) {
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await raporTablolariniHazirla();
    const source = new URL(request.url).searchParams.get("source") as RaporKaynagi | null;

    if (!source) {
      return Response.json({ imports: await sonRaporOzetleriniGetir() });
    }
    if (!RAPOR_KAYNAKLARI.has(source)) {
      return Response.json({ error: "Geçersiz veri kaynağı." }, { status: 400 });
    }
    return Response.json(await sonRaporuGetir(source));
  } catch (error) {
    return hataYaniti(error, "Kayıtlar okunamadı.");
  }
}

export async function POST(request: Request) {
  try {
    await raporTablolariniHazirla();
    const body = await request.json() as {
      source?: RaporKaynagi;
      fileName?: string;
      columns?: string[];
      rows?: HamKayit[];
    };

    if (!body.source || !RAPOR_KAYNAKLARI.has(body.source)) {
      return Response.json({ error: "Geçerli bir rapor türü seçmelisin." }, { status: 400 });
    }
    if (!body.fileName || !body.columns?.length || !body.rows?.length) {
      return Response.json({ error: "Dosya bilgisi veya kayıtlar eksik." }, { status: 400 });
    }
    if (body.rows.length > 100_000) {
      return Response.json(
        { error: "Tek aktarımda en fazla 100.000 kayıt yüklenebilir." },
        { status: 413 },
      );
    }

    const summary = await raporuKaydet({
      source: body.source,
      fileName: body.fileName,
      columns: body.columns,
      rows: body.rows,
    });
    return Response.json({ summary });
  } catch (error) {
    return hataYaniti(error, "Dosya aktarılamadı.");
  }
}

export async function DELETE() {
  try {
    await raporTablolariniHazirla();
    await tumRaporlariTemizle();
    return Response.json({
      ok: true,
      message: "İçe aktarılan bütün rapor kayıtları temizlendi.",
    });
  } catch (error) {
    return hataYaniti(error, "Kayıtlar temizlenemedi.");
  }
}
