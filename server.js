// Simple development server for Docker/local development
// This serves the static files and proxies API requests to the API functions

const express = require('express');
const path = require('path');
const { createServer } = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// Body parser for API routes with increased limits for large CSV uploads
// MUST be before static files to handle POST requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware - log all API requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}${req.url !== req.path ? ` (${req.url})` : ''}`);
  }
  next();
});

// CORS middleware - MUST be before routes
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

// CRITICAL: Add test routes FIRST, before anything else
// These should work if server.js is running
console.log('🔧 Registering test routes...');
app.get('/api/test', (req, res) => {
  console.log('✅ /api/test route hit!');
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    serverFile: 'server.js'
  });
});

app.get('/api/data-test', (req, res) => {
  console.log('✅ /api/data-test route hit!');
  res.json({
    success: true,
    message: 'Data route test endpoint',
    path: req.path,
    url: req.url,
    query: req.query
  });
});

console.log('✅ Test routes registered');

// Mount API routes BEFORE static files and catch-all
console.log('🔌 Loading API routes...');
let loadedRoutes = 0;
let failedRoutes = 0;

apiRoutes.forEach(({ path, file }) => {
  try {
    console.log(`📦 Loading ${file}...`);
    const handlerModule = require(`./api/${file}`);
    
    // Handle both direct exports and authMiddleware-wrapped exports
    let handler;
    if (typeof handlerModule === 'function') {
      handler = handlerModule;
    } else if (handlerModule.default) {
      handler = handlerModule.default;
    } else {
      handler = handlerModule;
    }
    
    if (typeof handler !== 'function') {
      console.error(`❌ Handler for ${path} is not a function. Type: ${typeof handler}`);
      console.error(`   Module keys:`, Object.keys(handlerModule || {}));
      console.error(`   Module value:`, handlerModule);
      failedRoutes++;
      return;
    }
    
    // Mount route - use app.all to handle all HTTP methods
    // Express automatically handles query parameters (e.g., /api/data?action=save)
    const routePath = `/api/${path}`;
    app.all(routePath, async (req, res) => {
      try {
        console.log(`🔍 [${new Date().toISOString()}] Handling ${req.method} ${req.path}${req.url !== req.path ? ` (full: ${req.url})` : ''} on route ${routePath}`);
        await handler(req, res);
        if (!res.headersSent) {
          console.warn(`⚠️ Handler for ${routePath} did not send a response`);
          res.status(500).json({ 
            success: false,
            error: 'Handler did not send a response'
          });
        }
      } catch (error) {
        console.error(`❌ Error in ${routePath}:`, error);
        console.error(`   Error stack:`, error.stack);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
          });
        } else {
          console.error(`⚠️ Response already sent for ${routePath}`);
        }
      }
    });
    
    console.log(`✅ Mounted API route: ${routePath} (${typeof handler})`);
    loadedRoutes++;
  } catch (error) {
    console.error(`❌ Could not load API route ${path}:`, error.message);
    console.error(`   Stack:`, error.stack);
    failedRoutes++;
    // Don't exit - continue loading other routes
  }
});
console.log(`✅ Finished loading routes: ${loadedRoutes} successful, ${failedRoutes} failed`);

// Serve static files from public directory (AFTER API routes)
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all non-API routes (SPA routing) - MUST be last
// Only match GET requests that aren't API routes
app.get('*', (req, res) => {
  // Don't serve HTML for API routes - this should never be reached if routes are mounted correctly
  if (req.path.startsWith('/api/')) {
    console.error(`❌ API route not found - catch-all reached: ${req.method} ${req.path}`);
    return res.status(404).json({ 
      success: false,
      error: 'API route not found',
      path: req.path,
      method: req.method,
      message: 'This error indicates routes were not mounted correctly. Check server logs.'
    });
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
  
  // Log all mounted routes for debugging
  console.log('\n📋 Mounted Routes:');
  let routeCount = 0;
  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        console.log(`   ${methods} ${middleware.route.path}`);
        routeCount++;
      } else if (middleware.name === 'router') {
        console.log(`   Router: ${middleware.regexp}`);
      } else if (middleware.regexp && middleware.name) {
        console.log(`   Middleware: ${middleware.name} - ${middleware.regexp}`);
      }
    });
  }
  console.log(`\n✅ Total routes mounted: ${routeCount}`);
  console.log(`✅ Test routes: GET /api/test, GET /api/data-test`);
  console.log(`✅ API routes loaded: ${loadedRoutes} successful, ${failedRoutes} failed`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

