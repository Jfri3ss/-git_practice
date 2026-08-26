import SwiftUI
import UIKit

/// SwiftUI entry point that presents Stripe Connect onboarding in-app.
public struct StripeConnectOnboardingButton: View {
    public var configuration: StripeConnectOnboardingCoordinator.Configuration
    public var label: String
    public var onFinished: (Result<StripeConnectAccountStatus, Error>) -> Void

    @State private var isPresenting = false

    public init(
        configuration: StripeConnectOnboardingCoordinator.Configuration,
        label: String = "Continue Stripe setup",
        onFinished: @escaping (Result<StripeConnectAccountStatus, Error>) -> Void
    ) {
        self.configuration = configuration
        self.label = label
        self.onFinished = onFinished
    }

    public var body: some View {
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

struct StripeConnectOnboardingPresenter: UIViewControllerRepresentable {
    var configuration: StripeConnectOnboardingCoordinator.Configuration
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
