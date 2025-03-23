import React, { useState, useEffect, useRef } from "react";
import FloatingUI from "./FloatingUI";
import { AwsTranscribeService } from "../lib/aws-transcribe-service";
import {
  getSystemAudioStream,
  getMicrophoneStream,
} from "../lib/audio-capture";

const TranscriptionManager: React.FC = () => {
  const [showUI, setShowUI] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("en-US");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  const transcribeServiceRef = useRef<AwsTranscribeService | null>(null);

  // Initialize transcribe service when component mounts
  useEffect(() => {
    transcribeServiceRef.current = new AwsTranscribeService();

    return () => {
      stopRecording();
    };
  }, []);

  // Listen for messages from extension
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "SHOW_TRANSCRIPTION_UI") {
        setShowUI(true);
      }
    };

    window.addEventListener("message", handleExtensionMessage);

    return () => {
      window.removeEventListener("message", handleExtensionMessage);
    };
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      setError(null);

      // Check if extension is available for tab capture
      const extensionAvailable = await checkExtensionAvailability();

      // Get audio stream based on availability
      let audioStream;
      if (extensionAvailable) {
        audioStream = await getSystemAudioStream();
      } else {
        audioStream = await getMicrophoneStream();
      }

      if (!audioStream) {
        throw new Error("Failed to get audio stream");
      }

      // Start transcription
      if (transcribeServiceRef.current) {
        transcribeServiceRef.current.startTranscription(audioStream, language);

        // Listen for transcription results
        transcribeServiceRef.current.on("transcription", (text: string) => {
          // Update UI with transcription
          setTranscript((prevTranscript) => prevTranscript + " " + text);
        });

        transcribeServiceRef.current.on("error", (err: Error) => {
          setError(err.message);
          stopRecording();
        });
      }

      setIsRecording(true);
    } catch (err: any) {
      setError(err.message || "Unknown error occurred");
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = async () => {
    if (transcribeServiceRef.current) {
      transcribeServiceRef.current.stopTranscription();
      transcribeServiceRef.current.off("transcription", null);
      transcribeServiceRef.current.off("error", null);
    }

    setIsRecording(false);
  };

  const checkExtensionAvailability = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      // Try to communicate with the extension
      window.postMessage({ type: "CHECK_EXTENSION_AVAILABLE" }, "*");

      // Set timeout for response
      const timeout = setTimeout(() => {
        resolve(false);
      }, 1000);

      // Listen for response
      const handleResponse = (event: MessageEvent) => {
        if (event.data && event.data.type === "EXTENSION_AVAILABLE") {
          clearTimeout(timeout);
          window.removeEventListener("message", handleResponse);
          resolve(true);
        }
      };

      window.addEventListener("message", handleResponse);
    });
  };

  const handleCloseUI = () => {
    if (isRecording) {
      stopRecording();
    }
    setShowUI(false);
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);

    // If currently recording, restart with the new language
    if (isRecording) {
      stopRecording().then(() => startRecording());
    }
  };

  const handleClearTranscript = () => {
    setTranscript("");
  };

  // Render nothing if UI is hidden
  if (!showUI) return null;

  return (
    <FloatingUI
      onClose={handleCloseUI}
      language={language}
      isRecording={isRecording}
      onToggleRecording={toggleRecording}
      onLanguageChange={handleLanguageChange}
      transcript={transcript}
      error={error}
    />
  );
};

export default TranscriptionManager;
