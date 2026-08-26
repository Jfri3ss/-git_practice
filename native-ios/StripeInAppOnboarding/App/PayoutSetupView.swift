import StripeInAppOnboarding
import SwiftUI

struct PayoutSetupView: View {
    @State private var status = StripeConnectAccountStatus()
    @State private var message = "Loading payout status…"
    @State private var isLoading = true

    private var configuration: StripeConnectOnboardingCoordinator.Configuration {
        StripeConnectOnboardingCoordinator.Configuration(
            backendBaseURL: AppConfig.backendBaseURL,
            authToken: AppConfig.authToken
        )
    }

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Get paid")
                    .font(.largeTitle.bold())
                Text("Complete Stripe setup inside Pluse. This screen does not open Safari.")
                    .foregroundStyle(.secondary)

                statusCard

                if !status.isReadyForPayouts {
                    StripeConnectOnboardingButton(
                        configuration: configuration,
                        label: status.accountId == nil ? "Set up payouts" : "Continue Stripe setup"
                    ) { result in
                        apply(result)
                    }
                }

                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await refreshStatus()
            }
        }
        .navigationViewStyle(.stack)
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                status.isReadyForPayouts ? "Payouts enabled" : "Payouts not ready",
                systemImage: status.isReadyForPayouts ? "checkmark.circle.fill" : "exclamationmark.circle"
            )
            .foregroundStyle(status.isReadyForPayouts ? Color.green : Color.primary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let accountId = status.accountId {
                Text(accountId)
                    .font(.caption.monospaced())
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .redacted(reason: isLoading ? .placeholder : [])
    }

    private func refreshStatus() async {
        isLoading = true
        do {
            let loaded = try await StripeConnectOnboardingCoordinator(configuration: configuration).fetchStatus()
            apply(.success(loaded))
        } catch {
            apply(.failure(error))
        }
    }

    private func apply(_ result: Result<StripeConnectAccountStatus, Error>) {
        isLoading = false
        switch result {
        case .success(let loaded):
            status = loaded
            if loaded.isReadyForPayouts {
                message = "Stripe setup is complete. This host can receive payouts."
            } else if loaded.remainingRequirements.isEmpty {
                message = loaded.disabledReason ?? "Stripe is still reviewing this account."
            } else {
                message = "Stripe still needs: \(loaded.remainingRequirements.joined(separator: ", "))"
            }
        case .failure(let error):
            message = error.localizedDescription
        }
    }
}
