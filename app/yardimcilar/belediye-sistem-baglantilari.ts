import { raporuKaydet, type HamKayit, type RaporKaynagi } from "./rapor-deposu";

export type SistemAdi = "AKOS" | "PESLAYN" | "USYS";

export type SistemBaglantiDurumu = {
  name: SistemAdi;
  configured: boolean;
  reportCount: number;
  configuredReportCount: number;
  status: "API bilgisi bekleniyor" | "Bağlantıya hazır";
};

const SISTEM_RAPORLARI: Record<SistemAdi, RaporKaynagi[]> = {
  AKOS: ["AKOS_RUHSAT", "AKOS_RUHSAT_TARIHCE"],
  PESLAYN: ["PESLAYN_ARACLAR", "PESLAYN_HAREKETLER"],
  USYS: ["USYS_PLAKA_CEZA", "USYS_DENETIM_YAPILMAYAN", "USYS_CEZA_KESILMEYEN"],
};

function raporAdresi(rapor: RaporKaynagi) {
  return process.env[`${rapor}_API_URL`]?.trim() ?? "";
}

function istekBasliklari(sistem: SistemAdi) {
  const token = process.env[`${sistem}_API_TOKEN`]?.trim();
  const kullanici = process.env[`${sistem}_USERNAME`]?.trim();
  const sifre = process.env[`${sistem}_PASSWORD`] ?? "";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (kullanici && sifre) {
    headers.Authorization = `Basic ${Buffer.from(`${kullanici}:${sifre}`).toString("base64")}`;
  }
  return headers;
}

function apiSatirlariniBul(yanit: unknown): HamKayit[] {
  if (Array.isArray(yanit)) return yanit as HamKayit[];
  if (!yanit || typeof yanit !== "object") return [];
  const nesne = yanit as Record<string, unknown>;
  for (const alan of ["rows", "data", "records", "items", "results"]) {
    if (Array.isArray(nesne[alan])) return nesne[alan] as HamKayit[];
  }
  return [];
}

export function sistemDurumlariniGetir(): SistemBaglantiDurumu[] {
  return (Object.keys(SISTEM_RAPORLARI) as SistemAdi[]).map((name) => {
    const raporlar = SISTEM_RAPORLARI[name];
    const configuredReportCount = raporlar.filter((rapor) => raporAdresi(rapor)).length;
    const configured = configuredReportCount === raporlar.length;
    return {
      name,
      configured,
      reportCount: raporlar.length,
      configuredReportCount,
      status: configured ? "Bağlantıya hazır" : "API bilgisi bekleniyor",
    };
  });
}

export async function sistemdenVeriCek(name: SistemAdi) {
  const raporlar = SISTEM_RAPORLARI[name];
  if (raporlar.some((rapor) => !raporAdresi(rapor))) {
    throw new Error(`${name} API adresleri henüz tanımlanmadı.`);
  }

  let toplamKayit = 0;
  for (const rapor of raporlar) {
    const response = await fetch(raporAdresi(rapor), {
      method: "GET",
      headers: istekBasliklari(name),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${name} bağlantısı ${response.status} hatası verdi.`);
    const satirlar = apiSatirlariniBul(await response.json());
    if (!satirlar.length) throw new Error(`${rapor} API yanıtında kayıt dizisi bulunamadı.`);
    const temizSatirlar = satirlar.map((satir) =>
      Object.fromEntries(Object.entries(satir).map(([alan, deger]) => [alan, String(deger ?? "")])),
    );
    await raporuKaydet({
      source: rapor,
      fileName: `${name} API`,
      columns: [...new Set(temizSatirlar.flatMap(Object.keys))],
      rows: temizSatirlar,
    });
    toplamKayit += temizSatirlar.length;
  }
  return {
    connector: name,
    ok: true,
    rowCount: toplamKayit,
    message: `${name}: ${toplamKayit.toLocaleString("tr-TR")} kayıt güncellendi.`,
  };
}
