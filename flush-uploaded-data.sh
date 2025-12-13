#!/bin/bash

# Script to flush all uploaded CSV data from MongoDB
# This will delete all data from uploaded collections:
# - uploadedIndices
# - uploadedBhav
# - uploadedPreMarket
# - uploadedMarketActivity
# - uploadedWeek52

echo "🗑️  Flushing all uploaded CSV data from MongoDB..."
echo ""

# Get the base URL from environment or use default
BASE_URL="${VERCEL_URL:-http://localhost:3000}"
if [[ "$BASE_URL" != http* ]]; then
  BASE_URL="https://$BASE_URL"
fi

# Make POST request to flush endpoint
response=$(curl -s -X POST "$BASE_URL/api/flush-uploaded-data" \
  -H "Content-Type: application/json" \
  -w "\n%{http_code}")

# Extract status code (last line)
http_code=$(echo "$response" | tail -n1)
# Extract body (all but last line)
body=$(echo "$response" | head -n-1)

echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""
echo "HTTP Status: $http_code"

if [ "$http_code" = "200" ]; then
  echo "✅ Successfully flushed all uploaded CSV data!"
else
  echo "❌ Failed to flush data. Check the error message above."
  exit 1
fi
