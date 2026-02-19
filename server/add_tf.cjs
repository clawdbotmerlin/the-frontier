const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const tfFunction = `
// Get multi-timeframe broker data
async function getMultiTimeframeData(symbol) {
  const client = await pool.connect();
  try {
    const stockResult = await client.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
    if (stockResult.rows.length === 0) return null;
    const stockId = stockResult.rows[0].id;
    
    const result = {};
    const periods = [
      { key: '1D', days: 1 },
      { key: '1W', days: 7 },
      { key: '1M', days: 30 },
      { key: '1Y', days: 365 }
    ];
    
    for (const p of periods) {
      let sql;
      if (p.key === '1D') {
        sql = \`SELECT b.code, bt.buy_volume, bt.buy_value, bt.sell_volume, bt.sell_value 
               FROM broker_transactions bt 
               JOIN brokers b ON bt.broker_id = b.id 
               WHERE bt.stock_id = \$1 AND DATE(bt.time) = (SELECT MAX(DATE(time)) FROM broker_transactions WHERE stock_id = \$1)\`;
      } else {
        sql = \`SELECT b.code, SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value, 
                      SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value 
               FROM broker_transactions bt 
               JOIN brokers b ON bt.broker_id = b.id 
               WHERE bt.stock_id = \$1 AND bt.time >= NOW() - INTERVAL '\${p.days} days' 
               GROUP BY b.code\`;
      }
      const { rows } = await client.query(sql, [stockId]);
      const brokers = rows.map(r => ({
        code: r.code,
        buyVolume: parseInt(r.buy_volume) || 0,
        sellVolume: parseInt(r.sell_volume) || 0,
        netVolume: (parseInt(r.buy_volume) || 0) - (parseInt(r.sell_volume) || 0),
        avgPrice: r.buy_volume > 0 ? (parseInt(r.buy_value) / (parseInt(r.buy_volume) * 100)) : 0
      })).sort((a,b) => b.netVolume - a.netVolume).slice(0,5);
      result[p.key] = { brokers, count: rows.length };
    }
    return result;
  } finally { client.release(); }
}
`;

if (!content.includes('getMultiTimeframeData')) {
  content = content.replace('// Get real broker transactions', tfFunction + '// Get real broker transactions');
}

if (!content.includes('timeframes: await getMultiTimeframeData')) {
  content = content.replace('scoreData: calculateBandarScore(price, indicators),', 'scoreData: calculateBandarScore(price, indicators),\n        timeframes: await getMultiTimeframeData(price.symbol),');
}

fs.writeFileSync('server.js', content);
console.log('Added multi-timeframe');
