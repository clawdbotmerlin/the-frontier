import { generateComprehensiveAnalysis } from './comprehensive-analysis.js';
import express from 'express';
import { setupDashboard } from './dashboard-route.js';
import cors from 'cors';
import axios from 'axios';
import pg from 'pg';
import { calculateBandarScore, generateSignalReasoning } from './scoring.js';
import { runBacktest } from './backtest.js';

const { Pool } = pg;

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'the_frontier',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.GOAPI_API_KEY || 'c6133705-2a93-506b-f575-a55ce0ae';
const BASE_URL = process.env.GOAPI_BASE_URL || 'https://api.goapi.io/stock/idx';

app.use(cors());
app.use(express.json());
// Setup dashboard route
setupDashboard(app);

// LQ45 Constituents (2024-2025)
const LQ45_STOCKS = [
  'ADRO', 'AMMN', 'ANTM', 'ARTO', 'ASII', 'BBCA', 'BBNI', 'BBRI', 'BBTN', 'BMRI',
  'BRIS', 'BRPT', 'BUKA', 'CPIN', 'EMTK', 'ESSA', 'EXCL', 'GGRM', 'GOTO', 'HRUM',
  'ICBP', 'INDF', 'INKP', 'INTP', 'ITMG', 'KLBF', 'MAPI', 'MBMA', 'MDKA', 'MEDC',
  'MTEL', 'PGAS', 'PTBA', 'SMGR', 'SRIL', 'TBIG', 'TINS', 'TLKM', 'TPIA', 'UNTR',
  'UNVR', 'BBRI', 'BMRI', 'BBCA', 'TLKM'
].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

// Known foreign brokers (by code)
const FOREIGN_BROKERS = ['AK', 'BK', 'KZ', 'YP', 'GR', 'AI', 'ZZ', 'YU', 'CC'];

// Known bandar/brokerage firms with significant market presence
const BANDAR_BROKERS = ['YU', 'CC', 'SQ', 'NI', 'OD', 'GW', 'BK', 'AK', 'PD', 'XL'];

// Cache for API responses
const cache = {
  prices: null,
  companies: null,
  brokers: null,
  lastFetch: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to fetch from GoAPI
async function fetchFromAPI(endpoint, params = {}) {
  try {
    const queryParams = new URLSearchParams({ ...params, api_key: API_KEY });
    const url = `${BASE_URL}${endpoint}?${queryParams}`;
    const response = await axios.get(url, { timeout: 30000 });
    return response.data;
  } catch (error) {
    console.error(`API Error: ${endpoint}`, error.message);
    throw error;
  }
}

// Get all companies data
async function getCompanies() {
  if (cache.companies && cache.lastFetch && (Date.now() - cache.lastFetch < CACHE_DURATION)) {
    return cache.companies;
  }
  const data = await fetchFromAPI('/companies');
  cache.companies = data.data.results;
  return cache.companies;
}

// Get current prices for symbols
async function getPrices(symbols) {
  const symbolString = Array.isArray(symbols) ? symbols.join(',') : symbols;
  return await fetchFromAPI('/prices', { symbols: symbolString });
}

// Get brokers list
async function getBrokers() {
  if (cache.brokers && cache.lastFetch && (Date.now() - cache.lastFetch < CACHE_DURATION)) {
    return cache.brokers;
  }
  const data = await fetchFromAPI('/brokers');
  cache.brokers = data.data.results;
  return cache.brokers;
}

// Get real broker transactions from database for a specific stock and date
async function getBrokerTransactionsFromDB(symbol, date) {
  const client = await pool.connect();
  try {
    // Get the date - use provided date or default to latest available
    let queryDate = date;
    if (!queryDate) {
      const latestResult = await client.query(`
        SELECT MAX(DATE(time)) as latest_date FROM broker_transactions
      `);
      queryDate = latestResult.rows[0]?.latest_date;
    }
    
    if (!queryDate) {
      return null;
    }

    // Query broker transactions with broker details
    const result = await client.query(`
      SELECT 
        bt.broker_id,
        bt.buy_volume,
        bt.buy_value,
        bt.sell_volume,
        bt.sell_value,
        bt.net_volume,
        bt.net_value,
        b.code,
        b.name,
        b.type
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      JOIN stocks s ON bt.stock_id = s.id
      WHERE s.symbol = $1 
        AND DATE(bt.time) = $2
      ORDER BY ABS(bt.net_value) DESC
    `, [symbol, queryDate]);

    return {
      date: queryDate,
      transactions: result.rows
    };
  } finally {
    client.release();
  }
}

// Get historical volume data for volume comparison
async function getHistoricalVolumeData(symbol, days = 20) {
  const client = await pool.connect();
  try {
    // Get the latest available date for this stock
    const latestDate = await getLatestDataDate(symbol);
    if (!latestDate) return [];
    
    const result = await client.query(`
      SELECT 
        DATE(bt.time) as date,
        SUM(bt.buy_volume + bt.sell_volume) as total_volume
      FROM broker_transactions bt
      JOIN stocks s ON bt.stock_id = s.id
      WHERE s.symbol = $1
        AND DATE(bt.time) <= $2
        AND DATE(bt.time) > $2 - INTERVAL '${days} days'
      GROUP BY DATE(bt.time)
      ORDER BY date DESC
      LIMIT ${days}
    `, [symbol, latestDate]);

    return result.rows;
  } catch (error) {
    console.error(`Error getting historical volume for ${symbol}:`, error.message);
    return [];
  } finally {
    client.release();
  }
}

// Helper: Get the latest available date for a stock
async function getLatestDataDate(symbol) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT MAX(DATE(bt.time)) as latest_date
      FROM broker_transactions bt
      JOIN stocks s ON bt.stock_id = s.id
      WHERE s.symbol = $1
    `, [symbol]);
    return result.rows[0]?.latest_date;
  } catch (error) {
    console.error(`Error getting latest date for ${symbol}:`, error.message);
    return null;
  } finally {
    client.release();
  }
}

// Get historical foreign flow data for streak detection (Indicator #4)
async function getForeignFlowHistory(symbol, days = 10) {
  const client = await pool.connect();
  try {
    // Get the latest available date for this stock
    const latestDate = await getLatestDataDate(symbol);
    if (!latestDate) return [];
    
    const result = await client.query(`
      SELECT 
        DATE(bt.time) as date,
        SUM(CASE WHEN b.type = 'foreign' THEN bt.net_value ELSE 0 END) as foreign_net_value
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      JOIN stocks s ON bt.stock_id = s.id
      WHERE s.symbol = $1
        AND DATE(bt.time) <= $2
        AND DATE(bt.time) > $2 - INTERVAL '${days} days'
        AND b.type = 'foreign'
      GROUP BY DATE(bt.time)
      ORDER BY date DESC
      LIMIT ${days}
    `, [symbol, latestDate]);

    return result.rows;
  } catch (error) {
    console.error(`Error getting foreign flow history for ${symbol}:`, error.message);
    return []; // Return empty array on error
  } finally {
    client.release();
  }
}

// Get broker concentration history for bandar detection (Indicator #5)
async function getBrokerConcentrationHistory(symbol, days = 10) {
  const client = await pool.connect();
  try {
    // Get the latest available date for this stock
    const latestDate = await getLatestDataDate(symbol);
    if (!latestDate) return [];
    
    const result = await client.query(`
      SELECT 
        DATE(bt.time) as date,
        b.code,
        SUM(bt.buy_value) as buy_value,
        SUM(bt.sell_value) as sell_value,
        SUM(bt.net_value) as net_value
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      JOIN stocks s ON bt.stock_id = s.id
      WHERE s.symbol = $1
        AND DATE(bt.time) <= $2
        AND DATE(bt.time) > $2 - INTERVAL '${days} days'
      GROUP BY DATE(bt.time), b.code
      ORDER BY date DESC, ABS(SUM(bt.net_value)) DESC
    `, [symbol, latestDate]);

    return result.rows;
  } catch (error) {
    console.error(`Error getting broker concentration history for ${symbol}:`, error.message);
    return []; // Return empty array on error
  } finally {
    client.release();
  }
}

// Generate REAL bandar indicators from database data
async function generateBandarIndicators(symbol, priceData) {
  const volume = priceData.volume || 0;
  const closePrice = priceData.close || 0;
  
  try {
    console.log(`[DEBUG] Starting generateBandarIndicators for ${symbol}`);
    // Get real broker transactions
    const txData = await getBrokerTransactionsFromDB(symbol);
    console.log(`[DEBUG] Got txData for ${symbol}: ${txData ? txData.transactions?.length : 0} transactions`);

    if (!txData || !txData.transactions || txData.transactions.length === 0) {
      console.log(`No transaction data found for ${symbol}, falling back to basic data`);
      return generateBasicIndicators(symbol, priceData);
    }

    const transactions = txData.transactions;
    const txDate = txData.date;

    // Calculate foreign flow (brokers identified as foreign)
    let foreignBuyVolume = 0;
    let foreignBuyValue = 0;
    let foreignSellVolume = 0;
    let foreignSellValue = 0;

    // Calculate totals
    let totalBuyVolume = 0;
    let totalBuyValue = 0;
    let totalSellVolume = 0;
    let totalSellValue = 0;

    // Track top brokers
    const brokerSummary = [];
    const bandarBrokerActivity = [];

    // Initialize indicator variables (scoped for return statement)
    let volumeSpike = null;
    let volumeDryUp = null;
    let bidAskImbalance = {
      detected: false,
      ratio: 1.0,
      signal: 'NEUTRAL',
      severity: 'NONE',
      buyPressure: 0,
      description: 'No significant bid-ask imbalance detected'
    };
    let foreignStreak = {
      detected: false,
      consecutiveDays: 0,
      totalNetValue: 0,
      signal: 'NEUTRAL',
      description: 'No sustained foreign flow pattern'
    };
    let brokerConcentration = {
      detected: false,
      dominantBrokers: [],
      concentrationDays: 0,
      signal: 'NEUTRAL',
      description: 'No significant broker concentration'
    };
    
    for (const tx of transactions) {
      const buyVol = parseInt(tx.buy_volume) || 0;
      const buyVal = parseInt(tx.buy_value) || 0;
      const sellVol = parseInt(tx.sell_volume) || 0;
      const sellVal = parseInt(tx.sell_value) || 0;
      
      totalBuyVolume += buyVol;
      totalBuyValue += buyVal;
      totalSellVolume += sellVol;
      totalSellValue += sellVal;
      
      // Check if foreign broker
      const isForeign = FOREIGN_BROKERS.includes(tx.code);
      if (isForeign) {
        foreignBuyVolume += buyVol;
        foreignBuyValue += buyVal;
        foreignSellVolume += sellVol;
        foreignSellValue += sellVal;
      }
      
      // Add to broker summary
      brokerSummary.push({
        code: tx.code,
        name: tx.name,
        buyVolume: buyVol,
        buyValue: buyVal,
        sellVolume: sellVol,
        sellValue: sellVal,
        netVolume: buyVol - sellVol,
        netValue: buyVal - sellVal,
        isForeign: isForeign
      });
      
      // Track bandar brokers
      if (BANDAR_BROKERS.includes(tx.code) || Math.abs(buyVal - sellVal) > 10000000000) {
        bandarBrokerActivity.push({
          code: tx.code,
          netValue: buyVal - sellVal,
          isForeign: isForeign
        });
      }
    }
    
    const foreignNet = foreignBuyVolume - foreignSellVolume;
    const foreignNetValue = foreignBuyValue - foreignSellValue;
    
    // Get historical volume for comparison (20 days)
    const histVolumeData = await getHistoricalVolumeData(symbol, 20);
    let avgVolume = volume;

    // Lowered threshold: need 3+ days (was 5+)
    if (histVolumeData.length > 3) {
      const volumes = histVolumeData.map(v => parseInt(v.total_volume));
      avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      
      // Calculate volume spike ratio
      const currentTotalVolume = totalBuyVolume + totalSellVolume;
      const spikeRatio = avgVolume > 0 ? currentTotalVolume / avgVolume : 1;
      
      // Detect unusual volume spike - lowered threshold to 1.5x (was 2x)
      if (spikeRatio >= 1.5 && spikeRatio < 3.0) {
        volumeSpike = {
          detected: true,
          ratio: parseFloat(spikeRatio.toFixed(2)),
          severity: spikeRatio >= 2.5 ? 'HIGH' : 'MODERATE',
          signal: 'STEALTH_ACCUMULATION',
          description: `Volume ${spikeRatio.toFixed(1)}x above avg - Possible bandar accumulation`,
          avgVolume20d: Math.round(avgVolume),
          currentVolume: currentTotalVolume
        };
      } else if (spikeRatio >= 3.0) {
        volumeSpike = {
          detected: true,
          ratio: parseFloat(spikeRatio.toFixed(2)),
          severity: 'EXTREME',
          signal: 'BREAKOUT',
          description: `Volume ${spikeRatio.toFixed(1)}x above avg - News-driven or distribution`,
          avgVolume20d: Math.round(avgVolume),
          currentVolume: currentTotalVolume
        };
      } else {
        volumeSpike = {
          detected: false,
          ratio: parseFloat(spikeRatio.toFixed(2)),
          severity: 'NONE',
          signal: 'NORMAL',
          avgVolume20d: Math.round(avgVolume),
          currentVolume: currentTotalVolume
        };
      }

      // Volume Dry-Up (VDU) Detection - lowered to 5 days (was 10)
      if (volumes.length >= 5) {
        const recentVolumes = volumes.slice(-5);
        const recentAvg = recentVolumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        
        // Check for dry-up - lowered to 2 days (was 3)
        const dryUpDays = recentVolumes.slice(0, 3).filter(v => v < recentAvg * 0.7).length;
        const isDryUp = dryUpDays >= 2;
        
        const surgeDetected = spikeRatio >= 1.3 && isDryUp;
        
        if (isDryUp && surgeDetected) {
          volumeDryUp = {
            detected: true,
            signal: 'VDU_BREAKOUT',
            severity: 'HIGH',
            description: `Dry-up (${dryUpDays} days) + ${spikeRatio.toFixed(1)}x surge - accumulation complete`,
            dryUpDays: dryUpDays,
            dryUpVolume: Math.round(recentAvg),
            breakoutVolume: currentTotalVolume,
            confidence: Math.min(95, 50 + (dryUpDays * 15) + (spikeRatio * 10))
          };
        } else if (isDryUp) {
          volumeDryUp = {
            detected: true,
            signal: 'VDU_ACCUMULATING',
            severity: 'MODERATE',
            description: `Dry-up phase (${dryUpDays} days) - quiet accumulation`,
            dryUpDays: dryUpDays,
            dryUpVolume: Math.round(recentAvg),
            breakoutVolume: currentTotalVolume,
            confidence: Math.min(80, 30 + (dryUpDays * 15))
          };
        } else {
          volumeDryUp = {
            detected: false,
            signal: 'NORMAL',
            severity: 'NONE'
          };
        }
      }
    }

    // Bid-Ask Volume Imbalance Detection (Indicator #3)
    // Detects consistently higher bid volume vs ask even when price flat/down
    // Calculate bid-ask ratio from broker activity
    const totalBidVolume = totalBuyVolume;
    const totalAskVolume = totalSellVolume;
    const bidAskRatio = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 1;
    const priceChange = priceData.changePct || 0;
    
    // Detect stealth accumulation: lowered threshold to 1.15x (was 1.3x)
    if (bidAskRatio > 1.15 && priceChange <= 2) {
      bidAskImbalance.detected = true;
      bidAskImbalance.ratio = parseFloat(bidAskRatio.toFixed(2));
      bidAskImbalance.buyPressure = Math.round((bidAskRatio - 1) * 100);
      
      if (priceChange < -0.5 && bidAskRatio > 1.3) {
        bidAskImbalance.signal = 'STEALTH_ACCUMULATION';
        bidAskImbalance.severity = 'HIGH';
        bidAskImbalance.description = `Aggressive buying (${bidAskRatio.toFixed(1)}x bid/ask) despite -${Math.abs(priceChange).toFixed(1)}% price drop - Bandar absorbing`;
      } else if (Math.abs(priceChange) <= 2) {
        bidAskImbalance.signal = 'HIDDEN_SUPPORT';
        bidAskImbalance.severity = bidAskRatio > 1.5 ? 'HIGH' : 'MODERATE';
        bidAskImbalance.description = `Bid support (${bidAskRatio.toFixed(1)}x) keeping price stable - Floor defense`;
      }
    } else if (bidAskRatio < 0.85 && priceChange >= -2) {
      bidAskImbalance.detected = true;
      bidAskImbalance.ratio = parseFloat(bidAskRatio.toFixed(2));
      bidAskImbalance.buyPressure = Math.round((bidAskRatio - 1) * 100);
      bidAskImbalance.signal = 'DISTRIBUTION';
      bidAskImbalance.severity = 'HIGH';
      bidAskImbalance.description = `Selling pressure (${(1/bidAskRatio).toFixed(1)}x ask/bid) - Distribution`;
    }
    
    // Calculate large lot transactions (above 1B IDR or 100k shares)
    const largeLotThreshold = 1000000000; // 1 Billion IDR
    const largeLotTransactions = brokerSummary.filter(b => 
      b.buyValue > largeLotThreshold || b.sellValue > largeLotThreshold
    );
    
    const largeLotVolume = largeLotTransactions.reduce((sum, b) => 
      sum + Math.max(b.buyVolume, b.sellVolume), 0
    );
    const largeLotValue = largeLotTransactions.reduce((sum, b) => 
      sum + Math.max(b.buyValue, b.sellValue), 0
    );
    
    // Calculate queue manipulation score based on buy/sell imbalance
    const buySellRatio = totalBuyVolume / (totalSellVolume || 1);
    const queueManipulation = Math.min(100, Math.max(0, 
      buySellRatio > 1 ? (buySellRatio - 1) * 50 : (1 - buySellRatio) * 50
    ));
    
    // Estimate running trades (frequency of transactions)
    const runningTrades = transactions.length * 10; // Approximate
    
    // Calculate transaksi nego (negotiated deals - typically large block trades)
    const negoThreshold = 5000000000; // 5 Billion IDR
    const transaksiNegoList = brokerSummary.filter(b => 
      b.buyValue > negoThreshold || b.sellValue > negoThreshold
    );
    const transaksiNegoVolume = transaksiNegoList.reduce((sum, b) => 
      sum + (b.buyValue > negoThreshold ? b.buyVolume : b.sellVolume), 0
    );
    const transaksiNegoValue = transaksiNegoList.reduce((sum, b) => 
      sum + Math.max(b.buyValue, b.sellValue), 0
    );

    // SID data (simulated - would need SID table)
    const sidCount = Math.floor(1000 + Math.random() * 5000);
    const sidChange = Math.floor((Math.random() - 0.5) * 200);

    // Indicator #4: Foreign Net Buy Flow (multi-day streak detection)
    try {
      const foreignFlowHistory = await getForeignFlowHistory(symbol, 10);
      
      if (foreignFlowHistory.length >= 5) {
        let consecutiveBuys = 0;
        let totalNet = 0;
        
        for (const day of foreignFlowHistory) {
          const netValue = parseFloat(day.foreign_net_value) || 0;
          if (netValue > 0) {
            consecutiveBuys++;
            totalNet += netValue;
          } else {
            break; // Streak broken
          }
        }
        
        // Lowered thresholds: 2+ days for streak (more realistic with data gaps)
      if (consecutiveBuys >= 2) {
          foreignStreak = {
            detected: true,
            consecutiveDays: consecutiveBuys,
            totalNetValue: Math.round(totalNet),
            signal: consecutiveBuys >= 5 ? 'STRONG_BULLISH' : consecutiveBuys >= 3 ? 'BULLISH' : 'MODERATE_BULLISH',
            description: `Foreign buying streak: ${consecutiveBuys} consecutive days, total Rp ${(totalNet/1000000000).toFixed(1)}B net inflow`
          };
        } else if (consecutiveBuys === 0) {
          // Check for sell streak
          let consecutiveSells = 0;
          let totalSellNet = 0;
          for (const day of foreignFlowHistory) {
            const netValue = parseFloat(day.foreign_net_value) || 0;
            if (netValue < 0) {
              consecutiveSells++;
              totalSellNet += netValue;
            } else {
              break;
            }
          }
          
          if (consecutiveSells >= 2) {
            foreignStreak = {
              detected: true,
              consecutiveDays: -consecutiveSells,
              totalNetValue: Math.round(totalSellNet),
              signal: consecutiveSells >= 5 ? 'STRONG_BEARISH' : 'BEARISH',
              description: `Foreign selling streak: ${consecutiveSells} consecutive days, total Rp ${Math.abs(totalSellNet/1000000000).toFixed(1)}B net outflow`
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error calculating foreign streak for ${symbol}:`, error.message);
    }

    // Indicator #5: Broker Flow Concentration (1-3 brokers dominating)
    try {
      const brokerHistory = await getBrokerConcentrationHistory(symbol, 10);
      
      if (brokerHistory.length > 0) {
        // Group by date and find top 3 brokers per day
        const dailyTops = {};
        for (const record of brokerHistory) {
          const date = record.date;
          if (!dailyTops[date]) dailyTops[date] = [];
          dailyTops[date].push({
            code: record.code,
            netValue: parseFloat(record.net_value) || 0
          });
        }
        
        // Sort each day by net value and get top 3
        const dates = Object.keys(dailyTops).sort().slice(-7); // Last 7 days
        const brokerAppearanceCount = {};
        
        for (const date of dates) {
          const sorted = dailyTops[date].sort((a, b) => b.netValue - a.netValue);
          const top3 = sorted.slice(0, 3).filter(b => b.netValue > 0);
          
          for (const broker of top3) {
            if (!brokerAppearanceCount[broker.code]) {
              brokerAppearanceCount[broker.code] = { count: 0, totalNet: 0 };
            }
            brokerAppearanceCount[broker.code].count++;
            brokerAppearanceCount[broker.code].totalNet += broker.netValue;
          }
        }
        
        // Find brokers appearing 2+ days (lowered from 5)
        const dominantBrokers = Object.entries(brokerAppearanceCount)
          .filter(([code, data]) => data.count >= 2)
          .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);
      
      if (dominantBrokers.length > 0) {
        const topBroker = dominantBrokers[0];
        brokerConcentration = {
          detected: true,
          dominantBrokers: dominantBrokers.map(([code, data]) => ({
            code,
            daysActive: data.count,
            totalNetValue: Math.round(data.totalNet)
          })),
          concentrationDays: topBroker[1].count,
          signal: dominantBrokers.length === 1 && topBroker[1].count >= 4 ? 'HIGH_CONCENTRATION' : 
                  dominantBrokers.length >= 2 ? 'COORDINATED_BUYING' : 'MODERATE_CONCENTRATION',
          description: `${dominantBrokers.length} broker(s) dominating buy side for ${topBroker[1].count}+ days - ${dominantBrokers.map(b => b[0]).join('+')} controlling flow`
        };
      }
    }
    } catch (error) {
      console.error(`Error calculating broker concentration for ${symbol}:`, error.message);
    }

    const result = {
      symbol,
      date: txDate,
      foreignFlow: {
        buy: foreignBuyVolume,
        sell: foreignSellVolume,
        net: foreignNet,
        buyValue: foreignBuyValue,
        sellValue: foreignSellValue,
        netValue: foreignNetValue,
        buyBrokers: brokerSummary.filter(b => b.isForeign && b.buyValue > 0).map(b => b.code),
        sellBrokers: brokerSummary.filter(b => b.isForeign && b.sellValue > 0).map(b => b.code)
      },
      brokerSummary: brokerSummary.slice(0, 15), // Top 15 by activity
      bandarBrokers: bandarBrokerActivity.sort((a, b) => 
        Math.abs(b.netValue) - Math.abs(a.netValue)
      ).slice(0, 5),
      largeLotTransactions: {
        count: largeLotTransactions.length,
        volume: largeLotVolume,
        value: largeLotValue,
        brokers: largeLotTransactions.map(b => b.code)
      },
      sidData: {
        count: sidCount,
        change: sidChange,
        changePct: (sidChange / (sidCount - sidChange)) * 100
      },
      queueManipulation: Math.round(queueManipulation),
      runningTrades,
      transaksiNego: {
        volume: transaksiNegoVolume,
        value: transaksiNegoValue,
        count: transaksiNegoList.length,
        brokers: transaksiNegoList.map(b => b.code)
      },
      volumeAnalysis: {
        totalVolume: totalBuyVolume + totalSellVolume,
        averageVolume: Math.round(avgVolume),
        volumeVsAvg: avgVolume > 0 ? (((totalBuyVolume + totalSellVolume) / avgVolume) - 1) * 100 : 0,
        volumeSpike: volumeSpike || { detected: false, ratio: 1.0, severity: 'NONE', signal: 'NORMAL' },
        volumeDryUp: volumeDryUp || { detected: false, signal: 'NORMAL', severity: 'NONE' },
        bidAskImbalance: bidAskImbalance
      },
      foreignStreak: foreignStreak,
      brokerConcentration: brokerConcentration,
      priceAction: generatePriceActionIndicators(symbol, priceData, volumeAnalysis, brokerSummary, txDate),
      quantitative: generateQuantitativeIndicators(symbol, priceData, brokerSummary, volumeAnalysis, histVolumeData),
      totals: {
        buyVolume: totalBuyVolume,
        buyValue: totalBuyValue,
        sellVolume: totalSellVolume,
        sellValue: totalSellValue,
        netVolume: totalBuyVolume - totalSellVolume,
        netValue: totalBuyValue - totalSellValue
      }
    };
    
    // DEBUG: Log what we're returning
    console.log(`[DEBUG] Returning indicators for ${symbol}:`, {
      hasVolumeDryUp: 'volumeDryUp' in result.volumeAnalysis,
      hasBidAskImbalance: 'bidAskImbalance' in result.volumeAnalysis,
      hasForeignStreak: 'foreignStreak' in result,
      hasBrokerConcentration: 'brokerConcentration' in result,
      hasQuantitative: 'quantitative' in result,
      hasPriceAction: 'priceAction' in result
    });
    
    return result;
  } catch (error) {
    console.error(`[DEBUG ERROR] generateBandarIndicators failed for ${symbol}:`, error.message);
    console.error(error.stack);
    return generateBasicIndicators(symbol, priceData);
  }
}

// Quantitative Indicators (#11-14)
function generateQuantitativeIndicators(symbol, priceData, brokerSummary, volumeAnalysis, histVolumeData) {
  const currentPrice = priceData.close || 0;
  const highPrice = priceData.high || currentPrice;
  const lowPrice = priceData.low || currentPrice;
  const volume = priceData.volume || 0;
  
  // #11: Simplified Money Flow Index (MFI) using typical price * volume
  const typicalPrice = (currentPrice + highPrice + lowPrice) / 3;
  const rawMoneyFlow = typicalPrice * volume;
  
  // Estimate MFI based on money flow trend (simplified)
  let mfi = 50; // Neutral
  const volumeTrend = volumeAnalysis.volumeVsAvg || 0;
  const priceTrend = priceData.change_pct || 0;
  
  if (volumeTrend > 20 && priceTrend > 0) {
    mfi = Math.min(80, 50 + (volumeTrend * 0.5) + priceTrend);
  } else if (volumeTrend > 20 && priceTrend < 0) {
    mfi = Math.max(20, 50 - (volumeTrend * 0.5) + priceTrend);
  }
  
  const mfiSignal = mfi > 70 ? 'OVERBOUGHT' : mfi < 30 ? 'OVERSOLD' : mfi > 50 ? 'BULLISH' : 'BEARISH';
  
  // #12: On-Balance Volume (OBV) - simplified calculation
  let obv = volume;
  if (priceTrend > 0) obv = volume;
  else if (priceTrend < 0) obv = -volume;
  
  // OBV divergence detection
  const obvDivergence = {
    detected: false,
    signal: 'NEUTRAL',
    description: 'No OBV divergence detected'
  };
  
  if (priceTrend < 0 && volumeTrend > 10) {
    obvDivergence.detected = true;
    obvDivergence.signal = 'BULLISH_DIVERGENCE';
    obvDivergence.description = 'Price down but volume increasing - Accumulation underway';
  } else if (priceTrend > 0 && volumeTrend < -10) {
    obvDivergence.detected = true;
    obvDivergence.signal = 'BEARISH_DIVERGENCE';
    obvDivergence.description = 'Price up but volume declining - Distribution possible';
  }
  
  // #13: VWAP (Volume Weighted Average Price) - simplified
  const totalVolume = volumeAnalysis.totalVolume || volume;
  const totalValue = brokerSummary.reduce((sum, b) => sum + b.buyValue + b.sellValue, 0);
  const vwap = totalVolume > 0 ? totalValue / totalVolume / 100 : currentPrice; // Adjust for lot size
  
  const vwapReclaim = {
    detected: false,
    signal: 'NEUTRAL',
    description: 'Price around VWAP'
  };
  
  const priceVsVwap = ((currentPrice - vwap) / vwap) * 100;
  if (priceVsVwap > 2) {
    vwapReclaim.detected = true;
    vwapReclaim.signal = 'ABOVE_VWAP';
    vwapReclaim.description = `Price ${priceVsVwap.toFixed(1)}% above VWAP - Bullish control`;
  } else if (priceVsVwap < -2) {
    vwapReclaim.detected = true;
    vwapReclaim.signal = 'BELOW_VWAP';
    vwapReclaim.description = `Price ${Math.abs(priceVsVwap).toFixed(1)}% below VWAP - Bearish pressure`;
  }
  
  // #14: Chaikin Money Flow (CMF) - simplified using ADL concept
  // CMF = Sum((Close - Low) - (High - Close)) / (High - Low) * Volume) / Sum(Volume)
  const moneyFlowMultiplier = ((currentPrice - lowPrice) - (highPrice - currentPrice)) / (highPrice - lowPrice || 1);
  const cmf = moneyFlowMultiplier; // Simplified single-period CMF
  
  const cmfSignal = cmf > 0.1 ? 'BULLISH' : cmf < -0.1 ? 'BEARISH' : 'NEUTRAL';
  
  return {
    mfi: {
      value: Math.round(mfi),
      signal: mfiSignal,
      description: `MFI: ${Math.round(mfi)} - ${mfiSignal}`
    },
    obv: {
      value: Math.round(obv / 1000000), // In millions
      divergence: obvDivergence,
      description: obvDivergence.detected ? obvDivergence.description : `OBV: ${Math.round(obv/1000000)}M - Following price trend`
    },
    vwap: {
      value: Math.round(vwap),
      priceVsVwap: parseFloat(priceVsVwap.toFixed(2)),
      reclaim: vwapReclaim,
      description: vwapReclaim.description
    },
    cmf: {
      value: parseFloat(cmf.toFixed(3)),
      signal: cmfSignal,
      description: `CMF: ${cmf.toFixed(3)} - ${cmfSignal} money flow`
    }
  };
}

// Price Action Indicators (#6-10)
function generatePriceActionIndicators(symbol, priceData, volumeAnalysis, brokerSummary, date) {
  const currentPrice = priceData.close || 0;
  const openPrice = priceData.open || currentPrice;
  const highPrice = priceData.high || currentPrice;
  const lowPrice = priceData.low || currentPrice;
  const priceChange = priceData.change_pct || 0;
  const volume = priceData.volume || 0;
  const avgVolume = volumeAnalysis.averageVolume || volume;
  
  // Indicator #6: Price Compression / Tight Ranging
  const dailyRange = highPrice - lowPrice;
  const rangePct = (dailyRange / currentPrice) * 100;
  const priceCompression = {
    detected: false,
    signal: 'NORMAL',
    rangePct: parseFloat(rangePct.toFixed(2)),
    description: 'Normal price movement'
  };
  
  if (rangePct <= 2.0 && Math.abs(priceChange) <= 1.0) {
    priceCompression.detected = true;
    priceCompression.signal = 'COMPRESSION';
    priceCompression.description = `Tight range: ${rangePct.toFixed(1)}% (±1-2%) - Bandar suppressing price during accumulation`;
  }
  
  // Indicator #7: Fake Breakdown / Bear Trap
  const fakeBreakdown = {
    detected: false,
    signal: 'NORMAL',
    description: 'No breakdown pattern'
  };
  
  // Detect if price briefly breached support (fake below open) then recovered
  const breachedSupport = lowPrice < (openPrice * 0.97); // 3% below open
  const recoveredStrong = currentPrice > (lowPrice * 1.02) && priceChange > -1;
  const volumeConfirmation = volume > (avgVolume * 1.3);
  
  if (breachedSupport && recoveredStrong && volumeConfirmation) {
    fakeBreakdown.detected = true;
    fakeBreakdown.signal = 'BEAR_TRAP';
    fakeBreakdown.description = `Bear trap: Price broke support to ${lowPrice.toLocaleString()} then snapped back to ${currentPrice.toLocaleString()} on ${(volume/avgVolume).toFixed(1)}x volume - Weak hands shaken out`;
  }
  
  // Indicator #8: Lower High Correction on Low Volume
  const lowerHighPattern = {
    detected: false,
    signal: 'NORMAL',
    description: 'No correction pattern detected'
  };
  
  // Check if this looks like a pullback (lower high from previous close implied)
  const isPullback = priceChange < 0 && priceChange > -3;
  const lowVolume = volume < (avgVolume * 0.7);
  
  if (isPullback && lowVolume) {
    lowerHighPattern.detected = true;
    lowerHighPattern.signal = 'HEALTHY_PULLBACK';
    lowerHighPattern.description = `Healthy pullback: -${Math.abs(priceChange).toFixed(1)}% on ${(volume/avgVolume).toFixed(1)}x volume (below avg) - Bandar not selling, just lack of buying`;
  }
  
  // Indicator #9: Price Floor Defense
  const floorDefense = {
    detected: false,
    signal: 'NORMAL',
    defenseLevel: 0,
    description: 'No floor defense detected'
  };
  
  // Check if price bounced strongly from day's low
  const bounceFromLow = ((currentPrice - lowPrice) / lowPrice) * 100;
  const heldLevel = bounceFromLow > 1.5 && lowPrice > (openPrice * 0.98);
  
  if (heldLevel && volumeConfirmation) {
    floorDefense.detected = true;
    floorDefense.signal = 'FLOOR_DEFENSE';
    floorDefense.defenseLevel = lowPrice;
    floorDefense.description = `Floor defended at Rp ${lowPrice.toLocaleString()}: Absorbed selling and bounced ${bounceFromLow.toFixed(1)}% on volume`;
  }
  
  // Indicator #10: Gap Up on Volume After Accumulation
  const gapUpBreakout = {
    detected: false,
    signal: 'NORMAL',
    gapPct: 0,
    description: 'No gap up detected'
  };
  
  // Detect gap up (open > previous close by >1%)
  const gapPct = ((openPrice - (currentPrice / (1 + priceChange/100))) / (currentPrice / (1 + priceChange/100))) * 100;
  const strongGap = gapPct > 1.0;
  const sustained = currentPrice > openPrice && priceChange > 2;
  
  if (strongGap && sustained && volumeConfirmation) {
    gapUpBreakout.detected = true;
    gapUpBreakout.signal = 'GAP_UP_BREAKOUT';
    gapUpBreakout.gapPct = parseFloat(gapPct.toFixed(2));
    gapUpBreakout.description = `Gap up breakout: +${gapPct.toFixed(1)}% open gap sustained with ${(volume/avgVolume).toFixed(1)}x volume - Accumulation phase complete`;
  }
  
  return {
    priceChange,
    dailyRange,
    rangePct,
    priceCompression,
    fakeBreakdown,
    lowerHighPattern,
    floorDefense,
    gapUpBreakout
  };
}

// Fallback basic indicators if database fails
function generateBasicIndicators(symbol, priceData) {
  const volume = priceData.volume || 0;
  
  return {
    symbol,
    date: new Date().toISOString().split('T')[0],
    foreignFlow: {
      buy: 0,
      sell: 0,
      net: 0,
      buyValue: 0,
      sellValue: 0,
      netValue: 0,
      buyBrokers: [],
      sellBrokers: []
    },
    brokerSummary: [],
    bandarBrokers: [],
    largeLotTransactions: {
      count: 0,
      volume: 0,
      value: 0,
      brokers: []
    },
    sidData: {
      count: 0,
      change: 0,
      changePct: 0
    },
    queueManipulation: 50,
    runningTrades: 0,
    transaksiNego: {
      volume: 0,
      value: 0,
      count: 0,
      brokers: []
    },
    volumeAnalysis: {
      totalVolume: volume,
      averageVolume: volume,
      volumeVsAvg: 0,
      volumeSpike: { detected: false, ratio: 1.0, severity: 'NONE', signal: 'NORMAL' }
    },
    priceAction: generatePriceActionIndicators(symbol, priceData, { averageVolume: volume }, [], new Date().toISOString().split('T')[0]),
    totals: {
      buyVolume: 0,
      buyValue: 0,
      sellVolume: 0,
      sellValue: 0,
      netVolume: 0,
      netValue: 0
    }
  };
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get LQ45 stocks with prices and bandar scores
app.get('/api/screener', async (req, res) => {
  try {
    const [companies, pricesData] = await Promise.all([
      getCompanies(),
      getPrices(LQ45_STOCKS)
    ]);
    
    const prices = pricesData.data.results;
    const companyMap = new Map(companies.map(c => [c.symbol, c]));
    
    // Process each stock with real bandar indicators
    const screenerDataPromises = prices.map(async (price) => {
      const company = companyMap.get(price.symbol);
      const indicators = await generateBandarIndicators(price.symbol, price);
      const scoreData = calculateBandarScore(price, indicators);
      
      return {
        symbol: price.symbol,
        name: company?.name || price.symbol,
        logo: company?.logo,
        price: price.close,
        change: price.change,
        changePct: price.change_pct,
        volume: price.volume,
        score: scoreData.score,
        signal: scoreData.signal,
        indicators: {
          foreignNet: indicators.foreignFlow.net,
          foreignNetValue: indicators.foreignFlow.netValue,
          largeLotCount: indicators.largeLotTransactions.count,
          sidChange: indicators.sidData.change,
          queueScore: indicators.queueManipulation,
          brokerActivity: indicators.brokerSummary.length,
          topBrokers: indicators.bandarBrokers.slice(0, 3).map(b => b.code),
          volumeVsAvg: indicators.volumeAnalysis.volumeVsAvg
        },
        reasoning: scoreData.reasoning
      };
    });
    
    const screenerData = await Promise.all(screenerDataPromises);
    
    // Sort by score descending
    screenerData.sort((a, b) => b.score - a.score);
    
    res.json({
      status: 'success',
      data: screenerData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Screener Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get detailed stock data
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const [pricesData, companies, brokers] = await Promise.all([
      getPrices([symbol]),
      getCompanies(),
      getBrokers()
    ]);
    
    const price = pricesData.data.results[0];
    if (!price) {
      return res.status(404).json({ status: 'error', message: 'Stock not found' });
    }
    
    const company = companies.find(c => c.symbol === symbol);
    const brokerMap = new Map(brokers.map(b => [b.code, b.name]));
    
    const indicators = await generateBandarIndicators(symbol, price);
    const scoreData = calculateBandarScore(price, indicators);
    
    // Enrich broker summary with names and calculate real metrics
    const enrichedBrokerSummary = indicators.brokerSummary.map(b => ({
      ...b,
      name: brokerMap.get(b.code) || b.name || b.code,
      avgBuyPrice: b.buyVolume > 0 ? Math.floor(b.buyValue / (b.buyVolume * 100)) : 0,
      avgSellPrice: b.sellVolume > 0 ? Math.floor(b.sellValue / (b.sellVolume * 100)) : 0,
    }));

    // Calculate concentration metrics
    const totalBuyValue = indicators.totals.buyValue || 1;
    const topBuyers = enrichedBrokerSummary
      .filter(b => b.netValue > 0)
      .sort((a, b) => b.netValue - a.netValue)
      .slice(0, 5);
    
    const topBuyersConcentration = topBuyers.reduce((sum, b) => 
      sum + (b.buyValue / totalBuyValue) * 100, 0
    );

    // Generate real reasoning with actual data
    const realReasoning = generateRealReasoning(symbol, price, indicators, enrichedBrokerSummary);
    const comprehensiveAnalysis = generateComprehensiveAnalysis(symbol, price, indicators, enrichedBrokerSummary);
    
    // Get multi-timeframe data
    const timeframes = await getMultiTimeframeData(symbol);
    const bigDogData = await getBigDogAnalysis(symbol);
    
    res.json({
      status: 'success',
      data: {
        symbol,
        name: company?.name || symbol,
        logo: company?.logo,
        price: {
          current: price.close,
          open: price.open,
          high: price.high,
          low: price.low,
          change: price.change,
          changePct: price.change_pct,
          volume: price.volume
        },
        indicators: {
          ...indicators,
          brokerSummary: enrichedBrokerSummary,
          concentration: {
            topBuyers: topBuyers.map(b => b.code),
            topBuyersConcentration: Math.round(topBuyersConcentration * 10) / 10,
            foreignConcentration: calculateForeignConcentration(indicators)
          },
          timeframes: timeframes,
          bigDogActivity: bigDogData
        },
        score: scoreData.score,
        signal: scoreData.signal,
        reasoning: realReasoning,
        comprehensiveAnalysis: comprehensiveAnalysis
      }
    });
  } catch (error) {
    console.error('Stock Detail Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Generate real reasoning based on actual database data
function generateRealReasoning(symbol, price, indicators, brokerSummary) {
  const reasons = [];
  const details = [];
  
  const { foreignFlow, bandarBrokers, largeLotTransactions, volumeAnalysis, totals } = indicators;
  const currentPrice = price.close;
  
  // Foreign flow analysis
  if (foreignFlow.netValue > 100000000000) { // > 100B IDR
    const foreignBuyers = foreignFlow.buyBrokers.slice(0, 3).join('+');
    const netBuyBillions = Math.round(foreignFlow.netValue / 1000000000);
    reasons.push(`Foreign net buy Rp ${netBuyBillions}B via ${foreignBuyers || 'multiple brokers'}`);
    details.push(`Strong foreign inflow: ${foreignFlow.buyBrokers.join(', ')} actively buying`);
  } else if (foreignFlow.netValue < -100000000000) {
    const foreignSellers = foreignFlow.sellBrokers.slice(0, 3).join('+');
    const netSellBillions = Math.round(Math.abs(foreignFlow.netValue) / 1000000000);
    reasons.push(`Foreign net sell Rp ${netSellBillions}B via ${foreignSellers || 'multiple brokers'}`);
    details.push(`Foreign outflow detected from ${foreignFlow.sellBrokers.join(', ')}`);
  }
  
  // Bandar broker concentration
  if (bandarBrokers.length > 0) {
    const activeBandars = bandarBrokers.filter(b => b.netValue > 0);
    if (activeBandars.length > 0) {
      const bandarCodes = activeBandars.slice(0, 3).map(b => b.code).join('+');
      const totalBandarBuy = activeBandars.reduce((sum, b) => sum + b.netValue, 0);
      const bandarBillions = Math.round(totalBandarBuy / 1000000000);
      
      // Calculate concentration percentage
      const concentrationPct = Math.round((totalBandarBuy / (totals.buyValue || 1)) * 100);
      
      reasons.push(`${bandarCodes} control ${concentrationPct}% of buying`);
      details.push(`Key bandar brokers accumulating: ${bandarCodes} with Rp ${bandarBillions}B net buy`);
    }
  }
  
  // Large lot transactions
  if (largeLotTransactions.count > 5) {
    const largeLotBillions = Math.round(largeLotTransactions.value / 1000000000);
    reasons.push(`${largeLotTransactions.count} large block trades (Rp ${largeLotBillions}B)`);
    details.push(`Block trading activity: ${largeLotTransactions.brokers.slice(0, 5).join(', ')} handling large lots`);
  }
  
  // Volume analysis
  if (volumeAnalysis.volumeVsAvg > 50) {
    reasons.push(`Volume ${Math.round(volumeAnalysis.volumeVsAvg)}% above average`);
    details.push(`Unusual volume spike indicating institutional activity`);
  } else if (volumeAnalysis.volumeVsAvg < -30) {
    details.push(`Low volume - accumulation phase or lack of interest`);
  }
  
  // Broker cost basis analysis
  const avgBrokerCost = calculateAverageBrokerCost(brokerSummary);
  if (avgBrokerCost > 0) {
    const costDiff = ((currentPrice - avgBrokerCost) / avgBrokerCost) * 100;
    if (costDiff > 0 && costDiff < 10) {
      details.push(`Price Rp ${currentPrice.toLocaleString()} is ${costDiff.toFixed(1)}% above average broker cost Rp ${Math.round(avgBrokerCost).toLocaleString()}`);
    } else if (costDiff < 0) {
      details.push(`Price Rp ${currentPrice.toLocaleString()} is ${Math.abs(costDiff).toFixed(1)}% below average broker cost Rp ${Math.round(avgBrokerCost).toLocaleString()} - potential value`);
    }
  }
  
  // Retail vs Institutional breakdown
  const institutionalVolume = brokerSummary
    .filter(b => FOREIGN_BROKERS.includes(b.code) || BANDAR_BROKERS.includes(b.code))
    .reduce((sum, b) => sum + b.buyVolume + b.sellVolume, 0);
  const totalVolume = volumeAnalysis.totalVolume || 1;
  const institutionalPct = Math.round((institutionalVolume / totalVolume) * 100);
  
  if (institutionalPct > 60) {
    details.push(`Institutional dominance: ${institutionalPct}% of volume from foreign/major brokers`);
  } else if (institutionalPct < 30) {
    details.push(`Retail-driven: only ${institutionalPct}% institutional participation`);
  }
  
  return {
    summary: reasons.length > 0 ? reasons.join('. ') + '.' : 'Neutral broker activity',
    details: details,
    keyLevels: {
      support: Math.round(price.low * 0.98),
      resistance: Math.round(price.high * 1.02)
    }
  };
}

// Calculate average broker cost from transactions
function calculateAverageBrokerCost(brokerSummary) {
  let totalCost = 0;
  let totalVolume = 0;
  
  for (const broker of brokerSummary) {
    if (broker.buyVolume > 0) {
      totalCost += broker.buyValue;
      totalVolume += broker.buyVolume;
    }
  }
  
  return totalVolume > 0 ? Math.floor(totalCost / (totalVolume * 100)) : 0;
}

// Calculate foreign concentration percentage
function calculateForeignConcentration(indicators) {
  const { foreignFlow, totals } = indicators;
  if (totals.buyValue === 0) return 0;
  return Math.round((foreignFlow.buyValue / totals.buyValue) * 100 * 10) / 10;
}

// Get LQ45 constituents
app.get('/api/lq45', async (req, res) => {
  try {
    const companies = await getCompanies();
    const lq45Companies = companies.filter(c => LQ45_STOCKS.includes(c.symbol));
    
    res.json({
      status: 'success',
      data: lq45Companies,
      count: lq45Companies.length
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Run backtest
app.post('/api/backtest', async (req, res) => {
  try {
    const { fund, weeks, strategy } = req.body;
    
    if (!fund || fund <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid fund amount' });
    }
    
    const backtestConfig = {
      initialFund: parseFloat(fund),
      weeks: parseInt(weeks) || 4,
      strategy: strategy || 'bandar_strength'
    };
    
    const [companies, pricesData] = await Promise.all([
      getCompanies(),
      getPrices(LQ45_STOCKS)
    ]);
    
    const prices = pricesData.data.results;
    const backtestResults = await runBacktest(backtestConfig, prices, companies);
    
    res.json({
      status: 'success',
      data: backtestResults
    });
  } catch (error) {
    console.error('Backtest Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get market indices
app.get('/api/indices', async (req, res) => {
  try {
    const data = await fetchFromAPI('/indices');
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get brokers
app.get('/api/brokers', async (req, res) => {
  try {
    const brokers = await getBrokers();
    res.json({ status: 'success', data: brokers });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Database health check
app.get('/api/db-health', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) as count FROM broker_transactions');
    client.release();
    
    res.json({
      status: 'success',
      database: 'connected',
      transactionCount: parseInt(result.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      message: error.message 
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing pool...');
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Bandarmology Server running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'the_frontier'}`);
});
// Add this function to server.js after getHistoricalVolumeData

// Get multi-timeframe broker data (1D, 1W, 1M, 1Y)
async function getMultiTimeframeData(symbol) {
  const client = await pool.connect();
  try {
    const stockResult = await client.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
    if (stockResult.rows.length === 0) return null;
    const stockId = stockResult.rows[0].id;
    
    const result = {};
    
    // 1D - Current day
    const d1Result = await client.query(`
      SELECT b.code, b.name, bt.buy_volume, bt.buy_value, bt.sell_volume, bt.sell_value,
             CASE WHEN bt.buy_volume > 0 THEN bt.buy_value / (bt.buy_volume * 100) ELSE 0 END as avg_buy_price,
             CASE WHEN bt.sell_volume > 0 THEN bt.sell_value / (bt.sell_volume * 100) ELSE 0 END as avg_sell_price
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      WHERE bt.stock_id = $1 AND DATE(bt.time) = (SELECT MAX(DATE(time)) FROM broker_transactions WHERE stock_id = $1)
      ORDER BY ABS(bt.buy_value - bt.sell_value) DESC
      LIMIT 15
    `, [stockId]);
    
    // 1W - Last 7 days
    const w1Result = await client.query(`
      SELECT b.code, b.name, 
             SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value,
             SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value,
             CASE WHEN SUM(bt.buy_volume) > 0 THEN SUM(bt.buy_value) / (SUM(bt.buy_volume) * 100) ELSE 0 END as avg_buy_price,
             CASE WHEN SUM(bt.sell_volume) > 0 THEN SUM(bt.sell_value) / (SUM(bt.sell_volume) * 100) ELSE 0 END as avg_sell_price
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      WHERE bt.stock_id = $1 AND bt.time >= NOW() - INTERVAL '7 days'
      GROUP BY b.code, b.name
      ORDER BY ABS(SUM(bt.buy_value) - SUM(bt.sell_value)) DESC
      LIMIT 15
    `, [stockId]);
    
    // 1M - Last 30 days
    const m1Result = await client.query(`
      SELECT b.code, b.name,
             SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value,
             SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value,
             CASE WHEN SUM(bt.buy_volume) > 0 THEN SUM(bt.buy_value) / (SUM(bt.buy_volume) * 100) ELSE 0 END as avg_buy_price,
             CASE WHEN SUM(bt.sell_volume) > 0 THEN SUM(bt.sell_value) / (SUM(bt.sell_volume) * 100) ELSE 0 END as avg_sell_price
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      WHERE bt.stock_id = $1 AND bt.time >= NOW() - INTERVAL '30 days'
      GROUP BY b.code, b.name
      ORDER BY ABS(SUM(bt.buy_value) - SUM(bt.sell_value)) DESC
      LIMIT 15
    `, [stockId]);
    
    // 1Y - Last 365 days
    const y1Result = await client.query(`
      SELECT b.code, b.name,
             SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value,
             SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value,
             CASE WHEN SUM(bt.buy_volume) > 0 THEN SUM(bt.buy_value) / (SUM(bt.buy_volume) * 100) ELSE 0 END as avg_buy_price,
             CASE WHEN SUM(bt.sell_volume) > 0 THEN SUM(bt.sell_value) / (SUM(bt.sell_volume) * 100) ELSE 0 END as avg_sell_price
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      WHERE bt.stock_id = $1 AND bt.time >= NOW() - INTERVAL '365 days'
      GROUP BY b.code, b.name
      ORDER BY ABS(SUM(bt.buy_value) - SUM(bt.sell_value)) DESC
      LIMIT 15
    `, [stockId]);
    
    const formatBrokers = (rows) => rows.map(r => ({
      code: r.code,
      name: r.name,
      buyVolume: parseInt(r.buy_volume) || 0,
      buyValue: parseInt(r.buy_value) || 0,
      sellVolume: parseInt(r.sell_volume) || 0,
      sellValue: parseInt(r.sell_value) || 0,
      avgBuyPrice: Math.floor(r.avg_buy_price) || 0,
      avgSellPrice: Math.floor(r.avg_sell_price) || 0,
      netVolume: (parseInt(r.buy_volume) || 0) - (parseInt(r.sell_volume) || 0),
      netValue: (parseInt(r.buy_value) || 0) - (parseInt(r.sell_value) || 0)
    }));
    
    return {
      '1D': { brokers: formatBrokers(d1Result.rows), label: 'Current Day' },
      '1W': { brokers: formatBrokers(w1Result.rows), label: 'Last 7 Days' },
      '1M': { brokers: formatBrokers(m1Result.rows), label: 'Last 30 Days' },
      '1Y': { brokers: formatBrokers(y1Result.rows), label: 'Last 365 Days' }
    };
  } finally {
    client.release();
  }
}

// Get Big Dog broker analysis
async function getBigDogAnalysis(symbol) {
  const client = await pool.connect();
  try {
    const stockResult = await client.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
    if (stockResult.rows.length === 0) return null;
    const stockId = stockResult.rows[0].id;
    
    const BIG_DOGS = ['YU', 'CC', 'NI', 'GW', 'SQ', 'OD', 'BK', 'AK'];
    
    const result = await client.query(`
      SELECT b.code, b.name, 
             SUM(bt.buy_volume) as buy_volume, SUM(bt.buy_value) as buy_value,
             SUM(bt.sell_volume) as sell_volume, SUM(bt.sell_value) as sell_value,
             CASE WHEN SUM(bt.buy_volume) > 0 THEN SUM(bt.buy_value) / (SUM(bt.buy_volume) * 100) ELSE 0 END as avg_buy_price,
             CASE WHEN SUM(bt.sell_volume) > 0 THEN SUM(bt.sell_value) / (SUM(bt.sell_volume) * 100) ELSE 0 END as avg_sell_price
      FROM broker_transactions bt
      JOIN brokers b ON bt.broker_id = b.id
      WHERE bt.stock_id = $1 AND b.code = ANY($2)
      GROUP BY b.code, b.name
      ORDER BY ABS(SUM(bt.buy_value) - SUM(bt.sell_value)) DESC
    `, [stockId, BIG_DOGS]);
    
    return result.rows.map(r => ({
      code: r.code,
      name: r.name,
      buyVolume: parseInt(r.buy_volume) || 0,
      sellVolume: parseInt(r.sell_volume) || 0,
      avgBuyPrice: Math.floor(r.avg_buy_price) || 0,
      avgSellPrice: Math.floor(r.avg_sell_price) || 0,
      netValue: (parseInt(r.buy_value) || 0) - (parseInt(r.sell_value) || 0),
      action: (parseInt(r.buy_value) || 0) > (parseInt(r.sell_value) || 0) ? 'ACCUMULATING' : 'DISTRIBUTING'
    }));
  } finally {
    client.release();
  }
}
