import { claimMatchOperationReceipts } from "@/server/matches/clientOperationReplay";

// Jest's node environment here does not install the Fetch Response global that
// Next route handlers provide at runtime.
if (typeof globalThis.Response === "undefined") {
  class TestResponse {
    status: number;

    constructor(_body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
    }
  }
  globalThis.Response = TestResponse as unknown as typeof Response;
}

type Receipt = Record<string, any>;

const createClient = () => {
  const receipts: Receipt[] = [];
  const client = {
    matchOperationReceipts: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids = where?.clientOperationId?.in ?? [];
        return receipts.filter((receipt) =>
          ids.includes(receipt.clientOperationId),
        );
      }),
      findFirst: jest.fn(
        async ({ where }: any) =>
          receipts.find(
            (receipt) =>
              receipt.matchId === where?.matchId &&
              receipt.actorUserId === where?.actorUserId &&
              receipt.clientDeviceId === where?.clientDeviceId &&
              receipt.clientSequence >= where?.clientSequence?.gte,
          ) ?? null,
      ),
      createMany: jest.fn(async ({ data }: any) => {
        let count = 0;
        for (const row of data as Receipt[]) {
          if (
            receipts.some(
              (receipt) => receipt.clientOperationId === row.clientOperationId,
            )
          )
            continue;
          receipts.push({ ...row });
          count += 1;
        }
        return { count };
      }),
    },
  };
  return { client, receipts };
};

const claim = (client: any, payload: Record<string, unknown>) =>
  claimMatchOperationReceipts({
    client,
    eventId: "event_1",
    matchId: "match_1",
    actorUserId: "official_1",
    operationKind: "MATCH_UPDATE",
    payload,
  });

describe("claimMatchOperationReceipts", () => {
  it("returns a replay instead of accepting an identical mobile retry", async () => {
    const { client, receipts } = createClient();
    const payload = {
      clientOperationId: "phone:match_1:4",
      clientDeviceId: "phone",
      clientSequence: 4,
      segmentOperations: [
        {
          sequence: 1,
          scores: { team_1: 4, team_2: 2 },
          clientOperationId: "phone:match_1:4",
          clientDeviceId: "phone",
          clientSequence: 4,
        },
      ],
    };

    await expect(claim(client, payload)).resolves.toEqual({
      replayed: false,
      operationIds: ["phone:match_1:4"],
    });
    await expect(claim(client, payload)).resolves.toEqual({
      replayed: true,
      operationIds: ["phone:match_1:4"],
    });
    expect(receipts).toHaveLength(1);
  });

  it("rejects an operation ID reused with a different payload", async () => {
    const { client } = createClient();
    await claim(client, {
      clientOperationId: "phone:match_1:4",
      clientDeviceId: "phone",
      clientSequence: 4,
      segmentOperations: [{ sequence: 1, scores: { team_1: 4 } }],
    });

    await expect(
      claim(client, {
        clientOperationId: "phone:match_1:4",
        clientDeviceId: "phone",
        clientSequence: 4,
        segmentOperations: [{ sequence: 1, scores: { team_1: 5 } }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an older operation from the same device after a newer one committed", async () => {
    const { client } = createClient();
    await claim(client, {
      clientOperationId: "phone:match_1:8",
      clientDeviceId: "phone",
      clientSequence: 8,
    });

    await expect(
      claim(client, {
        clientOperationId: "phone:match_1:7",
        clientDeviceId: "phone",
        clientSequence: 7,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
