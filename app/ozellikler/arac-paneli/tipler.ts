export type SistemAdi = "AKOS" | "PESLAYN" | "USYS";

export type RaporTuru =
  | "AKOS_RUHSAT"
  | "AKOS_RUHSAT_TARIHCE"
  | "PESLAYN_ARACLAR"
  | "PESLAYN_HAREKETLER"
  | "USYS_PLAKA_CEZA"
  | "USYS_DENETIM_YAPILMAYAN"
  | "USYS_CEZA_KESILMEYEN";

export type GorunumTuru = "TUM_VERILER" | SistemAdi;
export type KayitSatiri = Record<string, string>;

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
