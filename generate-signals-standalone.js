// Load environment variables
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getDailyIndicesCollection,
  getUploadedDataCollection
} = require('./api/lib/mongodb');

/**
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Generate Momentum Gap signals
 */
async function generateSignals() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = getYesterdayDate(today);
    
    console.log('📊 Generating Intraday Signals');
    console.log('='.repeat(50));
    console.log(`Target Date: ${today}`);
    console.log(`Premarket Date: ${today}`);
    console.log(`Bhavcopy Date: ${yesterdayDate}`);
    console.log(`Indices Date: ${yesterdayDate}`);
    console.log('='.repeat(50));
    
    // Get collections
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const premarketCollection = await getPreMarketDataCollection();
    const indicesCollection = await getDailyIndicesCollection();
    const uploadedBhavCollection = await getUploadedDataCollection('bhav');
    const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
    
    // Get bhavcopy data
    let bhavcopyData = await bhavcopyCollection
      .find({ date: yesterdayDate, series: 'EQ' })
      .toArray();
    
    console.log(`\n📈 Bhavcopy Data: ${bhavcopyData.length} stocks from daily_bhavcopy`);
    
    if (bhavcopyData.length === 0) {
      const uploadedBhavDocs = await uploadedBhavCollection
        .find({ date: yesterdayDate })
        .toArray();
      
      for (const doc of uploadedBhavDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          const eqStocks = doc.indices.filter(item => !item.series || item.series === 'EQ');
          bhavcopyData = bhavcopyData.concat(eqStocks);
        }
      }
      console.log(`📈 Bhavcopy Data: ${bhavcopyData.length} stocks from uploadedBhav`);
    }
    
    // Get premarket data
    let premarketData = await premarketCollection
      .find({ date: today })
      .toArray();
    
    console.log(`📈 Premarket Data: ${premarketData.length} stocks from premarket_data`);
    
    if (premarketData.length === 0) {
      const uploadedPremarketDocs = await uploadedPremarketCollection
        .find({ date: today })
        .toArray();
      
      for (const doc of uploadedPremarketDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          premarketData = premarketData.concat(doc.indices);
        }
      }
      console.log(`📈 Premarket Data: ${premarketData.length} stocks from uploadedPreMarket`);
    }
    
    // Get indices for mood analysis
    let indicesData = await indicesCollection
      .find({ date: yesterdayDate })
      .toArray();
    
    console.log(`📈 Indices Data: ${indicesData.length} indices`);
    
    // Analyze market mood
    const nifty50 = indicesData.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('NIFTY 50'));
    const niftyBank = indicesData.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('NIFTY BANK'));
    const vix = indicesData.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('VIX'));
    
    const niftyChange = nifty50?.pChange || nifty50?.change_percent || 0;
    const bankChange = niftyBank?.pChange || niftyBank?.change_percent || 0;
    const vixValue = vix?.last_price || vix?.last || vix?.close || 0;
    
    // Calculate mood score (simplified)
    let moodScore = 50; // neutral
    if (niftyChange > 0.5 && bankChange > 0.5) moodScore = 65; // bullish
    else if (niftyChange < -0.5 && bankChange < -0.5) moodScore = 35; // bearish
    else if (niftyChange > 0) moodScore = 55; // slightly bullish
    else if (niftyChange < 0) moodScore = 45; // slightly bearish
    
    // Determine strategy
    const isBullish = moodScore >= 60;
    const isVolatile = vixValue > 18;
    const isLowVolatility = vixValue < 12;
    const positiveMomentum = niftyChange > 0.5 && bankChange > 0.5;
    
    let strategy = 'Momentum Gap';
    if (isBullish && positiveMomentum && !isVolatile) {
      strategy = 'Momentum Gap';
    } else if (isBullish && isVolatile) {
      strategy = 'Breakout';
    } else if (moodScore >= 40 && moodScore < 60 && isLowVolatility) {
      strategy = 'Mean Reversion';
    } else if (moodScore <= 40) {
      strategy = 'Defensive / Wait';
    } else if (isVolatile) {
      strategy = 'Volatility Play';
    }
    
    console.log('\n📊 Market Analysis:');
    console.log(`   Mood Score: ${moodScore}/100`);
    console.log(`   NIFTY 50: ${niftyChange > 0 ? '+' : ''}${niftyChange.toFixed(2)}%`);
    console.log(`   NIFTY BANK: ${bankChange > 0 ? '+' : ''}${bankChange.toFixed(2)}%`);
    console.log(`   VIX: ${vixValue.toFixed(2)}`);
    console.log(`   Recommended Strategy: ${strategy}`);
    console.log('\n' + '='.repeat(50));
    
    if (bhavcopyData.length === 0 || premarketData.length === 0) {
      console.log('\n❌ Insufficient data to generate signals');
      console.log(`   Bhavcopy: ${bhavcopyData.length} stocks`);
      console.log(`   Premarket: ${premarketData.length} stocks`);
      return;
    }
    
    // Create lookup maps
    const bhavcopyMap = new Map();
    bhavcopyData.forEach(item => {
      const symbol = (item.symbol || item.SYMBOL || '').toUpperCase();
      if (symbol) {
        bhavcopyMap.set(symbol, item);
      }
    });
    
    const premarketMap = new Map();
    premarketData.forEach(item => {
      const symbol = (item.symbol || item.SYMBOL || '').toUpperCase();
      if (symbol) {
        premarketMap.set(symbol, item);
      }
    });
    
    console.log(`\n🔍 Processing ${premarketData.length} premarket stocks...`);
    
    // Generate signals
    const signals = [];
    const processedSymbols = new Set();
    
    for (const premarket of premarketData) {
      const symbol = (premarket.symbol || premarket.SYMBOL || '').toUpperCase();
      if (!symbol || processedSymbols.has(symbol)) continue;
      
      const bhavcopy = bhavcopyMap.get(symbol);
      if (!bhavcopy) continue;
      
      if (bhavcopy.series && bhavcopy.series !== 'EQ') continue;
      
      // Get prices
      const yesterdayClose = bhavcopy.close || bhavcopy.CLOSE || bhavcopy.prev_close || 
                            bhavcopy.PREV_CLOSE || bhavcopy.last_price || bhavcopy.LAST_PRICE || 0;
      if (yesterdayClose <= 0) continue;
      
      const premarketPrice = premarket.pre_open_price || premarket.PRE_OPEN_PRICE || 
                            premarket.preOpenPrice || premarket.price || premarket.PRICE ||
                            premarket.last_price || premarket.LAST_PRICE || premarket.open || premarket.OPEN || 0;
      if (premarketPrice <= 0) continue;
      
      // Calculate gap %
      const gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100;
      
      // Filter: Gap-up > 0.3%
      if (gapPercent < 0.3) continue;
      
      // Check near high
      const yesterdayHigh = bhavcopy.high || bhavcopy.HIGH || yesterdayClose;
      let nearHigh = false;
      if (yesterdayHigh > 0) {
        const nearHighPercent = ((yesterdayHigh - premarketPrice) / yesterdayHigh) * 100;
        nearHigh = Math.abs(nearHighPercent) <= 2.0;
      }
      
      // Volume filter
      const volume = bhavcopy.volume || bhavcopy.VOLUME || bhavcopy.tottrdqty || bhavcopy.TOTTRDQTY || 0;
      if (volume < 100000) continue; // Min 1 lakh shares
      
      // Calculate score
      let gapScore = 0;
      if (gapPercent >= 0.5 && gapPercent <= 2.5) {
        const optimalGap = 1.5;
        const distance = Math.abs(gapPercent - optimalGap);
        gapScore = Math.max(0, 40 - (distance * 20));
      } else if (gapPercent > 2.5 && gapPercent <= 5.0) {
        gapScore = 30 - ((gapPercent - 2.5) * 4);
      }
      
      const nearHighScore = nearHigh ? 20 : 0;
      
      let volumeScore = 0;
      if (volume >= 1000000) volumeScore = 20;
      else if (volume >= 500000) volumeScore = 15;
      else if (volume >= 200000) volumeScore = 10;
      else volumeScore = 5;
      
      const deliveryPercent = bhavcopy.delivery_percent || bhavcopy.DELIVERY_PER || bhavcopy.delivery_per || 0;
      let deliveryScore = 0;
      if (deliveryPercent > 50) deliveryScore = 20;
      else if (deliveryPercent > 30) deliveryScore = 15;
      else if (deliveryPercent > 20) deliveryScore = 10;
      
      const totalScore = gapScore + nearHighScore + volumeScore + deliveryScore;
      
      if (totalScore < 50) continue;
      
      // Calculate entry, target, stop loss
      const entryPrice = premarketPrice;
      const atr = bhavcopy.atr20 || (yesterdayClose * 0.02);
      const stopLoss = entryPrice - (atr * 1.5);
      const targetPrice = entryPrice + (atr * 2.5);
      
      // Generate reason
      const reasons = [];
      if (gapPercent >= 0.5) reasons.push(`Gap-up ${gapPercent.toFixed(2)}%`);
      if (nearHigh) reasons.push('Near high');
      if (volume >= 500000) reasons.push('High volume');
      if (deliveryPercent > 30) reasons.push('Good delivery');
      
      signals.push({
        symbol: symbol,
        direction: 'BUY',
        entry: parseFloat(entryPrice.toFixed(2)),
        target: parseFloat(targetPrice.toFixed(2)),
        sl: parseFloat(Math.max(0, stopLoss).toFixed(2)),
        score: Math.round(totalScore),
        reason: reasons.join(', ') || 'Gap-up momentum',
        gapPercent: parseFloat(gapPercent.toFixed(2)),
        volume: volume,
        deliveryPercent: parseFloat(deliveryPercent.toFixed(2))
      });
      
      processedSymbols.add(symbol);
    }
    
    // Sort by score and take top 5
    signals.sort((a, b) => b.score - a.score);
    const topSignals = signals.slice(0, 5);
    
    console.log(`\n✅ Generated ${signals.length} signals, showing top 5:`);
    console.log('\n' + '='.repeat(80));
    console.log('TOP 5 INTRADAY SIGNALS');
    console.log('='.repeat(80));
    
    topSignals.forEach((signal, index) => {
      console.log(`\n${index + 1}. ${signal.symbol}`);
      console.log(`   Direction: ${signal.direction}`);
      console.log(`   Entry: ₹${signal.entry}`);
      console.log(`   Target: ₹${signal.target} (+${((signal.target - signal.entry) / signal.entry * 100).toFixed(2)}%)`);
      console.log(`   Stop Loss: ₹${signal.sl} (-${((signal.entry - signal.sl) / signal.entry * 100).toFixed(2)}%)`);
      console.log(`   Score: ${signal.score}/100`);
      console.log(`   Gap: ${signal.gapPercent}% | Volume: ${(signal.volume / 100000).toFixed(1)}L | Delivery: ${signal.deliveryPercent}%`);
      console.log(`   Reason: ${signal.reason}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error generating signals:', error);
  } finally {
    process.exit(0);
  }
}

// Run
generateSignals();

