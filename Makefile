.PHONY: help setup chat scrape-sitemap embed pipeline env-prod env-local env-status

help: ## Show available commands
	@echo "RAGnosis - Simple Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Setup local development (Supabase + Ollama + Models)
	@echo "🚀 Setting up local development environment..."
	@echo ""
	@echo "1️⃣  Starting Supabase..."
	supabase start
	@echo ""
	@echo "2️⃣  Applying migrations..."
	supabase db reset
	@echo ""
	@echo "3️⃣  Deploying schema functions..."
	./scripts/deploy-schema.sh local
	@echo ""
	@echo "4️⃣  Starting Ollama..."
	docker compose up -d
	@sleep 3
	@echo ""
	@echo "5️⃣  Pulling required models..."
	docker compose exec ollama ollama pull qwen2.5:3b-instruct
	docker compose exec ollama ollama pull nomic-embed-text
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "💡 Next step: Run 'make pipeline' to populate data, then 'make chat'"

chat: ## Run chat interface (starts edge functions + UI)
	@echo "💬 Starting RAGnosis..."
	@echo ""
	@echo "Starting edge functions in background..."
	@supabase functions serve --env-file .env --no-verify-jwt > /dev/null 2>&1 & echo $$! > .edge-function.pid
	@sleep 2
	@echo "✅ Edge function running at http://localhost:54321/functions/v1/rag-chat"
	@echo ""
	@echo "Starting Streamlit UI..."
	@streamlit run src/agent/research_agent.py; kill `cat .edge-function.pid` 2>/dev/null || true; rm -f .edge-function.pid

scrape-sitemap: ## Scrape from sitemaps (historical backfill - RECOMMENDED)
	@echo "🗺️  Scraping blog articles from sitemaps..."
	@echo "💡 This fetches ALL articles (100s-1000s vs ~15 from RSS)"
	@echo ""
	python -m src.data_collection.content.blog_orchestrator sitemap
	@echo ""
	@echo "✅ Sitemap scraping complete!"
	@echo "💡 Next: Run 'make embed' to create embeddings"

embed: ## Create vector embeddings for all new data
	@echo "🧮 Creating vector embeddings..."
	@echo "📦 Loading sentence-transformer model (takes ~30 seconds)..."
	@echo ""
	python src/data_collection/vector_embedder.py
	@echo ""
	@echo "✅ Embeddings complete!"

pipeline: ## Fetch market data (HF/GitHub/Trends) - run 'make embed' after
	@echo "🚀 Fetching market data..."
	@echo ""
	python src/data_collection/pipeline.py
	@echo ""
	@echo "✅ Market data collected!"
	@echo "💡 Next: Run 'make embed' to create embeddings"

env-prod: ## Switch to production environment (.env.prod → .env)
	@if [ ! -f .env.prod ]; then echo "❌ .env.prod not found!"; exit 1; fi
	@cp .env .env.local.backup 2>/dev/null || true
	@cp .env.prod .env
	@echo "✅ Switched to PRODUCTION environment"
	@echo "⚠️  WARNING: All commands now use PRODUCTION database!"

env-local: ## Switch to local environment (.env.local.backup → .env)
	@if [ ! -f .env.local.backup ]; then echo "❌ .env.local.backup not found!"; exit 1; fi
	@cp .env.local.backup .env
	@echo "✅ Switched to LOCAL environment"

env-status: ## Show current environment
	@echo "Current environment (.env):"
	@grep "SUPABASE_URL" .env 2>/dev/null || echo "❌ No .env file found"
