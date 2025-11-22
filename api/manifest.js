// Serve manifest.json with proper headers
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/manifest+json');
  
  try {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    res.status(200).send(manifestContent);
  } catch (error) {
    console.error('Error reading manifest.json:', error);
    res.status(404).json({ error: 'Manifest not found' });
  }
};

