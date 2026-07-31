import { RAPOR_TANIMLARI, RAPOR_TURLERI } from "./rapor-tanimlari";
import type { KayitSatiri, RaporTuru, SistemAdi } from "./tipler";
import { plakayiBul, satirdanDeger } from "./veri-yardimcilari";

function degerEkle(eskiDeger: string | undefined, yeniDeger: string) {
  const temiz = yeniDeger.trim();
  if (!temiz) return eskiDeger ?? "";
  const degerler = (eskiDeger ?? "").split(" | ").filter(Boolean);
  if (!degerler.includes(temiz)) degerler.push(temiz);
  return degerler.join(" | ");
}

export function sistemSatirlariniHazirla(
  sistem: SistemAdi,
  raporlar: Record<RaporTuru, KayitSatiri[]>,
) {
  return RAPOR_TURLERI
    .filter((rapor) => RAPOR_TANIMLARI[rapor].sistem === sistem)
    .flatMap((rapor) =>
      raporlar[rapor].map((satir) => ({
        "Rapor Türü": RAPOR_TANIMLARI[rapor].baslik,
        ...satir,
      })),
    );
}

export function tumVerileriBirlestir(raporlar: Record<RaporTuru, KayitSatiri[]>) {
  const plakalar = new Map<string, {
    satir: KayitSatiri;
    sistemler: Set<SistemAdi>;
    raporlar: Set<string>;
    hissedarlar: Map<string, string>;
  }>();

  for (const rapor of RAPOR_TURLERI) {
    const tanim = RAPOR_TANIMLARI[rapor];
    for (const hamSatir of raporlar[rapor]) {
      const plaka = plakayiBul(hamSatir);
      if (!plaka) continue;
      const kayit = plakalar.get(plaka) ?? {
        satir: { Plaka: plaka },
        sistemler: new Set<SistemAdi>(),
        raporlar: new Set<string>(),
        hissedarlar: new Map<string, string>(),
      };

      kayit.sistemler.add(tanim.sistem);
      kayit.raporlar.add(tanim.baslik);
      if (tanim.sistem === "AKOS") {
        const hissedar = satirdanDeger(hamSatir, ["Adı Soyadı", "İşletmeci", "Sahibi", "Firma"]);
        const hisse = satirdanDeger(hamSatir, ["Hisse", "Hisse Oranı", "Hisse Orani"]);
        if (hissedar && (hisse || !kayit.hissedarlar.has(hissedar))) {
          kayit.hissedarlar.set(hissedar, hisse);
        }
      }
      for (const [sutun, deger] of Object.entries(hamSatir)) {
        if (sutun.toLocaleLowerCase("tr-TR").includes("plaka")) continue;
        const birlesikSutun = `${tanim.sistem} - ${sutun}`;
        kayit.satir[birlesikSutun] = degerEkle(kayit.satir[birlesikSutun], deger);
      }
      plakalar.set(plaka, kayit);
    }
  }

  return [...plakalar.values()].map(({ satir, sistemler, raporlar: raporAdlari, hissedarlar }) => {
    const hissedarListesi = [...hissedarlar.entries()].map(([ad, hisse]) =>
      hisse ? `${ad} — ${hisse}` : ad,
    );
    return {
      Plaka: satir.Plaka,
      "Hissedar Sayısı": String(hissedarListesi.length),
      Hissedarlar: hissedarListesi.join(" | "),
      "Bulunduğu Bilgi Grupları": [...sistemler].join(", "),
      "Bulunduğu Raporlar": [...raporAdlari].join(", "),
      ...Object.fromEntries(Object.entries(satir).filter(([sutun]) => sutun !== "Plaka")),
    };
  });
}
