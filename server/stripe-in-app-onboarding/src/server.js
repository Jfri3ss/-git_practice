import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Stripe from "stripe";
import { createOnboardingService, parseBearerToken } from "./onboarding.js";
import { createFileAccountStore } from "./store.js";

export function createStripeClient(secretKey = process.env.STRIPE_SECRET_KEY) {
  if (!secretKey) {
    throw new Error("Set STRIPE_SECRET_KEY before starting the Account Session server.");
  }
  return new Stripe(secretKey);
}

export function createDefaultOnboardingService({
  stripe = createStripeClient(),
  storePath = process.env.ACCOUNT_STORE_PATH ||
    resolve(dirname(fileURLToPath(import.meta.url)), "../data/accounts.json"),
} = {}) {
  return createOnboardingService({
    stripe,
    accountsByUserId: createFileAccountStore(storePath),
  });
}

export function createApp({
  authenticate = defaultAuthenticate,
  onboardingService,
  publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "",
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "",
  stripe = null,
} = {}) {
  if (!onboardingService) {
    onboardingService = createDefaultOnboardingService();
  }

  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true, surface: "ios_embedded" });
  });

  app.get("/connect/config", (_req, res) => {
    if (!publishableKey) {
      res.status(500).json({ error: "STRIPE_PUBLISHABLE_KEY is not configured" });
      return;
    }
    res.json({
      publishableKey,
      livemode: publishableKey.startsWith("pk_live_"),
    });
  });

  app.post(
    "/connect/webhook",
    express.raw({ type: "application/json" }),
    (req, res) => {
      try {
        const payload = verifyWebhook(req, stripe, webhookSecret);
        if (payload?.type === "account.updated" && payload.data?.object) {
          onboardingService.rememberAccountFromWebhook(payload.data.object);
        }
        res.json({ received: true });
      } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  app.use(express.json());

  app.post("/connect/account-session", async (req, res) => {
    try {
      const user = authenticate(req);
      const result = await onboardingService.createAccountSession({
        userId: user.id,
        email: user.email,
        country: user.country,
        businessType: user.businessType,
        existingAccountId: user.stripeAccountId,
        planId: user.planId,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      res.json({
        clientSecret: result.clientSecret,
        accountId: result.accountId,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.get("/connect/account-status", async (req, res) => {
    try {
      const user = authenticate(req);
      const status = await onboardingService.getAccountStatus({
        userId: user.id,
        existingAccountId: user.stripeAccountId,
      });
      res.json(status);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.get("/connect/setup-validation", async (req, res) => {
    try {
      const user = authenticate(req);
      const validation = await onboardingService.validateAccountSetup({
        userId: user.id,
        existingAccountId: user.stripeAccountId,
      });
      res.json(validation);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return app;
}

export function verifyWebhook(req, stripe, webhookSecret) {
  const payload = req.body;
  if (webhookSecret) {
    if (!stripe) {
      const error = new Error("Stripe client is required to verify webhooks");
      error.statusCode = 500;
      throw error;
    }
    const signature = req.headers["stripe-signature"];
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  if (Buffer.isBuffer(payload)) {
    return JSON.parse(payload.toString("utf8"));
  }
  return payload;
}

function defaultAuthenticate(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    const error = new Error("Authorization Bearer token is required");
    error.statusCode = 401;
    throw error;
  }

  // Replace this with the real Pluse session lookup.
  // The iOS app should send the logged-in host/creator identity.
  return {
    id: process.env.DEMO_USER_ID || token,
    email: process.env.DEMO_USER_EMAIL || "host@example.com",
    country: process.env.DEMO_USER_COUNTRY || "US",
    businessType: process.env.DEMO_USER_BUSINESS_TYPE || "individual",
    stripeAccountId: process.env.DEMO_STRIPE_ACCOUNT_ID || undefined,
    planId: process.env.DEMO_PLAN_ID || "1",
    firstName: process.env.DEMO_FIRST_NAME || undefined,
    lastName: process.env.DEMO_LAST_NAME || undefined,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.js");
if (isMain) {
  const port = Number(process.env.PORT || 4242);
  createApp().listen(port, () => {
    console.log(`Stripe in-app onboarding API listening on ${port}`);
  });
}
