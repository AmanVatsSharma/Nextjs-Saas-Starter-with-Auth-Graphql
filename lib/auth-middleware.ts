import { AuthService, AuthContext } from './auth';
import { PrismaClient, OrganizationRole, OrganizationPermission } from '../prisma/generated/client';

export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: OrganizationRole[];
  permissions?: OrganizationPermission[];
  requireVerified?: boolean;
  requireOrganization?: boolean;
}

export class AuthMiddleware {
  constructor(
    private authService: AuthService,
    private prisma: PrismaClient
  ) {}

  async authenticate(
    authorization?: string,
    sessionToken?: string,
    options: AuthMiddlewareOptions = {}
  ): Promise<AuthContext> {
    const context: AuthContext = {};

    // Try JWT token first
    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.replace('Bearer ', '');
      const user = this.authService.verifyAccessToken(token);
      
      if (user) {
        context.user = user;
        
        // Get organization context if user has current organization
        if (user.currentOrganizationId) {
          const orgContext = await this.getOrganizationContext(
            user.id, 
            user.currentOrganizationId
          );
          context.organization = orgContext;
        }
      }
    }

    // Try session token if no JWT
    if (!context.user && sessionToken) {
      const session = await this.authService.validateSession(sessionToken);
      if (session?.user) {
        const user = session.user;
        context.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined,
          isActive: user.isActive,
          isVerified: user.isVerified,
          currentOrganizationId: user.currentOrganizationId || undefined,
        };
        
        context.session = {
          id: session.id,
          expiresAt: session.expiresAt,
        };

        // Get organization context
        if (user.currentOrganizationId) {
          const orgContext = await this.getOrganizationContext(
            user.id, 
            user.currentOrganizationId
          );
          context.organization = orgContext;
          if (orgContext) {
            context.user.organizationRole = orgContext.role;
            context.user.permissions = orgContext.permissions;
          }
        }
      }
    }

    // Apply authentication guards
    await this.applyGuards(context, options);

    return context;
  }

  private async getOrganizationContext(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership || !membership.isActive) {
      return null;
    }

    return {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      permissions: membership.permissions,
    };
  }

  private async applyGuards(context: AuthContext, options: AuthMiddlewareOptions) {
    // Authentication required
    if (options.required && !context.user) {
      throw new AuthError('Authentication required', 'UNAUTHENTICATED');
    }

    if (!context.user) return; // No further checks if not authenticated

    // Account verification required
    if (options.requireVerified && !context.user.isVerified) {
      throw new AuthError('Email verification required', 'UNVERIFIED');
    }

    // Account must be active
    if (!context.user.isActive) {
      throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }

    // Organization required
    if (options.requireOrganization && !context.organization) {
      throw new AuthError('Organization context required', 'NO_ORGANIZATION');
    }

    // Role-based access control
    if (options.roles && context.organization) {
      if (!options.roles.includes(context.organization.role)) {
        throw new AuthError(
          `Required role: ${options.roles.join(' or ')}`,
          'INSUFFICIENT_ROLE'
        );
      }
    }

    // Permission-based access control
    if (options.permissions && context.organization) {
      const hasPermission = options.permissions.some(permission =>
        context.organization!.permissions.includes(permission)
      );
      
      if (!hasPermission) {
        throw new AuthError(
          `Required permission: ${options.permissions.join(' or ')}`,
          'INSUFFICIENT_PERMISSIONS'
        );
      }
    }
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ============================================================================
// AUTHORIZATION HELPERS
// ============================================================================

export class AuthGuards {
  static requireAuth(options?: Omit<AuthMiddlewareOptions, 'required'>) {
    return { required: true, ...options };
  }

  static requireRole(...roles: OrganizationRole[]) {
    return { required: true, requireOrganization: true, roles };
  }

  static requirePermission(...permissions: OrganizationPermission[]) {
    return { required: true, requireOrganization: true, permissions };
  }

  static requireOwner() {
    return this.requireRole(OrganizationRole.OWNER);
  }

  static requireAdmin() {
    return this.requireRole(OrganizationRole.OWNER, OrganizationRole.ADMIN);
  }

  static requireVerified() {
    return { required: true, requireVerified: true };
  }

  static requireOrganization() {
    return { required: true, requireOrganization: true };
  }

  // Specific permission guards
  static canManageUsers() {
    return this.requirePermission(OrganizationPermission.MANAGE_USERS);
  }

  static canManageBilling() {
    return this.requirePermission(OrganizationPermission.MANAGE_BILLING);
  }

  static canManageOrganization() {
    return this.requirePermission(OrganizationPermission.MANAGE_ORGANIZATION);
  }

  static canCreateProjects() {
    return this.requirePermission(OrganizationPermission.CREATE_PROJECTS);
  }

  static canManageProjects() {
    return this.requirePermission(OrganizationPermission.MANAGE_PROJECTS);
  }

  static canDeleteProjects() {
    return this.requirePermission(OrganizationPermission.DELETE_PROJECTS);
  }

  static canManageApiKeys() {
    return this.requirePermission(OrganizationPermission.MANAGE_API_KEYS);
  }

  static canViewAnalytics() {
    return this.requirePermission(OrganizationPermission.VIEW_ANALYTICS);
  }
}

// ============================================================================
// RESOURCE OWNERSHIP CHECKS
// ============================================================================

export class ResourceGuards {
  constructor(private prisma: PrismaClient) {}

  async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          organizationUsers: {
            some: {
              userId,
              isActive: true,
            },
          },
        },
      },
    });

    return !!project;
  }

  async canModifyProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          organizationUsers: {
            some: {
              userId,
              isActive: true,
              OR: [
                { role: OrganizationRole.OWNER },
                { role: OrganizationRole.ADMIN },
                { permissions: { has: OrganizationPermission.MANAGE_PROJECTS } },
              ],
            },
          },
        },
      },
    });

    return !!project;
  }

  async canDeleteProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          organizationUsers: {
            some: {
              userId,
              isActive: true,
              OR: [
                { role: OrganizationRole.OWNER },
                { permissions: { has: OrganizationPermission.DELETE_PROJECTS } },
              ],
            },
          },
        },
      },
    });

    return !!project;
  }

  async canAccessOrganization(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    return !!(membership?.isActive);
  }

  async isOrganizationOwner(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    return membership?.role === OrganizationRole.OWNER && membership.isActive;
  }
}

// ============================================================================
// API KEY AUTHENTICATION
// ============================================================================

export class ApiKeyAuth {
  constructor(private prisma: PrismaClient) {}

  async validateApiKey(apiKey: string): Promise<{
    isValid: boolean;
    organizationId?: string;
    userId?: string;
    scopes?: string[];
    rateLimit?: number;
  }> {
    const keyRecord = await this.prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: {
        organization: {
          select: { id: true, isActive: true },
        },
        user: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!keyRecord || !keyRecord.isActive) {
      return { isValid: false };
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return { isValid: false };
    }

    if (!keyRecord.organization?.isActive || !keyRecord.user?.isActive) {
      return { isValid: false };
    }

    // Update last used timestamp
    await this.prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      isValid: true,
      organizationId: keyRecord.organizationId,
      userId: keyRecord.userId,
      scopes: keyRecord.scopes,
      rateLimit: keyRecord.rateLimit,
    };
  }

  async createApiKey(data: {
    name: string;
    organizationId: string;
    userId: string;
    scopes?: string[];
    rateLimit?: number;
    expiresAt?: Date;
  }) {
    const key = `sk_${crypto.randomBytes(24).toString('hex')}`;

    return this.prisma.apiKey.create({
      data: {
        name: data.name,
        key,
        organizationId: data.organizationId,
        userId: data.userId,
        scopes: data.scopes || [],
        rateLimit: data.rateLimit || 1000,
        expiresAt: data.expiresAt,
      },
    });
  }
}

// ============================================================================
// SUBSCRIPTION & FEATURE GUARDS
// ============================================================================

export class SubscriptionGuards {
  constructor(private prisma: PrismaClient) {}

  async canAccessFeature(
    organizationId: string,
    feature: string
  ): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!org?.subscription?.plan) {
      return false; // No active subscription
    }

    const planFeatures = org.subscription.plan.features as any;
    return planFeatures[feature] === true;
  }

  async checkUsageLimit(
    organizationId: string,
    resource: string,
    currentUsage: number
  ): Promise<{ allowed: boolean; limit?: number }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!org?.subscription?.plan) {
      return { allowed: false };
    }

    const planLimits = org.subscription.plan.limits as any;
    const limit = planLimits[resource];

    if (limit === undefined || limit === -1) {
      return { allowed: true }; // Unlimited
    }

    return {
      allowed: currentUsage < limit,
      limit,
    };
  }

  async incrementUsage(
    organizationId: string,
    resource: string,
    amount: number = 1
  ) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizations: { some: { id: organizationId } } },
    });
  
    if (subscription) {
      const currentUsage = (subscription.usageData as any) || {};
      currentUsage[resource] = (currentUsage[resource] || 0) + amount;

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { usageData: currentUsage },
      });
    }
  }
}