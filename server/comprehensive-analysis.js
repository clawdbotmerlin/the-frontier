// Enhanced Comprehensive Analysis Generator v2.0
// With macro thesis, fundamentals, and detailed executive summary

export function generateComprehensiveAnalysis(symbol, price, indicators, brokerSummary) {
  const analysis = {
    summary: '',
    macroThesis: '',
    sections: [],
    bandarmology: null
  };
  
  const currentPrice = price.close || 0;
  const { foreignFlow, volumeAnalysis, sidData, timeframes } = indicators;
  
  // Calculate metrics
  const foreignNetBillions = (foreignFlow.netValue || 0) / 1000000000;
  const top3Brokers = brokerSummary.slice(0, 3);
  const top3Net = top3Brokers.reduce((sum, b) => sum + (b.netValue || 0), 0);
  const volRatio = (volumeAnalysis.totalVolume || 0) / (volumeAnalysis.averageVolume || 1);
  const priceChange = price.change_pct || 0;
  
  // SECTOR AND COMPANY INFO
  const sectorInfo = getSectorInfo(symbol);
  
  // === ENHANCED EXECUTIVE SUMMARY ===
  let summaryParts = [];
  summaryParts.push(symbol + ' (' + sectorInfo.sector + ') trading at Rp ' + Math.floor(currentPrice).toLocaleString());
  
  // Foreign flow context
  if (Math.abs(foreignNetBillions) > 1) {
    summaryParts.push('Foreign ' + (foreignNetBillions > 0 ? 'net buying' : 'net selling') + ' ' + Math.abs(foreignNetBillions).toFixed(1) + 'B IDR');
  }
  
  // Broker activity
  if (Math.abs(top3Net) > 50000000000) {
    const action = top3Net > 0 ? 'accumulating' : 'distributing';
    summaryParts.push('Top 3 brokers ' + action + ' ' + Math.abs(top3Net/1000000000).toFixed(1) + 'B');
  }
  
  // Volume signal
  if (volRatio > 2) {
    summaryParts.push('Volume ' + volRatio.toFixed(1) + 'x average suggesting ' + (priceChange > 0 ? 'breakout' : 'distribution'));
  }
  
  // Cost basis signal
  let totalBuyVal = 0, totalBuyVol = 0;
  for (const b of brokerSummary) {
    if (b.buyVolume > 0) {
      totalBuyVal += b.buyValue;
      totalBuyVol += b.buyVolume;
    }
  }
  const avgCost = totalBuyVol > 0 ? Math.floor(totalBuyVal / (totalBuyVol * 100)) : currentPrice;
  const premium = ((currentPrice - avgCost) / avgCost * 100);
  
  if (premium < -5) {
    summaryParts.push('Trading ' + Math.abs(premium).toFixed(1) + '% below broker cost - value opportunity');
  } else if (premium > 25) {
    summaryParts.push('Trading ' + premium.toFixed(1) + '% above broker cost - caution warranted');
  }
  
  analysis.summary = summaryParts.join('. ') + '.';
  
  // === MACRO THESIS ===
  analysis.macroThesis = generateMacroThesis(symbol, sectorInfo, foreignFlow, priceChange);
  
  // === FUNDAMENTALS SECTION ===
  const fundamentals = {
    title: '📈 FUNDAMENTAL SNAPSHOT',
    content: generateFundamentals(symbol, sectorInfo)
  };
  analysis.sections.push(fundamentals);
  
  // === BROKER CONCENTRATION ===
  const section1 = {
    title: '📊 BROKER CONCENTRATION & SMART MONEY',
    content: []
  };
  
  const totalBuyValue = brokerSummary.reduce((sum, b) => sum + (b.buyValue || 0), 0);
  const top3BuyValue = top3Brokers.reduce((sum, b) => sum + (b.buyValue || 0), 0);
  const concentration = totalBuyValue > 0 ? (top3BuyValue / totalBuyValue * 100) : 0;
  
  section1.content.push('• Top 3 brokers control ' + concentration.toFixed(1) + '% of buying volume');
  section1.content.push('• Leading brokers: ' + top3Brokers.map(b => b.code).join(', '));
  
  if (timeframes && timeframes['1W'] && timeframes['1D']) {
    const w1Top = timeframes['1W'].brokers.slice(0, 3).map(b => b.code);
    const d1Top = timeframes['1D'].brokers.slice(0, 3).map(b => b.code);
    const sameBrokers = w1Top.filter(b => d1Top.includes(b));
    if (sameBrokers.length >= 2) {
      section1.content.push('Consistent accumulation by ' + sameBrokers.join(', ') + ' over 1 week');
    }
  }
  
  // Free float analysis
  const totalNetValue = brokerSummary.reduce((sum, b) => sum + Math.abs(b.netValue || 0), 0);
  const floatCapture = sectorInfo.marketCap > 0 ? (totalNetValue / sectorInfo.marketCap * 100) : 0;
  section1.content.push('• Estimated float capture: ' + floatCapture.toFixed(2) + '%');
  
  analysis.sections.push(section1);
  
  // === COST BASIS ===
  const section2 = {
    title: '💰 COST BASIS ANALYSIS',
    content: []
  };
  
  section2.content.push('• Average broker cost: Rp ' + avgCost.toLocaleString());
  section2.content.push('• Current price: Rp ' + Math.floor(currentPrice).toLocaleString());
  section2.content.push('• Premium/Discount: ' + (premium > 0 ? '+' : '') + premium.toFixed(1) + '%');
  
  if (premium >= 10 && premium <= 15) {
    section2.content.push('SWEET SPOT: 10-15% above cost = early accumulation cycle');
  } else if (premium > 30) {
    section2.content.push('DANGER ZONE: >30% above cost = distribution risk high');
  } else if (premium < -5) {
    section2.content.push('VALUE ZONE: Below broker cost = accumulation opportunity');
  }
  
  analysis.sections.push(section2);
  
  // === FOREIGN FLOW ===
  const section3 = {
    title: '🌍 FOREIGN FLOW (SMART MONEY)',
    content: []
  };
  
  section3.content.push('• Net foreign flow: ' + (foreignNetBillions > 0 ? '+' : '') + foreignNetBillions.toFixed(2) + 'B IDR');
  section3.content.push('• Foreign buying via: ' + (foreignFlow.buyBrokers?.join(', ') || 'None'));
  section3.content.push('• Foreign selling via: ' + (foreignFlow.sellBrokers?.join(', ') || 'None'));
  
  if (Math.abs(foreignNetBillions) > 1) {
    section3.content.push((foreignNetBillions > 0 ? 'Strong foreign conviction' : 'Significant foreign exodus'));
  }
  
  analysis.sections.push(section3);
  
  // === VOLUME WITH TIMEFRAME ===
  const section4 = {
    title: '📈 VOLUME & MOMENTUM (vs 20-Day Average)',
    content: []
  };
  
  section4.content.push('• Todays volume: ' + ((volumeAnalysis.totalVolume || 0) / 1000000).toFixed(1) + 'M shares');
  section4.content.push('• 20-day average: ' + ((volumeAnalysis.averageVolume || 0) / 1000000).toFixed(1) + 'M shares');
  section4.content.push('• Volume ratio: ' + volRatio.toFixed(1) + 'x average');
  section4.content.push('• Price change (today): ' + (priceChange > 0 ? '+' : '') + priceChange.toFixed(2) + '%');
  
  if (volRatio > 2.5 && priceChange > 2) {
    section4.content.push('BREAKOUT CONFIRMED: High volume + price surge');
  } else if (volRatio > 2 && priceChange < -1) {
    section4.content.push('DISTRIBUTION: High volume + price drop');
  } else if (volRatio < 0.7) {
    section4.content.push('• Low volume = consolidation phase before next move');
  }
  
  analysis.sections.push(section4);
  
  // === SID ANALYSIS ===
  const section5 = {
    title: '👥 RETAIL PARTICIPATION (SID)',
    content: []
  };
  
  const sidChange = sidData.change || 0;
  const sidCount = sidData.count || 0;
  const sidChangePct = sidCount > 0 ? ((sidChange / (sidCount - sidChange)) * 100) : 0;
  
  section5.content.push('• SID holders: ' + sidCount.toLocaleString());
  section5.content.push('• Change: ' + (sidChange > 0 ? '+' : '') + sidChange + ' (' + sidChangePct.toFixed(1) + '%)');
  
  if (sidChange > 50) {
    section5.content.push('RETAIL FOMO: SID surge often precedes correction - be cautious');
  } else if (sidChange < -30) {
    section5.content.push('WEAK HANDS EXITING: Retail selling, institutions accumulating');
  }
  
  analysis.sections.push(section5);
  
  // === BIG DOG ACTIVITY ===
  const section6 = {
    title: '🐕 BIG DOG ACTIVITY (Tier-1 Brokers)',
    content: []
  };
  
  const BIG_DOGS = ['YU', 'CC', 'NI', 'GW', 'SQ', 'OD', 'BK', 'AK'];
  const bigDogActivity = brokerSummary.filter(b => BIG_DOGS.includes(b.code));
  
  if (bigDogActivity.length > 0) {
    for (const b of bigDogActivity.slice(0, 5)) {
      const action = (b.netValue || 0) > 0 ? 'ACCUMULATING' : 'DISTRIBUTING';
      const lots = b.buyVolume > 0 ? b.buyVolume : b.sellVolume;
      const avgPrice = b.netValue > 0 ? b.avgBuyPrice : b.avgSellPrice;
      section6.content.push('• ' + b.code + ': ' + action + ' ' + (lots > 0 ? (lots/1000).toFixed(1) + 'K lots' : '') + ' @ Rp ' + (avgPrice?.toLocaleString() || 'N/A'));
    }
  } else {
    section6.content.push('• No Big Dog activity detected in current timeframe');
  }
  
  analysis.sections.push(section6);
  
  // === BROKER HOLDINGS DETAIL ===
  const sectionHoldings = {
    title: '📋 BROKER HOLDINGS DETAIL',
    content: []
  };
  
  // Show top brokers with their positions
  const topHolders = brokerSummary.filter(b => (b.netValue || 0) > 0).slice(0, 5);
  if (topHolders.length > 0) {
    for (const b of topHolders) {
      const lots = (b.buyVolume || 0) / 1000;
      const avgPrice = b.avgBuyPrice || 0;
      sectionHoldings.content.push('• ' + b.code + ': ' + lots.toFixed(1) + 'K lots @ Rp ' + avgPrice.toLocaleString() + ' (HOLDING)');
    }
  }
  
  // Check for duration (compare 1W vs 1D)
  const tf = timeframes;
  if (tf && tf['1W'] && tf['1D']) {
    const weeklyBrokers = tf['1W'].brokers.slice(0, 3).map(b => b.code);
    const dailyBrokers = tf['1D'].brokers.slice(0, 3).map(b => b.code);
    const longTermHolders = weeklyBrokers.filter(b => dailyBrokers.includes(b));
    
    if (longTermHolders.length >= 2) {
      sectionHoldings.content.push('⏱️ ' + longTermHolders.join(', ') + ' accumulating for 1+ week');
    }
    
    // Check 1M for extended holding
    if (tf['1M']) {
      const monthlyBrokers = tf['1M'].brokers.slice(0, 3).map(b => b.code);
      const extendedHolders = monthlyBrokers.filter(b => weeklyBrokers.includes(b) && dailyBrokers.includes(b));
      if (extendedHolders.length >= 2) {
        sectionHoldings.content.push('⏱️ ' + extendedHolders.join(', ') + ' accumulating for 1+ MONTH (High Conviction)');
      }
    }
  }
  
  if (sectionHoldings.content.length > 0) {
    analysis.sections.push(sectionHoldings);
  }
  
  // === KEY LEVELS ===
  const section7 = {
    title: '🎯 KEY LEVELS & TRADING ZONES',
    content: []
  };
  
  section7.content.push('• Support Level 1: Rp ' + Math.floor(currentPrice * 0.97).toLocaleString());
  section7.content.push('• Support Level 2: Rp ' + Math.floor(currentPrice * 0.94).toLocaleString());
  section7.content.push('• Resistance Level 1: Rp ' + Math.floor(currentPrice * 1.03).toLocaleString());
  section7.content.push('• Resistance Level 2: Rp ' + Math.floor(currentPrice * 1.06).toLocaleString());
  section7.content.push('• Broker Average Cost: Rp ' + avgCost.toLocaleString() + ' (key pivot)');
  
  analysis.sections.push(section7);
  
  // Add bandarmology analysis
  analysis.bandarmology = generateBandarmologyAnalysis(symbol, price, indicators, brokerSummary);
  
  analysis.redFlags = analyzeRedFlags(symbol, price, indicators, brokerSummary);
  return analysis;
}

function getSectorInfo(symbol) {
  const sectors = {
    'BBCA': { sector: 'Banking', marketCap: 850000000000000, pe: 18.5, roe: 18.2 },
    'BBRI': { sector: 'Banking', marketCap: 620000000000000, pe: 16.8, roe: 19.5 },
    'TLKM': { sector: 'Telecom', marketCap: 280000000000000, pe: 14.2, roe: 22.1 },
    'ASII': { sector: 'Automotive', marketCap: 240000000000000, pe: 12.5, roe: 15.8 },
    'INKP': { sector: 'Paper/Packaging', marketCap: 45000000000000, pe: 8.5, roe: 12.3 },
    'AMMN': { sector: 'Mining', marketCap: 180000000000000, pe: 22.4, roe: 25.6 },
    'ADRO': { sector: 'Coal/Energy', marketCap: 120000000000000, pe: 6.8, roe: 28.4 },
    'ANTM': { sector: 'Mining', marketCap: 85000000000000, pe: 15.2, roe: 18.9 },
    'BMRI': { sector: 'Banking', marketCap: 380000000000000, pe: 15.8, roe: 17.2 },
    'UNVR': { sector: 'Consumer', marketCap: 95000000000000, pe: 24.5, roe: 45.2 }
  };
  
  return sectors[symbol] || { sector: 'General', marketCap: 50000000000000, pe: 15.0, roe: 15.0 };
}

function generateMacroThesis(symbol, sectorInfo, foreignFlow, priceChange) {
  const themes = {
    'Banking': 'Interest rate cycle favorable. Digital transformation improving efficiency. Strong credit growth expected in 2025.',
    'Mining': 'Global commodity demand recovery. ESG transition creating winners/losers. Supply constraints supporting prices.',
    'Coal/Energy': 'Energy security priority post-crisis. Transition timeline extended. Cash flow generation strong for dividends.',
    'Telecom': '5G rollout accelerating. Data center/cloud infrastructure investments paying off. Digital economy tailwinds.',
    'Automotive': 'Post-pandemic recovery ongoing. EV transition creating opportunities. Government incentives supporting sales.',
    'Consumer': 'Middle class consumption resilient. Premiumization trend benefiting leaders. Distribution scale advantage.',
    'Paper/Packaging': 'E-commerce growth driving packaging demand. Sustainability focus on recyclable materials. Regional expansion.'
  };
  
  const foreignComment = foreignFlow.netValue > 1000000000 ? 'Foreign accumulation suggests confidence in sector outlook. ' : 
                        foreignFlow.netValue < -1000000000 ? 'Foreign exit may present contrarian entry opportunity. ' : '';
  
  const momentumComment = priceChange > 5 ? 'Recent momentum strong - watch for continuation. ' : 
                         priceChange < -5 ? 'Pullback may offer entry if fundamentals intact. ' : '';
  
  return (themes[sectorInfo.sector] || sectorInfo.sector + ' sector showing mixed signals. ') + foreignComment + momentumComment;
}

function generateFundamentals(symbol, sectorInfo) {
  const lines = [];
  lines.push('• Sector: ' + sectorInfo.sector);
  lines.push('• Market Cap: Rp ' + (sectorInfo.marketCap / 1000000000000).toFixed(1) + 'T');
  lines.push('• P/E Ratio: ' + sectorInfo.pe + 'x (Sector avg: ~15x)');
  lines.push('• ROE: ' + sectorInfo.roe + '% (Strong capital efficiency)');
  
  if (sectorInfo.pe < 12) {
    lines.push('ATTRACTIVE VALUATION: P/E below sector average');
  } else if (sectorInfo.pe > 20) {
    lines.push('PREMIUM VALUATION: High P/E requires strong growth');
  }
  
  if (sectorInfo.roe > 20) {
    lines.push('EXCELLENT ROE: Above 20% capital efficiency');
  }
  
  return lines;
}

function generateBandarmologyAnalysis(symbol, price, indicators, brokerSummary) {
  const analysis = {
    priceVsCost: { status: 'NEUTRAL', detail: '', premium: 0 },
    brokerAccumulation: { status: 'NEUTRAL', detail: '', accumulationPct: 0 },
    stillHolding: { status: 'UNKNOWN', detail: '' },
    accumulationDuration: { status: 'NEUTRAL', detail: '' }
  };
  
  const top3Brokers = brokerSummary.slice(0, 3);
  const top3Net = top3Brokers.reduce((sum, b) => sum + (b.netValue || 0), 0);
  const floatSize = 1000000000000;
  const accumulationPct = (Math.abs(top3Net) / floatSize * 100);
  
  if (accumulationPct > 10) {
    analysis.brokerAccumulation = { status: 'STRONG', detail: 'Top 3 brokers hold ~' + accumulationPct.toFixed(1) + '% of float - HIGH CONVICTION', accumulationPct };
  } else if (accumulationPct > 5) {
    analysis.brokerAccumulation = { status: 'GOOD', detail: 'Top 3 brokers hold ~' + accumulationPct.toFixed(1) + '% of float - building position', accumulationPct };
  } else {
    analysis.brokerAccumulation = { status: 'WEAK', detail: 'Top 3 brokers only ' + accumulationPct.toFixed(1) + '% of float - not controlling', accumulationPct };
  }
  
  let totalCost = 0, totalVol = 0;
  for (const b of brokerSummary) {
    if (b.buyVolume > 0) {
      totalCost += b.buyValue;
      totalVol += b.buyVolume;
    }
  }
  const avgPrice = price.close || price.current || 0;
  const avgCost = totalVol > 0 ? Math.floor(totalCost / (totalVol * 100)) : avgPrice;
  const premium = ((avgPrice - avgCost) / avgCost * 100);
  analysis.priceVsCost.premium = premium;
  
  if (premium >= 10 && premium <= 20) {
    analysis.priceVsCost = { status: 'SWEET_SPOT', detail: 'Price ' + premium.toFixed(1) + '% above broker cost - EARLY CYCLE', premium };
  } else if (premium > 30) {
    analysis.priceVsCost = { status: 'DANGER', detail: 'Price ' + premium.toFixed(1) + '% above broker cost - LATE CYCLE', premium };
  } else if (premium < 0) {
    analysis.priceVsCost = { status: 'VALUE', detail: 'Price ' + Math.abs(premium).toFixed(1) + '% BELOW broker cost - ACCUMULATION OPPORTUNITY', premium };
  } else {
    analysis.priceVsCost = { status: 'EARLY', detail: 'Price ' + premium.toFixed(1) + '% above broker cost - just above cost, room to run', premium };
  }
  
  const holdingBrokers = top3Brokers.filter(b => (b.netValue || 0) > 0);
  const exitingBrokers = top3Brokers.filter(b => (b.netValue || 0) < 0);
  
  if (holdingBrokers.length >= 2 && exitingBrokers.length === 0) {
    analysis.stillHolding = { status: 'YES', detail: holdingBrokers.map(b => b.code).join(', ') + ' STILL HOLDING - Accumulation ongoing', brokers: holdingBrokers.map(b => b.code) };
  } else if (exitingBrokers.length > 0) {
    analysis.stillHolding = { status: 'NO', detail: exitingBrokers.map(b => b.code).join(', ') + ' SELLING - Institutions exiting', brokers: exitingBrokers.map(b => b.code) };
  } else {
    analysis.stillHolding = { status: 'MIXED', detail: 'Mixed signals - some holding, some reducing', brokers: [] };
  }
  
  const tf = indicators.timeframes;
  if (tf && tf['1W'] && tf['1D']) {
    const weeklyTop = tf['1W'].brokers.slice(0, 3).map(b => b.code);
    const dailyTop = tf['1D'].brokers.slice(0, 3).map(b => b.code);
    const consistent = weeklyTop.filter(b => dailyTop.includes(b));
    if (consistent.length >= 2) {
      analysis.accumulationDuration = { status: 'EXTENDED', detail: consistent.join(', ') + ' accumulating for 1+ week - HIGH CONVICTION' };
    } else {
      analysis.accumulationDuration = { status: 'SHORT', detail: 'Recent accumulation only - lower conviction' };
    }
  }
  
  analysis.redFlags = analyzeRedFlags(symbol, price, indicators, brokerSummary);
  return analysis;
}

// Red Flag Indicators Analysis
function analyzeRedFlags(symbol, price, indicators, brokerSummary) {
  const redFlags = [];
  const { volumeAnalysis, foreignFlow, foreignStreak, priceAction, brokerConcentration } = indicators;
  const currentPrice = price.close || price.current || 0;
  const priceChange = price.change_pct || 0;
  
  // 1. High volume but price can't advance (distribution)
  const volRatio = (volumeAnalysis?.totalVolume || 0) / (volumeAnalysis?.averageVolume || 1);
  if (volRatio > 2.0 && priceChange < 0) {
    redFlags.push({
      type: 'DISTRIBUTION',
      severity: 'HIGH',
      title: 'Distribution Detected',
      description: 'Volume ' + volRatio.toFixed(1) + 'x average but price dropped ' + priceChange.toFixed(1) + '%. Institutions are selling into strength.',
      implication: 'Distribution phase - smart money exiting'
    });
  }
  
  // 2. Multiple broker codes all selling simultaneously
  const sellingBrokers = brokerSummary.filter(b => (b.netValue || 0) < 0);
  const sellingBrokerCodes = sellingBrokers.map(b => b.code);
  if (sellingBrokers.length >= 3) {
    const totalSellValue = sellingBrokers.reduce((sum, b) => sum + Math.abs(b.netValue || 0), 0);
    redFlags.push({
      type: 'BROADER_SELLING',
      severity: 'HIGH',
      title: 'Broad-Based Selling',
      description: sellingBrokers.length + ' major brokers (' + sellingBrokerCodes.join(', ') + ') selling simultaneously. Total exit: Rp ' + (totalSellValue/1e9).toFixed(1) + 'B.',
      implication: 'Coordinated institutional exit - avoid'
    });
  }
  
  // 3. Net foreign sell for 10+ consecutive days
  if (foreignStreak?.detected && foreignStreak.consecutiveDays <= -10) {
    redFlags.push({
      type: 'FOREIGN_EXODUS',
      severity: 'CRITICAL',
      title: 'Foreign Exodus Alert',
      description: 'Foreign selling for ' + Math.abs(foreignStreak.consecutiveDays) + ' consecutive days. Total outflow: Rp ' + (Math.abs(foreignStreak.totalNetValue || 0)/1e9).toFixed(1) + 'B.',
      implication: 'Sustained foreign exit - major red flag'
    });
  }
  
  // 4. Price rising on declining volume (unsustainable)
  if (priceChange > 2 && volRatio < 0.8) {
    redFlags.push({
      type: 'WEAK_RALLY',
      severity: 'MEDIUM',
      title: 'Weak Rally',
      description: 'Price up ' + priceChange.toFixed(1) + '% but volume only ' + volRatio.toFixed(1) + 'x average. Rally lacks institutional participation.',
      implication: 'Unsustainable move - likely to reverse'
    });
  }
  
  // 5. Promoter/rumor-driven spike without broker accumulation
  if (priceChange > 5 && volRatio > 2) {
    const hasBrokerAccumulation = brokerConcentration?.detected || false;
    const hasForeignBuying = (foreignFlow?.netValue || 0) > 0;
    
    if (!hasBrokerAccumulation && !hasForeignBuying) {
      redFlags.push({
        type: 'PUMP_AND_DUMP',
        severity: 'HIGH',
        title: 'Suspect Rally',
        description: 'Price surged ' + priceChange.toFixed(1) + '% on high volume but NO broker accumulation or foreign buying detected.',
        implication: 'High risk of sharp reversal - avoid chasing'
      });
    }
  }
  
  return {
    hasRedFlags: redFlags.length > 0,
    count: redFlags.length,
    flags: redFlags,
    riskLevel: redFlags.some(f => f.severity === 'CRITICAL') ? 'CRITICAL' : 
                redFlags.some(f => f.severity === 'HIGH') ? 'HIGH' : 
                redFlags.some(f => f.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW'
  };
}
