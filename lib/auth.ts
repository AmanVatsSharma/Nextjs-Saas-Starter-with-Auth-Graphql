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

}