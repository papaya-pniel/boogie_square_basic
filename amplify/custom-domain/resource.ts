// amplify/custom-domain.ts
import { Stack } from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';

export function addCustomDomain(stack: Stack) {
  new amplify.CfnDomain(stack, 'CustomDomain', {
    appId: 'd3u57muwt2eazh',       
    domainName: 'boogie-square.com', 
    subDomainSettings: [
      {
        branchName: 'main',        
        prefix: 'www',           
      },
    ],
  });
}