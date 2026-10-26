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
      timeout: 15000
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

  // Alias for getOnlineAds for backward compatibility
  async getMarketDepth(currencyId = 'DZD', tokenId = 'USDT', side = '1', size = 10, amount = null) {
    return this.getOnlineAds(currencyId, tokenId, side, '1', String(size), amount);
  },

  // Update ad price with full payload reconstruction
  async updateAdPrice(adId, price, existingAd = null) {
    let ad = existingAd;
    if (!ad) {
      const myAdsRes = await this.getMyAds('DZD', 'USDT');
      ad = myAdsRes.result?.items?.find(a => String(a.id) === String(adId) || String(a.itemId) === String(adId));
    }
    if (!ad) {
      throw new Error(`Ad #${adId} not found in personal ads.`);
    }

    const isOnline = ad.status === 10 || ad.showStatus === 'ONLINE' || ad.isOnline === true;
    const actionType = isOnline ? 'MODIFY' : 'ACTIVE';

    const termIds = Array.isArray(ad.paymentTerms) && ad.paymentTerms.length > 0
      ? ad.paymentTerms.map(p => String(p.id))
      : (Array.isArray(ad.payments) && ad.payments.length > 0 ? ad.payments.map(String) : ["152"]);

    const payload = {
      id: String(ad.id || adId),
      actionType,
      priceType: String(ad.priceType ?? '0'),
      premium: String(ad.premium || '0'),
      price: String(Number(price).toFixed(2)),
      minAmount: String(ad.minAmount),
      maxAmount: String(ad.maxAmount),
      quantity: String(ad.quantity),
      paymentPeriod: String(ad.paymentPeriod || '15'),
      paymentIds: termIds,
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

    return postRequest('/v5/p2p/item/update', payload);
  },

  // Pause / Take ad offline
  async cancelAd(itemId) {
    return postRequest('/v5/p2p/item/cancel', {
      itemId: String(itemId)
    });
  },

  // Resume / Bring ad online with full payload reconstruction (actionType: 'ACTIVE')
  async relistAd(adId, existingAd = null) {
    let ad = existingAd;
    if (!ad) {
      const myAdsRes = await this.getMyAds('DZD', 'USDT');
      ad = myAdsRes.result?.items?.find(a => String(a.id) === String(adId) || String(a.itemId) === String(adId));
    }
    if (!ad) {
      throw new Error(`Ad #${adId} not found in personal ads.`);
    }

    const termIds = Array.isArray(ad.paymentTerms) && ad.paymentTerms.length > 0
      ? ad.paymentTerms.map(p => String(p.id))
      : (Array.isArray(ad.payments) && ad.payments.length > 0 ? ad.payments.map(String) : ["152"]);

    const payload = {
      id: String(ad.id || adId),
      actionType: 'ACTIVE',
      priceType: String(ad.priceType ?? '0'),
      premium: String(ad.premium || '0'),
      price: String(ad.price),
      minAmount: String(ad.minAmount),
      maxAmount: String(ad.maxAmount),
      quantity: String(ad.quantity),
      paymentPeriod: String(ad.paymentPeriod || '15'),
      paymentIds: termIds,
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

    return postRequest('/v5/p2p/item/update', payload);
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
