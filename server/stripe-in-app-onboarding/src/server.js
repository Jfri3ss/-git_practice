import express from "express";
import Stripe from "stripe";
import { createOnboardingService, parseBearerToken } from "./onboarding.js";

export function createStripeClient(secretKey = process.env.STRIPE_SECRET_KEY) {
  if (!secretKey) {
    throw new Error("Set STRIPE_SECRET_KEY before starting the Account Session server.");
  }
  return new Stripe(secretKey);
}

export function createApp({
  authenticate = defaultAuthenticate,
  onboardingService,
} = {}) {
  if (!onboardingService) {
    onboardingService = createOnboardingService({ stripe: createStripeClient() });
  }
  const app = express();
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
      });
      res.json({
        clientSecret: result.clientSecret,
        accountId: result.accountId,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message });
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
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message });
    }
  });

  return app;
}

function defaultAuthenticate(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    const error = new Error("Authorization Bearer token is required");
    error.statusCode = 401;
    throw error;
  }

  // Replace this with the real Pluse session lookup.
  // The iOS app should send the logged-in host/creator identity, not a Stripe account id.
  return {
    id: token,
    email: process.env.DEMO_USER_EMAIL || "host@example.com",
    country: process.env.DEMO_USER_COUNTRY || "US",
    businessType: process.env.DEMO_USER_BUSINESS_TYPE || "individual",
    stripeAccountId: process.env.DEMO_STRIPE_ACCOUNT_ID || undefined,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.js");
if (isMain) {
  const port = Number(process.env.PORT || 4242);
  createApp().listen(port, () => {
    console.log(`Stripe in-app onboarding API listening on ${port}`);
  });
}
