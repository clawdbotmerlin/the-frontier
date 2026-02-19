const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Add LOT_SIZE constant after pool definition
if (!content.includes('const LOT_SIZE')) {
  content = content.replace(
    "const pool = new Pool({",
    "const LOT_SIZE = 100; // Shares per lot\\n\\nconst pool = new Pool({"
  );
}

// Fix average price calculation
content = content.replace(
  'avgBuyPrice: b.buyVolume > 0 ? b.buyValue / b.buyVolume : 0,',
  'avgBuyPrice: b.buyVolume > 0 ? b.buyValue / (b.buyVolume * LOT_SIZE) : 0,'
);
content = content.replace(
  'avgSellPrice: b.sellVolume > 0 ? b.sellValue / b.sellVolume : 0,',
  'avgSellPrice: b.sellVolume > 0 ? b.sellValue / (b.sellVolume * LOT_SIZE) : 0,'
);

// Add multi-timeframe function before getBrokerTransactionsFromDB
const timeframeFunction = `
// Get multi-timeframe broker data (1D, 1W, 1M, 1Y)
async function getMultiTimeframeData(symbol) {
  const client = await pool.connect();
  try {
    const stockResult = await client.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
    if (stockResult.rows.length === 0) return null;
    const stockId = stockResult.rows[0].id;
    
    const periods = [
      { key: '1D', days: 1 },
      { key: '1W', days: 7 },
      { key: '1M', days: 30 },
      { key: '1Y', days: 365 }
    ];
    
    const result = {};
    for (const period of periods) {
      const query = period.key === '1D' 
        ? \`SELECT b.code as broker_code, bt.buy_volume, bt.buy_value, bt.sell_volume, bt.sell_value
           FROM broker_transactions bt
           JOIN brokers b ON bt.broker_id = b.id
           WHERE bt.stock_id = \$1 AND DATE(bt.time) = (SELECT MAX(DATE(time)) FROM broker_transactions WHERE stock_id = \$1)\`
        : \`SELECT b.code as broker_code, 
                  SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value,
                  SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value
           FROM broker_transactions bt
           JOIN brokers b ON bt.broker_id = b.id
           WHERE bt.stock_id = \$1 AND bt.time >= NOW() - INTERVAL '\${period.days} days'
           GROUP BY b.code\`;
      
      const { rows } = await client.query(query, [stockId]);
      const brokers = rows.map(r => ({
        code: r.broker_code,
        buyVolume: parseInt(r.buy_volume) || 0,
        buyValue: parseInt(r.buy_value) || 0,
        sellVolume: parseInt(r.sell_volume) || 0,
        sellValue: parseInt(r.sell_value) || 0,
        netVolume: (parseInt(r.buy_volume) || 0) - (parseInt(r.sell_volume) || 0),
        netValue: (parseInt(r.buy_value) || 0) - (parseInt(r.sell_value) || 0),
        avgBuyPrice: r.buy_volume > 0 ? parseInt(r.buy_value) / (parseInt(r.buy_volume) * LOT_SIZE) : 0,
        avgSellPrice: r.sell_volume > 0 ? parseInt(r.sell_value) / (parseInt(r.sell_volume) * LOT_SIZE) : 0,
      }));
      
      const totalBuy = brokers.reduce((s, b) => s + b.buyValue, 0);
      const totalSell = brokers.reduce((s, b) => s + b.sellValue, 0);
      const topBrokers = brokers.sort((a, b) => b.netValue - a.netValue).slice(0, 5);
      
      result[period.key] = { brokers: topBrokers, totalBuy, totalSell, netFlow: totalBuy - totalSell };
    }
    return result;
  } finally {
    client.release();
  }
}
`;

if (!content.includes('getMultiTimeframeData')) {
  content = content.replace(
    '// Get real broker transactions from database',
    timeframeFunction + '// Get real broker transactions from database'
  );
}

// Add timeframes to API response
if (!content.includes('timeframes: await getMultiTimeframeData')) {
  content = content.replace(
    'scoreData: calculateBandarScore(price, indicators),',
    'scoreData: calculateBandarScore(price, indicators),\n        timeframes: await getMultiTimeframeData(price.symbol),'
  );
}

fs.writeFileSync('server.js', content);
console.log('Fixed avg prices and added multi-timeframe support');
