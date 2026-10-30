// ════════════════════════════════════════════════════════════════════════════
//  Worker Thread for Heavy Indicator Calculations
//  Uses shared indicator library
// ════════════════════════════════════════════════════════════════════════════

const { parentPort } = require('worker_threads');
const indicators = require('./index');

parentPort.on('message', (data) => {
  const { type, candles, params, id } = data;
  let result;
  
  try {
    if (type === 'ping') {
      parentPort.postMessage({ id, type: 'pong' });
      return;
    }
    
    switch (type) {
      case 'calcATR14':
        result = indicators.calcATR14(candles);
        break;
        
      case 'calcADX':
        result = indicators.calcADX(candles, params?.period || 14);
        break;
        
      case 'detectSwings':
        result = indicators.detectSwings(candles);
        break;
        
      case 'detectFVG':
        result = indicators.detectFVG(candles, params?.curP);
        break;
        
      case 'detectOB':
        result = indicators.detectOB(candles, params?.curP);
        break;
        
      case 'detectMSS': {
        const swings = params?.swings || indicators.detectSwings(candles);
        result = indicators.detectMSS(candles, swings, params?.curP);
        break;
      }
        
      case 'detectLiqSweep': {
        const liqSwings = params?.swings || indicators.detectSwings(candles);
        result = indicators.detectLiqSweep(candles, liqSwings);
        break;
      }
        
      case 'getCandleCharacter': {
        const atr = params?.atr || indicators.calcATR14(candles);
        result = indicators.getCandleCharacter(candles, atr);
        break;
      }
        
      case 'runFullAnalysis': {
        const fullSwings = indicators.detectSwings(candles);
        const fullAtr = indicators.calcATR14(candles);
        result = {
          atr: fullAtr,
          adx: indicators.calcADX(candles),
          swings: fullSwings,
          fvgs: indicators.detectFVG(candles, params?.curP, fullAtr),
          obs: indicators.detectOB(candles, params?.curP, fullAtr),
          mss: indicators.detectMSS(candles, fullSwings, params?.curP, fullAtr),
          liq: indicators.detectLiqSweep(candles, fullSwings),
          candleChar: indicators.getCandleCharacter(candles, fullAtr),
          bias: indicators.calcHTFBias(candles),
        };
        break;
      }
        
      default:
        result = { error: 'Unknown analysis type: ' + type };
    }
  } catch (e) {
    result = { error: e.message, stack: e.stack };
  }
  
  parentPort.postMessage({ id, type, result });
});
