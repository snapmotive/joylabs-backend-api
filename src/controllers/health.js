const AWS = require('aws-sdk');

/**
 * Basic health check endpoint
 */
function checkHealth(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    message: 'API is up and running'
  });
}

/**
 * Detailed health check with AWS services status
 */
async function checkDetailedHealth(req, res) {
  try {
    const results = {
      api: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      },
      dynamoDB: { status: 'checking' },
      square: {
        config: {
          applicationId: process.env.SQUARE_APPLICATION_ID ? 'configured' : 'missing',
          environment: process.env.SQUARE_ENVIRONMENT || 'not set'
        }
      },
      env: {
        region: process.env.AWS_REGION || 'not set',
        apiBaseUrl: process.env.API_BASE_URL || 'not set'
      }
    };

    // Check DynamoDB connection
    const dynamoDb = process.env.IS_OFFLINE === 'true'
      ? new AWS.DynamoDB.DocumentClient({
          region: 'localhost',
          endpoint: 'http://localhost:8000'
        })
      : new AWS.DynamoDB.DocumentClient();

    try {
      // List tables to check connection
      if (process.env.IS_OFFLINE === 'true') {
        // For local DynamoDB, let's check if we can access the tables
        const USERS_TABLE = process.env.USERS_TABLE;
        const params = {
          TableName: USERS_TABLE,
          Limit: 1
        };
        await dynamoDb.scan(params).promise();
        results.dynamoDB = { status: 'ok', message: 'Connected to local DynamoDB' };
      } else {
        // For AWS DynamoDB, check the service
        const dynamoDBClient = new AWS.DynamoDB();
        const tables = await dynamoDBClient.listTables({}).promise();
        results.dynamoDB = { 
          status: 'ok', 
          message: 'Connected to AWS DynamoDB',
          tables: tables.TableNames.filter(table => table.includes('joylabs'))
        };
      }
    } catch (error) {
      results.dynamoDB = { 
        status: 'error', 
        message: `Failed to connect to DynamoDB: ${error.message}` 
      };
    }

    // Check Square API configuration
    if (process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET) {
      results.square.status = 'configured';
      
      // Add OAuth URL for testing
      const squareService = require('../services/square');
      const testState = 'test-state-parameter';
      results.square.testOAuthUrl = squareService.getAuthorizationUrl(testState);
    } else {
      results.square.status = 'not configured';
    }

    res.json(results);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
}

/**
 * Test page with links to test OAuth flow
 */
function renderTestPage(req, res) {
  const squareService = require('../services/square');
  const testState = 'test-state-parameter';
  const squareOAuthUrl = squareService.getAuthorizationUrl(testState);
  
  // Get the base URL for links
  const isLocalhost = req.get('host').includes('localhost');
  const baseUrl = isLocalhost ? process.env.API_BASE_URL : process.env.API_PROD_URL || req.protocol + '://' + req.get('host');
  
  // Ensure we show the correct environment
  const squareEnv = process.env.SQUARE_ENVIRONMENT || 'sandbox';
  const squareEnvDisplay = squareEnv === 'production' ? 'Production' : 'Sandbox';
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>JoyLabs Backend Test Page</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
          }
          h1 { color: #4CAF50; }
          h2 { margin-top: 30px; }
          .button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 10px 0;
          }
          .button.aws {
            background: #FF9900;
          }
          .info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
          }
          .env-var {
            display: flex;
            margin-bottom: 5px;
          }
          .env-var .key {
            font-weight: bold;
            min-width: 200px;
          }
          .env-var .value {
            font-family: monospace;
          }
          .good { color: #4CAF50; }
          .bad { color: #F44336; }
        </style>
      </head>
      <body>
        <h1>JoyLabs Backend Test Page</h1>
        
        <div class="card">
          <h2>Environment Information</h2>
          <div class="info">
            <div class="env-var">
              <div class="key">Environment:</div>
              <div class="value">${process.env.NODE_ENV || 'not set'}</div>
            </div>
            <div class="env-var">
              <div class="key">API Base URL:</div>
              <div class="value">${baseUrl}</div>
            </div>
            <div class="env-var">
              <div class="key">AWS Region:</div>
              <div class="value">${process.env.AWS_REGION || 'not set'}</div>
            </div>
            <div class="env-var">
              <div class="key">Running Offline:</div>
              <div class="value">${process.env.IS_OFFLINE === 'true' ? 'Yes' : 'No'}</div>
            </div>
            <div class="env-var">
              <div class="key">Square Environment:</div>
              <div class="value">${squareEnvDisplay}</div>
            </div>
            <div class="env-var">
              <div class="key">Square Application ID:</div>
              <div class="value">${process.env.SQUARE_APPLICATION_ID ? '✓ Configured' : '✗ Not configured'}</div>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>API Health Checks</h2>
          <p>Click the buttons below to check the health status of your API</p>
          <a href="${baseUrl}/api/health" class="button">Basic Health Check</a>
          <a href="${baseUrl}/api/health/detailed" class="button">Detailed Health Check</a>
          <a href="${baseUrl}/api/health/aws-diagnostic" class="button aws">AWS Diagnostic Tool</a>
        </div>
        
        <div class="card">
          <h2>Square OAuth Testing</h2>
          <p>Click the button below to test the Square OAuth flow</p>
          <a href="${squareOAuthUrl}" class="button">Test Square OAuth</a>
          <p class="info">
            This will redirect you to Square's authentication page. After authenticating, 
            you'll be redirected back to this application with an authentication token.
          </p>
        </div>

        <div class="card">
          <h2>AWS Deployment</h2>
          <p>Follow these steps to deploy your backend:</p>
          <ol>
            <li>Configure AWS credentials (already done if you're seeing this page)</li>
            <li>Run <code>serverless deploy</code> to deploy to AWS</li>
            <li>After deployment, update your .env file with the new API Gateway URL</li>
            <li>Update your Square Developer Dashboard with the new callback URL</li>
          </ol>
          <a href="${baseUrl}/api/health/aws-diagnostic" class="button aws">Run AWS Diagnostic</a>
        </div>

        <div class="card">
          <h2>Documentation</h2>
          <p>API Documentation and Square OAuth Integration</p>
          <a href="https://developer.squareup.com/docs/oauth-api/overview" target="_blank" class="button">Square OAuth Docs</a>
          <a href="https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml/" target="_blank" class="button">Serverless Docs</a>
        </div>
      </body>
    </html>
  `);
}

/**
 * OAuth Test Page
 */
const oauthTestPage = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>OAuth Test Page</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
            overflow: hidden;
          }
          button, .button {
            background: #4285f4;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 5px 0;
          }
          button:hover, .button:hover {
            background: #2b6fc5;
          }
          h1, h2 { margin-top: 0; }
          .code {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            font-family: monospace;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
          }
          #authResult {
            display: none;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Square OAuth Test</h1>
          <p>Use the buttons below to test different OAuth flows.</p>
          
          <h2>Web OAuth Flow</h2>
          <a href="/api/auth/square" class="button">Start Web OAuth</a>
          
          <h2>Web OAuth with Custom State (for testing)</h2>
          <a href="/api/auth/square?state=test-state-parameter" class="button">OAuth with Test State</a>
          
          <h2>Mobile App OAuth Flow</h2>
          <button id="mobileOAuthBtn">Simulate Mobile OAuth</button>
          <div id="authResult" class="card">
            <h2>Authorization Result</h2>
            <div id="authResultContent" class="code"></div>
          </div>
        </div>

        <script>
          document.getElementById('mobileOAuthBtn').addEventListener('click', async () => {
            try {
              // Step 1: Initialize OAuth parameters
              const initResponse = await fetch('/api/auth/square/mobile-init');
              const initData = await initResponse.json();
              
              console.log('OAuth Initialization:', initData);
              
              // Display the parameters
              document.getElementById('authResultContent').innerHTML = 
                'OAuth Parameters:' + 
                '\\n\\nState: ' + initData.state + 
                '\\n\\nCode Verifier: ' + initData.codeVerifier +
                '\\n\\nCode Challenge: ' + initData.codeChallenge +
                '\\n\\nAuthorization URL: ' + initData.authUrl;
              
              document.getElementById('authResult').style.display = 'block';
              
              // Step 2: In a real app, you would redirect to the auth URL
              if (confirm('Open the Square authorization URL?')) {
                window.open(initData.authUrl, '_blank');
              }
            } catch (error) {
              console.error('Error:', error);
              document.getElementById('authResultContent').innerHTML = 'Error: ' + error.message;
              document.getElementById('authResult').style.display = 'block';
            }
          });
        </script>
      </body>
    </html>
  `);
};

// Export all controller functions
module.exports = {
  checkHealth,
  checkDetailedHealth,
  renderTestPage,
  oauthTestPage
}; 