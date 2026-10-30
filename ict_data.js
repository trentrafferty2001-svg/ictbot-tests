// ICT Gold Bot Pro — Market Data
window.ICT_DATA = {
  "version": "4.0",
  "description": "ICT Gold Bot Pro - Extended Market Data & Patterns",
  "goldCorrelations": {
    "DXY": "Inverse - Dollar up = Gold down",
    "US10Y": "Inverse - Yields up = Gold down",
    "SPX": "Mixed - Risk-off favors Gold",
    "VIX": "Positive in extreme fear",
    "USDZAR": "ZAR weakens when Gold falls (SA mining exposure)"
  },
  "keyLevels2024_2025": {
    "majorSupport": [
      2000,
      2050,
      2100,
      2150,
      2200,
      2250,
      2280,
      2300
    ],
    "majorResistance": [
      2350,
      2400,
      2430,
      2450,
      2500,
      2550,
      2600,
      2650,
      2700,
      2750,
      2800
    ]
  },
  "ictTimeframes": {
    "macro": "Monthly/Weekly - Overall bias",
    "swing": "Daily/H4 - HTF bias for bot",
    "entry": "H1 - Bot analysis timeframe",
    "trigger": "M15/M5 - Entry confirmation (future enhancement)"
  },
  "sessionStatistics": {
    "london": {
      "avgRange": "8-15 USD",
      "winRate": "68%",
      "bestDay": "Tuesday/Wednesday"
    },
    "newYork": {
      "avgRange": "10-20 USD",
      "winRate": "65%",
      "bestDay": "Tuesday/Thursday"
    },
    "asian": {
      "avgRange": "3-8 USD",
      "winRate": "45%",
      "note": "Low probability session"
    }
  },
  "riskParameters": {
    "aggressive": {
      "risk": "0.5%",
      "rr": "1.5:1",
      "duration": "1-15min",
      "frequency": "High"
    },
    "normal": {
      "risk": "1.0%",
      "rr": "3.0:1",
      "duration": "10min-4hr",
      "frequency": "Medium"
    },
    "sniper": {
      "risk": "1.5%",
      "rr": "5.0:1",
      "duration": "1-5days",
      "frequency": "Low"
    }
  }
};

// ── Extended ICT Pattern Library ──
window.ICT_PATTERNS = [
  {"id":"FVG_BULLISH","desc":"3-candle bullish imbalance","dir":"buy","prob":"High","confluence":["bullish MSS", "discount zone", "London session"]},
  {"id":"FVG_BEARISH","desc":"3-candle bearish imbalance","dir":"sell","prob":"High","confluence":["bearish MSS", "premium zone", "NY session"]},
  {"id":"OB_BULLISH","desc":"Last bearish candle before bullish expansion","dir":"buy","prob":"Very High","confluence":["displacement", "liquidity sweep below", "kill zone"]},
  {"id":"OB_BEARISH","desc":"Last bullish candle before bearish expansion","dir":"sell","prob":"Very High","confluence":["displacement", "liquidity sweep above", "kill zone"]},
  {"id":"BOS_BULLISH","desc":"Break above recent swing high","dir":"buy","prob":"Medium","confluence":["trend continuation", "HTF bullish"]},
  {"id":"BOS_BEARISH","desc":"Break below recent swing low","dir":"sell","prob":"Medium","confluence":["trend continuation", "HTF bearish"]},
  {"id":"CHOCH_BULL","desc":"First break above swing high in downtrend","dir":"buy","prob":"High","confluence":["reversal signal", "liquidity swept", "strong close"]},
  {"id":"CHOCH_BEAR","desc":"First break below swing low in uptrend","dir":"sell","prob":"High","confluence":["reversal signal", "liquidity swept", "strong close"]},
  {"id":"LIQ_SWEEP_BUY","desc":"Wick below swing low, closes above","dir":"buy","prob":"Very High","confluence":["smart money trap", "stop hunt complete", "immediate reversal"]},
  {"id":"LIQ_SWEEP_SELL","desc":"Wick above swing high, closes below","dir":"sell","prob":"Very High","confluence":["smart money trap", "stop hunt complete", "immediate reversal"]},
  {"id":"OTE_BULL","desc":"61.8-79% retracement in uptrend","dir":"buy","prob":"High","confluence":["fibonacci zone", "discount", "bullish bias"]},
  {"id":"OTE_BEAR","desc":"61.8-79% retracement in downtrend","dir":"sell","prob":"High","confluence":["fibonacci zone", "premium", "bearish bias"]},
  {"id":"JUDAS_BULL","desc":"False drop at session open, reversal up","dir":"buy","prob":"High","confluence":["London open", "Asian low swept", "CHoCH up"]},
  {"id":"JUDAS_BEAR","desc":"False rally at session open, reversal down","dir":"sell","prob":"High","confluence":["London open", "Asian high swept", "CHoCH down"]},
  {"id":"AMD_BUY","desc":"Accumulation → Manipulation down → Distribution up","dir":"buy","prob":"Very High","confluence":["Asian range set", "London sweeps low", "NY distribution up"]},
  {"id":"AMD_SELL","desc":"Accumulation → Manipulation up → Distribution down","dir":"sell","prob":"Very High","confluence":["Asian range set", "London sweeps high", "NY distribution down"]},
];

// ── Pip Value Tables for Position Sizing ──
window.PIP_VALUES = {
  "GOLD": {"pointValue": 10, "minLot": 0.01, "maxLot": 50, "pipSize": 0.1, "currency": "USD"},
  "XAUUSD": {"pointValue": 10, "minLot": 0.01, "maxLot": 50, "pipSize": 0.1, "currency": "USD"},
  "GBPUSD": {"pointValue": 10, "minLot": 0.01, "maxLot": 100, "pipSize": 0.0001, "currency": "USD"},
  "USDZAR": {"pointValue": 1, "minLot": 0.01, "maxLot": 100, "pipSize": 0.0001, "currency": "ZAR"},
  "GBPZAR": {"pointValue": 1, "minLot": 0.01, "maxLot": 100, "pipSize": 0.0001, "currency": "ZAR"}
};

// ── Trade Journal Template ──
window.JOURNAL_TEMPLATE = {
  fields: ["date","symbol","direction","entryPrice","stopLoss","takeProfit","lotSize","confluenceScore","mode","fvgPresent","obPresent","mssType","killZone","htfBias","ote","premiumDiscount","outcome","pnl","notes","grade"],
  grades: {"A":"Perfect setup, executed flawlessly","B":"Good setup, minor execution issues","C":"Mediocre setup, took a risk","D":"Poor setup, should not have traded","F":"Violated trading rules"}
};

// ── ICT Knowledge Quiz ──
window.ICT_QUIZ = [
  {"q":"What is an FVG?","a":["A gap in price between candle 1 high and candle 3 low", "A moving average crossover", "A volume indicator", "A Fibonacci level"],"correct":0},
  {"q":"Where should you BUY in ICT?","a":["In the premium zone", "In the discount zone (below 50%)", "At random", "At round numbers only"],"correct":1},
  {"q":"What is a Judas Swing?","a":["A reliable trend signal", "A false move to hunt stop losses before reversing", "An order block pattern", "A kill zone"],"correct":1},
  {"q":"The OTE zone is at which Fibonacci levels?","a":["38.2% to 50%", "50% to 61.8%", "61.8% to 79%", "79% to 88.6%"],"correct":2},
  {"q":"What does CHoCH stand for?","a":["Change of Channel", "Change of Character", "Chart of Changes", "Candle High or Close"],"correct":1},
  {"q":"When is the highest probability kill zone for GOLD?","a":["Asian session", "London Open", "US Close", "Sunday open"],"correct":1},
  {"q":"What does liquidity sweep mean?","a":["Volume spike", "Price wicks through a swing level then closes back", "A large order placed", "Moving average crossover"],"correct":1},
  {"q":"DXY and Gold have what relationship?","a":["Positive correlation", "No correlation", "Inverse correlation", "They are the same asset"],"correct":2},
];
