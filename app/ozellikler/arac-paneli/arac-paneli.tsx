"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sistemSatirlariniHazirla, tumVerileriBirlestir } from "./arac-birlestirme";
import { excelRaporuIndir, raporDosyasiniOku } from "./excel-islemleri";
import {
  RAPOR_TANIMLARI,
  RAPOR_TURLERI,
  SISTEMLER,
  bosRaporDurumlari,
  sisteminRaporlari,
} from "./rapor-tanimlari";
import type {
  AktarimOzeti,
  GorunumTuru,
  KayitSatiri,
  RaporDurumu,
  RaporTuru,
  SistemAdi,
} from "./tipler";
import { gizliDegeriMaskele, metniNormallestir } from "./veri-yardimcilari";

type BaglantiDurumu = {
  name: SistemAdi;
  configured: boolean;
  reportCount: number;
  configuredReportCount: number;
  status: string;
};

function sutunlariBul(satirlar: KayitSatiri[]) {
  return [...new Set(satirlar.flatMap(Object.keys))];
}

export default function AracPaneli() {
  const [raporlar, setRaporlar] = useState<Record<RaporTuru, RaporDurumu>>(bosRaporDurumlari);
  const [gorunum, setGorunum] = useState<GorunumTuru>("TUM_VERILER");
  const [arama, setArama] = useState("");
  const [bildirim, setBildirim] = useState("");
  const [baglantilar, setBaglantilar] = useState<BaglantiDurumu[]>([]);
  const [veriCekiliyor, setVeriCekiliyor] = useState<SistemAdi | "TUMU" | null>(null);
  const [secilenSutunlar, setSecilenSutunlar] = useState<string[]>([]);
  const [sutunPaneliAcik, setSutunPaneliAcik] = useState(false);
  const [secilenSatir, setSecilenSatir] = useState<KayitSatiri | null>(null);
  const dosyaGirdileri = useRef<Partial<Record<RaporTuru, HTMLInputElement | null>>>({});

  useEffect(() => {
    void fetch("/api/arac-raporlari")
      .then((yanit) => yanit.json())
      .then((sonuc: { imports?: AktarimOzeti[] }) => {
        if (!sonuc.imports) return;
        setRaporlar((mevcut) => {
          const yeni = { ...mevcut };
          for (const ozet of sonuc.imports) {
            if (RAPOR_TURLERI.includes(ozet.source)) {
              yeni[ozet.source] = { ...yeni[ozet.source], summary: ozet };
            }
          }
          return yeni;
        });
      })
      .catch(() => setBildirim("Kaydedilmiş rapor bilgileri okunamadı."));
    void fetch("/api/sistem-baglantilari")
      .then((yanit) => yanit.json())
      .then((sonuc: { connectors?: BaglantiDurumu[] }) => setBaglantilar(sonuc.connectors ?? []))
      .catch(() => undefined);
  }, []);

  async function ozetleriYenile() {
    const yanit = await fetch("/api/arac-raporlari");
    const sonuc = await yanit.json() as { imports?: AktarimOzeti[] };
    setRaporlar(() => {
      const yeni = bosRaporDurumlari();
      for (const ozet of sonuc.imports ?? []) {
        if (RAPOR_TURLERI.includes(ozet.source)) yeni[ozet.source].summary = ozet;
      }
      return yeni;
    });
  }

  async function sistemdenCek(sistem: SistemAdi | "TUMU") {
    setVeriCekiliyor(sistem);
    setBildirim(sistem === "TUMU" ? "Üç sistemden güncel veriler çekiliyor…" : `${sistem} verileri çekiliyor…`);
    try {
      const yanit = await fetch("/api/sistem-baglantilari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector: sistem === "TUMU" ? "ALL" : sistem }),
      });
      const sonuc = await yanit.json() as { results?: { message: string }[]; error?: string };
      const mesaj = sonuc.results?.map((satir) => satir.message).join(" · ");
      if (!yanit.ok) throw new Error(mesaj || sonuc.error || "Veriler çekilemedi.");
      await ozetleriYenile();
      setBildirim(mesaj || "Veriler başarıyla güncellendi.");
      setGorunum(sistem === "TUMU" ? "TUM_VERILER" : sistem);
    } catch (hata) {
      setBildirim(hata instanceof Error ? hata.message : "Veriler çekilemedi.");
    } finally {
      setVeriCekiliyor(null);
    }
  }

  async function satirlariYukle(rapor: RaporTuru) {
    if (raporlar[rapor].rows.length) return raporlar[rapor].rows;
    if (!raporlar[rapor].summary) return [];
    setRaporlar((mevcut) => ({
      ...mevcut,
      [rapor]: { ...mevcut[rapor], loading: true },
    }));
    try {
      const yanit = await fetch(`/api/arac-raporlari?source=${rapor}`);
      const sonuc = await yanit.json() as { rows?: KayitSatiri[]; error?: string };
      if (!yanit.ok) throw new Error(sonuc.error ?? "Kayıtlar okunamadı.");
      const satirlar = sonuc.rows ?? [];
      setRaporlar((mevcut) => ({
        ...mevcut,
        [rapor]: { ...mevcut[rapor], rows: satirlar, loading: false },
      }));
      return satirlar;
    } catch (hata) {
      const mesaj = hata instanceof Error ? hata.message : "Kayıtlar okunamadı.";
      setRaporlar((mevcut) => ({
        ...mevcut,
        [rapor]: { ...mevcut[rapor], loading: false, error: mesaj },
      }));
      return [];
    }
  }

  async function gorunumuAc(yeniGorunum: GorunumTuru) {
    const gerekliRaporlar = yeniGorunum === "TUM_VERILER"
      ? RAPOR_TURLERI
      : sisteminRaporlari(yeniGorunum);
    await Promise.all(gerekliRaporlar.map(satirlariYukle));
    setGorunum(yeniGorunum);
    setArama("");
    setSecilenSutunlar([]);
  }

  async function dosyaYukle(rapor: RaporTuru, dosya?: File) {
    if (!dosya) return;
    const tanim = RAPOR_TANIMLARI[rapor];
    setRaporlar((mevcut) => ({
      ...mevcut,
      [rapor]: { ...mevcut[rapor], loading: true, error: undefined },
    }));
    setBildirim(`${tanim.baslik} okunuyor…`);
    try {
      if (!tanim.beklenenDosya.test(dosya.name)) {
        throw new Error(`Bu alan için yanlış dosya seçildi. Beklenen rapor: ${tanim.baslik}.`);
      }
      const okunan = await raporDosyasiniOku(dosya);
      const yanit = await fetch("/api/arac-raporlari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: rapor,
          fileName: dosya.name,
          columns: okunan.columns,
          rows: okunan.rows,
        }),
      });
      const sonuc = await yanit.json() as { summary?: AktarimOzeti; error?: string };
      if (!yanit.ok || !sonuc.summary) {
        throw new Error(sonuc.error ?? "Dosya kaydedilemedi.");
      }
      setRaporlar((mevcut) => ({
        ...mevcut,
        [rapor]: { summary: sonuc.summary, rows: okunan.rows, loading: false },
      }));
      setGorunum(tanim.sistem);
      setSecilenSutunlar([]);
      setBildirim(`${tanim.baslik}: ${okunan.rows.length.toLocaleString("tr-TR")} kayıt yüklendi.`);
    } catch (hata) {
      const mesaj = hata instanceof Error ? hata.message : "Dosya işlenemedi.";
      setRaporlar((mevcut) => ({
        ...mevcut,
        [rapor]: { ...mevcut[rapor], loading: false, error: mesaj },
      }));
      setBildirim(mesaj);
    }
  }

  const hamRaporlar = useMemo(() => {
    return Object.fromEntries(
      RAPOR_TURLERI.map((rapor) => [rapor, raporlar[rapor].rows]),
    ) as Record<RaporTuru, KayitSatiri[]>;
  }, [raporlar]);

  const gorunenSatirlar = useMemo(
    () => gorunum === "TUM_VERILER"
      ? tumVerileriBirlestir(hamRaporlar)
      : sistemSatirlariniHazirla(gorunum, hamRaporlar),
    [gorunum, hamRaporlar],
  );

  const tumSutunlar = useMemo(() => sutunlariBul(gorunenSatirlar), [gorunenSatirlar]);
  const etkinSutunlar = secilenSutunlar.length ? secilenSutunlar : tumSutunlar;
  const filtrelenmisSatirlar = useMemo(() => {
    const aranan = metniNormallestir(arama);
    if (!aranan) return gorunenSatirlar;
    return gorunenSatirlar.filter((satir) =>
      Object.values(satir).some((deger) => metniNormallestir(deger).includes(aranan)),
    );
  }, [arama, gorunenSatirlar]);

  const yukluRaporSayisi = RAPOR_TURLERI.filter((rapor) => raporlar[rapor].summary).length;
  const toplamKayit = RAPOR_TURLERI.reduce(
    (toplam, rapor) => toplam + (raporlar[rapor].summary?.rowCount ?? 0),
    0,
  );

  async function seciliVerileriIndir() {
    const raporSatirlari = filtrelenmisSatirlar.map((satir) =>
      Object.fromEntries(etkinSutunlar.map((sutun) => [sutun, satir[sutun] ?? ""])),
    );
    await excelRaporuIndir(
      raporSatirlari,
      `${gorunum.toLocaleLowerCase("tr-TR")}-secili-veriler.xlsx`,
      gorunum === "TUM_VERILER" ? "Tüm Veriler" : gorunum,
    );
  }

  return (
    <main className="uygulama">
      <header className="ana-baslik">
        <div>
          <span>BELEDİYE ARAÇ BİLGİ SİSTEMİ</span>
          <h1>Üç sistem, tek düzenli araç tablosu</h1>
          <p>AKOS, Peslayn ve USYS Excel raporlarını ayrı ayrı inceleyin veya plaka üzerinden birleştirin.</p>
        </div>
        <div className="baslik-ozeti">
          <strong>{yukluRaporSayisi}<small>/7 rapor</small></strong>
          <span>{toplamKayit.toLocaleString("tr-TR")} kaynak kaydı</span>
        </div>
      </header>

      <section className="baglanti-alani">
        <div className="baglanti-basligi">
          <div><span>OTOMATİK VERİ BAĞLANTILARI</span><h2>Sistemlerden doğrudan veri çekme</h2></div>
          <button
            disabled={veriCekiliyor !== null || !baglantilar.length || !baglantilar.every((baglanti) => baglanti.configured)}
            onClick={() => void sistemdenCek("TUMU")}
          >
            {veriCekiliyor === "TUMU" ? "Veriler çekiliyor…" : "Tüm Verileri Güncelle"}
          </button>
        </div>
        <div className="baglanti-kartlari">
          {SISTEMLER.map((sistem) => {
            const durum = baglantilar.find((baglanti) => baglanti.name === sistem);
            return (
              <article key={sistem}>
                <div><strong>{sistem === "PESLAYN" ? "Peslayn" : sistem}</strong><span>{durum?.status ?? "Kontrol ediliyor…"}</span></div>
                <small>{durum?.configuredReportCount ?? 0}/{durum?.reportCount ?? sisteminRaporlari(sistem).length} API adresi</small>
                <button disabled={!durum?.configured || veriCekiliyor !== null} onClick={() => void sistemdenCek(sistem)}>
                  {veriCekiliyor === sistem ? "Çekiliyor…" : durum?.configured ? "Şimdi Güncelle" : "API Bekleniyor"}
                </button>
              </article>
            );
          })}
        </div>
        <p className="baglanti-notu">API adresleri geldiğinde güvenli sunucu ayarlarına eklenecek. Bundan sonra Excel yüklemeden bu düğmelerle güncelleme yapılacak.</p>
      </section>

      <nav className="sistem-sekmeleri" aria-label="Veri görünümleri">
        <button
          className={gorunum === "TUM_VERILER" ? "aktif" : ""}
          onClick={() => void gorunumuAc("TUM_VERILER")}
        >
          <b>Tüm Veriler</b><span>Plakaya göre birleşik tablo</span>
        </button>
        {SISTEMLER.map((sistem) => {
          const sistemRaporlari = sisteminRaporlari(sistem);
          const hazir = sistemRaporlari.filter((rapor) => raporlar[rapor].summary).length;
          return (
            <button
              key={sistem}
              className={gorunum === sistem ? "aktif" : ""}
              onClick={() => void gorunumuAc(sistem)}
            >
              <b>{sistem === "PESLAYN" ? "Peslayn" : sistem}</b>
              <span>{hazir}/{sistemRaporlari.length} rapor yüklü</span>
            </button>
          );
        })}
      </nav>

      {gorunum !== "TUM_VERILER" && (
        <section className="yukleme-alani">
          <div className="bolum-basligi">
            <div><span>YEDEK YÖNTEM · {gorunum}</span><h2>Gerekirse Excel dosyasıyla aktarım</h2></div>
            <p>API bağlantısı yokken veya geçici bir dosyayı incelemek için kullanılır.</p>
          </div>
          <div className="rapor-kartlari">
            {sisteminRaporlari(gorunum).map((rapor) => {
              const tanim = RAPOR_TANIMLARI[rapor];
              const durum = raporlar[rapor];
              return (
                <article className="rapor-karti" key={rapor}>
                  <input
                    hidden
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    ref={(eleman) => { dosyaGirdileri.current[rapor] = eleman; }}
                    onChange={(olay) => void dosyaYukle(rapor, olay.target.files?.[0])}
                  />
                  <div className="kart-durum">
                    <span className={durum.summary ? "hazir" : "eksik"}>
                      {durum.summary ? "Yüklendi" : "Dosya bekleniyor"}
                    </span>
                  </div>
                  <h3>{tanim.baslik}</h3>
                  <p>{tanim.aciklama}</p>
                  {durum.summary && (
                    <div className="dosya-bilgisi">
                      <strong>{durum.summary.rowCount.toLocaleString("tr-TR")} satır</strong>
                      <span>{durum.summary.fileName}</span>
                    </div>
                  )}
                  {durum.error && <small className="hata">{durum.error}</small>}
                  <button
                    className="yukle-dugmesi"
                    disabled={durum.loading}
                    onClick={() => dosyaGirdileri.current[rapor]?.click()}
                  >
                    {durum.loading ? "İşleniyor…" : durum.summary ? "Dosyayı Yenile" : "Excel Dosyasını Yükle"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {bildirim && <div className="bildirim">{bildirim}</div>}

      <section className="veri-alani">
        <div className="veri-araclari">
          <div>
            <span>VERİ TABLOSU</span>
            <h2>{gorunum === "TUM_VERILER" ? "Tüm sistemlerin birleşik verileri" : `${gorunum === "PESLAYN" ? "Peslayn" : gorunum} verileri`}</h2>
          </div>
          <div className="arac-dugmeleri">
            <input
              value={arama}
              onChange={(olay) => setArama(olay.target.value)}
              placeholder="Plaka veya herhangi bir bilgi ara"
            />
            <button onClick={() => setSutunPaneliAcik((acik) => !acik)}>
              Sütun Seç <b>{etkinSutunlar.length}</b>
            </button>
            <button
              className="indir"
              disabled={!filtrelenmisSatirlar.length}
              onClick={() => void seciliVerileriIndir()}
            >
              Seçili Verileri İndir
            </button>
          </div>
        </div>

        {sutunPaneliAcik && (
          <div className="sutun-secici">
            <div>
              <strong>Tabloda görmek istediğiniz alanları seçin</strong>
              <button onClick={() => setSecilenSutunlar([])}>Tümünü Göster</button>
            </div>
            <div className="sutun-listesi">
              {tumSutunlar.map((sutun) => {
                const secili = !secilenSutunlar.length || secilenSutunlar.includes(sutun);
                return (
                  <label key={sutun}>
                    <input
                      type="checkbox"
                      checked={secili}
                      onChange={() => {
                        const temel = secilenSutunlar.length ? secilenSutunlar : tumSutunlar;
                        setSecilenSutunlar(
                          secili ? temel.filter((alan) => alan !== sutun) : [...temel, sutun],
                        );
                      }}
                    />
                    {sutun}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="tablo-kapsayici">
          <table>
            <thead>
              <tr>{etkinSutunlar.map((sutun) => <th key={sutun}>{sutun}</th>)}</tr>
            </thead>
            <tbody>
              {filtrelenmisSatirlar.slice(0, 500).map((satir, sira) => (
                <tr key={`${satir.Plaka ?? satir["Plaka Numarasi"] ?? "satir"}-${sira}`} onClick={() => setSecilenSatir(satir)}>
                  {etkinSutunlar.map((sutun) => (
                    <td key={sutun}>
                      {metniNormallestir(sutun).includes("plaka")
                        ? <strong className="plaka">{satir[sutun] || "—"}</strong>
                        : gizliDegeriMaskele(sutun, satir[sutun] ?? "") || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtrelenmisSatirlar.length && (
            <div className="bos-tablo">
              <strong>Henüz gösterilecek veri yok</strong>
              <p>Önce AKOS, Peslayn veya USYS sekmesine geçip Excel raporlarını yükleyin.</p>
            </div>
          )}
        </div>
        <footer>
          <span>{filtrelenmisSatirlar.length.toLocaleString("tr-TR")} sonuç</span>
          <small>Ekranda ilk 500 satır gösterilir; Excel indirmesine filtrelenmiş sonuçların tamamı eklenir.</small>
        </footer>
      </section>

      {secilenSatir && (
        <div className="detay-arkaplan" onClick={() => setSecilenSatir(null)}>
          <aside className="detay-paneli" onClick={(olay) => olay.stopPropagation()}>
            <button className="kapat" onClick={() => setSecilenSatir(null)}>×</button>
            <span>ARAÇ KAYDI</span>
            <h2>{secilenSatir.Plaka ?? secilenSatir["Plaka Numarasi"] ?? "Kayıt Detayı"}</h2>
            <dl>
              {Object.entries(secilenSatir).map(([alan, deger]) => (
                <div key={alan}><dt>{alan}</dt><dd>{gizliDegeriMaskele(alan, deger) || "—"}</dd></div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </main>
  );
}
