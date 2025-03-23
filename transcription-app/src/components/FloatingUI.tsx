import React, { useState, useRef, useEffect } from "react";
import Draggable from "react-draggable";

interface FloatingUIProps {
  onClose: () => void;
  language: string;
  isRecording: boolean;
  onToggleRecording: () => void;
  onLanguageChange?: (language: string) => void;
  transcript?: string;
  error?: string | null;
}

const FloatingUI: React.FC<FloatingUIProps> = ({
  onClose,
  language,
  isRecording,
  onToggleRecording,
  onLanguageChange,
  transcript = "",
  error = null,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [creditStatus, setCreditStatus] = useState<"ok" | "low" | "empty">(
    "ok"
  );
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const nodeRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom of transcript when it updates
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(transcript);
    // Show toast notification
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    // Implement mute functionality
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const clearTranscript = () => {
    // This would be handled by the parent component
    // We'll call a prop function if provided
  };

  const downloadTranscript = () => {
    const element = document.createElement("a");
    const file = new Blob([transcript], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onLanguageChange) {
      onLanguageChange(e.target.value);
    }
  };

  // Show credit warning UI if needed
  const renderCreditWarning = () => {
    if (creditStatus === "ok") return null;

    return (
      <div className="bg-gray-800 text-white p-4 rounded-md mb-2">
        <div className="flex items-center">
          <div className="text-red-500 mr-2">⚠️</div>
          <div>
            {creditStatus === "low"
              ? "Your credits are running low."
              : "You have no remaining credits."}
          </div>
        </div>
        <div className="flex justify-end mt-2 space-x-2">
          <button className="bg-blue-500 text-white px-4 py-1 rounded">
            Get More
          </button>
          {creditStatus === "empty" && (
            <button className="bg-purple-500 text-white px-4 py-1 rounded">
              Upgrade
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render error message if there is one
  const renderError = () => {
    if (!error) return null;

    return (
      <div className="bg-red-800 text-white p-2 rounded-md mb-2">
        <div className="flex items-center">
          <div className="text-red-300 mr-2">❗</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  };

  return (
    <Draggable nodeRef={nodeRef} handle=".handle" bounds="body">
      <div
        ref={nodeRef}
        className={`fixed shadow-lg rounded-lg ${
          isMinimized ? "w-12 h-12" : "w-80"
        } bg-gray-900 text-white z-50 overflow-hidden transition-all duration-200`}
        style={{
          maxHeight: isMinimized ? "48px" : "500px",
        }}
      >
        {/* Header bar */}
        <div className="handle flex justify-between items-center p-2 bg-gray-800 cursor-move">
          <div className="flex items-center">
            <span className="font-semibold ml-1">Transcribe</span>
            {isRecording && (
              <span className="ml-2 h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={toggleMinimize}
              className="hover:bg-gray-700 p-1 rounded"
            >
              {isMinimized ? "↗" : "↘"}
            </button>
            <button onClick={onClose} className="hover:bg-gray-700 p-1 rounded">
              ✕
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Credit warning if needed */}
            {renderCreditWarning()}

            {/* Error message if there is one */}
            {renderError()}

            {/* Main transcript area */}
            <div
              ref={transcriptRef}
              className="p-3 h-64 overflow-y-auto whitespace-pre-wrap"
            >
              {transcript || "Transcript will appear here..."}
            </div>

            {/* Control bar */}
            <div className="flex justify-between items-center p-2 bg-gray-800">
              <div>
                <button
                  onClick={onToggleRecording}
                  className={`rounded-full w-10 h-10 flex items-center justify-center ${
                    isRecording ? "bg-red-600" : "bg-green-600"
                  }`}
                >
                  {isRecording ? "■" : "▶"}
                </button>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={toggleMute}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  {isMuted ? "🔇" : "🔊"}
                </button>
                <button
                  onClick={clearTranscript}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  🗑️
                </button>
                <button
                  onClick={handleCopyTranscript}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  📋
                </button>
                <button
                  onClick={downloadTranscript}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  💾
                </button>

                <select
                  className="bg-gray-700 rounded text-sm p-1"
                  value={language}
                  onChange={handleLanguageChange}
                >
                  <option value="en-US">English (US)</option>
                  <option value="zh-CN">中文 (简体)</option>
                  <option value="ja-JP">日本語</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </Draggable>
  );
};

export default FloatingUI;
