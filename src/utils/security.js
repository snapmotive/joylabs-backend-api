const AWS = require('aws-sdk');

// Initialize CloudWatch client
const cloudwatch = new AWS.CloudWatch();

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
  await logSecurityEvent('OAuthActivity', {
    ...details,
    success,
    timestamp: new Date().toISOString()
  }, success ? 'INFO' : 'WARN');
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

module.exports = {
  logSecurityEvent,
  logAuthFailure,
  logTokenRefresh,
  logOAuthActivity,
  logTokenRevocation
}; 