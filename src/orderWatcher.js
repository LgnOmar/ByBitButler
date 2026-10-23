import { Bybit } from './bybitClient.js';
import { sendAdminAlert } from './telegramBot.js';

let knownOrders = new Map();
let isPolling = false;

export async function checkOrders() {
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await Bybit.getPendingOrders();
    if (!res || (res.ret_code !== 0 && res.retCode !== 0)) {
      isPolling = false;
      return;
    }

    const currentOrders = res.result?.items || res.result?.orderList || [];
    const currentOrderIds = new Set();

    for (const order of currentOrders) {
      const orderId = String(order.orderId);
      currentOrderIds.add(orderId);
      const prevOrder = knownOrders.get(orderId);

      // New Order Alert
      if (!prevOrder) {
        knownOrders.set(orderId, order);
        const alertText = '🚨 *NEW BYBIT P2P ORDER!*\n━━━━━━━━━━━━━━━━━━━━\n🆔 *Order*: ' + orderId + '\n👤 *Counterparty*: *' + (order.targetNickName || order.userId || 'Buyer') + '*\n💰 *Amount*: *' + (order.amount || order.notifyAmount) + ' DZD*\n🪙 *Crypto*: *' + order.quantity + ' USDT*\n💵 *Price*: *' + order.price + ' DZD*\n━━━━━━━━━━━━━━━━━━━━\n_Waiting for buyer to send payment..._';
        await sendAdminAlert(alertText);
      } else {
        // Status changed to PAID (Bybit status 20 indicates paid)
        const isPaidNow = order.status === 20 || order.orderStatus === 'PAID';
        const wasPaidBefore = prevOrder.status === 20 || prevOrder.orderStatus === 'PAID';

        if (isPaidNow && !wasPaidBefore) {
          knownOrders.set(orderId, order);
          const paidAlert = '🔔 *BUYER MARKED AS PAID!*\n━━━━━━━━━━━━━━━━━━━━\n🆔 *Order*: ' + orderId + '\n💰 *Amount*: *' + (order.amount || order.notifyAmount) + ' DZD*\n👤 *Buyer*: ' + (order.targetNickName || 'Buyer') + '\n\n👉 *VERIFY IN YOUR BARIDIMOB APP NOW!*\nOnce verified, tap the button below to release crypto immediately:';

          const releaseKeyboard = {
            inline_keyboard: [
              [
                { text: '✅ VERIFIED — RELEASE CRYPTO', callback_data: 'confirm_release_' + orderId }
              ]
            ]
          };

          await sendAdminAlert(paidAlert, releaseKeyboard);
        }
      }
    }

    // Clean up finished orders from memory
    for (const id of knownOrders.keys()) {
      if (!currentOrderIds.has(id)) {
        knownOrders.delete(id);
      }
    }
  } catch (err) {
    console.error('[OrderWatcher Error]', err.message);
  } finally {
    isPolling = false;
  }
}

export function startOrderWatcher(intervalMs = 4000) {
  console.log('📡 Order Watcher active (polling every ' + (intervalMs / 1000) + 's)...');
  checkOrders();
  return setInterval(checkOrders, intervalMs);
}
