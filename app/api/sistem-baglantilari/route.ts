import {
  sistemDurumlariniGetir,
  sistemdenVeriCek,
  type SistemAdi,
} from "../../yardimcilar/belediye-sistem-baglantilari";

const SISTEM_ADLARI: SistemAdi[] = ["AKOS", "PESLAYN", "USYS"];

export async function GET() {
  return Response.json({ connectors: sistemDurumlariniGetir() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { connector?: SistemAdi | "ALL" };
    const secilenSistemler = body.connector === "ALL"
      ? SISTEM_ADLARI
      : body.connector && SISTEM_ADLARI.includes(body.connector)
        ? [body.connector]
        : [];
    if (!secilenSistemler.length) {
      return Response.json({ error: "Geçerli bir veri kaynağı seçilmedi." }, { status: 400 });
    }

    const results = [];
    for (const connector of secilenSistemler) {
      try {
        results.push(await sistemdenVeriCek(connector));
      } catch (error) {
        results.push({
          connector,
          ok: false,
          message: error instanceof Error ? error.message : "Veri çekilemedi.",
        });
      }
    }
    const ok = results.every((result) =>
      typeof result === "object" && result !== null && "ok" in result && result.ok,
    );
    return Response.json({ ok, results }, { status: ok ? 200 : 409 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bağlantı işlemi başarısız." },
      { status: 500 },
    );
  }
}
