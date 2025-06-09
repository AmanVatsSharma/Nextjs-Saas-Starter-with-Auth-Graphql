import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient, OrganizationRole, OrganizationPermission } from '../prisma/generated/client';

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  isVerified: boolean;
  currentOrganizationId?: string;
  organizationRole?: OrganizationRole;
  permissions?: OrganizationPermission[];
}

export interface AuthContext {
  user?: AuthUser;
  organization?: {
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
    permissions: OrganizationPermission[];
  };
  session?: {
    id: string;
    expiresAt: Date;
  };
}

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================

  generateAccessToken(user: AuthUser): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        organizationId: user.currentOrganizationId,
        role: user.organizationRole,
        permissions: user.permissions,
        type: 'access',
      },
      process.env.JWT_SECRET!,
      { 
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        issuer: process.env.JWT_ISSUER || 'your-saas-app',
        audience: process.env.JWT_AUDIENCE || 'your-saas-users',
      }
    );
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign(
      { sub: userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET!,
      { 
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        issuer: process.env.JWT_ISSUER || 'your-saas-app',
      }
    );
  }

  verifyAccessToken(token: string): AuthUser | null {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (decoded.type !== 'access') return null;
      
      return {
        id: decoded.sub,
        email: decoded.email,
        isActive: true,
        isVerified: true,
        currentOrganizationId: decoded.organizationId,
        organizationRole: decoded.role,
        permissions: decoded.permissions,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    // Rate limiting check
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        currentOrganization: {
          include: {
            organizationUsers: {
              where: { userId: { equals: undefined } }, // Will be set after we get the user
              include: { user: true }
            }
          }
        }
      }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Check if user is active and verified
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    if (user.isSuspended) {
      throw new Error('Account is suspended');
    }

    if (!user.isVerified) {
      throw new Error('Please verify your email address');
    }

    // Verify password
    if (!user.passwordHash || !(await this.verifyPassword(password, user.passwordHash))) {
      // Increment failed login attempts
      await this.incrementFailedLogins(user.id);
      throw new Error('Invalid credentials');
    }

    // Reset failed login attempts on successful login
    await this.resetFailedLogins(user.id);

    // Get organization membership
    const orgMembership = user.currentOrganizationId 
      ? await this.prisma.organizationUser.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: user.currentOrganizationId
            }
          }
        })
      : null;

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      isActive: user.isActive,
      isVerified: user.isVerified,
      currentOrganizationId: user.currentOrganizationId || undefined,
      organizationRole: orgMembership?.role,
      permissions: orgMembership?.permissions,
    };

    // Create session
    const session = await this.createSession(user.id, ipAddress, userAgent);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Log audit event
    await this.logAuditEvent(user.id, user.currentOrganizationId, 'LOGIN', 'User', user.id, {
      ipAddress,
      userAgent
    });

    return {
      user: authUser,
      accessToken: this.generateAccessToken(authUser),
      refreshToken: this.generateRefreshToken(user.id),
      session,
    };
  }

  async register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    organizationName?: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await this.hashPassword(data.password);

    // Create user and organization in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
        }
      });

      // Create organization if provided
      let organization = null;
      if (data.organizationName) {
        const slug = data.organizationName.toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        organization = await tx.organization.create({
          data: {
            name: data.organizationName,
            slug: `${slug}-${crypto.randomBytes(4).toString('hex')}`,
          }
        });

        // Add user as organization owner
        await tx.organizationUser.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: OrganizationRole.OWNER,
            permissions: Object.values(OrganizationPermission),
          }
        });

        // Set as current organization
        await tx.user.update({
          where: { id: user.id },
          data: { currentOrganizationId: organization.id }
        });
      }

      return { user, organization };
    });

    // Send verification email
    await this.sendVerificationEmail(result.user.email);

    return result;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  async createSession(userId: string, ipAddress?: string, userAgent?: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    return this.prisma.session.create({
      data: {
        sessionToken: crypto.randomBytes(32).toString('hex'),
        userId,
        ipAddress,
        userAgent,
        expiresAt,
      }
    });
  }

  async validateSession(sessionToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          include: {
            currentOrganization: {
              include: {
                organizationUsers: {
                  where: { userId: { equals: undefined } } // Will be filtered properly
                }
              }
            }
          }
        }
      }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    return session;
  }

  async revokeSession(sessionToken: string) {
    await this.prisma.session.update({
      where: { sessionToken },
      data: { isActive: false }
    });
  }

  // ============================================================================
  // ORGANIZATION & MULTI-TENANCY
  // ============================================================================

  async switchOrganization(userId: string, organizationId: string) {
    // Verify user is member of organization
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      },
      include: {
        organization: true
      }
    });

    if (!membership || !membership.isActive) {
      throw new Error('Not a member of this organization');
    }

    // Update current organization
    await this.prisma.user.update({
      where: { id: userId },
      data: { currentOrganizationId: organizationId }
    });

    return membership.organization;
  }

  async getUserPermissions(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId 
        }
      }
    });

    return {
      role: membership?.role,
      permissions: membership?.permissions || [],
      isActive: membership?.isActive || false, 
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async incrementFailedLogins(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { loginAttempts: true }
    });

    const attempts = (user?.loginAttempts || 0) + 1;
    const lockUntil = attempts >= 5 
      ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
      : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: attempts,
        lockedUntil: lockUntil
      }
    });
  }

  private async resetFailedLogins(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: 0,
        lockedUntil: null
      }
    });
  }

  private async sendVerificationEmail(email: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    await this.prisma.verificationToken.create({
      data: {
        email,
        token,
        type: 'EMAIL_VERIFICATION',
        expiresAt
      }
    });

    // TODO: Send email with verification link
    console.log(`Verification email sent to ${email} with token: ${token}`);
  }

  private async logAuditEvent(
    userId: string,
    organizationId: string | null,
    action: string,
    resource: string,
    resourceId: string,
    metadata: any = {}
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        resource,
        resourceId,
        metadata,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      }
    });
  }
}