import Foundation

public struct StripeConnectAPIClient: Sendable {
    public var backendBaseURL: URL
    public var authToken: String
    public var urlSession: URLSession

    public init(backendBaseURL: URL, authToken: String, urlSession: URLSession = .shared) {
        self.backendBaseURL = backendBaseURL
        self.authToken = authToken
        self.urlSession = urlSession
    }

    public func fetchConfig() async throws -> StripeConnectConfig {
        try await get(path: "/connect/config")
    }

    public func fetchAccountSession() async throws -> String {
        let response: StripeConnectAccountSession = try await post(path: "/connect/account-session")
        return response.clientSecret
    }

    public func fetchAccountStatus() async throws -> StripeConnectAccountStatus {
        try await get(path: "/connect/account-status")
    }

    public func fetchSetupValidation() async throws -> StripeConnectSetupValidation {
        try await get(path: "/connect/setup-validation")
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
        return backendBaseURL.appendingPathComponent(trimmed)
    }

    private func applyAuth(to request: inout URLRequest) {
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await urlSession.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let message = (try? JSONDecoder().decode(StripeAPIErrorResponse.self, from: data))?.error
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw StripeConnectOnboardingError.accountSessionFailed(message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

public enum StripeConnectOnboardingError: LocalizedError, Equatable {
    case missingPublishableKey
    case accountSessionFailed(String)

    public var errorDescription: String? {
        switch self {
        case .missingPublishableKey:
            return "Missing Stripe publishable key."
        case .accountSessionFailed(let message):
            return message
        }
    }
}
