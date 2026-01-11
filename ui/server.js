// Healthcheck endpoint for platform
import process from 'node:process';
app.get('/', (req, res) => {
  res.status(200).type('text/plain').send('OK');
});
// Production server for UI - serves static files and proxies API to Raincloud
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Raincloud API URL - use Railway internal networking
const API_URL = process.env.RAINCLOUD_URL || 'http://raincloud.railway.internal:3000';

console.log(`[UI] Starting with API proxy to: ${API_URL}`);

// Proxy /api requests to Raincloud
app.use(
  '/api',
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    cookieDomainRewrite: '',
    onProxyReq: (proxyReq, req) => {
      // Forward cookies
      if (req.headers.cookie) {
        proxyReq.setHeader('Cookie', req.headers.cookie);
      }
    },
    onProxyRes: (proxyRes) => {
      // Allow cookies to be set
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
          cookie.replace(/;\s*secure/gi, '').replace(/;\s*samesite=\w+/gi, '; SameSite=Lax')
        );
      }
    },
  })
);

// Proxy /auth requests to Raincloud
app.use(
  '/auth',
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    cookieDomainRewrite: '',
    onProxyReq: (proxyReq, req) => {
      if (req.headers.cookie) {
        proxyReq.setHeader('Cookie', req.headers.cookie);
      }
    },
    onProxyRes: (proxyRes) => {
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
          cookie.replace(/;\s*secure/gi, '').replace(/;\s*samesite=\w+/gi, '; SameSite=Lax')
        );
      }
    },
  })
);

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[UI] Server running on port ${PORT}`);
});
