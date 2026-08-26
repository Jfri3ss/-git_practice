import SwiftUI
import UIKit

/// SwiftUI entry point that presents Stripe Connect onboarding in-app.
///
/// Drop this on a host/creator payout setup screen. It does not open Safari.
struct StripeConnectOnboardingButton: View {
    let configuration: StripeConnectOnboardingCoordinator.Configuration
    var label: String = "Continue Stripe setup"
    var onFinished: (Result<StripeConnectAccountStatus, Error>) -> Void

    @State private var isPresenting = false

    var body: some View {
        Button(label) {
            isPresenting = true
        }
        .buttonStyle(.borderedProminent)
        .background {
            StripeConnectOnboardingPresenter(
                configuration: configuration,
                isPresented: $isPresenting,
                onFinished: onFinished
            )
            .frame(width: 0, height: 0)
        }
    }
}

/// Finds the nearest UIKit presenter and hands it to `StripeConnectOnboardingCoordinator`.
private struct StripeConnectOnboardingPresenter: UIViewControllerRepresentable {
    let configuration: StripeConnectOnboardingCoordinator.Configuration
    @Binding var isPresented: Bool
    var onFinished: (Result<StripeConnectAccountStatus, Error>) -> Void

    func makeUIViewController(context: Context) -> PresenterViewController {
        let controller = PresenterViewController()
        controller.configuration = configuration
        controller.onFinished = onFinished
        return controller
    }

    func updateUIViewController(_ uiViewController: PresenterViewController, context: Context) {
        uiViewController.configuration = configuration
        uiViewController.onFinished = onFinished
        if isPresented {
            uiViewController.presentOnboardingIfNeeded()
            DispatchQueue.main.async {
                isPresented = false
            }
        }
    }

    final class PresenterViewController: UIViewController {
        var configuration: StripeConnectOnboardingCoordinator.Configuration?
        var onFinished: ((Result<StripeConnectAccountStatus, Error>) -> Void)?
        private var coordinator: StripeConnectOnboardingCoordinator?
        private var isPresentingOnboarding = false

        func presentOnboardingIfNeeded() {
            guard !isPresentingOnboarding, let configuration else { return }
            isPresentingOnboarding = true
            let coordinator = StripeConnectOnboardingCoordinator(configuration: configuration)
            self.coordinator = coordinator
            coordinator.present(from: self) { [weak self] result in
                self?.isPresentingOnboarding = false
                self?.coordinator = nil
                self?.onFinished?(result)
            }
        }
    }
}
