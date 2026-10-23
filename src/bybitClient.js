import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.BYBIT_API_KEY || '';
const API_SECRET = process.env.BYBIT_API_SECRET || '';
const BASE_URL = process.env.BYBIT_BASE_URL || 'https://api.bybit.com';
const RECV_WINDOW = '5000';

function generateSignature(timestamp, bodyString) {
  const preHash = timestamp + API_KEY + RECV_WINDOW + bodyString;
  return crypto.createHmac('sha256', API_SECRET).update(preHash).digest('hex');
}

async function postRequest(endpoint, params = {}) {
  const timestamp = Date.now().toString();
  const bodyString = JSON.stringify(params);
  const signature = generateSignature(timestamp, bodyString);

  const headers = {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, bodyString, {
      headers,
      timeout: 10000
    });
    return response.data;
  } catch (err) {
    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[Bybit API Error] ${endpoint}: ${errData}`);
    throw new Error(err.response?.data?.retMsg || err.response?.data?.ret_msg || err.message);
  }
}

export const Bybit = {
  // Query online market ads (with quantity/amount filtering)
  async getOnlineAds(currencyId = 'DZD', tokenId = 'USDT', side = '1', page = '1', size = '10', amount = null) {
    const payload = {
      currencyId,
      tokenId,
      side: String(side),
      page: String(page),
      size: String(size)
    };
    if (amount && Number(amount) > 0) {
      payload.amount = String(amount);
    }
    return postRequest('/v5/p2p/item/online', payload);
  },

  // Query personal ads
  async getMyAds(currencyId = 'DZD', tokenId = 'USDT') {
    return postRequest('/v5/p2p/item/personal/list', {
      currencyId,
      tokenId
    });
  },

  // Update ad price
  async updateAdPrice(itemId, price) {
    return postRequest('/v5/p2p/item/update', {
      itemId: String(itemId),
      price: String(Number(price).toFixed(2))
    });
  },

  // Pause / Take ad offline
  async cancelAd(itemId) {
    return postRequest('/v5/p2p/item/cancel', {
      itemId: String(itemId)
    });
  },

  // Resume / Bring ad online
  async relistAd(itemId) {
    return postRequest('/v5/p2p/item/update', {
      itemId: String(itemId),
      status: 10
    });
  },

  // Query pending active orders
  async getPendingOrders() {
    return postRequest('/v5/p2p/order/pending/simplifyList', {});
  },

  // Query past orders history
  async getOrdersHistory() {
    return postRequest('/v5/p2p/order/simplifyList', {});
  },

  // 1-Click Escrow Release
  async releaseEscrow(orderId) {
    return postRequest('/v5/p2p/order/finish', {
      orderId: String(orderId)
    });
  }
};
