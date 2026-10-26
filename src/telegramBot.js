import path from 'path';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import { Bybit } from './bybitClient.js';
import { loadConfig, updateConfig } from './configManager.js';
import { evaluateAndReprice } from './pricingEngine.js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '');

export const bot = new TelegramBot(TOKEN, { polling: true });

bot.on('polling_error', (error) => {
  console.warn('[Telegram Polling Warning]', error.message);
});

function isAuthorized(msg) {
  const fromId = String(msg.from?.id || msg.chat?.id || '');
  return fromId === ADMIN_ID;
}

export function getMainMenuKeyboard() {
  const cfg = loadConfig();
  const autoStatusText = cfg.autoRepriceEnabled ? '🤖 Auto-Reprice: ON 🟢' : '🤖 Auto-Reprice: OFF 🔴';
  const bracketText = '💰 Bracket: ' + (cfg.referenceAmount ? cfg.referenceAmount + ' DZD' : 'All Volumes');

  return {
    inline_keyboard: [
      [
        { text: '📢 My Ads (Control)', callback_data: 'btn_ads_list' },
        { text: '📈 DZD Market Depth', callback_data: 'btn_depth' }
      ],
      [
        { text: autoStatusText, callback_data: 'btn_toggle_autoprice' },
        { text: bracketText, callback_data: 'btn_brackets_menu' }
      ],
      [
        { text: '📊 Full Status', callback_data: 'btn_status' },
        { text: '⚙️ Pricing Config', callback_data: 'btn_pricing_info' }
      ],
      [
        { text: '📋 Active Orders', callback_data: 'btn_orders' },
        { text: '🛑 Emergency Stop', callback_data: 'btn_emergency_stop_all' }
      ]
    ]
  };
}

export function getBracketKeyboard() {
  const cfg = loadConfig();
  const current = cfg.referenceAmount;

  const brackets = [
    { label: '500 DZD', val: '500' },
    { label: '1,000 DZD', val: '1000' },
    { label: '2,000 DZD', val: '2000' },
    { label: '5,000 DZD', val: '5000' },
    { label: '10,000 DZD', val: '10000' },
    { label: '20,000 DZD', val: '20000' },
    { label: 'All Volumes', val: '0' }
  ];

  const rows = [];
  let currentRow = [];
  brackets.forEach(b => {
    const isSelected = (b.val === '0' && !current) || (current === b.val);
    const text = isSelected ? `✅ ${b.label}` : b.label;
    currentRow.push({ text, callback_data: `set_bracket_${b.val}` });
    if (currentRow.length === 2) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);

  rows.push([
    { text: '📈 View Depth for this Bracket', callback_data: 'btn_depth' }
  ]);
  rows.push([
    { text: '🔙 Main Menu', callback_data: 'btn_menu' }
  ]);

  return { inline_keyboard: rows };
}

export async function handleBracketMenu(chatId, messageId = null) {
  const cfg = loadConfig();
  const currentText = cfg.referenceAmount ? `<b>${cfg.referenceAmount} DZD</b>` : '<b>All Volumes (Unfiltered)</b>';

  const text = '💰 <b>SELECT TICKET BRACKET</b>\n━━━━━━━━━━━━━━━━━━━━\n' +
    'Active Competitor Bracket: ' + currentText + '\n\n' +
    '<i>In Bybit P2P, buyer search depth and clearing prices depend heavily on ticket size. ' +
    'Select the bracket matching the order size you want to capture:</i>\n━━━━━━━━━━━━━━━━━━━━\n' +
    '💡 <i>Or type <code>/setamount &lt;amount&gt;</code> for any custom amount.</i>';

  if (messageId) {
    await safeEditMessage(text, chatId, messageId, getBracketKeyboard());
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: getBracketKeyboard()
    });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function safeEditMessage(text, chatId, messageId, replyMarkup = null) {
  try {
    const opts = {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML'
    };
    if (replyMarkup) opts.reply_markup = replyMarkup;
    await bot.editMessageText(text, opts);
  } catch (err) {
    if (err.message && err.message.includes('message is not modified')) {
      return;
    }
    console.warn('[Telegram Edit Warning]', err.message);
  }
}

// /start or /menu
bot.onText(/\/(start|menu)/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const welcomeText = '🎩 <b>ByBit Butler Active!</b>\n\nWelcome, Omar! Your private Bybit P2P command desk is linked and ready.\n\nChoose an action below:';
  await bot.sendMessage(msg.chat.id, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: getMainMenuKeyboard()
  });
});

// /ads
bot.onText(/\/ads/, async (msg) => {
  if (!isAuthorized(msg)) return;
  await handleAdsList(msg.chat.id);
});

// /ping
bot.onText(/\/ping/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const start = Date.now();
  const sent = await bot.sendMessage(msg.chat.id, '🏓 Checking Butler latency...');
  const latency = Date.now() - start;
  await safeEditMessage('🏓 <b>Pong!</b> Butler is fully operational.\n⏱️ Roundtrip latency: <b>' + latency + 'ms</b>', msg.chat.id, sent.message_id);
});

// /pricing or /config
bot.onText(/\/(pricing|config)/, async (msg) => {
  if (!isAuthorized(msg)) return;
  await handlePricingReport(msg.chat.id);
});

// /autoprice [on|off]
bot.onText(/\/autoprice(?:\s+(on|off))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return;
  const action = match[1]?.toLowerCase();
  const cfg = loadConfig();

  let newState = !cfg.autoRepriceEnabled;
  if (action === 'on') newState = true;
  if (action === 'off') newState = false;

  updateConfig({ autoRepriceEnabled: newState });
  const statusEmoji = newState ? '🟢 <b>ON</b>' : '🔴 <b>OFF</b>';
  await bot.sendMessage(msg.chat.id, '🤖 <b>Dynamic Auto-Reprice is now ' + statusEmoji + '</b>\n\nTarget Ad: <code>' + cfg.targetAdId + '</code>\nMin Floor: <b>' + cfg.minFloorPrice + ' DZD</b>\nQuantity Filter: <b>' + cfg.referenceAmount + ' DZD</b>', {
    parse_mode: 'HTML',
    reply_markup: getMainMenuKeyboard()
  });
});

// /setfloor <price>
bot.onText(/\/setfloor(?:\s+(\d+(?:\.\d+)?))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return;
  const price = match[1];
  if (!price) {
    const cfg = loadConfig();
    await bot.sendMessage(msg.chat.id, '🛡️ Current Minimum Floor: <b>' + cfg.minFloorPrice + ' DZD</b>\n\nTo update, send: <code>/setfloor 255.50</code>', { parse_mode: 'HTML' });
    return;
  }
  const num = parseFloat(price);
  if (isNaN(num) || num <= 0) {
    await bot.sendMessage(msg.chat.id, '❌ Invalid price format. Example: <code>/setfloor 255.00</code>', { parse_mode: 'HTML' });
    return;
  }
  updateConfig({ minFloorPrice: num });
  await bot.sendMessage(msg.chat.id, '✅ <b>Minimum Floor Price updated to ' + num.toFixed(2) + ' DZD</b>\nButler will never undercut below this price.', { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
});

// /setamount <amount>
bot.onText(/\/setamount(?:\s+(\d+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return;
  const amount = match[1];
  if (!amount) {
    const cfg = loadConfig();
    await bot.sendMessage(msg.chat.id, '💰 Current Quantity Filter: <b>' + (cfg.referenceAmount ? cfg.referenceAmount + ' DZD' : 'All Volumes') + '</b>\n\nTo update, send: <code>/setamount 2000</code> (or <code>/setamount 0</code> for any quantity)', { parse_mode: 'HTML' });
    return;
  }
  const newAmount = amount === '0' ? null : String(amount);
  updateConfig({ referenceAmount: newAmount });
  const cfg = loadConfig();
  if (cfg.autoRepriceEnabled) {
    evaluateAndReprice().catch(console.error);
  }
  await bot.sendMessage(msg.chat.id, '✅ <b>Quantity Filter updated to ' + (amount === '0' ? 'ALL Volumes' : amount + ' DZD') + '</b>\nCompetitor depth will now be evaluated for this specific ticket size.', { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
});

// /setprice <price> (updates targeted ad price immediately)
bot.onText(/\/setprice(?:\s+(\d+(?:\.\d+)?))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return;
  const price = match[1];
  const cfg = loadConfig();
  if (!price) {
    await bot.sendMessage(msg.chat.id, '✏️ To set manual price on Ad <code>' + cfg.targetAdId + '</code>, send: <code>/setprice 259.50</code>', { parse_mode: 'HTML' });
    return;
  }
  const num = parseFloat(price);
  if (num < cfg.minFloorPrice) {
    await bot.sendMessage(msg.chat.id, '⚠️ <b>Error:</b> Price ' + num.toFixed(2) + ' DZD is below your floor (' + cfg.minFloorPrice.toFixed(2) + ' DZD)!\nUpdate your floor first with <code>/setfloor</code> if you intend to sell lower.', { parse_mode: 'HTML' });
    return;
  }
  try {
    const res = await Bybit.updateAdPrice(cfg.targetAdId, num);
    if (res.ret_code === 0 || res.retCode === 0) {
      await bot.sendMessage(msg.chat.id, '✅ <b>Ad #' + cfg.targetAdId + ' successfully repriced to ' + num.toFixed(2) + ' DZD!</b>', { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
    } else {
      let errText = res.ret_msg || res.retMsg || 'Unknown Bybit error';
      if (res.ret_code === 912120024) {
        errText = 'Insufficient Available USDT in your Funding Account. Please transfer USDT into your Bybit Funding Account first.';
      }
      await bot.sendMessage(msg.chat.id, '❌ <b>Failed to update price:</b>\n' + escapeHtml(errText), { parse_mode: 'HTML' });
    }
  } catch (err) {
    await bot.sendMessage(msg.chat.id, '❌ Error: ' + escapeHtml(err.message), { parse_mode: 'HTML' });
  }
});

// Helper: Handle Ads List with Interactive Pause/Resume Buttons
export async function handleAdsList(chatId, messageId = null) {
  try {
    const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
    const ads = myAdsRes.result?.items || [];
    const cfg = loadConfig();

    if (ads.length === 0) {
      const emptyText = '📢 <b>YOUR BYBIT ADS</b>\n━━━━━━━━━━━━━━━━━━━━\n<i>No active ads found on your Bybit account.</i>';
      if (messageId) {
        await safeEditMessage(emptyText, chatId, messageId, getMainMenuKeyboard());
      } else {
        await bot.sendMessage(chatId, emptyText, { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
      }
      return;
    }

    let text = '📢 <b>YOUR BYBIT ADS (' + ads.length + ' Found)</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    const inlineKeyboard = [];

    ads.forEach((ad, idx) => {
      const isOnline = ad.status === 10 || ad.showStatus === 'ONLINE' || ad.isOnline === true;
      const statusBadge = isOnline ? '🟢 <b>ONLINE</b>' : '🔴 <b>OFFLINE / PAUSED</b>';
      const sideStr = ad.side === 1 || ad.side === '1' ? 'SELL' : 'BUY';
      const isTarget = String(ad.id) === String(cfg.targetAdId);

      text += '<b>#' + (idx + 1) + ' Ad ID</b>: <code>' + ad.id + '</code> ' + (isTarget ? '🎯 <i>(Auto-Target)</i>' : '') + '\n' +
        '• <b>Status</b>: ' + statusBadge + '\n' +
        '• <b>Direction</b>: ' + sideStr + ' USDT for DZD\n' +
        '• <b>Price</b>: <b>' + escapeHtml(ad.price) + ' DZD</b>\n' +
        '• <b>Quantity</b>: ' + escapeHtml(ad.quantity) + ' USDT (Remain: ' + escapeHtml(ad.lastQuantity) + ')\n' +
        '• <b>Limits</b>: ' + escapeHtml(ad.minAmount) + ' - ' + escapeHtml(ad.maxAmount) + ' DZD\n\n';

      // Row of buttons for this ad
      const row = [];
      if (isOnline) {
        row.push({ text: '⏸ Pause Ad #' + (idx + 1), callback_data: 'btn_pause_ad_' + ad.id });
      } else {
        row.push({ text: '▶️ Resume Ad #' + (idx + 1), callback_data: 'btn_resume_ad_' + ad.id });
      }
      if (!isTarget) {
        row.push({ text: '🎯 Select Auto #' + (idx + 1), callback_data: 'btn_select_ad_' + ad.id });
      }
      inlineKeyboard.push(row);
    });

    inlineKeyboard.push([
      { text: '🔄 Refresh Ads', callback_data: 'btn_ads_list' },
      { text: '🛑 Emergency Pause All', callback_data: 'btn_emergency_stop_all' }
    ]);
    inlineKeyboard.push([
      { text: '🔙 Main Menu', callback_data: 'btn_menu' }
    ]);

    text += '━━━━━━━━━━━━━━━━━━━━\n<i>Updated: ' + new Date().toLocaleTimeString() + '</i>';

    const markup = { inline_keyboard: inlineKeyboard };
    if (messageId) {
      await safeEditMessage(text, chatId, messageId, markup);
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: markup
      });
    }
  } catch (err) {
    const errText = '❌ Error fetching ads: ' + escapeHtml(err.message);
    if (messageId) {
      await safeEditMessage(errText, chatId, messageId, getMainMenuKeyboard());
    } else {
      await bot.sendMessage(chatId, errText, { reply_markup: getMainMenuKeyboard() });
    }
  }
}

// Pricing Report
export async function handlePricingReport(chatId, messageId = null) {
  const cfg = loadConfig();
  const statusStr = cfg.autoRepriceEnabled ? '🟢 <b>ACTIVE (5s interval)</b>' : '🔴 <b>STANDBY (Paused)</b>';

  const text = '⚙️ <b>DYNAMIC AUTO-PRICING CONFIG</b>\n━━━━━━━━━━━━━━━━━━━━\n' +
    '• <b>Status</b>: ' + statusStr + '\n' +
    '• <b>Target Ad</b>: <code>' + cfg.targetAdId + '</code>\n' +
    '• <b>Min Floor Price</b>: <b>' + cfg.minFloorPrice.toFixed(2) + ' DZD</b> (Hard Guard)\n' +
    '• <b>Quantity Filter</b>: <b>' + (cfg.referenceAmount ? cfg.referenceAmount + ' DZD' : 'Any Volume') + '</b>\n' +
    '• <b>Undercut Buffer</b>: <b>' + cfg.undercutBuffer + ' DZD</b>\n' +
    '• <b>Refresh Rate</b>: <b>' + (cfg.refreshIntervalMs / 1000) + ' seconds</b>\n\n' +
    '📊 <b>Last Engine Action</b>:\n• Time: ' + (cfg.lastCheckTime || 'Never') + '\n• Action: <i>' + escapeHtml(cfg.lastAction) + '</i>\n━━━━━━━━━━━━━━━━━━━━\n' +
    '<i>Commands:</i>\n• <code>/autoprice on</code> or <code>/autoprice off</code>\n• <code>/setfloor 255.00</code>\n• <code>/setamount 50000</code>\n• <code>/setprice 259.00</code>';

  if (messageId) {
    await safeEditMessage(text, chatId, messageId, getMainMenuKeyboard());
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard()
    });
  }
}

// Status handler
export async function handleStatusReport(chatId, messageId = null) {
  try {
    const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
    const myAds = myAdsRes.result?.items || [];

    const ordersRes = await Bybit.getPendingOrders();
    const pendingCount = ordersRes.result?.count || ordersRes.result?.items?.length || 0;

    let adsReport = '';
    if (myAds.length === 0) {
      adsReport = '<i>No active ads on Bybit.</i>';
    } else {
      myAds.forEach((ad, idx) => {
        const isOnline = ad.status === 10 || ad.showStatus === 'ONLINE' || ad.isOnline === true;
        const statusBadge = isOnline ? '🟢 Online' : '🔴 Offline';
        const sideStr = ad.side === 1 || ad.side === '1' ? 'SELL' : 'BUY';
        adsReport += '<b>Ad #' + (idx + 1) + '</b> (' + sideStr + ' | ' + statusBadge + ')\n• Price: <b>' + escapeHtml(ad.price) + ' DZD</b>\n• Quantity: <b>' + escapeHtml(ad.quantity) + ' USDT</b> (Remain: ' + escapeHtml(ad.lastQuantity) + ')\n• Limits: ' + escapeHtml(ad.minAmount) + ' - ' + escapeHtml(ad.maxAmount) + ' DZD\n\n';
      });
    }

    const cfg = loadConfig();
    const autoBadge = cfg.autoRepriceEnabled ? '🟢 Auto-Reprice ON' : '🔴 Auto-Reprice OFF';

    const report = '⚡ <b>BYBIT BUTLER STATUS</b>\n━━━━━━━━━━━━━━━━━━━━\n' +
      '🤖 <b>Auto-Pricing</b>: ' + autoBadge + ' (Floor: ' + cfg.minFloorPrice.toFixed(2) + ' DZD | Ticket: ' + (cfg.referenceAmount || 'Any') + ' DZD)\n' +
      '📋 <b>Pending Orders</b>: <b>' + pendingCount + '</b>\n\n' +
      '📢 <b>Your Bybit Ads</b>:\n' + adsReport + '━━━━━━━━━━━━━━━━━━━━\n<i>Updated at: ' + new Date().toLocaleTimeString() + '</i>';

    if (messageId) {
      await safeEditMessage(report, chatId, messageId, getMainMenuKeyboard());
    } else {
      await bot.sendMessage(chatId, report, {
        parse_mode: 'HTML',
        reply_markup: getMainMenuKeyboard()
      });
    }
  } catch (err) {
    const errText = '❌ Error fetching status: ' + escapeHtml(err.message);
    if (messageId) {
      await safeEditMessage(errText, chatId, messageId, getMainMenuKeyboard());
    } else {
      await bot.sendMessage(chatId, errText, { reply_markup: getMainMenuKeyboard() });
    }
  }
}

// Market depth handler
export async function handleMarketDepth(chatId, messageId = null) {
  try {
    const cfg = loadConfig();
    const depthRes = await Bybit.getOnlineAds('DZD', 'USDT', '1', '1', '6', cfg.referenceAmount);
    
    // Check if Bybit returned rate limit cooldown
    if (depthRes?.ret_code === 10006 || depthRes?.retCode === 10006) {
      const waitText = '⚠️ <b>Bybit Rate Limit Cooldown</b>\n━━━━━━━━━━━━━━━━━━━━\n<i>Bybit P2P rate limit reached. Please wait ~10-15 seconds before refreshing depth.</i>';
      const waitMarkup = {
        inline_keyboard: [
          [{ text: '🔄 Try Refresh Again', callback_data: 'btn_depth' }],
          [{ text: '🔙 Main Menu', callback_data: 'btn_menu' }]
        ]
      };
      if (messageId) {
        await safeEditMessage(waitText, chatId, messageId, waitMarkup);
      } else {
        await bot.sendMessage(chatId, waitText, { parse_mode: 'HTML', reply_markup: waitMarkup });
      }
      return;
    }

    const items = depthRes.result?.items || [];

    const bracketDesc = cfg.referenceAmount ? `${cfg.referenceAmount} DZD` : 'All Volumes';
    let text = '📈 <b>BYBIT DZD SELL ADS (Bracket: ' + bracketDesc + ')</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (items.length === 0) {
      text += '<i>No online sell ads found for this quantity.</i>\n';
    } else {
      items.slice(0, 5).forEach((item, idx) => {
        text += '<b>#' + (idx + 1) + '</b> | <b>' + escapeHtml(item.price) + ' DZD</b> | ' + escapeHtml(item.nickName || 'Merchant') + '\n   Limits: ' + escapeHtml(item.minAmount) + ' - ' + escapeHtml(item.maxAmount) + ' DZD\n';
      });
    }
    text += '━━━━━━━━━━━━━━━━━━━━\n<i>Updated at: ' + new Date().toLocaleTimeString() + '</i>';

    const markup = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh Depth', callback_data: 'btn_depth' },
          { text: '💰 Change Bracket', callback_data: 'btn_brackets_menu' }
        ],
        [
          { text: '🔙 Main Menu', callback_data: 'btn_menu' }
        ]
      ]
    };

    if (messageId) {
      await safeEditMessage(text, chatId, messageId, markup);
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: markup
      });
    }
  } catch (err) {
    const errText = '❌ Error fetching depth: ' + escapeHtml(err.message);
    if (messageId) {
      await safeEditMessage(errText, chatId, messageId, getMainMenuKeyboard());
    } else {
      await bot.sendMessage(chatId, errText, { reply_markup: getMainMenuKeyboard() });
    }
  }
}

// Callback queries (Interactive buttons)
bot.on('callback_query', async (query) => {
  if (String(query.from.id) !== ADMIN_ID) {
    await bot.answerCallbackQuery(query.id, { text: '⛔ Unauthorized', show_alert: true });
    return;
  }

  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (e) {}

  if (data === 'btn_menu') {
    await safeEditMessage('🎩 <b>ByBit Butler Menu</b>\nChoose an action below:', chatId, messageId, getMainMenuKeyboard());
  } else if (data === 'btn_ads_list') {
    await handleAdsList(chatId, messageId);
  } else if (data === 'btn_status') {
    await handleStatusReport(chatId, messageId);
  } else if (data === 'btn_depth') {
    await handleMarketDepth(chatId, messageId);
  } else if (data === 'btn_pricing_info') {
    await handlePricingReport(chatId, messageId);
  } else if (data === 'btn_brackets_menu') {
    await handleBracketMenu(chatId, messageId);
  } else if (data.startsWith('set_bracket_')) {
    const val = data.replace('set_bracket_', '');
    const amountVal = val === '0' ? null : val;
    updateConfig({ referenceAmount: amountVal });
    
    const displayStr = amountVal ? `${amountVal} DZD` : 'All Volumes';
    try {
      await bot.answerCallbackQuery(query.id, { text: `🎯 Bracket set to ${displayStr}` });
    } catch (e) {}
    
    const cfg = loadConfig();
    if (cfg.autoRepriceEnabled) {
      evaluateAndReprice().catch(console.error);
    }
    await handleBracketMenu(chatId, messageId);
  } else if (data === 'btn_toggle_autoprice') {
    const cfg = loadConfig();
    const newState = !cfg.autoRepriceEnabled;
    updateConfig({ autoRepriceEnabled: newState });
    await bot.answerCallbackQuery(query.id, {
      text: newState ? '🟢 Auto-Reprice ACTIVATED!' : '🔴 Auto-Reprice PAUSED!',
      show_alert: false
    });
    await handlePricingReport(chatId, messageId);
  } else if (data.startsWith('btn_pause_ad_')) {
    const adId = data.replace('btn_pause_ad_', '');
    try {
      await bot.answerCallbackQuery(query.id, { text: 'Pausing ad #' + adId + '...' });
      const res = await Bybit.cancelAd(adId);
      if (res.ret_code === 0 || res.retCode === 0) {
        // If this ad was being auto-repriced, pause auto-reprice
        const cfg = loadConfig();
        if (String(cfg.targetAdId) === String(adId) && cfg.autoRepriceEnabled) {
          updateConfig({ autoRepriceEnabled: false });
        }
        await handleAdsList(chatId, messageId);
      } else {
        await bot.sendMessage(chatId, '❌ Failed to pause ad: ' + (res.ret_msg || res.retMsg));
      }
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error: ' + escapeHtml(err.message));
    }
  } else if (data.startsWith('btn_resume_ad_')) {
    const adId = data.replace('btn_resume_ad_', '');
    try {
      await bot.answerCallbackQuery(query.id, { text: 'Resuming ad #' + adId + '...' });
      const res = await Bybit.relistAd(adId);
      if (res.ret_code === 0 || res.retCode === 0) {
        await handleAdsList(chatId, messageId);
      } else {
        let msg = res.ret_msg || res.retMsg || 'Unknown error';
        if (res.ret_code === 912120024) {
          msg = 'Insufficient Available USDT in your Funding Account. Please transfer USDT into your Bybit Funding Account to activate this ad.';
        }
        await bot.sendMessage(chatId, '❌ <b>Failed to resume ad #' + adId + ':</b>\n' + escapeHtml(msg), { parse_mode: 'HTML' });
      }
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error: ' + escapeHtml(err.message));
    }
  } else if (data.startsWith('btn_select_ad_')) {
    const adId = data.replace('btn_select_ad_', '');
    updateConfig({ targetAdId: String(adId) });
    await bot.answerCallbackQuery(query.id, { text: '🎯 Ad #' + adId + ' is now the target for Auto-Pricing!' });
    await handleAdsList(chatId, messageId);
  } else if (data === 'btn_emergency_stop_all') {
    try {
      await bot.answerCallbackQuery(query.id, { text: '🛑 Taking ALL ads offline...' });
      updateConfig({ autoRepriceEnabled: false });
      const myAdsRes = await Bybit.getMyAds('DZD', 'USDT');
      const ads = myAdsRes.result?.items || [];
      for (const ad of ads) {
        await Bybit.cancelAd(ad.id);
      }
      await bot.sendMessage(chatId, '🛑 <b>EMERGENCY STOP EXECUTED!</b>\n• All active Bybit ads have been taken OFFLINE.\n• Dynamic Auto-Pricing has been PAUSED.', { parse_mode: 'HTML' });
      await handleAdsList(chatId, messageId);
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error during emergency stop: ' + escapeHtml(err.message));
    }
  } else if (data === 'btn_orders') {
    try {
      const ordersRes = await Bybit.getPendingOrders();
      const list = ordersRes.result?.items || ordersRes.result?.orderList || [];
      let text = '📋 <b>ACTIVE PENDING ORDERS (' + list.length + ')</b>\n━━━━━━━━━━━━━━━━━━━━\n';
      if (list.length === 0) {
        text += '<i>No pending orders right now. All clear!</i>\n';
      } else {
        list.forEach(o => {
          text += '🆔 <code>' + escapeHtml(o.orderId) + '</code>\n💰 ' + escapeHtml(o.amount || o.notifyAmount) + ' DZD (' + escapeHtml(o.quantity) + ' USDT)\n👤 Counterparty: ' + escapeHtml(o.targetNickName || o.userId) + '\n\n';
        });
      }
      text += '━━━━━━━━━━━━━━━━━━━━\n<i>Updated at: ' + new Date().toLocaleTimeString() + '</i>';
      await safeEditMessage(text, chatId, messageId, getMainMenuKeyboard());
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error: ' + escapeHtml(err.message));
    }
  } else if (data === 'btn_history') {
    try {
      const historyRes = await Bybit.getOrdersHistory();
      const count = historyRes.result?.count || 0;
      await safeEditMessage('📜 <b>ORDER HISTORY</b>\n━━━━━━━━━━━━━━━━━━━━\nTotal Completed Orders on Bybit: <b>' + count + '</b>\n━━━━━━━━━━━━━━━━━━━━', chatId, messageId, getMainMenuKeyboard());
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Error: ' + escapeHtml(err.message));
    }
  } else if (data.startsWith('confirm_release_')) {
    const orderId = data.replace('confirm_release_', '');
    try {
      await safeEditMessage('⏳ Calling Bybit API to release crypto for order <code>' + escapeHtml(orderId) + '</code>...', chatId, messageId);
      const res = await Bybit.releaseEscrow(orderId);
      if (res.ret_code === 0 || res.retCode === 0) {
        await safeEditMessage('✅ <b>SUCCESS!</b>\nCrypto for Order <code>' + escapeHtml(orderId) + '</code> released to buyer.\nVerified via ByBit Butler.', chatId, messageId, getMainMenuKeyboard());
      } else {
        await safeEditMessage('❌ <b>Release Failed</b>: ' + escapeHtml(res.ret_msg || res.retMsg), chatId, messageId, getMainMenuKeyboard());
      }
    } catch (err) {
      await safeEditMessage('❌ <b>Release Error</b>: ' + escapeHtml(err.message), chatId, messageId, getMainMenuKeyboard());
    }
  }
});

export async function sendAdminAlert(text, replyMarkup = null) {
  try {
    const options = { parse_mode: 'HTML' };
    if (replyMarkup) options.reply_markup = replyMarkup;
    return await bot.sendMessage(ADMIN_ID, text, options);
  } catch (err) {
    console.error('[Telegram Alert Error]', err.message);
  }
}
