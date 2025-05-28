import { defineBackend } from '@aws-amplify/backend';
import { auth } from './backend/auth';

export const backend = defineBackend({
  auth,
});
