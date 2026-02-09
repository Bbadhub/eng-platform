#!/bin/bash
#
# Engineering Platform Compliance Checker
#
# Validates that a project meets platform standards
#
# Usage:
#   ./scripts/check-compliance.sh [project-dir]

set -e

PROJECT_DIR="${1:-.}"
PLATFORM_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔍 Checking compliance for: $PROJECT_DIR"
echo "📋 Platform: $PLATFORM_DIR"
echo ""

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_file() {
  local file="$1"
  local description="$2"
  local severity="${3:-ERROR}"

  if [ ! -f "$PROJECT_DIR/$file" ]; then
    if [ "$severity" = "ERROR" ]; then
      echo -e "${RED}✗${NC} Missing: $file ($description)"
      ((ERRORS++))
    else
      echo -e "${YELLOW}⚠${NC} Missing: $file ($description)"
      ((WARNINGS++))
    fi
    return 1
  else
    echo -e "${GREEN}✓${NC} Found: $file"
    return 0
  fi
}

check_command() {
  local cmd="$1"
  local description="$2"

  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} Missing command: $cmd ($description)"
    ((WARNINGS++))
    return 1
  fi
  return 0
}

echo "=== Essential Files ==="
check_file "package.json" "Project manifest"
check_file ".gitignore" "Git ignore rules"
check_file "README.md" "Project documentation"
check_file "CLAUDE.md" "AI context file" "WARN"
echo ""

echo "=== Linting & Formatting ==="
check_file ".eslintrc.js" "ESLint config" "WARN"
check_file ".prettierrc" "Prettier config" "WARN"
check_file ".prettierignore" "Prettier ignore" "WARN"
echo ""

echo "=== TypeScript ==="
check_file "tsconfig.json" "TypeScript config" "WARN"
echo ""

echo "=== Testing ==="
check_file "vitest.config.ts" "Vitest config" "WARN"
if check_command "npm"; then
  if cd "$PROJECT_DIR" && npm run test --if-present &> /dev/null; then
    echo -e "${GREEN}✓${NC} Tests runnable"
  else
    echo -e "${YELLOW}⚠${NC} No test script found"
    ((WARNINGS++))
  fi
fi
echo ""

echo "=== CI/CD ==="
check_file ".github/workflows/ci.yml" "CI workflow" "WARN"
echo ""

echo "=== Git Hooks ==="
check_file ".husky/pre-commit" "Pre-commit hook" "WARN"
echo ""

echo "=== Security ==="
check_file ".env.example" "Environment template" "WARN"
if grep -r "API_KEY\|SECRET\|PASSWORD" "$PROJECT_DIR" --exclude-dir=node_modules --exclude=".env.example" | grep -v "EXAMPLE" | head -1; then
  echo -e "${RED}✗${NC} Possible secrets in code (check output above)"
  ((ERRORS++))
else
  echo -e "${GREEN}✓${NC} No obvious secrets found"
fi
echo ""

echo "=== Summary ==="
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Compliance check FAILED${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  Compliance check passed with warnings${NC}"
  exit 0
else
  echo ""
  echo -e "${GREEN}✅ Compliance check PASSED${NC}"
  exit 0
fi
