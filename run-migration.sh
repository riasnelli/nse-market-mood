#!/bin/bash

# Migration script to backfill signals for existing data
# Usage: ./run-migration.sh [APP_KEY] [BASE_URL] [days]

APP_KEY="${1:-$APP_KEY}"
BASE_URL="${2:-https://nse-market-mood-git-main-muhammed-rias-as-projects.vercel.app}"
DAYS="${3:-0}"  # 0 = all dates

if [ -z "$APP_KEY" ]; then
    echo "Error: APP_KEY is required"
    echo "Usage: ./run-migration.sh YOUR_APP_KEY [BASE_URL] [days]"
    echo "   or: APP_KEY=your_key ./run-migration.sh"
    exit 1
fi

echo "🔄 Running migration for signals backfill..."
echo "   Base URL: $BASE_URL"
echo "   Days: $DAYS (0 = all dates)"
echo ""

# Step 1: Dry run to see what would be generated
echo "📊 Step 1: Dry run (checking what would be generated)..."
DRY_RUN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/migrate-signals?dry_run=true&days=$DAYS" \
  -H "x-app-key: $APP_KEY" \
  -H "Content-Type: application/json")

echo "$DRY_RUN_RESPONSE" | jq '.' 2>/dev/null || echo "$DRY_RUN_RESPONSE"
echo ""

# Ask for confirmation
read -p "Do you want to proceed with actual migration? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Migration cancelled."
    exit 0
fi

# Step 2: Actually generate signals
echo ""
echo "🚀 Step 2: Generating signals (this may take a while)..."
MIGRATION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/migrate-signals?apply=true&days=$DAYS" \
  -H "x-app-key: $APP_KEY" \
  -H "Content-Type: application/json")

echo "$MIGRATION_RESPONSE" | jq '.' 2>/dev/null || echo "$MIGRATION_RESPONSE"
echo ""
echo "✅ Migration complete!"

