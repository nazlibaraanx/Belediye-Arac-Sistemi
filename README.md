# Belediye Araç Bilgi ve Rapor Sistemi

Malatya Belediyesi araç raporlarını tek ekranda birleştiren, plaka üzerinden
arama ve raporlama sağlayan kurum içi web uygulamasıdır.

## Özellikler

- Altı farklı araç raporunu içe aktarma
- Plaka bazında birleşik araç dosyası oluşturma
- Ceza ve eksik denetim kayıtlarını filtreleme
- Kimlik ve telefon alanlarını ekranda maskeleme
- Sonuçları Excel raporu olarak dışa aktarma
- AKOS, Peslayn ve USYS bağlantı durumlarını izleme

## Çalıştırma

VS Code içinde `F5` tuşuna basıp **Belediye Araç Sistemini Aç** seçeneğini
kullanın.

Terminalden çalıştırmak için:

```powershell
npm.cmd run dev
```

## Temel klasörler

- `app/api/arac-raporlari`: araç raporu yükleme ve okuma işlemleri
- `app/api/sistem-baglantilari`: belediye sistem bağlantıları
- `app/ozellikler/arac-paneli`: araç yönetim ekranı ve bileşenleri
- `app/yardimcilar/belediye-sistem-baglantilari.ts`: bağlantı yardımcıları
- `app/genel-stiller.css`: uygulamanın genel görünüm kuralları
- `veritabani/arac-veritabani-semasi.ts`: veritabanı tablo tanımları
- `drizzle`: veritabanı migration dosyaları
- `public/arac-rapor-merkezi.png`: uygulamanın paylaşım görseli

Excel, CSV, yerel veritabanı, günlük ve geçici çıktı dosyaları Git tarafından
izlenmez.
