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

function sign(timestamp, bodyString) {
  return crypto.createHmac('sha256', API_SECRET).update(timestamp + API_KEY + RECV_WINDOW + bodyString).digest('hex');
}

async function testApi(endpoint, payload) {
  const ts = Date.now().toString();
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
    const res = await axios.post(`${BASE_URL}${endpoint}`, body, { headers, timeout: 8000 });
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Response:`, res.data);
    return res.data;
  } catch (err) {
    console.error(`Error ${endpoint}:`, err.response?.data || err.message);
  }
}

async function run() {
  console.log('--- Testing relist with full params on ad 2112904870574215168 ---');
  await testApi('/v5/p2p/item/update', {
    id: '2112904870574215168',
    priceType: 0,
    premium: '0',
    price: '258.00',
    minAmount: '516.00',
    maxAmount: '10000.00',
    quantity: '2',
    actionType: 'ACTIVE'
  });
}

run();
