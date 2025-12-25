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
// MUST be before routes to log all requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}${req.url !== req.path ? ` (${req.url})` : ''}`);
    console.log(`   Query:`, req.query);
    console.log(`   Route stack check:`, app._router?.stack?.filter(layer => {
      if (layer.route) {
        return layer.route.path === req.path || req.path.startsWith(layer.route.path);
      }
      return false;
    }).map(layer => layer.route.path) || []);
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

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    routes: {
      test: '/api/test',
      dataTest: '/api/data-test',
      data: '/api/data'
    }
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

// Test route to verify /api/data path is accessible
app.all('/api/data-test-all', (req, res) => {
  console.log(`✅ /api/data-test-all route hit! Method: ${req.method}`);
  res.json({
    success: true,
    message: 'Data route test endpoint (all methods)',
    method: req.method,
    path: req.path,
    url: req.url,
    query: req.query
  });
});

// Direct test route for /api/data to verify routing works
// This bypasses dynamic loading to test if Express routing works at all
app.all('/api/data-direct-test', (req, res) => {
  console.log(`✅ /api/data-direct-test route hit! Method: ${req.method}`);
  res.json({
    success: true,
    message: 'Direct /api/data test endpoint',
    method: req.method,
    path: req.path,
    url: req.url,
    query: req.query,
    note: 'If you see this, routing is working. The issue is with dynamic route loading.'
  });
});

console.log('✅ Test routes registered');

// Mount API routes BEFORE static files and catch-all
console.log('🔌 Loading API routes...');
let loadedRoutes = 0;
let failedRoutes = 0;

// Import wrapper function for serverless handlers
let wrapServerlessHandler;
try {
  const wrapperModule = require('./api/index');
  wrapServerlessHandler = wrapperModule.wrapServerlessHandler;
  if (typeof wrapServerlessHandler !== 'function') {
    throw new Error('wrapServerlessHandler is not a function');
  }
  console.log('✅ Serverless handler wrapper loaded');
} catch (error) {
  console.error('❌ Failed to load serverless handler wrapper:', error.message);
  console.error('   Stack:', error.stack);
  // Create a fallback wrapper
  wrapServerlessHandler = (handler) => {
    return async (req, res, next) => {
      try {
        await handler(req, res);
        if (!res.headersSent && !res.writableEnded) {
          res.status(500).json({ success: false, error: 'Handler did not send a response' });
        }
      } catch (err) {
        console.error('Error in handler:', err);
        if (!res.headersSent && !res.writableEnded) {
          res.status(500).json({ success: false, error: err.message });
        }
      }
    };
  };
  console.log('⚠️ Using fallback wrapper');
}

// Use Express Router for better route management
const apiRouter = express.Router();

// Add middleware to log all requests hitting the router
// CRITICAL: This must be BEFORE routes are registered so it doesn't interfere
apiRouter.use((req, res, next) => {
  console.log(`📥 Router received: ${req.method} ${req.path} (original: ${req.originalUrl}, query: ${JSON.stringify(req.query)})`);
  next();
});

apiRoutes.forEach(({ path, file }) => {
  try {
    console.log(`📦 Loading ${file}...`);
    const filePath = `./api/${file}`;
    const pathModule = require('path');
    const fullPath = pathModule.join(__dirname, 'api', file);
    console.log(`   Full path: ${fullPath}`);
    
    // Clear require cache to ensure fresh module load
    const resolvedPath = require.resolve(filePath);
    if (require.cache[resolvedPath]) {
      delete require.cache[resolvedPath];
      console.log(`   ✅ Cleared require cache for ${file}`);
    }
    
    const handlerModule = require(filePath);
    console.log(`   Module loaded. Type: ${typeof handlerModule}`);
    console.log(`   Module keys: ${Object.keys(handlerModule || {}).join(', ')}`);
    
    // Check for handler in multiple locations: module, module.default, module.handler
    let handler;
    if (typeof handlerModule === 'function') {
      handler = handlerModule;
      console.log(`   ✅ Handler found as direct export`);
    } else if (handlerModule.default && typeof handlerModule.default === 'function') {
      handler = handlerModule.default;
      console.log(`   ✅ Handler found as default export`);
    } else if (handlerModule.handler && typeof handlerModule.handler === 'function') {
      handler = handlerModule.handler;
      console.log(`   ✅ Handler found as .handler property`);
    } else {
      console.error(`❌ Handler for ${path} is not a function. Type: ${typeof handlerModule}`);
      console.error(`   Module keys:`, Object.keys(handlerModule || {}));
      console.error(`   Module value:`, handlerModule);
      failedRoutes++;
      return;
    }
    
    if (typeof handler !== 'function') {
      console.error(`❌ Handler for ${path} is not a function. Type: ${typeof handler}`);
      failedRoutes++;
      return;
    }
    
    console.log(`   ✅ Handler is a function, wrapping and mounting route`);
    
    // Wrap handler with serverless wrapper
    const wrappedHandler = wrapServerlessHandler(handler);
    
    // Mount route on router - use path without /api prefix since router will be mounted at /api
    const routePath = `/${path}`;
    
    // Add logging wrapper to track if route handler is called
    const loggedHandler = (req, res, next) => {
      console.log(`🎯 Route handler called for ${req.method} ${req.path} (route: /api${routePath})`);
      wrappedHandler(req, res, next);
    };
    
    // Register for all HTTP methods explicitly - this is the most reliable approach
    apiRouter.get(routePath, loggedHandler);
    apiRouter.post(routePath, loggedHandler);
    apiRouter.put(routePath, loggedHandler);
    apiRouter.delete(routePath, loggedHandler);
    apiRouter.patch(routePath, loggedHandler);
    apiRouter.options(routePath, loggedHandler);
    
    // Immediately verify the route was added to the stack
    const routeAdded = apiRouter.stack.some(layer => 
      (layer.route && layer.route.path === routePath) || 
      (layer.regexp && layer.regexp.test(routePath))
    );
    if (routeAdded) {
      console.log(`✅ Mounted API route: /api${routePath} - verified in router stack`);
    } else {
      console.error(`❌ FAILED to mount route /api${routePath} - not found in router stack!`);
      console.error(`   Router stack length: ${apiRouter.stack.length}`);
      console.error(`   Router stack:`, apiRouter.stack.map(l => {
        if (l.route) return `ROUTE:${l.route.path}`;
        if (l.regexp) return `MIDDLEWARE:${l.regexp.source}`;
        return `UNKNOWN:${l.name || 'anonymous'}`;
      }));
    }
    loadedRoutes++;
  } catch (error) {
    console.error(`❌ Could not load API route ${path}:`, error.message);
    console.error(`   Stack:`, error.stack);
    failedRoutes++;
    // Don't exit - continue loading other routes
  }
});

// Mount the API router at /api
// CRITICAL: This must be before static files and catch-all route
console.log('🔌 Mounting API router at /api...');
const routerStackLength = apiRouter.stack?.length || 0;
console.log(`   Router has ${routerStackLength} routes registered`);

if (routerStackLength === 0) {
  console.error('❌ WARNING: Router has no routes! Routes were not registered correctly.');
} else {
  // Log ALL layers (routes and middleware)
  console.log('   Router stack layers:');
  apiRouter.stack.forEach((layer, index) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      console.log(`     ${index + 1}. ROUTE: ${methods} /api${layer.route.path}`);
    } else if (layer.name === 'router') {
      console.log(`     ${index + 1}. ROUTER: ${layer.regexp?.source || 'unknown'}`);
    } else {
      console.log(`     ${index + 1}. MIDDLEWARE: ${layer.name || 'anonymous'} (path: ${layer.regexp?.source || 'unknown'})`);
    }
  });
}

// Mount the router at /api (middleware already added above, before routes)
app.use('/api', apiRouter);
console.log('✅ API router mounted at /api');

// Add a simple test to verify router is working
app.get('/api/router-test', (req, res) => {
  res.json({
    success: true,
    message: 'Router test - if you see this, router mounting works',
    timestamp: new Date().toISOString()
  });
});

// CRITICAL FALLBACK: Add a direct route for /api/data as a last resort
// This ensures /api/data works even if router mounting fails
// Register this AFTER the router so router takes precedence, but before static files
let dataHandlerLoaded = false;
let fallbackDataHandler = null;

try {
  console.log('🔧 Loading fallback /api/data route handler...');
  const dataModule = require('./api/data');
  let dataHandler = null;
  
  if (typeof dataModule === 'function') {
    dataHandler = dataModule;
    console.log('   ✅ Handler found as direct export');
  } else if (dataModule.default && typeof dataModule.default === 'function') {
    dataHandler = dataModule.default;
    console.log('   ✅ Handler found as default export');
  } else if (dataModule.handler && typeof dataModule.handler === 'function') {
    dataHandler = dataModule.handler;
    console.log('   ✅ Handler found as .handler property');
  }
  
  if (dataHandler && typeof dataHandler === 'function') {
    fallbackDataHandler = wrapServerlessHandler(dataHandler);
    dataHandlerLoaded = true;
    console.log('   ✅ Fallback handler wrapped and ready');
  } else {
    console.error('   ❌ Could not find data handler for fallback route');
    console.error('   Module type:', typeof dataModule);
    console.error('   Module keys:', Object.keys(dataModule || {}));
  }
} catch (error) {
  console.error('❌ Error loading fallback /api/data route:', error.message);
  console.error('   Stack:', error.stack);
}

// Register fallback route AFTER router (so router takes precedence)
// But make sure it's registered before static files
if (fallbackDataHandler) {
  app.all('/api/data', (req, res, next) => {
    console.log(`🔄 Fallback /api/data route hit for ${req.method} ${req.path}${req.url !== req.path ? ` (${req.url})` : ''}`);
    console.log(`   Response already sent: ${res.headersSent}, writableEnded: ${res.writableEnded}`);
    
    // Check if response was already sent (router handled it)
    if (res.headersSent || res.writableEnded) {
      console.log(`   ⚠️ Response already sent, skipping fallback handler`);
      return; // Router already handled it
    }
    
    console.log(`   ✅ Calling fallback handler...`);
    fallbackDataHandler(req, res, next);
  });
  console.log('✅ Fallback /api/data route registered (will be used if router fails)');
} else {
  console.error('❌ Fallback /api/data route NOT registered - handler loading failed');
}

// Add a direct test route for /api/data to help diagnose routing issues
app.get('/api/data-test-route', (req, res) => {
  res.json({
    success: true,
    message: 'Direct /api/data test route - Express routing works',
    path: req.path,
    url: req.url,
    query: req.query,
    method: req.method,
    dataHandlerLoaded: dataHandlerLoaded,
    note: 'If you see this, Express can match /api/data paths. Check router mounting if /api/data still fails.'
  });
});

console.log(`✅ Finished loading routes: ${loadedRoutes} successful, ${failedRoutes} failed`);

// Verify routes are registered by logging Express router stack
console.log('\n📋 Verifying registered routes...');
const registeredRoutes = [];

function logRoutes(layer, prefix = '') {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
    registeredRoutes.push(`${methods} ${prefix}${layer.route.path}`);
  } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
    // This is a router, recurse into it
    const routerPrefix = layer.regexp.source.replace('\\/?', '').replace('(?=\\/|$)', '').replace(/\\\//g, '/').replace(/^\^|\$$/g, '');
    layer.handle.stack.forEach(nestedLayer => logRoutes(nestedLayer, routerPrefix));
  }
}

if (app._router && app._router.stack) {
  app._router.stack.forEach(layer => logRoutes(layer));
}

console.log(`   Found ${registeredRoutes.length} registered routes:`);
registeredRoutes.forEach(route => console.log(`   - ${route}`));

// Specifically check for /api/data route
const dataRouteExists = registeredRoutes.some(route => route.includes('/data') || route.includes('/api/data'));
if (dataRouteExists) {
  console.log('   ✅ /api/data route is registered');
} else {
  console.error('   ❌ /api/data route is NOT registered!');
  console.error('   Available routes:', registeredRoutes);
}

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
  console.log('\n📋 Mounted Routes Summary:');
  let routeCount = 0;
  const routeList = [];
  
  function collectRoutes(layer, prefix = '') {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      const fullPath = prefix + layer.route.path;
      routeList.push(`${methods} ${fullPath}`);
      routeCount++;
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // This is a router, recurse into it
      const routerPrefix = layer.regexp.source
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/^\^|\$$/g, '')
        .replace(/\(/g, '')
        .replace(/\)/g, '');
      layer.handle.stack.forEach(nestedLayer => collectRoutes(nestedLayer, routerPrefix));
    }
  }
  
  if (app._router && app._router.stack) {
    app._router.stack.forEach(layer => collectRoutes(layer));
  }
  
  routeList.forEach(route => console.log(`   ${route}`));
  console.log(`\n✅ Total routes mounted: ${routeCount}`);
  console.log(`✅ Test routes: GET /api/test, GET /api/data-test, GET /api/health`);
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

