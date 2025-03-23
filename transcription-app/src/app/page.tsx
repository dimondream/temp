"use client";

import { useState } from "react";
import TranscriptionWindow from "@/components/TranscriptionWindow";

export default function Home() {
  const [showTranscription, setShowTranscription] = useState(false);

  const handleStartTranscription = () => {
    setShowTranscription(true);
    // For future PostHog integration
    // posthog?.capture('start_transcription');
  };

  const handleCloseTranscription = () => {
    setShowTranscription(false);
    // For future PostHog integration
    // posthog?.capture('close_transcription');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl font-bold mb-6">Real-time Transcription App</h1>

        <p className="mb-8 text-lg">
          Capture and transcribe audio from your browser in real-time. Perfect
          for meetings, interviews, or content creation.
        </p>

        {!showTranscription && (
          <button
            className="start-button px-6 py-3 rounded-lg"
            onClick={handleStartTranscription}
          >
            Start Transcribing
          </button>
        )}

        {/* Features section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="feature-card p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Live Transcription</h3>
            <p>Real-time audio-to-text conversion with minimal delay</p>
          </div>

          <div className="feature-card p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Multiple Languages</h3>
            <p>Support for over 10 languages via AWS Transcribe</p>
          </div>

          <div className="feature-card p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-3">Floating Window</h3>
            <p>Draggable interface that stays on top while you work</p>
          </div>
        </div>
      </div>

      {/* Floating window for transcription */}
      {showTranscription && (
        <TranscriptionWindow
          isVisible={showTranscription}
          onClose={handleCloseTranscription}
        />
      )}
    </main>
  );
}
