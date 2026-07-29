import type { RaporDurumu, RaporTuru } from "./tipler";

export const RAPOR_TURLERI: RaporTuru[] = [
  "RUHSAT_BILGILERI",
  "ARAC_TEKNIK",
  "ARAC_HAREKETLERI",
  "RUHSAT_TARIHCE",
  "PLAKA_CEZA",
  "DENETIM_EKSIK",
];

export const RAPOR_TANIMLARI: Record<RaporTuru, {
  label: string;
  short: string;
  description: string;
  tone: string;
  expectedFile: RegExp;
}> = {
  RUHSAT_BILGILERI: {
    label: "Ruhsat Bilgileri",
    short: "Ruhsat",
    description: "Sicil, kişi, hat, güzergâh, ruhsat ve borç",
    tone: "blue",
    expectedFile: /Report \(24\)/i,
  },
  ARAC_TEKNIK: {
    label: "Araç Teknik Bilgileri",
    short: "Teknik",
    description: "Marka, model, şasi, motor ve kapasite",
    tone: "teal",
    expectedFile: /AraclarTablosu/i,
  },
  ARAC_HAREKETLERI: {
    label: "Tüm Araç Hareketleri",
    short: "Hareket",
    description: "Tarih, grup, hat ve veri sağlayıcı",
    tone: "violet",
    expectedFile: /T[uü]m Ara[cç]lar Raporu/i,
  },
  RUHSAT_TARIHCE: {
    label: "Ruhsat Tarihçesi",
    short: "Tarihçe",
    description: "Devir, askı, yenileme ve geçerlilik tarihleri",
    tone: "indigo",
    expectedFile: /Report \(25\)/i,
  },
  PLAKA_CEZA: {
    label: "Plaka Ceza Kayıtları",
    short: "Ceza",
    description: "Ceza maddesi, tutanak türü ve tarih",
    tone: "red",
    expectedFile: /PlakaCezaListesi/i,
  },
  DENETIM_EKSIK: {
    label: "Denetimi Yapılmayanlar",
    short: "Denetim",
    description: "Denetim bekleyen plaka ve plaka türü",
    tone: "amber",
    expectedFile: /DenetimiYapilmayanAraclar/i,
  },
};

export function bosRaporDurumlari(): Record<RaporTuru, RaporDurumu> {
  return {
    RUHSAT_BILGILERI: { rows: [], loading: false },
    ARAC_TEKNIK: { rows: [], loading: false },
    ARAC_HAREKETLERI: { rows: [], loading: false },
    RUHSAT_TARIHCE: { rows: [], loading: false },
    PLAKA_CEZA: { rows: [], loading: false },
    DENETIM_EKSIK: { rows: [], loading: false },
  };
}
