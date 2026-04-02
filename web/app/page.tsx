import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="relative top-0 left-0 right-0 z-10 border-b border-stone-border bg-cream">
        <div className="px-6 sm:px-12 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              <span className="text-xs sm:text-sm font-light tracking-[0.2em] text-charcoal uppercase">
                RAGnosis
              </span>
            </Link>
            <div className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/analytics"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase"
              >
                Analytics
              </Link>
              <Link
                href="/chat"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase"
              >
                Launch
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Logo */}
      <main className="relative px-6 sm:px-12">
        <div className="py-16 sm:py-24 md:py-32 text-center">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-8 sm:mb-12">
            <Image
              src="/logo.svg"
              alt="RAGnosis Logo"
              width={160}
              height={160}
              className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-medium tracking-tight text-charcoal mb-6 sm:mb-8 uppercase text-center">
            RAGnosis
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl text-charcoal mb-10 sm:mb-12 leading-relaxed max-w-2xl mx-auto font-light">
            Diagnose your RAG
          </p>

          {/* CTA */}
          <Link
            href="/chat"
            className="inline-block px-6 sm:px-8 py-3 text-xs sm:text-sm uppercase tracking-[0.15em] border-2 border-charcoal text-charcoal hover:bg-charcoal hover:text-cream transition-all font-normal"
          >
            Start Exploring
          </Link>
        </div>

        {/* Quick Examples */}
        <div className="py-12 sm:py-16 border-t border-stone-border max-w-7xl  mx-auto">
          <h2 className="text-sm sm:text-base font-normal text-center mb-8 sm:mb-10 text-charcoal uppercase tracking-[0.15em]">
            Example Questions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ExampleQuestion text="What are the top embedding models?" />
            <ExampleQuestion text="Most popular RAG frameworks on GitHub?" />
            <ExampleQuestion text="LangChain vs LlamaIndex?" />
            <ExampleQuestion text="What are the best reranking models?" />
            <ExampleQuestion text="How does RAG work?" />
            <ExampleQuestion text="What's trending in RAG right now?" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-stone-border mt-12 sm:mt-20 bg-cream">
        <div className="px-6 sm:px-12 py-8 sm:py-10">
          <div className="text-xs sm:text-sm text-stone font-light">
            <p className="mb-3">
              Built to showcase production RAG systems, LLM-powered query
              understanding, and hybrid search architectures.
            </p>
            <p className="text-xs">© 2026 RAGNOSIS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ExampleQuestion({ text }: { text: string }) {
  return (
    <Link
      href={`/chat?q=${encodeURIComponent(text)}`}
      className="block p-3 sm:p-4 border border-stone-border bg-white hover:bg-charcoal hover:text-cream hover:border-charcoal transition-all text-xs sm:text-sm text-charcoal font-light"
    >
      {text}
    </Link>
  );
}
