import { createSchema } from "@pothos/core";
import { createYoga } from "graphql-yoga";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const schema = createSchema({
  typeDefs: `
    scalar DateTime

    type Query {
      products: [Product]
    }

    type Mutation {
      createProduct(name: String!): Product
    }

    type Product {
      id: Int!
      name: String!
      createdAt: DateTime!
    }
  `,
  resolvers: {
    Query: {
      products: async () => await prisma.product.findMany(),
    },
    Mutation: {
      createProduct: async (_parent:any, args:any) => {
        return await prisma.product.create({
          data: { name: args.name },
        });
      },
    },
  },
});

const server = createYoga({
  schema,
});  

export default server;
 