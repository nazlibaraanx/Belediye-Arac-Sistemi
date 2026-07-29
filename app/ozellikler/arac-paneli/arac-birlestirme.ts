import { RAPOR_TURLERI } from "./rapor-tanimlari";
import type { BirlesikArac, KayitSatiri, RaporTuru } from "./tipler";
import { plakayiBul, satirdanDeger } from "./veri-yardimcilari";

export function aracKayitlariniBirlestir(
  rowsByDataset: Record<RaporTuru, KayitSatiri[]>,
) {
  const byPlate = new Map<string, BirlesikArac>();

  for (const dataset of RAPOR_TURLERI) {
    for (const row of rowsByDataset[dataset]) {
      const plate = plakayiBul(row);
      if (!plate) continue;

      let vehicle = byPlate.get(plate);
      if (!vehicle) {
        vehicle = {
          plate,
          owner: "",
          brandModel: "",
          route: "",
          status: "",
          penaltyCount: 0,
          activityCount: 0,
          inspectionMissing: false,
          datasets: [],
          records: [],
        };
        byPlate.set(plate, vehicle);
      }

      vehicle.records.push({ dataset, row });
      if (!vehicle.datasets.includes(dataset)) vehicle.datasets.push(dataset);
      vehicle.owner ||= satirdanDeger(row, ["Adı Soyadı", "İşletmeci", "Sahibi"]);
      vehicle.brandModel ||= [
        satirdanDeger(row, ["Marka"]),
        satirdanDeger(row, ["Model", "Araç Modeli"]),
      ].filter(Boolean).join(" ");
      vehicle.route ||= satirdanDeger(row, ["Güzergah", "Güzergah Açıklaması", "Hat", "Hat Açıklaması"]);
      vehicle.status ||= satirdanDeger(row, ["Aktif /Pasif", "Aktif/Pasif", "Durum"]);
      if (dataset === "PLAKA_CEZA") vehicle.penaltyCount += 1;
      if (dataset === "ARAC_HAREKETLERI") vehicle.activityCount += 1;
      if (dataset === "DENETIM_EKSIK") vehicle.inspectionMissing = true;
    }
  }

  return [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate, "tr"));
}
