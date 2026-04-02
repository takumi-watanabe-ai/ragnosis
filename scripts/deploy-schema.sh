#!/bin/bash

# ============================================================================
# Deploy Schema to Local Supabase Database
# ============================================================================
# This script deploys all schema files to your local Supabase database
# Usage: ./scripts/deploy-schema.sh
#
# Options:
#   --migration-only    Only run the migration, skip schema files
#   --schema-only       Only run schema files, skip migration
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default Supabase local connection string
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

# Parse arguments
MIGRATION_ONLY=false
SCHEMA_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --migration-only)
      MIGRATION_ONLY=true
      shift
      ;;
    --schema-only)
      SCHEMA_ONLY=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RAGnosis Schema Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Database URL:${NC} $DB_URL"
echo -e "${YELLOW}Project Root:${NC} $PROJECT_ROOT"
echo ""

# Function to execute SQL file
execute_sql() {
  local file=$1
  local description=$2
  echo -e "${YELLOW}→${NC} $description"
  if psql "$DB_URL" -f "$file" -q; then
    echo -e "  ${GREEN}✓${NC} Success"
  else
    echo -e "  ${RED}✗${NC} Failed"
    exit 1
  fi
}

# 1. Run migration
if [ "$SCHEMA_ONLY" = false ]; then
  echo -e "${BLUE}[1/3] Running Migration${NC}"
  echo -e "${BLUE}========================================${NC}"
  execute_sql "$PROJECT_ROOT/supabase/migrations/20260328_init.sql" "Applying init migration"
  echo ""
fi

# 2. Deploy private schema files
if [ "$MIGRATION_ONLY" = false ]; then
  echo -e "${BLUE}[2/3] Deploying Private Schema${NC}"
  echo -e "${BLUE}========================================${NC}"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/vector-search.sql" "Vector search functions"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/metadata-queries.sql" "Metadata query functions"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/document-queries.sql" "Document query functions"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/market-analysis.sql" "Market analysis functions"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/repo-insights.sql" "Repository insights functions"
  execute_sql "$PROJECT_ROOT/supabase/schema/private/analytics-queries.sql" "Analytics query functions"
  echo ""

  # 3. Deploy public schema files
  echo -e "${BLUE}[3/3] Deploying Public Schema${NC}"
  echo -e "${BLUE}========================================${NC}"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/vector-search.sql" "Public vector search API"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/metadata-queries.sql" "Public metadata API"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/document-queries.sql" "Public document query API"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/market-analysis.sql" "Public market analysis API"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/repo-insights.sql" "Public repo insights API"
  execute_sql "$PROJECT_ROOT/supabase/schema/public/analytics-queries.sql" "Public analytics API"
  echo ""
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Schema deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
