import Foundation

enum AppConfig {
    /// Simulator talks to the Mac. On a device, replace this with your machine LAN URL or deployed API.
    static var backendBaseURL: URL {
        if let override = Bundle.main.object(forInfoDictionaryKey: "StripeBackendBaseURL") as? String,
           let url = URL(string: override), !override.isEmpty {
            return url
        }
        return URL(string: "http://127.0.0.1:4242")!
    }

    /// Temporary stand-in for the logged-in Pluse host session.
    static var authToken: String {
        (Bundle.main.object(forInfoDictionaryKey: "StripeDemoUserToken") as? String)
            ?? "100023"
    }
}
