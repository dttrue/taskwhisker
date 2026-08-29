import assert from "node:assert/strict";
import test from "node:test";

import { resolveClientOriginWriteIntent } from "../attribution/clientAttributionWrites.js";
import { resolveClientOriginWriteIntentFromReferralCode } from "./referralAttributionWrites.js";
import {
  REFERRAL_CODE_BYTES,
  REFERRAL_CODE_ERROR_CODES,
  REFERRAL_CODE_LENGTH,
  SitterReferralCodeError,
  generatePublicReferralCode,
  hashPublicReferralCode,
} from "./sitterReferralCodeContract.js";
import {
  createSitterReferralCode,
  readVerifiedSitterReferralIntent,
  revokeSitterReferralCode,
  rotateSitterReferralCode,
  verifySitterReferralCode,
} from "./sitterReferralCodeWrites.js";

const operator = { id: "operator-1", role: "OPERATOR", name: "Bridget" };
const sitter = {
  id: "sitter-1",
  role: "SITTER",
  name: "Sarah",
  email: "sarah@example.com",
};
const anotherSitter = { id: "sitter-2", role: "SITTER", name: "Danny" };

function cloneState(state) {
  return {
    users: new Map([...state.users].map(([id, row]) => [id, { ...row }])),
    clients: new Map([...state.clients].map(([id, row]) => [id, { ...row }])),
    origins: new Map([...state.origins].map(([id, row]) => [id, { ...row }])),
    referralCodes: new Map(
      [...state.referralCodes].map(([id, row]) => [id, { ...row }]),
    ),
    nextId: state.nextId,
  };
}

function makeDataClient(getState) {
  return {
    user: {
      async findUnique({ where }) {
        return getState().users.get(where.id) ?? null;
      },
    },
    client: {
      async findMany() {
        const state = getState();
        return [...state.clients.values()].map((row) => ({
          ...row,
          origin: state.origins.get(row.id) ?? null,
        }));
      },
    },
    sitterReferralCode: {
      async findUnique({ where }) {
        const state = getState();
        const row = [...state.referralCodes.values()].find(
          (candidate) =>
            (where.id && candidate.id === where.id) ||
            (where.codeHash && candidate.codeHash === where.codeHash) ||
            (where.activeSitterKey &&
              candidate.activeSitterKey === where.activeSitterKey),
        );
        if (!row) return null;
        return {
          ...row,
          sitter: state.users.get(row.sitterId) ?? null,
        };
      },
      async findFirst({ where }) {
        return (
          [...getState().referralCodes.values()]
            .filter((row) => row.sitterId === where.sitterId)
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
        );
      },
      async create({ data }) {
        const state = getState();
        const conflict = [...state.referralCodes.values()].some(
          (row) =>
            row.codeHash === data.codeHash ||
            (data.activeSitterKey &&
              row.activeSitterKey === data.activeSitterKey),
        );
        if (conflict) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const row = {
          id: `referral-${state.nextId++}`,
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null,
          createdAt: new Date(),
          ...data,
        };
        state.referralCodes.set(row.id, row);
        return { ...row };
      },
      async update({ where, data }) {
        const state = getState();
        const current = state.referralCodes.get(where.id);
        const updated = { ...current, ...data };
        state.referralCodes.set(where.id, updated);
        return { ...updated };
      },
      async updateMany({ where, data }) {
        const state = getState();
        const current = state.referralCodes.get(where.id);
        if (
          !current ||
          current.activeSitterKey !== where.activeSitterKey ||
          current.revokedAt !== where.revokedAt
        ) {
          return { count: 0 };
        }
        state.referralCodes.set(where.id, { ...current, ...data });
        return { count: 1 };
      },
    },
  };
}

function makeDb({
  users = [operator, sitter],
  clients = [],
  origins = [],
  referralCodes = [],
} = {}) {
  let state = {
    users: new Map(users.map((row) => [row.id, { ...row }])),
    clients: new Map(clients.map((row) => [row.id, { ...row }])),
    origins: new Map(origins.map((row) => [row.clientId, { ...row }])),
    referralCodes: new Map(referralCodes.map((row) => [row.id, { ...row }])),
    nextId: referralCodes.length + 1,
  };
  let transactionQueue = Promise.resolve();
  const db = makeDataClient(() => state);
  Object.defineProperty(db, "state", { get: () => state });
  db.$transaction = async (work) => {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const draft = cloneState(state);
    try {
      const result = await work(makeDataClient(() => draft));
      state = draft;
      return result;
    } finally {
      release();
    }
  };
  return db;
}

async function assertRejectsCode(run, code) {
  await assert.rejects(run, (error) => {
    assert(error instanceof SitterReferralCodeError);
    assert.equal(error.code, code);
    return true;
  });
}

test("generated public codes have 256 bits of URL-safe entropy", () => {
  const publicCode = generatePublicReferralCode();
  assert.equal(REFERRAL_CODE_BYTES, 32);
  assert.equal(publicCode.length, REFERRAL_CODE_LENGTH);
  assert.match(publicCode, /^[A-Za-z0-9_-]+$/);
});

test("generated public codes differ", () => {
  assert.notEqual(generatePublicReferralCode(), generatePublicReferralCode());
});

test("generated code does not embed predictable sitter identity", () => {
  const publicCode = generatePublicReferralCode().toLowerCase();
  assert.equal(publicCode.includes("sarah"), false);
  assert.equal(publicCode.includes("sitter-1"), false);
  assert.equal(publicCode.includes("example"), false);
});

test("hash lookup is deterministic", () => {
  const publicCode = "A".repeat(REFERRAL_CODE_LENGTH);
  assert.equal(
    hashPublicReferralCode(publicCode),
    hashPublicReferralCode(publicCode),
  );
  assert.equal(hashPublicReferralCode(publicCode).length, 64);
});

test("operator creation stores only the code hash and returns raw code once", async () => {
  const db = makeDb();
  const result = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const stored = [...db.state.referralCodes.values()][0];
  assert.equal(stored.codeHash, hashPublicReferralCode(result.publicCode));
  assert.equal(JSON.stringify(stored).includes(result.publicCode), false);
  assert.equal(stored.activeSitterKey, sitter.id);
});

test("valid active code verifies to opaque trusted referral metadata", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const verified = await verifySitterReferralCode({
    db,
    publicCode: created.publicCode,
  });
  assert.deepEqual(readVerifiedSitterReferralIntent({ db, verifiedReferral: verified }), {
    sitterId: sitter.id,
    source: "REFERRAL_LINK",
  });
});

test("verified referral is bound to the database that verified it", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const verifiedReferral = await verifySitterReferralCode({
    db,
    publicCode: created.publicCode,
  });
  assert.throws(
    () =>
      readVerifiedSitterReferralIntent({
        db: makeDb(),
        verifiedReferral,
      }),
    (error) => error?.code === REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("malformed code is rejected generically", async () => {
  await assertRejectsCode(
    () => verifySitterReferralCode({ db: makeDb(), publicCode: "short" }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("nonexistent code is rejected generically", async () => {
  await assertRejectsCode(
    () =>
      verifySitterReferralCode({
        db: makeDb(),
        publicCode: "N".repeat(REFERRAL_CODE_LENGTH),
      }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("revoked code is rejected generically", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await revokeSitterReferralCode({
    db,
    codeId: created.referralCode.id,
    operatorUserId: operator.id,
    reason: "Routine rotation.",
  });
  await assertRejectsCode(
    () => verifySitterReferralCode({ db, publicCode: created.publicCode }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("code owned by a non-SITTER is rejected generically", async () => {
  const publicCode = "O".repeat(REFERRAL_CODE_LENGTH);
  const db = makeDb({
    users: [operator],
    referralCodes: [
      {
        id: "bad-owner",
        sitterId: operator.id,
        codeHash: hashPublicReferralCode(publicCode),
        activeSitterKey: operator.id,
        revokedAt: null,
        createdAt: new Date(),
      },
    ],
  });
  await assertRejectsCode(
    () => verifySitterReferralCode({ db, publicCode }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("code with a missing sitter is rejected generically", async () => {
  const publicCode = "M".repeat(REFERRAL_CODE_LENGTH);
  const db = makeDb({
    users: [operator],
    referralCodes: [
      {
        id: "missing-owner",
        sitterId: sitter.id,
        codeHash: hashPublicReferralCode(publicCode),
        activeSitterKey: sitter.id,
        revokedAt: null,
        createdAt: new Date(),
      },
    ],
  });
  await assertRejectsCode(
    () => verifySitterReferralCode({ db, publicCode }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("inactive code state is rejected generically", async () => {
  const publicCode = "I".repeat(REFERRAL_CODE_LENGTH);
  const db = makeDb({
    referralCodes: [
      {
        id: "inactive-code",
        sitterId: sitter.id,
        codeHash: hashPublicReferralCode(publicCode),
        activeSitterKey: null,
        revokedAt: null,
        createdAt: new Date(),
      },
    ],
  });
  await assertRejectsCode(
    () => verifySitterReferralCode({ db, publicCode }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("creation requires an OPERATOR", async () => {
  await assertRejectsCode(
    () =>
      createSitterReferralCode({
        db: makeDb({ users: [sitter, anotherSitter] }),
        sitterId: sitter.id,
        operatorUserId: anotherSitter.id,
      }),
    REFERRAL_CODE_ERROR_CODES.OPERATOR_REQUIRED,
  );
});

test("creation requires a SITTER target", async () => {
  await assertRejectsCode(
    () =>
      createSitterReferralCode({
        db: makeDb({ users: [operator] }),
        sitterId: operator.id,
        operatorUserId: operator.id,
      }),
    REFERRAL_CODE_ERROR_CODES.REFERRAL_SITTER_INVALID,
  );
});

test("second active code creation is rejected", async () => {
  const db = makeDb();
  await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await assertRejectsCode(
    () =>
      createSitterReferralCode({
        db,
        sitterId: sitter.id,
        operatorUserId: operator.id,
      }),
    REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_CONFLICT,
  );
});

test("rotation revokes old code and returns a new code", async () => {
  const db = makeDb();
  const oldCode = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const rotated = await rotateSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
    reason: "Replace shared link.",
  });
  assert.notEqual(rotated.publicCode, oldCode.publicCode);
  assert.equal(rotated.revokedCodeId, oldCode.referralCode.id);
  assert.equal(
    [...db.state.referralCodes.values()].filter(
      (row) => row.activeSitterKey === sitter.id,
    ).length,
    1,
  );
});

test("old code fails immediately after rotation", async () => {
  const db = makeDb();
  const oldCode = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await rotateSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
    reason: "Replace shared link.",
  });
  await assertRejectsCode(
    () => verifySitterReferralCode({ db, publicCode: oldCode.publicCode }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("revocation requires a reason", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await assertRejectsCode(
    () =>
      revokeSitterReferralCode({
        db,
        codeId: created.referralCode.id,
        operatorUserId: operator.id,
        reason: " ",
      }),
    REFERRAL_CODE_ERROR_CODES.REVOCATION_REASON_REQUIRED,
  );
});

test("revocation requires an OPERATOR", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  db.state.users.set(operator.id, { ...operator, role: "SITTER" });
  await assertRejectsCode(
    () =>
      revokeSitterReferralCode({
        db,
        codeId: created.referralCode.id,
        operatorUserId: operator.id,
        reason: "No longer shared.",
      }),
    REFERRAL_CODE_ERROR_CODES.OPERATOR_REQUIRED,
  );
});

test("rotation requires an OPERATOR", async () => {
  const db = makeDb();
  await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  db.state.users.set(operator.id, { ...operator, role: "SITTER" });
  await assertRejectsCode(
    () =>
      rotateSitterReferralCode({
        db,
        sitterId: sitter.id,
        operatorUserId: operator.id,
        reason: "Replace shared link.",
      }),
    REFERRAL_CODE_ERROR_CODES.OPERATOR_REQUIRED,
  );
});

test("repeated revocation is idempotent", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const first = await revokeSitterReferralCode({
    db,
    codeId: created.referralCode.id,
    operatorUserId: operator.id,
    reason: "No longer shared.",
  });
  const second = await revokeSitterReferralCode({
    db,
    codeId: created.referralCode.id,
    operatorUserId: operator.id,
    reason: "No longer shared.",
  });
  assert.deepEqual(
    [first.revoked, second.revoked, second.idempotent],
    [true, false, true],
  );
});

test("concurrent creation cannot leave two active codes", async () => {
  const db = makeDb();
  const results = await Promise.allSettled([
    createSitterReferralCode({
      db,
      sitterId: sitter.id,
      operatorUserId: operator.id,
    }),
    createSitterReferralCode({
      db,
      sitterId: sitter.id,
      operatorUserId: operator.id,
    }),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["fulfilled", "rejected"],
  );
  assert.equal(
    [...db.state.referralCodes.values()].filter(
      (row) => row.activeSitterKey === sitter.id,
    ).length,
    1,
  );
});

test("verified referral feeds the attribution write-intent boundary", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const verifiedReferral = await verifySitterReferralCode({
    db,
    publicCode: created.publicCode,
  });
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: "new-client@example.com",
    phone: null,
    verifiedReferral,
  });
  assert.deepEqual(
    [intent.kind, intent.source, intent.referringSitterId],
    ["SITTER_REFERRAL", "REFERRAL_LINK", sitter.id],
  );
});

test("raw valid code composes directly into a referral attribution intent", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const intent = await resolveClientOriginWriteIntentFromReferralCode({
    db,
    email: "new-client@example.com",
    phone: null,
    publicReferralCode: created.publicCode,
  });
  assert.deepEqual(
    [intent.kind, intent.source, intent.referringSitterId],
    ["SITTER_REFERRAL", "REFERRAL_LINK", sitter.id],
  );
});

test("composed boundary preserves the no-referral BUSINESS path", async () => {
  const intent = await resolveClientOriginWriteIntentFromReferralCode({
    db: makeDb(),
    email: "new-client@example.com",
    phone: null,
    publicReferralCode: null,
  });
  assert.deepEqual(
    [intent.kind, intent.source, intent.referringSitterId],
    ["BUSINESS", "BUSINESS_DEFAULT", null],
  );
});

test("landing verification does not outlive later code revocation", async () => {
  const db = makeDb();
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await verifySitterReferralCode({ db, publicCode: created.publicCode });
  await revokeSitterReferralCode({
    db,
    codeId: created.referralCode.id,
    operatorUserId: operator.id,
    reason: "Withdraw public link.",
  });
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntentFromReferralCode({
        db,
        email: "new-client@example.com",
        phone: null,
        publicReferralCode: created.publicCode,
      }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("rotation rejects the old raw code and accepts the new raw code", async () => {
  const db = makeDb();
  const oldCode = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  const rotated = await rotateSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
    reason: "Replace public link.",
  });
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntentFromReferralCode({
        db,
        email: "new-client@example.com",
        phone: null,
        publicReferralCode: oldCode.publicCode,
      }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
  const intent = await resolveClientOriginWriteIntentFromReferralCode({
    db,
    email: "new-client@example.com",
    phone: null,
    publicReferralCode: rotated.publicCode,
  });
  assert.equal(intent.referringSitterId, sitter.id);
});

test("composed boundary rejects a malformed raw code generically", async () => {
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntentFromReferralCode({
        db: makeDb(),
        email: "new-client@example.com",
        phone: null,
        publicReferralCode: "bad-code",
      }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("composed verification preserves existing-client protection", async () => {
  const existingClient = {
    id: "existing-client",
    email: "existing@example.com",
    phone: null,
  };
  const db = makeDb({ clients: [existingClient] });
  const created = await createSitterReferralCode({
    db,
    sitterId: sitter.id,
    operatorUserId: operator.id,
  });
  await assert.rejects(
    () =>
      resolveClientOriginWriteIntentFromReferralCode({
        db,
        email: existingClient.email,
        phone: null,
        publicReferralCode: created.publicCode,
      }),
    (error) => error?.code === "CLIENT_ORIGIN_CONFLICT",
  );
});

test("browser-shaped fake referral cannot bypass verifier", async () => {
  const db = makeDb();
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntent({
        db,
        email: "new-client@example.com",
        phone: null,
        verifiedReferral: {
          sitterId: sitter.id,
          source: "REFERRAL_LINK",
        },
      }),
    REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
  );
});

test("foundation creates no codes automatically", () => {
  assert.equal(makeDb().state.referralCodes.size, 0);
});
