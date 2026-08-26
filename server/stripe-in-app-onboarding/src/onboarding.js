/**
 * Stripe Connect in-app onboarding helpers.
 *
 * Account Links + Safari are the old path.
 * Account Sessions + the iOS StripeConnect SDK are the in-app path.
 */

import { buildOnboardingProgress, mapAccountStatus, validateSetupReadiness } from "./onboardingProgress.js";

export { buildOnboardingProgress, mapAccountStatus, validateSetupReadiness };

export const PLUSE_PRODUCT_DESCRIPTION =
  "Goods and services sold through the Plus platform";
export const PLUSE_BUSINESS_URL = "https://pluse.to";

export function buildConnectedAccountCreateParams({
  email,
  country = "US",
  businessType = "individual",
  userId,
  planId = "1",
  firstName,
  lastName,
} = {}) {
  if (!email) {
    throw new Error("email is required to create a connected account");
  }

  const params = {
    country,
    email,
    business_type: businessType,
    business_profile: {
      product_description: PLUSE_PRODUCT_DESCRIPTION,
      url: PLUSE_BUSINESS_URL,
    },
    controller: {
      requirement_collection: "application",
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "none" },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      created_via: "ios_embedded_onboarding",
      onboarding_surface: "ios_embedded",
      emmber_user_id: userId ? String(userId) : "",
      emmber_plan_id: String(planId),
    },
  };

  if (firstName || lastName) {
    params.individual = {
      email,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
    };
  }

  return params;
}

export function buildAccountSessionCreateParams(accountId, { collectBankAccount = true } = {}) {
  if (!accountId) {
    throw new Error("accountId is required to create an Account Session");
  }

  return {
    account: accountId,
    components: {
      account_onboarding: {
        enabled: true,
        features: {
          disable_stripe_user_authentication: true,
          external_account_collection: collectBankAccount,
        },
      },
    },
  };
}

export function createOnboardingService({ stripe, accountsByUserId }) {
  if (!stripe) {
    throw new Error("stripe client is required");
  }

  const store = accountsByUserId || new Map();

  async function ensureConnectedAccount({
    userId,
    email,
    country,
    businessType,
    existingAccountId,
    planId,
    firstName,
    lastName,
  }) {
    if (existingAccountId) {
      store.set(userId, existingAccountId);
      return existingAccountId;
    }

    const cached = store.get(userId);
    if (cached) {
      return cached;
    }

    const account = await stripe.accounts.create(
      buildConnectedAccountCreateParams({
        email,
        country,
        businessType,
        userId,
        planId,
        firstName,
        lastName,
      })
    );
    store.set(userId, account.id);
    return account.id;
  }

  async function createAccountSession(user) {
    const accountId = await ensureConnectedAccount(user);
    const session = await stripe.accountSessions.create(
      buildAccountSessionCreateParams(accountId)
    );

    if (!session?.client_secret) {
      throw new Error("Stripe Account Session did not return a client_secret");
    }

    return {
      accountId,
      clientSecret: session.client_secret,
      expiresAt: session.expires_at ?? null,
    };
  }

  async function getAccountStatus({ userId, existingAccountId }) {
    const accountId = existingAccountId || store.get(userId);
    if (!accountId) {
      return {
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        currentlyDue: [],
        pastDue: [],
        eventuallyDue: [],
        pendingVerification: [],
        disabledReason: null,
        isReadyForPayouts: false,
        progress: buildOnboardingProgress({ requirements: {} }),
      };
    }

    const account = await stripe.accounts.retrieve(accountId);
    return mapAccountStatus(account);
  }

  async function validateAccountSetup({ userId, existingAccountId }) {
    const accountId = existingAccountId || store.get(userId);
    if (!accountId) {
      return {
        isSetupCorrect: false,
        canReceivePayouts: false,
        issues: ["No Stripe connected account is linked to this host."],
        progress: buildOnboardingProgress({ requirements: {} }),
        status: {
          accountId: null,
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          currentlyDue: [],
          pastDue: [],
          eventuallyDue: [],
          pendingVerification: [],
          disabledReason: null,
          isReadyForPayouts: false,
          progress: buildOnboardingProgress({ requirements: {} }),
        },
      };
    }

    const account = await stripe.accounts.retrieve(accountId);
    return validateSetupReadiness(account);
  }

  function rememberAccountFromWebhook(account) {
    const userId = account?.metadata?.emmber_user_id;
    if (userId && account.id) {
      store.set(userId, account.id);
    }
    return userId ? mapAccountStatus(account) : null;
  }

  return {
    ensureConnectedAccount,
    createAccountSession,
    getAccountStatus,
    validateAccountSetup,
    rememberAccountFromWebhook,
  };
}

export function parseBearerToken(header) {
  if (!header || typeof header !== "string") {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
