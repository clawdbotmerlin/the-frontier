import express from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function setupDashboard(app) {
  app.get('/', (req, res) => {
    const htmlPath = join(__dirname, '..', 'dashboard.html');
    try {
      const html = readFileSync(htmlPath, 'utf8');
      res.send(html);
    } catch (error) {
      res.json({ 
        status: 'OK', 
        message: 'Bandarmology API Server Running',
        endpoints: [
          '/api/screener',
          '/api/stock/:symbol',
          '/api/backtest',
          '/api/health'
        ]
      });
    }
  });
}
