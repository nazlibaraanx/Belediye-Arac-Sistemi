"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aracKayitlariniBirlestir as createUnifiedVehicles } from "./arac-birlestirme";
import { excelRaporuIndir as downloadExcel, raporDosyasiniOku as parseWorkbook } from "./excel-islemleri";
import { PanelUstMenusu } from "./panel-ust-menusu";
import { PanelYanMenusu } from "./panel-yan-menusu";
import {
  RAPOR_TANIMLARI as DATASET_DETAILS,
  RAPOR_TURLERI as DATASETS,
  bosRaporDurumlari as emptyState,
} from "./rapor-tanimlari";
import type {
  AktarimOzeti as ImportSummary,
  BirlesikArac as UnifiedVehicle,
  GorunumTuru as ViewKey,
  KayitSatiri as RecordRow,
  RaporDurumu as DatasetState,
  RaporTuru as DatasetKey,
  SistemAdi as ConnectorName,
  SistemDurumu as ConnectorStatus,
} from "./tipler";
import {
  gizliDegeriMaskele as maskValue,
  gosterilecekSutunlar as chooseColumns,
  metniNormallestir as normalize,
  plakayiBul as getPlate,
} from "./veri-yardimcilari";

export default function AracPaneli() {
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
    void fetch("/api/arac-raporlari")
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
    void fetch("/api/sistem-baglantilari")
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
      const response = await fetch(`/api/arac-raporlari?source=${dataset}`);
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
      const response = await fetch("/api/arac-raporlari", {
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
      const response = await fetch("/api/sistem-baglantilari", {
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
      <PanelYanMenusu
        vehicleCount={unifiedVehicles.length}
        connectedReportCount={connectedCount}
        alertCount={penaltyTotal + inspectionTotal}
      />

      <section className="content">
        <PanelUstMenusu
          pulling={pulling}
          canExport={Boolean(connectedCount)}
          onPullAll={() => void pullData("ALL")}
          onExport={() => void exportUnified()}
        />

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
