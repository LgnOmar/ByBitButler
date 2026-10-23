import { Bybit } from './bybitClient.js';

async function checkAds() {
  const res = await Bybit.getMyAds('DZD', 'USDT');
  console.log('Total ads returned:', res.result?.items?.length);
  res.result?.items?.forEach((ad, i) => {
    console.log(`\n--- Ad #${i + 1} ---`);
    console.log(JSON.stringify(ad, null, 2));
  });
}

checkAds();
