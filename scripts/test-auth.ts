// scripts/test-auth.ts - Comprehensive auth testing
import { PrismaClient } from '../prisma/generated/client';
import { AuthService } from '../lib/auth';
import { AuthMiddleware } from '../lib/auth-middleware';

async function testAuth() {
  console.log('🧪 Testing Authentication System...\n');

  const prisma = new PrismaClient();
  const authService = new AuthService(prisma);
  const authMiddleware = new AuthMiddleware(authService, prisma);

  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Test 1: User Registration
    console.log('\n1️⃣ Testing User Registration...');
    try {
      const registerData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Organization',
      };

      const registerResult = await authService.register(registerData);
      console.log('✅ Registration successful:', {
        userId: registerResult.user.id,
        orgId: registerResult.organization?.id,
      });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ User already exists (expected in repeated tests)');
      } else {
        console.error('❌ Registration failed:', error.message);
      }
    }

    // Test 2: Login
    console.log('\n2️⃣ Testing Login...');
    try {
      const loginResult = await authService.login(
        'test@example.com',
        'TestPassword123!',
        '127.0.0.1',
        'test-agent'
      );
      
      console.log('✅ Login successful:', {
        userId: loginResult.user.id,
        hasAccessToken: !!loginResult.accessToken,
        hasRefreshToken: !!loginResult.refreshToken,
      });

      // Test 3: Token Verification
      console.log('\n3️⃣ Testing Token Verification...');
      const verifiedUser = authService.verifyAccessToken(loginResult.accessToken);
      if (verifiedUser) {
        console.log('✅ Token verification successful:', {
          userId: verifiedUser.id,
          email: verifiedUser.email,
        });
      } else {
        console.error('❌ Token verification failed');
      }

      // Test 4: Auth Middleware
      console.log('\n4️⃣ Testing Auth Middleware...');
      const authContext = await authMiddleware.authenticate(
        `Bearer ${loginResult.accessToken}`,
        undefined,
        { required: true }
      );
      
      console.log('✅ Auth middleware successful:', {
        hasUser: !!authContext.user,
        hasOrganization: !!authContext.organization,
        userEmail: authContext.user?.email,
        orgName: authContext.organization?.name,
      });

    } catch (error: any) {
      console.error('❌ Login/Auth test failed:', error.message);
    }

    // Test 5: Permission Checks
    console.log('\n5️⃣ Testing Permission System...');
    try {
      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
        include: {
          organizationUsers: {
            include: { organization: true }
          }
        }
      });

      if (user && user.organizationUsers.length > 0) {
        const orgUser = user.organizationUsers[0];
        console.log('✅ User permissions:', {
          role: orgUser.role,
          permissions: orgUser.permissions,
          organizationName: orgUser.organization.name,
        });
      }
    } catch (error: any) {
      console.error('❌ Permission check failed:', error.message);
    }

  } catch (error: any) {
    console.error('❌ Auth test suite failed:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('\n🎯 Auth testing complete!');
  }
}

testAuth().catch(console.error);