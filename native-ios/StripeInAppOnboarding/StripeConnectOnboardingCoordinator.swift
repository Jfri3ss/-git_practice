import StripeConnect
import StripeCore
import UIKit

/// Presents Stripe Connect onboarding inside the iOS app.
///
/// This replaces Account Links opened in Safari / `ASWebAuthenticationSession` /
/// `SFSafariViewController`. Stripe's `AccountOnboardingController` is a
/// full-screen in-app controller you present from your own screen.
///
/// You still use Stripe's KYC/bank form (themed to the app). You do not
/// rebuild those fields yourself.
@MainActor
final class StripeConnectOnboardingCoordinator: NSObject, AccountOnboardingControllerDelegate {
    struct Configuration {
        var publishableKey: String
        var backendBaseURL: URL
        /// Session token for your API. The sample backend expects `Authorization: Bearer …`.
        var authToken: String
        var title: String = "Set up payouts"
        var fullTermsOfServiceURL: URL? = nil
        var recipientTermsOfServiceURL: URL? = nil
        var privacyPolicyURL: URL? = nil
        /// Collect `eventually_due` plus `currently_due` so most hosts finish in one pass.
        var collectEventuallyDue: Bool = true
    }

    enum CoordinatorError: LocalizedError {
        case missingPublishableKey
        case notPresentedFromViewController
        case accountSessionFailed(String)

        var errorDescription: String? {
            switch self {
            case .missingPublishableKey:
                return "Missing Stripe publishable key."
            case .notPresentedFromViewController:
                return "Stripe onboarding must be presented from a UIViewController."
            case .accountSessionFailed(let message):
                return message
            }
        }
    }

    private let configuration: Configuration
    private var embeddedComponentManager: EmbeddedComponentManager?
    private var onExit: ((Result<StripeConnectAccountStatus, Error>) -> Void)?

    init(configuration: Configuration) {
        self.configuration = configuration
        super.init()
    }

    /// Present Stripe's in-app onboarding from the current view controller.
    func present(
        from viewController: UIViewController,
        completion: @escaping (Result<StripeConnectAccountStatus, Error>) -> Void
    ) {
        onExit = completion

        guard !configuration.publishableKey.isEmpty else {
            completion(.failure(CoordinatorError.missingPublishableKey))
            return
        }

        STPAPIClient.shared.publishableKey = configuration.publishableKey

        let manager = EmbeddedComponentManager(
            appearance: Self.pluseAppearance(),
            fetchClientSecret: { [weak self] in
                await self?.fetchAccountSessionClientSecret()
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

    // MARK: - AccountOnboardingControllerDelegate

    func accountOnboardingDidExit(_ accountOnboarding: AccountOnboardingController) {
        Task {
            do {
                let status = try await fetchAccountStatus()
                onExit?(.success(status))
            } catch {
                onExit?(.failure(error))
            }
            onExit = nil
        }
    }

    func accountOnboarding(
        _ accountOnboarding: AccountOnboardingController,
        didFailLoadWithError error: Error
    ) {
        onExit?(.failure(error))
        onExit = nil
    }

    // MARK: - Backend

    private func fetchAccountSessionClientSecret() async -> String? {
        do {
            let response: AccountSessionResponse = try await post(path: "/connect/account-session")
            return response.clientSecret
        } catch {
            return nil
        }
    }

    private func fetchAccountStatus() async throws -> StripeConnectAccountStatus {
        try await get(path: "/connect/account-status")
    }

    private func get<T: Decodable>(path: String) async throws -> T {
        var request = URLRequest(url: endpoint(path))
        request.httpMethod = "GET"
        applyAuth(to: &request)
        return try await decode(request)
    }

    private func post<T: Decodable>(path: String) async throws -> T {
        var request = URLRequest(url: endpoint(path))
        request.httpMethod = "POST"
        applyAuth(to: &request)
        return try await decode(request)
    }

    private func endpoint(_ path: String) -> URL {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return configuration.backendBaseURL.appendingPathComponent(trimmed)
    }

    private func applyAuth(to request: inout URLRequest) {
        request.setValue("Bearer \(configuration.authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let message = (try? JSONDecoder().decode(APIErrorResponse.self, from: data))?.error
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw CoordinatorError.accountSessionFailed(message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func pluseAppearance() -> EmbeddedComponentManager.Appearance {
        var appearance = EmbeddedComponentManager.Appearance()
        appearance.colors.primary = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.55, green: 0.42, blue: 1.0, alpha: 1)
                : UIColor(red: 0.40, green: 0.28, blue: 0.95, alpha: 1)
        }
        appearance.typography.fontSizeBase = 16
        return appearance
    }
}

struct StripeConnectAccountStatus: Decodable, Equatable {
    var accountId: String
    var detailsSubmitted: Bool
    var chargesEnabled: Bool
    var payoutsEnabled: Bool
    var currentlyDue: [String]
    var pastDue: [String]

    var isReadyForPayouts: Bool {
        detailsSubmitted && payoutsEnabled && currentlyDue.isEmpty && pastDue.isEmpty
    }
}

private struct AccountSessionResponse: Decodable {
    var clientSecret: String
}

private struct APIErrorResponse: Decodable {
    var error: String
}
