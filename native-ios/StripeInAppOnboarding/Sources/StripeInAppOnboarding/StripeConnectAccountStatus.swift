import Foundation

public enum StripeOnboardingStepStatus: String, Decodable, Equatable, Sendable {
    case complete
    case remaining
    case needsAttention = "needs_attention"
    case underReview = "under_review"
}

public struct StripeOnboardingStep: Decodable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var subtitle: String
    public var status: StripeOnboardingStepStatus
    public var outstandingRequirements: [String]

    public init(
        id: String,
        title: String,
        subtitle: String,
        status: StripeOnboardingStepStatus,
        outstandingRequirements: [String] = []
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.outstandingRequirements = outstandingRequirements
    }
}

public struct StripeOnboardingProgress: Decodable, Equatable, Sendable {
    public var progressPercent: Int
    public var completedStepCount: Int
    public var totalStepCount: Int
    public var steps: [StripeOnboardingStep]
    public var nextStepId: String?
    public var nextStepTitle: String?
    public var continueLabel: String
    public var setupPhase: String
    public var isUnderReview: Bool
    public var hasPastDueRequirements: Bool
    public var summaryMessage: String

    public init(
        progressPercent: Int = 0,
        completedStepCount: Int = 0,
        totalStepCount: Int = 5,
        steps: [StripeOnboardingStep] = [],
        nextStepId: String? = nil,
        nextStepTitle: String? = nil,
        continueLabel: String = "Set up payouts",
        setupPhase: String = "not_started",
        isUnderReview: Bool = false,
        hasPastDueRequirements: Bool = false,
        summaryMessage: String = "Set up payouts in a few quick steps — all inside Pluse."
    ) {
        self.progressPercent = progressPercent
        self.completedStepCount = completedStepCount
        self.totalStepCount = totalStepCount
        self.steps = steps
        self.nextStepId = nextStepId
        self.nextStepTitle = nextStepTitle
        self.continueLabel = continueLabel
        self.setupPhase = setupPhase
        self.isUnderReview = isUnderReview
        self.hasPastDueRequirements = hasPastDueRequirements
        self.summaryMessage = summaryMessage
    }
}

public struct StripeConnectAccountStatus: Decodable, Equatable, Sendable {
    public var accountId: String?
    public var detailsSubmitted: Bool
    public var chargesEnabled: Bool
    public var payoutsEnabled: Bool
    public var currentlyDue: [String]
    public var pastDue: [String]
    public var eventuallyDue: [String]
    public var pendingVerification: [String]
    public var disabledReason: String?
    public var remainingRequirements: [String]
    public var isReadyForPayouts: Bool
    public var progress: StripeOnboardingProgress

    public init(
        accountId: String? = nil,
        detailsSubmitted: Bool = false,
        chargesEnabled: Bool = false,
        payoutsEnabled: Bool = false,
        currentlyDue: [String] = [],
        pastDue: [String] = [],
        eventuallyDue: [String] = [],
        pendingVerification: [String] = [],
        disabledReason: String? = nil,
        remainingRequirements: [String] = [],
        isReadyForPayouts: Bool = false,
        progress: StripeOnboardingProgress = StripeOnboardingProgress()
    ) {
        self.accountId = accountId
        self.detailsSubmitted = detailsSubmitted
        self.chargesEnabled = chargesEnabled
        self.payoutsEnabled = payoutsEnabled
        self.currentlyDue = currentlyDue
        self.pastDue = pastDue
        self.eventuallyDue = eventuallyDue
        self.pendingVerification = pendingVerification
        self.disabledReason = disabledReason
        self.remainingRequirements = remainingRequirements
        self.isReadyForPayouts = isReadyForPayouts
        self.progress = progress
    }
}

public struct StripeConnectSetupValidation: Decodable, Equatable, Sendable {
    public var isSetupCorrect: Bool
    public var canReceivePayouts: Bool
    public var issues: [String]
    public var progress: StripeOnboardingProgress
    public var status: StripeConnectAccountStatus
}

public struct StripeConnectConfig: Decodable, Equatable, Sendable {
    public var publishableKey: String
    public var livemode: Bool
}

struct StripeConnectAccountSession: Decodable {
    var clientSecret: String
    var accountId: String?
}

struct StripeAPIErrorResponse: Decodable {
    var error: String
}
