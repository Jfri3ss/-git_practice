/**
 * Maps Stripe Connect requirement keys to host-friendly onboarding steps.
 * Used to show progress in the iOS app and to decide when setup is truly complete.
 */

export const ONBOARDING_STEPS = [
  {
    id: "business",
    title: "Business profile",
    subtitle: "Tell Stripe what you sell on Pluse",
    patterns: ["business_profile"],
  },
  {
    id: "personal",
    title: "Personal details",
    subtitle: "Name, birthdate, address, and phone",
    patterns: [
      "individual.first_name",
      "individual.last_name",
      "individual.address",
      "individual.dob",
      "individual.phone",
    ],
  },
  {
    id: "identity",
    title: "Identity verification",
    subtitle: "Confirm your identity securely",
    patterns: [
      "individual.ssn",
      "individual.id_number",
      "verification.document",
      "verification.additional_document",
    ],
  },
  {
    id: "bank",
    title: "Payout bank account",
    subtitle: "Where we send your earnings",
    patterns: ["external_account"],
  },
  {
    id: "terms",
    title: "Terms agreement",
    subtitle: "Accept Stripe payout terms",
    patterns: ["tos_acceptance"],
  },
];

const STEP_ORDER = ONBOARDING_STEPS.map((step) => step.id);

function matchesPattern(requirement, pattern) {
  return requirement === pattern || requirement.startsWith(`${pattern}.`);
}

function stepMatchesRequirement(step, requirement) {
  return step.patterns.some((pattern) => matchesPattern(requirement, pattern));
}

function unique(values) {
  return [...new Set(values)];
}

export function buildOnboardingProgress(account) {
  if (!account?.id) {
    return {
      progressPercent: 0,
      completedStepCount: 0,
      totalStepCount: ONBOARDING_STEPS.length,
      steps: ONBOARDING_STEPS.map((definition) => ({
        id: definition.id,
        title: definition.title,
        subtitle: definition.subtitle,
        status: "remaining",
        outstandingRequirements: [],
      })),
      nextStepId: ONBOARDING_STEPS[0]?.id ?? null,
      nextStepTitle: ONBOARDING_STEPS[0]?.title ?? null,
      continueLabel: `Continue: ${ONBOARDING_STEPS[0]?.title ?? "Payout setup"}`,
      setupPhase: "not_started",
      isUnderReview: false,
      hasPastDueRequirements: false,
      summaryMessage:
        "Set up payouts in a few quick steps — all inside Pluse, no browser required.",
    };
  }

  const requirements = account.requirements || {};
  const currentlyDue = requirements.currently_due || [];
  const pastDue = requirements.past_due || [];
  const eventuallyDue = requirements.eventually_due || [];
  const pendingVerification = requirements.pending_verification || [];

  const outstanding = unique([...currentlyDue, ...pastDue, ...eventuallyDue]);
  const steps = ONBOARDING_STEPS.map((definition) => {
    const matchingOutstanding = outstanding.filter((req) =>
      stepMatchesRequirement(definition, req)
    );
    const matchingPastDue = pastDue.filter((req) => stepMatchesRequirement(definition, req));
    const matchingPending = pendingVerification.filter((req) =>
      stepMatchesRequirement(definition, req)
    );

    let status = "complete";
    if (matchingPastDue.length > 0) {
      status = "needs_attention";
    } else if (matchingOutstanding.length > 0) {
      status = "remaining";
    } else if (matchingPending.length > 0) {
      status = "under_review";
    }

    return {
      id: definition.id,
      title: definition.title,
      subtitle: definition.subtitle,
      status,
      outstandingRequirements: matchingOutstanding,
    };
  });

  const completedCount = steps.filter((step) => step.status === "complete").length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const nextStep = steps.find((step) => step.status !== "complete");
  const hasOutstandingRequirements = outstanding.length > 0;
  const hasPastDue = pastDue.length > 0;
  const isUnderReview =
    Boolean(account?.details_submitted) &&
    !Boolean(account?.payouts_enabled) &&
    !hasOutstandingRequirements &&
    pendingVerification.length > 0;

  let setupPhase = "not_started";
  if (account?.payouts_enabled && !hasPastDue && !hasOutstandingRequirements) {
    setupPhase = "complete";
  } else if (isUnderReview) {
    setupPhase = "under_review";
  } else if (account?.id || completedCount > 0 || hasOutstandingRequirements) {
    setupPhase = "in_progress";
  }

  return {
    progressPercent,
    completedStepCount: completedCount,
    totalStepCount: steps.length,
    steps,
    nextStepId: nextStep?.id ?? null,
    nextStepTitle: nextStep?.title ?? null,
    continueLabel: nextStep ? `Continue: ${nextStep.title}` : "Review payout setup",
    setupPhase,
    isUnderReview,
    hasPastDueRequirements: hasPastDue,
    summaryMessage: buildSummaryMessage({
      setupPhase,
      nextStep,
      hasPastDue,
      isUnderReview,
      progressPercent,
    }),
  };
}

function buildSummaryMessage({
  setupPhase,
  nextStep,
  hasPastDue,
  isUnderReview,
  progressPercent,
}) {
  switch (setupPhase) {
    case "complete":
      return "You're all set. Payouts are enabled and this account can receive earnings.";
    case "under_review":
      return "Stripe is reviewing your details. We'll update this screen when payouts are ready.";
    case "in_progress":
      if (hasPastDue && nextStep) {
        return `Action needed on ${nextStep.title}. You're ${progressPercent}% done — finish here to keep selling on Pluse.`;
      }
      if (nextStep) {
        return `You're ${progressPercent}% done. Next up: ${nextStep.title}.`;
      }
      return `You're ${progressPercent}% done. Continue payout setup to start earning.`;
    default:
      return "Set up payouts in a few quick steps — all inside Pluse, no browser required.";
  }
}

export function validateSetupReadiness(account) {
  const status = mapAccountStatus(account);
  const progress = buildOnboardingProgress(account);

  const issues = [];
  if (!status.accountId) {
    issues.push("No Stripe connected account is linked to this host.");
  }
  if (progress.hasPastDueRequirements) {
    issues.push("Stripe marked required payout information as past due.");
  }
  if (!status.detailsSubmitted && progress.setupPhase !== "not_started") {
    issues.push("Stripe has not received the full payout profile yet.");
  }
  if (!status.payoutsEnabled && progress.setupPhase !== "under_review") {
    issues.push("Payouts are not enabled on this connected account.");
  }
  const remainingRequirements = unique([...status.currentlyDue, ...status.pastDue]);
  if (remainingRequirements.length > 0) {
    issues.push(
      `Stripe still needs: ${remainingRequirements
        .slice(0, 3)
        .join(", ")}${remainingRequirements.length > 3 ? "…" : ""}`
    );
  }

  return {
    isSetupCorrect: status.isReadyForPayouts,
    canReceivePayouts: status.isReadyForPayouts,
    issues,
    progress,
    status,
  };
}

export function mapAccountStatus(account) {
  if (!account || !account.id) {
    throw new Error("account is required");
  }

  const requirements = account.requirements || {};
  const currentlyDue = requirements.currently_due || [];
  const pastDue = requirements.past_due || [];
  const eventuallyDue = requirements.eventually_due || [];
  const pendingVerification = requirements.pending_verification || [];
  const progress = buildOnboardingProgress(account);

  return {
    accountId: account.id,
    detailsSubmitted: Boolean(account.details_submitted),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    currentlyDue,
    pastDue,
    eventuallyDue,
    pendingVerification,
    disabledReason: requirements.disabled_reason || null,
    remainingRequirements: unique([...currentlyDue, ...pastDue]),
    isReadyForPayouts:
      Boolean(account.details_submitted) &&
      Boolean(account.payouts_enabled) &&
      currentlyDue.length === 0 &&
      pastDue.length === 0,
    progress,
  };
}
