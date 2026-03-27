# Claude.mk - Custom development tasks
#
# ARCHITECTURE NOTES:
# - Edge function runs LOCALLY (via "make chat")
# - Uses LOCAL LLM (Ollama) - see llm.ts
# - Connects to REMOTE Supabase database (cloud)
# - Deploy schema: Copy-paste supabase/schema/*.sql into Supabase SQL Editor
# - Smart search: Now uses LLM-based query preprocessing (Ollama)

include .env
export

test: ## Test edge function (Usage: make test Q="your query here")
	@curl -X POST http://localhost:54321/functions/v1/rag-chat \
		-H "Content-Type: application/json" \
		-d '{"query": "$(Q)", "top_k": 5}' | jq

db: ## Query remote database (Usage: make db Q="supabase" to search models)
	@curl -s -X POST "$(SUPABASE_URL)/rest/v1/rpc/keyword_search_models" \
		-H "apikey: $(SUPABASE_SERVICE_KEY)" \
		-H "Content-Type: application/json" \
		-d '{"search_query": "$(Q)", "query_limit": 5}' | jq
