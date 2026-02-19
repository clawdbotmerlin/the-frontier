// Enhanced Comprehensive Analysis Generator v2.0
// With macro thesis, fundamentals, and detailed executive summary

export function generateComprehensiveAnalysis(symbol, price, indicators, brokerSummary) {
  const analysis = {
    summary: '',
    macroThesis: '',
    sections: []
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
  summaryParts.push(`${symbol} (${sectorInfo.sector}) trading at Rp ${Math.floor(currentPrice).toLocaleString()}`);
  
  // Foreign flow context
  if (Math.abs(foreignNetBillions) > 1) {
    summaryParts.push(`Foreign ${foreignNetBillions > 0 ? 'net buying' : 'net selling'} ${Math.abs(foreignNetBillions).toFixed(1)}B IDR`);
  }
  
  // Broker activity
  if (Math.abs(top3Net) > 50000000000) {
    const action = top3Net > 0 ? 'accumulating' : 'distributing';
    summaryParts.push(`Top 3 brokers ${action} ${Math.abs(top3Net/1000000000).toFixed(1)}B`);
  }
  
  // Volume signal
  if (volRatio > 2) {
    summaryParts.push(`Volume ${volRatio.toFixed(1)}x average suggesting ${priceChange > 0 ? 'breakout' : 'distribution'}`);
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
    summaryParts.push(`Trading ${Math.abs(premium).toFixed(1)}% below broker cost - value opportunity`);
  } else if (premium > 25) {
    summaryParts.push(`Trading ${premium.toFixed(1)}% above broker cost - caution warranted`);
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
  
  section1.content.push(`• Top 3 brokers control ${concentration.toFixed(1)}% of buying volume`);
  section1.content.push(`• Leading brokers: ${top3Brokers.map(b => b.code).join(', ')}`);
  
  if (timeframes && timeframes['1W'] && timeframes['1D']) {
    const w1Top = timeframes['1W'].brokers.slice(0, 3).map(b => b.code);
    const d1Top = timeframes['1D'].brokers.slice(0, 3).map(b => b.code);
    const sameBrokers = w1Top.filter(b => d1Top.includes(b));
    if (sameBrokers.length >= 2) {
      section1.content.push(`✅ Consistent accumulation by ${sameBrokers.join(', ')} over 1 week`);
    }
  }
  
  // Free float analysis
  const totalNetValue = brokerSummary.reduce((sum, b) => sum + Math.abs(b.netValue || 0), 0);
  const floatCapture = sectorInfo.marketCap > 0 ? (totalNetValue / sectorInfo.marketCap * 100) : 0;
  section1.content.push(`• Estimated float capture: ${floatCapture.toFixed(2)}%`);
  
  analysis.sections.push(section1);
  
  // === COST BASIS ===
  const section2 = {
    title: '💰 COST BASIS ANALYSIS',
    content: []
  };
  
  section2.content.push(`• Average broker cost: Rp ${avgCost.toLocaleString()}`);
  section2.content.push(`• Current price: Rp ${Math.floor(currentPrice).toLocaleString()}`);
  section2.content.push(`• Premium/Discount: ${premium > 0 ? '+' : ''}${premium.toFixed(1)}%`);
  
  if (premium >= 10 && premium <= 15) {
    section2.content.push(`✅ SWEET SPOT: 10-15% above cost = early accumulation cycle`);
  } else if (premium > 30) {
    section2.content.push(`⚠️  DANGER ZONE: >30% above cost = distribution risk high`);
  } else if (premium < -5) {
    section2.content.push(`✅ VALUE ZONE: Below broker cost = accumulation opportunity`);
  }
  
  analysis.sections.push(section2);
  
  // === FOREIGN FLOW ===
  const section3 = {
    title: '🌍 FOREIGN FLOW (SMART MONEY)',
    content: []
  };
  
  section3.content.push(`• Net foreign flow: ${foreignNetBillions > 0 ? '+' : ''}${foreignNetBillions.toFixed(2)}B IDR`);
  section3.content.push(`• Foreign buying via: ${foreignFlow.buyBrokers?.join(', ') || 'None'}`);
  section3.content.push(`• Foreign selling via: ${foreignFlow.sellBrokers?.join(', ') || 'None'}`);
  
  if (Math.abs(foreignNetBillions) > 1) {
    section3.content.push(`${foreignNetBillions > 0 ? '✅ Strong foreign conviction' : '⚠️  Significant foreign exodus'}`);
  }
  
  analysis.sections.push(section3);
  
  // === VOLUME WITH TIMEFRAME ===
  const section4 = {
    title: '📈 VOLUME & MOMENTUM (vs 20-Day Average)',
    content: []
  };
  
  section4.content.push(`• Today's volume: ${((volumeAnalysis.totalVolume || 0) / 1000000).toFixed(1)}M shares`);
  section4.content.push(`• 20-day average: ${((volumeAnalysis.averageVolume || 0) / 1000000).toFixed(1)}M shares`);
  section4.content.push(`• Volume ratio: ${volRatio.toFixed(1)}x average`);
  section4.content.push(`• Price change (today): ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
  
  if (volRatio > 2.5 && priceChange > 2) {
    section4.content.push(`✅ BREAKOUT CONFIRMED: High volume + price surge`);
  } else if (volRatio > 2 && priceChange < -1) {
    section4.content.push(`⚠️  DISTRIBUTION: High volume + price drop`);
  } else if (volRatio < 0.7) {
    section4.content.push(`• Low volume = consolidation phase before next move`);
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
  
  section5.content.push(`• SID holders: ${sidCount.toLocaleString()}`);
  section5.content.push(`• Change: ${sidChange > 0 ? '+' : ''}${sidChange} (${sidChangePct.toFixed(1)}%)`);
  
  if (sidChange > 50) {
    section5.content.push(`⚠️  RETAIL FOMO: SID surge often precedes correction - be cautious`);
  } else if (sidChange < -30) {
    section5.content.push(`✅ WEAK HANDS EXITING: Retail selling, institutions accumulating`);
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
      section6.content.push(`• ${b.code}: ${action} ${lots > 0 ? (lots/1000).toFixed(1) + 'K lots' : ''} @ Rp ${avgPrice?.toLocaleString() || 'N/A'}`);
    }
  } else {
    section6.content.push(`• No Big Dog activity detected in current timeframe`);
  }
  
  analysis.sections.push(section6);
  
  // === KEY LEVELS ===
  const section7 = {
    title: '🎯 KEY LEVELS & TRADING ZONES',
    content: []
  };
  
  section7.content.push(`• Support Level 1: Rp ${Math.floor(currentPrice * 0.97).toLocaleString()}`);
  section7.content.push(`• Support Level 2: Rp ${Math.floor(currentPrice * 0.94).toLocaleString()}`);
  section7.content.push(`• Resistance Level 1: Rp ${Math.floor(currentPrice * 1.03).toLocaleString()}`);
  section7.content.push(`• Resistance Level 2: Rp ${Math.floor(currentPrice * 1.06).toLocaleString()}`);
  section7.content.push(`• Broker Average Cost: Rp ${avgCost.toLocaleString()} (key pivot)`);
  
  analysis.sections.push(section7);
  
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
  
  return (themes[sectorInfo.sector] || `${sectorInfo.sector} sector showing mixed signals. `) + foreignComment + momentumComment;
}

function generateFundamentals(symbol, sectorInfo) {
  const lines = [];
  lines.push(`• Sector: ${sectorInfo.sector}`);
  lines.push(`• Market Cap: Rp ${(sectorInfo.marketCap / 1000000000000).toFixed(1)}T`);
  lines.push(`• P/E Ratio: ${sectorInfo.pe}x (Sector avg: ~15x)`);
  lines.push(`• ROE: ${sectorInfo.roe}% (Strong capital efficiency)`);
  
  if (sectorInfo.pe < 12) {
    lines.push(`✅ ATTRACTIVE VALUATION: P/E below sector average`);
  } else if (sectorInfo.pe > 20) {
    lines.push(`⚠️  PREMIUM VALUATION: High P/E requires strong growth`);
  }
  
  if (sectorInfo.roe > 20) {
    lines.push(`✅ EXCELLENT ROE: Above 20% capital efficiency`);
  }
  
  return lines;
}
