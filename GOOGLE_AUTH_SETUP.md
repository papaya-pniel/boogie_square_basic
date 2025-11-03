# Google Auth Setup Guide

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add authorized origins:
   - `http://localhost:5173` (for development)
   - `https://your-domain.com` (for production)
7. Add authorized redirect URIs:
   - `http://localhost:5173` (for development)
   - `https://your-domain.com` (for production)
8. Copy the Client ID and Client Secret

## Step 2: Update Amplify Configuration

Replace the placeholders in `amplify_outputs.json`:

```json
{
  "auth": {
    "social_providers": {
      "google": {
        "client_id": "YOUR_ACTUAL_GOOGLE_CLIENT_ID",
        "client_secret": "YOUR_ACTUAL_GOOGLE_CLIENT_SECRET"
      }
    }
  }
}
```

## Step 3: Test the Integration

1. Start your development server
2. Click "Sign in with Google" button
3. Complete Google OAuth flow
4. Verify user data is displayed correctly

## Features Added

- ✅ Google OAuth integration
- ✅ Anonymous user fallback
- ✅ Sign in/out functionality
- ✅ User profile display
- ✅ Backward compatibility

## User Experience

- **Anonymous users**: Can still use the app without signing in
- **Google users**: Get persistent identity and better UX
- **Seamless transition**: Existing functionality preserved




