"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DatasetKey =
  | "RUHSAT_BILGILERI"
  | "ARAC_TEKNIK"
  | "ARAC_HAREKETLERI"
  | "RUHSAT_TARIHCE"
  | "PLAKA_CEZA"
  | "DENETIM_EKSIK";
type RecordRow = Record<string, string>;
type ViewKey = DatasetKey | "BIRLESIK";
type ConnectorName = "AKOS" | "PESLAYN" | "USYS";
type ConnectorStatus = {
  name: ConnectorName;
  configured: boolean;
  status: "Yetki bekleniyor" | "Bağlantıya hazır";
};

type ImportSummary = {
  id: number;
  source: DatasetKey;
  fileName: string;
  importedAt: string;
  rowCount: number;
  columns: string[];
};

type DatasetState = {
  summary?: ImportSummary;
  rows: RecordRow[];
  loading: boolean;
  error?: string;
};

type UnifiedVehicle = {
  plate: string;
  owner: string;
  brandModel: string;
  route: string;
  status: string;
  penaltyCount: number;
  activityCount: number;
  inspectionMissing: boolean;
  datasets: DatasetKey[];
  records: { dataset: DatasetKey; row: RecordRow }[];
};

const DATASETS: DatasetKey[] = [
  "RUHSAT_BILGILERI",
  "ARAC_TEKNIK",
  "ARAC_HAREKETLERI",
  "RUHSAT_TARIHCE",
  "PLAKA_CEZA",
  "DENETIM_EKSIK",
];

const DATASET_DETAILS: Record<DatasetKey, {
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

const emptyState = (): Record<DatasetKey, DatasetState> => ({
  RUHSAT_BILGILERI: { rows: [], loading: false },
  ARAC_TEKNIK: { rows: [], loading: false },
  ARAC_HAREKETLERI: { rows: [], loading: false },
  RUHSAT_TARIHCE: { rows: [], loading: false },
  PLAKA_CEZA: { rows: [], loading: false },
  DENETIM_EKSIK: { rows: [], loading: false },
});

function normalize(value: string) {
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

function valueFor(row: RecordRow, aliases: string[]) {
  const normalizedAliases = aliases.map(normalize);
  const key = Object.keys(row).find((candidate) =>
    normalizedAliases.includes(normalize(candidate)),
  );
  return key ? String(row[key] ?? "") : "";
}

function getPlate(row: RecordRow) {
  return valueFor(row, ["Plakası", "Plaka", "PLAKA", "Plaka Numarasi", "Araç Plakası"])
    .replace(/\s+/g, "")
    .toLocaleUpperCase("tr-TR");
}

function decodeQuotedPrintable(value: string) {
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

function scoreHeader(row: string[]) {
  const keywords = ["plaka", "ruhsat", "sicil", "arac", "surucu", "ceza", "denetim", "model"];
  const values = row.map(normalize).filter(Boolean);
  return values.filter((value) => keywords.some((keyword) => value.includes(keyword))).length * 20
    + Math.min(values.length, 25);
}

function matrixToRecords(matrix: string[][]) {
  let headerIndex = -1;
  let bestScore = -1;
  matrix.slice(0, 120).forEach((row, index) => {
    const score = scoreHeader(row);
    if (row.filter(Boolean).length >= 2 && score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });
  if (headerIndex < 0) throw new Error("Tablonun başlık satırı bulunamadı.");
  const columns = matrix[headerIndex].map((value, index) => value || `Alan ${index + 1}`);
  const headerSignature = columns.map(normalize).join("|");
  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .filter((row) => row.map(normalize).join("|") !== headerSignature)
    .map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, String(row[index] ?? "")])),
    );
  return { columns, rows };
}

function parseMhtml(buffer: ArrayBuffer) {
  const raw = new TextDecoder("windows-1252").decode(buffer);
  const htmlPart = raw.match(
    /Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n------=_Part_)/i,
  );
  if (!htmlPart) throw new Error("Rapor tablosu bulunamadı.");
  const document = new DOMParser().parseFromString(decodeQuotedPrintable(htmlPart[1]), "text/html");
  const matrix = [...document.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll("th, td")].map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
  ).filter((row) => row.some(Boolean));
  return matrixToRecords(matrix);
}

async function parseWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const opening = new TextDecoder("windows-1252").decode(buffer.slice(0, 256));
  if (/Content-Type:\s*multipart|Created by Oracle BI Publisher/i.test(opening)) {
    return parseMhtml(buffer);
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
  return matrixToRecords(matrix);
}

function maskValue(label: string, value: string) {
  if (/kimlik|tckn/i.test(label)) return value ? "•••••••••••" : "—";
  if (/telefon/i.test(label)) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 4 ? `${digits.slice(0, 3)} ••• •• ${digits.slice(-2)}` : value || "—";
  }
  return value || "—";
}

async function downloadExcel(rows: RecordRow[], fileName: string, sheetName: string) {
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

function chooseColumns(summary?: ImportSummary) {
  if (!summary) return [];
  const safe = summary.columns.filter((column) => !/kimlik|telefon|motor|şasi|sasi/i.test(column));
  const plate = safe.find((column) => normalize(column).includes("plaka"));
  return [plate, ...safe.filter((column) => column !== plate)].filter(Boolean).slice(0, 7) as string[];
}

function createUnifiedVehicles(rowsByDataset: Record<DatasetKey, RecordRow[]>) {
  const byPlate = new Map<string, UnifiedVehicle>();
  for (const dataset of DATASETS) {
    for (const row of rowsByDataset[dataset]) {
      const plate = getPlate(row);
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
      vehicle.owner ||= valueFor(row, ["Adı Soyadı", "İşletmeci", "Sahibi"]);
      vehicle.brandModel ||= [
        valueFor(row, ["Marka"]),
        valueFor(row, ["Model", "Araç Modeli"]),
      ].filter(Boolean).join(" ");
      vehicle.route ||= valueFor(row, ["Güzergah", "Güzergah Açıklaması", "Hat", "Hat Açıklaması"]);
      vehicle.status ||= valueFor(row, ["Aktif /Pasif", "Aktif/Pasif", "Durum"]);
      if (dataset === "PLAKA_CEZA") vehicle.penaltyCount += 1;
      if (dataset === "ARAC_HAREKETLERI") vehicle.activityCount += 1;
      if (dataset === "DENETIM_EKSIK") vehicle.inspectionMissing = true;
    }
  }
  return [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate, "tr"));
}

export default function Home() {
  const [datasets, setDatasets] = useState<Record<DatasetKey, DatasetState>>(emptyState);
  const [activeView, setActiveView] = useState<ViewKey>("BIRLESIK");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [pulling, setPulling] = useState(false);
  const [datasetFilter, setDatasetFilter] = useState<DatasetKey | "TUMU">("TUMU");
  const [riskFilter, setRiskFilter] = useState<"TUMU" | "CEZALI" | "DENETIM">("TUMU");
  const [selectedVehicle, setSelectedVehicle] = useState<UnifiedVehicle | null>(null);
  const [selectedRaw, setSelectedRaw] = useState<{ dataset: DatasetKey; row: RecordRow } | null>(null);
  const inputs = useRef<Record<DatasetKey, HTMLInputElement | null>>({
    RUHSAT_BILGILERI: null,
    ARAC_TEKNIK: null,
    ARAC_HAREKETLERI: null,
    RUHSAT_TARIHCE: null,
    PLAKA_CEZA: null,
    DENETIM_EKSIK: null,
  });

  useEffect(() => {
    void fetch("/api/import")
      .then((response) => response.json())
      .then((result: { imports?: ImportSummary[] }) => {
        if (!result.imports) return;
        setDatasets((current) => {
          const next = { ...current };
          for (const summary of result.imports) {
            if (DATASETS.includes(summary.source)) {
              next[summary.source] = { ...next[summary.source], summary };
            }
          }
          return next;
        });
      })
      .catch(() => undefined);
    void fetch("/api/connectors")
      .then((response) => response.json())
      .then((result: { connectors?: ConnectorStatus[] }) => {
        if (result.connectors) setConnectors(result.connectors);
      })
      .catch(() => undefined);
  }, []);

  const loadRows = async (dataset: DatasetKey) => {
    if (datasets[dataset].rows.length) return datasets[dataset].rows;
    if (!datasets[dataset].summary) return [];
    setDatasets((current) => ({
      ...current,
      [dataset]: { ...current[dataset], loading: true },
    }));
    try {
      const response = await fetch(`/api/import?source=${dataset}`);
      const result = await response.json() as { rows?: RecordRow[]; error?: string };
      if (!response.ok || !result.rows) throw new Error(result.error ?? "Kayıtlar okunamadı.");
      setDatasets((current) => ({
        ...current,
        [dataset]: { ...current[dataset], rows: result.rows ?? [], loading: false },
      }));
      return result.rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kayıtlar okunamadı.";
      setDatasets((current) => ({
        ...current,
        [dataset]: { ...current[dataset], loading: false, error: message },
      }));
      return [];
    }
  };

  const unifiedVehicles = useMemo(() => {
    return createUnifiedVehicles(Object.fromEntries(
      DATASETS.map((dataset) => [dataset, datasets[dataset].rows]),
    ) as Record<DatasetKey, RecordRow[]>);
  }, [datasets]);

  const filteredVehicles = useMemo(() => {
    const q = normalize(query);
    return unifiedVehicles.filter((vehicle) => {
      const matchesQuery = !q || [vehicle.plate, vehicle.owner, vehicle.brandModel, vehicle.route]
        .some((value) => normalize(value).includes(q));
      const matchesDataset = datasetFilter === "TUMU" || vehicle.datasets.includes(datasetFilter);
      const matchesRisk = riskFilter === "TUMU"
        || (riskFilter === "CEZALI" && vehicle.penaltyCount > 0)
        || (riskFilter === "DENETIM" && vehicle.inspectionMissing);
      return matchesQuery && matchesDataset && matchesRisk;
    });
  }, [datasetFilter, query, riskFilter, unifiedVehicles]);

  const activeRows = activeView === "BIRLESIK" ? [] : datasets[activeView].rows;
  const activeColumns = activeView === "BIRLESIK" ? [] : chooseColumns(datasets[activeView].summary);
  const filteredRaw = useMemo(() => {
    if (activeView === "BIRLESIK") return [];
    const q = normalize(query);
    if (!q) return activeRows;
    return activeRows.filter((row) =>
      Object.values(row).some((value) => normalize(value).includes(q)),
    );
  }, [activeRows, activeView, query]);

  const connectedCount = DATASETS.filter((dataset) => datasets[dataset].summary).length;
  const totalRows = DATASETS.reduce((sum, dataset) => sum + (datasets[dataset].summary?.rowCount ?? 0), 0);
  const penaltyTotal = datasets.PLAKA_CEZA.summary?.rowCount ?? 0;
  const inspectionTotal = datasets.DENETIM_EKSIK.summary?.rowCount ?? 0;

  const upload = async (dataset: DatasetKey, file?: File) => {
    if (!file) return;
    setDatasets((current) => ({
      ...current,
      [dataset]: { ...current[dataset], loading: true, error: undefined },
    }));
    setNotice(`${DATASET_DETAILS[dataset].label} okunuyor…`);
    try {
      if (!DATASET_DETAILS[dataset].expectedFile.test(file.name)) {
        setNotice(`Dosya adı beklenen raporla farklı; sütun yapısı kontrol ediliyor…`);
      }
      const parsed = await parseWorkbook(file);
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: dataset,
          fileName: file.name,
          columns: parsed.columns,
          rows: parsed.rows,
        }),
      });
      const result = await response.json() as { summary?: ImportSummary; error?: string };
      if (!response.ok || !result.summary) throw new Error(result.error ?? "Dosya kaydedilemedi.");
      setDatasets((current) => ({
        ...current,
        [dataset]: { rows: parsed.rows, summary: result.summary, loading: false },
      }));
      setActiveView(dataset);
      setNotice(`${DATASET_DETAILS[dataset].label}: ${parsed.rows.length.toLocaleString("tr-TR")} satır başarıyla aktarıldı.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dosya işlenemedi.";
      setDatasets((current) => ({
        ...current,
        [dataset]: { ...current[dataset], loading: false, error: message },
      }));
      setNotice(message);
    }
  };

  const openView = async (view: ViewKey) => {
    if (view === "BIRLESIK") await Promise.all(DATASETS.map(loadRows));
    else await loadRows(view);
    setActiveView(view);
  };

  const exportDataset = async (dataset: DatasetKey) => {
    const rows = await loadRows(dataset);
    await downloadExcel(
      rows.map((row) => ({ "Rapor Türü": DATASET_DETAILS[dataset].label, ...row })),
      `${DATASET_DETAILS[dataset].short.toLocaleLowerCase("tr-TR")}-raporu.xlsx`,
      DATASET_DETAILS[dataset].short,
    );
  };

  const exportUnified = async () => {
    const loaded = await Promise.all(DATASETS.map(loadRows));
    const rowsByDataset = Object.fromEntries(
      DATASETS.map((dataset, index) => [dataset, loaded[index]]),
    ) as Record<DatasetKey, RecordRow[]>;
    const vehicles = createUnifiedVehicles(rowsByDataset);
    const rows = vehicles.map((vehicle) => ({
        Plaka: vehicle.plate,
        "Adı Soyadı / İşletmeci": vehicle.owner,
        "Marka Model": vehicle.brandModel,
        "Hat / Güzergâh": vehicle.route,
        Durum: vehicle.status,
        "Ceza Sayısı": String(vehicle.penaltyCount),
        "Hareket Sayısı": String(vehicle.activityCount),
        "Denetim Bekliyor": vehicle.inspectionMissing ? "Evet" : "Hayır",
        "Bulunduğu Raporlar": vehicle.datasets.map((item) => DATASET_DETAILS[item].label).join(", "),
    }));
    await downloadExcel(
      rows,
      `birlesik-arac-dosyalari-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Birleşik Araçlar",
    );
  };

  const pullData = async (connector: ConnectorName | "ALL") => {
    setPulling(true);
    setNotice(connector === "ALL" ? "Tüm sistem bağlantıları kontrol ediliyor…" : `${connector} bağlantısı kontrol ediliyor…`);
    try {
      const response = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector }),
      });
      const result = await response.json() as {
        results?: { connector: ConnectorName; message: string }[];
        error?: string;
      };
      const messages = result.results?.map((item) => item.message).join(" · ");
      setNotice(messages || result.error || "Bağlantı kontrolü tamamlandı.");
    } catch {
      setNotice("Bağlantı kontrolü yapılamadı.");
    } finally {
      setPulling(false);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div><strong>MALATYA</strong><small>ARAÇ VERİ MERKEZİ</small></div>
        </div>
        <nav>
          <button className="nav-item active"><span>⌂</span> Genel Bakış</button>
          <button className="nav-item"><span>▦</span> Araç Dosyaları <b>{unifiedVehicles.length.toLocaleString("tr-TR")}</b></button>
          <button className="nav-item"><span>≡</span> Raporlar <b>{connectedCount}/6</b></button>
          <button className="nav-item"><span>!</span> Ceza ve Denetim <b>{(penaltyTotal + inspectionTotal).toLocaleString("tr-TR")}</b></button>
        </nav>
        <div className="privacy-card"><span>●</span><div><strong>Gizli veri koruması</strong><small>Kimlik ve telefon ana tabloda maskelenir.</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p>ULAŞIM DAİRESİ BAŞKANLIĞI</p><h1>Araç Bilgi ve Rapor Merkezi</h1></div>
          <div className="topbar-actions">
            <button className="pull-all" onClick={() => void pullData("ALL")} disabled={pulling}>↻ {pulling ? "Kontrol ediliyor…" : "Tüm Verileri Çek"}</button>
            <button className="primary-report" onClick={() => void exportUnified()} disabled={!connectedCount}>⇩ Excel Raporu</button>
          </div>
        </header>

        <section className="intro">
          <div>
            <span className="eyebrow">6 RAPOR · TEK ARAÇ DOSYASI</span>
            <h2>Bir plakaya ait bütün bilgileri tek ekranda anlayın.</h2>
            <p>Ruhsat, teknik araç, hareket, tarihçe, ceza ve denetim raporlarını plaka üzerinden bir araya getirir; her raporu ayrıca incelemenize de izin verir.</p>
          </div>
          <div className="overview">
            <article><span>Yüklü rapor</span><strong>{connectedCount}<small>/6</small></strong></article>
            <article><span>Toplam satır</span><strong>{totalRows.toLocaleString("tr-TR")}</strong></article>
            <article><span>Tekil araç</span><strong>{unifiedVehicles.length.toLocaleString("tr-TR")}</strong></article>
          </div>
        </section>

        <section className="connector-strip">
          <div className="connector-copy">
            <span className="eyebrow">CANLI VERİ BAĞLANTILARI</span>
            <strong>Yetki geldiğinde tek tuşla üç sistemi güncelleyin.</strong>
          </div>
          {(["AKOS", "PESLAYN", "USYS"] as ConnectorName[]).map((connector) => {
            const status = connectors.find((item) => item.name === connector);
            return (
              <article key={connector}>
                <span className={status?.configured ? "connection-dot ready" : "connection-dot"} />
                <div><strong>{connector}</strong><small>{status?.status ?? "Kontrol ediliyor"}</small></div>
                <button onClick={() => void pullData(connector)} disabled={pulling}>Veriyi Çek</button>
              </article>
            );
          })}
        </section>

        <section className="metric-row">
          <article><span className="metric-icon">▦</span><div><small>BİRLEŞİK ARAÇ DOSYASI</small><strong>{unifiedVehicles.length.toLocaleString("tr-TR")}</strong></div></article>
          <article><span className="metric-icon red">!</span><div><small>CEZA KAYDI</small><strong>{penaltyTotal.toLocaleString("tr-TR")}</strong></div></article>
          <article><span className="metric-icon amber">◷</span><div><small>DENETİM BEKLEYEN</small><strong>{inspectionTotal.toLocaleString("tr-TR")}</strong></div></article>
          <article><span className="metric-icon violet">↔</span><div><small>HAREKET KAYDI</small><strong>{(datasets.ARAC_HAREKETLERI.summary?.rowCount ?? 0).toLocaleString("tr-TR")}</strong></div></article>
        </section>

        <section className="dataset-grid">
          {DATASETS.map((dataset) => {
            const detail = DATASET_DETAILS[dataset];
            const state = datasets[dataset];
            return (
              <article className={`dataset-card ${detail.tone}`} key={dataset}>
                <input
                  hidden
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  ref={(node) => { inputs.current[dataset] = node; }}
                  onChange={(event) => void upload(dataset, event.target.files?.[0])}
                />
                <div className="dataset-top">
                  <span className="dataset-mark">{detail.short.slice(0, 1)}</span>
                  <div><strong>{detail.label}</strong><small>{detail.description}</small></div>
                  <span className={state.summary ? "dataset-ready" : "dataset-waiting"}>{state.summary ? "Hazır" : "Eksik"}</span>
                </div>
                <div className="dataset-info">
                  {state.summary ? (
                    <><strong>{state.summary.rowCount.toLocaleString("tr-TR")} satır</strong><span>{state.summary.fileName}</span></>
                  ) : (
                    <><strong>Dosya bekleniyor</strong><span>İlgili Excel raporunu yükleyin.</span></>
                  )}
                </div>
                {state.error && <p className="source-error">{state.error}</p>}
                <div className="source-actions">
                  <button onClick={() => inputs.current[dataset]?.click()} disabled={state.loading}>{state.loading ? "İşleniyor…" : state.summary ? "Dosyayı Yenile" : "Excel Yükle"}</button>
                  <button className="ghost" disabled={!state.summary} onClick={() => void openView(dataset)}>Görüntüle</button>
                  <button className="ghost compact" disabled={!state.summary} onClick={() => void exportDataset(dataset)}>⇩</button>
                </div>
              </article>
            );
          })}
        </section>

        {notice && <div className="notice"><span>✓</span>{notice}</div>}

        <section className="records-panel">
          <div className="panel-head">
            <div><span className="eyebrow">VERİ GEZGİNİ</span><h2>{activeView === "BIRLESIK" ? "Birleşik araç dosyaları" : DATASET_DETAILS[activeView].label}</h2></div>
            <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Plaka, kişi, güzergâh veya herhangi bir alan ara" /></label>
          </div>
          <div className="view-tabs">
            <button className={activeView === "BIRLESIK" ? "active combined" : "combined"} onClick={() => void openView("BIRLESIK")}>Birleşik <span>{unifiedVehicles.length.toLocaleString("tr-TR")}</span></button>
            {DATASETS.map((dataset) => (
              <button key={dataset} className={activeView === dataset ? "active" : ""} onClick={() => void openView(dataset)}>{DATASET_DETAILS[dataset].short}<span>{datasets[dataset].summary?.rowCount.toLocaleString("tr-TR") ?? 0}</span></button>
            ))}
          </div>
          {activeView === "BIRLESIK" && (
            <div className="filter-row">
              <label>Rapor kategorisi
                <select value={datasetFilter} onChange={(event) => setDatasetFilter(event.target.value as DatasetKey | "TUMU")}>
                  <option value="TUMU">Tüm kategoriler</option>
                  {DATASETS.map((dataset) => <option key={dataset} value={dataset}>{DATASET_DETAILS[dataset].label}</option>)}
                </select>
              </label>
              <label>Risk durumu
                <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as "TUMU" | "CEZALI" | "DENETIM")}>
                  <option value="TUMU">Tümü</option>
                  <option value="CEZALI">Ceza kaydı bulunanlar</option>
                  <option value="DENETIM">Denetim bekleyenler</option>
                </select>
              </label>
              <button onClick={() => { setDatasetFilter("TUMU"); setRiskFilter("TUMU"); setQuery(""); }}>Filtreleri Temizle</button>
            </div>
          )}

          <div className="table-wrap">
            {activeView === "BIRLESIK" ? (
              <table>
                <thead><tr><th>PLAKA</th><th>KİŞİ / İŞLETMECİ</th><th>ARAÇ</th><th>HAT / GÜZERGÂH</th><th>DURUM</th><th>CEZA</th><th>DENETİM</th><th>RAPORLAR</th><th /></tr></thead>
                <tbody>
                  {filteredVehicles.slice(0, 300).map((vehicle) => (
                    <tr key={vehicle.plate} onClick={() => setSelectedVehicle(vehicle)}>
                      <td><strong className="plate">{vehicle.plate}</strong></td>
                      <td><strong>{vehicle.owner || "—"}</strong></td>
                      <td>{vehicle.brandModel || "—"}</td>
                      <td>{vehicle.route || "—"}</td>
                      <td><span className={`status ${normalize(vehicle.status).includes("aktif") ? "active" : "passive"}`}>{vehicle.status || "Belirsiz"}</span></td>
                      <td><span className={vehicle.penaltyCount ? "count danger" : "count"}>{vehicle.penaltyCount}</span></td>
                      <td>{vehicle.inspectionMissing ? <span className="warning-pill">Bekliyor</span> : <span className="ok-pill">Kayıt yok</span>}</td>
                      <td><div className="report-dots">{vehicle.datasets.map((dataset) => <span key={dataset} title={DATASET_DETAILS[dataset].label}>{DATASET_DETAILS[dataset].short.slice(0, 1)}</span>)}</div></td>
                      <td><button className="detail-button">›</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead><tr>{activeColumns.map((column) => <th key={column}>{column.toLocaleUpperCase("tr-TR")}</th>)}<th /></tr></thead>
                <tbody>
                  {filteredRaw.slice(0, 300).map((row, index) => (
                    <tr key={`${getPlate(row)}-${index}`} onClick={() => setSelectedRaw({ dataset: activeView, row })}>
                      {activeColumns.map((column) => (
                        <td key={column}>{normalize(column).includes("plaka") ? <strong className="plate">{row[column] || "—"}</strong> : maskValue(column, row[column] ?? "")}</td>
                      ))}
                      <td><button className="detail-button">›</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {((activeView === "BIRLESIK" && !filteredVehicles.length) || (activeView !== "BIRLESIK" && !filteredRaw.length)) && (
              <div className="empty-state"><span>▦</span><strong>Bu görünümde kayıt yok</strong><p>Yukarıdan ilgili Excel raporunu yükleyerek başlayın.</p></div>
            )}
          </div>
          <footer className="panel-footer">
            <span>{(activeView === "BIRLESIK" ? filteredVehicles.length : filteredRaw.length).toLocaleString("tr-TR")} sonuç</span>
            <small>İlk 300 satır gösterilir; indirilen rapora bütün satırlar dahil edilir.</small>
          </footer>
        </section>
      </section>

      {(selectedVehicle || selectedRaw) && (
        <div className="drawer-backdrop" onClick={() => { setSelectedVehicle(null); setSelectedRaw(null); }}>
          <aside className="drawer wide" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => { setSelectedVehicle(null); setSelectedRaw(null); }}>×</button>
            {selectedVehicle ? (
              <>
                <span className="eyebrow">BİRLEŞİK ARAÇ DOSYASI</span>
                <h2>{selectedVehicle.plate}</h2>
                <div className="vehicle-summary">
                  <span>{selectedVehicle.datasets.length} raporda bulundu</span>
                  <span>{selectedVehicle.penaltyCount} ceza kaydı</span>
                  <span>{selectedVehicle.activityCount} hareket</span>
                </div>
                {selectedVehicle.datasets.map((dataset) => {
                  const records = selectedVehicle.records.filter((record) => record.dataset === dataset);
                  return (
                    <section className="detail-section" key={dataset}>
                      <h3>{DATASET_DETAILS[dataset].label}<span>{records.length} kayıt</span></h3>
                      {records.slice(0, 10).map(({ row }, recordIndex) => (
                        <dl key={recordIndex}>
                          {Object.entries(row).map(([label, value]) => (
                            <div key={label}><dt>{label}</dt><dd>{maskValue(label, value)}</dd></div>
                          ))}
                        </dl>
                      ))}
                      {records.length > 10 && <p className="more-note">Bu bölümde {records.length - 10} kayıt daha var; tamamı indirilen rapora dahildir.</p>}
                    </section>
                  );
                })}
              </>
            ) : selectedRaw ? (
              <>
                <span className="eyebrow">{DATASET_DETAILS[selectedRaw.dataset].label.toLocaleUpperCase("tr-TR")}</span>
                <h2>{getPlate(selectedRaw.row) || "Kayıt detayı"}</h2>
                <dl>{Object.entries(selectedRaw.row).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{maskValue(label, value)}</dd></div>)}</dl>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}
