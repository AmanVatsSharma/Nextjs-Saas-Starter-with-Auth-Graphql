import { createYoga } from 'graphql-yoga';
import { PrismaClient } from '../../prisma/generated/client';
import { builder } from '../../lib/auth-builder';
import { AuthService } from '../../lib/auth';
import { AuthMiddleware, AuthError } from '../../lib/auth-middleware';
// @ts-ignore - Generated files may have type issues
import { generateAllCrud } from '../../generated/autocrud';
import rateLimit from '@/lib/rate-limit';

// Initialize services
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

const authService = new AuthService(prisma);
const authMiddleware = new AuthMiddleware(authService, prisma);

// Generate CRUD operations with SaaS-specific authorization
try {
  generateAllCrud({
    // Exclude sensitive models from auto-generation
    exclude: ['Session', 'VerificationToken', 'AuditLog'],
    
    // Apply organization-scoped filtering and authorization
    handleResolver: ({ field, modelName, operationName, type }) => {
      const isQuery = type === 'Query';
      const isMutation = type === 'Mutation';
      const isWrite = isMutation && !operationName.includes('count');
      const isDelete = operationName.includes('delete') || operationName.includes('Delete');
      
      // Apply organization scoping for multi-tenant models
      const multiTenantModels = ['Project', 'User', 'Organization'];
      const isMultiTenant = multiTenantModels.includes(modelName);
      
      let authScopes: any = {};
      let modifiedField = { ...field };
      
      // Base authentication requirements
      if (isWrite) {
        authScopes.authenticated = true;
        authScopes.verified = true;
        authScopes.active = true;
      }
      
      // Role-based authorization
      if (isDelete) {
        authScopes.isAdmin = true;
      }
      
      // Model-specific authorization
      switch (modelName) {
        case 'User':
          if (isWrite) {
            authScopes.canManageUsers = true;
          }
          break;
          
        case 'Organization':
          if (isWrite) {
            authScopes.canManageOrganization = true;
          }
          break;
          
        case 'Project':
          if (operationName.includes('create')) {
            authScopes.canCreateProjects = true;
          } else if (isWrite && !isDelete) {
            authScopes.canManageProjects = true;
          } else if (isDelete) {
            authScopes.canDeleteProjects = true;
          }
          break;
          
        case 'Subscription':
        case 'Plan':
        case 'Invoice':
          authScopes.canManageBilling = true;
          break;
          
        case 'ApiKey':
          authScopes.canManageApiKeys = true;
          break;
      }
      
      // Add organization filtering for multi-tenant models
      if (isMultiTenant && isQuery) {
        const originalResolve = modifiedField.resolve;
        modifiedField.resolve = async (query: any, root: any, args: any, context: any, info: any) => {
          // Add organization filter to where clause
          if (context.organization && args.where) {
            args.where.organizationId = context.organization.id;
          } else if (context.organization && !args.where) {
            args.where = { organizationId: context.organization.id };
          }
          
          return originalResolve(query, root, args, context, info);
        };
      }
      
      return {
        ...modifiedField,
        authScopes,
      };
    },
  });
} catch (error) {
  console.error('Error generating CRUD operations:', error);
}

// Build the GraphQL schema
const schema = builder.toSchema();

// Rate limiting configuration
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 unique IPs per interval
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default createYoga({
  schema,
  context: async ({ request }) => {
    const startTime = Date.now();
    
    // Extract authentication headers
    const authorization = request.headers.get('authorization');
    const sessionToken = request.headers.get('x-session-token');
    const apiKey = request.headers.get('x-api-key');
    
    // Extract client information
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Rate limiting
    try {
      await limiter.check(10, ipAddress); // 10 requests per minute per IP
    } catch {
      throw new Error('Rate limit exceeded');
    }
    
    // Authenticate request
    let authContext;
    try {
      authContext = await authMiddleware.authenticate(
        authorization || undefined,
        sessionToken || undefined,
        {
          required: false, // Let individual resolvers handle auth requirements
        }
      );
    } catch (error) {
      if (error instanceof AuthError) {
        throw new Error(error.message);
      }
      throw error;
    }
    
    // API Key authentication (for programmatic access)
    if (apiKey && !authContext.user) {
      // TODO: Implement API key authentication
      // const apiKeyAuth = new ApiKeyAuth(prisma);
      // const apiKeyResult = await apiKeyAuth.validateApiKey(apiKey);
      // if (apiKeyResult.isValid) {
      //   // Set up context for API key authentication
      // }
    }
    
    return {
      prisma,
      authService,
      authMiddleware,
      ipAddress,
      userAgent,
      startTime,
      ...authContext,
    };
  },
  
  graphqlEndpoint: '/api/graphql',
  
  graphiql: {
    title: 'SaaS GraphQL API',
    defaultQuery: `
# Welcome to your SaaS GraphQL API!
# This API includes multi-tenancy, authentication, and subscription management.

# Authentication Examples:

# 1. Register a new user and organization
mutation Register {
  register(
    email: "john@example.com"
    password: "securePassword123"
    firstName: "John"
    lastName: "Doe"
    organizationName: "Acme Corp"
  ) {
    user {
      id
      email
      firstName
      lastName
    }
    organization {
      id
      name
      slug
    }
  }
}

# 2. Login
mutation Login {
  login(
    email: "john@example.com"
    password: "securePassword123"
  ) {
    user {
      id
      email
      firstName
      lastName
    }
    accessToken
    refreshToken
  }
}

# 3. Get current user info (requires authentication)
query Me {
  me {
    id
    email
    firstName
    lastName
    currentOrganization {
      id
      name
      slug
    }
  }
}

# 4. Get user's organizations
query MyOrganizations {
  myOrganizations {
    id
    name
    slug
    organizationUsers {
      role
      permissions
    }
  }
}

# 5. Create a project (requires authentication and permissions)
mutation CreateProject {
  createOneProject(data: {
    name: "My First Project"
    description: "A sample project"
  }) {
    id
    name
    description
    organization {
      name
    }
  }
}

# 6. Get projects (automatically filtered by organization)
query GetProjects {
  findManyProject {
    id
    name
    description
    createdAt
  }
}

# Add Authorization header with JWT token:
# {
#   "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
# }
    `,
    headers: {
      'Content-Type': 'application/json',
    },
  },
  
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URL || 'https://yourdomain.com',
          /\.yourdomain\.com$/,
        ]
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Token',
      'X-API-Key',
    ],
  },
  
  landingPage: false,
  
  // Enhanced error handling
  maskedErrors: process.env.NODE_ENV === 'production',
  
  // Request/Response logging
  plugins: [
    {
      onRequest: ({ request, url }) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📨 GraphQL Request: ${request.method} ${url.pathname}`);
        }
      },
      
      onResponse: ({ request, serverContext }) => {
        if (process.env.NODE_ENV === 'development') {
          const duration = Date.now() - (serverContext as any).startTime;
          console.log(`📨 GraphQL Response: ${duration}ms`);
        }
      },
      
      onError: ({ error, context }) => {
        // Log errors for monitoring
        console.error('GraphQL Error:', {
          message: error.message,
          userId: (context as any)?.user?.id,
          organizationId: (context as any)?.organization?.id,
          timestamp: new Date().toISOString(),
        });
        
        // TODO: Send to error tracking service (Sentry, etc.)
      },
    },
  ], 
});    