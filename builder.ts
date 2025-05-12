import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import ValidationPlugin from '@pothos/plugin-validation';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
// @ts-ignore
import type PrismaTypes from '../generated/pothos-types';
import { PrismaClient } from './prisma/generated/client';
import * as Objects from './generated/objects';

export interface Context {
  prisma: PrismaClient;
  user?: {
    id: string;
    role: string;
  };
}

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
  AuthScopes: {
    authenticated: boolean;
    admin: boolean;
    owner: boolean;
  };
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
  };
}>({
  plugins: [
    PrismaPlugin,
    RelayPlugin,
    ValidationPlugin,
    ScopeAuthPlugin,
  ],
  prisma: {
    client: new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    }),
    filterConnectionTotalCount: true,
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
  relay: {
    clientMutationId: 'omit',
    cursorType: 'String',
  },
});

// Base Query and Mutation types
builder.queryType({
  description: 'The root query type',
});

builder.mutationType({
  description: 'The root mutation type',
});

// Health check query
builder.queryField('health', (t) =>
  t.string({
    description: 'Health check endpoint',
    resolve: () => 'OK',
  })
);

// Current user query
builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) return null;
      return await ctx.prisma.user.findUnique({
        ...query,
        where: { id: ctx.user.id },
      });
    },
  })
);

// Only register model objects explicitly to avoid type errors
import {
  UserObject,
  AccountObject,
  SessionObject,
  VerificationTokenObject,
  OrganizationObject,
  OrganizationUserObject,
  InvitationObject,
  SubscriptionObject,
  PlanObject,
  InvoiceObject,
  AuditLogObject,
  ApiKeyObject,
  ProjectObject,
} from './generated/objects';
import { TagObject } from './generated/Tag';
import { CategoryObject } from './generated/Category';
import { CommentObject } from './generated/Comment';
import { PostObject } from './generated/Post';

builder.prismaObject('User', UserObject);
builder.prismaObject('Account', AccountObject);
builder.prismaObject('Session', SessionObject);
builder.prismaObject('VerificationToken', VerificationTokenObject);
builder.prismaObject('Organization', OrganizationObject);
builder.prismaObject('OrganizationUser', OrganizationUserObject);
builder.prismaObject('Invitation', InvitationObject);
builder.prismaObject('Subscription', SubscriptionObject);
builder.prismaObject('Plan', PlanObject);
builder.prismaObject('Invoice', InvoiceObject);
builder.prismaObject('AuditLog', AuditLogObject);
builder.prismaObject('ApiKey', ApiKeyObject);
builder.prismaObject('Project', ProjectObject);
builder.prismaObject('Tag', TagObject);
builder.prismaObject('Category', CategoryObject);
builder.prismaObject('Comment', CommentObject);
builder.prismaObject('Post', PostObject);

export { PrismaClient };