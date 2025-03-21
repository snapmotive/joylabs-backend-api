# Security Best Practices

## Environment Variables & Secrets

### Local Development
1. **NEVER commit .env or .env.* files to the repository**
   - These files are in .gitignore for a reason
   - Use .env.template as a reference and create your own .env.local

2. **Use setup-env.js script**
   - Run `npm run setup-env` to create a secure local environment
   - This will generate random JWT secrets for you

3. **Testing**
   - Use `npm run test:oauth` which loads env variables safely from .env.local

### Production Environment
1. **AWS Secrets Manager**
   - All production secrets are stored in AWS Secrets Manager
   - Set up with `node scripts/setup-aws-secrets.js`

2. **Environment-specific secrets**
   - Each environment (dev, staging, production) has its own set of secrets
   - Reference format in serverless.yml: `${ssm:/joylabs/${self:provider.stage}/secret-name~true}`

3. **Access Controls**
   - IAM policies limit access to secrets
   - Only deployment pipelines and the application itself have access

## Deployment Security

1. **Deployment Credentials**
   - Use minimal IAM permissions for deployment
   - Rotate access keys regularly

2. **CI/CD Security**
   - Never expose secrets in CI/CD logs
   - Use secure environment variables in CI/CD systems

## Code Security

1. **Dependencies**
   - Regularly update dependencies with `npm audit fix`
   - Use npm audit to check for vulnerabilities

2. **Input Validation**
   - All user input is validated before use
   - Use Joi for validation schemas

3. **JWT Best Practices**
   - Short expiration times
   - Secure signing with strong secrets
   - Include only necessary data in payload

## API Security

1. **Rate Limiting**
   - Implement API Gateway usage plans
   - Set reasonable rate limits in serverless.yml

2. **Authentication & Authorization**
   - JWT verification on protected routes
   - Role-based access control

## Square API Security

1. **OAuth Implementation**
   - PKCE for mobile flows
   - State parameter validation
   - Secure storage of tokens

2. **Token Management**
   - Secure storage in database
   - Auto-refresh mechanism for expired tokens
   - Proper revocation on logout

## Report Security Issues

If you discover a security vulnerability, please email security@joylabs.com instead of using the issue tracker. 