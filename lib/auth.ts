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
 

}