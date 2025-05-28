import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource'; // Notice the new path

export const backend = defineBackend({
  auth,
});
