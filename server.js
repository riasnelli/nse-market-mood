// Simple development server for Docker/local development
// This serves the static files and proxies API requests to the API functions

const express = require('express');
const path = require('path');
const { createServer } = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Body parser for API routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import and mount API routes
const apiRoutes = [
  'nse-data',
  'dhan-data',
  'test-dhan',
  'save-uploaded-data',
  'get-uploaded-data',
  'get-uploaded-dates',
  'generate-signals',
  'get-latest-signal-date',
  'test-generate-signals',
  'get-signals',
  'check-date-data',
  'manifest'
];

// Mount API routes
apiRoutes.forEach(route => {
  try {
    const handler = require(`./api/${route}.js`);
    app.all(`/api/${route}`, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`Error in /api/${route}:`, error);
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.warn(`Could not load API route ${route}:`, error.message);
  }
});

// Handle upload routes
const uploadRoutes = ['bhavcopy', 'indices', 'preopen'];
uploadRoutes.forEach(route => {
  try {
    const handler = require(`./api/upload/${route}.js`);
    app.all(`/api/upload/${route}`, async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`Error in /api/upload/${route}:`, error);
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.warn(`Could not load upload route ${route}:`, error.message);
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

