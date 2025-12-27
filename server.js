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

/**
 * Normalize and mount an API route module
 * Supports multiple export patterns:
 * A) module.exports = router (Express Router)
 * B) module.exports = handler(req,res) (function)
 * C) module.exports = { router }
 * D) module.exports = { handler }
 * E) module.exports = { default: router/handler }
 * 
 * @param {express.Router} apiRouter - The API router to mount on
 * @param {string} path - Route path (without /api prefix)
 * @param {string} file - File name in /api directory
 * @throws {Error} If module cannot be loaded or is not mountable
 */
function mountApiRoute(apiRouter, path, file) {
  const filePath = `./api/${file}`;
  const pathModule = require('path');
  const fullPath = pathModule.join(__dirname, 'api', file);
  
  console.log(`\n📦 [API] Loading route: ${file}`);
  console.log(`   Path: /api/${path}`);
  console.log(`   Full path: ${fullPath}`);
  
  // Clear require cache to ensure fresh module load
  let resolvedPath;
  try {
    resolvedPath = require.resolve(filePath);
    if (require.cache[resolvedPath]) {
      delete require.cache[resolvedPath];
      console.log(`   ✅ Cleared require cache`);
    }
  } catch (resolveError) {
    throw new Error(`Cannot resolve module path for ${file}: ${resolveError.message}`);
  }
  
  // Load the module
  let mod;
  try {
    mod = require(filePath);
    console.log(`   ✅ Module loaded`);
    console.log(`   Export type: ${typeof mod}`);
    console.log(`   Export keys: ${Object.keys(mod || {}).join(', ') || '(none)'}`);
  } catch (loadError) {
    throw new Error(`Failed to load module ${file}: ${loadError.message}\nStack: ${loadError.stack}`);
  }
  
  // Detect if it's a router or handler
  // Rule: If module has .stack OR .use OR .get AND is NOT a function → Express Router
  // Rule: If module is a function → serverless handler
  let router = null;
  let handler = null;
  
  // Check if it's a function first (handler)
  if (typeof mod === 'function') {
    handler = mod;
    console.log(`   ✅ Detected as HANDLER (function export)`);
  }
  // Check if it's an object with router characteristics
  else if (mod && typeof mod === 'object') {
    // Check for Express Router: has .stack OR .use OR .get AND is NOT a function
    const hasStack = mod.stack !== undefined;
    const hasUse = mod.use && typeof mod.use === 'function';
    const hasGet = mod.get && typeof mod.get === 'function';
    const isRouter = hasStack || hasUse || hasGet;
    
    if (isRouter) {
      router = mod;
      console.log(`   ✅ Detected as ROUTER (has ${hasStack ? '.stack' : hasUse ? '.use' : '.get'})`);
    }
    // Check for router in properties
    else if (mod.router) {
      const subMod = mod.router;
      const subHasStack = subMod.stack !== undefined;
      const subHasUse = subMod.use && typeof subMod.use === 'function';
      const subHasGet = subMod.get && typeof subMod.get === 'function';
      if (subHasStack || subHasUse || subHasGet) {
        router = subMod;
        console.log(`   ✅ Detected router in .router property`);
      }
    }
    // Check for default router
    else if (mod.default && typeof mod.default === 'object') {
      const subMod = mod.default;
      const subHasStack = subMod.stack !== undefined;
      const subHasUse = subMod.use && typeof subMod.use === 'function';
      const subHasGet = subMod.get && typeof subMod.get === 'function';
      if (subHasStack || subHasUse || subHasGet) {
        router = subMod;
        console.log(`   ✅ Detected router in .default property`);
      }
    }
    // Check for handler in properties (if not a router)
    if (!router) {
      if (mod.handler && typeof mod.handler === 'function') {
        handler = mod.handler;
        console.log(`   ✅ Detected handler in .handler property`);
      } else if (mod.default && typeof mod.default === 'function') {
        handler = mod.default;
        console.log(`   ✅ Detected handler in .default property`);
      }
    }
  }
  
  // Validate we found something mountable
  if (!router && !handler) {
    const errorMsg = `Module ${file} is not mountable. Expected router or handler function.\n` +
      `Type: ${typeof mod}\n` +
      `Keys: ${Object.keys(mod || {}).join(', ') || '(none)'}\n` +
      `Value: ${JSON.stringify(mod, null, 2).substring(0, 200)}`;
    throw new Error(errorMsg);
  }
  
  // Mount the route
  const routePath = `/${path}`;
  
  if (router) {
    // Mount Express Router - DO NOT wrap with wrapServerlessHandler
    // DO NOT register individual HTTP verbs - router handles its own routing
    apiRouter.use(routePath, router);
    console.log(`   ✅ [API] Mounted /api${routePath} from ${file} as ROUTER`);
  } else if (handler) {
    // Mount serverless handler - wrap with serverless wrapper
    const wrappedHandler = wrapServerlessHandler(handler);
    
    // Add logging wrapper
    const loggedHandler = (req, res, next) => {
      console.log(`🎯 Route handler called for ${req.method} ${req.path} (route: /api${routePath})`);
      wrappedHandler(req, res, next);
    };
    
    // Register for all HTTP methods using .all()
    apiRouter.all(routePath, loggedHandler);
    
    console.log(`   ✅ [API] Mounted /api${routePath} from ${file} as HANDLER`);
  }
  
  // Verify route was added
  const routeAdded = apiRouter.stack.some(layer => {
    if (layer.route && layer.route.path === routePath) return true;
    if (layer.regexp && layer.regexp.test(routePath)) return true;
    if (layer.name === 'router' && layer.regexp && layer.regexp.test(`/${path}`)) return true;
    return false;
  });
  
  if (routeAdded) {
    console.log(`   ✅ Verified route in router stack`);
  } else {
    console.warn(`   ⚠️  Route not immediately visible in stack (may be nested)`);
  }
}

// Mount all API routes with robust error handling
apiRoutes.forEach(({ path, file }) => {
  try {
    mountApiRoute(apiRouter, path, file);
    loadedRoutes++;
  } catch (error) {
    console.error(`\n❌ CRITICAL: Failed to mount API route ${path} from ${file}`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    failedRoutes++;
    // THROW to crash server - routes must be mountable
    throw new Error(`Cannot mount API route ${path} from ${file}. Server cannot start. Original error: ${error.message}`);
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

// Note: Fallback routes removed - if routing fails, server will crash fast to reveal bugs
// The mountApiRoute function now throws errors if routes cannot be mounted

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

