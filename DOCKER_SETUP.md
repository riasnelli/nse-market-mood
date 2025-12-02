# Docker Development Setup

This guide explains how to run the NSE Market Mood application locally using Docker for development purposes.

## Prerequisites

- [Docker](https://www.docker.com/get-started) (version 20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0 or higher)

## Quick Start

1. **Clone the repository** (if you haven't already)
   ```bash
   git clone <your-repo-url>
   cd nse-market-mood
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update the MongoDB URI if needed (default works for Docker setup).

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Application: http://localhost:3001
   - MongoDB Express (optional): http://localhost:8081 (admin/admin)

## Docker Compose Services

### 1. App Service
- **Port**: 3001 (changed from 3000 to avoid conflicts)
- **Description**: Main application running Express dev server
- **Hot Reload**: Enabled (code changes reflect automatically via volume mounting)
- **Note**: Uses Express server for Docker. For Vercel CLI, use `npm run dev:vercel` locally

### 2. MongoDB Service
- **Port**: 27017
- **Description**: Local MongoDB database
- **Data Persistence**: Data is stored in Docker volume `mongo-data`

### 3. Mongo Express (Optional)
- **Port**: 8081
- **Description**: Web-based MongoDB admin interface
- **Start with**: `docker-compose --profile tools up -d`
- **Credentials**: admin/admin (change in docker-compose.yml for production)

## Common Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f mongo
```

### Rebuild after changes
```bash
docker-compose up -d --build
```

### Access MongoDB shell
```bash
docker-compose exec mongo mongosh nse-market-mood
```

### Access application container shell
```bash
docker-compose exec app sh
```

### Clean everything (including volumes)
```bash
docker-compose down -v
```

## Development Workflow

1. **Make code changes** in your local files
2. **Changes are automatically reflected** (volume mounting enables hot reload)
3. **Test locally** at http://localhost:3001
4. **Commit and push** when ready for production

## Environment Variables

Create a `.env` file in the project root with:

```env
MONGODB_URI=mongodb://mongo:27017/nse-market-mood
storage_MONGODB_URI=mongodb://mongo:27017/nse-market-mood
NSE_API_BASE_URL=https://www.nseindia.com/api
```

For production deployment, these should be set in your Vercel project settings.

## Troubleshooting

### Port already in use
If port 3001 or 27017 is already in use, modify the ports in `docker-compose.yml`:
```yaml
ports:
  - "3002:3001"  # Change 3002 to any available port (left side is host, right is container)
```

### MongoDB connection issues
1. Check if MongoDB container is running: `docker-compose ps`
2. Check MongoDB logs: `docker-compose logs mongo`
3. Verify connection string in `.env` file

### Application not starting
1. Check application logs: `docker-compose logs app`
2. Verify all dependencies are installed: `docker-compose exec app npm install`
3. Rebuild the container: `docker-compose up -d --build`

### Vercel CLI authentication
If you get Vercel authentication errors:
```bash
docker-compose exec app vercel login
```

## Production Deployment

**Important**: This Docker setup is for **development only**. For production:

1. **Deploy to Vercel** (recommended):
   ```bash
   vercel --prod
   ```

2. **Or use Vercel Dashboard**:
   - Connect your GitHub repository
   - Vercel will auto-detect and deploy

3. **Set environment variables** in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add all required variables from `.env.example`

## Data Persistence

MongoDB data is persisted in Docker volumes:
- `mongo-data`: Database files
- `mongo-config`: Configuration files

To backup data:
```bash
docker-compose exec mongo mongodump --out /data/backup
```

To restore data:
```bash
docker-compose exec mongo mongorestore /data/backup
```

## Stopping and Cleanup

### Stop services (keeps data)
```bash
docker-compose stop
```

### Stop and remove containers (keeps data)
```bash
docker-compose down
```

### Stop and remove everything including data
```bash
docker-compose down -v
```

**Warning**: The last command will delete all MongoDB data!

## Next Steps

1. ✅ Docker setup complete
2. ✅ Test locally at http://localhost:3000
3. ✅ Make your changes
4. ✅ Test thoroughly
5. ✅ Commit and push to production

Happy coding! 🚀

