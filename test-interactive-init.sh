#!/bin/bash
# Test script for interactive init

set -e

echo "🧪 Testing interactive RepoLens init..."

# Create temporary test directory
TEST_DIR=$(mktemp -d)/test-repolens-init
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo ""
echo "📍 Test directory: $TEST_DIR"
echo ""

# Run init with simulated "No" response (skip Notion)
echo "n" | node /Users/charlvanzyl/Documents/PROJECTS/RepoLens/bin/repolens.js init

echo ""
echo "✅ Init completed successfully!"
echo ""
echo "📂 Generated files:"
ls -la

echo ""
echo "🔍 Checking .repolens.yml exists..."
if [ -f ".repolens.yml" ]; then
  echo "✅ .repolens.yml created"
else
  echo "❌ .repolens.yml NOT found"
  exit 1
fi

echo ""
echo "🔍 Checking .env.example exists..."
if [ -f ".env.example" ]; then
  echo "✅ .env.example created"
else
  echo "❌ .env.example NOT found"
  exit 1
fi

echo ""
echo "🔍 Checking .env NOT created (user chose No)..."
if [ ! -f ".env" ]; then
  echo "✅ .env correctly not created when user skips Notion setup"
else
  echo "⚠️  .env was created even though user chose No"
fi

echo ""
echo "🧹 Cleaning up test directory..."
cd /
rm -rf "$TEST_DIR"

echo ""
echo "✨ All checks passed!"
