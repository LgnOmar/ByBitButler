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

async function testUpdate(payload) {
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
    const res = await axios.post(`${BASE_URL}/v5/p2p/item/update`, body, { headers, timeout: 8000 });
    console.log(`Payload:`, payload);
    console.log(`Response:`, res.data);
    return res.data;
  } catch (err) {
    console.error(`Update failed:`, err.response?.data || err.message);
  }
}

async function run() {
  console.log('Testing ad update with current price 259.87 on ad 2113267925914439680...');
  // Try with itemId
  await testUpdate({ itemId: '2113267925914439680', price: '259.87' });
  // Try with id
  await testUpdate({ id: '2113267925914439680', price: '259.87' });
}

run();
