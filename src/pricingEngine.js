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

    // 1. Fetch live market depth for target quantity
    const depthRes = await Bybit.getOnlineAds('DZD', 'USDT', '1', '1', '10', amountFilter);
    if (!depthRes || (depthRes.ret_code !== 0 && depthRes.retCode !== 0)) {
      if (depthRes?.ret_code === 10006) {
        console.warn('[Pricing Engine] Rate limit hit. Backing off for 15s.');
        await new Promise(r => setTimeout(r, 15000));
      }
      isEvaluating = false;
      return;
    }

    const items = depthRes.result?.items || [];
    
    // 2. Filter out own ad
    const competitors = items.filter(item => String(item.id) !== targetAdId && String(item.itemId) !== targetAdId);

    if (competitors.length === 0) {
      updateConfig({
        lastCheckTime: new Date().toLocaleTimeString(),
        lastAction: 'No competitors found for quantity ' + (amountFilter || 'any') + ' DZD'
      });
      isEvaluating = false;
      return;
    }

    // 3. Find lowest competitor price
    const topCompetitor = competitors[0];
    const compPrice = parseFloat(topCompetitor.price);
    const buffer = parseFloat(config.undercutBuffer) || 0.01;
    const floor = parseFloat(config.minFloorPrice) || 250.00;

    // 4. Calculate target price
    let targetPrice = parseFloat((compPrice - buffer).toFixed(2));
    let isHeldAtFloor = false;

    // 5. Hard Floor Constraint Enforcement
    if (targetPrice < floor) {
      targetPrice = floor;
      isHeldAtFloor = true;
    }

    // 6. Check current ad price
    if (!lastKnownPrice) {
      const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
      const myAd = myAdsRes.result?.items?.find(a => String(a.id) === targetAdId);
      if (myAd) {
        lastKnownPrice = parseFloat(myAd.price);
      }
    }

    const priceChanged = !lastKnownPrice || Math.abs(targetPrice - lastKnownPrice) >= 0.01;

    // 7. Update Ad if price needs adjustment
    if (priceChanged) {
      console.log(`[Pricing Engine] Updating ad ${targetAdId} from ${lastKnownPrice} to ${targetPrice} DZD (Comp: ${compPrice} DZD | Floor: ${floor} DZD)`);
      
      const updateRes = await Bybit.updateAdPrice(targetAdId, targetPrice);
      if (updateRes.ret_code === 0 || updateRes.retCode === 0) {
        const oldPrice = lastKnownPrice;
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
          alertMsg = '⚠️ <b>AUTO-PRICING: HELD AT FLOOR</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>Your Price</b>: <b>' + targetPrice.toFixed(2) + ' DZD</b> (Min Floor)\n• <b>Competitor</b>: ' + compPrice.toFixed(2) + ' DZD (' + (topCompetitor.nickName || 'Merchant') + ')\n• <b>Quantity Filter</b>: ' + (amountFilter || 'Any') + ' DZD\n━━━━━━━━━━━━━━━━━━━━\n<i>Butler will never sell below your floor.</i>';
        } else {
          alertMsg = '⚡ <b>AD AUTO-REPRICED TO #1 RANK</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>New Price</b>: <b>' + targetPrice.toFixed(2) + ' DZD</b>\n• <b>Old Price</b>: ' + (oldPrice ? oldPrice.toFixed(2) : 'N/A') + ' DZD\n• <b>Competitor</b>: ' + compPrice.toFixed(2) + ' DZD (' + (topCompetitor.nickName || 'Merchant') + ')\n• <b>Quantity Filter</b>: ' + (amountFilter || 'Any') + ' DZD\n━━━━━━━━━━━━━━━━━━━━\n<i>Maintained #1 position dynamically.</i>';
        }
        await sendAdminAlert(alertMsg);
      } else {
        console.error('[Pricing Engine] Failed to update price:', updateRes.ret_msg || updateRes.retMsg);
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
    if (consecutiveErrors === 5) {
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
