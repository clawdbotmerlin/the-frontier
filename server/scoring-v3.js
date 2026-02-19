/**
 * THE FRONTIER - Advanced Bandarmology Scoring Algorithm v3.0
 * 
 * INCORPORATES PRACTITIONER INSIGHTS:
 * - Priority-weighted signal stack (broker flow = highest conviction)
 * - Broker accumulation % of float (not just raw volume)
 * - Broker average price / cost basis tracking
 * - Quantitative filters (MFI, OBV, CMF, VWAP)
 * - Ideal setup detector with ownership cross-reference
 */

// Big Dog Brokers
const BIG_DOG_BROKERS = ['YU', 'CC', 'NI', 'GW', 'SQ', 'OD', 'BK', 'AK'];
const INSTITUTIONAL_BROKERS = ['YU', 'CC', 'NI', 'GW', 'SQ', 'OD', 'BK', 'AK', 'MS', 'JP', 'GS'];
const RETAIL_BROKERS = ['DX', 'ZZ', 'QQ', 'MG', 'PD', 'HP'];

// Priority Weights (from practitioner)
const WEIGHTS = {
  brokerAccumulation: {
    concentrationRatioHigh: 25,
    concentrationRatioMedium: 18,
    multiDayAccumulation: 15,
    hiddenAccumulation: 12,
    contraFlow: 10,
    bigDogPresence: 5
  },
  volumePrice: {
    unusualVolumeSpike: 15,
    volumeDryUpBreakout: 15,
    priceCompression: 12,
    breakoutGap: 10
  },
  foreignFlow: {
    strongNetBuy: 12,
    moderateNetBuy: 8,
    streakBonus: 5,
    strongNetSell: -20  // INCREASED: Stronger penalty for foreign selling >1B
  },
  quantitative: {
    obvDivergence: 8,
    cmfPositive: 6,
    mfiTrendingUp: 5,
    vwapReclaim: 5
  },
  relativeStrength: {
    vsIHSGDivergence: 6,
    sectorLeadership: 5
  }
};

export function calculateBandarScore(stockData, marketContext = {}) {
  const { 
    symbol, 
    price, 
    volume, 
    historical = [], 
    brokerData = [],
    foreignData = {},
    ownership = {}
  } = stockData;
  
  let score = 50;
  const factors = [];
  const convictionFactors = [];
  
  const metrics = calculateMetrics(stockData, marketContext);
  
  // Priority 1: Broker Analysis
  const brokerAnalysis = analyzeBrokerAccumulation(brokerData, ownership, metrics);
  score += brokerAnalysis.scoreContribution;
  factors.push(...brokerAnalysis.factors);
  convictionFactors.push(...brokerAnalysis.convictionFactors);
  
  // Priority 2: Volume + Price
  const volumePriceAnalysis = analyzeVolumePrice(price, volume, historical, metrics);
  score += volumePriceAnalysis.scoreContribution;
  factors.push(...volumePriceAnalysis.factors);
  
  // Priority 3: Foreign Flow
  const foreignAnalysis = analyzeForeignFlow(foreignData);
  score += foreignAnalysis.scoreContribution;
  factors.push(...foreignAnalysis.factors);
  
  // Priority 4: Quantitative
  const quantAnalysis = analyzeQuantitativeIndicators(historical, price, volume);
  score += quantAnalysis.scoreContribution;
  factors.push(...quantAnalysis.factors);
  
  // Priority 5: Relative Strength
  const rsAnalysis = analyzeRelativeStrength(stockData, marketContext);
  score += rsAnalysis.scoreContribution;
  factors.push(...rsAnalysis.factors);
  
  score = Math.max(0, Math.min(100, score));
  
  const signal = determineSignal(score, convictionFactors);
  const idealSetup = assessIdealSetup(stockData, brokerAnalysis, metrics);
  
  return {
    score: Math.round(score),
    signal: signal.signal,
    conviction: signal.conviction,
    factors,
    convictionFactors,
    idealSetup,
    metrics: {
      brokerAccumulationPct: brokerAnalysis.accumulationPctOfFloat,
      brokerAvgPrice: brokerAnalysis.estimatedAvgPrice,
      currentVsAvgPrice: brokerAnalysis.priceVsAvg,
      floatSize: metrics.floatSize,
      top3BrokerConcentration: brokerAnalysis.top3Concentration,
      volumeSpikeRatio: metrics.volumeSpikeRatio,
      obvTrend: quantAnalysis.obvTrend,
      cmfValue: quantAnalysis.cmfValue,
      foreignStreak: foreignAnalysis.streak
    },
    reasoning: generateEnhancedReasoning(score, signal, factors, idealSetup, metrics)
  };
}

function analyzeBrokerAccumulation(brokerData, ownership, metrics) {
  let score = 0;
  const factors = [];
  const convictionFactors = [];
  
  if (!brokerData || brokerData.length === 0) {
    return { 
      scoreContribution: 0, 
      factors: ['⚪ No broker data'],
      convictionFactors: [],
      accumulationPctOfFloat: 0,
      estimatedAvgPrice: 0,
      priceVsAvg: 0,
      top3Concentration: 0,
      bigDogNet: 0
    };
  }
  
  const totalBuy = brokerData.reduce((sum, b) => sum + (b.buyVolume || 0), 0);
  const totalSell = brokerData.reduce((sum, b) => sum + (b.sellVolume || 0), 0);
  const netVolume = totalBuy - totalSell;
  
  const sortedByBuy = [...brokerData].sort((a, b) => (b.buyVolume || 0) - (a.buyVolume || 0));
  const top3Buyers = sortedByBuy.slice(0, 3);
  const top3BuyVolume = top3Buyers.reduce((sum, b) => sum + (b.buyVolume || 0), 0);
  const top3Concentration = totalBuy > 0 ? top3BuyVolume / totalBuy : 0;
  
  // FIXED: Check if top 3 brokers are NET BUYING (not just concentrated)
  const top3NetVolume = top3Buyers.reduce((sum, b) => 
    sum + ((b.buyVolume || 0) - (b.sellVolume || 0)), 0
  );
  
  const bigDogActivity = brokerData.filter(b => BIG_DOG_BROKERS.includes(b.code));
  const bigDogNet = bigDogActivity.reduce((sum, b) => 
    sum + ((b.buyVolume || 0) - (b.sellVolume || 0)), 0
  );
  
  const institutionalBuy = brokerData
    .filter(b => INSTITUTIONAL_BROKERS.includes(b.code))
    .reduce((sum, b) => sum + (b.buyVolume || 0), 0);
  const retailSell = brokerData
    .filter(b => RETAIL_BROKERS.includes(b.code))
    .reduce((sum, b) => sum + (b.sellVolume || 0), 0);
  const contraFlow = institutionalBuy > 0 && retailSell > institutionalBuy * 0.5;
  
  const floatSize = metrics.floatSize || estimateFloat(ownership);
  const accumulationPct = floatSize > 0 ? Math.abs(netVolume) / floatSize : 0;
  
  const estimatedAvgPrice = calculateBrokerVWAP(brokerData);
  const currentPrice = metrics.currentPrice || 0;
  const priceVsAvg = estimatedAvgPrice > 0 ? ((currentPrice - estimatedAvgPrice) / estimatedAvgPrice) * 100 : 0;
  
  // Scoring - FIXED: Check if top 3 are NET BUYING (top3NetVolume > 0)
  if (top3Concentration > 0.5 && top3NetVolume > 0) {
    score += WEIGHTS.brokerAccumulation.concentrationRatioHigh;
    factors.push(`🟢 High concentration (NET BUYING): ${(top3Concentration * 100).toFixed(1)}% (top 3)`);
    convictionFactors.push('high_concentration');
  } else if (top3Concentration > 0.35 && top3NetVolume > 0) {
    score += WEIGHTS.brokerAccumulation.concentrationRatioMedium;
    factors.push(`🟡 Moderate concentration (NET BUYING): ${(top3Concentration * 100).toFixed(1)}%`);
  } else if (top3Concentration > 0.5 && top3NetVolume <= 0) {
    // Penalty if concentrated but SELLING
    score -= 15;
    factors.push(`🔴 High concentration but NET SELLING: ${(top3Concentration * 100).toFixed(1)}%`);
    convictionFactors.push('concentrated_selling');
  }
  
  if (bigDogNet > 0 && bigDogActivity.length >= 2) {
    score += WEIGHTS.brokerAccumulation.multiDayAccumulation;
    factors.push(`🟢 Big Dog accumulation: ${bigDogActivity.filter(b => (b.buyVolume - b.sellVolume) > 0).length} brokers buying`);
    convictionFactors.push('big_dog_accumulating');
  } else if (bigDogNet > 0) {
    score += WEIGHTS.brokerAccumulation.bigDogPresence;
    factors.push(`🟡 Big Dog presence`);
  } else if (bigDogNet < 0 && Math.abs(bigDogNet) > totalBuy * 0.1) {
    score -= 15;
    factors.push(`🔴 Big Dog distribution`);
    convictionFactors.push('big_dog_distributing');
  }
  
  if (contraFlow && netVolume > 0) {
    score += WEIGHTS.brokerAccumulation.contraFlow;
    factors.push(`🟢 Contra flow: Institutions absorbing retail`);
    convictionFactors.push('contra_flow');
  }
  
  if (accumulationPct > 0.1) {
    score += WEIGHTS.brokerAccumulation.hiddenAccumulation;
    factors.push(`🟢 Strong accumulation: ${(accumulationPct * 100).toFixed(1)}% of float`);
    convictionFactors.push('high_float_pct');
  } else if (accumulationPct > 0.05) {
    score += 6;
    factors.push(`🟡 Moderate accumulation: ${(accumulationPct * 100).toFixed(1)}% of float`);
  }
  
  if (priceVsAvg > 0 && priceVsAvg < 20) {
    factors.push(`💎 Sweet spot: ${priceVsAvg.toFixed(1)}% above broker avg`);
    convictionFactors.push('sweet_spot');
  } else if (priceVsAvg > 30) {
    score -= 10;
    factors.push(`⚠️ ${priceVsAvg.toFixed(1)}% above broker avg (distribution risk)`);
    convictionFactors.push('extended');
  }
  
  return {
    scoreContribution: score,
    factors,
    convictionFactors,
    accumulationPctOfFloat: accumulationPct * 100,
    estimatedAvgPrice,
    priceVsAvg,
    top3Concentration: top3Concentration * 100,
    bigDogNet,
    topBrokers: top3Buyers.map(b => ({
      code: b.code,
      netVolume: (b.buyVolume || 0) - (b.sellVolume || 0),
      pctOfBuy: totalBuy > 0 ? (b.buyVolume / totalBuy) * 100 : 0
    }))
  };
}

function analyzeVolumePrice(price, volume, historical, metrics) {
  let score = 0;
  const factors = [];
  
  const avgVolume20 = metrics.avgVolume20 || calculateAverageVolume(historical, 20);
  const volumeSpikeRatio = avgVolume20 > 0 ? volume / avgVolume20 : 1;
  
  if (volumeSpikeRatio > 3) {
    score += WEIGHTS.volumePrice.unusualVolumeSpike;
    factors.push(`🟢 Volume spike: ${volumeSpikeRatio.toFixed(1)}x avg`);
  } else if (volumeSpikeRatio > 2) {
    score += 10;
    factors.push(`🟡 Elevated volume: ${volumeSpikeRatio.toFixed(1)}x avg`);
  }
  
  if (historical && historical.length >= 10) {
    const recentRange = calculatePriceRange(historical.slice(-10));
    if (recentRange < 0.03) {
      score += WEIGHTS.volumePrice.priceCompression;
      factors.push(`🟢 Price compression: ${(recentRange * 100).toFixed(1)}% range`);
    }
  }
  
  const resistanceLevel = metrics.resistanceLevel;
  if (resistanceLevel && price > resistanceLevel * 1.02 && volumeSpikeRatio > 2) {
    score += WEIGHTS.volumePrice.breakoutGap;
    factors.push(`🟢 Breakout on volume`);
  }
  
  return { scoreContribution: score, factors, volumeSpikeRatio };
}

function analyzeForeignFlow(foreignData) {
  let score = 0;
  const factors = [];
  let streak = 0;
  
  const netValue = foreignData.netValue || 0;
  const streakData = foreignData.streak || { buyDays: 0, sellDays: 0 };
  
  if (streakData.buyDays >= 5) {
    streak = streakData.buyDays;
    score += WEIGHTS.foreignFlow.streakBonus;
    factors.push(`🟢 Foreign buy streak: ${streak} days`);
  } else if (streakData.sellDays >= 5) {
    streak = -streakData.sellDays;
    score -= WEIGHTS.foreignFlow.streakBonus;
    factors.push(`🔴 Foreign sell streak: ${streakData.sellDays} days`);
  }
  
  if (netValue > 1000000000) {
    score += WEIGHTS.foreignFlow.strongNetBuy;
    factors.push(`🟢 Foreign inflow: Rp ${(netValue / 1000000000).toFixed(2)}B`);
  } else if (netValue > 500000000) {
    score += WEIGHTS.foreignFlow.moderateNetBuy;
    factors.push(`🟢 Foreign inflow: Rp ${(netValue / 1000000000).toFixed(2)}B`);
  } else if (netValue < -1000000000) {
    score += WEIGHTS.foreignFlow.strongNetSell;
    factors.push(`🔴 Foreign outflow: Rp ${(netValue / 1000000000).toFixed(2)}B`);
  }
  
  return { scoreContribution: score, factors, streak };
}

function analyzeQuantitativeIndicators(historical, price, volume) {
  let score = 0;
  const factors = [];
  
  if (!historical || historical.length < 20) {
    return { scoreContribution: 0, factors: ['⚪ No quant data'], obvTrend: 'neutral', cmfValue: 0 };
  }
  
  const obv = calculateOBV(historical);
  const obvTrend = analyzeOBVTrend(obv, historical);
  
  if (obvTrend === 'leading') {
    score += WEIGHTS.quantitative.obvDivergence;
    factors.push(`🟢 OBV divergence`);
  }
  
  const cmf = calculateCMF(historical, 20);
  if (cmf > 0.1) {
    score += WEIGHTS.quantitative.cmfPositive;
    factors.push(`🟢 CMF: ${cmf.toFixed(3)}`);
  } else if (cmf < -0.1) {
    score -= 5;
    factors.push(`🔴 CMF: ${cmf.toFixed(3)}`);
  }
  
  const vwap = calculateVWAP(historical);
  const priceVsVWAP = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;
  
  if (priceVsVWAP > 0 && priceVsVWAP < 5) {
    score += WEIGHTS.quantitative.vwapReclaim;
    factors.push(`🟢 Reclaimed VWAP`);
  }
  
  return { scoreContribution: score, factors, obvTrend, cmfValue: cmf, vwap, priceVsVWAP };
}

function analyzeRelativeStrength(stockData, marketContext) {
  let score = 0;
  const factors = [];
  
  if (marketContext.ihsgChange !== undefined && stockData.changePct !== undefined) {
    if (marketContext.ihsgChange < -0.5 && stockData.changePct > 0) {
      score += WEIGHTS.relativeStrength.vsIHSGDivergence;
      factors.push(`🟢 Outperforming IHSG`);
    }
  }
  
  return { scoreContribution: score, factors };
}

function assessIdealSetup(stockData, brokerAnalysis, metrics) {
  const checks = {
    ownershipStable: stockData.ownership?.controllingStakeStable !== false,
    manageableFloat: metrics.floatSize && metrics.floatSize < 5_000_000_000,
    brokerAccumulating: brokerAnalysis.accumulationPctOfFloat > 5,
    brokerConcentrated: brokerAnalysis.top3Concentration > 40,
    inSweetSpot: brokerAnalysis.priceVsAvg > 0 && brokerAnalysis.priceVsAvg < 20,
    notExtended: brokerAnalysis.priceVsAvg < 30,
    ongoingAccumulation: brokerAnalysis.bigDogNet > 0,
    obvPositive: metrics.obvTrend === 'leading',
    cmfPositive: metrics.cmfValue > 0
  };
  
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const setupScore = (passedChecks / totalChecks) * 100;
  
  let setupQuality = setupScore >= 80 ? 'excellent' : setupScore >= 60 ? 'good' : setupScore >= 40 ? 'fair' : 'poor';
  
  return {
    setupQuality,
    setupScore: Math.round(setupScore),
    checks,
    passedChecks,
    recommendation: setupScore >= 80 ? 'Excellent setup - High conviction' : 
                   setupScore >= 60 ? 'Good setup - Consider sizing' :
                   setupScore >= 40 ? 'Fair setup - Monitor' : 'Poor setup - Caution'
  };
}

function calculateMetrics(stockData) {
  const historical = stockData.historical || [];
  return {
    currentPrice: stockData.price,
    avgVolume20: calculateAverageVolume(historical, 20),
    floatSize: estimateFloat(stockData.ownership),
    resistanceLevel: calculateResistanceLevel(historical),
    obvTrend: 'neutral',
    cmfValue: 0
  };
}

function estimateFloat(ownership) {
  if (!ownership) return 1_000_000_000;
  const totalShares = ownership.totalShares || 0;
  const controllingStake = ownership.controllingStake || 0;
  if (totalShares > 0 && controllingStake > 0) {
    return totalShares * (1 - controllingStake / 100);
  }
  return totalShares * 0.3;
}

function calculateBrokerVWAP(brokerData) {
  let totalValue = 0, totalVolume = 0;
  brokerData.forEach(b => {
    const volume = (b.buyVolume || 0) + (b.sellVolume || 0);
    const avgPrice = b.avgPrice || b.price || 0;
    if (avgPrice > 0) {
      totalValue += volume * avgPrice;
      totalVolume += volume;
    }
  });
  return totalVolume > 0 ? totalValue / totalVolume : 0;
}

function calculateAverageVolume(historical, days) {
  if (!historical || historical.length < days) return 0;
  const recent = historical.slice(-days);
  return recent.reduce((acc, d) => acc + (d.volume || 0), 0) / days;
}

function calculatePriceRange(historical) {
  if (!historical.length) return 0;
  const highs = historical.map(d => d.high || d.close || 0);
  const lows = historical.map(d => d.low || d.close || 0);
  const max = Math.max(...highs), min = Math.min(...lows);
  const avg = (max + min) / 2;
  return avg > 0 ? (max - min) / avg : 0;
}

function calculateResistanceLevel(historical) {
  if (!historical || historical.length < 20) return 0;
  return Math.max(...historical.slice(-20).map(d => d.high || 0));
}

function calculateOBV(historical) {
  let obv = 0;
  for (let i = 1; i < historical.length; i++) {
    const change = (historical[i].close || 0) - (historical[i-1].close || 0);
    obv += change > 0 ? (historical[i].volume || 0) : change < 0 ? -(historical[i].volume || 0) : 0;
  }
  return obv;
}

function analyzeOBVTrend(obv, historical) {
  if (historical.length < 10) return 'neutral';
  const priceHigh = Math.max(...historical.slice(-10).map(d => d.high || d.close || 0));
  const prevPriceHigh = Math.max(...historical.slice(-20, -10).map(d => d.high || d.close || 0));
  return (obv > 0 && priceHigh <= prevPriceHigh) ? 'leading' : 'neutral';
}

function calculateCMF(historical, period) {
  if (historical.length < period) return 0;
  const recent = historical.slice(-period);
  let sumMF = 0, sumVol = 0;
  recent.forEach(d => {
    const high = d.high || d.close || 0, low = d.low || d.close || 0, close = d.close || 0;
    if (high > low) {
      const mf = (((close - low) - (high - close)) / (high - low)) * (d.volume || 0);
      sumMF += mf;
      sumVol += d.volume || 0;
    }
  });
  return sumVol > 0 ? sumMF / sumVol : 0;
}

function calculateVWAP(historical) {
  let totalValue = 0, totalVolume = 0;
  historical.forEach(d => {
    const tp = ((d.high || d.close) + (d.low || d.close) + d.close) / 3;
    totalValue += tp * (d.volume || 0);
    totalVolume += d.volume || 0;
  });
  return totalVolume > 0 ? totalValue / totalVolume : 0;
}

function determineSignal(score, convictionFactors) {
  let signal = score >= 75 ? 'STRONG_BUY' : score >= 60 ? 'BUY' : score >= 45 ? 'HOLD' : score >= 30 ? 'REDUCE' : 'SELL';
  let conviction = score >= 75 ? 5 : score >= 60 ? 4 : score >= 45 ? 3 : score >= 30 ? 2 : 1;
  
  if (convictionFactors.includes('high_concentration')) conviction = Math.min(5, conviction + 1);
  if (convictionFactors.includes('sweet_spot')) conviction = Math.min(5, conviction + 1);
  if (convictionFactors.includes('big_dog_accumulating')) conviction = Math.min(5, conviction + 1);
  
  return { signal, conviction };
}

function generateEnhancedReasoning(score, signal, factors, idealSetup, metrics) {
  const lines = [
    `**Bandarmology Score: ${Math.round(score)}/100**`,
    `**Signal: ${signal.signal}** (Conviction: ${signal.conviction}/5)`,
    '',
    '**Key Factors:**'
  ];
  factors.forEach(f => lines.push(`- ${f}`));
  lines.push('', '**Setup Quality:**', `- ${idealSetup.setupQuality.toUpperCase()} (${idealSetup.setupScore}/100)`);
  
  if (metrics) {
    lines.push('', '**Metrics:**');
    if (metrics.brokerAccumulationPct) lines.push(`- Broker Accumulation: ${metrics.brokerAccumulationPct.toFixed(2)}% of float`);
    if (metrics.brokerAvgPrice) lines.push(`- Broker Avg Price: Rp ${Math.round(metrics.brokerAvgPrice).toLocaleString()}`);
    if (metrics.currentVsAvgPrice) lines.push(`- Price vs Broker Avg: ${metrics.currentVsAvgPrice > 0 ? '+' : ''}${metrics.currentVsAvgPrice.toFixed(1)}%`);
    if (metrics.top3BrokerConcentration) lines.push(`- Top 3 Concentration: ${metrics.top3BrokerConcentration.toFixed(1)}%`);
    if (metrics.volumeSpikeRatio) lines.push(`- Volume Spike: ${metrics.volumeSpikeRatio.toFixed(1)}x`);
    if (metrics.cmfValue) lines.push(`- CMF: ${metrics.cmfValue.toFixed(3)}`);
  }
  
  return lines.join('\n');
}

// Backward compatibility
export function generateSignalReasoning(score, signal, factors, indicators) {
  return generateEnhancedReasoning(score, { signal, conviction: 3 }, factors, { setupQuality: 'unknown', setupScore: 50 }, {});
}

export const SCORING_WEIGHTS = WEIGHTS;
