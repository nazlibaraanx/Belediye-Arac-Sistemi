type PanelUstMenusuProps = {
  pulling: boolean;
  canExport: boolean;
  onPullAll: () => void;
  onExport: () => void;
};

export function PanelUstMenusu({
  pulling,
  canExport,
  onPullAll,
  onExport,
}: PanelUstMenusuProps) {
  return (
    <header className="topbar">
      <div>
        <p>ULAŞIM DAİRESİ BAŞKANLIĞI</p>
        <h1>Araç Bilgi ve Rapor Merkezi</h1>
      </div>
      <div className="topbar-actions">
        <button className="pull-all" onClick={onPullAll} disabled={pulling}>
          ↻ {pulling ? "Kontrol ediliyor…" : "Tüm Verileri Çek"}
        </button>
        <button className="primary-report" onClick={onExport} disabled={!canExport}>
          ⇩ Excel Raporu
        </button>
      </div>
    </header>
  );
}
