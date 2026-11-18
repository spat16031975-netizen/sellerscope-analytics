import type { ConnectorKind } from "@prisma/client";
import type { MarketplaceConnector } from "./types";

export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorKind, MarketplaceConnector>();

  register(connector: MarketplaceConnector) {
    if (this.connectors.has(connector.kind)) throw new Error(`Connector ${connector.kind} already registered`);
    this.connectors.set(connector.kind, connector);
  }

  get(kind: ConnectorKind) {
    const connector = this.connectors.get(kind);
    if (!connector) throw new Error(`Connector ${kind} is not configured`);
    return connector;
  }
}
