import { Bybit } from './bybitClient.js';
import { loadConfig, updateConfig } from './configManager.js';
import { sendAdminAlert } from './telegramBot.js';

let isEvaluating = false;
let consecutiveErrors = 0;
let lastKnownPrice = null;

export async function evaluateAndReprice() {
  const config = loadConfig();
  if (!config.autoRepriceEnabled) {
    return;
  }

  if (isEvaluating) return;
  isEvaluating = true;

  try {
    const targetAdId = String(config.targetAdId);
    const amountFilter = config.referenceAmount;

    // 1. Fetch personal ad FIRST to verify it exists and is LIVE
    const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
    const myAd = myAdsRes.result?.items?.find(a => String(a.id) === targetAdId || String(a.itemId) === targetAdId);
    if (!myAd) {
      console.warn(`[Pricing Engine] Target ad #${targetAdId} not found in your personal Bybit ads.`);
      updateConfig({
        lastCheckTime: new Date().toLocaleTimeString(),
        lastAction: `Target ad #${targetAdId} not found on Bybit`
      });
      return;
    }

    // 2. Strict Ad Online Guard
    // Ad must have status 10 (Online), isOnline true, and showStatus 'ONLINE'
    const isLive = myAd.status === 10 && myAd.isOnline === true && myAd.showStatus === 'ONLINE';
    if (!isLive) {
      const reason = myAd.hiddenReason ? ` (${myAd.hiddenReason})` : '';
      const statusDesc = myAd.showStatus || (myAd.status === 20 ? 'OFFLINE' : 'INACTIVE');
      const standbyMsg = `Ad #${targetAdId} is ${statusDesc}${reason}. Engine in standby.`;

      if (config.lastAction !== standbyMsg) {
        console.log(`[Pricing Engine] ⏸️ ${standbyMsg}`);
      }

      updateConfig({
        lastCheckTime: new Date().toLocaleTimeString(),
        lastAction: standbyMsg
      });
      return;
    }

    // 3. Fetch live market depth for target quantity (ONLY when ad is verified online)
    const depthRes = await Bybit.getOnlineAds('DZD', 'USDT', '1', '1', '10', amountFilter);
    if (!depthRes || (depthRes.ret_code !== 0 && depthRes.retCode !== 0)) {
      if (depthRes?.ret_code === 10006) {
        console.warn('[Pricing Engine] Rate limit hit. Backing off for 15s.');
        await new Promise(r => setTimeout(r, 15000));
      }
      return;
    }

    const items = depthRes.result?.items || [];
    
    // 4. Filter out own ad
    const competitors = items.filter(item => String(item.id) !== targetAdId && String(item.itemId) !== targetAdId);

    if (competitors.length === 0) {
      updateConfig({
        lastCheckTime: new Date().toLocaleTimeString(),
        lastAction: 'No competitors found for quantity ' + (amountFilter || 'any') + ' DZD'
      });
      return;
    }

    // 5. Find lowest competitor price
    const topCompetitor = competitors[0];
    const compPrice = parseFloat(topCompetitor.price);
    const buffer = parseFloat(config.undercutBuffer) || 0.01;
    const floor = parseFloat(config.minFloorPrice) || 250.00;

    // 6. Calculate target price
    let targetPrice = parseFloat((compPrice - buffer).toFixed(2));
    let isHeldAtFloor = false;

    // 7. Hard Floor Constraint Enforcement
    if (targetPrice < floor) {
      targetPrice = floor;
      isHeldAtFloor = true;
    }

    const currentLivePrice = parseFloat(myAd.price);
    const priceChanged = Math.abs(targetPrice - currentLivePrice) >= 0.01;

    // 8. Update Ad if price needs adjustment
    if (priceChanged) {
      console.log(`[Pricing Engine] Updating ad ${targetAdId} from ${currentLivePrice.toFixed(2)} to ${targetPrice.toFixed(2)} DZD (Comp: ${compPrice.toFixed(2)} DZD | Floor: ${floor.toFixed(2)} DZD)`);
      
      const updateRes = await Bybit.updateAdPrice(targetAdId, targetPrice, myAd);
      if (updateRes && (updateRes.ret_code === 0 || updateRes.retCode === 0)) {
        const oldPrice = currentLivePrice;
        lastKnownPrice = targetPrice;

        const actionText = isHeldAtFloor
          ? `Held at floor ${floor.toFixed(2)} DZD (Competitor at ${compPrice.toFixed(2)} DZD)`
          : `Repriced to ${targetPrice.toFixed(2)} DZD (#1 Rank, Undercut ${compPrice.toFixed(2)} DZD)`;

        updateConfig({
          lastTargetPrice: targetPrice,
          lastCompetitorPrice: compPrice,
          lastCheckTime: new Date().toLocaleTimeString(),
          lastAction: actionText
        });

        // Notify user via Telegram
        let alertMsg = '';
        if (isHeldAtFloor) {
          alertMsg = '⚠️ <b>AUTO-PRICING: HELD AT FLOOR</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>Your Price</b>: <b>' + targetPrice.toFixed(2) + ' DZD</b> (Min Floor)\n• <b>Competitor</b>: ' + compPrice.toFixed(2) + ' DZD (' + (topCompetitor.nickName || 'Merchant') + ')\n• <b>Quantity Filter</b>: ' + (amountFilter ? amountFilter + ' DZD' : 'Any Volume') + '\n━━━━━━━━━━━━━━━━━━━━\n<i>Butler will never sell below your floor.</i>';
        } else {
          alertMsg = '⚡ <b>AD AUTO-REPRICED TO #1 RANK</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>New Price</b>: <b>' + targetPrice.toFixed(2) + ' DZD</b>\n• <b>Old Price</b>: ' + oldPrice.toFixed(2) + ' DZD\n• <b>Competitor</b>: ' + compPrice.toFixed(2) + ' DZD (' + (topCompetitor.nickName || 'Merchant') + ')\n• <b>Quantity Filter</b>: ' + (amountFilter ? amountFilter + ' DZD' : 'Any Volume') + '\n━━━━━━━━━━━━━━━━━━━━\n<i>Maintained #1 position dynamically on Bybit.</i>';
        }
        await sendAdminAlert(alertMsg);
      } else {
        const errMsg = updateRes?.ret_msg || updateRes?.retMsg || 'Unknown Bybit error';
        console.error('[Pricing Engine] Bybit refused price update:', errMsg);
        updateConfig({
          lastCheckTime: new Date().toLocaleTimeString(),
          lastAction: `Failed to update Bybit ad: ${errMsg}`
        });
      }
    } else {
      updateConfig({
        lastCompetitorPrice: compPrice,
        lastCheckTime: new Date().toLocaleTimeString(),
        lastAction: 'Ad already at optimal price ' + targetPrice.toFixed(2) + ' DZD'
      });
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    console.error('[Pricing Engine Error]', err.message);
    if (err.message && err.message.includes('Unmatched IP')) {
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        await sendAdminAlert('⛔ <b>Bybit IP Whitelist Error</b>: Bybit rejected request with code 10010 (Unmatched IP). Please check your API key bound IP addresses.');
      }
    } else if (consecutiveErrors === 5) {
      await sendAdminAlert('⚠️ <b>Pricing Engine Warning</b>: Encountered repeated errors: ' + err.message);
    }
  } finally {
    isEvaluating = false;
  }
}

export function startPricingEngine(intervalMs = 5000) {
  console.log(`⚡ Dynamic Pricing Engine active (evaluation every ${intervalMs / 1000}s)...`);
  evaluateAndReprice();
  return setInterval(evaluateAndReprice, intervalMs);
}
