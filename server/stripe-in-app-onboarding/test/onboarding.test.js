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
import { buildOnboardingProgress, validateSetupReadiness } from "../src/onboardingProgress.js";
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
});

test("account session enables in-app onboarding without Stripe login", () => {
  const params = buildAccountSessionCreateParams("acct_123");
  assert.equal(params.components.account_onboarding.features.disable_stripe_user_authentication, true);
});

test("progress starts at zero before a connected account exists", () => {
  const progress = buildOnboardingProgress({ requirements: {} });
  assert.equal(progress.progressPercent, 0);
  assert.equal(progress.setupPhase, "not_started");
  assert.equal(progress.steps.every((step) => step.status === "remaining"), true);
});

test("progress maps Pluse payout requirements into friendly steps", () => {
  const progress = buildOnboardingProgress({
    id: "acct_demo",
    details_submitted: false,
    payouts_enabled: false,
    requirements: {
      currently_due: [
        "business_profile.mcc",
        "external_account",
        "individual.address.city",
        "tos_acceptance.date",
      ],
      past_due: [],
      eventually_due: [
        "business_profile.mcc",
        "external_account",
        "individual.address.city",
        "tos_acceptance.date",
      ],
    },
  });

  assert.equal(progress.progressPercent, 20);
  assert.equal(progress.nextStepId, "business");
  assert.match(progress.continueLabel, /Business profile/);
  assert.equal(progress.steps.find((step) => step.id === "bank")?.status, "remaining");
});

test("setup validation flags incomplete payout setup", () => {
  const validation = validateSetupReadiness({
    id: "acct_pending",
    details_submitted: false,
    payouts_enabled: false,
    requirements: {
      currently_due: ["external_account"],
      past_due: [],
    },
  });

  assert.equal(validation.isSetupCorrect, false);
  assert.equal(validation.canReceivePayouts, false);
  assert.ok(validation.issues.length > 0);
  assert.equal(validation.progress.setupPhase, "in_progress");
});

test("setup validation passes when payouts are fully enabled", () => {
  const validation = validateSetupReadiness({
    id: "acct_ready",
    details_submitted: true,
    payouts_enabled: true,
    requirements: { currently_due: [], past_due: [] },
  });

  assert.equal(validation.isSetupCorrect, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.progress.setupPhase, "complete");
});

test("status mapping treats empty requirements as ready for payouts", () => {
  const status = mapAccountStatus({
    id: "acct_ready",
    details_submitted: true,
    payouts_enabled: true,
    requirements: { currently_due: [], past_due: [] },
  });

  assert.equal(status.isReadyForPayouts, true);
  assert.equal(status.progress.setupPhase, "complete");
});

test("createAccountSession uses Account Sessions, not Account Links", async () => {
  const stripe = {
    accounts: {
      create: async () => ({ id: "acct_new" }),
    },
    accountSessions: {
      create: async () => ({ client_secret: "accs_secret_123" }),
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

  assert.equal(result.clientSecret, "accs_secret_123");
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
  assert.equal(status.progress.progressPercent, 0);
});

test("file store persists the user-to-account mapping", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "pluse-stripe-")), "accounts.json");
  const store = createFileAccountStore(filePath);
  store.set("100023", "acct_persisted");

  const reloaded = createFileAccountStore(filePath);
  assert.equal(reloaded.get("100023"), "acct_persisted");
  assert.match(readFileSync(filePath, "utf8"), /acct_persisted/);
});

test("HTTP setup-validation endpoint reports payout readiness issues", async () => {
  const stripe = {
    accounts: {
      retrieve: async (id) => ({
        id,
        details_submitted: false,
        payouts_enabled: false,
        requirements: { currently_due: ["external_account"], past_due: [] },
      }),
    },
  };
  const store = new Map([["user_validate", "acct_validate"]]);
  const service = createOnboardingService({ stripe, accountsByUserId: store });
  const app = createApp({
    onboardingService: service,
    authenticate: () => ({ id: "user_validate", email: "host@pluse.to" }),
  });

  const { status, body } = await request(app, {
    method: "GET",
    path: "/connect/setup-validation",
  });

  assert.equal(status, 200);
  assert.equal(body.isSetupCorrect, false);
  assert.ok(body.issues.length > 0);
  assert.equal(body.progress.nextStepId, "bank");
});

test("HTTP account-status includes progress payload", async () => {
  const stripe = {
    accounts: {
      retrieve: async (id) => ({
        id,
        details_submitted: false,
        payouts_enabled: false,
        requirements: {
          currently_due: ["external_account"],
          past_due: [],
          eventually_due: ["external_account"],
        },
      }),
    },
  };
  const store = new Map([["user_progress", "acct_progress"]]);
  const service = createOnboardingService({ stripe, accountsByUserId: store });
  const app = createApp({
    onboardingService: service,
    authenticate: () => ({ id: "user_progress", email: "host@pluse.to" }),
  });

  const { status, body } = await request(app, {
    method: "GET",
    path: "/connect/account-status",
  });

  assert.equal(status, 200);
  assert.equal(body.progress.progressPercent, 80);
  assert.ok(Array.isArray(body.progress.steps));
});

test("parseBearerToken reads the iOS Authorization header", () => {
  assert.equal(parseBearerToken("Bearer abc.def"), "abc.def");
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
