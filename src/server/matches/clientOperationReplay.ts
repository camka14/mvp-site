import { createHash } from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type ClientOperationInput = {
  clientOperationId?: unknown;
  clientDeviceId?: unknown;
  clientSequence?: unknown;
};

type ClientOperationDescriptor = {
  clientOperationId: string;
  clientDeviceId: string | null;
  clientSequence: number | null;
};

type StoredReceipt = {
  clientOperationId: string;
  eventId: string;
  matchId: string;
  actorUserId: string;
  operationKind: string;
  requestHash: string;
};

export type MatchOperationClaim = {
  replayed: boolean;
  operationIds: string[];
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeSequence = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const sequence = Math.trunc(value);
  return sequence >= 0 ? sequence : null;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const requestHashFor = (operationKind: string, payload: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify({ operationKind, payload: stableValue(payload) }))
    .digest("hex");

const collectClientOperationDescriptors = (
  payload: Record<string, unknown>,
): ClientOperationDescriptor[] => {
  const candidates: ClientOperationInput[] = [payload];
  const addCandidates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((entry) => {
      if (entry && typeof entry === "object") {
        candidates.push(entry as ClientOperationInput);
      }
    });
  };
  addCandidates(payload.segmentOperations);
  addCandidates(payload.incidentOperations);

  const descriptorsById = new Map<string, ClientOperationDescriptor>();
  for (const candidate of candidates) {
    const clientOperationId = normalizeToken(candidate.clientOperationId);
    if (!clientOperationId) continue;
    const descriptor: ClientOperationDescriptor = {
      clientOperationId,
      clientDeviceId: normalizeToken(candidate.clientDeviceId),
      clientSequence: normalizeSequence(candidate.clientSequence),
    };
    const previous = descriptorsById.get(clientOperationId);
    if (
      previous &&
      (previous.clientDeviceId !== descriptor.clientDeviceId ||
        previous.clientSequence !== descriptor.clientSequence)
    ) {
      throw new Response(
        "Conflicting metadata for the same client operation ID.",
        { status: 400 },
      );
    }
    descriptorsById.set(clientOperationId, descriptor);
  }

  const sequenceKeys = new Set<string>();
  for (const descriptor of descriptorsById.values()) {
    if (
      descriptor.clientDeviceId === null ||
      descriptor.clientSequence === null
    )
      continue;
    const key = `${descriptor.clientDeviceId}\u0000${descriptor.clientSequence}`;
    if (sequenceKeys.has(key)) {
      throw new Response(
        "Client operation sequence must be unique per device in a request.",
        { status: 400 },
      );
    }
    sequenceKeys.add(key);
  }
  return Array.from(descriptorsById.values());
};

const isExactReplay = (
  receipts: StoredReceipt[],
  descriptors: ClientOperationDescriptor[],
  params: {
    eventId: string;
    matchId: string;
    actorUserId: string;
    operationKind: string;
    requestHash: string;
  },
): boolean => {
  if (receipts.length !== descriptors.length) return false;
  const byOperationId = new Map(
    receipts.map((receipt) => [receipt.clientOperationId, receipt]),
  );
  return descriptors.every((descriptor) => {
    const receipt = byOperationId.get(descriptor.clientOperationId);
    return (
      receipt?.eventId === params.eventId &&
      receipt.matchId === params.matchId &&
      receipt.actorUserId === params.actorUserId &&
      receipt.operationKind === params.operationKind &&
      receipt.requestHash === params.requestHash
    );
  });
};

const loadReceipts = async (
  client: PrismaLike,
  operationIds: string[],
): Promise<StoredReceipt[]> =>
  client.matchOperationReceipts.findMany({
    where: { clientOperationId: { in: operationIds } },
    select: {
      clientOperationId: true,
      eventId: true,
      matchId: true,
      actorUserId: true,
      operationKind: true,
      requestHash: true,
    },
  });

/**
 * Claims all client operation IDs in one logical match request. A retry with
 * the exact same actor/request returns `replayed`; changing a previously used
 * ID or sending an earlier sequence is rejected before match state mutates.
 */
export const claimMatchOperationReceipts = async (params: {
  client: PrismaLike;
  eventId: string;
  matchId: string;
  actorUserId: string;
  operationKind: string;
  payload: Record<string, unknown>;
}): Promise<MatchOperationClaim> => {
  const descriptors = collectClientOperationDescriptors(params.payload);
  const operationIds = descriptors.map(
    (descriptor) => descriptor.clientOperationId,
  );
  if (!operationIds.length) {
    return { replayed: false, operationIds };
  }

  const requestHash = requestHashFor(params.operationKind, params.payload);
  const replayContext = {
    eventId: params.eventId,
    matchId: params.matchId,
    actorUserId: params.actorUserId,
    operationKind: params.operationKind,
    requestHash,
  };
  const existing = await loadReceipts(params.client, operationIds);
  if (existing.length > 0) {
    if (isExactReplay(existing, descriptors, replayContext)) {
      return { replayed: true, operationIds };
    }
    throw new Response(
      "Client operation ID has already been used for a different match operation.",
      { status: 409 },
    );
  }

  for (const descriptor of descriptors) {
    if (
      descriptor.clientDeviceId === null ||
      descriptor.clientSequence === null
    )
      continue;
    const laterOrEqualReceipt =
      await params.client.matchOperationReceipts.findFirst({
        where: {
          matchId: params.matchId,
          actorUserId: params.actorUserId,
          clientDeviceId: descriptor.clientDeviceId,
          clientSequence: { gte: descriptor.clientSequence },
        },
        select: { clientOperationId: true },
      });
    if (laterOrEqualReceipt) {
      throw new Response(
        "Client operation is out of order. Refresh the match before retrying.",
        { status: 409 },
      );
    }
  }

  const inserted = await params.client.matchOperationReceipts.createMany({
    data: descriptors.map((descriptor) => ({
      clientOperationId: descriptor.clientOperationId,
      eventId: params.eventId,
      matchId: params.matchId,
      actorUserId: params.actorUserId,
      clientDeviceId: descriptor.clientDeviceId,
      clientSequence: descriptor.clientSequence,
      operationKind: params.operationKind,
      requestHash,
    })),
    skipDuplicates: true,
  });

  if (inserted.count === descriptors.length) {
    return { replayed: false, operationIds };
  }
  const persisted = await loadReceipts(params.client, operationIds);
  if (
    persisted.length === descriptors.length &&
    isExactReplay(persisted, descriptors, replayContext)
  ) {
    return { replayed: true, operationIds };
  }
  throw new Response(
    "Client operation ID has already been used for a different match operation.",
    { status: 409 },
  );
};
