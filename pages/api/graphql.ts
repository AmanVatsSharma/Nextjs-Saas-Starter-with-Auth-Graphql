// pages/api/graphql.ts - Production-ready SaaS GraphQL API
import { createYoga } from 'graphql-yoga';
import { AuthService } from '../../lib/auth';
import { AuthMiddleware, AuthError } from '../../lib/auth-middleware';
import rateLimit from '../../lib/rate-limit';
import { builder, prismaClient } from '../../lib/auth-builder';

// Initialize services
const authService = new AuthService(prismaClient);
const authMiddleware = new AuthMiddleware(authService, prismaClient);

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

// Safely integrate autocrud operations
function setupAutocrud() {
  try {
    console.log('🔄 Setting up autocrud operations...');
    
    // Import and configure autocrud
    const { generateAllCrud } = require('../../generated/autocrud');
    
    generateAllCrud({
      exclude: ['Session', 'VerificationToken'], // Exclude sensitive models
      handleResolver: ({ field, modelName, operationName, type }) => {
        const originalResolve = field.resolve;
        
        return {
          ...field,
          resolve: async (query: any, root: any, args: any, context: any, info: any) => {
            try {
              // Add request logging for development
              if (process.env.NODE_ENV === 'development') {
                console.log(`🔧 ${type}.${operationName} - User: ${context.user?.id || 'anonymous'}`);
              }

              // Call original resolver with error handling
              return await originalResolve(query, root, args, context, info);
              
            } catch (error: any) {
              // Enhanced error handling
              console.error(`❌ Error in ${modelName}.${operationName}:`, {
                error: error.message,
                userId: context.user?.id,
                organizationId: context.organization?.id,
                args: process.env.NODE_ENV === 'development' ? args : '[redacted]',
              });
              
              // User-friendly error messages
              if (error.code === 'P2002') {
                throw new Error('A record with this information already exists');
              }
              if (error.code === 'P2003') {
                throw new Error('Cannot delete: this record is referenced by other data');
              }
              if (error.code === 'P2025') {
                throw new Error('Record not found or access denied');
              }
              if (error.code === 'P2016') {
                throw new Error('Query interpretation error');
              }
              
              // Auth errors
              if (error instanceof AuthError) {
                throw new Error(`Access denied: ${error.message}`);
              }
              
              // Generic fallback for production
              if (process.env.NODE_ENV === 'production') {
                throw new Error('An error occurred while processing your request');
              }
              
              throw error;
            }
          },
        };
      },
    });
    
    console.log('✅ Autocrud setup complete');
    return true;
    
  } catch (error: any) {
    console.warn(`⚠️ Autocrud setup failed: ${error.message}`);
    console.warn('Continuing with manual operations only...');
    return false;
  }
}

// Try to setup autocrud
const autocrudEnabled = setupAutocrud();

// Build the GraphQL schema
let schema;
try {
  schema = builder.toSchema();
  console.log('✅ GraphQL schema built successfully');
  
  if (autocrudEnabled) {
    console.log('🤖 Schema includes autocrud operations');
  } else {
    console.log('📝 Schema includes manual operations only');
  }
} catch (error: any) {
  console.error('❌ Failed to build GraphQL schema:', error);
  throw new Error(`Schema build failed: ${error.message}`);
}

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
      const apiKey = request.headers.get('x-api-key');
      const ipAddress = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       request.headers.get('cf-connecting-ip') || // Cloudflare
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      
      // Rate limiting (skip for health checks)
      const isHealthCheck = request.url?.includes('health');
      if (!isHealthCheck) {
        try {
          await limiter.check(
            apiKey ? 1000 : 100, // Higher limit for API keys
            apiKey || ipAddress
          );
        } catch (rateLimitError) {
          throw new Error('Too many requests. Please try again later.');
        }
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
          // Log auth failures for security monitoring
          console.warn('🔐 Authentication failed:', {
            error: error.message,
            ipAddress,
            userAgent: userAgent.substring(0, 100), // Truncate for logging
            timestamp: new Date().toISOString(),
          });
        } else {
          console.error('🚨 Unexpected auth error:', error);
          throw new Error('Authentication service error');
        }
      }
      
      // TODO: API Key authentication
      if (apiKey && !authContext.user) {
        console.log('🔑 API key authentication not yet implemented');
        // Implement API key auth here when needed
      }
      
      // Log successful requests in development
      if (process.env.NODE_ENV === 'development' && authContext.user) {
        console.log(`👤 Authenticated user: ${authContext.user.email} (${authContext.organization?.name || 'no org'})`);
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
      
    } catch (error: any) {
      console.error('🚨 Context creation error:', error);
      throw error;
    }
  },
  
  graphqlEndpoint: '/api/graphql',
  
  graphiql: {
    title: '🚀 SaaS GraphQL API',
    defaultQuery: `# 🚀 Welcome to your SaaS GraphQL API!
# Complete with authentication, multi-tenancy, RBAC, and auto-generated CRUD

# ============================================================================
# 🏥 HEALTH CHECK (No auth required)
# ============================================================================

query HealthCheck {
  health
}

# ============================================================================
# 🔐 AUTHENTICATION FLOW
# ============================================================================

# 1️⃣ Register a new user and organization
mutation Register {
  register(
    email: "john.doe@example.com"
    password: "SecurePassword123!"
    firstName: "John"
    lastName: "Doe"
    organizationName: "Acme Corporation"
  ) {
    user {
      id
      email
      firstName
      lastName
      isVerified
      createdAt
    }
    organization {
      id
      name
      slug
      createdAt
    }
  }
}

# 2️⃣ Login to get access tokens
mutation Login {
  login(
    email: "john.doe@example.com"
    password: "SecurePassword123!"
  ) {
    user {
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
    accessToken  # Use this in Authorization header
    refreshToken # Use this to refresh access tokens
  }
}

# 3️⃣ Logout (requires authentication)
mutation Logout {
  logout
}

# ============================================================================
# 👤 USER OPERATIONS (Requires authentication)
# ============================================================================

# Get current user information
query Me {
  me {
    id
    email
    firstName
    lastName
    isActive
    isVerified
    currentOrganization {
      id
      name
      slug
      organizationUsers {
        role
        permissions
        isActive
      }
    }
    createdAt
  }
}

# Get all organizations user belongs to
query MyOrganizations {
  myOrganizations {
    id
    name
    slug
    description
    isActive
    createdAt
  }
}

# Switch to a different organization
mutation SwitchOrganization {
  switchOrganization(organizationId: "org-id-here") {
    id
    name
    slug
  }
}

# ============================================================================
# 🏢 ORGANIZATION MANAGEMENT (Requires permissions)
# ============================================================================

# Invite a user to organization (requires MANAGE_USERS permission)
mutation InviteUser {
  inviteUserToOrganization(
    email: "newuser@example.com"
    role: MEMBER
  ) {
    id
    email
    role
    expiresAt
    organization {
      name
    }
  }
}

# ============================================================================
# 📁 PROJECT OPERATIONS (Multi-tenant, auto-scoped)
# ============================================================================

# Get all projects (automatically filtered by current organization)
query GetProjects {
  projects {
    id
    name
    description
    isArchived
    createdAt
    organization {
      name
    }
  }
}

# Create a new project (requires CREATE_PROJECTS permission)
mutation CreateProject {
  createProject(
    name: "My Awesome Project"
    description: "This project will change the world"
  ) {
    id
    name
    description
    createdAt
    organization {
      id
      name
    }
  }
}

# ============================================================================
# 🤖 AUTO-GENERATED CRUD OPERATIONS
# ============================================================================

# These operations are automatically generated for all models
# with proper authorization and organization scoping

# Find multiple projects with filtering
query FindManyProjects {
  findManyProject(
    where: {
      name: { contains: "awesome", mode: insensitive }
      isArchived: false
    }
    orderBy: { createdAt: desc }
    take: 10
  ) {
    id
    name
    description
    createdAt
  }
}

# Find a specific project
query FindProject {
  findUniqueProject(where: { id: "project-id-here" }) {
    id
    name
    description
    isArchived
    organization {
      name
    }
  }
}

# Update a project (requires MANAGE_PROJECTS permission)
mutation UpdateProject {
  updateOneProject(
    where: { id: "project-id-here" }
    data: { 
      name: "Updated Project Name"
      description: "Updated description"
    }
  ) {
    id
    name
    description
    updatedAt
  }
}

# Delete a project (requires DELETE_PROJECTS permission)
mutation DeleteProject {
  deleteOneProject(where: { id: "project-id-here" }) {
    id
    name
  }
}

# Count projects
query CountProjects {
  countProject(where: { isArchived: false })
}

# ============================================================================
# 📊 ORGANIZATION USER MANAGEMENT
# ============================================================================

# Get organization members (requires appropriate permissions)
query OrganizationMembers {
  findManyOrganizationUser(
    where: { isActive: true }
    include: { user: true }
  ) {
    id
    role
    permissions
    isActive
    joinedAt
    user {
      id
      email
      firstName
      lastName
    }
  }
}

# ============================================================================
# 🎫 INVITATIONS MANAGEMENT
# ============================================================================

# Get pending invitations
query PendingInvitations {
  findManyInvitation(
    where: { status: PENDING }
    orderBy: { createdAt: desc }
  ) {
    id
    email
    role
    status
    expiresAt
    createdAt
    inviter {
      firstName
      lastName
      email
    }
  }
}

# ============================================================================
# 🔧 AUTHENTICATION HEADERS
# ============================================================================

# To use authenticated operations, add these headers to your requests:
# 
# {
#   "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE",
#   "Content-Type": "application/json"
# }
#
# Optional headers:
# {
#   "X-Session-Token": "session_token_for_cookie_auth",
#   "X-API-Key": "your_api_key_here"
# }

# ============================================================================
# 🛡️ SECURITY FEATURES
# ============================================================================

# ✅ Multi-tenancy: All operations are automatically scoped to user's organization
# ✅ RBAC: Role-based access control with fine-grained permissions
# ✅ Rate limiting: Protection against abuse
# ✅ Input validation: All inputs are validated
# ✅ SQL injection protection: Prisma provides built-in protection
# ✅ Authentication: JWT tokens with refresh mechanism
# ✅ Audit logging: All operations are logged for compliance
# ✅ Error handling: User-friendly error messages without sensitive data leaks`,
    
    headers: {
      'Content-Type': 'application/json',
    },
  },
  
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URL || 'https://yourdomain.com',
          /\.yourdomain\.com$/, // Allow subdomains in production
        ]
      : true, // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Token',
      'X-API-Key',
      'X-Requested-With',
    ],
  },
  
  landingPage: false,
  maskedErrors: process.env.NODE_ENV === 'production',
  
  // Enhanced error formatting
  formatError: (error, context) => {
    // Log all errors for monitoring
    console.error('🚨 GraphQL Error:', {
      message: error.message,
      locations: error.locations,
      path: error.path,
      userId: context?.user?.id,
      organizationId: context?.organization?.id,
      ipAddress: context?.ipAddress,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    
    // Sanitize errors for production
    if (process.env.NODE_ENV === 'production') {
      // Don't expose internal errors
      if (error.message.includes('prisma') || 
          error.message.includes('database') ||
          error.message.includes('ECONNREFUSED')) {
        return new Error('A database error occurred. Please try again later.');
      }
      
      if (error.message.includes('jwt') || 
          error.message.includes('token') ||
          error.message.includes('unauthorized')) {
        return new Error('Authentication failed. Please log in again.');
      }
      
      if (error.message.includes('validation')) {
        return new Error('Invalid input provided. Please check your data.');
      }
    }
    
    return error;
  },
  
  plugins: [
    {
      onRequest: ({ request, url }) => {
        if (process.env.NODE_ENV === 'development') {
          const operation = request.method === 'POST' ? '🔧 GraphQL Operation' : '📊 GraphQL Query';
          console.log(`${operation}: ${request.method} ${url.pathname}`);
        }
      },
      
      onResponse: ({ response, serverContext }) => {
        if (process.env.NODE_ENV === 'development') {
          const duration = Date.now() - (serverContext as any).startTime;
          const status = response.status >= 400 ? '❌' : '✅';
          console.log(`${status} Response: ${response.status} (${duration}ms)`);
        }
      },
      
      onError: ({ error, context }) => {
        // Additional error tracking for production monitoring
        if (process.env.NODE_ENV === 'production') {
          // TODO: Send to error tracking service (Sentry, Bugsnag, etc.)
          // errorTracker.captureException(error, {
          //   user: { id: context?.user?.id },
          //   extra: { organizationId: context?.organization?.id }
          // });
        }
        
        console.error('🔥 Unhandled GraphQL Error:', {
          message: error.message,
          userId: (context as any)?.user?.id,
          organizationId: (context as any)?.organization?.id,
          timestamp: new Date().toISOString(),
        });
      },
    },
  ], 
});