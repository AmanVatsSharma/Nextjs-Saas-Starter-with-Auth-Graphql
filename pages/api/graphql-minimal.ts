// pages/api/graphql-minimal.ts - Minimal working version without autocrud
import { createYoga } from 'graphql-yoga';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthService } from '../../lib/auth';
import { AuthMiddleware, AuthError } from '../../lib/auth-middleware';
import { builder } from '../../lib/auth-builder';

// Initialize services
const prisma = new PrismaClient();
const authService = new AuthService(prisma);
const authMiddleware = new AuthMiddleware(authService, prisma);

// Build schema immediately without autocrud
let schema;
try {
  schema = builder.toSchema();
  console.log('✅ Minimal schema built successfully');
} catch (error) {
  console.error('❌ Failed to build minimal schema:', error);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default createYoga({
  schema,
  
  context: async ({ request }) => {
    try {
      const authorization = request.headers.get('authorization');
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      
      let authContext = {
        user: null,
        organization: null,
        session: null,
      };
      
      try {
        authContext = await authMiddleware.authenticate(
          authorization || undefined,
          undefined,
          { required: false }
        );
      } catch (error) {
        if (error instanceof AuthError) {
          console.warn('Auth failed:', error.message);
        }
      }
      
      return {
        prisma,
        authService,
        authMiddleware,
        ipAddress,
        userAgent,
        ...authContext,
      };
      
    } catch (error) {
      console.error('Context error:', error);
      throw error;
    }
  },
  
  graphqlEndpoint: '/api/graphql-minimal',
  
  graphiql: {
    title: 'Minimal SaaS API',
    defaultQuery: `
# Minimal API Test

query Health {
  health
}

mutation Register {
  register(
    email: "test@example.com"
    password: "password123"
    firstName: "Test"
    organizationName: "Test Corp"
  ) {
    user { id email }
    organization { id name }
  }
}

mutation Login {
  login(email: "test@example.com", password: "password123") {
    accessToken
    user { id email }
  }
}

query Me {
  me {
    id
    email
    currentOrganization { name }
  }
}
    `,
  },
  
  cors: { origin: true, credentials: true },
  landingPage: false,
  maskedErrors: false,
});