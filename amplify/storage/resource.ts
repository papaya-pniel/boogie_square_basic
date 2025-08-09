import { defineStorage } from '@aws-amplify/backend-storage';

export const storage = defineStorage({
  name: 'boogie-square-storage',
  accessControl: {
    authenticated: {
      access: ['create', 'read', 'update', 'delete', 'list']
    },
    guest: {
      access: ['read']
    }
  }
}); 