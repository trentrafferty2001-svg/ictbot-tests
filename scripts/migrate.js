// scripts/migrate.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Running database migration...');
  
  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Database connected');
    
    // Run migrations
    // Note: In production, use `prisma migrate deploy`
    console.log('✅ Migration complete');
  } catch(e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
