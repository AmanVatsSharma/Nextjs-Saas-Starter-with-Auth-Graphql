// import { createYoga } from 'graphql-yoga';
// import { PrismaClient } from '../../prisma/generated/client';
// import { builder } from '../../lib/auth-builder';
// import { AuthService } from '../../lib/auth';
// import { AuthMiddleware, AuthError } from '../../lib/auth-middleware';
// // @ts-ignore - Generated files may have type issues
// import { generateAllCrud } from '../../generated/autocrud';
// import rateLimit from '@/lib/rate-limit';

// // Initialize services
// const prisma = new PrismaClient({
//   log: process.env.NODE_ENV === 'development' 
//     ? ['query', 'error', 'warn'] 
//     : ['error'],
// });

// const authService = new AuthService(prisma);
// const authMiddleware = new AuthMiddleware(authService, prisma);

// // Generate CRUD operations with SaaS-specific authorization with fixed error handling
// try {
//   // Import the generated autocrud function
//   const { generateAllCrud } = require('../../generated/autocrud');
  
//   generateAllCrud({
//     // Exclude sensitive models from auto-generation
//     exclude: ['Session', 'VerificationToken', 'AuditLog'],
    
//     // Apply organization-scoped filtering and authorization
//     handleResolver: ({ field, modelName, operationName, type }) => {
//       const isQuery = type === 'Query';
//       const isMutation = type === 'Mutation';
//       const isWrite = isMutation && !operationName.includes('count');
//       const isDelete = operationName.includes('delete') || operationName.includes('Delete');
      
//       // Apply organization scoping for multi-tenant models
//       const multiTenantModels = ['Project', 'User', 'Organization'];
//       const isMultiTenant = multiTenantModels.includes(modelName);
      
//       let authScopes: any = {};
//       let modifiedField = { ...field };
      
//       // Base authentication requirements
//       if (isWrite) {
//         authScopes.authenticated = true;
//         authScopes.verified = true;
//         authScopes.active = true;
//       }
      
//       // Role-based authorization
//       if (isDelete) {
//         authScopes.isAdmin = true;
//       }
      
//       // Model-specific authorization
//       switch (modelName) {
//         case 'User':
//           if (isWrite) {
//             authScopes.canManageUsers = true;
//           }
//           break;
          
//         case 'Organization':
//           if (isWrite) {
//             authScopes.canManageOrganization = true;
//           }
//           break;
          
//         case 'Project':
//           if (operationName.includes('create')) {
//             authScopes.canCreateProjects = true;
//           } else if (isWrite && !isDelete) {
//             authScopes.canManageProjects = true;
//           } else if (isDelete) {
//             authScopes.canDeleteProjects = true;
//           }
//           break;
          
//         case 'Subscription':
//         case 'Plan':
//         case 'Invoice':
//           authScopes.canManageBilling = true;
//           break;
          
//         case 'ApiKey':
//           authScopes.canManageApiKeys = true;
//           break;
//       }
      
//       // Add organization filtering for multi-tenant models
//       if (isMultiTenant && isQuery) {
//         const originalResolve = modifiedField.resolve;
//         modifiedField.resolve = async (query: any, root: any, args: any, context: any, info: any) => {
//           // Add organization filter to where clause
//           if (context.organization && args.where) {
//             args.where.organizationId = context.organization.id;
//           } else if (context.organization && !args.where) {
//             args.where = { organizationId: context.organization.id };
//           }
          
//           return originalResolve(query, root, args, context, info);
//         };
//       }
      
//       return {
//         ...modifiedField,
//         authScopes,
//       };
//     },
//   });
// } catch (error) {
//   console.error('Error generating CRUD operations:', error);
// }

// // Build the GraphQL schema
// const schema = builder.toSchema();

// // Rate limiting configuration
// const limiter = rateLimit({
//   interval: 60 * 1000, // 1 minute
//   uniqueTokenPerInterval: 500, // Max 500 unique IPs per interval
// });

// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };

// export default createYoga({
//   schema,
//   context: async ({ request }) => {
//     const startTime = Date.now();
    
//     // Extract authentication headers
//     const authorization = request.headers.get('authorization');
//     const sessionToken = request.headers.get('x-session-token');
//     const apiKey = request.headers.get('x-api-key');
    
//     // Extract client information
//     const ipAddress = request.headers.get('x-forwarded-for') || 
//                      request.headers.get('x-real-ip') || 
//                      'unknown';
//     const userAgent = request.headers.get('user-agent') || 'unknown';
    
//     // Rate limiting
//     try {
//       await limiter.check(10, ipAddress); // 10 requests per minute per IP
//     } catch {
//       throw new Error('Rate limit exceeded');
//     }
    
//     // Authenticate request
//     let authContext;
//     try {
//       authContext = await authMiddleware.authenticate(
//         authorization || undefined,
//         sessionToken || undefined,
//         {
//           required: false, // Let individual resolvers handle auth requirements
//         }
//       );
//     } catch (error) {
//       if (error instanceof AuthError) {
//         throw new Error(error.message);
//       }
//       throw error;
//     }
    
//     // API Key authentication (for programmatic access)
//     if (apiKey && !authContext.user) {
//       // TODO: Implement API key authentication
//       // const apiKeyAuth = new ApiKeyAuth(prisma);
//       // const apiKeyResult = await apiKeyAuth.validateApiKey(apiKey);
//       // if (apiKeyResult.isValid) {
//       //   // Set up context for API key authentication
//       // }
//     }
    
//     return {
//       prisma,
//       authService,
//       authMiddleware,
//       ipAddress,
//       userAgent,
//       startTime,
//       ...authContext,
//     };
//   },
  
//   graphqlEndpoint: '/api/graphql',
  
//   graphiql: {
//     title: 'SaaS GraphQL API',
//     defaultQuery: `
// # Welcome to your SaaS GraphQL API!
// # This API includes multi-tenancy, authentication, and subscription management.

// # Authentication Examples:

// # 1. Register a new user and organization
// mutation Register {
//   register(
//     email: "john@example.com"
//     password: "securePassword123"
//     firstName: "John"
//     lastName: "Doe"
//     organizationName: "Acme Corp"
//   ) {
//     user {
//       id
//       email
//       firstName
//       lastName
//     }
//     organization {
//       id
//       name
//       slug
//     }
//   }
// }

// # 2. Login
// mutation Login {
//   login(
//     email: "john@example.com"
//     password: "securePassword123"
//   ) {
//     user {
//       id
//       email
//       firstName
//       lastName
//     }
//     accessToken
//     refreshToken
//   }
// }

// # 3. Get current user info (requires authentication)
// query Me {
//   me {
//     id
//     email
//     firstName
//     lastName
//     currentOrganization {
//       id
//       name
//       slug
//     }
//   }
// }

// # 4. Get user's organizations
// query MyOrganizations {
//   myOrganizations {
//     id
//     name
//     slug
//     organizationUsers {
//       role
//       permissions
//     }
//   }
// }

// # 5. Create a project (requires authentication and permissions)
// mutation CreateProject {
//   createOneProject(data: {
//     name: "My First Project"
//     description: "A sample project"
//   }) {
//     id
//     name
//     description
//     organization {
//       name
//     }
//   }
// }

// # 6. Get projects (automatically filtered by organization)
// query GetProjects {
//   findManyProject {
//     id
//     name
//     description
//     createdAt
//   }
// }

// # Add Authorization header with JWT token:
// # {
// #   "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
// # }
//     `,
//     headers: {
//       'Content-Type': 'application/json',
//     },
//   },
  
//   cors: {
//     origin: process.env.NODE_ENV === 'production' 
//       ? [
//           process.env.FRONTEND_URL || 'https://yourdomain.com',
//           /\.yourdomain\.com$/,
//         ]
//       : true,
//     credentials: true,
//     methods: ['GET', 'POST', 'OPTIONS'],
//     allowedHeaders: [
//       'Content-Type',
//       'Authorization',
//       'X-Session-Token',
//       'X-API-Key',
//     ],
//   },
  
//   landingPage: false,
  
//   // Enhanced error handling
//   maskedErrors: process.env.NODE_ENV === 'production',
  
//   // Request/Response logging
//   plugins: [
//     {
//       onRequest: ({ request, url }) => {
//         if (process.env.NODE_ENV === 'development') {
//           console.log(`📨 GraphQL Request: ${request.method} ${url.pathname}`);
//         }
//       },
      
//       onResponse: ({ request, serverContext }) => {
//         if (process.env.NODE_ENV === 'development') {
//           const duration = Date.now() - (serverContext as any).startTime;
//           console.log(`📨 GraphQL Response: ${duration}ms`);
//         }
//       },
      
//       onError: ({ error, context }) => {
//         // Log errors for monitoring
//         console.error('GraphQL Error:', {
//           message: error.message,
//           userId: (context as any)?.user?.id,
//           organizationId: (context as any)?.organization?.id,
//           timestamp: new Date().toISOString(),
//         });
        
//         // TODO: Send to error tracking service (Sentry, etc.)
//       },
//     },
//   ], 
// });    

// pages/api/graphql.ts - Fixed working version
import { createYoga } from 'graphql-yoga';
import { AuthService } from '../../lib/auth';
import { AuthMiddleware, AuthError } from '../../lib/auth-middleware';
import rateLimit from '../../lib/rate-limit';
import { builder, prismaClient } from '../../lib/auth-builder';

// Initialize services with the shared Prisma client
const authService = new AuthService(prismaClient);
const authMiddleware = new AuthMiddleware(authService, prismaClient);

// Function to safely integrate autocrud
function integrateAutocrud() {
  try {
    // Try to import and use autocrud
    const { generateAllCrud } = require('../../generated/autocrud');
    
    console.log('🔄 Integrating autocrud operations...');
    
    generateAllCrud({
      exclude: ['Session', 'VerificationToken', 'AuditLog'],
      handleResolver: ({ field, modelName, operationName, type }) => {
        const originalResolve = field.resolve;
        
        return {
          ...field,
          resolve: async (query, root, args, context, info) => {
            try {
              const isQuery = type === 'Query';
              const isMutation = type === 'Mutation';
              const multiTenantModels = ['Project', 'ApiKey', 'Invitation'];
              const isMultiTenant = multiTenantModels.includes(modelName);
              
              // Add organization filtering for multi-tenant models
              if (isMultiTenant && isQuery && context.organization) {
                if (args.where) {
                  args.where.organizationId = context.organization.id;
                } else {
                  args.where = { organizationId: context.organization.id };
                }
              }
              
              // For mutations, ensure organizationId is set
              if (isMultiTenant && isMutation && context.organization && args.data) {
                args.data.organizationId = context.organization.id;
              }
              
              return await originalResolve(query, root, args, context, info);
              
            } catch (error) {
              console.error(`Error in ${modelName}.${operationName}:`, error);
              
              // Handle common Prisma errors
              if (error.message.includes('Unique constraint')) {
                throw new Error('A record with this information already exists');
              }
              if (error.message.includes('Foreign key constraint')) {
                throw new Error('Cannot delete record: it is referenced by other data');
              }
              if (error.message.includes('Record to update not found')) {
                throw new Error('Record not found');
              }
              
              // Re-throw auth errors
              if (error instanceof AuthError) {
                throw error;
              }
              
              // Generic error for production
              if (process.env.NODE_ENV === 'production') {
                throw new Error('An error occurred while processing your request');
              }
              
              throw error;
            }
          },
          
          // Apply auth scopes
          authScopes: getAuthScopesForOperation(modelName, operationName, type),
        };
      },
    });
    
    console.log('✅ Autocrud integration successful');
    return true;
    
  } catch (error) {
    console.warn('⚠️ Autocrud integration failed, continuing with basic operations:', error.message);
    return false;
  }
}

// Auth scopes helper
function getAuthScopesForOperation(modelName, operationName, type) {
  const isQuery = type === 'Query';
  const isMutation = type === 'Mutation';
  const isWrite = isMutation && !operationName.includes('count');
  const isDelete = operationName.includes('delete') || operationName.includes('Delete');
  
  let authScopes = {};
  
  if (isWrite) {
    authScopes.authenticated = true;
    authScopes.verified = true;
    authScopes.active = true;
  }
  
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
  
  return authScopes;
}

// Try to integrate autocrud
const autocrudIntegrated = integrateAutocrud();

// Build the schema
let schema;
try {
  schema = builder.toSchema();
  console.log('✅ GraphQL schema built successfully');
} catch (error) {
  console.error('❌ Failed to build GraphQL schema:', error);
  throw new Error(`Schema build failed: ${error.message}`);
}

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
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
    
    try {
      // Extract headers
      const authorization = request.headers.get('authorization');
      const sessionToken = request.headers.get('x-session-token');
      const ipAddress = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      
      // Rate limiting
      try {
        await limiter.check(100, ipAddress);
      } catch {
        throw new Error('Too many requests. Please try again later.');
      }
      
      // Authentication
      let authContext = {
        user: null,
        organization: null,
        session: null,
      };
      
      try {
        authContext = await authMiddleware.authenticate(
          authorization || undefined,
          sessionToken || undefined,
          { required: false }
        );
      } catch (error) {
        if (error instanceof AuthError) {
          console.warn('Authentication failed:', error.message);
        } else {
          console.error('Unexpected auth error:', error);
          throw new Error('Authentication service error');
        }
      }
      
      return {
        prisma: prismaClient,
        authService,
        authMiddleware,
        ipAddress,
        userAgent,
        startTime,
        ...authContext,
      };
      
    } catch (error) {
      console.error('Context creation error:', error);
      throw error;
    }
  },
  
  graphqlEndpoint: '/api/graphql',
  
  graphiql: {
    title: 'SaaS GraphQL API',
    defaultQuery: `# 🚀 SaaS GraphQL API
# Complete with authentication, multi-tenancy, and auto-generated CRUD operations

# 1. Health Check (no auth required)
query Health {
  health
}

# 2. Register a new user and organization
mutation Register {
  register(
    email: "john@example.com"
    password: "password123"
    firstName: "John"
    lastName: "Doe"
    organizationName: "Acme Corp"
  ) {
    user {
      id
      email
      firstName
      lastName
      isVerified
    }
    organization {
      id
      name
      slug
    }
  }
}

# 3. Login to get access token
mutation Login {
  login(
    email: "john@example.com"
    password: "password123"
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

# 4. Get current user info (requires Authorization header)
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

# 5. Get user's organizations
query MyOrganizations {
  myOrganizations {
    id
    name
    slug
  }
}

# 6. Get projects (auto-filtered by organization)
query Projects {
  projects {
    id
    name
    description
    createdAt
  }
}

# 7. Create a project (requires permissions)
mutation CreateProject {
  createProject(
    name: "My First Project"
    description: "A sample project"
  ) {
    id
    name
    description
    organization {
      name
    }
  }
}

# ===== AUTOCRUD OPERATIONS =====
# If autocrud is working, you'll also have:

# Find many projects with filtering
# query FindManyProject {
#   findManyProject(where: { name: { contains: "test" } }) {
#     id
#     name
#     description
#   }
# }

# Create one project
# mutation CreateOneProject {
#   createOneProject(data: { name: "New Project", description: "Test" }) {
#     id
#     name
#   }
# }

# Update project
# mutation UpdateProject {
#   updateOneProject(
#     where: { id: "project-id" }
#     data: { name: "Updated Name" }
#   ) {
#     id
#     name
#   }
# }

# To use authenticated queries, add this header:
# {
#   "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
# }`,
    headers: {
      'Content-Type': 'application/json',
    },
  },
  
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
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
  maskedErrors: process.env.NODE_ENV === 'production',
  
  formatError: (error, context) => {
    console.error('GraphQL Error:', {
      message: error.message,
      locations: error.locations,
      path: error.path,
      userId: context?.user?.id,
      organizationId: context?.organization?.id,
      timestamp: new Date().toISOString(),
    });
    
    if (process.env.NODE_ENV === 'production') {
      if (error.message.includes('prisma') || error.message.includes('database')) {
        return new Error('Database error occurred');
      }
      if (error.message.includes('jwt') || error.message.includes('token')) {
        return new Error('Authentication error');
      }
    }
    
    return error;
  },
  
  plugins: [
    {
      onRequest: ({ request, url }) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📨 ${request.method} ${url.pathname}`);
        }
      },
      
      onResponse: ({ response, serverContext }) => {
        if (process.env.NODE_ENV === 'development') {
          const duration = Date.now() - (serverContext as any).startTime;
          console.log(`📤 ${response.status} (${duration}ms)`);
        }
      },
      
      onError: ({ error, context }) => {
        console.error('🚨 GraphQL Error:', {
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          userId: (context as any)?.user?.id,
          organizationId: (context as any)?.organization?.id,
          timestamp: new Date().toISOString(),
        });
      },
    },
  ], 
});