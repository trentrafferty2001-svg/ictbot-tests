// src/indicators/ichimoku.js
function ichimoku(candles, tenkan=9, kijun=26, senkou=52) {
  if (candles.length < senkou) return { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, cloudBull: false, priceAboveCloud: false };
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const tenkanHigh = Math.max(...high.slice(-tenkan));
  const tenkanLow = Math.min(...low.slice(-tenkan));
  const tenkanVal = (tenkanHigh + tenkanLow) / 2;
  const kijunHigh = Math.max(...high.slice(-kijun));
  const kijunLow = Math.min(...low.slice(-kijun));
  const kijunVal = (kijunHigh + kijunLow) / 2;
  const senkouAHigh = Math.max(...high.slice(-senkou));
  const senkouALow = Math.min(...low.slice(-senkou));
  const senkouA = (senkouAHigh + senkouALow) / 2;
  const senkouBHigh = Math.max(...high.slice(-senkou/2));
  const senkouBLow = Math.min(...low.slice(-senkou/2));
  const senkouB = (senkouBHigh + senkouBLow) / 2;
  const price = candles[candles.length - 1].close;
  return {
    tenkan: tenkanVal,
    kijun: kijunVal,
    senkouA,
    senkouB,
    cloudBull: senkouA > senkouB,
    priceAboveCloud: price > senkouA && price > senkouB,
    priceBelowCloud: price < senkouA && price < senkouB,
    tenkanAboveKijun: tenkanVal > kijunVal,
    tenkanBelowKijun: tenkanVal < kijunVal
  };
}

module.exports = { ichimoku };
