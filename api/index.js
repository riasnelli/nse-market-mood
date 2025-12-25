/**
 * Wrapper for serverless function handlers to work with Express
 * Handles async/await, errors, and preserves req/res compatibility
 */

/**
 * Wraps a serverless function handler to work with Express
 * @param {Function} handler - The serverless function handler (async (req, res) => {})
 * @returns {Function} Express-compatible middleware function
 */
function wrapServerlessHandler(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Handler must be a function');
  }

  return async (req, res, next) => {
    try {
      // Call the handler with Express req/res
      // Handlers are expected to be async (req, res) => {}
      const result = await handler(req, res);
      
      // If handler returns a value but hasn't sent a response, it might be a serverless format
      // Check if response was sent
      if (!res.headersSent && !res.writableEnded && result !== undefined) {
        // Handler might have returned a serverless response format
        // Try to handle it (though our handlers should use Express res directly)
        console.warn('Handler returned a value but did not send a response. Using return value.');
        if (typeof result === 'object' && result !== null) {
          res.json(result);
        } else {
          res.send(result);
        }
      }
      
      // If handler didn't send response and didn't return anything, that's an error
      if (!res.headersSent && !res.writableEnded) {
        console.warn('Handler did not send a response');
        res.status(500).json({
          success: false,
          error: 'Handler did not send a response'
        });
      }
    } catch (error) {
      console.error('Error in wrapped handler:', error);
      console.error('Error stack:', error.stack);
      
      // Only send error if response hasn't been sent
      if (!res.headersSent && !res.writableEnded) {
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          errorType: error.name || 'UnknownError',
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        });
      } else {
        console.error('⚠️ Response already sent, cannot send error response');
      }
    }
  };
}

module.exports = {
  wrapServerlessHandler
};

