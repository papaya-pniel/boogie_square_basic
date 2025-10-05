import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: { 
    email: true,
    externalProviders: {
      callbackUrls: ['http://localhost:5173', 'https://main.dvzr179hkw8yb.amplifyapp.com'],
      logoutUrls: ['http://localhost:5173', 'https://main.dvzr179hkw8yb.amplifyapp.com'],
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['email', 'profile']
      }
    }
  }
});
