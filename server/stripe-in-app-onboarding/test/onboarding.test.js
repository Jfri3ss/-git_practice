import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAccountSessionCreateParams,
  buildConnectedAccountCreateParams,
  createOnboardingService,
  mapAccountStatus,
  parseBearerToken,
} from "../src/onboarding.js";
import { createApp } from "../src/server.js";
import { createFileAccountStore } from "../src/store.js";

test("connected accounts match the existing Pluse Connect controller", () => {
  const params = buildConnectedAccountCreateParams({
    email: "host@pluse.to",
    country: "US",
    userId: "100023",
  });

  assert.equal(params.controller.requirement_collection, "application");
  assert.equal(params.controller.stripe_dashboard.type, "none");
  assert.equal(params.capabilities.transfers.requested, true);
  assert.equal(params.capabilities.card_payments.requested, true);
  assert.equal(params.metadata.onboarding_surface, "ios_embedded");
  assert.equal(params.metadata.created_via, "ios_embedded_onboarding");
  assert.equal(params.metadata.emmber_user_id, "100023");
  assert.equal(params.business_profile.url, "https://pluse.to");
});

test("account session enables in-app onboarding without Stripe login", () => {
  const params = buildAccountSessionCreateParams("acct_123");

  assert.equal(params.account, "acct_123");
  assert.equal(params.components.account_onboarding.enabled, true);
  assert.equal(
    params.components.account_onboarding.features.disable_stripe_user_authentication,
    true
  );
  assert.equal(
    params.components.account_onboarding.features.external_account_collection,
    true
  );
});

test("account session requires an account id", () => {
  assert.throws(() => buildAccountSessionCreateParams(""), /accountId is required/);
});

test("status mapping treats empty requirements as ready for payouts", () => {
  const status = mapAccountStatus({
    id: "acct_ready",
    details_submitted: true,
    charges_enabled: false,
    payouts_enabled: true,
    requirements: { currently_due: [], past_due: [] },
  });

  assert.equal(status.isReadyForPayouts, true);
  assert.equal(status.accountId, "acct_ready");
});

test("status mapping stays incomplete when Stripe still needs fields", () => {
  const status = mapAccountStatus({
    id: "acct_pending",
    details_submitted: true,
    charges_enabled: false,
    payouts_enabled: false,
    requirements: { currently_due: ["external_account"], past_due: [] },
  });

  assert.equal(status.isReadyForPayouts, false);
  assert.deepEqual(status.currentlyDue, ["external_account"]);
});

test("createAccountSession uses Account Sessions, not Account Links", async () => {
  const calls = [];
  const stripe = {
    accounts: {
      create: async (params) => {
        calls.push(["accounts.create", params]);
        return { id: "acct_new" };
      },
      retrieve: async () => {
        throw new Error("retrieve should not run in this test");
      },
    },
    accountSessions: {
      create: async (params) => {
        calls.push(["accountSessions.create", params]);
        return { client_secret: "accs_secret_123", expires_at: 1_700_000_000 };
      },
    },
    accountLinks: {
      create: async () => {
        throw new Error("Account Links must not be used for in-app onboarding");
      },
    },
  };

  const service = createOnboardingService({ stripe });
  const result = await service.createAccountSession({
    userId: "user_1",
    email: "host@pluse.to",
  });

  assert.equal(result.accountId, "acct_new");
  assert.equal(result.clientSecret, "accs_secret_123");
  assert.equal(calls[0][0], "accounts.create");
  assert.equal(calls[1][0], "accountSessions.create");
  assert.equal(calls[1][1].components.account_onboarding.enabled, true);
});

test("existing connected accounts are reused", async () => {
  let created = 0;
  const stripe = {
    accounts: {
      create: async () => {
        created += 1;
        return { id: "acct_should_not_create" };
      },
    },
    accountSessions: {
      create: async (params) => ({
        client_secret: `secret-for-${params.account}`,
      }),
    },
  };

  const service = createOnboardingService({ stripe });
  const result = await service.createAccountSession({
    userId: "user_existing",
    email: "host@pluse.to",
    existingAccountId: "acct_existing",
  });

  assert.equal(created, 0);
  assert.equal(result.accountId, "acct_existing");
  assert.equal(result.clientSecret, "secret-for-acct_existing");
});

test("status is empty when the user has no connected account yet", async () => {
  const service = createOnboardingService({
    stripe: {
      accounts: {
        retrieve: async () => {
          throw new Error("should not retrieve");
        },
      },
    },
  });

  const status = await service.getAccountStatus({ userId: "unknown" });
  assert.equal(status.accountId, null);
  assert.equal(status.isReadyForPayouts, false);
});

test("file store persists the user-to-account mapping", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "pluse-stripe-")), "accounts.json");
  const store = createFileAccountStore(filePath);
  store.set("100023", "acct_persisted");

  const reloaded = createFileAccountStore(filePath);
  assert.equal(reloaded.get("100023"), "acct_persisted");
  assert.match(readFileSync(filePath, "utf8"), /acct_persisted/);
});

test("webhook remembers the connected account from emmber_user_id", () => {
  const store = new Map();
  const service = createOnboardingService({
    stripe: {},
    accountsByUserId: store,
  });

  const status = service.rememberAccountFromWebhook({
    id: "acct_hook",
    details_submitted: false,
    charges_enabled: false,
    payouts_enabled: false,
    metadata: { emmber_user_id: "100023" },
    requirements: { currently_due: ["external_account"], past_due: [] },
  });

  assert.equal(store.get("100023"), "acct_hook");
  assert.equal(status.accountId, "acct_hook");
});

test("HTTP account-session endpoint returns a client secret", async () => {
  const stripe = {
    accounts: {
      create: async () => ({ id: "acct_http" }),
    },
    accountSessions: {
      create: async () => ({ client_secret: "accs_http" }),
    },
  };
  const service = createOnboardingService({ stripe });
  const app = createApp({
    onboardingService: service,
    authenticate: () => ({
      id: "user_http",
      email: "host@pluse.to",
    }),
  });

  const { status, body } = await request(app, {
    method: "POST",
    path: "/connect/account-session",
  });

  assert.equal(status, 200);
  assert.equal(body.clientSecret, "accs_http");
  assert.equal(body.accountId, "acct_http");
});

test("HTTP account-status endpoint reports payout readiness", async () => {
  const stripe = {
    accounts: {
      retrieve: async (id) => ({
        id,
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [], past_due: [] },
      }),
    },
  };
  const store = new Map([["user_status", "acct_status"]]);
  const service = createOnboardingService({ stripe, accountsByUserId: store });
  const app = createApp({
    onboardingService: service,
    authenticate: () => ({ id: "user_status", email: "host@pluse.to" }),
  });

  const { status, body } = await request(app, {
    method: "GET",
    path: "/connect/account-status",
  });

  assert.equal(status, 200);
  assert.equal(body.isReadyForPayouts, true);
});

test("HTTP config returns the publishable key for the iOS SDK", async () => {
  const app = createApp({
    onboardingService: { createAccountSession: async () => ({}) },
    publishableKey: "pk_test_123",
  });

  const { status, body } = await request(app, {
    method: "GET",
    path: "/connect/config",
  });

  assert.equal(status, 200);
  assert.equal(body.publishableKey, "pk_test_123");
  assert.equal(body.livemode, false);
});

test("HTTP webhook accepts account.updated without a signing secret in tests", async () => {
  const store = new Map();
  const service = createOnboardingService({ stripe: {}, accountsByUserId: store });
  const app = createApp({ onboardingService: service });

  const { status, body } = await request(app, {
    method: "POST",
    path: "/connect/webhook",
    json: {
      type: "account.updated",
      data: {
        object: {
          id: "acct_webhook",
          metadata: { emmber_user_id: "55" },
          details_submitted: false,
          requirements: { currently_due: [], past_due: [] },
        },
      },
    },
  });

  assert.equal(status, 200);
  assert.equal(body.received, true);
  assert.equal(store.get("55"), "acct_webhook");
});

test("HTTP account-session rejects a missing user session", async () => {
  const app = createApp({
    onboardingService: {
      createAccountSession: async () => {
        throw new Error("should not create a session without auth");
      },
    },
  });

  const { status, body } = await request(app, {
    method: "POST",
    path: "/connect/account-session",
  });

  assert.equal(status, 401);
  assert.match(body.error, /Authorization Bearer token is required/);
});

test("parseBearerToken reads the iOS Authorization header", () => {
  assert.equal(parseBearerToken("Bearer abc.def"), "abc.def");
  assert.equal(parseBearerToken("basic abc"), null);
  assert.equal(parseBearerToken(), null);
});

async function request(app, { method, path, json }) {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: json ? { "content-type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : undefined,
    });
    const body = await response.json();
    return { status: response.status, body };
  } finally {
    server.close();
    await once(server, "close");
  }
}
