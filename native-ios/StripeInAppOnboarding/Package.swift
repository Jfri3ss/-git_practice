// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "StripeInAppOnboarding",
    platforms: [
        .iOS(.v15),
    ],
    products: [
        .library(name: "StripeInAppOnboarding", targets: ["StripeInAppOnboarding"]),
    ],
    dependencies: [
        .package(url: "https://github.com/stripe/stripe-ios-spm", from: "26.7.0"),
    ],
    targets: [
        .target(
            name: "StripeInAppOnboarding",
            dependencies: [
                .product(name: "StripeConnect", package: "stripe-ios-spm"),
            ]
        ),
    ]
)
