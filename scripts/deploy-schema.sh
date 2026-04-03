#!/bin/bash

# ============================================================================
# Deploy Schema to Local Supabase Database
# ============================================================================
# This script deploys all schema files to your local Supabase database
# Usage: ./scripts/deploy-schema.sh
# ============================================================================

set -e # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default Supabase local connection string
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

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

echo -e "${BLUE}[2/3] Deploying Private Schema${NC}"
echo -e "${BLUE}========================================${NC}"
execute_sql "$PROJECT_ROOT/supabase/schema/private/vector-search.sql" "Vector search functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/metadata-queries.sql" "Metadata query functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/document-queries.sql" "Document query functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/market-analysis.sql" "Market analysis functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/repo-insights.sql" "Repository insights functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/analytics-queries.sql" "Analytics query functions"
execute_sql "$PROJECT_ROOT/supabase/schema/private/trends-analysis.sql" "Analytics trend query functions"
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
execute_sql "$PROJECT_ROOT/supabase/schema/public/trends-analysis.sql" "Public trend analytics API"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Schema deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
