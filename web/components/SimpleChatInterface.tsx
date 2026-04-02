"use client";

import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendChatMessage } from "@/lib/api";
import { SourceCard } from "./SourceCard";
import type { SearchResult } from "@/lib/api";
import { quickQuestions } from "@/lib/quick-questions";
import type { SettingsConfig } from "./Settings";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
  metadata?: {
    intent?: string;
  };
}

interface SimpleChatInterfaceProps {
  initialQuestion?: string | null;
  settings: SettingsConfig;
}

export interface SimpleChatInterfaceHandle {
  sendMessage: (text: string) => void;
  clearChat: () => void;
}

export const SimpleChatInterface = forwardRef<
  SimpleChatInterfaceHandle,
  SimpleChatInterfaceProps
>(({ initialQuestion, settings }, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialQuestionSentRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (initialQuestion && !initialQuestionSentRef.current) {
      initialQuestionSentRef.current = true;
      handleSendMessage(initialQuestion);
    }
  }, [initialQuestion]);

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendChatMessage(text, settings.topK);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        metadata: response.metadata,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    initialQuestionSentRef.current = false;
  };

  useImperativeHandle(ref, () => ({
    sendMessage: handleSendMessage,
    clearChat,
  }));

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Get 6 suggested questions from different categories
  const suggestedQuestions = [
    quickQuestions.find((q) => q.category === "embeddings")?.text || "",
    quickQuestions.find((q) => q.category === "vector-dbs")?.text || "",
    quickQuestions.find((q) => q.category === "rag-frameworks")?.text || "",
    quickQuestions.find((q) => q.category === "comparisons")?.text || "",
    quickQuestions.find((q) => q.category === "how-to")?.text || "",
    quickQuestions.find((q) => q.category === "troubleshooting")?.text || "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-start justify-center min-h-[500px] max-w-2xl">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-light mb-6 text-charcoal leading-tight">
                Diagnose your RAG
              </h1>
              <p className="text-lg sm:text-xl text-stone mb-16 leading-relaxed max-w-xl font-light">
                Ask questions about RAG models, implementations, or trends.
              </p>

              {/* Suggested Questions */}
              <div className="w-full space-y-3">
                {suggestedQuestions.slice(0, 4).map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(question)}
                    className="block w-full text-left py-4 text-base sm:text-lg text-charcoal hover:text-stone transition-colors border-b border-stone-border hover:border-charcoal font-light"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`py-8 ${message.role === "user" ? "max-w-2xl ml-auto" : "max-w-3xl"}`}
            >
              {message.role === "assistant" && (
                <div className="text-xs text-stone mb-4 uppercase tracking-wider font-normal">
                  RAGnosis
                </div>
              )}

              <div className="space-y-4">
                <div
                  className={`${message.role === "user" ? "text-right" : ""}`}
                >
                  {message.role === "assistant" ? (
                    <div className="text-charcoal leading-relaxed prose prose-lg max-w-none font-light">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-6 text-base sm:text-lg text-charcoal leading-relaxed">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-6 space-y-2 list-none pl-0">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-6 space-y-2 list-decimal pl-6">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-base sm:text-lg text-charcoal leading-relaxed pl-0 before:content-['—'] before:mr-3 before:text-stone">
                              {children}
                            </li>
                          ),
                          strong: ({ children }) => (
                            <strong className="text-charcoal font-normal">
                              {children}
                            </strong>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-2xl font-light text-charcoal mb-6 mt-8">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xl font-light text-charcoal mb-4 mt-6">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-lg font-light text-charcoal mb-3 mt-5">
                              {children}
                            </h3>
                          ),
                          code: ({ children, className }) => {
                            const isInline = !className;
                            return isInline ? (
                              <code className="text-charcoal bg-cream px-2 py-0.5 text-sm font-mono">
                                {children}
                              </code>
                            ) : (
                              <code className={className}>{children}</code>
                            );
                          },
                          pre: ({ children }) => (
                            <pre className="bg-cream p-6 overflow-x-auto mb-6 text-sm">
                              {children}
                            </pre>
                          ),
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              className="text-charcoal hover:opacity-60 underline decoration-1 underline-offset-4 transition-opacity"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-lg text-charcoal italic font-light">
                      {message.content}
                    </div>
                  )}
                </div>

                {/* Copy and Sources buttons for assistant messages */}
                {message.role === "assistant" && (
                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={() => handleCopy(message.content, message.id)}
                      className="text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider font-normal"
                    >
                      {copiedId === message.id ? "Copied" : "Copy"}
                    </button>
                    {settings.showSources &&
                      message.sources &&
                      message.sources.length > 0 && (
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedSources);
                            if (newExpanded.has(message.id)) {
                              newExpanded.delete(message.id);
                            } else {
                              newExpanded.add(message.id);
                            }
                            setExpandedSources(newExpanded);
                          }}
                          className="text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider font-normal"
                        >
                          {expandedSources.has(message.id)
                            ? "Hide Sources"
                            : `Sources (${message.sources.length})`}
                        </button>
                      )}
                  </div>
                )}

                {/* Collapsible Sources */}
                {settings.showSources &&
                  message.sources &&
                  message.sources.length > 0 &&
                  expandedSources.has(message.id) && (
                    <div className="mt-6 pt-6 border-t border-stone-border">
                      <div className="space-y-3">
                        {message.sources.map((source) => (
                          <SourceCard key={source.position} source={source} />
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="py-8 max-w-3xl">
              <div className="text-xs text-stone mb-4 uppercase tracking-wider font-normal">
                RAGnosis
              </div>
              <div className="text-base text-stone italic font-light">
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-stone-border p-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-4 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question..."
              className="flex-1 resize-none border-0 border-b border-stone-border px-0 py-3 text-base sm:text-lg text-charcoal placeholder-stone focus:outline-none focus:border-charcoal min-h-[44px] max-h-[150px] bg-transparent font-light"
              rows={1}
            />
            <div className="flex gap-3 items-center">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider pb-3 font-normal"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !input.trim()}
                className="text-xs text-charcoal hover:opacity-60 disabled:opacity-30 transition-opacity uppercase tracking-wider pb-3 font-normal"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SimpleChatInterface.displayName = "SimpleChatInterface";
