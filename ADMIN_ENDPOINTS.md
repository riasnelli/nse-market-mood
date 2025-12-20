# Admin Endpoints Guide

This document describes how to use the admin endpoints for cleanup and migration tasks.

## Prerequisites

- Set `APP_KEY` environment variable in your deployment (Vercel, etc.)
- Use the `APP_KEY` value in the `x-app-key` header for all admin requests

## Endpoints

### 1. Cleanup Types (`/api/admin/cleanup-types`)

Fixes database pollution by moving documents to correct collections based on filename detection.

**Usage:**

```bash
# Dry run (default) - see what would be fixed
curl -X POST "https://your-domain.com/api/admin/cleanup-types?dry_run=true" \
  -H "x-app-key: YOUR_APP_KEY"

# Actually apply fixes
curl -X POST "https://your-domain.com/api/admin/cleanup-types?apply=true&dry_run=false" \
  -H "x-app-key: YOUR_APP_KEY"

# Scan last 60 days (default is 30)
curl -X POST "https://your-domain.com/api/admin/cleanup-types?apply=true&days=60" \
  -H "x-app-key: YOUR_APP_KEY"

# Scan all records (use with caution)
curl -X POST "https://your-domain.com/api/admin/cleanup-types?apply=true&days=0" \
  -H "x-app-key: YOUR_APP_KEY"
```

**Response:**

```json
{
  "success": true,
  "dry_run": false,
  "applied": true,
  "days": 30,
  "report": {
    "scanned": {
      "indices": 45,
      "bhav": 30,
      "premarket": 25,
      "marketactivity": 20,
      "52w": 15
    },
    "mismatches": 12,
    "moved": 8,
    "updated": 4,
    "skippedUnknown": 0,
    "examples": [
      {
        "fileName": "sec_bhavdata_full_20251219.csv",
        "from": "uploadedIndices",
        "to": "uploadedBhav",
        "oldType": "indices",
        "newType": "bhav",
        "detectedType": "bhav"
      }
    ],
    "errors": []
  },
  "message": "Cleanup complete. Moved 8 documents, updated 4 type fields, skipped 0 unknown types."
}
```

**What it does:**

1. Scans all uploaded collections (indices, bhav, premarket, marketactivity, 52w)
2. Detects file type from filename using strict patterns
3. If `doc.type` mismatches detected type OR document is in wrong collection:
   - Moves document to correct collection (if `apply=true`)
   - Updates `doc.type` field to match detected type
4. Skips documents with unknown types (doesn't delete them)
5. Returns summary with examples

**Safety:**

- Default is `dry_run=true` - no changes made
- Documents are only moved after successful insert into correct collection
- Unknown types are skipped, not deleted
- Idempotent - safe to run multiple times

---

### 2. Migrate Signals (`/api/admin/migrate-signals`)

Backfills signals for existing uploaded data that doesn't have signals yet.

**Usage:**

```bash
# Dry run (default) - see what would be generated
curl -X POST "https://your-domain.com/api/admin/migrate-signals?dry_run=true" \
  -H "x-app-key: YOUR_APP_KEY"

# Actually generate signals
curl -X POST "https://your-domain.com/api/admin/migrate-signals?apply=true&dry_run=false" \
  -H "x-app-key: YOUR_APP_KEY"

# Process last 60 days (default is 30)
curl -X POST "https://your-domain.com/api/admin/migrate-signals?apply=true&days=60" \
  -H "x-app-key: YOUR_APP_KEY"

# Process all dates (use with caution)
curl -X POST "https://your-domain.com/api/admin/migrate-signals?apply=true&days=0" \
  -H "x-app-key: YOUR_APP_KEY"

# Use specific strategy
curl -X POST "https://your-domain.com/api/admin/migrate-signals?apply=true&strategy=momentum_gap" \
  -H "x-app-key: YOUR_APP_KEY"
```

**Response:**

```json
{
  "success": true,
  "dry_run": false,
  "applied": true,
  "days": 30,
  "strategy": "momentum_gap",
  "report": {
    "scanned": 13,
    "processed": 13,
    "byStatus": {
      "READY": 5,
      "NO_MATCH": 6,
      "INSUFFICIENT_DATA": 2,
      "ERROR": 0
    },
    "successful": 13,
    "errors": 0,
    "results": [
      {
        "date": "2025-12-19",
        "status": "READY",
        "signal_count": 8,
        "message": "Generated 8 signals"
      },
      {
        "date": "2025-12-18",
        "status": "NO_MATCH",
        "signal_count": 0,
        "message": "No stocks met criteria"
      }
    ],
    "errors": []
  },
  "message": "Migration complete. Processed 13 dates: 5 READY, 6 NO_MATCH, 2 INSUFFICIENT_DATA, 0 ERROR."
}
```

**What it does:**

1. Scans uploaded collections (bhav, premarket) and daily collections
2. Finds dates that have data but no signals in `signals_store`
3. For each date:
   - Checks for required datasets (bhav for yesterday, premarket for today)
   - If missing → saves `INSUFFICIENT_DATA` status
   - If available → generates signals using strategy logic
   - If 0 matches → saves `NO_MATCH` status
   - If matches → saves `READY` status with signals array
4. Saves results to `signals_store` collection with unique key `{date, strategy}`
5. Returns summary with counts by status

**Status Meanings:**

- `READY`: Signals generated successfully
- `NO_MATCH`: Strategy ran but no stocks met criteria (valid outcome)
- `INSUFFICIENT_DATA`: Missing required files (bhav or premarket)
- `ERROR`: Generation failed due to error

**Safety:**

- Default is `dry_run=true` - no changes made
- Uses upsert - safe to run multiple times (overwrites existing records)
- Only processes dates that don't already have signals (unless overwriting)

---

## Environment Variables

- `APP_KEY`: Required for admin authentication (set in Vercel dashboard or `.env`)
- `MONGODB_URI`: Required for database access
- `DEBUG`: Set to `true` for verbose logging (optional)
- `NODE_ENV`: Set to `production` to disable debug info in API responses (optional)

## Troubleshooting

### "Unauthorized" error

- Check that `APP_KEY` is set in environment variables
- Verify the `x-app-key` header matches `APP_KEY` exactly
- Check for typos in the header name (should be `x-app-key`, lowercase)

### "No mismatches found" but warnings persist

- Run cleanup with `days=0` to scan all records (not just last 30 days)
- Check that `apply=true` and `dry_run=false` are both set
- Verify the endpoint is actually being called (check server logs)

### Migration shows "INSUFFICIENT_DATA" for all dates

- Ensure bhavcopy files are uploaded for the dates you're migrating
- Ensure premarket files are uploaded for the dates you're migrating
- Check that files are in the correct collections (run cleanup-types first)

### Signals still show "NO_MATCH" after migration

- This is normal - it means the strategy ran but no stocks met the criteria
- Check the debug info in the API response (`?debug=1`) to see filter details
- Consider adjusting strategy parameters if needed

