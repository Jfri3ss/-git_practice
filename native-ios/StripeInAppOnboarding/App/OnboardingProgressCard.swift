import SwiftUI

struct OnboardingProgressCard: View {
    let progress: StripeOnboardingProgress
    let isLoading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(progress.setupPhase == "complete" ? "Payouts ready" : "Payout setup")
                        .font(.headline)
                    Text(progress.summaryMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(progress.progressPercent)%")
                    .font(.title2.bold().monospacedDigit())
                    .foregroundStyle(Color.accentColor)
            }

            ProgressView(value: Double(progress.progressPercent), total: 100)
                .tint(Color.accentColor)

            VStack(spacing: 12) {
                ForEach(progress.steps) { step in
                    HStack(spacing: 12) {
                        Image(systemName: icon(for: step.status))
                            .foregroundStyle(color(for: step.status))
                            .font(.body.weight(.semibold))
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(step.title)
                                .font(.subheadline.weight(.semibold))
                            Text(step.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if step.status == .underReview {
                            Text("Reviewing")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .redacted(reason: isLoading ? .placeholder : [])
    }

    private func icon(for status: StripeOnboardingStepStatus) -> String {
        switch status {
        case .complete:
            return "checkmark.circle.fill"
        case .remaining:
            return "circle"
        case .needsAttention:
            return "exclamationmark.circle.fill"
        case .underReview:
            return "clock.fill"
        }
    }

    private func color(for status: StripeOnboardingStepStatus) -> Color {
        switch status {
        case .complete:
            return .green
        case .remaining:
            return .secondary
        case .needsAttention:
            return .red
        case .underReview:
            return .orange
        }
    }
}
