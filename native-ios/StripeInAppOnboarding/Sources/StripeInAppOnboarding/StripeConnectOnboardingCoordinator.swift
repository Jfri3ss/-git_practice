import StripeConnect
import UIKit

/// Presents Stripe Connect onboarding inside the iOS app.
///
/// Replaces Account Links opened in Safari / `ASWebAuthenticationSession`.
/// Stripe's `AccountOnboardingController` is a full-screen in-app controller.
@MainActor
public final class StripeConnectOnboardingCoordinator: NSObject, AccountOnboardingControllerDelegate {
    public struct Configuration {
        public var publishableKey: String?
        public var backendBaseURL: URL
        public var authToken: String
        public var title: String
        public var fullTermsOfServiceURL: URL?
        public var recipientTermsOfServiceURL: URL?
        public var privacyPolicyURL: URL?
        public var collectEventuallyDue: Bool

        public init(
            publishableKey: String? = nil,
            backendBaseURL: URL,
            authToken: String,
            title: String = "Set up payouts",
            fullTermsOfServiceURL: URL? = nil,
            recipientTermsOfServiceURL: URL? = nil,
            privacyPolicyURL: URL? = nil,
            collectEventuallyDue: Bool = true
        ) {
            self.publishableKey = publishableKey
            self.backendBaseURL = backendBaseURL
            self.authToken = authToken
            self.title = title
            self.fullTermsOfServiceURL = fullTermsOfServiceURL
            self.recipientTermsOfServiceURL = recipientTermsOfServiceURL
            self.privacyPolicyURL = privacyPolicyURL
            self.collectEventuallyDue = collectEventuallyDue
        }
    }

    private let configuration: Configuration
    private let api: StripeConnectAPIClient
    private var embeddedComponentManager: EmbeddedComponentManager?
    private var onExit: ((Result<StripeConnectAccountStatus, Error>) -> Void)?

    public init(configuration: Configuration) {
        self.configuration = configuration
        self.api = StripeConnectAPIClient(
            backendBaseURL: configuration.backendBaseURL,
            authToken: configuration.authToken
        )
        super.init()
    }

    public func fetchStatus() async throws -> StripeConnectAccountStatus {
        try await api.fetchAccountStatus()
    }

    public func present(
        from viewController: UIViewController,
        completion: @escaping (Result<StripeConnectAccountStatus, Error>) -> Void
    ) {
        onExit = completion

        Task {
            do {
                let publishableKey = try await resolvePublishableKey()
                presentOnboarding(from: viewController, publishableKey: publishableKey)
            } catch {
                onExit?(.failure(error))
                onExit = nil
            }
        }
    }

    private func resolvePublishableKey() async throws -> String {
        if let publishableKey = configuration.publishableKey, !publishableKey.isEmpty {
            return publishableKey
        }
        let config = try await api.fetchConfig()
        guard !config.publishableKey.isEmpty else {
            throw StripeConnectOnboardingError.missingPublishableKey
        }
        return config.publishableKey
    }

    private func presentOnboarding(from viewController: UIViewController, publishableKey: String) {
        let apiClient = STPAPIClient(publishableKey: publishableKey)
        let manager = EmbeddedComponentManager(
            apiClient: apiClient,
            appearance: Self.pluseAppearance(),
            fetchClientSecret: { [api] in
                try? await api.fetchAccountSession()
            }
        )
        embeddedComponentManager = manager

        var collectionOptions = AccountCollectionOptions()
        if configuration.collectEventuallyDue {
            collectionOptions.fields = .eventuallyDue
            collectionOptions.futureRequirements = .include
        }

        let controller = manager.createAccountOnboardingController(
            fullTermsOfServiceUrl: configuration.fullTermsOfServiceURL,
            recipientTermsOfServiceUrl: configuration.recipientTermsOfServiceURL,
            privacyPolicyUrl: configuration.privacyPolicyURL,
            collectionOptions: collectionOptions
        )
        controller.delegate = self
        controller.title = configuration.title
        controller.present(from: viewController)
    }

    public func accountOnboardingDidExit(_ accountOnboarding: AccountOnboardingController) {
        Task {
            do {
                let status = try await api.fetchAccountStatus()
                onExit?(.success(status))
            } catch {
                onExit?(.failure(error))
            }
            onExit = nil
        }
    }

    public func accountOnboarding(
        _ accountOnboarding: AccountOnboardingController,
        didFailLoadWithError error: Error
    ) {
        onExit?(.failure(error))
        onExit = nil
    }

    /// Matches the Pluse Connect brand color already set on connected accounts (`#5E5CE6`).
    public static func pluseAppearance() -> EmbeddedComponentManager.Appearance {
        var appearance = EmbeddedComponentManager.Appearance()
        appearance.colors.primary = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.55, green: 0.42, blue: 1.0, alpha: 1)
                : UIColor(red: 0.369, green: 0.361, blue: 0.902, alpha: 1)
        }
        appearance.typography.fontSizeBase = 16
        return appearance
    }
}
