/**
 * Backtest Engine for Bandar Strategy
 * Simulates trading performance based on Bandar Strength signals
 */

// Generate historical price data for backtesting (simulated)
function generateHistoricalData(currentPrice, days, volatility = 0.02) {
  const prices = [];
  let price = currentPrice;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Random walk with drift
    const change = (Math.random() - 0.48) * volatility;
    price = price * (1 + change);
    
    prices.push({
      date: date.toISOString().split('T')[0],
      open: price * (1 + (Math.random() - 0.5) * 0.01),
      high: price * (1 + Math.random() * 0.02),
      low: price * (1 - Math.random() * 0.02),
      close: price,
      volume: Math.floor(10000000 + Math.random() * 50000000)
    });
  }
  
  return prices;
}

// Generate synthetic historical indicators
function generateHistoricalIndicators(priceData, index) {
  // Use index to create deterministic but varying data
  const seed = index * 12345;
  const pseudoRandom = () => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  const foreignBias = pseudoRandom() > 0.4 ? 1 : -1;
  const bandarBias = pseudoRandom() > 0.35 ? 1 : -1;
  
  return {
    foreignNet: foreignBias * Math.floor(pseudoRandom() * 1000000000),
    bandarNet: bandarBias * Math.floor(pseudoRandom() * 5000000),
    largeLotRatio: pseudoRandom() * 0.5,
    sidChange: Math.floor((pseudoRandom() - 0.5) * 500),
    queueScore: Math.floor(pseudoRandom() * 100)
  };
}

// Calculate historical bandar score
function calculateHistoricalScore(price, indicators) {
  let score = 50;
  
  // Foreign flow
  if (indicators.foreignNet > 500000000) score += 15;
  else if (indicators.foreignNet > 100000000) score += 10;
  else if (indicators.foreignNet < -500000000) score -= 15;
  else if (indicators.foreignNet < -100000000) score -= 10;
  
  // Bandar activity
  if (indicators.bandarNet > 2000000) score += 20;
  else if (indicators.bandarNet > 500000) score += 15;
  else if (indicators.bandarNet < -2000000) score -= 20;
  else if (indicators.bandarNet < -500000) score -= 15;
  
  // Large lots
  if (indicators.largeLotRatio > 0.4) score += 10;
  else if (indicators.largeLotRatio > 0.25) score += 5;
  
  // SID
  if (indicators.sidChange > 100) score += 5;
  else if (indicators.sidChange < -100) score -= 5;
  
  // Queue
  if (indicators.queueScore > 70) score += 10;
  else if (indicators.queueScore > 50) score += 5;
  else if (indicators.queueScore < 30) score -= 5;
  
  // Price action
  if (price.changePct > 5) score += 5;
  else if (price.changePct < -5) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

export async function runBacktest(config, currentPrices, companies) {
  const { initialFund, weeks, strategy } = config;
  const tradingDays = weeks * 5; // Approximate trading days
  
  const portfolio = {
    cash: initialFund,
    positions: {}, // symbol -> { shares, avgPrice, costBasis }
    trades: [],
    dailyValues: []
  };
  
  const companyMap = new Map(companies.map(c => [c.symbol, c]));
  const startDate = new Date();
  
  // Simulate each trading day
  for (let day = 0; day < tradingDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() - (tradingDays - day));
    
    // Generate historical prices for this day
    const dayPrices = currentPrices.map(p => {
      const history = generateHistoricalData(p.close, tradingDays);
      const dayPrice = history[day];
      return {
        symbol: p.symbol,
        ...dayPrice,
        changePct: day === 0 ? 0 : ((dayPrice.close - history[day - 1]?.close) / history[day - 1]?.close) * 100
      };
    });
    
    // Calculate scores for each stock
    const scoredStocks = dayPrices.map((price, idx) => {
      const indicators = generateHistoricalIndicators(price, day * 100 + idx);
      const score = calculateHistoricalScore(price, indicators);
      return {
        ...price,
        score,
        indicators,
        signal: score >= 70 ? 'BUY' : score < 40 ? 'SELL' : 'HOLD'
      };
    });
    
    // Sort by score
    scoredStocks.sort((a, b) => b.score - a.score);
    
    // Execute trades based on strategy
    const topStocks = scoredStocks.slice(0, 5); // Top 5 scores
    const bottomStocks = scoredStocks.slice(-5); // Bottom 5 scores
    
    // Buy signals
    for (const stock of topStocks) {
      if (stock.signal === 'BUY' && portfolio.cash > stock.close * 100) {
        const position = portfolio.positions[stock.symbol];
        const maxInvestment = portfolio.cash * 0.2; // Max 20% per stock
        const shares = Math.floor(Math.min(maxInvestment, portfolio.cash * 0.15) / stock.close / 100) * 100;
        
        if (shares >= 100) {
          const cost = shares * stock.close;
          const fee = cost * 0.0015; // 0.15% trading fee
          const totalCost = cost + fee;
          
          if (portfolio.cash >= totalCost) {
            portfolio.cash -= totalCost;
            
            if (position) {
              const totalShares = position.shares + shares;
              position.avgPrice = (position.costBasis + cost) / totalShares;
              position.shares = totalShares;
              position.costBasis += cost;
            } else {
              portfolio.positions[stock.symbol] = {
                shares,
                avgPrice: stock.close,
                costBasis: cost,
                entryDate: currentDate.toISOString().split('T')[0],
                entryScore: stock.score
              };
            }
            
            portfolio.trades.push({
              date: currentDate.toISOString().split('T')[0],
              symbol: stock.symbol,
              action: 'BUY',
              shares,
              price: stock.close,
              value: cost,
              fee,
              score: stock.score
            });
          }
        }
      }
    }
    
    // Sell signals
    for (const [symbol, position] of Object.entries(portfolio.positions)) {
      const stock = scoredStocks.find(s => s.symbol === symbol);
      
      if (stock) {
        // Sell if score drops below threshold or take profit/stop loss
        const unrealizedPnL = ((stock.close - position.avgPrice) / position.avgPrice) * 100;
        const daysHeld = day - Math.floor((new Date(position.entryDate) - new Date(dayPrices[0]?.date || startDate)) / (1000 * 60 * 60 * 24));
        
        const shouldSell = stock.signal === 'SELL' || 
                          unrealizedPnL >= 15 || // Take profit 15%
                          unrealizedPnL <= -7 || // Stop loss 7%
                          daysHeld >= 10; // Max hold period
        
        if (shouldSell) {
          const value = position.shares * stock.close;
          const fee = value * 0.0025; // 0.25% selling fee (including tax)
          const netValue = value - fee;
          
          portfolio.cash += netValue;
          
          portfolio.trades.push({
            date: currentDate.toISOString().split('T')[0],
            symbol,
            action: 'SELL',
            shares: position.shares,
            price: stock.close,
            value,
            fee,
            pnl: value - position.costBasis - fee - (position.costBasis * 0.0015),
            pnlPct: ((value - fee) / position.costBasis - 1) * 100,
            exitScore: stock.score
          });
          
          delete portfolio.positions[symbol];
        }
      }
    }
    
    // Calculate daily portfolio value
    let portfolioValue = portfolio.cash;
    for (const [symbol, position] of Object.entries(portfolio.positions)) {
      const stock = dayPrices.find(s => s.symbol === symbol);
      if (stock) {
        portfolioValue += position.shares * stock.close;
      }
    }
    
    portfolio.dailyValues.push({
      date: currentDate.toISOString().split('T')[0],
      value: portfolioValue,
      cash: portfolio.cash,
      invested: portfolioValue - portfolio.cash
    });
  }
  
  // Calculate final results
  const finalValue = portfolio.dailyValues[portfolio.dailyValues.length - 1]?.value || initialFund;
  const totalReturn = ((finalValue - initialFund) / initialFund) * 100;
  
  // Analyze trades
  const closedTrades = portfolio.trades.filter(t => t.action === 'SELL');
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) <= 0);
  
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + (t.pnlPct || 0), 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((s, t) => s + (t.pnlPct || 0), 0) / losingTrades.length : 0;
  
  const profitFactor = losingTrades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0) > 0 
    ? winningTrades.reduce((s, t) => s + (t.pnl || 0), 0) / losingTrades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0)
    : winningTrades.length > 0 ? Infinity : 0;
  
  // Current holdings (unsold positions)
  const currentHoldings = Object.entries(portfolio.positions).map(([symbol, position]) => {
    const company = companyMap.get(symbol);
    const currentPrice = currentPrices.find(p => p.symbol === symbol)?.close || position.avgPrice;
    const marketValue = position.shares * currentPrice;
    const unrealizedPnL = marketValue - position.costBasis;
    
    return {
      symbol,
      name: company?.name || symbol,
      shares: position.shares,
      avgPrice: position.avgPrice,
      currentPrice,
      marketValue,
      costBasis: position.costBasis,
      unrealizedPnL,
      unrealizedPnLPct: (unrealizedPnL / position.costBasis) * 100,
      entryDate: position.entryDate,
      entryScore: position.entryScore
    };
  });
  
  return {
    config,
    summary: {
      initialFund,
      finalValue: Math.round(finalValue),
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      absoluteReturn: Math.round(finalValue - initialFund),
      tradingDays,
      winRate: parseFloat(winRate.toFixed(2)),
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWinPct: parseFloat(avgWin.toFixed(2)),
      avgLossPct: parseFloat(avgLoss.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      maxDrawdown: calculateMaxDrawdown(portfolio.dailyValues)
    },
    trades: portfolio.trades,
    dailyValues: portfolio.dailyValues,
    currentHoldings,
    equityCurve: portfolio.dailyValues.map(dv => ({
      date: dv.date,
      value: dv.value,
      return: ((dv.value - initialFund) / initialFund) * 100
    }))
  };
}

function calculateMaxDrawdown(dailyValues) {
  let maxDrawdown = 0;
  let peak = dailyValues[0]?.value || 0;
  
  for (const dv of dailyValues) {
    if (dv.value > peak) {
      peak = dv.value;
    }
    const drawdown = ((peak - dv.value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return parseFloat(maxDrawdown.toFixed(2));
}
