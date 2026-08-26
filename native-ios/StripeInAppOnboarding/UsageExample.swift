import SwiftUI

/// Example payout-setup screen. Copy the button into the real host onboarding
/// flow in `native-ios/`; do not present Account Links in Safari from here.
struct StripeConnectOnboardingUsageExample: View {
    @State private var statusText = "Payouts are not set up yet."

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Get paid")
                .font(.title2.bold())
            Text(statusText)
                .foregroundStyle(.secondary)

            StripeConnectOnboardingButton(
                configuration: StripeConnectOnboardingCoordinator.Configuration(
                    publishableKey: "pk_test_replace_me",
                    backendBaseURL: URL(string: "https://api.example.com")!,
                    authToken: "user-session-token"
                )
            ) { result in
                switch result {
                case .success(let status) where status.isReadyForPayouts:
                    statusText = "Stripe setup is complete. Payouts are enabled."
                case .success(let status):
                    let remaining = (status.currentlyDue + status.pastDue).joined(separator: ", ")
                    statusText = remaining.isEmpty
                        ? "Stripe is still reviewing this account."
                        : "Stripe still needs: \(remaining)"
                case .failure(let error):
                    statusText = error.localizedDescription
                }
            }
        }
        .padding()
    }
}
