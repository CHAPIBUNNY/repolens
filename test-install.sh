#!/bin/bash
set -e

echo "🧪 Testing RepoLens tarball installation..."

# Build package
echo "📦 Building tarball..."
npm pack

# Setup clean test directory
TEST_DIR="/tmp/repolens-install-test-$$"
echo "🗂️  Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Install tarball
echo "📥 Installing tarball..."
npm init -y > /dev/null
TARBALL=$(ls $OLDPWD/repolens-*.tgz | head -1)
npm install "$TARBALL"

# Test CLI commands
echo "✅ Testing CLI commands..."
echo -n "  Version: "
npx repolens --version

echo "  Help output:"
npx repolens --help | head -5

# Cleanup
cd - > /dev/null
rm -rf "$TEST_DIR"
echo "🧹 Cleaned up test directory"

echo "✨ Tarball installation test passed!"
