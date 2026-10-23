import Foundation

public struct RGBColor: Sendable, Equatable {
    public let red: Double
    public let green: Double
    public let blue: Double

    public init(hex: UInt32) {
        red = Double((hex >> 16) & 255) / 255
        green = Double((hex >> 8) & 255) / 255
        blue = Double(hex & 255) / 255
    }

    private init(red: Double, green: Double, blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    public func mixed(toward other: Self, fraction: Double) -> Self {
        let t = min(1, max(0, fraction))
        return Self(red: red + (other.red - red) * t,
                    green: green + (other.green - green) * t,
                    blue: blue + (other.blue - blue) * t)
    }

    public var luminance: Double {
        func linear(_ value: Double) -> Double {
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    public func contrast(with other: Self) -> Double {
        (max(luminance, other.luminance) + 0.05) / (min(luminance, other.luminance) + 0.05)
    }

    public func textVariant(on base: Self, toward target: Self) -> Self {
        guard contrast(with: base) < 4.5 else { return self }
        var low = 0.0
        var high = 1.0
        for _ in 0..<32 {
            let middle = (low + high) / 2
            if mixed(toward: target, fraction: middle).contrast(with: base) >= 4.5 {
                high = middle
            } else {
                low = middle
            }
        }
        return mixed(toward: target, fraction: high)
    }
}
