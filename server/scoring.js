// Honest Bandarmology Scoring v2.0
// More conservative - requires multiple confirmations for high scores
// Penalizes bearish signals more heavily
// Weights adjusted for better accuracy

export function calculateBandarScore(stockData, indicators) {
  const { brokerSummary = [], volumeAnalysis = {}, foreignFlow = {}, priceAction = {} } = indicators;
  
  const currentPrice = stockData.close || 0;
  const priceChange = priceAction.changePct || 0;
  
  // Calculate weighted average broker cost
  let totalBuyValue = 0;
  let totalBuyLots = 0;
  
  for (const b of brokerSummary) {
    if (b.buyVolume > 0) {
      totalBuyValue += b.buyValue;
      totalBuyLots += b.buyVolume;
    }
  }
  
  const avgBrokerCost = totalBuyLots > 0 ? totalBuyValue / (totalBuyLots * 100) : currentPrice;
  const premiumToCost = ((currentPrice - avgBrokerCost) / avgBrokerCost) * 100;
  
  // Foreign flow
  const foreignNetBillions = (foreignFlow.netValue || 0) / 1000000000;
  
  // Top brokers
  const sortedByNet = [...brokerSummary].sort((a, b) => Math.abs(b.netValue || 0) - Math.abs(a.netValue || 0));
  const top3Brokers = sortedByNet.slice(0, 3);
  const top3NetValue = top3Brokers.reduce((sum, b) => sum + (b.netValue || 0), 0);
  
  // Volume ratio
  const volumeRatio = (volumeAnalysis.totalVolume || 0) / (volumeAnalysis.averageVolume || 1);
  
  // ===== HONEST SCORING - More Conservative =====
  // Start at neutral 50
  let score = 50;
  const bullishFactors = [];
  const bearishFactors = [];
  
  // === TIER 1: HIGH CONVICTION SIGNALS (+/- 15 points) ===
  
  // 1. Strong Foreign Streak (3+ days, >Rp 5B)
  const fs = indicators.foreignStreak;
  if (fs && fs.detected) {
    if (fs.signal === 'STRONG_BULLISH' && fs.totalNetValue > 5000000000) {
      score += 15;
      bullishFactors.push(`Strong foreign streak: ${fs.consecutiveDays} days, Rp ${(fs.totalNetValue/1e9).toFixed(1)}B inflow`);
    } else if (fs.signal === 'STRONG_BEARISH' && Math.abs(fs.totalNetValue) > 5000000000) {
      score -= 18; // PENALIZE MORE
      bearishFactors.push(`⚠️ Foreign exodus: ${Math.abs(fs.consecutiveDays)} days, Rp ${Math.abs(fs.totalNetValue/1e9).toFixed(1)}B outflow`);
    }
  }
  
  // 2. High Bandar Concentration (>50% by top 3)
  const bc = indicators.brokerConcentration;
  if (bc && bc.detected) {
    if (bc.signal === 'HIGH_CONCENTRATION' && bc.concentrationDays >= 3) {
      score += 15;
      bullishFactors.push(`Bandar control: ${bc.dominantBrokers.map(b => b.code).join('+')} for ${bc.concentrationDays} days`);
    }
  }
  
  // 3. Gap Up Breakout on Volume
  const pa = indicators.priceAction;
  if (pa?.gapUpBreakout?.detected && volumeRatio > 1.5) {
    score += 15;
    bullishFactors.push(`Gap up breakout: ${pa.gapUpBreakout.gapPct}% with volume - accumulation complete`);
  }
  
  // === TIER 2: MEDIUM CONVICTION (+/- 8-12 points) ===
  
  // 4. Foreign Flow (single day)
  if (foreignNetBillions > 2) {
    score += 10;
    bullishFactors.push(`Strong foreign buying: +${foreignNetBillions.toFixed(1)}B`);
  } else if (foreignNetBillions > 1) {
    score += 6;
    bullishFactors.push(`Foreign buying: +${foreignNetBillions.toFixed(1)}B`);
  } else if (foreignNetBillions < -2) {
    score -= 12; // PENALIZE MORE
    bearishFactors.push(`Strong foreign selling: ${foreignNetBillions.toFixed(1)}B`);
  } else if (foreignNetBillions < -1) {
    score -= 8;
    bearishFactors.push(`Foreign selling: ${foreignNetBillions.toFixed(1)}B`);
  }
  
  // 5. Top Broker Alignment (>Rp 50B)
  if (top3NetValue > 100000000000) {
    score += 12;
    bullishFactors.push(`Major accumulation: Top 3 +Rp ${(top3NetValue/1e9).toFixed(1)}B`);
  } else if (top3NetValue > 50000000000) {
    score += 8;
    bullishFactors.push(`Broker accumulation: Top 3 +Rp ${(top3NetValue/1e9).toFixed(1)}B`);
  } else if (top3NetValue < -100000000000) {
    score -= 15; // PENALIZE MORE
    bearishFactors.push(`Major distribution: Top 3 -Rp ${Math.abs(top3NetValue/1e9).toFixed(1)}B`);
  } else if (top3NetValue < -50000000000) {
    score -= 10;
    bearishFactors.push(`Broker distribution: Top 3 -Rp ${Math.abs(top3NetValue/1e9).toFixed(1)}B`);
  }
  
  // 6. Stealth Accumulation (VDU + Breakout)
  const vdu = volumeAnalysis.volumeDryUp;
  if (vdu?.detected && vdu.signal === 'VDU_BREAKOUT') {
    score += 12;
    bullishFactors.push(`VDU Breakout: ${vdu.dryUpDays} days quiet accumulation`);
  }
  
  // 7. OBV Bullish Divergence
  const qi = indicators.quantitative;
  if (qi?.obv?.divergence?.detected && qi.obv.divergence.signal === 'BULLISH_DIVERGENCE') {
    score += 10;
    bullishFactors.push(`OBV Divergence: Smart money accumulating`);
  } else if (qi?.obv?.divergence?.detected && qi.obv.divergence.signal === 'BEARISH_DIVERGENCE') {
    score -= 10;
    bearishFactors.push(`OBV Warning: Distribution pattern`);
  }
  
  // === TIER 3: CONFIRMATION SIGNALS (+/- 3-6 points) ===
  
  // 8. Volume Confirmation
  if (volumeRatio > 2.5 && priceChange > 2) {
    score += 6;
    bullishFactors.push(`Volume breakout: ${volumeRatio.toFixed(1)}x avg`);
  } else if (volumeRatio > 2 && priceChange < -1) {
    score -= 8; // Distribution
    bearishFactors.push(`Volume distribution: ${volumeRatio.toFixed(1)}x avg with price drop`);
  }
  
  // 9. Cost Basis Position
  if (premiumToCost >= -5 && premiumToCost <= 15) {
    score += 5;
    bullishFactors.push(`Fair value: ${premiumToCost.toFixed(1)}% above cost`);
  } else if (premiumToCost > 30) {
    score -= 8; // Overextended
    bearishFactors.push(`Overextended: ${premiumToCost.toFixed(1)}% above cost`);
  } else if (premiumToCost < -10) {
    score += 4;
    bullishFactors.push(`Value opportunity: ${Math.abs(premiumToCost).toFixed(1)}% below cost`);
  }
  
  // 10. CMF Money Flow
  if (qi?.cmf?.value > 0.15) {
    score += 5;
    bullishFactors.push(`CMF ${qi.cmf.value}: Strong buying pressure`);
  } else if (qi?.cmf?.value < -0.15) {
    score -= 6;
    bearishFactors.push(`CMF ${qi.cmf.value}: Selling pressure`);
  }
  
  // 11. MFI Momentum
  if (qi?.mfi?.value < 30) {
    score += 6;
    bullishFactors.push(`MFI ${qi.mfi.value}: Oversold bounce potential`);
  } else if (qi?.mfi?.value > 75) {
    score -= 5;
    bearishFactors.push(`MFI ${qi.mfi.value}: Overbought caution`);
  }
  
  // 12. Floor Defense
  if (pa?.floorDefense?.detected) {
    score += 4;
    bullishFactors.push(`Support at Rp ${pa.floorDefense.defenseLevel?.toLocaleString()}`);
  }
  
  // === RED FLAG PENALTIES (Additional) ===
  
  // 13. Multiple brokers selling (coordinated exit)
  const sellingBrokers = brokerSummary.filter(b => (b.netValue || 0) < -10000000000);
  if (sellingBrokers.length >= 3) {
    score -= 10;
    bearishFactors.push(`Coordinated exit: ${sellingBrokers.length} major brokers selling`);
  }
  
  // ===== FINAL SCORE CALCULATION =====
  
  // Cap the score
  score = Math.max(15, Math.min(85, score));
  
  // REQUIRE MULTIPLE CONFIRMATIONS FOR HIGH SCORES
  // Need at least 2 bullish factors for BUY signal
  if (score >= 65 && bullishFactors.length < 2) {
    score = 60; // Reduce to HOLD range if only 1 factor
  }
  
  // Need strong conviction for BUY (>=70)
  if (score >= 70 && !bullishFactors.some(f => f.includes('streak') || f.includes('concentration') || f.includes('Gap up'))) {
    score = 68; // Cap at 68 without tier 1 signal
  }
  
  // PENALIZE MORE: If has critical bearish factor, cap score
  if (bearishFactors.some(f => f.includes('exodus') || f.includes('distribution'))) {
    score = Math.min(score, 55); // Cap at 55 if major red flag
  }
  
  // Determine signal
  let signal;
  if (score >= 70) signal = 'STRONG_BUY';
  else if (score >= 60) signal = 'BUY';
  else if (score >= 45) signal = 'HOLD';
  else if (score >= 35) signal = 'REDUCE';
  else signal = 'SELL';
  
  // Generate honest summary
  let summary = '';
  if (bullishFactors.length > 0 && bearishFactors.length === 0) {
    summary = `${bullishFactors.length} bullish signals: ${bullishFactors[0]}`;
  } else if (bearishFactors.length > 0 && bullishFactors.length === 0) {
    summary = `${bearishFactors.length} bearish signals: ${bearishFactors[0]}`;
  } else if (bullishFactors.length > 0 && bearishFactors.length > 0) {
    summary = `Mixed: ${bullishFactors[0]} | BUT ${bearishFactors[0]}`;
  } else {
    summary = 'No clear directional signals - neutral';
  }
  
  return {
    score: Math.round(score),
    signal,
    avgBrokerCost: Math.floor(avgBrokerCost),
    premiumToCost,
    bullishFactors,
    bearishFactors,
    summary
  };
}

export function generateSignalReasoning(score, signal, bullishFactors, bearishFactors) {
  const allFactors = [...bullishFactors, ...bearishFactors.map(f => '⚠️ ' + f)];
  return allFactors.slice(0, 5).join('; ');
}
