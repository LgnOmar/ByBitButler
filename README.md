# ByBitButler

ByBitButler is a Telegram bot and background tool for Bybit P2P merchants trading on the USDT / DZD pair. It connects directly to Bybit's API to send you order notifications on Telegram, let you release crypto after checking payment, and automatically keep your ad price competitive with other sellers.

It is written in Node.js and has no browser dependencies (no Chromium, Playwright, or Puppeteer), so it uses very little memory and can run 24/7 on a small VPS.

---

## What It Does

- **Order notifications:** Sends a Telegram message when a buyer places an order, showing their username, amount, price, and payment method.
- **Payment alerts:** Sends an alert when the buyer marks the order as paid, reminding you to check your banking app (like BaridiMob).
- **One-tap release:** Lets you release the crypto directly from Telegram once you have confirmed the payment in your account.
- **Auto-repricing:** Automatically checks competitor prices and undercuts the lowest seller by a set buffer (e.g. 0.01 DZD), while respecting your minimum floor price so you never sell at a loss.
- **Ticket size filter:** Lets you select your order size bracket (500, 1,000, 2,000, 5,000, 10,000, 20,000 DZD or any custom amount) so you price against competitors in your actual trade range.
- **Standby guard:** Automatically pauses repricing and stops sending alerts if your ad is offline, paused, or hidden because of low balance. Resumes automatically as soon as your ad goes online.
- **Private access:** Only responds to your personal Telegram user ID. Any messages or button clicks from other users are ignored.
- **Simple file log:** Writes all events and errors with timestamps into `butler.log` for easy checking.

---

## Prerequisites

- Node.js (version 18 or higher)
- A Bybit account with P2P advertiser access
- A Bybit API key with `Read`, `Trade`, and `Escrow release` permissions
- A Telegram bot token (from [@BotFather](https://t.me/botfather))
- Your personal Telegram user ID (from [@userinfobot](https://t.me/userinfobot))

---

## Quick Setup (Local or VPS)

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/<your-username>/ByBitButler.git
cd ByBitButler
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```ini
BYBIT_API_KEY=your_bybit_api_key
BYBIT_API_SECRET=your_bybit_api_secret
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_numeric_telegram_id
```

### 3. Check your settings

Open `config.json` and adjust your preferences:

```json
{
  "autoRepriceEnabled": false,
  "targetAdId": "2113267925914439680",
  "minFloorPrice": 255.00,
  "undercutBuffer": 0.01,
  "referenceAmount": "2000",
  "refreshIntervalMs": 10000
}
```

### 4. Test the API connection

Before running the full bot, test that your Bybit keys and IP whitelist work:

```bash
npm run test:bybit
```

If successful, this will print your public IP address and the ads found on your Bybit account.

### 5. Start the bot

```bash
npm start
```

---

## Running on a VPS (Recommended for 24/7 Uptime)

Running on a Linux VPS ensures your bot stays online even when your computer is off. We recommend using `pm2` to manage the process and restart it if it crashes.

### Install PM2

```bash
sudo npm install pm2 -g
```

### Start the bot with PM2

```bash
pm2 start src/index.js --name "bybit-butler"
```

### Useful PM2 commands

```bash
# Check if the bot is running
pm2 list

# View live logs
pm2 logs bybit-butler

# View the last 100 lines of logs
pm2 logs bybit-butler --lines 100

# Stop the bot
pm2 stop bybit-butler

# Restart the bot
pm2 restart bybit-butler

# Make PM2 restart automatically after a server reboot
pm2 startup
pm2 save
```

---

## Settings Explained

### In `.env`

- `BYBIT_API_KEY`: Your Bybit API key.
- `BYBIT_API_SECRET`: Your Bybit API secret.
- `TELEGRAM_BOT_TOKEN`: The token given by BotFather when creating your bot.
- `TELEGRAM_ADMIN_CHAT_ID`: Your personal Telegram ID. The bot will only accept commands from this ID.

### In `config.json`

- `autoRepriceEnabled`: Set to `true` to turn on auto-pricing, or `false` to keep it paused. You can also toggle this inside Telegram with `/autoprice on` or `/autoprice off`.
- `targetAdId`: The ID of the ad on Bybit you want the bot to manage and reprice.
- `minFloorPrice`: The lowest price (in DZD) you are willing to sell for. The bot will never set a price below this number, even if competitors go lower.
- `undercutBuffer`: How much to undercut the lowest competitor by (default is `0.01` DZD).
- `referenceAmount`: The ticket size (in DZD) used to filter competitor depth. For example, `2000` will look at competitor ads that accept 2,000 DZD orders. Set to `0` or `null` to look at all ads regardless of limits.
- `refreshIntervalMs`: How often (in milliseconds) the bot checks competitor prices. Default is `10000` (10 seconds).

---

## Telegram Bot Commands

You can send these commands directly to your bot in Telegram:

| Command | What it does |
| :--- | :--- |
| `/start` or `/menu` | Opens the main menu with interactive control buttons. |
| `/ads` | Shows your personal Bybit ads with buttons to pause, resume, or select an ad for auto-pricing. |
| `/depth` | Shows the top competitor sell ads on Bybit for your active ticket bracket. |
| `/pricing` | Shows current auto-pricing settings, active bracket, and the last action taken. |
| `/autoprice on` | Turns on dynamic auto-pricing. |
| `/autoprice off` | Pauses auto-pricing. |
| `/setfloor <price>` | Sets a new minimum floor price (e.g. `/setfloor 256.00`). |
| `/setamount <amount>` | Sets a new ticket bracket (e.g. `/setamount 5000` or `/setamount 0` for all volumes). |
| `/setprice <price>` | Manually sets a new price on your target ad immediately. |
| `/ping` | Tests bot latency and confirms the connection is active. |

---

## How to Update the Bot

When you push new changes to GitHub, update your VPS like this:

```bash
cd ByBitButler
git pull
pm2 restart bybit-butler
```

---

## Troubleshooting & Common Notes

### 1. `10010: Unmatched IP`
Bybit requires API keys to be bound to your server's IP address.
- Look at the console on startup; the bot will print your server's public IP: `📡 HOST PUBLIC OUTBOUND IP: x.x.x.x`.
- Go to Bybit API Management, edit your API key, and add that IP address to the whitelist.

### 2. `10006: Too many visits / Exceeded API Rate Limit`
Bybit limits how many requests you can send per second.
- The bot is configured with safe intervals (8 seconds for orders, 10 seconds for repricing).
- If Bybit returns rate limit warnings, wait 15–30 seconds before tapping buttons repeatedly in Telegram.

### 3. `912120024: Insufficient Available Balance in Funding Account`
When activating an ad or updating prices, Bybit checks that your Funding Account has enough USDT to cover the ad.
- If your balance is lower than the ad's minimum, Bybit automatically marks the ad as hidden (`showStatus: "HIDDEN"`).
- The bot detects this and enters **Standby Mode**, saving API calls and sending zero alert spam. Once you transfer USDT into your Funding Account, repricing resumes automatically.

### 4. Viewing Logs
All logs are saved to `butler.log` in the project root:

```bash
# View the last 50 lines of logs
tail -n 50 butler.log

# Follow logs in real time
tail -f butler.log
```

---

## License

This project is personal software provided as-is. Always test your settings with small amounts first before running unattended.
