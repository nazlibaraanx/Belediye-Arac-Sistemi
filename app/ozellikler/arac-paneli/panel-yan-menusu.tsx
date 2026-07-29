type PanelYanMenusuProps = {
  vehicleCount: number;
  connectedReportCount: number;
  alertCount: number;
};

export function PanelYanMenusu({
  vehicleCount,
  connectedReportCount,
  alertCount,
}: PanelYanMenusuProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">M</span>
        <div>
          <strong>MALATYA</strong>
          <small>ARAÇ VERİ MERKEZİ</small>
        </div>
      </div>

      <nav aria-label="Ana menü">
        <button className="nav-item active"><span>⌂</span> Genel Bakış</button>
        <button className="nav-item">
          <span>▦</span> Araç Dosyaları
          <b>{vehicleCount.toLocaleString("tr-TR")}</b>
        </button>
        <button className="nav-item">
          <span>≡</span> Raporlar
          <b>{connectedReportCount}/6</b>
        </button>
        <button className="nav-item">
          <span>!</span> Ceza ve Denetim
          <b>{alertCount.toLocaleString("tr-TR")}</b>
        </button>
      </nav>

      <div className="privacy-card">
        <span>●</span>
        <div>
          <strong>Gizli veri koruması</strong>
          <small>Kimlik ve telefon ana tabloda maskelenir.</small>
        </div>
      </div>
    </aside>
  );
}
