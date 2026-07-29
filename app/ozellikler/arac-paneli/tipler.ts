export type RaporTuru =
  | "RUHSAT_BILGILERI"
  | "ARAC_TEKNIK"
  | "ARAC_HAREKETLERI"
  | "RUHSAT_TARIHCE"
  | "PLAKA_CEZA"
  | "DENETIM_EKSIK";

export type KayitSatiri = Record<string, string>;
export type GorunumTuru = RaporTuru | "BIRLESIK";
export type SistemAdi = "AKOS" | "PESLAYN" | "USYS";

export type SistemDurumu = {
  name: SistemAdi;
  configured: boolean;
  status: "Yetki bekleniyor" | "Bağlantıya hazır";
};

export type AktarimOzeti = {
  id: number;
  source: RaporTuru;
  fileName: string;
  importedAt: string;
  rowCount: number;
  columns: string[];
};

export type RaporDurumu = {
  summary?: AktarimOzeti;
  rows: KayitSatiri[];
  loading: boolean;
  error?: string;
};

export type BirlesikArac = {
  plate: string;
  owner: string;
  brandModel: string;
  route: string;
  status: string;
  penaltyCount: number;
  activityCount: number;
  inspectionMissing: boolean;
  datasets: RaporTuru[];
  records: { dataset: RaporTuru; row: KayitSatiri }[];
};
