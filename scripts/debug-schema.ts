// scripts/debug-schema.ts 
import { PrismaClient } from '../prisma/generated/client';

async function debugSchema() {
  console.log('🔍 Debugging GraphQL Schema Build...\n');

  // 1. Check Prisma client
  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('✅ Prisma client connection: OK');
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Prisma client error:', error.message);
    return;
  }

  // 2. Check generated files
  console.log('\n📁 Checking generated files...');
  
  const requiredFiles = [
    '../generated/pothos-types',
    '../generated/autocrud',
    '../generated/objects',
    '../lib/auth',
    '../lib/auth-middleware',
    '../lib/rate-limit',
  ];

  for (const file of requiredFiles) {
    try {
      await import(file);
      console.log(`✅ ${file}: OK`);
    } catch (error) {
      console.log(`❌ ${file}: ${error.message}`);
    }
  }

  // 3. Check auth services
  console.log('\n🔐 Testing auth services...');
  try {
    const { AuthService } = await import('../lib/auth');
    const { AuthMiddleware } = await import('../lib/auth-middleware');
    const prisma = new PrismaClient();
    
    const authService = new AuthService(prisma);
    const authMiddleware = new AuthMiddleware(authService, prisma);
    
    console.log('✅ Auth services: OK');
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Auth services error:', error.message);
  }

  // 4. Test schema builder step by step
  console.log('\n🏗️ Testing schema builder...');
  
  try {
    console.log('   Importing SchemaBuilder...');
    const SchemaBuilder = (await import('@pothos/core')).default;
    
    console.log('   Importing plugins...');
    const PrismaPlugin = (await import('@pothos/plugin-prisma')).default;
    const ScopeAuthPlugin = (await import('@pothos/plugin-scope-auth')).default;
    const ValidationPlugin = (await import('@pothos/plugin-validation')).default;
    
    console.log('   Creating basic builder...');
    const testBuilder = new SchemaBuilder({
      plugins: [PrismaPlugin, ScopeAuthPlugin, ValidationPlugin],
      prisma: {
        client: () => new PrismaClient(),
      },
      authScopes: () => ({ authenticated: false }),
    });
    
    console.log('   Adding base types...');
    testBuilder.queryType({});
    testBuilder.mutationType({});
    
    console.log('   Adding health query...');
    testBuilder.queryField('health', (t) => t.string({ resolve: () => 'OK' }));
    
    console.log('   Building schema...');
    const schema = testBuilder.toSchema();
    
    console.log('✅ Basic schema build: OK');
    
  } catch (error) {
    console.error('❌ Schema builder error:', error.message);
    console.error('Stack:', error.stack);
  }

  // 5. Test full auth builder
  console.log('\n🔐 Testing full auth builder...');
  try {
    const { builder } = await import('../lib/auth-builder');
    console.log('✅ Auth builder import: OK');
    
    const schema = builder.toSchema();
    console.log('✅ Full schema build: OK');
    
  } catch (error) {
    console.error('❌ Full auth builder error:', error.message);
    console.error('Stack:', error.stack);
  }

  // 6. Test autocrud integration
  console.log('\n🤖 Testing autocrud integration...');
  try {
    const { generateAllCrud } = await import('../generated/autocrud');
    console.log('✅ Autocrud import: OK');
    
    // Test basic autocrud call
    generateAllCrud({
      exclude: ['Session'],
      handleResolver: ({ field }) => field,
    });
    
    console.log('✅ Autocrud generation: OK');
    
  } catch (error) {
    console.error('❌ Autocrud error:', error.message);
  }

  console.log('\n🎯 Debug complete!');
}

// Environment check
console.log('🌍 Environment check:');
console.log(`Node version: ${process.version}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'not set'}`);
console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'set' : 'not set'}`);

debugSchema().catch(console.error);