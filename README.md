# Nextjs-starter-GraphQl
a basic template with Next.js, Tailwind CSS, TypeScript, and a GraphQL setup using Yoga and Pothos. You can use this template as a starting point for any future GraphQL projects by copying the project and adjusting the graphql schema and resolvers as needed.  Feel free to customize this template further based on your needs!

# 🚀 Enterprise SaaS GraphQL Auto-CRUD Platform

A production-ready, multi-tenant SaaS platform with automatic GraphQL CRUD generation, comprehensive authentication, subscription management, and enterprise-grade security.

## ✨ Key Features

### 🏢 **Multi-Tenancy & Organizations**
- Complete organization management with roles and permissions
- Tenant isolation and data scoping
- User invitation system with email verification
- Organization switching capabilities

### 🔐 **Enterprise Authentication & Authorization**
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Permission-based authorization
- Account security (login attempts, account locking)
- Session management
- API key authentication for programmatic access

### 💳 **Subscription & Billing Management**
- Multiple subscription plans with feature flags
- Usage tracking and limits enforcement
- Trial periods and billing cycles
- Invoice generation and management
- Stripe integration ready

### 🔄 **Auto-CRUD with Smart Authorization**
- Automatic GraphQL CRUD operations for all models
- Organization-scoped data filtering
- Permission-based field access control
- Resource ownership validation

### 🛡️ **Security & Compliance**
- Comprehensive audit logging
- Rate limiting and DDoS protection
- Data validation and sanitization
- CORS configuration
- Error masking in production

### 📊 **Developer Experience**
- GraphiQL interface with authentication
- Comprehensive TypeScript support
- Hot reloading with generated files
- Detailed error handling and logging

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   GraphQL API   │    │   Database      │
│   (React/Next)  │◄──►│   (Yoga/Pothos) │◄──►│   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │   Auth System   │
                       │   - JWT Tokens  │
                       │   - Sessions    │
                       │   - Permissions │
                       └─────────────────┘
```

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd nextjs-saas-graphql-autocrud
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas_db"
JWT_SECRET="your-super-secure-secret-key"
JWT_REFRESH_SECRET="your-super-secure-refresh-secret"
FRONTEND_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Start PostgreSQL with Docker
docker-compose up -d

# Generate Prisma client and run migrations
npm run generate
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 4. Start Development

```bash
npm run dev
```

Visit `http://localhost:3000/api/graphql` for GraphiQL interface!

## 🧪 Test Accounts

After seeding, you can use these test accounts:

```
Super Admin: admin@saas.com / admin123
Acme Owner: john@acme.com / password123
Acme Admin: jane@acme.com / password123
Acme Member: mike@acme.com / password123
Startup Owner: sarah@techstartup.com / password123
```

## 📖 Usage Examples

### Authentication Flow

```graphql
# 1. Register new user and organization
mutation Register {
  register(
    email: "founder@newstartup.com"
    password: "securePassword123"
    firstName: "Jane"
    lastName: "Founder"
    organizationName: "New Startup"
  ) {
    user {
      id
      email
      firstName
    }
    organization {
      id
      name
      slug
    }
  }
}

# 2. Login to get JWT tokens
mutation Login {
  login(
    email: "founder@newstartup.com"
    password: "securePassword123"
  ) {
    user {
      id
      email
      currentOrganization {
        name
        role
      }
    }
    accessToken  # Use in Authorization header
    refreshToken # Store securely for token refresh
  }
}

# 3. Get current user profile (requires auth)
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
      subscription {
        status
        plan {
          name
          features
          limits
        }
      }
    }
  }
}
```

### Organization Management

```graphql
# Switch between organizations
mutation SwitchOrg {
  switchOrganization(organizationId: "org-id-here") {
    id
    name
    slug
  }
}

# Invite user to organization (requires MANAGE_USERS permission)
mutation InviteUser {
  inviteUserToOrganization(
    email: "newteammate@example.com"
    role: MEMBER
  ) {
    id
    email
    status
    expiresAt
  }
}

# Get organization members
query OrgMembers {
  findManyOrganizationUser {
    id
    role
    permissions
    isActive
    user {
      firstName
      lastName
      email
    }
  }
}
```

### Multi-Tenant Data Operations

```graphql
# All queries are automatically scoped to current organization
query GetProjects {
  findManyProject(take: 10) {
    id
    name
    description
    createdAt
    # Only returns projects from current organization
  }
}

# Create project (requires CREATE_PROJECTS permission)
mutation CreateProject {
  createOneProject(data: {
    name: "Customer Dashboard"
    description: "Self-service customer portal"
  }) {
    id
    name
    organization {
      name
    }
  }
}

# Update project (requires MANAGE_PROJECTS permission)
mutation UpdateProject {
  updateOneProject(
    where: { id: "project-id" }
    data: {
      name: { set: "Updated Project Name" }
      settings: { set: { isPublic: true } }
    }
  ) {
    id
    name
    settings
  }
}
```

## 🔐 Authorization System

### Roles & Permissions

```typescript
// Organization Roles (hierarchical)
enum OrganizationRole {
  OWNER    // Full access to everything
  ADMIN    // Most permissions except billing/org management
  MEMBER   // Basic project access
  GUEST    // Read-only access
}

// Granular Permissions
enum OrganizationPermission {
  MANAGE_USERS           // Invite, remove, modify users
  INVITE_USERS          // Invite new users
  REMOVE_USERS          // Remove users
  MANAGE_ORGANIZATION   // Organization settings
  MANAGE_BILLING        // Subscription, billing
  MANAGE_INTEGRATIONS   // Third-party integrations
  CREATE_PROJECTS       // Create new projects
  MANAGE_PROJECTS       // Edit projects
  DELETE_PROJECTS       // Delete projects
  MANAGE_API_KEYS       // API key management
  VIEW_ANALYTICS        // Access analytics
}
```

### Custom Authorization

```typescript
// Add custom authorization to generated CRUD
generateAllCrud({
  handleResolver: ({ field, modelName, operationName, type }) => {
    // Require authentication for all mutations
    if (type === 'Mutation') {
      return {
        ...field,
        authScopes: { authenticated: true, verified: true }
      };
    }
    
    // Model-specific permissions
    if (modelName === 'Project') {
      if (operationName.includes('create')) {
        return { ...field, authScopes: { canCreateProjects: true } };
      }
      if (operationName.includes('delete')) {
        return { ...field, authScopes: { canDeleteProjects: true } };
      }
    }
    
    return field;
  }
});
```

## 💳 Subscription Management

### Plan Features & Limits

```graphql
query GetSubscriptionInfo {
  me {
    currentOrganization {
      subscription {
        status
        currentPeriodEnd
        plan {
          name
          price
          features  # JSON object with feature flags
          limits    # JSON object with usage limits
        }
        usageData  # Current usage tracking
      }
    }
  }
}

# Get available plans
query GetPlans {
  findManyPlan(where: { isActive: { equals: true } }) {
    id
    name
    description
    price
    currency
    interval
    features
    limits
    isPopular
  }
}
```

### Usage Enforcement

```typescript
// Check feature access
const canUseAnalytics = await subscriptionGuards.canAccessFeature(
  organizationId, 
  'analytics'
);

// Check usage limits
const projectLimit = await subscriptionGuards.checkUsageLimit(
  organizationId, 
  'projects', 
  currentProjectCount
);

if (!projectLimit.allowed) {
  throw new Error(`Project limit reached: ${projectLimit.limit}`);
}
```

## 🛡️ Security Features

### Rate Limiting

```typescript
// Built-in rate limiting
const limiter = rateLimit({
  interval: 60 * 1000,        // 1 minute window
  uniqueTokenPerInterval: 500, // Max 500 unique IPs
});

// Per-IP limits
await limiter.check(10, ipAddress); // 10 requests per minute
```

### Audit Logging

```graphql
# All actions are automatically logged
query GetAuditLogs {
  findManyAuditLog(
    orderBy: [{ createdAt: desc }]
    take: 50
  ) {
    id
    action      # LOGIN, CREATE, UPDATE, DELETE, etc.
    resource    # User, Project, Organization, etc.
    resourceId
    user {
      firstName
      lastName
      email
    }
    ipAddress
    userAgent
    createdAt
  }
}
```

### API Key Authentication

```typescript
// Create API key for programmatic access
mutation CreateApiKey {
  createApiKey(data: {
    name: "CI/CD Pipeline"
    scopes: ["projects:read", "projects:write"]
    rateLimit: 5000
    expiresAt: "2024-12-31T23:59:59Z"
  }) {
    id
    name
    key        # sk_abc123... (store securely)
    scopes
    rateLimit
  }
}
```

## 📊 Monitoring & Analytics

### Built-in Metrics

```typescript
// Request logging and monitoring
plugins: [
  {
    onRequest: ({ request, url }) => {
      console.log(`📨 ${request.method} ${url.pathname}`);
    },
    onResponse: ({ serverContext }) => {
      const duration = Date.now() - serverContext.startTime;
      console.log(`📊 Response: ${duration}ms`);
    },
    onError: ({ error, context }) => {
      // Automatic error logging with context
      logger.error('GraphQL Error', {
        message: error.message,
        userId: context.user?.id,
        organizationId: context.organization?.id,
        timestamp: new Date().toISOString(),
      });
    }
  }
]
```

## 🔧 Development Scripts

```bash
# Database management
npm run db:migrate        # Run migrations
npm run db:seed          # Seed with sample data
npm run db:studio        # Open Prisma Studio
npm run db:reset         # Reset database (destructive)

# Development
npm run dev              # Start dev server
npm run generate         # Generate Prisma client & types
npm run clean:generated  # Clean generated files
npm run type-check       # TypeScript checking

# Docker
npm run docker:up        # Start database
npm run docker:down      # Stop database

# Testing
npm run test             # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

## 🚀 Production Deployment

### Environment Variables

```bash
# Production environment
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@prod-db:5432/saas_prod"
JWT_SECRET="super-secure-production-secret"
JWT_REFRESH_SECRET="super-secure-refresh-secret"
FRONTEND_URL="https://yoursaas.com"

# Optional integrations
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
SENDGRID_API_KEY="SG...."
SENTRY_DSN="https://..."
```

### Docker Production

```dockerfile
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Generate Prisma client
RUN npm run generate

# Build application
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Deployment Checklist

- [ ] Update environment variables
- [ ] Run database migrations
- [ ] Configure CORS origins
- [ ] Set up SSL certificates
- [ ] Configure monitoring (Sentry, DataDog, etc.)
- [ ] Set up backup strategies
- [ ] Configure CDN for static assets
- [ ] Set up CI/CD pipelines

## 🔄 Adding New Features

### 1. Add New Prisma Model

```prisma
model Task {
  id             String   @id @default(uuid())
  title          String
  description    String?
  completed      Boolean  @default(false)
  projectId      String
  assigneeId     String?
  organizationId String   // Multi-tenant field
  
  // Relationships
  project      Project      @relation(fields: [projectId], references: [id])
  assignee     User?        @relation(fields: [assigneeId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("tasks")
}
```

### 2. Generate & Migrate

```bash
npm run generate
npm run db:migrate
```

### 3. CRUD Operations Are Auto-Generated!

```graphql
# Automatically available:
query GetTasks {
  findManyTask {  # Automatically org-scoped
    id
    title
    completed
    project {
      name
    }
    assignee {
      firstName
      lastName
    }
  }
}

mutation CreateTask {
  createOneTask(data: {
    title: "New Task"
    description: "Task description"
    projectId: "project-id"
  }) {
    id
    title
    project {
      name
    }
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📚 Advanced Topics

### Custom Resolvers

```typescript
// Add custom business logic
builder.queryField('organizationStats', (t) =>
  t.field({
    type: 'OrganizationStats',
    authScopes: { authenticated: true, canViewAnalytics: true },
    resolve: async (root, args, ctx) => {
      const { organization } = ctx;
      
      const [projectCount, userCount, taskCount] = await Promise.all([
        ctx.prisma.project.count({ where: { organizationId: organization.id } }),
        ctx.prisma.organizationUser.count({ where: { organizationId: organization.id } }),
        ctx.prisma.task.count({ where: { organizationId: organization.id } }),
      ]);
      
      return { projectCount, userCount, taskCount };
    },
  })
);
```

### Subscription Integration

```typescript
// Stripe webhook handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sig = req.headers['stripe-signature'] as string;
  
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    
    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
    }
    
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
```

### Background Jobs

```typescript
// Queue background tasks
import { Queue } from 'bull';

const emailQueue = new Queue('email processing');

// Send welcome email after registration
emailQueue.add('send-welcome-email', {
  userId: newUser.id,
  organizationId: organization.id,
});
```

## 🆘 Troubleshooting

### Common Issues

**Generated file errors:**
```bash
npm run clean:generated
npm run generate
```

**Database connection issues:**
```bash
docker-compose down && docker-compose up -d
npm run db:push
```

**Permission denied errors:**
- Check user's organization membership
- Verify role and permissions
- Check if organization is active

**Rate limit errors:**
- Implement exponential backoff
- Use API keys for higher limits
- Cache responses when possible

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the SaaS community**

This platform provides everything you need to build a production-ready SaaS application with GraphQL, from authentication to billing. Focus on your unique features while we handle the infrastructure!