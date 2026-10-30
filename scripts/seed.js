// scripts/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  
  try {
    // Check if bot state exists
    const existing = await prisma.botState.findFirst();
    if (existing) {
      console.log('✅ Bot state already exists, skipping seed');
      return;
    }
    
    // Create initial bot state
    const botState = await prisma.botState.create({
      data: {
        botOff: false,
        paused: false,
        newsBlock: false,
        activeMode: 'normal',
        manualMode: false,
        status: 'idle',
        bal: 10000,
        eq: 10000,
        wins: 0,
        losses: 0,
        consecLosses: 0,
        consecWins: 0,
        dailyPnl: 0,
        monthlyPnl: 0,
        botConfig: {
          symbol: 'XAUUSD',
          currency: 'R',
          risk: 1,
          dd: 5,
          maxT: 1,
          minScore: 7,
          rr: 3,
          session: 'both',
          broker: 'xm',
          mode: 'normal',
        },
        metaData: {
          version: '13.0.0',
          created: new Date().toISOString(),
        },
      },
    });
    
    console.log(`✅ Created bot state: ${botState.id}`);
    console.log('✅ Seeding complete');
  } catch(e) {
    console.error('❌ Seeding failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
