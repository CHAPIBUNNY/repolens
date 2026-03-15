#!/bin/bash
# Quick test to demonstrate interactive prompts work

set -e

echo "🧪 Testing npx repolens init with interactive prompts..."
echo ""

# Create temp directory
TEST_DIR=$(mktemp -d)/test-npx-prompts
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📍 Test directory: $TEST_DIR"
echo ""
echo "▶️  Running: npx repolens@latest init"
echo "   (Interactive prompts should appear)"
echo ""

# This will show interactive prompts
npx repolens@latest init

echo ""
echo "✨ Test complete!"
echo ""
echo "🔍 Check if files were created:"
ls -la

echo ""
echo "🧹 Cleanup:"
cd /
rm -rf "$TEST_DIR"
echo "✅ Done!"
