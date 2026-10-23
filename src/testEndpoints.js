import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = 'https://api.bybit.com';
const RECV_WINDOW = '5000';

function sign(timestamp, paramStr) {
  return crypto.createHmac('sha256', API_SECRET).update(timestamp + API_KEY + RECV_WINDOW + paramStr).digest('hex');
}

async function testReq(endpoint, data = {}) {
  const ts = Date.now().toString();
  const body = JSON.stringify(data);
  const signature = sign(ts, body);
  const headers = {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': ts,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    'Content-Type': 'application/json'
  };

  try {
    const res = await axios({ method: 'POST', url: BASE_URL + endpoint, headers, data: body, timeout: 8000 });
    console.log(`✅ ${JSON.stringify(data)} -> retCode: ${res.data.ret_code || res.data.retCode}, count: ${res.data.result?.count || res.data.result?.items?.length || 0}`);
    if (res.data.result?.items?.length > 0) {
      console.log('   First item:', res.data.result.items[0].price, res.data.result.items[0].nickName);
    } else if (res.data.ret_msg) {
      console.log('   Msg:', res.data.ret_msg);
    }
    return res.data;
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }
}

async function run() {
  console.log('--- Testing item/online parameter variations ---');
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: '0' });
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: '1' });
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: 0 });
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: 1 });
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: '0', page: '1', size: '10' });
  await testReq('/v5/p2p/item/online', { tokenId: 'USDT', currencyId: 'DZD', side: '1', page: '1', size: '10' });
}

run();
