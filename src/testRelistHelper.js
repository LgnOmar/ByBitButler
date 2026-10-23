import { Bybit } from './bybitClient.js';
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

async function relistAd(adId) {
  const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
  const ad = myAdsRes.result?.items?.find(a => String(a.id) === String(adId));
  if (!ad) {
    console.error('Ad not found:', adId);
    return;
  }

  // Construct relist payload from existing ad
  const payload = {
    id: String(ad.id),
    actionType: 'ACTIVE',
    priceType: ad.priceType ?? 0,
    premium: String(ad.premium || '0'),
    price: String(ad.price),
    minAmount: String(ad.minAmount),
    maxAmount: String(ad.maxAmount),
    quantity: String(ad.quantity),
    paymentPeriod: String(ad.paymentPeriod || 15),
    paymentIds: ad.payments || ["152"],
    remark: ad.remark || '',
    tradingPreferenceSet: ad.tradingPreferenceSet || {
      hasUnPostAd: 0,
      isKyc: 1,
      isEmail: 1,
      isMobile: 1,
      hasRegisterTime: 0,
      registerTimeThreshold: 0,
      orderFinishNumberDay30: 0,
      completeRateDay30: "",
      nationalLimit: "DZA",
      hasOrderFinishNumberDay30: 0,
      hasCompleteRateDay30: 0,
      hasNationalLimit: 1,
      hasSingleUserOrderLimit: 0,
      singleUserOrderLimit: 0
    }
  };

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
    console.log('Relist response:', res.data);
    return res.data;
  } catch (err) {
    console.error('Relist failed:', err.response?.data || err.message);
  }
}

async function run() {
  console.log('--- Testing relistAd on Ad 2112904870574215168 ---');
  await relistAd('2112904870574215168');
}

run();
