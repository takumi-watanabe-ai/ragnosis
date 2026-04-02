"use client";

import { useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SimpleChatInterface,
  SimpleChatInterfaceHandle,
} from "@/components/SimpleChatInterface";
import { QuickQuestions } from "@/components/QuickQuestions";
import { Settings, type SettingsConfig } from "@/components/Settings";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsConfig>({
    showSources: true,
    topK: 5,
    temperature: 0.7,
    maxTokens: 500,
  });
  const chatRef = useRef<SimpleChatInterfaceHandle>(null);

  const handleQuestionSelect = (question: string) => {
    chatRef.current?.sendMessage(question);
    setSidebarOpen(false);
  };

  const handleNewChat = () => {
    chatRef.current?.clearChat();
  };

  return (
    <div className="flex h-screen bg-cream">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-stone-border bg-cream">
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <QuickQuestions onSelectQuestion={handleQuestionSelect} />
        </div>
        <div className="px-6 py-6 border-t border-stone-border">
          <Settings settings={settings} onSettingsChange={setSettings} />
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-charcoal/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-cream border-r border-stone-border flex flex-col">
            <div className="px-6 py-6 border-b border-stone-border flex items-center justify-end">
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider font-normal"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <QuickQuestions onSelectQuestion={handleQuestionSelect} />
            </div>
            <div className="px-6 py-6 border-t border-stone-border">
              <Settings settings={settings} onSettingsChange={setSettings} />
            </div>
          </aside>
        </div>
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-stone-border bg-cream px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-xs text-stone hover:text-charcoal transition-colors uppercase tracking-wider"
              >
                Menu
              </button>
              <Link href="/" className="hover:opacity-70 transition-opacity">
                <span className="text-sm font-light tracking-[0.2em] text-charcoal uppercase">
                  RAGnosis
                </span>
              </Link>
              <Link
                href="/analytics"
                className="hidden sm:block text-xs text-stone hover:text-charcoal transition-opacity uppercase tracking-wider"
              >
                Analytics
              </Link>
            </div>
            <button
              onClick={handleNewChat}
              className="text-xs text-charcoal hover:opacity-60 transition-opacity uppercase tracking-wider"
            >
              New Chat
            </button>
          </div>
        </header>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden">
          <SimpleChatInterface
            ref={chatRef}
            initialQuestion={searchParams.get("q")}
            settings={settings}
          />
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-cream flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
