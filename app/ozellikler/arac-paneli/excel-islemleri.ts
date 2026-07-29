import type { KayitSatiri } from "./tipler";
import { metniNormallestir } from "./veri-yardimcilari";

function alintiliMetniCoz(value: string) {
  const unfolded = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < unfolded.length; index += 1) {
    if (unfolded[index] === "=" && /^[0-9A-F]{2}$/i.test(unfolded.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(unfolded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(unfolded.charCodeAt(index) & 0xff);
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function baslikPuani(row: string[]) {
  const keywords = ["plaka", "ruhsat", "sicil", "arac", "surucu", "ceza", "denetim", "model"];
  const values = row.map(metniNormallestir).filter(Boolean);
  return values.filter((value) => keywords.some((keyword) => value.includes(keyword))).length * 20
    + Math.min(values.length, 25);
}

function matrisiKayitlaraDonustur(matrix: string[][]) {
  let headerIndex = -1;
  let bestScore = -1;
  matrix.slice(0, 120).forEach((row, index) => {
    const score = baslikPuani(row);
    if (row.filter(Boolean).length >= 2 && score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });
  if (headerIndex < 0) throw new Error("Tablonun başlık satırı bulunamadı.");

  const columns = matrix[headerIndex].map((value, index) => value || `Alan ${index + 1}`);
  const headerSignature = columns.map(metniNormallestir).join("|");
  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .filter((row) => row.map(metniNormallestir).join("|") !== headerSignature)
    .map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, String(row[index] ?? "")])),
    );

  return { columns, rows };
}

function mhtmlRaporunuOku(buffer: ArrayBuffer) {
  const raw = new TextDecoder("windows-1252").decode(buffer);
  const htmlPart = raw.match(
    /Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n------=_Part_)/i,
  );
  if (!htmlPart) throw new Error("Rapor tablosu bulunamadı.");

  const document = new DOMParser().parseFromString(alintiliMetniCoz(htmlPart[1]), "text/html");
  const matrix = [...document.querySelectorAll("tr")]
    .map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
    )
    .filter((row) => row.some(Boolean));

  return matrisiKayitlaraDonustur(matrix);
}

export async function raporDosyasiniOku(file: File) {
  const buffer = await file.arrayBuffer();
  const opening = new TextDecoder("windows-1252").decode(buffer.slice(0, 256));
  if (/Content-Type:\s*multipart|Created by Oracle BI Publisher/i.test(opening)) {
    return mhtmlRaporunuOku(buffer);
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Okunabilir çalışma sayfası bulunamadı.");

  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | boolean)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }).map((row) => row.map((value) => String(value ?? "")));

  return matrisiKayitlaraDonustur(matrix);
}

export async function excelRaporuIndir(
  rows: KayitSatiri[],
  fileName: string,
  sheetName: string,
) {
  if (!rows.length) return;

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const columns = [...new Set(rows.flatMap(Object.keys))];
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.min(34, Math.max(12, column.length + 2)),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFileXLSX(workbook, fileName);
}
