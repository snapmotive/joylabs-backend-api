const AWS = require('aws-sdk');

// Initialize CloudWatch client
let cloudwatch;
if (process.env.NODE_ENV === 'production') {
  cloudwatch = new AWS.CloudWatch({
    region: process.env.AWS_REGION || 'us-west-1'
  });
}

// For testing/development
const useMockData = process.env.ENABLE_MOCK_DATA === 'true' || process.env.NODE_ENV !== 'production';
const mockLogs = [];

/**
 * Log security events to CloudWatch
 * @param {string} eventType Type of security event
 * @param {Object} details Event details
 * @param {string} severity Event severity (INFO, WARN, ERROR)
 */
const logSecurityEvent = async (eventType, details, severity = 'INFO') => {
  try {
    // Don't log to CloudWatch during local development
    if (process.env.IS_OFFLINE === 'true') {
      console.log(`[SECURITY:${severity}] ${eventType}:`, details);
      return;
    }
    
    // Create CloudWatch metric
    await cloudwatch.putMetricData({
      Namespace: 'JoyLabs/Security',
      MetricData: [
        {
          MetricName: `SecurityEvent_${eventType}`,
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            {
              Name: 'Environment',
              Value: process.env.NODE_ENV || 'dev'
            },
            {
              Name: 'Severity',
              Value: severity
            }
          ],
          Timestamp: new Date()
        }
      ]
    }).promise();
    
    // Log full details for analysis
    console.log(`[SECURITY:${severity}] ${eventType}:`, JSON.stringify(details));
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

/**
 * Log failed authentication attempts
 * @param {Object} details Auth failure details
 */
const logAuthFailure = async (details) => {
  await logSecurityEvent('AuthFailure', {
    ...details,
    timestamp: new Date().toISOString()
  }, 'WARN');
};

/**
 * Log token refresh activities
 * @param {Object} details Token refresh details
 * @param {boolean} success Whether refresh was successful
 */
const logTokenRefresh = async (details, success = true) => {
  await logSecurityEvent('TokenRefresh', {
    ...details,
    success,
    timestamp: new Date().toISOString()
  }, success ? 'INFO' : 'WARN');
};

/**
 * Log OAuth activities
 * @param {Object} details OAuth activity details
 * @param {boolean} success Whether OAuth flow was successful
 */
const logOAuthActivity = async (details, success = true) => {
  // Default to info level for successful events, warn for failures
  const logLevel = success ? 'info' : 'warn';
  
  // Log to console first
  console[logLevel]('OAuth Activity:', JSON.stringify(details, null, 2));
  
  // Store in mock logs for development
  if (useMockData) {
    mockLogs.push({
      type: 'oauth_activity',
      timestamp: new Date().toISOString(),
      success,
      data: details
    });
  }
  
  // In production, log to CloudWatch
  if (cloudwatch && process.env.NODE_ENV === 'production') {
    try {
      const params = {
        MetricData: [
          {
            MetricName: 'OAuthActivity',
            Dimensions: [
              {
                Name: 'Action',
                Value: details.action || 'unknown'
              },
              {
                Name: 'Success',
                Value: success ? 'true' : 'false'
              }
            ],
            Unit: 'Count',
            Value: 1
          }
        ],
        Namespace: 'JoyLabs/Security'
      };
      
      await cloudwatch.putMetricData(params).promise();
    } catch (error) {
      console.error('Error logging to CloudWatch:', error);
    }
  }
};

/**
 * Log token revocation activities
 * @param {Object} details Token revocation details
 * @param {boolean} success Whether revocation was successful
 */
const logTokenRevocation = async (details, success = true) => {
  await logSecurityEvent('TokenRevocation', {
    ...details,
    success,
    timestamp: new Date().toISOString()
  }, success ? 'INFO' : 'WARN');
};

/**
 * Get mock logs for debugging (development only)
 */
function getMockLogs() {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Not available in production' };
  }
  
  return mockLogs;
}

module.exports = {
  logSecurityEvent,
  logAuthFailure,
  logTokenRefresh,
  logOAuthActivity,
  logTokenRevocation,
  getMockLogs
}; 