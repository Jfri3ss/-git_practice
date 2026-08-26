import StripeInAppOnboarding
import SwiftUI

struct PayoutSetupView: View {
    @State private var status = StripeConnectAccountStatus()
    @State private var validationIssues: [String] = []
    @State private var isLoading = true

    private var configuration: StripeConnectOnboardingCoordinator.Configuration {
        StripeConnectOnboardingCoordinator.Configuration(
            backendBaseURL: AppConfig.backendBaseURL,
            authToken: AppConfig.authToken
        )
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Get paid")
                        .font(.largeTitle.bold())
                    Text("Finish payout setup inside Pluse. See your progress and pick up where you left off.")
                        .foregroundStyle(.secondary)

                    OnboardingProgressCard(
                        progress: status.progress,
                        isLoading: isLoading
                    )

                    if status.isReadyForPayouts {
                        successCard
                    } else if status.progress.isUnderReview {
                        reviewCard
                    }

                    if !validationIssues.isEmpty && !status.isReadyForPayouts {
                        issuesCard
                    }

                    if !status.isReadyForPayouts {
                        StripeConnectOnboardingButton(
                            configuration: configuration,
                            label: buttonLabel
                        ) { result in
                            apply(result)
                            Task { await refreshValidation() }
                        }
                    }
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .refreshable {
                await refreshStatus()
                await refreshValidation()
            }
            .task {
                await refreshStatus()
                await refreshValidation()
            }
        }
        .navigationViewStyle(.stack)
    }

    private var buttonLabel: String {
        if status.accountId == nil {
            return "Start payout setup"
        }
        return status.progress.continueLabel
    }

    private var successCard: some View {
        Label("Everything looks good. This host can receive payouts.", systemImage: "sparkles")
            .font(.subheadline)
            .foregroundStyle(.green)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private var reviewCard: some View {
        Label("Stripe is reviewing your details. Pull to refresh for updates.", systemImage: "clock")
            .font(.subheadline)
            .foregroundStyle(.orange)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private var issuesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Before payouts can start")
                .font(.subheadline.weight(.semibold))
            ForEach(validationIssues, id: \.self) { issue in
                Label(issue, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
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

    private func refreshValidation() async {
        do {
            let validation = try await StripeConnectAPIClient(
                backendBaseURL: AppConfig.backendBaseURL,
                authToken: AppConfig.authToken
            ).fetchSetupValidation()
            validationIssues = validation.issues
        } catch {
            validationIssues = [error.localizedDescription]
        }
    }

    private func apply(_ result: Result<StripeConnectAccountStatus, Error>) {
        isLoading = false
        switch result {
        case .success(let loaded):
            status = loaded
        case .failure:
            break
        }
    }
}
