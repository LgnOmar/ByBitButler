import path from 'path';
import { fileURLToPath } from 'url';
import { bot, getMainMenuKeyboard, sendAdminAlert } from './telegramBot.js';
import { startOrderWatcher } from './orderWatcher.js';
import { startPricingEngine } from './pricingEngine.js';
import { loadConfig } from './configManager.js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('message is not modified')) {
    return;
  }
  console.warn('[Handled Rejection]', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Handled Exception]', err.message);
});

console.log('========================================');
console.log('⚡ BYBIT BUTLER DAEMON RUNNING...');
console.log('========================================');

const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
console.log('📱 Whitelisted Telegram Admin:', adminId);

const cfg = loadConfig();
console.log('⚙️ Configuration Loaded:');
console.log('   - Target Ad ID:', cfg.targetAdId);
console.log('   - Auto-Reprice:', cfg.autoRepriceEnabled ? 'ENABLED' : 'PAUSED');
console.log('   - Min Floor Price:', cfg.minFloorPrice, 'DZD');
console.log('   - Quantity Filter:', cfg.referenceAmount ? (cfg.referenceAmount + ' DZD') : 'None');
console.log('   - Refresh Rate:', (cfg.refreshIntervalMs / 1000) + 's');

// 1. Start background order listener (every 4s)
startOrderWatcher(4000);

// 2. Start dynamic auto-pricing engine (every 5s)
startPricingEngine(cfg.refreshIntervalMs || 5000);

// 3. Send startup notification
sendAdminAlert('🎩 <b>ByBit Butler is ONLINE!</b>\n━━━━━━━━━━━━━━━━━━━━\n⚡ <i>Phase 1: Dynamic Auto-Pricing Engine Active</i>\n• Refresh Rate: <b>5 seconds</b>\n• Quantity Filter: <b>' + (cfg.referenceAmount || 'Any') + ' DZD</b>\n• Min Floor: <b>' + cfg.minFloorPrice.toFixed(2) + ' DZD</b>\n\nTap below for controls:', getMainMenuKeyboard()).then(() => {
  console.log('✅ Startup push notification delivered to Telegram.');
}).catch((err) => {
  console.log('ℹ️ Waiting for initial chat activation.');
});

console.log('🟢 Butler is running and listening for Telegram commands.');
