const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Fix: Use rounded brokerSummary from scoreData and include detailedAnalysis
const oldReturn = `indicators: {
          foreignNet: indicators.foreignFlow.net,
          foreignNetValue: indicators.foreignFlow.netValue,
          largeLotCount: indicators.largeLotTransactions.count,
          sidChange: indicators.sidData.change,
          queueScore: indicators.queueManipulation,
          brokerActivity: indicators.brokerSummary.length,
          topBrokers: indicators.bandarBrokers.slice(0, 3).map(b => b.code),
          volumeVsAvg: indicators.volumeAnalysis.volumeVsAvg
        },
        reasoning: { summary: scoreData.factors.slice(0,3).join("; "), details: scoreData.factors, alerts: scoreData.alerts }`;

const newReturn = `indicators: {
          foreignNet: indicators.foreignFlow.net,
          foreignNetValue: indicators.foreignFlow.netValue,
          largeLotCount: indicators.largeLotTransactions.count,
          sidChange: indicators.sidData.change,
          queueScore: indicators.queueManipulation,
          brokerActivity: indicators.brokerSummary.length,
          topBrokers: indicators.bandarBrokers.slice(0, 3).map(b => b.code),
          volumeVsAvg: indicators.volumeAnalysis.volumeVsAvg,
          brokerSummary: scoreData.brokerSummary || indicators.brokerSummary
        },
        reasoning: scoreData.reasoning || { summary: scoreData.factors.slice(0,3).join("; "), details: scoreData.factors, alerts: scoreData.alerts }`;

content = content.replace(oldReturn, newReturn);

fs.writeFileSync('server.js', content);
console.log('Fixed server.js to use rounded broker prices and detailed reasoning');
