'use strict';
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Switch4 SIA Backend is running!' });
});

// Chat endpoint (demo for now)
app.post('/api/chat', (req, res) => {
  const { messages } = req.body;
  res.json({ 
    reply: "Hello! I'm Sia, Switch4's AI Recruitment Assistant. How can I help you with jobs or interviews today?" 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Switch4 SIA Backend running on port ${PORT}`);
});
