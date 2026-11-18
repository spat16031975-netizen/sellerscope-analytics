import type { ConnectorKind, SyncResource } from "@prisma/client";

export type SyncWindow = { from: Date; to: Date; cursor?: unknown };
export type Page<T> = { items: T[]; nextCursor?: unknown; sourceFreshAt?: Date };

export type NormalizedRecord = {
  sourceId: string;
  sourceKind: ConnectorKind;
  resource: SyncResource;
  occurredAt: Date;
  sourceUpdatedAt?: Date;
  fetchedAt: Date;
  currency?: string;
  transformVersion: string;
  payload: unknown;
  raw: unknown;
};

export type ConnectorContext = {
  storeId: string;
  signal?: AbortSignal;
};

export interface MarketplaceConnector {
  readonly kind: ConnectorKind;
  readonly transformVersion: string;
  supports(resource: SyncResource): boolean;
  verifyAccess(context: ConnectorContext): Promise<{ ok: boolean; scopes: string[]; expiresAt?: Date }>;
  fetchPage(resource: SyncResource, window: SyncWindow, context: ConnectorContext): Promise<Page<unknown>>;
  normalize(resource: SyncResource, raw: unknown, fetchedAt: Date): NormalizedRecord[];
}

export class ConnectorLimitError extends Error {
  constructor(public readonly retryAfterMs: number, message = "Marketplace rate limit exceeded") {
    super(message);
  }
}

export class ConnectorAuthError extends Error {}
