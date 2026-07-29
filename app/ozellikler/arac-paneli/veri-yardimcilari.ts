import type { AktarimOzeti, KayitSatiri } from "./tipler";

export function metniNormallestir(value: string) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function satirdanDeger(row: KayitSatiri, aliases: string[]) {
  const normalizedAliases = aliases.map(metniNormallestir);
  const key = Object.keys(row).find((candidate) =>
    normalizedAliases.includes(metniNormallestir(candidate)),
  );
  return key ? String(row[key] ?? "") : "";
}

export function plakayiBul(row: KayitSatiri) {
  return satirdanDeger(row, ["Plakası", "Plaka", "PLAKA", "Plaka Numarasi", "Araç Plakası"])
    .replace(/\s+/g, "")
    .toLocaleUpperCase("tr-TR");
}

export function gizliDegeriMaskele(label: string, value: string) {
  if (/kimlik|tckn/i.test(label)) return value ? "•••••••••••" : "—";
  if (/telefon/i.test(label)) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 4 ? `${digits.slice(0, 3)} ••• •• ${digits.slice(-2)}` : value || "—";
  }
  return value || "—";
}

export function gosterilecekSutunlar(summary?: AktarimOzeti) {
  if (!summary) return [];
  const safe = summary.columns.filter((column) => !/kimlik|telefon|motor|şasi|sasi/i.test(column));
  const plate = safe.find((column) => metniNormallestir(column).includes("plaka"));
  return [plate, ...safe.filter((column) => column !== plate)]
    .filter(Boolean)
    .slice(0, 7) as string[];
}
