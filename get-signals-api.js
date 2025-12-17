const fetch = require('node-fetch');

async function getSignals() {
  const today = new Date().toISOString().split('T')[0];
  
  // Try local first, then deployed
  const baseUrls = [
    'http://localhost:3000',
    'https://nse-market-mood-git-main-muhammed-rias-as-projects.vercel.app'
  ];
  
  console.log('📊 Generating Intraday Signals');
  console.log('='.repeat(50));
  console.log(`Target Date: ${today}`);
  console.log('='.repeat(50));
  
  for (const baseUrl of baseUrls) {
    try {
      console.log(`\n🔍 Trying: ${baseUrl}`);
      
      // First check data availability
      const checkUrl = `${baseUrl}/api/market?action=check-date&date=${today}`;
      console.log(`Checking data availability: ${checkUrl}`);
      
      const checkResponse = await fetch(checkUrl, { timeout: 10000 });
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        console.log('\n📊 Data Availability:');
        console.log(`   Bhavcopy (yesterday): ${checkData.data?.bhavcopy?.count || 0} stocks`);
        console.log(`   Premarket (today): ${checkData.data?.premarket?.count || 0} stocks`);
        console.log(`   Indices (yesterday): ${checkData.data?.indices?.count || 0} indices`);
        console.log(`   Can Generate: ${checkData.canGenerateSignals ? 'Yes' : 'No'}`);
      }
      
      // Try get-signals first (might already be generated)
      const getSignalsUrl = `${baseUrl}/api/signals?operation=get&date=${today}`;
      console.log(`\n🔍 Checking for existing signals: ${getSignalsUrl}`);
      
      let response = await fetch(getSignalsUrl, { timeout: 10000 });
      
      // If no signals found, try generating
      if (response.ok) {
        const existingData = await response.json();
        if (existingData.signals && existingData.signals.length > 0) {
          response = { ok: true, json: async () => existingData };
        } else {
          // Generate signals
          const generateUrl = `${baseUrl}/api/signals?operation=generate&date=${today}`;
          console.log(`\n🔄 Generating signals: ${generateUrl}`);
          response = await fetch(generateUrl, { timeout: 30000 });
        }
      } else {
        // Generate signals
        const generateUrl = `${baseUrl}/api/generate-signals?date=${today}`;
        console.log(`\n🔄 Generating signals: ${generateUrl}`);
        response = await fetch(generateUrl, { timeout: 30000 });
      }
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.signals && data.signals.length > 0) {
          console.log(`\n✅ Generated ${data.signals.length} signals, showing top 5:`);
          console.log('\n' + '='.repeat(80));
          console.log('TOP 5 INTRADAY SIGNALS');
          console.log('='.repeat(80));
          
          const top5 = data.signals.slice(0, 5);
          top5.forEach((signal, index) => {
            const entry = signal.entry || signal.entry_price || 0;
            const target = signal.target || signal.target_price || 0;
            const sl = signal.sl || signal.stop_loss || 0;
            const gap = signal.gap_percent || 0;
            const volume = signal.volume || 0;
            const delivery = signal.delivery_percent || 0;
            
            console.log(`\n${index + 1}. ${signal.symbol}`);
            console.log(`   Direction: ${signal.direction || signal.side || 'BUY'}`);
            console.log(`   Entry: ₹${entry.toFixed(2)}`);
            if (target > 0) {
              console.log(`   Target: ₹${target.toFixed(2)} (+${((target - entry) / entry * 100).toFixed(2)}%)`);
            }
            if (sl > 0) {
              console.log(`   Stop Loss: ₹${sl.toFixed(2)} (-${((entry - sl) / entry * 100).toFixed(2)}%)`);
            }
            console.log(`   Score: ${signal.score || 0}/100`);
            if (gap > 0) console.log(`   Gap: ${gap.toFixed(2)}%`);
            if (volume > 0) console.log(`   Volume: ${(volume / 100000).toFixed(1)}L`);
            if (delivery > 0) console.log(`   Delivery: ${delivery.toFixed(1)}%`);
            console.log(`   Reason: ${signal.reason || 'Gap-up momentum'}`);
          });
          
          console.log('\n' + '='.repeat(80));
          return;
        } else {
          console.log(`\n⚠️ No signals generated`);
          console.log(`   Message: ${data.message || 'No signals found'}`);
        }
      } else {
        const errorText = await response.text();
        console.log(`   Response: ${response.status} ${response.statusText}`);
        if (errorText) {
          console.log(`   Error details: ${errorText.substring(0, 200)}`);
        }
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
      continue;
    }
  }
  
  console.log('\n❌ Could not generate signals from any endpoint');
}

getSignals().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

