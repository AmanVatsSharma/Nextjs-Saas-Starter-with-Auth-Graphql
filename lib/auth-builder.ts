import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
// @ts-ignore
import type PrismaTypes from '../generated/pothos-types';
import { PrismaClient, OrganizationRole, OrganizationPermission } from '../prisma/generated/client';
import { AuthContext, AuthService } from './auth';
import { AuthMiddleware, AuthGuards, AuthError } from './auth-middleware';
import { DateTimeResolver } from 'graphql-scalars';

export interface SaaSContext extends AuthContext {
  prisma: PrismaClient;
  authService: AuthService;
  authMiddleware: AuthMiddleware;
  ipAddress?: string;
  userAgent?: string;
}

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: SaaSContext;
  AuthScopes: {
    // Basic auth scopes
    authenticated: boolean;
    verified: boolean;
    active: boolean;
    
    // Organization scopes
    hasOrganization: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    isMember: boolean;
    
    // Permission-based scopes
    canManageUsers: boolean;
    canManageBilling: boolean;
    canManageOrganization: boolean;
    canCreateProjects: boolean;
    canManageProjects: boolean;
    canDeleteProjects: boolean;
    canManageApiKeys: boolean;
    canViewAnalytics: boolean;
    
    // Resource-specific scopes (dynamic)
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
    client: (ctx: SaaSContext) => ctx.prisma,
    filterConnectionTotalCount: true,
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
  authScopes: async (context) => {
    const { user, organization } = context;
    
    return {
      // Basic authentication
      authenticated: !!user,
      verified: user?.isVerified || false,
      active: user?.isActive || false,
      
      // Organization membership
      hasOrganization: !!organization,
      isOwner: organization?.role === OrganizationRole.OWNER,
      isAdmin: [OrganizationRole.OWNER, OrganizationRole.ADMIN].includes(organization?.role as OrganizationRole),
      isMember: !!organization?.role,
      
      // Permission-based authorization
      canManageUsers: organization?.permissions?.includes(OrganizationPermission.MANAGE_USERS) || false,
      canManageBilling: organization?.permissions?.includes(OrganizationPermission.MANAGE_BILLING) || false,
      canManageOrganization: organization?.permissions?.includes(OrganizationPermission.MANAGE_ORGANIZATION) || false,
      canCreateProjects: organization?.permissions?.includes(OrganizationPermission.CREATE_PROJECTS) || false,
      canManageProjects: organization?.permissions?.includes(OrganizationPermission.MANAGE_PROJECTS) || false,
      canDeleteProjects: organization?.permissions?.includes(OrganizationPermission.DELETE_PROJECTS) || false,
      canManageApiKeys: organization?.permissions?.includes(OrganizationPermission.MANAGE_API_KEYS) || false,
      canViewAnalytics: organization?.permissions?.includes(OrganizationPermission.VIEW_ANALYTICS) || false,
      
      // These will be evaluated dynamically per field
      canAccessResource: false,
      canModifyResource: false,
      canDeleteResource: false,
    };
  },
  validation: {
    validationError: (zodError) => {
      throw new Error(`Validation error: ${zodError.message}`);
    },
  },
});

// Add custom scalars
builder.addScalarType('DateTime', DateTimeResolver, {});

// Add enums
builder.enumType(OrganizationRole, {
  name: 'OrganizationRole',
  description: 'Organization member roles',
});

builder.enumType(OrganizationPermission, {
  name: 'OrganizationPermission',
  description: 'Organization permissions',
});

// Base types
builder.queryType({
  description: 'The root query type',
});

builder.mutationType({
  description: 'The root mutation type',
});

// ============================================================================
// AUTHENTICATION MUTATIONS
// ============================================================================

builder.mutationField('login', (t) =>
  t.field({
    type: builder.objectRef<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>('LoginResponse'),
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
        throw new Error(error.message);
      }
    },
  })
);

builder.mutationField('register', (t) =>
  t.field({
    type: builder.objectRef<{
      user: any;
      organization?: any;
    }>('RegisterResponse'),
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
        throw new Error(error.message);
      }
    },
  })
);

builder.mutationField('logout', (t) =>
  t.boolean({
    authScopes: { authenticated: true },
    resolve: async (root, args, ctx) => {
      if (ctx.session) {
        await ctx.authService.revokeSession(ctx.session.id);
      }
      return true;
    },
  })
);

// ============================================================================
// USER QUERIES
// ============================================================================

builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    authScopes: { authenticated: true },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) return null;
      
      return ctx.prisma.user.findUnique({
        ...query,
        where: { id: ctx.user.id },
      });
    },
  })
);

builder.queryField('myOrganizations', (t) =>
  t.prismaField({
    type: ['Organization'],
    authScopes: { authenticated: true },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) return [];
      
      const orgUsers = await ctx.prisma.organizationUser.findMany({
        where: {
          userId: ctx.user.id,
          isActive: true,
        },
        include: {
          organization: query,
        },
      });
      
      return orgUsers.map(ou => ou.organization);
    },
  })
);

// ============================================================================
// ORGANIZATION MUTATIONS
// ============================================================================

builder.mutationField('switchOrganization', (t) =>
  t.prismaField({
    type: 'Organization',
    authScopes: { authenticated: true },
    args: {
      organizationId: t.arg.string({ required: true }),
    },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) throw new Error('Not authenticated');
      
      const organization = await ctx.authService.switchOrganization(
        ctx.user.id,
        args.organizationId
      );
      
      return ctx.prisma.organization.findUnique({
        ...query,
        where: { id: organization.id },
      });
    },
  })
);

builder.mutationField('inviteUserToOrganization', (t) =>
  t.prismaField({
    type: 'Invitation',
    authScopes: { canManageUsers: true },
    args: {
      email: t.arg.string({ required: true }),
      role: t.arg({ type: OrganizationRole, required: true }),
    },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.organization) throw new Error('No organization context');
      
      const invitation = await ctx.prisma.invitation.create({
        ...query,
        data: {
          email: args.email.toLowerCase(),
          organizationId: ctx.organization.id,
          invitedBy: ctx.user!.id,
          role: args.role,
          token: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
      
      // TODO: Send invitation email
      
      return invitation;
    },
  })
);

// ============================================================================
// RESPONSE TYPES
// ============================================================================

builder.objectType('LoginResponse', {
  fields: (t) => ({
    user: t.prismaField({
      type: 'User',
      resolve: (parent: any) => parent.user,
    }),
    accessToken: t.exposeString('accessToken'),
    refreshToken: t.exposeString('refreshToken'),
  }),
});

builder.objectType('RegisterResponse', {
  fields: (t) => ({
    user: t.prismaField({
      type: 'User',
      resolve: (parent: any) => parent.user,
    }),
    organization: t.prismaField({
      type: 'Organization',
      nullable: true,
      resolve: (parent: any) => parent.organization,
    }),
  }),
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

builder.objectType(Error, {
  name: 'Error',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

// ============================================================================
// RESOURCE-SPECIFIC AUTHORIZATION HELPERS
// ============================================================================

export const withResourceAuth = {
  project: {
    canAccess: (projectId: string) => ({
      authScopes: {
        authenticated: true,
        canAccessResource: async (root: any, args: any, ctx: SaaSContext) => {
          const resourceGuards = new (await import('./auth-middleware')).ResourceGuards(ctx.prisma);
          return resourceGuards.canAccessProject(ctx.user!.id, projectId);
        },
      },
    }),
    
    canModify: (projectId: string) => ({
      authScopes: {
        authenticated: true,
        canModifyResource: async (root: any, args: any, ctx: SaaSContext) => {
          const resourceGuards = new (await import('./auth-middleware')).ResourceGuards(ctx.prisma);
          return resourceGuards.canModifyProject(ctx.user!.id, projectId);
        },
      },
    }),
    
    canDelete: (projectId: string) => ({
      authScopes: {
        authenticated: true,
        canDeleteResource: async (root: any, args: any, ctx: SaaSContext) => {
          const resourceGuards = new (await import('./auth-middleware')).ResourceGuards(ctx.prisma);
          return resourceGuards.canDeleteProject(ctx.user!.id, projectId);
        },
      },
    }),
  },
};

export { PrismaClient };