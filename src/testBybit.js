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

  // 1. Test Funding Balance
  try {
    console.log('\n[1/3] Querying Funding Wallet Balance (USDT)...');
    const balanceRes = await Bybit.getFundingBalance('USDT');
    if (balanceRes && balanceRes.retCode === 0) {
      const balanceList = balanceRes.result?.balance || [];
      const usdt = balanceList.find(b => b.coin === 'USDT') || { walletBalance: '0', transferBalance: '0' };
      console.log('✅ Funding Balance Retrieved Successfully:');
      console.log('   - Total USDT:', usdt.walletBalance);
      console.log('   - Available USDT:', usdt.transferBalance);
    } else {
      console.log('⚠️ Balance response:', balanceRes);
    }
  } catch (err) {
    console.error('❌ Balance Query Failed:', err.message);
  }

  // 2. Test DZD Market Depth (Sell Ads)
  try {
    console.log('\n[2/3] Querying Bybit DZD P2P Orderbook (Top Sell Ads)...');
    const depthRes = await Bybit.getMarketDepth('DZD', 'USDT', '1', 5);
    if (depthRes && depthRes.retCode === 0) {
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
    if (ordersRes && ordersRes.retCode === 0) {
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
