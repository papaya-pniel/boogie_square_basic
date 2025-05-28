import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource'; // Notice the new path
import { customDomainStack } from './custom-domain/resource';
import { addCustomDomain } from './custom-domain/resource';

export const backend = defineBackend({
  auth,
  cdk: customDomainStack, // Register the CDK stack
});

const customStack = backend.createStack('CustomResources');
addCustomDomain(customStack);