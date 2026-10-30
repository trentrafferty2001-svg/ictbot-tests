// ICT Gold Bot Pro — Extended Knowledge Base & Chart Engine
// Comprehensive ICT trading data, patterns, and visual components

window.ICT_EXTENDED = {

  // ── Full ICT Glossary ──────────────────────────────────────────────────────
  glossary: {
    "AMD": "Accumulation, Manipulation, Distribution — the 3-phase model of how smart money moves price",
    "BOS": "Break of Structure — price breaks the most recent swing high/low in the direction of trend",
    "BSL": "Buy-Side Liquidity — stop losses sitting above swing highs, targeted by smart money",
    "CB": "Consequent Encroachment — the 50% midpoint of a Fair Value Gap",
    "CHoCH": "Change of Character — first sign of trend reversal when structure breaks opposite to trend",
    "CISD": "Change in State of Delivery — candle that signals shift from bullish to bearish delivery or vice versa",
    "DD": "Discount/Premium — below/above the equilibrium (50%) of a price range",
    "EQH": "Equal Highs — two or more swing highs at the same price level, containing SSL above",
    "EQL": "Equal Lows — two or more swing lows at the same price level, containing BSL below",
    "FVG": "Fair Value Gap — imbalance between candle 1 high and candle 3 low (or reverse)",
    "HTF": "Higher Time Frame — the broader context chart used for bias",
    "IFVG": "Inverse Fair Value Gap — a mitigated FVG that now acts as opposite support/resistance",
    "IPDA": "Interbank Price Delivery Algorithm — the underlying mechanism driving price to liquidity",
    "IOFED": "Institutional Order Flow Entry Drill — multi-timeframe entry technique",
    "LTF": "Lower Time Frame — the entry timeframe chart",
    "LRLR": "Lower Risk, Lower Reward — aggressive scalp entries",
    "MSB": "Market Structure Break — same as BOS",
    "MSS": "Market Structure Shift — generic term for BOS or CHoCH",
    "NWG": "No Wick Gap — FVG with no overlapping wicks, strongest type",
    "OB": "Order Block — the last opposing candle before a significant expansion move",
    "OTE": "Optimal Trade Entry — the 61.8% to 79% retracement zone of a swing",
    "POI": "Point of Interest — any key level where price may react",
    "PD": "Premium/Discount — the zone above/below 50% of a price range",
    "RTO": "Return to Origin — when price returns to the FVG or OB that caused the move",
    "SMC": "Smart Money Concepts — collective term for ICT-derived trading methodology",
    "SMT": "Smart Money Tool — divergence between correlated pairs used to confirm entries",
    "SSL": "Sell-Side Liquidity — stop losses sitting below swing lows, targeted by smart money",
    "SSMT": "Seek and Seed Market Turn — the sequence of liquidity sweep followed by reversal",
    "TP": "Take Profit — the target price level",
    "VWAP": "Volume Weighted Average Price — institutional benchmark price",
    "WWMT": "Where We May Trade — the anticipated price delivery area"
  },

  // ── Gold-specific ICT rules ────────────────────────────────────────────────
  goldRules: [
    "Gold is most liquid during London Open (09:00-12:00 SAST) and NY Open (14:00-17:00 SAST)",
    "The Asian session (23:00-02:00 UTC) typically forms the high or low of the day for Gold",
    "London often manipulates the Asian high or low before the true directional move",
    "Gold respects 50-pip (5.00 point) round numbers as psychological levels",
    "DXY (Dollar Index) has an INVERSE correlation with Gold — Dollar up = Gold down",
    "US Treasury yields also have inverse correlation with Gold",
    "NFP (Non-Farm Payrolls, first Friday of month) and FOMC meetings cause extreme volatility — avoid trading 30min before/after",
    "Gold 1-hour FVGs have a 70%+ fill rate within 24 hours",
    "The strongest Gold setups occur when FVG + OB + Kill Zone all align at the same level",
    "Gold ADR (Average Daily Range) is typically 15-25 USD. Use this to set realistic TP targets",
    "When Gold breaks a key daily level, it usually runs to the next significant swing high/low",
    "Avoid trading Gold on US bank holidays — liquidity is thin and moves are unreliable"
  ],

  // ── Session times in UTC ───────────────────────────────────────────────────
  sessions: {
    sydney:    {open:22, close:7,  color:"#4fc3f7", label:"Sydney"},
    tokyo:     {open:23, close:8,  color:"#ce93d8", label:"Tokyo/Asian"},
    london:    {open:7,  close:16, color:"#a5d6a7", label:"London"},
    newYork:   {open:12, close:21, color:"#ffcc02", label:"New York"},
    londonOpen:{open:7,  close:10, color:"#00e676", label:"London KZ"},
    nyOpen:    {open:12, close:15, color:"#f0b90b", label:"NY KZ"},
    londonClose:{open:14,close:16, color:"#ff7043", label:"London Close KZ"}
  },

  // ── Key Fibonacci levels used in ICT ──────────────────────────────────────
  fibLevels: [
    {level:0.0,   label:"Swing High/Low",   color:"#ffffff", key:true},
    {level:0.236, label:"23.6%",            color:"#4fc3f7", key:false},
    {level:0.382, label:"38.2%",            color:"#ce93d8", key:false},
    {level:0.5,   label:"50% Equilibrium",  color:"#f0b90b", key:true},
    {level:0.618, label:"61.8% OTE Start",  color:"#00e676", key:true},
    {level:0.705, label:"70.5% OTE Mid",    color:"#00e676", key:false},
    {level:0.79,  label:"79% OTE End",      color:"#00e676", key:true},
    {level:0.886, label:"88.6%",            color:"#ff7043", key:false},
    {level:1.0,   label:"Swing Low/High",   color:"#ffffff", key:true},
    {level:1.272, label:"127.2% Extension", color:"#4fc3f7", key:false},
    {level:1.618, label:"161.8% Extension", color:"#f0b90b", key:true}
  ],

  // ── ICT Trade Setup Checklist ─────────────────────────────────────────────
  setupChecklist: {
    minimum: [
      "HTF Bias identified (bullish or bearish)",
      "Kill Zone active (London or NY session)",
      "Market Structure Shift confirmed (BOS or CHoCH)",
      "FVG or Order Block present at entry level",
      "Risk:Reward minimum 1:2"
    ],
    optimal: [
      "All minimum criteria met",
      "Price in correct zone (discount for longs, premium for shorts)",
      "Liquidity swept before entry",
      "OTE zone confluence (61.8-79% retracement)",
      "Multiple timeframe FVG/OB alignment",
      "Clean displacement candle present",
      "Risk:Reward minimum 1:3"
    ]
  },

  // ── Common ICT Patterns ───────────────────────────────────────────────────
  patterns: {
    "Judas Swing": {
      description: "A false move at the start of a session to hunt stop losses before reversing",
      howToTrade:  "Wait for the false break, then enter in the opposite direction when structure shifts. Best during London Open.",
      example:     "London opens bullish, sweeps Asian high, then reverses bearish for the session"
    },
    "Silver Bullet": {
      description: "A specific ICT entry model using FVGs during the 10:00-11:00 NY time window (16:00-17:00 SAST)",
      howToTrade:  "Look for a displacement leaving an FVG during the 10-11 AM NY window, enter on return to FVG",
      example:     "Price drops sharply at 10:05 AM NY creating a bearish FVG, enters short on return"
    },
    "Midnight Open": {
      description: "The price at midnight New York time (02:00 SAST) is a significant reference point",
      howToTrade:  "Price often uses the midnight open as a magnet. If price is below midnight open = bearish. Above = bullish.",
      example:     "GOLD midnight open at 2285.00. Price rallies to 2290, rejects = short opportunity"
    },
    "New Week Opening Gap": {
      description: "The gap between Friday close and Sunday/Monday open. Price often fills this gap.",
      howToTrade:  "If price gaps up on Monday open, watch for fill of the gap before continuing up",
      example:     "Friday close 2290, Monday open 2295. Gap = 5 points, likely to be filled early Monday"
    },
    "Power of 3 (AMD)": {
      description: "Accumulation (Asian) → Manipulation (false break) → Distribution (true move)",
      howToTrade:  "Identify Asian range. Watch for manipulation break at London open. Enter when manipulation confirmed. Target ADR extension.",
      example:     "Asian range: 2280-2290. London breaks below to 2277 (manipulation). Reverse to 2295+ (distribution)"
    }
  },

  // ── Risk Management Rules ─────────────────────────────────────────────────
  riskRules: [
    "Never risk more than 1-2% of account per trade",
    "Stop trading when daily drawdown reaches 5% — protect the week",
    "Minimum 1:2 RR before taking any trade. Prefer 1:3+",
    "Never move stop loss to breakeven too early — give trade room",
    "Scale out at 1:1 if risk tolerance is low, let runner go to full TP",
    "Never average down into a losing trade",
    "If 3 consecutive losses, stop trading for the day and review",
    "Journal every trade — entry reason, outcome, lessons learned",
    "Only trade your highest-conviction setups — quality over quantity",
    "Respect your trading plan — emotions are your biggest enemy"
  ]
};

// ── Lightweight Canvas Chart Engine ───────────────────────────────────────────
window.drawMiniChart = function(canvasId, candles, signals) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !candles || candles.length < 2) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  var last = candles.slice(-40);
  var highs = last.map(c=>c.high), lows = last.map(c=>c.low);
  var maxP = Math.max.apply(null,highs), minP = Math.min.apply(null,lows);
  var range = maxP - minP || 1;
  var pad = 10, cW = (W-pad*2)/last.length;

  function px(price) { return H-pad - ((price-minP)/range)*(H-pad*2); }
  function cx(i)     { return pad + i*cW + cW/2; }

  // Background
  ctx.fillStyle='#0f0f0f'; ctx.fillRect(0,0,W,H);

  // Grid lines
  ctx.strokeStyle='#1e1e1e'; ctx.lineWidth=1;
  for(var g=0;g<5;g++){
    var y=pad+(H-pad*2)*g/4;
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
  }

  // Candles
  last.forEach(function(c,i){
    var isBull = c.close >= c.open;
    var color  = isBull ? '#00e676' : '#ff3d57';
    var oY=px(c.open), cY=px(c.close), hY=px(c.high), lY=px(c.low);
    var x=cx(i), bW=Math.max(2,cW*0.6);

    ctx.strokeStyle=color; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,hY); ctx.lineTo(x,lY); ctx.stroke();

    ctx.fillStyle=color;
    var bodyTop=Math.min(oY,cY), bodyH=Math.max(1,Math.abs(cY-oY));
    ctx.fillRect(x-bW/2, bodyTop, bW, bodyH);
  });

  // Signal markers
  if(signals){
    signals.forEach(function(s){
      var i=last.length-1;
      ctx.fillStyle = s.dir==='buy'?'#00e676':'#ff3d57';
      ctx.font='bold 12px sans-serif';
      ctx.textAlign='center';
      ctx.fillText(s.dir==='buy'?'▲':'▼', cx(i), s.dir==='buy'?H-2:10);
    });
  }
};
