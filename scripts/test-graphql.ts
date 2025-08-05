// scripts/test-graphql.ts - GraphQL API testing
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/graphql';

interface GraphQLResponse {
  data?: any;
  errors?: Array<{ message: string; locations?: any; path?: any }>;
}

async function graphqlRequest(query: string, variables = {}, headers = {}): Promise<GraphQLResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });

  return response.json() as Promise<GraphQLResponse>;
}

async function testGraphQLAPI() {
  console.log('🧪 Testing GraphQL API...\n');
  console.log(`📡 API URL: ${API_URL}\n`);

  let accessToken = '';

  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check...');
  try {
    const result = await graphqlRequest(`
      query HealthCheck {
        health
      }
    `);

    if (result.data?.health === 'OK') {
      console.log('✅ Health check passed');
    } else {
      console.error('❌ Health check failed:', result);
    }
  } catch (error: any) {
    console.error('❌ Health check error:', error.message);
  }

  // Test 2: User Registration
  console.log('\n2️⃣ Testing User Registration...');
  try {
    const result = await graphqlRequest(`
      mutation Register {
        register(
          email: "graphql-test@example.com"
          password: "TestPassword123!"
          firstName: "GraphQL"
          lastName: "Test"
          organizationName: "GraphQL Test Org"
        ) {
          user {
            id
            email
            firstName
            lastName
            isVerified
          }
          organization {
            id
            name
            slug
          }
        }
      }
    `);

    if (result.data?.register) {
      console.log('✅ Registration successful:', {
        userId: result.data.register.user.id,
        email: result.data.register.user.email,
        orgName: result.data.register.organization.name,
      });
    } else {
      console.log('⚠️ Registration result:', result);
    }
  } catch (error: any) {
    console.error('❌ Registration error:', error.message);
  }

  // Test 3: User Login
  console.log('\n3️⃣ Testing User Login...');
  try {
    const result = await graphqlRequest(`
      mutation Login {
        login(
          email: "graphql-test@example.com"
          password: "TestPassword123!"
        ) {
          user {
            id
            email
            firstName
            lastName
          }
          accessToken
          refreshToken
        }
      }
    `);

    if (result.data?.login?.accessToken) {
      accessToken = result.data.login.accessToken;
      console.log('✅ Login successful:', {
        userId: result.data.login.user.id,
        email: result.data.login.user.email,
        hasToken: !!accessToken,
      });
    } else {
      console.error('❌ Login failed:', result);
    }
  } catch (error: any) {
    console.error('❌ Login error:', error.message);
  }

  // Test 4: Authenticated Query (Me)
  console.log('\n4️⃣ Testing Authenticated Query...');
  if (accessToken) {
    try {
      const result = await graphqlRequest(
        `
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
            }
          }
        }
        `,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );

      if (result.data?.me) {
        console.log('✅ Authenticated query successful:', {
          userId: result.data.me.id,
          email: result.data.me.email,
          orgName: result.data.me.currentOrganization?.name,
        });
      } else {
        console.error('❌ Authenticated query failed:', result);
      }
    } catch (error: any) {
      console.error('❌ Authenticated query error:', error.message);
    }
  }

  // Test 5: Organizations Query
  console.log('\n5️⃣ Testing Organizations Query...');
  if (accessToken) {
    try {
      const result = await graphqlRequest(
        `
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
        `,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );

      if (result.data?.myOrganizations) {
        console.log('✅ Organizations query successful:', {
          count: result.data.myOrganizations.length,
          organizations: result.data.myOrganizations.map((org: any) => ({
            name: org.name,
            slug: org.slug,
          })),
        });
      } else {
        console.error('❌ Organizations query failed:', result);
      }
    } catch (error: any) {
      console.error('❌ Organizations query error:', error.message);
    }
  }

  // Test 6: Create Project (Permission-based)
  console.log('\n6️⃣ Testing Project Creation...');
  if (accessToken) {
    try {
      const result = await graphqlRequest(
        `
        mutation CreateProject {
          createProject(
            name: "Test GraphQL Project"
            description: "A project created via GraphQL test"
          ) {
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
        `,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );

      if (result.data?.createProject) {
        console.log('✅ Project creation successful:', {
          projectId: result.data.createProject.id,
          name: result.data.createProject.name,
          orgName: result.data.createProject.organization.name,
        });
      } else {
        console.log('⚠️ Project creation result:', result);
      }
    } catch (error: any) {
      console.error('❌ Project creation error:', error.message);
    }
  }

  // Test 7: Projects Query
  console.log('\n7️⃣ Testing Projects Query...');
  if (accessToken) {
    try {
      const result = await graphqlRequest(
        `
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
        `,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );

      if (result.data?.projects) {
        console.log('✅ Projects query successful:', {
          count: result.data.projects.length,
          projects: result.data.projects.map((project: any) => ({
            name: project.name,
            description: project.description?.substring(0, 50) + '...',
          })),
        });
      } else {
        console.error('❌ Projects query failed:', result);
      }
    } catch (error: any) {
      console.error('❌ Projects query error:', error.message);
    }
  }

  // Test 8: Test Autocrud Operations (if available)
  console.log('\n8️⃣ Testing Autocrud Operations...');
  if (accessToken) {
    try {
      // Test findManyProject
      const result = await graphqlRequest(
        `
        query FindManyProjects {
          findManyProject(
            where: { isArchived: false }
            orderBy: { createdAt: desc }
            take: 5
          ) {
            id
            name
            description
            createdAt
          }
        }
        `,
        {},
        { Authorization: `Bearer ${accessToken}` }
      );

      if (result.data?.findManyProject) {
        console.log('✅ Autocrud findMany successful:', {
          count: result.data.findManyProject.length,
        });
      } else if (result.errors) {
        console.log('⚠️ Autocrud not available (expected if not generated):', 
          result.errors[0]?.message);
      }
    } catch (error: any) {
      console.log('⚠️ Autocrud test skipped:', error.message);
    }
  }

  // Test 9: Unauthorized Access
  console.log('\n9️⃣ Testing Unauthorized Access...');
  try {
    const result = await graphqlRequest(`
      query Me {
        me {
          id
          email
        }
      }
    `);

    if (result.errors) {
      console.log('✅ Unauthorized access properly blocked:', result.errors[0]?.message);
    } else {
      console.error('❌ Unauthorized access should be blocked');
    }
  } catch (error: any) {
    console.error('❌ Unauthorized access test error:', error.message);
  }

  // Test 10: Rate Limiting
  console.log('\n🔟 Testing Rate Limiting...');
  console.log('⚠️ Making multiple rapid requests...');
  
  const promises = Array.from({ length: 10 }, (_, i) =>
    graphqlRequest(`query Health${i} { health }`)
  );

  try {
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.data?.health === 'OK').length;
    const errorCount = results.filter(r => r.errors).length;
    
    console.log(`✅ Rate limiting test complete: ${successCount} success, ${errorCount} errors`);
  } catch (error: any) {
    console.log('⚠️ Rate limiting may have kicked in:', error.message);
  }

  console.log('\n🎯 GraphQL API testing complete!');
}

// Check if we can import node-fetch
async function checkDependencies() {
  try {
    // Try to use built-in fetch if available (Node 18+)
    if (typeof fetch === 'undefined') {
      const { default: nodeFetch } = await import('node-fetch');
      (global as any).fetch = nodeFetch;
    }
    return true;
  } catch (error) {
    console.error('❌ Missing node-fetch dependency. Install with: npm install node-fetch @types/node-fetch');
    return false;
  }
}

async function main() {
  const hasRequiredDeps = await checkDependencies();
  if (hasRequiredDeps) {
    await testGraphQLAPI();
  }
}

main().catch(console.error);