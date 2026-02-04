// Load environment variables for tests
const dotenv = require('dotenv');
const path = require('path');

// Try .env.local first, then fall back to .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

const fs = require('fs');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn('No .env or .env.local file found. Tests may fail without API keys.');
}
