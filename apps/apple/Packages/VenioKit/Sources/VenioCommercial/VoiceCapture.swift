#if !os(watchOS)
import Foundation
import Observation
import AVFoundation
import Speech
import NaturalLanguage

public enum ContentLanguage {
    public static func detect(_ text: String) -> String? {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let language = recognizer.dominantLanguage, [.french, .english].contains(language) else { return nil }
        return language.rawValue
    }
}

@Observable @MainActor final class VoiceCapture {
    var text = ""
    private(set) var audioURL: URL?
    private(set) var startedAt: Date?
    private(set) var duration: TimeInterval = 0
    private(set) var preparing = false
    private(set) var transcribing = false
    private(set) var errorKey: String?
    private(set) var needsSettings = false
    private var cancelled = false
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recognition: SFSpeechRecognitionTask?

    func start(locale: Locale) async {
        guard !preparing, startedAt == nil, !transcribing else { return }
        cancelled = false
        preparing = true
        defer { preparing = false }
        errorKey = nil
        needsSettings = false
        let microphone = await AVCaptureDevice.requestAccess(for: .audio)
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard !cancelled else { return }
        guard microphone && speech else {
            errorKey = "Autorisez le micro et la reconnaissance vocale dans Réglages."
            needsSettings = true
            return
        }
        discard()
        text = ""
        do {
            #if os(iOS)
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("m4a")
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ])
            guard recorder.record() else { throw VenioRecordingError.unavailable }
            self.recorder = recorder
            audioURL = url
            startedAt = .now
        } catch { errorKey = "Enregistrement impossible. Réessayez." }
    }

    func stop(locale: Locale) {
        guard startedAt != nil else { return }
        duration = recorder?.currentTime ?? 0
        recorder?.stop()
        recorder = nil
        startedAt = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
        guard let audioURL else { return }
        let language = locale.language.languageCode?.identifier == "fr" ? "fr-FR" : "en-US"
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.supportsOnDeviceRecognition else {
            errorKey = "Transcription hors ligne indisponible. Vous pouvez saisir le texte."
            return
        }
        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        transcribing = true
        recognition = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let transcript = result?.bestTranscription.formattedString
            let finished = result?.isFinal == true || error != nil
            let failed = error != nil
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let transcript { self.text = transcript }
                if finished {
                    self.transcribing = false
                    self.recognition = nil
                    if failed { self.errorKey = "Transcription hors ligne indisponible. Vous pouvez saisir le texte." }
                }
            }
        }
    }

    func play() {
        guard let audioURL else { return }
        do {
            player = try AVAudioPlayer(contentsOf: audioURL)
            player?.play()
        } catch { errorKey = "Lecture audio indisponible." }
    }

    func discard(keepAudio: Bool = false) {
        cancelled = true
        recognition?.cancel()
        recognition = nil
        transcribing = false
        recorder?.stop()
        recorder = nil
        player?.stop()
        player = nil
        startedAt = nil
        duration = 0
        if !keepAudio, let audioURL { try? FileManager.default.removeItem(at: audioURL) }
        audioURL = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
    private enum VenioRecordingError: Error { case unavailable }
}
#endif
