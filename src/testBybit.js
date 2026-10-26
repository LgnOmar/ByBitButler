import { Bybit } from './bybitClient.js';
import dotenv from 'dotenv';
dotenv.config();

async function runDiagnostics() {
  console.log('========================================');
  console.log('⚡ BYBIT BUTLER API DIAGNOSTIC TEST');
  console.log('========================================');
  
  if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) {
    console.error('❌ Error: BYBIT_API_KEY or BYBIT_API_SECRET is missing in .env');
    process.exit(1);
  }
  
  console.log('🔑 API Key:', process.env.BYBIT_API_KEY.substring(0, 6) + '...' + process.env.BYBIT_API_KEY.slice(-4));
  console.log('📡 Testing Bybit V5 Connection...');

  // Detect current public IP
  let publicIp = 'Unknown';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json').then(r => r.json());
    publicIp = ipRes.ip || 'Unknown';
    console.log('🌐 Current Outbound IP:', publicIp);
  } catch (e) {}

  // 1. Test Personal Ads (P2P Merchant API Access)
  try {
    console.log('\n[1/3] Querying Personal Bybit Ads (getMyAds)...');
    const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
    if (myAdsRes && (myAdsRes.retCode === 0 || myAdsRes.ret_code === 0)) {
      const items = myAdsRes.result?.items || [];
      console.log(`✅ Success! Found ${items.length} personal ads on your Bybit account.`);
      items.forEach((ad, i) => {
        console.log(`   #${i + 1} | Ad ID: ${ad.id} | Price: ${ad.price} DZD | Status: ${ad.status === 10 ? 'ONLINE 🟢' : 'OFFLINE 🔴'} | Limits: ${ad.minAmount}-${ad.maxAmount} DZD`);
      });
    } else {
      console.log('⚠️ Personal Ads response:', myAdsRes);
      if (myAdsRes?.ret_code === 10010 || myAdsRes?.retCode === 10010) {
        console.log('\n⛔ IP WHITELIST NOTICE: Bybit rejected request (Code 10010: Unmatched IP).');
        console.log(`👉 Please whitelist IP ${publicIp} in your Bybit API settings.`);
      }
    }
  } catch (err) {
    console.error('❌ Personal Ads Query Failed:', err.message);
    if (err.message.includes('Unmatched IP')) {
      console.log(`👉 Please whitelist IP ${publicIp} in your Bybit API settings.`);
    }
  }

  // 2. Test DZD Market Depth (Public Orderbook)
  try {
    console.log('\n[2/3] Querying Bybit DZD P2P Orderbook (Top Sell Ads)...');
    const depthRes = await Bybit.getMarketDepth('DZD', 'USDT', '1', 5);
    if (depthRes && (depthRes.retCode === 0 || depthRes.ret_code === 0)) {
      const items = depthRes.result?.items || [];
      console.log(`✅ Found ${items.length} Online Sell Ads in DZD:`);
      items.forEach((item, idx) => {
        console.log(`   #${idx + 1} | Price: ${item.price} DZD | Merchant: ${item.nickName || item.userId} | Min-Max: ${item.minAmount}-${item.maxAmount} DZD`);
      });
    } else {
      console.log('⚠️ Market depth response:', depthRes);
    }
  } catch (err) {
    console.error('❌ Market Depth Query Failed:', err.message);
  }

  // 3. Test Pending Orders
  try {
    console.log('\n[3/3] Querying Pending P2P Orders...');
    const ordersRes = await Bybit.getPendingOrders();
    if (ordersRes && (ordersRes.retCode === 0 || ordersRes.ret_code === 0)) {
      const orderList = ordersRes.result?.orderList || ordersRes.result?.items || [];
      console.log(`✅ Query Succeeded! Active Pending Orders: ${orderList.length}`);
    } else {
      console.log('⚠️ Pending orders response:', ordersRes);
    }
  } catch (err) {
    console.error('❌ Pending Orders Query Failed:', err.message);
  }

  console.log('\n========================================');
  console.log('🎯 Diagnostics Complete!');
  console.log('========================================');
}

runDiagnostics();
