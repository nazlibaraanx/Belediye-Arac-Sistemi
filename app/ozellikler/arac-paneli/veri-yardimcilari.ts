import type { KayitSatiri } from "./tipler";

export function metniNormallestir(value: string) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function satirdanDeger(satir: KayitSatiri, olasiBasliklar: string[]) {
  const basliklar = olasiBasliklar.map(metniNormallestir);
  const bulunan = Object.keys(satir).find((baslik) =>
    basliklar.includes(metniNormallestir(baslik)),
  );
  return bulunan ? String(satir[bulunan] ?? "") : "";
}

export function plakayiBul(satir: KayitSatiri) {
  return satirdanDeger(
    satir,
    ["Plakası", "Plaka", "PLAKA", "Plaka Numarasi", "Araç Plakası"],
  )
    .replace(/\s+/g, "")
    .toLocaleUpperCase("tr-TR");
}

export function gizliDegeriMaskele(baslik: string, deger: string) {
  if (/kimlik|tckn/i.test(baslik)) return deger ? "•••••••••••" : "—";
  if (/telefon/i.test(baslik)) {
    const rakamlar = deger.replace(/\D/g, "");
    return rakamlar.length >= 4
      ? `${rakamlar.slice(0, 3)} ••• •• ${rakamlar.slice(-2)}`
      : deger || "—";
  }
  return deger || "—";
}
