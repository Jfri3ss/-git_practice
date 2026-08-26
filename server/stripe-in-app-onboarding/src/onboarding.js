/**
 * Stripe Connect in-app onboarding helpers.
 *
 * Account Links + Safari are the old path.
 * Account Sessions + the iOS StripeConnect SDK are the in-app path.
 *
 * disable_stripe_user_authentication can only be true when the platform
 * collects requirements (controller.requirement_collection = "application").
 * That is what keeps Stripe from showing an ASWebAuthenticationSession login.
 */

export function buildConnectedAccountCreateParams({
  email,
  country = "US",
  businessType = "individual",
} = {}) {
  if (!email) {
    throw new Error("email is required to create a connected account");
  }

  return {
    country,
    email,
    business_type: businessType,
    controller: {
      requirement_collection: "application",
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "none" },
    },
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      onboarding_surface: "ios_embedded",
    },
  };
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
          // Required to keep KYC inside the app instead of a Stripe login popover.
          disable_stripe_user_authentication: true,
          external_account_collection: collectBankAccount,
        },
      },
    },
  };
}

export function mapAccountStatus(account) {
  if (!account || !account.id) {
    throw new Error("account is required");
  }

  const requirements = account.requirements || {};
  const currentlyDue = requirements.currently_due || [];
  const pastDue = requirements.past_due || [];

  return {
    accountId: account.id,
    detailsSubmitted: Boolean(account.details_submitted),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    currentlyDue,
    pastDue,
    isReadyForPayouts:
      Boolean(account.details_submitted) &&
      Boolean(account.payouts_enabled) &&
      currentlyDue.length === 0 &&
      pastDue.length === 0,
  };
}

export function createOnboardingService({ stripe, accountsByUserId }) {
  if (!stripe) {
    throw new Error("stripe client is required");
  }

  const store = accountsByUserId || new Map();

  async function ensureConnectedAccount({ userId, email, country, businessType, existingAccountId }) {
    if (existingAccountId) {
      store.set(userId, existingAccountId);
      return existingAccountId;
    }

    const cached = store.get(userId);
    if (cached) {
      return cached;
    }

    const account = await stripe.accounts.create(
      buildConnectedAccountCreateParams({ email, country, businessType })
    );
    store.set(userId, account.id);
    return account.id;
  }

  async function createAccountSession({ userId, email, country, businessType, existingAccountId }) {
    const accountId = await ensureConnectedAccount({
      userId,
      email,
      country,
      businessType,
      existingAccountId,
    });
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
      throw new Error("No connected account is linked to this user");
    }

    const account = await stripe.accounts.retrieve(accountId);
    return mapAccountStatus(account);
  }

  return {
    ensureConnectedAccount,
    createAccountSession,
    getAccountStatus,
  };
}

export function parseBearerToken(header) {
  if (!header || typeof header !== "string") {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
