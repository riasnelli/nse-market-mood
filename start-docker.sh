#!/bin/bash

# Start Docker containers for NSE Market Mood
echo "🚀 Starting Docker containers..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Start containers
docker-compose up -d

# Wait a moment for containers to start
sleep 3

# Check container status
echo ""
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "📝 App logs (last 20 lines):"
docker-compose logs --tail=20 app

echo ""
echo "✅ If containers are running, access the app at: http://localhost:3001"
echo "📊 MongoDB Express (optional): http://localhost:8081 (admin/admin)"
echo ""
echo "To view logs: docker-compose logs -f app"
echo "To stop: docker-compose down"

