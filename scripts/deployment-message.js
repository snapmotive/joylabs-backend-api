/**
 * Deployment Message Generator for Joylabs Backend API
 * 
 * Usage: node deployment-message.js --stage=production
 */

// Format the output with colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Parse command line arguments
const args = {};
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    args[key] = value || true;
  }
});

// Get environment
const stage = args.stage || 'development';
const isProduction = stage === 'production';

// Generate deployment message
function generateDeploymentMessage() {
  const apiBase = isProduction 
    ? 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production' 
    : 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/dev';
  
  console.log(`
${colors.bright}${colors.green}===================================================
🚀 JOYLABS BACKEND API DEPLOYMENT INFORMATION
===================================================${colors.reset}

${colors.bright}Environment:${colors.reset} ${isProduction ? colors.yellow + 'PRODUCTION' : colors.green + 'Development'}${colors.reset}

${colors.bright}${colors.blue}API Endpoints:${colors.reset}
- Base URL: ${apiBase}
- Auth: ${apiBase}/api/auth
- Square OAuth URL: ${apiBase}/api/auth/square
- Square Callback URL: ${apiBase}/api/auth/square/callback
- Square Webhook URL: ${apiBase}/api/webhooks/square

${colors.bright}${colors.magenta}Important URLs for Square Dashboard:${colors.reset}
- OAuth Redirect URL: ${apiBase}/api/auth/square/callback
  ${colors.yellow}(Configure this in Square Developer Dashboard)${colors.reset}
- Webhook URL: ${apiBase}/api/webhooks/square
  ${colors.yellow}(Configure this in Square Developer Dashboard)${colors.reset}

${colors.bright}${colors.cyan}AWS Resources:${colors.reset}
- Secret Name: square-credentials-${stage}
- DynamoDB Tables: joylabs-backend-api-v3-* (with ${stage} suffix)

${colors.bright}${colors.green}PKCE OAuth Flow:${colors.reset}
The OAuth integration has been implemented with PKCE (Proof Key for Code Exchange)
for enhanced security. This is especially important for mobile apps.

${colors.bright}${colors.yellow}Need to update Square credentials?${colors.reset}
Run: ${colors.cyan}node scripts/update-square-secrets.js --stage=${stage}${colors.reset}

${colors.bright}${colors.green}===================================================
`);
}

// Run the script
generateDeploymentMessage(); 