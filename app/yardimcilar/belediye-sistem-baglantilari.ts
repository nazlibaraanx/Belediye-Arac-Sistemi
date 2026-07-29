export type SistemAdi = "AKOS" | "PESLAYN" | "USYS";

export type SistemBaglantiDurumu = {
  name: SistemAdi;
  configured: boolean;
  status: "Yetki bekleniyor" | "Bağlantıya hazır";
};

const SISTEM_ADLARI: SistemAdi[] = ["AKOS", "PESLAYN", "USYS"];

function sistemAyarlari(name: SistemAdi) {
  return {
    url: process.env[`${name}_URL`] ?? "",
    username: process.env[`${name}_USERNAME`] ?? "",
    password: process.env[`${name}_PASSWORD`] ?? "",
  };
}

export function sistemDurumlariniGetir(): SistemBaglantiDurumu[] {
  return SISTEM_ADLARI.map((name) => {
    const config = sistemAyarlari(name);
    const configured = Boolean(config.url && config.username && config.password);
    return {
      name,
      configured,
      status: configured ? "Bağlantıya hazır" : "Yetki bekleniyor",
    };
  });
}

export async function sistemdenVeriCek(name: SistemAdi) {
  const config = sistemAyarlari(name);
  if (!config.url || !config.username || !config.password) {
    throw new Error(`${name} için adres ve giriş yetkisi henüz tanımlanmadı.`);
  }

  // Her sistemin giriş, oturum ve rapor indirme adımları yetki alındığında
  // bu adaptörde tamamlanacak. Şifreler yalnızca sunucu ortamında kalır.
  throw new Error(`${name} bağlantı bilgileri hazır; veri çekme adımları yetki sonrası eşleştirilecek.`);
}
