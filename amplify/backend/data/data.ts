import { defineData } from '@aws-amplify/backend';

export const data = defineData({
  models: {
    User: {
      fields: {
        name: 'String!',
        email: 'String!',
      },
    },
  },
});
