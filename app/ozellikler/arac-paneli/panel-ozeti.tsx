import type { SistemAdi, SistemDurumu } from "./tipler";

type PanelOzetiProps = {
  yukluRaporSayisi: number;
  toplamSatirSayisi: number;
  aracSayisi: number;
  cezaSayisi: number;
  denetimBekleyenSayisi: number;
  hareketSayisi: number;
  sistemDurumlari: SistemDurumu[];
  veriCekiliyor: boolean;
  sistemdenVeriCek: (sistem: SistemAdi) => void;
};

const SISTEMLER: SistemAdi[] = ["AKOS", "PESLAYN", "USYS"];

export function PanelOzeti({
  yukluRaporSayisi,
  toplamSatirSayisi,
  aracSayisi,
  cezaSayisi,
  denetimBekleyenSayisi,
  hareketSayisi,
  sistemDurumlari,
  veriCekiliyor,
  sistemdenVeriCek,
}: PanelOzetiProps) {
  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">6 RAPOR · TEK ARAÇ DOSYASI</span>
          <h2>Bir plakaya ait bütün bilgileri tek ekranda anlayın.</h2>
          <p>
            Ruhsat, teknik araç, hareket, tarihçe, ceza ve denetim raporlarını
            plaka üzerinden bir araya getirir.
          </p>
        </div>
        <div className="overview">
          <article><span>Yüklü rapor</span><strong>{yukluRaporSayisi}<small>/6</small></strong></article>
          <article><span>Toplam satır</span><strong>{toplamSatirSayisi.toLocaleString("tr-TR")}</strong></article>
          <article><span>Tekil araç</span><strong>{aracSayisi.toLocaleString("tr-TR")}</strong></article>
        </div>
      </section>

      <section className="connector-strip">
        <div className="connector-copy">
          <span className="eyebrow">CANLI VERİ BAĞLANTILARI</span>
          <strong>Yetki geldiğinde tek tuşla üç sistemi güncelleyin.</strong>
        </div>
        {SISTEMLER.map((sistem) => {
          const durum = sistemDurumlari.find((item) => item.name === sistem);
          return (
            <article key={sistem}>
              <span className={durum?.configured ? "connection-dot ready" : "connection-dot"} />
              <div>
                <strong>{sistem}</strong>
                <small>{durum?.status ?? "Kontrol ediliyor"}</small>
              </div>
              <button onClick={() => sistemdenVeriCek(sistem)} disabled={veriCekiliyor}>
                Veriyi Çek
              </button>
            </article>
          );
        })}
      </section>

      <section className="metric-row">
        <article><span className="metric-icon">▦</span><div><small>BİRLEŞİK ARAÇ DOSYASI</small><strong>{aracSayisi.toLocaleString("tr-TR")}</strong></div></article>
        <article><span className="metric-icon red">!</span><div><small>CEZA KAYDI</small><strong>{cezaSayisi.toLocaleString("tr-TR")}</strong></div></article>
        <article><span className="metric-icon amber">◷</span><div><small>DENETİM BEKLEYEN</small><strong>{denetimBekleyenSayisi.toLocaleString("tr-TR")}</strong></div></article>
        <article><span className="metric-icon violet">↔</span><div><small>HAREKET KAYDI</small><strong>{hareketSayisi.toLocaleString("tr-TR")}</strong></div></article>
      </section>
    </>
  );
}
