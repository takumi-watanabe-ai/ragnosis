#!/bin/bash

# ============================================================================
# Deploy Single Schema File to Local Supabase Database
# ============================================================================
# This script deploys a single schema file to your local Supabase database
# Usage: ./scripts/deploy-single.sh <path-to-sql-file>
#
# Example:
#   ./scripts/deploy-single.sh supabase/schema/private/vector-search.sql
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

# Check if file argument provided
if [ $# -eq 0 ]; then
  echo -e "${RED}Error: No SQL file specified${NC}"
  echo ""
  echo "Usage: $0 <path-to-sql-file>"
  echo ""
  echo "Example:"
  echo "  $0 supabase/schema/private/vector-search.sql"
  exit 1
fi

SQL_FILE=$1

# Check if file exists
if [ ! -f "$SQL_FILE" ]; then
  echo -e "${RED}Error: File not found: $SQL_FILE${NC}"
  exit 1
fi

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Make path absolute if relative
if [[ "$SQL_FILE" != /* ]]; then
  SQL_FILE="$PROJECT_ROOT/$SQL_FILE"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Deploying SQL File${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}File:${NC} $SQL_FILE"
echo -e "${YELLOW}Database:${NC} $DB_URL"
echo ""

# Execute the SQL file
echo -e "${YELLOW}→${NC} Executing SQL..."
if psql "$DB_URL" -f "$SQL_FILE"; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ Deployment successful!${NC}"
  echo -e "${GREEN}========================================${NC}"
else
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}✗ Deployment failed${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
