import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { addCustomDomain } from './custom-domain/resource'; // Updated name

export const backend = defineBackend({
  auth,
  data,
});

const customStack = backend.createStack('CustomDomainStack');
addCustomDomain(customStack); // Call the function with the stack
