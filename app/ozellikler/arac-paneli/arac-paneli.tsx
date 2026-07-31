"use client";

import { useEffect, useMemo, useState } from "react";
import { sistemSatirlariniHazirla, tumVerileriBirlestir } from "./arac-birlestirme";
import { excelRaporuIndir } from "./excel-islemleri";
import {
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

const GORUNUM_ADLARI: Record<SistemAdi, string> = {
  AKOS: "Ruhsat Bilgileri",
  PESLAYN: "Araç ve Hareket Bilgileri",
  USYS: "Ceza ve Denetim Bilgileri",
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
  const [hissedarlariSatirSatirGoster, setHissedarlariSatirSatirGoster] = useState(false);
  const [secilenSatir, setSecilenSatir] = useState<KayitSatiri | null>(null);

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

  async function tumKayitlariYenile() {
    const yanit = await fetch("/api/arac-raporlari");
    const sonuc = await yanit.json() as { imports?: AktarimOzeti[] };
    const ozetler = sonuc.imports ?? [];
    const yeni = bosRaporDurumlari();
    await Promise.all(ozetler.map(async (ozet) => {
      if (!RAPOR_TURLERI.includes(ozet.source)) return;
      const raporYaniti = await fetch(`/api/arac-raporlari?source=${ozet.source}`);
      const raporSonucu = await raporYaniti.json() as { rows?: KayitSatiri[] };
      yeni[ozet.source] = {
        summary: ozet,
        rows: raporSonucu.rows ?? [],
        loading: false,
      };
    }));
    setRaporlar(yeni);
    return Object.fromEntries(
      RAPOR_TURLERI.map((rapor) => [rapor, yeni[rapor].rows]),
    ) as Record<RaporTuru, KayitSatiri[]>;
  }

  async function butunVerileriCek() {
    setVeriCekiliyor("TUMU");
    setBildirim("Güncel araç bilgileri getiriliyor…");
    try {
      const yanit = await fetch("/api/sistem-baglantilari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector: "ALL" }),
      });
      const sonuc = await yanit.json() as { results?: { message: string }[]; error?: string };
      const mesaj = sonuc.results?.map((satir) => satir.message).join(" · ");
      if (!yanit.ok) throw new Error(mesaj || sonuc.error || "Veriler çekilemedi.");
      await tumKayitlariYenile();
      setGorunum("TUM_VERILER");
      setArama("");
      setSecilenSutunlar([]);
      setBildirim("Bütün araç bilgileri güncellendi. Artık plaka arayabilir veya Excel oluşturabilirsiniz.");
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
  const temelSutunlar = useMemo(() => {
    if (gorunum !== "TUM_VERILER") return tumSutunlar.slice(0, 9);
    const oncelikli = ["Plaka", "Hissedar Sayısı", "Hissedarlar", "Bulunduğu Bilgi Grupları"];
    return oncelikli.filter((sutun) => tumSutunlar.includes(sutun));
  }, [gorunum, tumSutunlar]);
  const etkinSutunlar = secilenSutunlar.length ? secilenSutunlar : temelSutunlar;
  const filtrelenmisSatirlar = useMemo(() => {
    const aranan = metniNormallestir(arama);
    if (!aranan) return gorunenSatirlar;
    return gorunenSatirlar.filter((satir) =>
      Object.values(satir).some((deger) => metniNormallestir(deger).includes(aranan)),
    );
  }, [arama, gorunenSatirlar]);

  const tabloSatirlari = useMemo(() => {
    if (gorunum !== "TUM_VERILER" || !hissedarlariSatirSatirGoster) {
      return filtrelenmisSatirlar;
    }
    return filtrelenmisSatirlar.flatMap((satir) => {
      const hissedarlar = (satir.Hissedarlar ?? "").split(" | ").filter(Boolean);
      if (!hissedarlar.length) return [{ ...satir, "Kayıt Türü": "Araç", "Kişi / Hissedar": "", "Hisse Oranı": "" }];
      return hissedarlar.map((hissedar, sira) => {
        const [kisi, hisse = ""] = hissedar.split(" — ");
        return {
          ...satir,
          "Kayıt Türü": sira === 0 ? "Araç Sahibi" : "Hissedar",
          "Kişi / Hissedar": kisi,
          "Hisse Oranı": hisse,
        };
      });
    });
  }, [filtrelenmisSatirlar, gorunum, hissedarlariSatirSatirGoster]);

  const tabloSutunlari = useMemo(() => {
    if (gorunum !== "TUM_VERILER" || !hissedarlariSatirSatirGoster) return etkinSutunlar;
    const kisiSutunlari = ["Plaka", "Kayıt Türü", "Kişi / Hissedar", "Hisse Oranı"];
    return [...kisiSutunlari, ...etkinSutunlar.filter((sutun) => !kisiSutunlari.includes(sutun) && sutun !== "Hissedarlar")];
  }, [etkinSutunlar, gorunum, hissedarlariSatirSatirGoster]);

  const yukluRaporSayisi = RAPOR_TURLERI.filter((rapor) => raporlar[rapor].summary).length;
  const toplamKayit = RAPOR_TURLERI.reduce(
    (toplam, rapor) => toplam + (raporlar[rapor].summary?.rowCount ?? 0),
    0,
  );

  async function seciliVerileriIndir() {
    const raporSatirlari = tabloSatirlari.map((satir) =>
      Object.fromEntries(tabloSutunlari.map((sutun) => [sutun, satir[sutun] ?? ""])),
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
          <h1>Bütün araç bilgileri tek ekranda</h1>
          <p>Güncel verileri tek işlemle getirin, plaka üzerinden arayın ve istediğiniz bilgileri Excel olarak alın.</p>
        </div>
        <div className="baslik-ozeti">
          <strong>{yukluRaporSayisi}<small>/7 rapor</small></strong>
          <span>{toplamKayit.toLocaleString("tr-TR")} kaynak kaydı</span>
        </div>
      </header>

      <section className="tek-islem-alani">
        <div>
          <span>TEK ADIMDA GÜNCELLE</span>
          <h2>Bütün araç bilgilerini getir</h2>
          <p>Sistem, gerekli kaynaklardan verileri arka planda toplar ve plakaya göre tek tabloda birleştirir.</p>
        </div>
        <button
          disabled={veriCekiliyor !== null || !baglantilar.length || !baglantilar.every((baglanti) => baglanti.configured)}
          onClick={() => void butunVerileriCek()}
        >
          {veriCekiliyor ? "Veriler getiriliyor…" : "Verileri Çek"}
        </button>
        {baglantilar.length > 0 && !baglantilar.every((baglanti) => baglanti.configured) && (
          <small>Bağlantı bilgileri tamamlandığında bu düğme otomatik olarak açılacak.</small>
        )}
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
              <b>{GORUNUM_ADLARI[sistem]}</b>
              <span>{hazir === sistemRaporlari.length ? "Güncel" : "Veri bekleniyor"}</span>
            </button>
          );
        })}
      </nav>

      {bildirim && <div className="bildirim">{bildirim}</div>}

      <section className="veri-alani">
        <div className="veri-araclari">
          <div>
            <span>VERİ TABLOSU</span>
            <h2>{gorunum === "TUM_VERILER" ? "Tüm araç bilgileri" : GORUNUM_ADLARI[gorunum]}</h2>
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
            {gorunum === "TUM_VERILER" && (
              <button
                className={hissedarlariSatirSatirGoster ? "secili-filtre" : ""}
                onClick={() => setHissedarlariSatirSatirGoster((goster) => !goster)}
              >
                {hissedarlariSatirSatirGoster ? "Hissedarları Gizle" : "Hissedarları Satır Satır Göster"}
              </button>
            )}
            <button
              className="indir"
              disabled={!filtrelenmisSatirlar.length}
              onClick={() => void seciliVerileriIndir()}
            >
              Excel Oluştur
            </button>
          </div>
        </div>

        {sutunPaneliAcik && (
          <div className="sutun-secici">
            <div>
              <strong>Tabloda görmek istediğiniz alanları seçin</strong>
              <div className="sutun-secici-islemleri">
                <button onClick={() => setSecilenSutunlar([])}>Temel Alanlar</button>
                <button onClick={() => setSecilenSutunlar(tumSutunlar)}>Bütün Alanlar</button>
              </div>
            </div>
            <div className="sutun-listesi">
              {tumSutunlar.map((sutun) => {
                const secili = etkinSutunlar.includes(sutun);
                return (
                  <label key={sutun}>
                    <input
                      type="checkbox"
                      checked={secili}
                      onChange={() => {
                        const temel = secilenSutunlar.length ? secilenSutunlar : temelSutunlar;
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
              <tr>{tabloSutunlari.map((sutun) => <th key={sutun}>{sutun}</th>)}</tr>
            </thead>
            <tbody>
              {tabloSatirlari.slice(0, 500).map((satir, sira) => (
                <tr key={`${satir.Plaka ?? satir["Plaka Numarasi"] ?? "satir"}-${sira}`} onClick={() => setSecilenSatir(satir)}>
                  {tabloSutunlari.map((sutun) => (
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
          {!tabloSatirlari.length && (
            <div className="bos-tablo">
              <strong>Henüz gösterilecek veri yok</strong>
              <p>Önce AKOS, Peslayn veya USYS sekmesine geçip Excel raporlarını yükleyin.</p>
            </div>
          )}
        </div>
        <footer>
          <span>{tabloSatirlari.length.toLocaleString("tr-TR")} tablo satırı</span>
          <small>Ekranda ilk 500 satır gösterilir; Excel indirmesine filtrelenmiş sonuçların tamamı eklenir.</small>
        </footer>
      </section>

      {secilenSatir && (
        <div className="detay-arkaplan" onClick={() => setSecilenSatir(null)}>
          <aside className="detay-paneli" onClick={(olay) => olay.stopPropagation()}>
            <button className="kapat" onClick={() => setSecilenSatir(null)}>×</button>
            <span>ARAÇ KAYDI</span>
            <h2>{secilenSatir.Plaka ?? secilenSatir["Plaka Numarasi"] ?? "Kayıt Detayı"}</h2>
            {secilenSatir.Hissedarlar && (
              <section className="hissedar-bolumu">
                <div><strong>Hissedarlar</strong><span>{secilenSatir["Hissedar Sayısı"]} kişi</span></div>
                <ul>
                  {secilenSatir.Hissedarlar.split(" | ").map((hissedar) => (
                    <li key={hissedar}>{hissedar}</li>
                  ))}
                </ul>
              </section>
            )}
            <dl>
              {Object.entries(secilenSatir)
                .filter(([alan]) => alan !== "Hissedarlar")
                .map(([alan, deger]) => (
                <div key={alan}><dt>{alan}</dt><dd>{gizliDegeriMaskele(alan, deger) || "—"}</dd></div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </main>
  );
}
