# Dockerfile for NSE Market Mood - Development
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all files
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start development server
# Option 1: Use Express dev server (recommended for Docker)
CMD ["node", "server.js"]

# Option 2: Use Vercel dev (uncomment if you prefer)
# RUN npm install -g vercel@latest
# CMD ["vercel", "dev", "--listen", "0.0.0.0:3000"]

