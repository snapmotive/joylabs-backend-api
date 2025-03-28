const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { APIGatewayClient, GetRestApisCommand } = require('@aws-sdk/client-api-gateway');

/**
 * Comprehensive AWS diagnostic test page
 */
async function runAwsDiagnostic(req, res) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      region: process.env.AWS_REGION,
      tests: {}
    };

    // Test IAM Credentials
    try {
      const stsClient = new STSClient({ region: process.env.AWS_REGION });
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      results.tests.credentials = {
        status: 'success',
        message: 'AWS credentials are valid',
        account: identity.Account,
        userId: identity.UserId,
        arn: identity.Arn
      };
    } catch (error) {
      results.tests.credentials = {
        status: 'error',
        message: `AWS credentials test failed: ${error.message}`
      };
    }

    // Test DynamoDB 
    try {
      const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION });
      const tables = await dynamoDb.send(new ListTablesCommand({}));
      
      const requiredTables = [
        process.env.PRODUCTS_TABLE,
        process.env.CATEGORIES_TABLE,
        process.env.USERS_TABLE
      ];
      
      const existingTables = tables.TableNames;
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));
      
      results.tests.dynamodb = {
        status: missingTables.length === 0 ? 'success' : 'warning',
        message: missingTables.length === 0 ? 'All required DynamoDB tables exist' : 'Some required tables are missing',
        totalTables: existingTables.length,
        availableTables: existingTables,
        missingTables: missingTables
      };
    } catch (error) {
      results.tests.dynamodb = {
        status: 'error',
        message: `DynamoDB test failed: ${error.message}`
      };
    }

    // Test Lambda configuration
    try {
      const lambda = new LambdaClient({ region: process.env.AWS_REGION });
      const functions = await lambda.send(new ListFunctionsCommand({}));
      
      const serviceName = 'joylabs-backend-api';
      const serviceFunctions = functions.Functions.filter(fn => 
        fn.FunctionName.includes(serviceName)
      );
      
      results.tests.lambda = {
        status: 'info',
        message: serviceFunctions.length > 0 
          ? `Found ${serviceFunctions.length} related Lambda functions` 
          : 'No deployed Lambda functions found for this service',
        functions: serviceFunctions.map(fn => ({
          name: fn.FunctionName,
          runtime: fn.Runtime,
          memory: fn.MemorySize,
          timeout: fn.Timeout
        }))
      };
    } catch (error) {
      results.tests.lambda = {
        status: 'error',
        message: `Lambda test failed: ${error.message}`
      };
    }

    // Test API Gateway
    try {
      const apiGateway = new APIGatewayClient({ region: process.env.AWS_REGION });
      const apis = await apiGateway.send(new GetRestApisCommand({}));
      
      const serviceName = 'joylabs-backend-api';
      const serviceApis = apis.items.filter(api => 
        api.name.includes(serviceName)
      );
      
      results.tests.apiGateway = {
        status: 'info',
        message: serviceApis.length > 0 
          ? `Found ${serviceApis.length} related API Gateway APIs` 
          : 'No deployed API Gateway APIs found for this service',
        apis: serviceApis.map(api => ({
          id: api.id,
          name: api.name,
          endpoint: `https://${api.id}.execute-api.${process.env.AWS_REGION}.amazonaws.com/production`,
          createdDate: api.createdDate
        }))
      };
    } catch (error) {
      results.tests.apiGateway = {
        status: 'error',
        message: `API Gateway test failed: ${error.message}`
      };
    }

    const baseUrl = process.env.API_PROD_URL || req.protocol + '://' + req.get('host');
    
    const format = req.query.format || 'html';
    if (format === 'json') {
      return res.json(results);
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>JoyLabs AWS Diagnostic Tool</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 900px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f7f9;
            }
            .card {
              background: #fff;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              padding: 20px;
              margin: 20px 0;
            }
            h1 { 
              color: #2c3e50; 
              border-bottom: 2px solid #eee;
              padding-bottom: 10px;
            }
            h2 { 
              margin-top: 25px; 
              color: #34495e;
            }
            .success { color: #27ae60; }
            .error { color: #e74c3c; }
            .warning { color: #f39c12; }
            .info { color: #3498db; }
            .mono {
              font-family: monospace;
              background: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
            }
            .status-pill {
              display: inline-block;
              padding: 5px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
              margin-left: 10px;
            }
            .status-success {
              background-color: #d4edda;
              color: #155724;
            }
            .status-error {
              background-color: #f8d7da;
              color: #721c24;
            }
            .status-warning {
              background-color: #fff3cd;
              color: #856404;
            }
            .status-info {
              background-color: #d1ecf1;
              color: #0c5460;
            }
            .test-summary {
              margin-bottom: 30px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
            }
            th, td {
              text-align: left;
              padding: 10px;
              border-bottom: 1px solid #eee;
            }
            th {
              background-color: #f8f9fa;
            }
            .button {
              display: inline-block;
              background: #3498db;
              color: white;
              border: none;
              padding: 8px 15px;
              border-radius: 4px;
              text-decoration: none;
              margin-right: 10px;
              margin-top: 10px;
            }
            .small {
              font-size: 0.8em;
              color: #7f8c8d;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>JoyLabs AWS Diagnostic Tool</h1>
            <div>
              <div><strong>Timestamp:</strong> ${results.timestamp}</div>
              <div><strong>Region:</strong> ${results.region}</div>
            </div>
            
            <div class="button-row">
              <a href="${req.path}?format=json" class="button">View as JSON</a>
              <a href="${baseUrl}/api/health/test-page" class="button">View General Health</a>
            </div>
          </div>

          <div class="card">
            <h2>IAM Credentials Test</h2>
            <div class="test-summary">
              <span class="${results.tests.credentials.status}">
                ${results.tests.credentials.message}
              </span>
              <span class="status-pill status-${results.tests.credentials.status}">
                ${results.tests.credentials.status}
              </span>
            </div>
            ${results.tests.credentials.status === 'success' ? `
              <table>
                <tr>
                  <th>AWS Account</th>
                  <td>${results.tests.credentials.account}</td>
                </tr>
                <tr>
                  <th>User ID</th>
                  <td>${results.tests.credentials.userId}</td>
                </tr>
                <tr>
                  <th>ARN</th>
                  <td class="mono">${results.tests.credentials.arn}</td>
                </tr>
              </table>
            ` : ''}
          </div>

          <div class="card">
            <h2>DynamoDB Test</h2>
            <div class="test-summary">
              <span class="${results.tests.dynamodb.status}">
                ${results.tests.dynamodb.message}
              </span>
              <span class="status-pill status-${results.tests.dynamodb.status}">
                ${results.tests.dynamodb.status}
              </span>
            </div>
            ${results.tests.dynamodb.status !== 'error' ? `
              <p>Found ${results.tests.dynamodb.totalTables} tables in this region:</p>
              <div class="mono">
                ${results.tests.dynamodb.availableTables.join(', ')}
              </div>
              ${results.tests.dynamodb.missingTables.length > 0 ? `
                <p class="warning">Missing required tables:</p>
                <div class="mono">
                  ${results.tests.dynamodb.missingTables.join(', ')}
                </div>
              ` : ''}
            ` : ''}
          </div>
          
          <div class="card">
            <h2>Lambda Test</h2>
            <div class="test-summary">
              <span class="${results.tests.lambda.status}">
                ${results.tests.lambda.message}
              </span>
              <span class="status-pill status-${results.tests.lambda.status}">
                ${results.tests.lambda.status}
              </span>
            </div>
            ${results.tests.lambda.functions && results.tests.lambda.functions.length > 0 ? `
              <table>
                <tr>
                  <th>Function Name</th>
                  <th>Runtime</th>
                  <th>Memory</th>
                  <th>Timeout</th>
                </tr>
                ${results.tests.lambda.functions.map(fn => `
                  <tr>
                    <td>${fn.name}</td>
                    <td>${fn.runtime}</td>
                    <td>${fn.memory} MB</td>
                    <td>${fn.timeout} sec</td>
                  </tr>
                `).join('')}
              </table>
            ` : `
              <p>No Lambda functions found for this service</p>
            `}
          </div>
          
          <div class="card">
            <h2>API Gateway Test</h2>
            <div class="test-summary">
              <span class="${results.tests.apiGateway.status}">
                ${results.tests.apiGateway.message}
              </span>
              <span class="status-pill status-${results.tests.apiGateway.status}">
                ${results.tests.apiGateway.status}
              </span>
            </div>
            ${results.tests.apiGateway.apis && results.tests.apiGateway.apis.length > 0 ? `
              <table>
                <tr>
                  <th>API Name</th>
                  <th>API ID</th>
                  <th>Endpoint URL</th>
                </tr>
                ${results.tests.apiGateway.apis.map(api => `
                  <tr>
                    <td>${api.name}</td>
                    <td>${api.id}</td>
                    <td class="mono">${api.endpoint}</td>
                  </tr>
                `).join('')}
              </table>
            ` : `
              <p>No API Gateway APIs found for this service</p>
            `}
          </div>
          
          <div class="card">
            <h2>Environment Configuration</h2>
            <p>Required environment variables:</p>
            <ul>
              <li>API_PROD_URL: Your production API Gateway URL</li>
              <li>SQUARE_REDIRECT_URL: Your production Square OAuth redirect URL</li>
            </ul>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Diagnostic test error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
}

module.exports = {
  runAwsDiagnostic
}; 