import { PrismaClient, OrganizationRole, OrganizationPermission, SubscriptionStatus } from './generated/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting SaaS database seed...');

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationUser.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany(); 
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  // Create subscription plans 
  const plans = await Promise.all([
    prisma.plan.create({
      data: {
        name: 'Starter', 
        description: 'Perfect for individuals and small teams',
        price: 0,
        currency: 'USD',
        interval: 'month',
        trialDays: 14,
        features: {
          projects: true,
          users: true,
          analytics: false,
          api: false,
          support: 'community',
        },
        limits: {
          projects: 3,
          users: 3,
          storage: 1000, // MB
          apiCalls: 1000,
        },
        isActive: true,
      },
    }),
    prisma.plan.create({
      data: {
        name: 'Pro',
        description: 'For growing teams and businesses',
        price: 29.00,
        currency: 'USD',
        interval: 'month',
        trialDays: 14,
        features: {
          projects: true,
          users: true,
          analytics: true,
          api: true,
          support: 'email',
        },
        limits: {
          projects: 25,
          users: 25,
          storage: 10000, // MB
          apiCalls: 10000,
        },
        isActive: true,
        isPopular: true,
      },
    }),
    prisma.plan.create({
      data: {
        name: 'Enterprise',
        description: 'For large organizations with advanced needs',
        price: 99.00,
        currency: 'USD',
        interval: 'month',
        trialDays: 30,
        features: {
          projects: true,
          users: true,
          analytics: true,
          api: true,
          support: 'priority',
          sso: true,
          audit: true,
        },
        limits: {
          projects: -1, // Unlimited
          users: -1,
          storage: -1,
          apiCalls: -1,
        },
        isActive: true,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} subscription plans`);

  // Create users with hashed passwords
  const users = await Promise.all([
    // Super Admin
    prisma.user.create({
      data: {
        email: 'admin@saas.com',
        passwordHash: await bcrypt.hash('admin123', 12),
        firstName: 'Super',
        lastName: 'Admin',
        isActive: true,
        isVerified: true,
      },
    }),
    // Company Owner
    prisma.user.create({
      data: {
        email: 'john@acme.com',
        passwordHash: await bcrypt.hash('password123', 12),
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        isVerified: true,
      },
    }),
    // Team Admin
    prisma.user.create({
      data: {
        email: 'jane@acme.com',
        passwordHash: await bcrypt.hash('password123', 12),
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
        isVerified: true,
      },
    }),
    // Team Member
    prisma.user.create({
      data: {
        email: 'mike@acme.com',
        passwordHash: await bcrypt.hash('password123', 12),
        firstName: 'Mike',
        lastName: 'Johnson',
        isActive: true,
        isVerified: true,
      },
    }),
    // Another Company Owner
    prisma.user.create({
      data: {
        email: 'sarah@techstartup.com',
        passwordHash: await bcrypt.hash('password123', 12),
        firstName: 'Sarah',
        lastName: 'Wilson',
        isActive: true,
        isVerified: true,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // Create subscriptions
  const subscriptions = await Promise.all([
    prisma.subscription.create({
      data: {
        status: SubscriptionStatus.ACTIVE,
        planId: plans[1].id, // Pro plan
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        usageData: {
          projects: 5,
          users: 4,
          storage: 2500,
          apiCalls: 1500,
        },
      },
    }),
    prisma.subscription.create({
      data: {
        status: SubscriptionStatus.TRIALING,
        planId: plans[0].id, // Starter plan
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        usageData: {
          projects: 1,
          users: 1,
          storage: 100,
          apiCalls: 50,
        },
      },
    }),
  ]);

  console.log(`✅ Created ${subscriptions.length} subscriptions`);

  // Create organizations
  const organizations = await Promise.all([
    prisma.organization.create({
      data: {
        name: 'Acme Corporation',
        slug: 'acme-corp',
        domain: 'acme.com',
        website: 'https://acme.com',
        description: 'Leading provider of innovative solutions',
        subscriptionId: subscriptions[0].id,
        settings: {
          allowInvitations: true,
          requireEmailVerification: true,
          twoFactorRequired: false,
        },
      },
    }),
    prisma.organization.create({
      data: {
        name: 'Tech Startup Inc',
        slug: 'tech-startup',
        domain: 'techstartup.com',
        website: 'https://techstartup.com',
        description: 'Disrupting the industry with cutting-edge technology',
        subscriptionId: subscriptions[1].id,
        settings: {
          allowInvitations: true,
          requireEmailVerification: true,
          twoFactorRequired: true,
        },
      },
    }),
  ]);

  console.log(`✅ Created ${organizations.length} organizations`);

  // Create organization memberships
  const orgMemberships = await Promise.all([
    // Acme Corporation
    prisma.organizationUser.create({
      data: {
        userId: users[1].id, // John
        organizationId: organizations[0].id,
        role: OrganizationRole.OWNER,
        permissions: Object.values(OrganizationPermission),
      },
    }),
    prisma.organizationUser.create({
      data: {
        userId: users[2].id, // Jane
        organizationId: organizations[0].id,
        role: OrganizationRole.ADMIN,
        permissions: [
          OrganizationPermission.MANAGE_USERS,
          OrganizationPermission.INVITE_USERS,
          OrganizationPermission.CREATE_PROJECTS,
          OrganizationPermission.MANAGE_PROJECTS,
          OrganizationPermission.VIEW_ANALYTICS,
        ],
      },
    }),
    prisma.organizationUser.create({
      data: {
        userId: users[3].id, // Mike
        organizationId: organizations[0].id,
        role: OrganizationRole.MEMBER,
        permissions: [
          OrganizationPermission.CREATE_PROJECTS,
          OrganizationPermission.MANAGE_PROJECTS,
        ],
      },
    }),
    // Tech Startup
    prisma.organizationUser.create({
      data: {
        userId: users[4].id, // Sarah
        organizationId: organizations[1].id,
        role: OrganizationRole.OWNER,
        permissions: Object.values(OrganizationPermission),
      },
    }),
  ]);

  console.log(`✅ Created ${orgMemberships.length} organization memberships`);

  // Set current organizations for users
  await Promise.all([
    prisma.user.update({
      where: { id: users[1].id },
      data: { currentOrganizationId: organizations[0].id },
    }),
    prisma.user.update({
      where: { id: users[2].id },
      data: { currentOrganizationId: organizations[0].id },
    }),
    prisma.user.update({
      where: { id: users[3].id },
      data: { currentOrganizationId: organizations[0].id },
    }),
    prisma.user.update({
      where: { id: users[4].id },
      data: { currentOrganizationId: organizations[1].id },
    }),
  ]);

  // Create projects
  const projects = await Promise.all([
    // Acme Corp projects
    prisma.project.create({
      data: {
        name: 'Customer Portal',
        description: 'Self-service portal for customers',
        organizationId: organizations[0].id,
        settings: {
          isPublic: false,
          requiresApproval: true,
        },
      },
    }),
    prisma.project.create({
      data: {
        name: 'Mobile App',
        description: 'iOS and Android mobile application',
        organizationId: organizations[0].id,
        settings: {
          isPublic: false,
          requiresApproval: false,
        },
      },
    }),
    prisma.project.create({
      data: {
        name: 'Analytics Dashboard',
        description: 'Real-time analytics and reporting',
        organizationId: organizations[0].id,
        settings: {
          isPublic: false,
          requiresApproval: true,
        },
      },
    }),
    // Tech Startup project
    prisma.project.create({
      data: {
        name: 'MVP Development',
        description: 'Minimum viable product for market validation',
        organizationId: organizations[1].id,
        settings: {
          isPublic: false,
          requiresApproval: false,
        },
      },
    }),
  ]);

  console.log(`✅ Created ${projects.length} projects`);

  // Create some pending invitations
  const invitations = await Promise.all([
    prisma.invitation.create({
      data: {
        email: 'alice@example.com',
        organizationId: organizations[0].id,
        invitedBy: users[1].id,
        role: OrganizationRole.MEMBER,
        token: 'invitation-token-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    }),
    prisma.invitation.create({
      data: {
        email: 'bob@example.com',
        organizationId: organizations[1].id,
        invitedBy: users[4].id,
        role: OrganizationRole.ADMIN,
        token: 'invitation-token-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    }),
  ]);

  console.log(`✅ Created ${invitations.length} invitations`);

  // Create sample audit logs
  const auditLogs = await Promise.all([
    prisma.auditLog.create({
      data: {
        userId: users[1].id,
        organizationId: organizations[0].id,
        action: 'LOGIN',
        resource: 'User',
        resourceId: users[1].id,
        metadata: {
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: users[1].id,
        organizationId: organizations[0].id,
        action: 'CREATE',
        resource: 'Project',
        resourceId: projects[0].id,
        metadata: {
          projectName: 'Customer Portal',
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: users[2].id,
        organizationId: organizations[0].id,
        action: 'INVITE',
        resource: 'User',
        resourceId: invitations[0].id,
        metadata: {
          invitedEmail: 'alice@example.com',
          role: 'MEMBER',
        },
      },
    }),
  ]);

  console.log(`✅ Created ${auditLogs.length} audit logs`);

  console.log('🎉 SaaS database seed completed successfully!');
  
  // Display summary
  console.log('\n📊 Summary:');
  console.log(`- ${plans.length} subscription plans`);
  console.log(`- ${users.length} users`);
  console.log(`- ${organizations.length} organizations`);
  console.log(`- ${orgMemberships.length} organization memberships`);
  console.log(`- ${projects.length} projects`);
  console.log(`- ${invitations.length} pending invitations`);
  console.log(`- ${auditLogs.length} audit log entries`);
  
  console.log('\n🔐 Test Accounts:');
  console.log('Super Admin: admin@saas.com / admin123');
  console.log('Acme Owner: john@acme.com / password123');
  console.log('Acme Admin: jane@acme.com / password123');
  console.log('Acme Member: mike@acme.com / password123');
  console.log('Startup Owner: sarah@techstartup.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });