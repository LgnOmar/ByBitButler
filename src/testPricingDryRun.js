import { Bybit } from './bybitClient.js';
import { loadConfig } from './configManager.js';

async function testPricingDryRun() {
  console.log('=== DRY-RUN VERIFICATION: PRICING ENGINE ===');
  const config = loadConfig();
  console.log('Current Config:', {
    targetAdId: config.targetAdId,
    minFloorPrice: config.minFloorPrice,
    referenceAmount: config.referenceAmount,
    undercutBuffer: config.undercutBuffer
  });

  // 1. Fetch personal ads to get current live price
  console.log('\n[1/3] Fetching current ad state from Bybit...');
  const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
  const myAd = myAdsRes.result?.items?.find(a => String(a.id) === String(config.targetAdId));
  if (!myAd) {
    console.error('❌ Could not find target ad with ID:', config.targetAdId);
    return;
  }
  console.log(`✅ Target Ad Found: #${myAd.id} | Current Price: ${myAd.price} DZD | Status: ${myAd.status} | Qty: ${myAd.quantity} USDT`);

  // 2. Fetch market depth for the configured quantity
  console.log(`\n[2/3] Fetching competitor order book (Quantity Filter: ${config.referenceAmount} DZD)...`);
  const depthRes = await Bybit.getOnlineAds('DZD', 'USDT', '1', '1', '10', config.referenceAmount);
  const items = depthRes.result?.items || [];
  console.log(`✅ Received ${items.length} online ads from Bybit.`);

  const competitors = items.filter(i => String(i.id) !== String(config.targetAdId) && String(i.itemId) !== String(config.targetAdId));
  console.log(`Found ${competitors.length} competitors (excluding your ad).`);

  if (competitors.length > 0) {
    const topComp = competitors[0];
    const compPrice = parseFloat(topComp.price);
    const buffer = parseFloat(config.undercutBuffer) || 0.01;
    const floor = parseFloat(config.minFloorPrice) || 250.00;

    let targetPrice = parseFloat((compPrice - buffer).toFixed(2));
    let isHeldAtFloor = false;

    if (targetPrice < floor) {
      targetPrice = floor;
      isHeldAtFloor = true;
    }

    console.log('\n[3/3] Calculation Results:');
    console.log(`   - Lowest Competitor Price: ${compPrice.toFixed(2)} DZD (${topComp.nickName || 'Merchant'})`);
    console.log(`   - Competitor Limits: ${topComp.minAmount} - ${topComp.maxAmount} DZD`);
    console.log(`   - Undercut Buffer: -${buffer.toFixed(2)} DZD`);
    console.log(`   - Calculated Target Price: ${targetPrice.toFixed(2)} DZD`);
    console.log(`   - Minimum Floor Constraint: ${floor.toFixed(2)} DZD`);
    console.log(`   - Held at Floor: ${isHeldAtFloor ? 'YES 🛡️' : 'NO'}`);
    console.log(`   - Current Live Ad Price: ${myAd.price} DZD`);
    console.log(`   - Action Needed: ${Math.abs(targetPrice - parseFloat(myAd.price)) >= 0.01 ? `REPRICE to ${targetPrice.toFixed(2)} DZD` : 'NONE (Already optimal)'}`);
  }
  console.log('\n=== DRY-RUN COMPLETED SUCCESSFULLY ===');
}

testPricingDryRun().catch(console.error);
