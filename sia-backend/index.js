'use strict';
require('dotenv').config();

const express = require('express');
const cfg     = require('./config');
const logger  = require('./services/logger');
const db      = require('./services/db');
const {
  helmetMiddleware, corsMiddleware, httpLogger,
  limiters, errorHandler, notFound,
} = require('./middleware');

// ── PUBLIC ROUTES ─────────────────────────────────────────────────
const chatRoute    = require('./routes/chat');
const jobdivaRoute = require('./routes/jobdiva');
const uploadRoute  = require('./routes/upload');
const contactRoute = require('./routes/contact');

// ── INTERNAL ROUTES ───────────────────────────────────────────────
const internalAuthRoute         = require('./routes/internal/auth');
const internalUsersRoute        = require('./routes/internal/users');
const internalCandidatesRoute   = require('./routes/internal/candidates');
const internalAiRoute           = require('./routes/internal/ai');
const internalReportsRoute      = require('./routes/internal/reports');
const internalNotificationsRoute= require('./routes/internal/notifications');

const app = express();
app.set('trust proxy', 1);

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(httpLogger);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/api/', limiters.global);

// ── HEALTH ────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const dbOk = await db.ping();
  res.status(200).json({
    ok: true, status: 'healthy', service: 'Switch4 Sia API v2',
    timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()),
    services: {
      llm:        cfg.openai.provider,
      database:   dbOk ? 'connected' : 'unavailable',
      cloudinary: cfg.cloudinary.configured ? 'configured' : 'local-fallback',
      email:      cfg.email.configured ? 'configured' : 'not-configured',
      jobdiva:    cfg.jobdiva.configured ? 'configured' : 'demo-mode',
    },
  });
});

// ── PUBLIC API ────────────────────────────────────────────────────
app.use('/api/chat',          chatRoute);
app.use('/api/jobdiva',       jobdivaRoute);
app.use('/api/upload-resume', uploadRoute);
app.use('/api',               contactRoute);  // /api/contact, /api/notify, /api/schedule-call

// ── INTERNAL API ──────────────────────────────────────────────────
app.use('/api/internal/auth',          internalAuthRoute);
app.use('/api/internal/users',         internalUsersRoute);
app.use('/api/internal/candidates',    internalCandidatesRoute);
app.use('/api/internal/ai',            internalAiRoute);
app.use('/api/internal/reports',       internalReportsRoute);
app.use('/api/internal',               internalNotificationsRoute);  // /notifications, /audit

// ── INTERNAL JOBDIVA (full access, no demo fallback) ──────────────
const { requireAuth } = require('./middleware/auth');
app.use('/api/internal/jobdiva', requireAuth, jobdivaRoute);

// ── 404 + ERROR ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── START ─────────────────────────────────────────────────────────
const server = app.listen(cfg.port, () => {
  const sep = '═'.repeat(60);

  void (async () => {
    let dbOk = false;
    try {
      dbOk = await db.ping();
    } catch {
      dbOk = false;
    }

    logger.info(sep);
    logger.info('  Switch4 Sia Platform API  v2.0');
    logger.info(`  Port:       ${cfg.port}  |  ${cfg.nodeEnv.toUpperCase()}`);
    logger.info(`  LLM:        ${cfg.openai.provider}`);
    logger.info(`  Database:   ${dbOk ? '✓ (reachable)' : '✗ (unreachable)'}`);
    logger.info(`  Cloudinary: ${cfg.cloudinary.configured ? '✓' : '✗ (local disk fallback)'}`);
    logger.info(`  Email:      ${cfg.email.configured ? '✓' : '✗ (not configured)'}`);
    logger.info(`  JobDiva:    ${cfg.jobdiva.configured ? '✓' : '✗ (demo mode)'}`);
    const corsLine = cfg.allowedOrigins.join(', ');
    logger.info(
      cfg.isDev
        ? `  CORS:       ${corsLine}  (+ localhost / 127.0.0.1 any port in dev)`
        : `  CORS:       ${corsLine}`,
    );
    logger.info(sep);
  })();
});

async function shutdown(sig) {
  logger.info(`${sig} — shutting down`);
  server.close(async () => { await db.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', r => logger.error('Unhandled rejection', { reason: String(r) }));
process.on('uncaughtException',  e => { logger.error('Uncaught exception', { message: e.message }); process.exit(1); });

module.exports = app;
