import Foundation

public struct StripeConnectAccountStatus: Decodable, Equatable, Sendable {
    public var accountId: String?
    public var detailsSubmitted: Bool
    public var chargesEnabled: Bool
    public var payoutsEnabled: Bool
    public var currentlyDue: [String]
    public var pastDue: [String]
    public var disabledReason: String?
    public var isReadyForPayouts: Bool

    public init(
        accountId: String? = nil,
        detailsSubmitted: Bool = false,
        chargesEnabled: Bool = false,
        payoutsEnabled: Bool = false,
        currentlyDue: [String] = [],
        pastDue: [String] = [],
        disabledReason: String? = nil,
        isReadyForPayouts: Bool = false
    ) {
        self.accountId = accountId
        self.detailsSubmitted = detailsSubmitted
        self.chargesEnabled = chargesEnabled
        self.payoutsEnabled = payoutsEnabled
        self.currentlyDue = currentlyDue
        self.pastDue = pastDue
        self.disabledReason = disabledReason
        self.isReadyForPayouts = isReadyForPayouts
    }

    public var remainingRequirements: [String] {
        Array(Set(currentlyDue + pastDue)).sorted()
    }
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
