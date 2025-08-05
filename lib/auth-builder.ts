/// lib/auth-builder.ts - Fixed version resolving circular dependencies
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
import { PrismaClient, OrganizationRole, OrganizationPermission } from '../prisma/generated/client';
import { AuthContext, AuthService } from './auth';
import { AuthMiddleware, AuthError } from './auth-middleware';
import { DateTimeResolver } from 'graphql-scalars';
import crypto from 'crypto';

// Try to import generated types, fallback if not available
let PrismaTypes: any;
try {
  PrismaTypes = require('../generated/pothos-types').default;
} catch (error) {
  console.warn('Generated pothos types not found, using fallback');
  PrismaTypes = {} as any;
}

export interface SaaSContext extends AuthContext {
  prisma: PrismaClient;
  authService: AuthService;
  authMiddleware: AuthMiddleware;
  ipAddress?: string;
  userAgent?: string;
}

// Create a single Prisma client instance
const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Create builder with proper typing
export const builder = new SchemaBuilder<{
  PrismaTypes: typeof PrismaTypes;
  Context: SaaSContext;
  AuthScopes: {
    authenticated: boolean;
    verified: boolean;
    active: boolean;
    hasOrganization: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    isMember: boolean;
    canManageUsers: boolean;
    canManageBilling: boolean;
    canManageOrganization: boolean;
    canCreateProjects: boolean;
    canManageProjects: boolean;
    canDeleteProjects: boolean;
    canManageApiKeys: boolean;
    canViewAnalytics: boolean;
    canAccessResource: boolean;
    canModifyResource: boolean;
    canDeleteResource: boolean;
  };
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
  };
}>({
  plugins: [PrismaPlugin, ScopeAuthPlugin, ValidationPlugin],
  prisma: {
    client: prismaClient,
    filterConnectionTotalCount: true,
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
  authScopes: async (context) => {
    try {
      const { user, organization } = context;
      
      return {
        authenticated: !!user,
        verified: user?.isVerified || false,
        active: user?.isActive || false,
        hasOrganization: !!organization,
        isOwner: organization?.role === OrganizationRole.OWNER,
        isAdmin: [OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(organization?.role as OrganizationRole),
        isMember: !!organization?.role,
        canManageUsers: organization?.permissions?.includes(OrganizationPermission.MANAGE_USERS) || false,
        canManageBilling: organization?.permissions?.includes(OrganizationPermission.MANAGE_BILLING) || false,
        canManageOrganization: organization?.permissions?.includes(OrganizationPermission.MANAGE_ORGANIZATION) || false,
        canCreateProjects: organization?.permissions?.includes(OrganizationPermission.CREATE_PROJECTS) || false,
        canManageProjects: organization?.permissions?.includes(OrganizationPermission.MANAGE_PROJECTS) || false,
        canDeleteProjects: organization?.permissions?.includes(OrganizationPermission.DELETE_PROJECTS) || false,
        canManageApiKeys: organization?.permissions?.includes(OrganizationPermission.MANAGE_API_KEYS) || false,
        canViewAnalytics: organization?.permissions?.includes(OrganizationPermission.VIEW_ANALYTICS) || false,
        canAccessResource: false,
        canModifyResource: false,
        canDeleteResource: false,
      };
    } catch (error) {
      console.error('Error in authScopes:', error);
      // Return safe defaults
      return {
        authenticated: false,
        verified: false,
        active: false,
        hasOrganization: false,
        isOwner: false,
        isAdmin: false,
        isMember: false,
        canManageUsers: false,
        canManageBilling: false,
        canManageOrganization: false,
        canCreateProjects: false,
        canManageProjects: false,
        canDeleteProjects: false,
        canManageApiKeys: false,
        canViewAnalytics: false,
        canAccessResource: false,
        canModifyResource: false,
        canDeleteResource: false,
      };
    }
  },
  validation: {
    validationError: (zodError) => {
      console.error('Validation error:', zodError);
      throw new Error(`Validation failed: ${zodError.message}`);
    },
  },
});

// Add custom scalars and enums
try {
  builder.addScalarType('DateTime', DateTimeResolver, {});
  
  builder.enumType(OrganizationRole, {
    name: 'OrganizationRole',
    description: 'Organization member roles',
  });

  builder.enumType(OrganizationPermission, {
    name: 'OrganizationPermission', 
    description: 'Organization permissions',
  });
} catch (error) {
  console.warn('Failed to add scalars/enums:', error);
}

// Base types
builder.queryType({
  description: 'The root query type',
});

builder.mutationType({
  description: 'The root mutation type',
});

// Health check
builder.queryField('health', (t) =>
  t.string({
    description: 'Health check endpoint',
    resolve: () => 'OK',
  })
);

// ============================================================================
// MANUALLY DEFINE CORE OBJECTS (avoid circular dependency)
// ============================================================================

// Define Prisma objects manually to avoid circular dependencies
const UserObject = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    firstName: t.exposeString('firstName', { nullable: true }),
    lastName: t.exposeString('lastName', { nullable: true }),
    isActive: t.exposeBoolean('isActive'),
    isVerified: t.exposeBoolean('isVerified'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    // Relations will be added after all objects are defined
  }),
});

const OrganizationObject = builder.prismaObject('Organization', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    description: t.exposeString('description', { nullable: true }),
    isActive: t.exposeBoolean('isActive'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

const OrganizationUserObject = builder.prismaObject('OrganizationUser', {
  fields: (t) => ({
    id: t.exposeID('id'),
    role: t.expose('role', { type: OrganizationRole }),
    permissions: t.expose('permissions', { type: [OrganizationPermission] }),
    isActive: t.exposeBoolean('isActive'),
    joinedAt: t.expose('joinedAt', { type: 'DateTime' }),
    user: t.relation('user'),
    organization: t.relation('organization'),
  }),
});

const ProjectObject = builder.prismaObject('Project', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    isArchived: t.exposeBoolean('isArchived'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    organization: t.relation('organization'),
  }),
});

const InvitationObject = builder.prismaObject('Invitation', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    role: t.expose('role', { type: OrganizationRole }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    organization: t.relation('organization'),
    inviter: t.relation('inviter'),
  }),
});

// Add relations to User and Organization after all objects are defined
builder.prismaObjectField('User', 'currentOrganization', (t) =>
  t.relation('currentOrganization', { nullable: true })
);

builder.prismaObjectField('User', 'organizationUsers', (t) =>
  t.relation('organizationUsers')
);

builder.prismaObjectField('Organization', 'organizationUsers', (t) =>
  t.relation('organizationUsers')
);

builder.prismaObjectField('Organization', 'projects', (t) =>
  t.relation('projects')
);

// ============================================================================
// RESPONSE TYPES
// ============================================================================

const LoginResponse = builder.objectRef<{
  user: any;
  accessToken: string;
  refreshToken: string;
}>('LoginResponse');

const RegisterResponse = builder.objectRef<{
  user: any;
  organization?: any;
}>('RegisterResponse');

builder.objectType(LoginResponse, {
  fields: (t) => ({
    user: t.field({
      type: 'User',
      resolve: (parent) => parent.user,
    }),
    accessToken: t.exposeString('accessToken'),
    refreshToken: t.exposeString('refreshToken'),
  }),
});

builder.objectType(RegisterResponse, {
  fields: (t) => ({
    user: t.field({
      type: 'User',
      resolve: (parent) => parent.user,
    }),
    organization: t.field({
      type: 'Organization',
      nullable: true,
      resolve: (parent) => parent.organization,
    }),
  }),
});

// ============================================================================
// AUTH MUTATIONS
// ============================================================================

builder.mutationField('login', (t) =>
  t.field({
    type: LoginResponse,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (root, args, ctx) => {
      try {
        const result = await ctx.authService.login(
          args.email,
          args.password,
          ctx.ipAddress,
          ctx.userAgent
        );
        return result;
      } catch (error: any) {
        console.error('Login error:', error);
        throw new Error(error.message || 'Login failed');
      }
    },
  })
);

builder.mutationField('register', (t) =>
  t.field({
    type: RegisterResponse,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      firstName: t.arg.string(),
      lastName: t.arg.string(),
      organizationName: t.arg.string(),
    },
    resolve: async (root, args, ctx) => {
      try {
        const result = await ctx.authService.register(args);
        return result;
      } catch (error: any) {
        console.error('Registration error:', error);
        throw new Error(error.message || 'Registration failed');
      }
    },
  })
);

builder.mutationField('logout', (t) =>
  t.boolean({
    authScopes: { authenticated: true },
    resolve: async (root, args, ctx) => {
      try {
        if (ctx.session) {
          await ctx.authService.revokeSession(ctx.session.id);
        }
        return true;
      } catch (error) {
        console.error('Logout error:', error);
        return false;
      }
    },
  })
);

// ============================================================================
// USER QUERIES
// ============================================================================

builder.queryField('me', (t) =>
  t.field({
    type: 'User',
    nullable: true,
    authScopes: { authenticated: true },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.user) return null;
        return await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
        });
      } catch (error) {
        console.error('Me query error:', error);
        throw new Error('Failed to fetch user information');
      }
    },
  })
);

builder.queryField('myOrganizations', (t) =>
  t.field({
    type: ['Organization'],
    authScopes: { authenticated: true },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.user) return [];
        
        const orgUsers = await ctx.prisma.organizationUser.findMany({
          where: {
            userId: ctx.user.id,
            isActive: true,
          },
          include: {
            organization: true,
          },
        });
        
        return orgUsers.map(ou => ou.organization);
      } catch (error) {
        console.error('MyOrganizations query error:', error);
        throw new Error('Failed to fetch organizations');
      }
    },
  })
);

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

builder.queryField('projects', (t) =>
  t.field({
    type: ['Project'],
    authScopes: { authenticated: true },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.organization) return [];
        return await ctx.prisma.project.findMany({
          where: {
            organizationId: ctx.organization.id,
            isArchived: false,
          },
        });
      } catch (error) {
        console.error('Projects query error:', error);
        throw new Error('Failed to fetch projects');
      }
    },
  })
);

builder.mutationField('createProject', (t) =>
  t.field({
    type: 'Project',
    authScopes: { canCreateProjects: true },
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
    },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.organization) throw new Error('No organization context');
        return await ctx.prisma.project.create({
          data: {
            name: args.name,
            description: args.description,
            organizationId: ctx.organization.id,
          },
        });
      } catch (error: any) {
        console.error('Create project error:', error);
        throw new Error(error.message || 'Failed to create project');
      }
    },
  })
);

// ============================================================================
// ORGANIZATION MUTATIONS
// ============================================================================

builder.mutationField('switchOrganization', (t) =>
  t.field({
    type: 'Organization',
    authScopes: { authenticated: true },
    args: {
      organizationId: t.arg.string({ required: true }),
    },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.user) throw new Error('Not authenticated');
        
        const organization = await ctx.authService.switchOrganization(
          ctx.user.id,
          args.organizationId
        );
        
        return organization;
      } catch (error: any) {
        console.error('Switch organization error:', error);
        throw new Error(error.message || 'Failed to switch organization');
      }
    },
  })
);

builder.mutationField('inviteUserToOrganization', (t) =>
  t.field({
    type: 'Invitation',
    authScopes: { canManageUsers: true },
    args: {
      email: t.arg.string({ required: true }),
      role: t.arg({ type: OrganizationRole, required: true }),
    },
    resolve: async (root, args, ctx) => {
      try {
        if (!ctx.organization) throw new Error('No organization context');
        
        const invitation = await ctx.prisma.invitation.create({
          data: {
            email: args.email.toLowerCase(),
            organizationId: ctx.organization.id,
            invitedBy: ctx.user!.id,
            role: args.role,
            token: crypto.randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });
        
        return invitation;
      } catch (error: any) {
        console.error('Invite user error:', error);
        throw new Error(error.message || 'Failed to invite user');
      }
    },
  })
);

// Export the Prisma client instance as well
export { PrismaClient, prismaClient };