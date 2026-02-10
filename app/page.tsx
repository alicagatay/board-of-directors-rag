"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { mentorConfigs, type MentorId } from "./mentors/config";
import LoadingDots from "./components/LoadingDots";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      mentorName?: string;
    }>
  >([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingDotsCount, setLoadingDotsCount] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userInput = input;
    setInput("");

    // Add user message to UI
    const userMessage = {
      id: uuidv4(),
      role: "user" as const,
      content: userInput,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Build messages array including current input for API
    const currentMessages = [
      ...messages,
      { role: "user" as const, content: userInput },
    ];

    setIsStreaming(true);

    try {
      // Step 1: Select agent and get summarized query
      const agentResponse = await fetch("/api/select-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages }),
      });

      const { mentor, query } = await agentResponse.json();

      // Step 2: Make direct API call
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: currentMessages,
          mentor,
          query,
        }),
      });

      if (!response.ok) {
        console.error("Error from chat API:", await response.text());
        return;
      }

      // Get the mentor's display name
      const mentorName = mentorConfigs[mentor as MentorId]?.name || mentor;

      // Create a new assistant message
      const assistantMessageId = uuidv4();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          mentorName,
        },
      ]);

      // Get the response stream and process it
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantResponse += chunk;

          // Update the assistant message with the accumulated response
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: assistantResponse }
                : msg,
            ),
          );
        }
      }
    } catch (error) {
      console.error("Error in chat:", error);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="h-[85vh] px-8 pt-2 pb-2 w-full max-w-6xl mx-auto flex flex-col">
      {/* Chat Section */}
      <div className="border rounded px-4 pt-0 pb-4 flex-1 flex flex-col">
        <div className="mb-3">
          <h1 className="text-4xl font-extrabold leading-none mt-0 mb-0">
            Board Of Directors Chat
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-none -mt-1">
            This is your discussion chat with your board of directors.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-3 rounded ${
                message.role === "user"
                  ? "bg-blue-100 ml-8"
                  : "bg-gray-100 mr-8"
              }`}
            >
              <p className="font-semibold mb-1">
                {message.role === "user"
                  ? "You"
                  : message.mentorName || "AI Assistant"}
              </p>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
          {isStreaming &&
            messages[messages.length - 1]?.role === "assistant" &&
            !messages[messages.length - 1]?.content && (
              <div
                className="p-3 rounded bg-gray-100 mr-8 transition-all duration-300"
                style={{
                  width: `${40 + loadingDotsCount * 12}px`,
                }}
              >
                <LoadingDots onDotsChange={setLoadingDotsCount} />
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Start a discussion..."
            className="flex-1 p-2 border rounded"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded disabled:bg-gray-400"
          >
            {isStreaming ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
