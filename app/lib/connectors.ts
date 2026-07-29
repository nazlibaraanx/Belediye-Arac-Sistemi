export type ConnectorName = "AKOS" | "PESLAYN" | "USYS";

export type ConnectorStatus = {
  name: ConnectorName;
  configured: boolean;
  status: "Yetki bekleniyor" | "Bağlantıya hazır";
};

const connectorNames: ConnectorName[] = ["AKOS", "PESLAYN", "USYS"];

function connectorConfig(name: ConnectorName) {
  return {
    url: process.env[`${name}_URL`] ?? "",
    username: process.env[`${name}_USERNAME`] ?? "",
    password: process.env[`${name}_PASSWORD`] ?? "",
  };
}

export function getConnectorStatuses(): ConnectorStatus[] {
  return connectorNames.map((name) => {
    const config = connectorConfig(name);
    const configured = Boolean(config.url && config.username && config.password);
    return {
      name,
      configured,
      status: configured ? "Bağlantıya hazır" : "Yetki bekleniyor",
    };
  });
}

export async function pullConnectorData(name: ConnectorName) {
  const config = connectorConfig(name);
  if (!config.url || !config.username || !config.password) {
    throw new Error(`${name} için adres ve giriş yetkisi henüz tanımlanmadı.`);
  }

  // Her sistemin giriş, oturum ve rapor indirme adımları yetki alındığında
  // bu adaptörde tamamlanacak. Şifreler yalnızca sunucu ortamında kalır.
  throw new Error(`${name} bağlantı bilgileri hazır; veri çekme adımları yetki sonrası eşleştirilecek.`);
}
