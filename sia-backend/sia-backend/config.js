// sia-backend/config.js
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
