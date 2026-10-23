import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: 'C:\\Users\\hp\\Desktop\\Apps\\Antigravity\\ByBitButler\\.env' });

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = 'https://api.bybit.com';
const RECV_WINDOW = '5000';

function sign(timestamp, bodyString) {
  return crypto.createHmac('sha256', API_SECRET).update(timestamp + API_KEY + RECV_WINDOW + bodyString).digest('hex');
}

async function testAmountFilter(amountVal) {
  const ts = Date.now().toString();
  const payload = {
    tokenId: 'USDT',
    currencyId: 'DZD',
    side: '1',
    page: '1',
    size: '10'
  };
  if (amountVal) payload.amount = String(amountVal);

  const body = JSON.stringify(payload);
  const signature = sign(ts, body);
  const headers = {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': ts,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    'Content-Type': 'application/json'
  };

  try {
    const res = await axios.post(`${BASE_URL}/v5/p2p/item/online`, body, { headers, timeout: 8000 });
    const items = res.data.result?.items || [];
    console.log(`\n=== Query with amount: ${amountVal || 'NONE'} ===`);
    console.log(`Count returned: ${items.length}`);
    items.slice(0, 3).forEach((item, idx) => {
      console.log(`  #${idx + 1} | Price: ${item.price} DZD | Merchant: ${item.nickName} | Limits: ${item.minAmount} - ${item.maxAmount} DZD`);
    });
  } catch (err) {
    console.error(`Query failed:`, err.response?.data || err.message);
  }
}

async function run() {
  await testAmountFilter(null);       // Unfiltered
  await testAmountFilter('500');      // 500 DZD
  await testAmountFilter('50000');    // 50,000 DZD
  await testAmountFilter('200000');   // 200,000 DZD
}

run();
