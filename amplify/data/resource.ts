import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  UserProfile: a
    .model({
      id: a.id(), // Automatically generates a unique ID
      name: a.string(),
      email: a.string(),
    })
    .authorization((allow) => [allow.owner()]), // Ensures only the owner can access their data
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});
