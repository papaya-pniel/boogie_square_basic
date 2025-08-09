import { defineStorage } from '@aws-amplify/backend-storage';

export const storage = defineStorage({
  name: 'boogie-square-storage',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
    'protected/*': [allow.authenticated.to(['read', 'write', 'delete'])],
    'private/*':   [allow.authenticated.to(['read', 'write', 'delete'])],
    // Optional: enable listing at folder level
    // 'public':    [allow.guest.to(['list']), allow.authenticated.to(['list'])],
  }),
});