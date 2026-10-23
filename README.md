# ByBitButler 🎩

Desk-free mobile Bybit P2P command desk via Telegram Bot.

## Features
- **Zero Browser Footprint**: Pure Bybit V5 REST & Telegram Bot (<15MB RAM).
- **Instant Push Alerts**: Buzzes your phone the second a buyer places an order.
- **Payment Verification**: Alerts you when buyer marks as paid.
- **1-Tap Escrow Release**: Release crypto with one button directly from Telegram after checking BaridiMob.
- **Live Orderbook Depth**: Inspect real-time DZD buy/sell rates anytime via `/depth`.
- **Private & Whitelisted**: Rejects any user other than your private Telegram ID.

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Test Bybit API connection:
```bash
npm run test:bybit
```

3. Start Butler daemon:
```bash
npm start
```
