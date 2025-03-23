import React, {
  useState,
  useEffect,
  useRef,
  RefObject,
  useCallback,
  Fragment,
} from "react";
import Draggable from "react-draggable";
import {
  AwsTranscribeService,
  TranscriptionResult,
  TranscribeError,
  AwsCredentials,
} from "@/lib/aws-transcribe";
import {
  getAudioStream,
  stopAudioStream,
  createAudioAnalyser,
  getAudioLevel,
  AudioSource,
} from "@/lib/audio-capture";
import { getAwsCredentials } from "@/lib/supabase-client";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface TranscriptionWindowProps {
  isVisible: boolean;
  onClose: () => void;
}

const TranscriptionWindow: React.FC<TranscriptionWindowProps> = ({
  isVisible,
  onClose,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [currentLanguage, setCurrentLanguage] = useState<string>("en-US");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>("microphone");
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "recording" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const audioStreamRef = useRef<MediaStream | null>(null);
  const transcribeServiceRef = useRef<AwsTranscribeService | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;

  // Languages supported by AWS Transcribe
  const languages = AwsTranscribeService.getSupportedLanguages();

  /**
   * Stops recording and transcription
   */
  const stopRecording = useCallback(() => {
    if (recordingStatus !== "recording") return;

    try {
      // Stop audio capture
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }

      // Stop transcription service
      if (transcribeServiceRef.current) {
        transcribeServiceRef.current.stopTranscription();
      }

      // Notify extension to stop tab audio if system audio was selected
      if (audioSource === "system" || audioSource === "both") {
        window.postMessage(
          {
            type: "FROM_PAGE",
            action: "stopTabAudio",
          },
          "*"
        );
      }

      setRecordingStatus("idle");
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingStatus("error");
      setErrorMessage(
        "Failed to stop recording properly. Please reload the page."
      );
    }
  }, [recordingStatus, audioSource]);

  // Function to handle extension errors
  const handleExtensionError = useCallback((error: Error) => {
    console.error("Extension error:", error);
    setRecordingStatus("error");
    setErrorMessage(
      error.message ||
        "Failed to connect to extension. Please reload the page and try again."
    );
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  }, []);

  // Listen for extension messages
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.source !== window) return;

      const message = event.data;
      if (message && message.type === "FROM_EXTENSION") {
        if (message.action === "error") {
          handleExtensionError(
            new Error(message.error || "Unknown extension error")
          );
        } else if (message.action === "tabAudioStopped") {
          console.log("Tab audio capture stopped by extension");
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage);

    return () => {
      window.removeEventListener("message", handleExtensionMessage);
    };
  }, [handleExtensionError]);

  // Handle audio level visualization
  useEffect(() => {
    let frameId: number | null = null;

    const updateAudioLevel = () => {
      if (analyserRef.current) {
        const level = getAudioLevel(analyserRef.current);
        setAudioLevel(level);
      }
      frameId = requestAnimationFrame(updateAudioLevel);
      animationFrameRef.current = frameId;
    };

    if (isRecording && analyserRef.current) {
      updateAudioLevel();
    }

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isRecording]);

  // Initialize AWS Transcribe service
  useEffect(() => {
    const initializeTranscribeService = async () => {
      try {
        const credentials = await getAwsCredentials();

        // Create new transcribe service instance
        transcribeServiceRef.current = new AwsTranscribeService();
        transcribeServiceRef.current.initialize(credentials as AwsCredentials);

        // Set up event listeners
        transcribeServiceRef.current.on<TranscriptionResult>(
          "transcription",
          (result) => {
            // Show real-time transcription by updating state
            if (result.isPartial) {
              // For partial results, update the current partial text
              setTranscript((prev) => {
                // Remove the last sentence if it was partial
                const prevWithoutPartial = prev.endsWith("...")
                  ? prev.substring(0, prev.lastIndexOf("..."))
                  : prev;
                return prevWithoutPartial + result.transcript + "... ";
              });
            } else {
              // For final results, append to transcript
              setTranscript((prev) => {
                // Remove the last sentence if it was partial
                const prevWithoutPartial = prev.endsWith("...")
                  ? prev.substring(0, prev.lastIndexOf("..."))
                  : prev;
                return prevWithoutPartial + result.transcript + " ";
              });
            }
          }
        );

        transcribeServiceRef.current.on<TranscribeError>("error", (err) => {
          setError(`Transcription error: ${err.message}`);
          stopRecording();
        });
      } catch (err) {
        setError(
          `Failed to initialize transcription service: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    if (isVisible) {
      initializeTranscribeService();
    }

    return () => {
      if (transcribeServiceRef.current) {
        // Just set to null to clean up, specific event removal not working properly
        transcribeServiceRef.current = null;
      }
    };
  }, [isVisible, stopRecording]);

  /**
   * Cleans up resources when component unmounts
   */
  useEffect(() => {
    return () => {
      // Stop recording when component unmounts
      stopRecording();
    };
  }, [stopRecording]);

  const startRecording = async () => {
    if (recordingStatus === "recording") return;

    try {
      setRecordingStatus("recording");
      setError(null);
      setErrorMessage("");
      setTranscript("");

      // Get audio based on selected source
      try {
        const stream = await getAudioStream(audioSource);
        audioStreamRef.current = stream;

        // Set up audio analyser
        analyserRef.current = createAudioAnalyser(stream);

        // Start transcription
        if (transcribeServiceRef.current) {
          await transcribeServiceRef.current.startTranscription(stream, {
            languageCode: currentLanguage,
          });

          setIsRecording(true);
        } else {
          throw new Error("Transcription service not initialized");
        }
      } catch (audioError) {
        // Handle specific errors for audio capture
        if (
          audioError instanceof Error &&
          audioError.message.includes("extension")
        ) {
          // This is an extension-related error
          handleExtensionError(audioError);
        } else {
          // This is a different kind of error
          throw audioError;
        }
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      setRecordingStatus("error");
      setError(
        `Failed to start recording: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      setErrorMessage(
        `Failed to start recording: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      stopRecording();
    }
  };

  const clearTranscript = () => {
    setTranscript("");
  };

  const copyTranscript = () => {
    navigator.clipboard
      .writeText(transcript)
      .then(() => {
        // Could add a toast notification here in the future
        console.log("Transcript copied to clipboard");
      })
      .catch((err) => {
        setError(
          `Failed to copy transcript: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
  };

  if (!isVisible) return null;

  return (
    <Draggable nodeRef={nodeRef} handle=".handle" bounds="parent">
      <div
        ref={nodeRef}
        className={`absolute top-1/4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg w-72 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="handle bg-blue-500 text-white p-2 rounded-t-lg cursor-move flex justify-between items-center">
          <span>Transcription</span>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 focus:outline-none"
          >
            ×
          </button>
        </div>

        {/* Error Messages */}
        {(error || errorMessage) && (
          <div className="p-2 bg-red-100 text-red-700 text-sm">
            {error || errorMessage}
          </div>
        )}

        {/* UI for language selection and options */}
        <div className="p-2">
          <div className="mb-2">
            <label className="block text-gray-700 text-sm mb-1">Language</label>
            <select
              className="w-full p-1 border rounded text-sm"
              value={currentLanguage}
              onChange={(e) => setCurrentLanguage(e.target.value)}
              disabled={isRecording}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Audio source selection */}
          <div className="flex items-center mb-2">
            <label className="block text-gray-700 text-sm mr-2">
              Audio Source:
            </label>
            <div className="flex space-x-2">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={
                    audioSource === "microphone" || audioSource === "both"
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAudioSource(
                        audioSource === "system" ? "both" : "microphone"
                      );
                    } else {
                      setAudioSource(
                        audioSource === "both" ? "system" : "none"
                      );
                    }
                  }}
                  disabled={isRecording}
                />
                Microphone
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={audioSource === "system" || audioSource === "both"}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAudioSource(
                        audioSource === "microphone" ? "both" : "system"
                      );
                    } else {
                      setAudioSource(
                        audioSource === "both" ? "microphone" : "none"
                      );
                    }
                  }}
                  disabled={isRecording}
                />
                System Audio
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex space-x-2 mb-2">
            <button
              className={`px-2 py-1 rounded text-sm ${
                isRecording
                  ? "bg-red-500 text-white"
                  : "bg-green-500 text-white"
              }`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? "Stop" : "Start"}
            </button>
            <button
              className="px-2 py-1 bg-gray-200 rounded text-sm"
              onClick={clearTranscript}
            >
              Clear
            </button>
            <button
              className="px-2 py-1 bg-gray-200 rounded text-sm"
              onClick={copyTranscript}
            >
              Copy
            </button>
          </div>

          {/* Transcription output */}
          <div className="max-h-48 overflow-y-auto border rounded p-2 text-sm">
            {transcript || "Transcript will appear here..."}
          </div>
        </div>
      </div>
    </Draggable>
  );
};

export default TranscriptionWindow;
