// Simple development server for Docker/local development
// This serves the static files and proxies API requests to the API functions

const express = require('express');
const path = require('path');
const { createServer } = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Body parser for API routes with increased limits for large CSV uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Internal-Key, x-app-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Import and mount API routes (current routes)
const apiRoutes = [
  { path: 'data', file: 'data.js' },
  { path: 'signals', file: 'signals.js' },
  { path: 'market', file: 'market.js' },
  { path: 'nse-data', file: 'nse-data.js' },
  { path: 'download-nse-csvs', file: 'download-nse-csvs.js' },
  { path: 'data-debug', file: 'data-debug.js' },
  { path: 'admin', file: 'admin.js' }
];

// Mount API routes
apiRoutes.forEach(({ path, file }) => {
  try {
    const handlerModule = require(`./api/${file}`);
    // Handle both direct exports and authMiddleware-wrapped exports
    const handler = typeof handlerModule === 'function' 
      ? handlerModule 
      : (handlerModule.default || handlerModule);
    
    if (typeof handler !== 'function') {
      console.warn(`⚠️ Handler for ${path} is not a function:`, typeof handler);
      return;
    }
    
    app.all(`/api/${path}`, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`Error in /api/${path}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    });
    
    // Also handle query parameter routes (e.g., /api/data?action=save)
    app.all(`/api/${path}/*`, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`Error in /api/${path}/*:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    });
    
    console.log(`✅ Mounted API route: /api/${path}`);
  } catch (error) {
    console.error(`❌ Could not load API route ${path}:`, error.message);
    console.error(`   Stack:`, error.stack);
  }
});

// Serve index.html for all non-API routes (SPA routing)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NSE Market Mood Dev Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Access the app at: http://localhost:${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
  console.log(`🔌 API routes available at: /api/*`);
  console.log(`💡 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

