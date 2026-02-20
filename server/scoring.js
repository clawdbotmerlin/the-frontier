// Clean Bandarmology Scoring - Correct Cost Basis
// NO magic numbers, simple clear logic

export function calculateBandarScore(stockData, indicators) {
  const { brokerSummary = [], volumeAnalysis = {}, foreignFlow = {}, priceAction = {} } = indicators;
  
  const currentPrice = stockData.close || 0;
  const priceChange = priceAction.changePct || 0;
  
  // Calculate weighted average broker cost
  let totalBuyValue = 0;
  let totalBuyLots = 0;
  
  for (const b of brokerSummary) {
    if (b.buyVolume > 0) {
      // buyVolume is in LOTS (1 lot = 100 shares)
      // buyValue is total value in IDR
      // avg price = buyValue / (buyVolume * 100)
      const avgPrice = b.avgBuyPrice || (b.buyValue / (b.buyVolume * 100));
      totalBuyValue += b.buyValue;
      totalBuyLots += b.buyVolume;
    }
  }
  
  // Weighted average cost
  const avgBrokerCost = totalBuyLots > 0 ? totalBuyValue / (totalBuyLots * 100) : currentPrice;
  
  // Price relative to cost
  const premiumToCost = ((currentPrice - avgBrokerCost) / avgBrokerCost) * 100;
  
  // Foreign flow
  const foreignNetBillions = (foreignFlow.netValue || 0) / 1000000000;
  
  // Top brokers
  const sortedByNet = [...brokerSummary].sort((a, b) => Math.abs(b.netValue || 0) - Math.abs(a.netValue || 0));
  const top3Brokers = sortedByNet.slice(0, 3);
  const top3NetValue = top3Brokers.reduce((sum, b) => sum + (b.netValue || 0), 0);
  
  // Build clear analysis
  const analysis = [];
  
  // 1. Cost Basis Analysis
  analysis.push(`💰 COST BASIS ANALYSIS:`);
  analysis.push(`   Current Price: Rp ${Math.floor(currentPrice).toLocaleString()}`);
  analysis.push(`   Avg Broker Cost: Rp ${Math.floor(avgBrokerCost).toLocaleString()}`);
  analysis.push(`   Premium/Discount: ${premiumToCost > 0 ? '+' : ''}${premiumToCost.toFixed(1)}%`);
  
  if (Math.abs(premiumToCost) < 5) {
    analysis.push(`   ✅ FAIR VALUE: Price near broker cost`);
  } else if (premiumToCost > 20) {
    analysis.push(`   ⚠️  OVERVALUED: Price significantly above broker cost`);
  } else if (premiumToCost < -10) {
    analysis.push(`   ✅ VALUE: Price below broker cost (potential opportunity)`);
  }
  
  // 2. Foreign Flow
  analysis.push(`\n🌍 FOREIGN FLOW:`);
  analysis.push(`   Net: ${foreignNetBillions > 0 ? '+' : ''}${foreignNetBillions.toFixed(2)}B IDR`);
  if (foreignFlow.buyBrokers?.length) {
    analysis.push(`   Buying: ${foreignFlow.buyBrokers.join(', ')}`);
  }
  if (foreignFlow.sellBrokers?.length) {
    analysis.push(`   Selling: ${foreignFlow.sellBrokers.join(', ')}`);
  }
  
  // 3. Top Broker Activity
  analysis.push(`\n📊 TOP BROKER ACTIVITY (Current Day):`);
  for (const b of top3Brokers) {
    const action = (b.netValue || 0) > 0 ? 'BUYING' : 'SELLING';
    const avgPrice = b.netValue > 0 ? (b.avgBuyPrice || 0) : (b.avgSellPrice || 0);
    analysis.push(`   ${b.code}: ${action} ${Math.abs((b.netValue || 0) / 1000000000).toFixed(1)}B @ Rp ${Math.floor(avgPrice).toLocaleString()}`);
  }
  
  // 4. Volume Analysis
  const volumeRatio = (volumeAnalysis.totalVolume || 0) / (volumeAnalysis.averageVolume || 1);
  analysis.push(`\n📈 VOLUME:`);
  analysis.push(`   Today: ${((volumeAnalysis.totalVolume || 0) / 1000000).toFixed(1)}M shares`);
  analysis.push(`   20-day Avg: ${((volumeAnalysis.averageVolume || 0) / 1000000).toFixed(1)}M shares`);
  analysis.push(`   Ratio: ${volumeRatio.toFixed(1)}x`);
  
  // Simple scoring
  let score = 50;
  const factors = [];
  
  // Foreign flow impact
  if (foreignNetBillions > 1) {
    score += 15;
    factors.push('Foreign buying >1B');
  } else if (foreignNetBillions < -1) {
    score -= 15;
    factors.push('Foreign selling >1B');
  }
  
  // Top broker alignment
  if (top3NetValue > 50000000000) {
    score += 10;
    factors.push('Top brokers accumulating');
  } else if (top3NetValue < -50000000000) {
    score -= 10;
    factors.push('Top brokers distributing');
  }
  
  // Cost basis
  if (premiumToCost < -5) {
    score += 5;
    factors.push('Below broker cost');
  }
  
  // Volume confirmation
  if (volumeRatio > 2 && priceChange > 0) {
    score += 5;
    factors.push('Volume spike + price up');
  }
  
  // Volume Spike Detection (NEW)
  const vs = volumeAnalysis.volumeSpike;
  if (vs && vs.detected) {
    if (vs.signal === 'STEALTH_ACCUMULATION') {
      score += 12;
      factors.push(`Stealth accumulation: ${vs.ratio}x volume spike`);
    } else if (vs.signal === 'BREAKOUT') {
      score += 8;
      factors.push(`Volume breakout: ${vs.ratio}x`);
    }
  }
  
  // Volume Dry-Up Detection (NEW)
  const vdu = volumeAnalysis.volumeDryUp;
  if (vdu && vdu.detected) {
    if (vdu.signal === 'VDU_BREAKOUT') {
      score += 15;
      factors.push(`VDU Breakout: ${vdu.dryUpDays} days dry-up + surge (${vdu.confidence.toFixed(0)}% confidence)`);
    } else if (vdu.signal === 'VDU_ACCUMULATING') {
      score += 8;
      factors.push(`VDU Phase: Quiet accumulation detected (${vdu.dryUpDays} days)`);
    }
  }
  
  // Bid-Ask Imbalance Detection (NEW)
  const bai = volumeAnalysis.bidAskImbalance;
  if (bai && bai.detected) {
    if (bai.signal === 'STEALTH_ACCUMULATION') {
      score += 12;
      factors.push(`Stealth accumulation: ${bai.ratio}x bid/ask ratio while price down`);
    } else if (bai.signal === 'HIDDEN_SUPPORT') {
      score += 8;
      factors.push(`Hidden support: ${bai.ratio}x bid pressure maintaining floor`);
    } else if (bai.signal === 'DISTRIBUTION') {
      score -= 12;
      factors.push(`Distribution detected: ${(1/bai.ratio).toFixed(1)}x selling pressure`);
    }
  }
  
  // Foreign Flow Streak Detection (NEW)
  const fs = indicators.foreignStreak;
  if (fs && fs.detected) {
    if (fs.signal === 'STRONG_BULLISH') {
      score += 18;
      factors.push(`Strong foreign streak: ${fs.consecutiveDays} days buying, Rp ${(fs.totalNetValue/1000000000).toFixed(1)}B inflow`);
    } else if (fs.signal === 'BULLISH') {
      score += 12;
      factors.push(`Foreign buying streak: ${fs.consecutiveDays} days`);
    } else if (fs.signal === 'MODERATE_BULLISH') {
      score += 6;
      factors.push(`Foreign accumulation: ${fs.consecutiveDays} days`);
    } else if (fs.signal === 'STRONG_BEARISH') {
      score -= 18;
      factors.push(`⚠️ Foreign selling streak: ${Math.abs(fs.consecutiveDays)} days, Rp ${Math.abs(fs.totalNetValue/1000000000).toFixed(1)}B outflow`);
    } else if (fs.signal === 'BEARISH') {
      score -= 12;
      factors.push(`Foreign selling streak: ${Math.abs(fs.consecutiveDays)} days`);
    }
  }
  
  // Broker Concentration Detection (NEW)
  const bc = indicators.brokerConcentration;
  if (bc && bc.detected) {
    if (bc.signal === 'HIGH_CONCENTRATION') {
      score += 15;
      factors.push(`Bandar concentration: ${bc.dominantBrokers[0]?.code} dominating for ${bc.concentrationDays} days`);
    } else if (bc.signal === 'COORDINATED_BUYING') {
      score += 12;
      factors.push(`Coordinated buying: ${bc.dominantBrokers.map(b => b.code).join('+')} active together`);
    } else if (bc.signal === 'MODERATE_CONCENTRATION') {
      score += 6;
      factors.push(`Broker accumulation detected`);
    }
  }
  
  // Price Action Indicators (#6-10) (NEW)
  const pa = indicators.priceAction;
  if (pa) {
    // #6: Price Compression
    if (pa.priceCompression?.detected) {
      score += 5;
      factors.push(`Price compression: ${pa.priceCompression.rangePct}% range - accumulation zone`);
    }
    
    // #7: Fake Breakdown / Bear Trap
    if (pa.fakeBreakdown?.detected && pa.fakeBreakdown.signal === 'BEAR_TRAP') {
      score += 12;
      factors.push(`Bear trap: False breakdown recovered with volume - shakeout complete`);
    }
    
    // #8: Lower High on Low Volume (Healthy pullback)
    if (pa.lowerHighPattern?.detected && pa.lowerHighPattern.signal === 'HEALTHY_PULLBACK') {
      score += 8;
      factors.push(`Healthy pullback on low volume - bandar holding positions`);
    }
    
    // #9: Floor Defense
    if (pa.floorDefense?.detected) {
      score += 10;
      factors.push(`Floor defense at Rp ${pa.floorDefense.defenseLevel?.toLocaleString()} - support established`);
    }
    
    // #10: Gap Up Breakout
    if (pa.gapUpBreakout?.detected) {
      score += 15;
      factors.push(`Gap up breakout: ${pa.gapUpBreakout.gapPct}% gap with volume - accumulation complete!`);
    }
  }
  
  score = Math.max(20, Math.min(80, score));
  
  let signal;
  if (score >= 65) signal = 'BUY';
  else if (score >= 50) signal = 'HOLD';
  else signal = 'REDUCE';
  
  return {
    score: Math.round(score),
    signal,
    avgBrokerCost: Math.floor(avgBrokerCost),
    premiumToCost,
    analysis,
    factors
  };
}

export function generateSignalReasoning(score, signal, factors, indicators) {
  return factors.join('; ');
}
