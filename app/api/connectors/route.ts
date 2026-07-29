import {
  getConnectorStatuses,
  pullConnectorData,
  type ConnectorName,
} from "../../lib/connectors";

const connectorNames: ConnectorName[] = ["AKOS", "PESLAYN", "USYS"];

export async function GET() {
  return Response.json({ connectors: getConnectorStatuses() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { connector?: ConnectorName | "ALL" };
    const selected = body.connector === "ALL"
      ? connectorNames
      : body.connector && connectorNames.includes(body.connector)
        ? [body.connector]
        : [];
    if (!selected.length) {
      return Response.json({ error: "Geçerli bir veri kaynağı seçilmedi." }, { status: 400 });
    }

    const results = [];
    for (const connector of selected) {
      try {
        results.push(await pullConnectorData(connector));
      } catch (error) {
        results.push({
          connector,
          ok: false,
          message: error instanceof Error ? error.message : "Veri çekilemedi.",
        });
      }
    }
    const ok = results.every((result) =>
      typeof result === "object" && result !== null && "ok" in result && result.ok,
    );
    return Response.json({ ok, results }, { status: ok ? 200 : 409 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bağlantı işlemi başarısız." },
      { status: 500 },
    );
  }
}
