"use client";

import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  sendChatMessageStream,
  getEcosystemStats,
  type EcosystemStats,
} from "@/lib/api";
import { SourceCard } from "./SourceCard";
import { ProgressSteps } from "./ProgressSteps";
import type { SearchResult } from "@/lib/api";
import type { SettingsConfig } from "./Settings";
import { preprocessCitationMarkers } from "@/lib/citation-utils";

interface ProgressStep {
  step: string;
  message: string;
  data?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
  metadata?: {
    intent?: string;
  };
  progress?: ProgressStep[];
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
  const [highlightedMarker, setHighlightedMarker] = useState<{
    messageId: string;
    marker: string;
  } | null>(null);
  const [expandedSourceCards, setExpandedSourceCards] = useState<Set<string>>(
    new Set(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialQuestionSentRef = useRef(false);
  const [loadingDots, setLoadingDots] = useState("");
  const [ecosystemStats, setEcosystemStats] = useState<EcosystemStats | null>(
    null,
  );
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrolledAwayRef = useRef(false);

  const scrollToBottom = (force = false) => {
    if (force || !isUserScrolling) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Check if user is near bottom (within 100px)
  const checkIfAtBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 100;
    const position = container.scrollTop + container.clientHeight;
    const height = container.scrollHeight;

    return position >= height - threshold;
  };

  // Handle scroll detection
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Detect manual scroll interactions (wheel, touch)
    const handleUserInteraction = () => {
      userScrolledAwayRef.current = true;
    };

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();

      // If user scrolled back to bottom, allow auto-scroll again
      if (atBottom) {
        userScrolledAwayRef.current = false;
        setIsUserScrolling(false);
      } else if (userScrolledAwayRef.current) {
        // User has manually scrolled and is not at bottom
        setIsUserScrolling(true);
      }
    };

    container.addEventListener("wheel", handleUserInteraction, {
      passive: true,
    });
    container.addEventListener("touchmove", handleUserInteraction, {
      passive: true,
    });
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("wheel", handleUserInteraction);
      container.removeEventListener("touchmove", handleUserInteraction);
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Auto-scroll only if user hasn't manually scrolled up
  useEffect(() => {
    // Check the actual scroll position directly, don't rely solely on state
    // This prevents race conditions during streaming
    const isAtBottom = checkIfAtBottom();
    const shouldAutoScroll = !userScrolledAwayRef.current || isAtBottom;

    if (shouldAutoScroll) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        // Double-check position before scrolling
        if (!userScrolledAwayRef.current || checkIfAtBottom()) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }, 10);
    }
  }, [messages]);

  useEffect(() => {
    getEcosystemStats()
      .then(setEcosystemStats)
      .catch((error) => {
        console.error("Failed to fetch ecosystem stats:", error);
      });
  }, []);

  // Auto-expand sources based on settings
  useEffect(() => {
    if (settings.showSources) {
      setExpandedSources((prevExpanded) => {
        const newExpanded = new Set(prevExpanded);
        let hasChanges = false;

        messages.forEach((message) => {
          if (
            message.role === "assistant" &&
            message.sources &&
            message.sources.length > 0 &&
            !prevExpanded.has(message.id)
          ) {
            newExpanded.add(message.id);
            hasChanges = true;

            // Also expand all source cards for this message
            setExpandedSourceCards((prev) => {
              const newSet = new Set(prev);
              message.sources!.forEach((source) => {
                const marker = source.marker?.replace(/[\[\]]/g, "") || "";
                newSet.add(`${message.id}-${marker}`);
              });
              return newSet;
            });
          }
        });

        return hasChanges ? newExpanded : prevExpanded;
      });
    }
  }, [messages, settings.showSources]);

  useEffect(() => {
    if (initialQuestion && !initialQuestionSentRef.current) {
      initialQuestionSentRef.current = true;
      handleSendMessage(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingDots("");
      return;
    }

    const dots = ["", ".", "..", "..."];
    let index = 0;

    const interval = setInterval(() => {
      setLoadingDots(dots[index]);
      index = (index + 1) % dots.length;
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading]);

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

    // Reset scroll state and force scroll to bottom for new query
    userScrolledAwayRef.current = false;
    setIsUserScrolling(false);
    setTimeout(() => scrollToBottom(true), 100);

    // Create placeholder assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      sources: [],
      metadata: {},
      progress: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const stream = sendChatMessageStream(text, settings.topK);

      for await (const event of stream) {
        if (event.type === "progress") {
          // Append progress step
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    progress: [
                      ...(msg.progress || []),
                      {
                        step: event.step || "unknown",
                        message: event.message || "",
                        data: event.data,
                      },
                    ],
                  }
                : msg,
            ),
          );
        } else if (event.type === "metadata") {
          // Update sources and metadata
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    sources: event.sources || [],
                    metadata: event.metadata,
                  }
                : msg,
            ),
          );
        } else if (event.type === "chunk") {
          // Append content chunk
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + (event.content || "") }
                : msg,
            ),
          );
        } else if (event.type === "error") {
          // Handle error
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: `Error: ${event.message || "Unknown error"}`,
                  }
                : msg,
            ),
          );
          break;
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
              }
            : msg,
        ),
      );
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

  const handleCitationClick = useCallback(
    (messageId: string, marker: string, allMarkers: string[]) => {
      // Expand sources for this message
      setExpandedSources((prev) => new Set(prev).add(messageId));
      // Auto-expand ALL source cards for this message
      setExpandedSourceCards((prev) => {
        const newSet = new Set(prev);
        allMarkers.forEach((m) => {
          newSet.add(`${messageId}-${m}`);
        });
        return newSet;
      });
      // Highlight the citation
      setHighlightedMarker({ messageId, marker });
      // Scroll to the citation card (with messageId to handle multiple messages)
      setTimeout(() => {
        const el = document.getElementById(`cite-card-${messageId}-${marker}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
      // Clear highlight after 2 seconds
      setTimeout(() => setHighlightedMarker(null), 2000);
    },
    [],
  );

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

  // Most frequently asked questions - optimized for 90% of users
  const suggestedQuestions = [
    "What is RAG?",
    "best embedding model",
    "What are the most popular vector databases?",
    "When should I use RAG?",
  ];

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-start justify-start pt-16 max-w-2xl">
              <h1 className="text-3xl sm:text-4xl font-light mb-4 text-charcoal leading-tight">
                Diagnose your RAG
              </h1>
              <p className="text-lg sm:text-xl text-stone mb-6 leading-relaxed max-w-xl font-light">
                Ask questions about RAG models, implementations, or trends.
              </p>

              {/* Ecosystem Stats */}
              {ecosystemStats && (
                <div className="flex flex-wrap gap-6 mb-16 text-xs text-stone uppercase tracking-wider font-normal">
                  <div className="border-b border-stone-border pb-1">
                    {ecosystemStats.total_models.toLocaleString()} Hugging Face
                    Models
                  </div>
                  <div className="border-b border-stone-border pb-1">
                    {ecosystemStats.total_repos.toLocaleString()} GitHub Repos
                  </div>
                  <div className="border-b border-stone-border pb-1">
                    {ecosystemStats.total_articles.toLocaleString()} Articles
                  </div>
                </div>
              )}

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
                {/* Progress Steps */}
                {message.role === "assistant" &&
                  message.progress &&
                  message.progress.length > 0 && (
                    <ProgressSteps
                      steps={message.progress}
                      isStreaming={isLoading && message.content.length === 0}
                    />
                  )}

                <div
                  className={`${message.role === "user" ? "text-right" : ""}`}
                >
                  {message.role === "assistant" ? (
                    message.content.length === 0 && isLoading ? (
                      <div className="text-base text-stone italic font-light">
                        Ragging{loadingDots}
                      </div>
                    ) : (
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
                              <ul className="mb-6 space-y-2 list-none pl-0 [&>li]:pl-6 [&>li]:relative [&>li]:before:content-['–'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-stone [&>li]:before:font-light">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="mb-6 space-y-2 list-decimal pl-6 [&>li]:pl-2">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="text-base sm:text-lg text-charcoal leading-relaxed mb-2">
                                {children}
                              </li>
                            ),
                            strong: ({ children }) => (
                              <strong className="text-charcoal font-normal">
                                {children}
                              </strong>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-2xl sm:text-3xl font-light text-charcoal mb-6 mt-8 border-b border-stone-border pb-3">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-xl sm:text-2xl font-normal text-charcoal mb-5 mt-8 border-b border-stone-border/50 pb-2">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-lg sm:text-xl font-normal text-charcoal mb-4 mt-6">
                                {children}
                              </h3>
                            ),
                            h4: ({ children }) => (
                              <h4 className="text-base sm:text-lg font-medium text-charcoal mb-3 mt-5 tracking-wide">
                                {children}
                              </h4>
                            ),
                            h5: ({ children }) => (
                              <h5 className="text-base font-medium text-charcoal mb-2 mt-4 tracking-wide uppercase text-stone">
                                {children}
                              </h5>
                            ),
                            h6: ({ children }) => (
                              <h6 className="text-sm font-medium text-stone mb-2 mt-3 tracking-wider uppercase">
                                {children}
                              </h6>
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
                            a: ({ children, href }) => {
                              // Handle citation links
                              if (href?.startsWith("#cite-")) {
                                const marker = href.replace("#cite-", "");
                                const allMarkers =
                                  message.sources
                                    ?.map((s) =>
                                      s.marker?.replace(/[\[\]]/g, ""),
                                    )
                                    .filter(Boolean) || [];
                                return (
                                  <button
                                    onClick={() =>
                                      handleCitationClick(
                                        message.id,
                                        marker,
                                        allMarkers as string[],
                                      )
                                    }
                                    className="inline-flex items-center justify-center w-5 h-5 mx-0.5 text-[10px] font-semibold rounded-full bg-stone-200 text-charcoal hover:bg-blue-500 hover:text-white cursor-pointer transition-colors align-super -translate-y-0.5"
                                    title={`Jump to source [${marker}]`}
                                  >
                                    {children}
                                  </button>
                                );
                              }
                              // Regular links
                              return (
                                <a
                                  href={href}
                                  className="text-charcoal hover:opacity-60 underline decoration-1 underline-offset-4 transition-opacity"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              );
                            },
                            table: ({ children }) => (
                              <div className="mb-6 overflow-x-auto">
                                <table className="w-full border-collapse">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="border-b border-stone-border">
                                {children}
                              </thead>
                            ),
                            tbody: ({ children }) => (
                              <tbody className="divide-y divide-stone-border">
                                {children}
                              </tbody>
                            ),
                            tr: ({ children }) => (
                              <tr className="hover:bg-cream/50 transition-colors">
                                {children}
                              </tr>
                            ),
                            th: ({ children }) => (
                              <th className="px-4 py-3 text-left text-sm font-medium text-charcoal uppercase tracking-wider">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-4 py-3 text-base text-charcoal align-top">
                                {children}
                              </td>
                            ),
                          }}
                        >
                          {preprocessCitationMarkers(
                            message.content,
                            message.sources || [],
                          )}
                        </ReactMarkdown>
                      </div>
                    )
                  ) : (
                    <div className="text-lg text-charcoal italic font-light">
                      {message.content}
                    </div>
                  )}
                </div>

                {/* Copy and Sources buttons for assistant messages - only show when streaming is complete */}
                {message.role === "assistant" && !isLoading && (
                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={() => handleCopy(message.content, message.id)}
                      className="text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider font-normal"
                      disabled={isLoading}
                    >
                      {copiedId === message.id ? "Copied" : "Copy"}
                    </button>
                    {message.sources && message.sources.length > 0 && (
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedSources);
                          const isExpanding = !newExpanded.has(message.id);

                          if (isExpanding) {
                            // Expanding: add message to expandedSources and expand all source cards
                            newExpanded.add(message.id);
                            setExpandedSourceCards((prev) => {
                              const newSet = new Set(prev);
                              message.sources!.forEach((source) => {
                                const marker =
                                  source.marker?.replace(/[\[\]]/g, "") || "";
                                newSet.add(`${message.id}-${marker}`);
                              });
                              return newSet;
                            });
                          } else {
                            // Collapsing: just remove from expandedSources
                            newExpanded.delete(message.id);
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
                {message.sources &&
                  message.sources.length > 0 &&
                  expandedSources.has(message.id) && (
                    <div className="mt-6 pt-6 border-t border-stone-border">
                      <div className="space-y-3">
                        {message.sources.map((source) => {
                          const isHighlighted =
                            highlightedMarker?.messageId === message.id &&
                            source.marker === `[${highlightedMarker.marker}]`;
                          const cardKey = `${message.id}-${source.marker?.replace(/[\[\]]/g, "")}`;
                          const isExpanded = expandedSourceCards.has(cardKey);
                          return (
                            <SourceCard
                              key={source.position}
                              source={source}
                              messageId={message.id}
                              highlighted={isHighlighted}
                              expanded={isExpanded}
                              onToggleExpand={() => {
                                setExpandedSourceCards((prev) => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(cardKey)) {
                                    newSet.delete(cardKey);
                                  } else {
                                    newSet.add(cardKey);
                                  }
                                  return newSet;
                                });
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {isUserScrolling && (
        <div className="absolute bottom-24 right-8 z-10">
          <button
            onClick={() => {
              setIsUserScrolling(false);
              scrollToBottom(true);
            }}
            className="bg-charcoal text-cream px-4 py-2 rounded-full shadow-lg hover:bg-stone transition-colors text-xs uppercase tracking-wider font-normal"
          >
            ↓ New messages
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-stone-border px-6 h-[76px] flex items-center bg-white">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex gap-4 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question..."
              className="flex-1 resize-none border-0 border-b border-stone-border px-0 py-2 text-base sm:text-lg text-charcoal placeholder-stone focus:outline-none focus:border-charcoal min-h-[32px] max-h-[150px] bg-transparent font-light"
              rows={1}
            />
            <div className="flex gap-3 items-center">
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !input.trim()}
                className="text-xs text-charcoal hover:opacity-60 disabled:opacity-30 transition-opacity uppercase tracking-wider pb-2 font-normal"
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
