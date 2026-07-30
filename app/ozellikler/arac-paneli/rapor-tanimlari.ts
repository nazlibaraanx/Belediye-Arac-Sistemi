import type { RaporDurumu, RaporTuru, SistemAdi } from "./tipler";

export const SISTEMLER: SistemAdi[] = ["AKOS", "PESLAYN", "USYS"];

export const RAPOR_TURLERI: RaporTuru[] = [
  "AKOS_RUHSAT",
  "AKOS_RUHSAT_TARIHCE",
  "PESLAYN_ARACLAR",
  "PESLAYN_HAREKETLER",
  "USYS_PLAKA_CEZA",
  "USYS_DENETIM_YAPILMAYAN",
  "USYS_CEZA_KESILMEYEN",
];

export const RAPOR_TANIMLARI: Record<RaporTuru, {
  sistem: SistemAdi;
  baslik: string;
  aciklama: string;
  beklenenDosya: RegExp;
}> = {
  AKOS_RUHSAT: {
    sistem: "AKOS",
    baslik: "Ruhsat ve Sicil Bilgileri",
    aciklama: "Report (24): kişi, hat, güzergâh, ruhsat ve borç bilgileri",
    beklenenDosya: /Report \(24\)/i,
  },
  AKOS_RUHSAT_TARIHCE: {
    sistem: "AKOS",
    baslik: "Ruhsat Tarihçesi",
    aciklama: "Report (25): devir, askı, yenileme ve geçerlilik tarihleri",
    beklenenDosya: /Report \(25\)/i,
  },
  PESLAYN_ARACLAR: {
    sistem: "PESLAYN",
    baslik: "Araç Bilgileri",
    aciklama: "AraclarTablosu: marka, model, motor, şasi ve kapasite",
    beklenenDosya: /AraclarTablosu/i,
  },
  PESLAYN_HAREKETLER: {
    sistem: "PESLAYN",
    baslik: "Araç Hareketleri",
    aciklama: "Tüm Araçlar Raporu: tarih, grup, hat ve veri sağlayıcı",
    beklenenDosya: /T[uü]m Ara[cç]lar Raporu/i,
  },
  USYS_PLAKA_CEZA: {
    sistem: "USYS",
    baslik: "Plaka Ceza Listesi",
    aciklama: "Ceza maddesi, tutanak türü ve oluşturulma tarihi",
    beklenenDosya: /PlakaCezaListesi/i,
  },
  USYS_DENETIM_YAPILMAYAN: {
    sistem: "USYS",
    baslik: "Denetimi Yapılmayan Araçlar",
    aciklama: "Denetimi bulunmayan plakalar ve plaka türleri",
    beklenenDosya: /DenetimiYapilmayanAraclar/i,
  },
  USYS_CEZA_KESILMEYEN: {
    sistem: "USYS",
    baslik: "Ceza Kesilmeyen Araçlar",
    aciklama: "Ceza işlemi bulunmayan plakalar ve plaka türleri",
    beklenenDosya: /CezaKesilmeyenAraclar/i,
  },
};

export function sisteminRaporlari(sistem: SistemAdi) {
  return RAPOR_TURLERI.filter((rapor) => RAPOR_TANIMLARI[rapor].sistem === sistem);
}

export function bosRaporDurumlari(): Record<RaporTuru, RaporDurumu> {
  return Object.fromEntries(
    RAPOR_TURLERI.map((rapor) => [rapor, { rows: [], loading: false }]),
  ) as Record<RaporTuru, RaporDurumu>;
}
