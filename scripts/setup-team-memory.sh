#!/bin/bash
# Setup script for team memory with git hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔧 Setting up team memory with git hooks..."
echo ""

# 1. Create .shared directory if it doesn't exist
mkdir -p "$REPO_ROOT/.shared"

# 2. Initialize team memory if it doesn't exist
TEAM_MEMORY="$REPO_ROOT/.shared/team-memory.json"
if [ ! -f "$TEAM_MEMORY" ]; then
    cat > "$TEAM_MEMORY" <<EOF
{
  "version": "1.0.0",
  "last_updated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "entities": {},
  "relations": [],
  "observations": []
}
EOF
    echo "✅ Created team-memory.json"
else
    echo "✅ team-memory.json already exists"
fi

# 3. Install git hooks
HOOKS_DIR="$REPO_ROOT/.git/hooks"
mkdir -p "$HOOKS_DIR"

# Copy post-merge hook
if [ -f "$REPO_ROOT/.githooks/post-merge" ]; then
    cp "$REPO_ROOT/.githooks/post-merge" "$HOOKS_DIR/post-merge"
    chmod +x "$HOOKS_DIR/post-merge"
    echo "✅ Installed post-merge hook"
fi

# Copy pre-push hook
if [ -f "$REPO_ROOT/.githooks/pre-push" ]; then
    cp "$REPO_ROOT/.githooks/pre-push" "$HOOKS_DIR/pre-push"
    chmod +x "$HOOKS_DIR/pre-push"
    echo "✅ Installed pre-push hook"
fi

# 4. Configure git to use hooks directory (alternative approach)
git config core.hooksPath "$REPO_ROOT/.githooks" 2>/dev/null || true

# 5. Update .mcp.json template to point to team memory
MCP_TEMPLATE="$REPO_ROOT/templates/.mcp.json"
if [ -f "$MCP_TEMPLATE" ]; then
    # Create backup
    cp "$MCP_TEMPLATE" "$MCP_TEMPLATE.backup"

    # Update MEMORY_FILE_PATH to point to team memory
    # This is a placeholder - actual path depends on where eng-platform is cloned
    echo "⚠️  Manual step needed:"
    echo "   Update ~/.claude/.mcp.json to point to:"
    echo "   MEMORY_FILE_PATH: $TEAM_MEMORY"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Commit the team-memory.json file:"
echo "   git add .shared/team-memory.json .githooks/"
echo "   git commit -m 'feat: add team memory with git sync'"
echo "   git push"
echo ""
echo "2. Each team member runs:"
echo "   cd eng-platform && ./scripts/setup-team-memory.sh"
echo ""
echo "3. Each team member updates ~/.claude/.mcp.json:"
echo "   MEMORY_FILE_PATH: \"$TEAM_MEMORY\""
echo ""
