// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Database Service v1.0
//  Uses Prisma ORM for PostgreSQL with connection pooling & retries
// ════════════════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// Create a singleton instance
let prisma = null;

function getPrismaClient() {
  if (!prisma) {
    const logLevels = process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error'] 
      : ['warn', 'error'];
    
    prisma = new PrismaClient({
      log: logLevels.map(level => ({ level, emit: 'event' })),
    });
    
    // Logging middleware
    prisma.$use(async (params, next) => {
      const before = Date.now();
      const result = await next(params);
      const after = Date.now();
      
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Prisma Query: ${params.model}.${params.action} - ${after - before}ms`);
      }
      
      return result;
    });
    
    // Handle connection errors
    prisma.$on('error', (e) => {
      logger.error('Prisma error:', e.message);
    });
    
    // Graceful shutdown
    process.on('beforeExit', async () => {
      if (prisma) {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
      }
    });
  }
  
  return prisma;
}

// Helper functions for common operations
const db = {
  // Get the client
  get client() {
    return getPrismaClient();
  },
  
  // Bot State operations
  async getBotState() {
    const result = await this.client.botState.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    return result;
  },
  
  async updateBotState(data) {
    const current = await this.getBotState();
    if (current) {
      return this.client.botState.update({
        where: { id: current.id },
        data: data,
      });
    } else {
      return this.client.botState.create({
        data: data,
      });
    }
  },
  
  // Trade operations
  async createTrade(data) {
    return this.client.trade.create({
      data: data,
    });
  },
  
  async updateTrade(positionId, data) {
    return this.client.trade.update({
      where: { positionId: positionId },
      data: data,
    });
  },
  
  async getTrade(positionId) {
    return this.client.trade.findUnique({
      where: { positionId: positionId },
    });
  },
  
  async getTrades(filter = {}, limit = 100) {
    return this.client.trade.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
  
  // Signal operations
  async createSignal(data) {
    return this.client.signal.create({
      data: data,
    });
  },
  
  async getSignals(filter = {}, limit = 50) {
    return this.client.signal.findMany({
      where: filter,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },
  
  // Performance operations
  async createPerformanceLog(data) {
    return this.client.performanceLog.create({
      data: data,
    });
  },
  
  async getPerformanceLogs(period, limit = 30) {
    return this.client.performanceLog.findMany({
      where: { period: period },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },
  
  // Zone Memory operations
  async upsertZone(type, key, data) {
    const existing = await this.client.zoneMemory.findUnique({
      where: { type_key: { type, key } },
    });
    
    if (existing) {
      return this.client.zoneMemory.update({
        where: { id: existing.id },
        data: {
          ...data,
          visits: existing.visits + 1,
          lastVisit: new Date(),
        },
      });
    } else {
      return this.client.zoneMemory.create({
        data: {
          type,
          key,
          ...data,
          visits: 1,
        },
      });
    }
  },
  
  async getZones(type, limit = 100) {
    return this.client.zoneMemory.findMany({
      where: { type },
      orderBy: { lastVisit: 'desc' },
      take: limit,
    });
  },
  
  // AB Testing
  async getABTest(version) {
    return this.client.aBTest.findUnique({
      where: { version },
    });
  },
  
  async updateABTest(version, data) {
    return this.client.aBTest.upsert({
      where: { version },
      update: data,
      create: { version, ...data },
    });
  },
  
  // Subscription management
  async getSubscriptions() {
    return this.client.subscription.findMany({
      where: { isActive: true },
    });
  },
  
  async addSubscription(chatId, name = null) {
    return this.client.subscription.upsert({
      where: { chatId },
      update: { isActive: true, name },
      create: { chatId, name },
    });
  },
  
  async removeSubscription(chatId) {
    return this.client.subscription.update({
      where: { chatId },
      data: { isActive: false },
    });
  },
};

module.exports = db;
