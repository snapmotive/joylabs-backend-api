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
function oauthTestPage(req, res) {
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
          .env-info {
            background: #e8f5e9;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
          }
          .warning {
            background: #fff3e0;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Square OAuth Test</h1>
          
          <div class="env-info">
            <strong>Environment:</strong> ${process.env.NODE_ENV}<br>
            <strong>Square Environment:</strong> ${process.env.SQUARE_ENVIRONMENT}<br>
            <strong>Redirect URL:</strong> ${process.env.SQUARE_REDIRECT_URL}
          </div>
          
          <div class="warning">
            <strong>Note:</strong> Each OAuth attempt will generate a unique state parameter for security.
            The state parameter is stored temporarily and validated when Square redirects back to your application.
          </div>
          
          <h2>Start OAuth Flow</h2>
          <p>Click the button below to start the Square OAuth flow:</p>
          <a href="/api/auth/square" class="button">Start OAuth Flow</a>
        </div>
      </body>
    </html>
  `);
}

/**
 * OAuth debug and test tool
 */
const oauthDebugTool = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>OAuth Debug Tool</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f7;
          }
          .card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
          }
          h1, h2, h3 { color: #333; margin-top: 0; }
          pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .code {
            font-family: monospace;
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
          }
          .button {
            background: #4285f4;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 5px 5px 5px 0;
            font-size: 14px;
          }
          .button.red { background: #ea4335; }
          .button.green { background: #34a853; }
          .button.yellow { background: #fbbc05; }
          input[type="text"] {
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 100%;
            margin-bottom: 10px;
            font-family: monospace;
          }
          .tool-description {
            color: #666;
            font-size: 14px;
            margin-bottom: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          table, th, td {
            border: 1px solid #ddd;
          }
          th, td {
            padding: 10px;
            text-align: left;
          }
          th {
            background-color: #f5f5f5;
          }
          #resultContainer {
            display: none;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Square OAuth Debug Tool</h1>
          <p class="tool-description">
            This tool helps diagnose OAuth issues with Square integration.
            It provides detailed information about the OAuth process and helps troubleshoot common problems.
          </p>
        </div>

        <div class="card">
          <h2>Environment Information</h2>
          <table>
            <tr>
              <th>Setting</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Node Environment</td>
              <td>${process.env.NODE_ENV || 'not set'}</td>
            </tr>
            <tr>
              <td>Square Environment</td>
              <td>${process.env.SQUARE_ENVIRONMENT || 'not set'}</td>
            </tr>
            <tr>
              <td>API Base URL</td>
              <td>${process.env.API_BASE_URL || 'not set'}</td>
            </tr>
            <tr>
              <td>Square Application ID</td>
              <td>${process.env.SQUARE_APPLICATION_ID ? '✓ Configured' : '✗ Not configured'}</td>
            </tr>
            <tr>
              <td>Session Support</td>
              <td>${req.session ? '✓ Enabled' : '✗ Disabled'}</td>
            </tr>
            <tr>
              <td>User Agent</td>
              <td>${req.headers['user-agent'] || 'not available'}</td>
            </tr>
          </table>
        </div>

        <div class="card">
          <h2>Cookie Debug</h2>
          <div class="tool-description">
            Your current cookies:
          </div>
          <pre>${JSON.stringify(req.cookies, null, 2) || 'No cookies found'}</pre>
          
          <div class="tool-description">
            Test cookie functionality:
          </div>
          <button id="setCookieBtn" class="button green">Set Test Cookie</button>
          <button id="getCookieBtn" class="button">Check Test Cookie</button>
          <button id="clearCookieBtn" class="button red">Clear Test Cookie</button>
        </div>
        
        <div class="card">
          <h2>OAuth Test Tools</h2>
          
          <div class="tool-description">
            <strong>1. Test OAuth Initialization</strong> - Generates state and PKCE parameters
          </div>
          <button id="testOAuthInitBtn" class="button">Test OAuth Init</button>
          
          <div class="tool-description">
            <strong>2. Test Direct Callback</strong> - Bypasses Square authorization
          </div>
          <a href="/api/auth/square/test-callback" class="button yellow">Simulate Callback</a>
          
          <div class="tool-description">
            <strong>3. Full OAuth Flow</strong> - Complete OAuth process
          </div>
          <a href="/api/auth/square?state=test-state-parameter" class="button green">Start OAuth Flow</a>
        </div>
        
        <div class="card">
          <h2>Manual Callback Test</h2>
          <div class="tool-description">
            Simulate a callback with custom parameters:
          </div>
          <form id="callbackForm">
            <label for="codeInput">Authorization Code:</label>
            <input type="text" id="codeInput" value="test_auth_code" />
            
            <label for="stateInput">State Parameter:</label>
            <input type="text" id="stateInput" value="test-state-parameter" />
            
            <button type="submit" class="button yellow">Send Callback</button>
          </form>
        </div>
        
        <div id="resultContainer" class="card">
          <h2>Result</h2>
          <div id="resultOutput" class="code"></div>
        </div>

        <script>
          // Cookie test functions
          document.getElementById('setCookieBtn').addEventListener('click', () => {
            document.cookie = "oauth_test_cookie=test-value; path=/; max-age=3600";
            alert("Test cookie set!");
          });
          
          document.getElementById('getCookieBtn').addEventListener('click', () => {
            const cookies = document.cookie.split(';')
              .map(c => c.trim())
              .filter(c => c.startsWith('oauth_test_cookie='));
            
            if (cookies.length > 0) {
              alert("Test cookie found: " + cookies[0]);
            } else {
              alert("Test cookie not found!");
            }
          });
          
          document.getElementById('clearCookieBtn').addEventListener('click', () => {
            document.cookie = "oauth_test_cookie=; path=/; max-age=0";
            alert("Test cookie cleared!");
          });
          
          // OAuth init test
          document.getElementById('testOAuthInitBtn').addEventListener('click', async () => {
            try {
              const response = await fetch('/api/auth/square/mobile-init');
              const data = await response.json();
              
              const resultContainer = document.getElementById('resultContainer');
              const resultOutput = document.getElementById('resultOutput');
              
              resultOutput.textContent = JSON.stringify(data, null, 2);
              resultContainer.style.display = 'block';
              
              // Scroll to result
              resultContainer.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
              alert("Error: " + error.message);
            }
          });
          
          // Manual callback test
          document.getElementById('callbackForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const code = document.getElementById('codeInput').value;
            const state = document.getElementById('stateInput').value;
            
            if (!code || !state) {
              alert("Please provide both code and state parameters");
              return;
            }
            
            const url = '/api/auth/square/callback?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state);
            
            try {
              window.location.href = url;
            } catch (error) {
              alert("Error: " + error.message);
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
  oauthTestPage,
  oauthDebugTool
}; 