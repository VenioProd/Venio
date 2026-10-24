import Foundation

func requestCertainlyNotSent(_ error: any Error) -> Bool {
    guard let error = error as? URLError else { return false }
    switch error.code {
    case .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
         .internationalRoamingOff, .dataNotAllowed, .callIsActive, .secureConnectionFailed,
         .serverCertificateHasBadDate, .serverCertificateUntrusted, .serverCertificateHasUnknownRoot,
         .serverCertificateNotYetValid, .appTransportSecurityRequiresSecureConnection:
        return true
    default: return false
    }
}
