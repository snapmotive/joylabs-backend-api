(() => {
  var e = {
      25: (e, t, n) => {
        const s = n(982),
          { webcrypto: a } = s;
        function base64URLEncode(e) {
          return Buffer.from(e)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        }
        function base64URLEncodeLegacy(e) {
          return e.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }
        e.exports = {
          generateCodeVerifier: async function generateCodeVerifier() {
            const e = new Uint8Array(32);
            return a.getRandomValues(e), base64URLEncode(e);
          },
          generateCodeChallenge: async function generateCodeChallenge(e) {
            const t = new TextEncoder().encode(e),
              n = await a.subtle.digest('SHA-256', t);
            return base64URLEncode(new Uint8Array(n));
          },
          base64URLEncode,
          generateCodeVerifierLegacy: function generateCodeVerifierLegacy() {
            return base64URLEncodeLegacy(s.randomBytes(32));
          },
          generateCodeChallengeLegacy: function generateCodeChallengeLegacy(e) {
            return base64URLEncodeLegacy(s.createHash('sha256').update(e).digest());
          },
          base64URLEncodeLegacy,
        };
      },
      55: e => {
        'use strict';
        e.exports = require('@aws-sdk/client-sts');
      },
      72: e => {
        'use strict';
        e.exports = require('@aws-sdk/client-api-gateway');
      },
      85: (e, t, n) => {
        const s = n(252).Router(),
          a = n(431),
          r = n(90),
          {
            generateOAuthUrl: o,
            exchangeCodeForToken: i,
            getMerchantInfo: c,
            getSquareClient: l,
          } = n(90),
          { generateStateParam: d, generateCodeVerifier: u, generateCodeChallenge: g } = n(90),
          { createUser: p, findUserBySquareMerchantId: m, updateUser: h } = n(432),
          { DynamoDBClient: b } = (n(829), n(982), n(929)),
          { DynamoDBDocumentClient: y, PutCommand: f, GetCommand: E, UpdateCommand: v } = n(515),
          { SquareClient: S } = n(539);
        global.codeVerifierStore || (global.codeVerifierStore = new Map()),
          global.oauthStates || (global.oauthStates = new Map());
        const R = new b({
            maxAttempts: 3,
            requestTimeout: 3e3,
            ...('true' === process.env.IS_OFFLINE
              ? { region: 'localhost', endpoint: 'http://localhost:8000' }
              : {}),
          }),
          _ = y.from(R);
        s.post('/store-verifier', async (e, t) => {
          try {
            const { request_id: n, code_verifier: s } = e.body;
            if (
              (console.log('Store verifier request received:', {
                hasRequestId: !!n,
                requestIdLength: n?.length || 0,
                hasCodeVerifier: !!s,
                codeVerifierLength: s?.length || 0,
                codeVerifierFirstChars: s ? s.substring(0, 5) : null,
                codeVerifierLastChars: s ? s.substring(s.length - 5) : null,
              }),
              !n)
            )
              return (
                console.error('Missing request_id in store-verifier request'),
                t.status(400).json({ error: 'Missing request_id parameter' })
              );
            if (!s)
              return (
                console.error('Missing code_verifier in store-verifier request'),
                t.status(400).json({ error: 'Missing code_verifier parameter' })
              );
            if (s.length < 43 || s.length > 128)
              return (
                console.error(
                  `Invalid code_verifier length: ${s.length} (must be 43-128 characters)`
                ),
                t
                  .status(400)
                  .json({
                    error: 'Invalid code_verifier format',
                    details: `Length ${s.length} is outside valid range (43-128)`,
                  })
              );
            if (!/^[A-Za-z0-9\-._~]+$/.test(s))
              return (
                console.error('Code verifier contains invalid characters'),
                t
                  .status(400)
                  .json({
                    error: 'Invalid code_verifier format',
                    details: 'Contains invalid characters (only A-Z, a-z, 0-9, -, ., _, ~ allowed)',
                  })
              );
            global.codeVerifierStore.set(n, { code_verifier: s, timestamp: Date.now(), ttl: 6e5 }),
              console.log(`Code verifier stored successfully for request_id: ${n}`),
              (function cleanupExpiredCodeVerifiers() {
                const e = Date.now();
                let t = 0;
                for (const [n, s] of global.codeVerifierStore.entries())
                  e - s.timestamp > s.ttl && (global.codeVerifierStore.delete(n), t++);
                t > 0 && console.log(`Cleaned up ${t} expired code verifiers`);
              })(),
              t.status(200).json({ success: !0 });
          } catch (e) {
            console.error('Error storing code verifier:', e),
              t.status(500).json({ error: 'Failed to store code verifier', details: void 0 });
          }
        }),
          s.get('/square', async (e, t) => {
            console.log('Starting Square OAuth flow');
            try {
              const e = d();
              console.log('Generated state parameter:', e);
              const n = u();
              console.log('Generated code verifier for PKCE flow');
              const s = Math.floor(Date.now() / 1e3) + 600,
                a = {
                  TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                  Item: {
                    state: e,
                    timestamp: Date.now(),
                    used: !1,
                    ttl: s,
                    code_verifier: n,
                    redirectUrl: 'joylabs://square-callback',
                  },
                };
              console.log('Storing state in DynamoDB:', {
                tableName: a.TableName,
                state: e.substring(0, 5) + '...' + e.substring(e.length - 5),
                ttl: new Date(1e3 * s).toISOString(),
              });
              const r = await _.send(new f(a));
              console.log('DynamoDB PutCommand result:', {
                statusCode: r.$metadata.httpStatusCode,
                requestId: r.$metadata.requestId,
              }),
                t.cookie('square_oauth_code_verifier', n, {
                  httpOnly: !0,
                  secure: !0,
                  maxAge: 3e5,
                  sameSite: 'lax',
                });
              const i = await o(e, n);
              console.log('Redirecting to Square OAuth URL'),
                console.log('OAuth request details:', {
                  environment: 'production',
                  state: e,
                  code_verifier: n.substring(0, 5) + '...',
                  has_cookie: !0,
                }),
                t.redirect(i);
            } catch (e) {
              console.error('Error generating OAuth URL:', e),
                t.status(500).json({ error: 'Failed to start OAuth flow' });
            }
          }),
          s.get('/square/callback', async (e, t) => {
            try {
              const { code: n, state: s, error: a, app_callback: o } = e.query;
              if (
                (console.log('Square callback received:', {
                  hasCode: !!n,
                  state: s,
                  hasError: !!a,
                  app_callback: o,
                  STATES_TABLE:
                    process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                  headers: e.headers,
                  query: e.query,
                }),
                a)
              )
                return (
                  console.error('Error from Square:', a),
                  t.redirect(`joylabs://square-callback?error=${encodeURIComponent(a)}`)
                );
              if (!n)
                return (
                  console.error('No code provided in Square callback'),
                  t.redirect('joylabs://square-callback?error=missing_code')
                );
              if (!s)
                return (
                  console.error('No state provided in Square callback'),
                  t.redirect('joylabs://square-callback?error=missing_state')
                );
              const i = {
                TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                Key: { state: s },
              };
              console.log('Retrieving state data from DynamoDB:', {
                tableName: i.TableName,
                state: s,
              });
              try {
                const e = await _.send(new E(i));
                if (!e.Item)
                  return (
                    console.error('No state data found in DynamoDB'),
                    t.redirect('joylabs://square-callback?error=invalid_state')
                  );
                console.log('Retrieved state data from DynamoDB');
                const a = e.Item;
                if (a.used)
                  return (
                    console.error('State has already been used'),
                    t.redirect('joylabs://square-callback?error=state_already_used')
                  );
                const o = a.code_verifier,
                  c = a.redirectUrl || 'joylabs://square-callback';
                if (!o) {
                  if ((console.error('No code verifier found for state'), a.code_challenge))
                    return t.redirect(
                      `${c}?error=missing_code_verifier&details=code_challenge_exists`
                    );
                  try {
                    const e = await r.exchangeCodeForToken(n);
                    console.log('Successfully exchanged code for tokens without PKCE');
                    const a = {
                      TableName:
                        process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                      Key: { state: s },
                      UpdateExpression: 'set used = :used',
                      ExpressionAttributeValues: { ':used': !0 },
                    };
                    let o;
                    await _.send(new v(a)), console.log('Marked state as used in DynamoDB');
                    try {
                      (o = await r.getMerchantInfoWithFetch(e.access_token)),
                        console.log('Retrieved merchant info using native fetch API');
                    } catch (t) {
                      console.warn(
                        'Fetch API failed for merchant info, falling back to SDK:',
                        t.message
                      ),
                        (o = await r.getMerchantInfo(e.access_token)),
                        console.log('Retrieved merchant info using Square SDK');
                    }
                    console.log('Retrieved merchant info');
                    const i = encodeURIComponent(o.businessName || ''),
                      l = `joylabs://square-callback?access_token=${encodeURIComponent(e.access_token)}&refresh_token=${encodeURIComponent(e.refresh_token)}&merchant_id=${encodeURIComponent(e.merchant_id)}&business_name=${i}`;
                    return (
                      console.log('DEBUG - Redirect URL details:', {
                        baseUrl: c,
                        finalUrl: l,
                        manuallyConstructed: !0,
                        params: {
                          access_token: `${e.access_token.substring(0, 5)}...${e.access_token.substring(e.access_token.length - 5)}`,
                          refresh_token: `${e.refresh_token.substring(0, 5)}...${e.refresh_token.substring(e.refresh_token.length - 5)}`,
                          merchant_id: e.merchant_id,
                          business_name: o.businessName,
                        },
                      }),
                      console.log('Redirecting to app with tokens:', {
                        redirectUrl: l.substring(0, 30) + '...',
                      }),
                      t.redirect(l)
                    );
                  } catch (e) {
                    return (
                      console.error('Error in non-PKCE flow:', e),
                      t.redirect(
                        `${c}?error=token_exchange_failed&details=non_pkce_failed&message=${encodeURIComponent(e.message)}`
                      )
                    );
                  }
                }
                try {
                  const e = await r.exchangeCodeForToken(n, o);
                  console.log('Successfully exchanged code for tokens');
                  const a = {
                    TableName:
                      process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                    Key: { state: s },
                    UpdateExpression: 'set used = :used',
                    ExpressionAttributeValues: { ':used': !0 },
                  };
                  let i;
                  await _.send(new v(a)), console.log('Marked state as used in DynamoDB');
                  try {
                    (i = await r.getMerchantInfoWithFetch(e.access_token)),
                      console.log('Retrieved merchant info using native fetch API');
                  } catch (t) {
                    console.warn(
                      'Fetch API failed for merchant info, falling back to SDK:',
                      t.message
                    ),
                      (i = await r.getMerchantInfo(e.access_token)),
                      console.log('Retrieved merchant info using Square SDK');
                  }
                  console.log('Retrieved merchant info');
                  const l = encodeURIComponent(i.businessName || ''),
                    d = `joylabs://square-callback?access_token=${encodeURIComponent(e.access_token)}&refresh_token=${encodeURIComponent(e.refresh_token)}&merchant_id=${encodeURIComponent(e.merchant_id)}&business_name=${l}`;
                  return (
                    console.log('DEBUG - Redirect URL details:', {
                      baseUrl: c,
                      finalUrl: d,
                      manuallyConstructed: !0,
                      params: {
                        access_token: `${e.access_token.substring(0, 5)}...${e.access_token.substring(e.access_token.length - 5)}`,
                        refresh_token: `${e.refresh_token.substring(0, 5)}...${e.refresh_token.substring(e.refresh_token.length - 5)}`,
                        merchant_id: e.merchant_id,
                        business_name: i.businessName,
                      },
                    }),
                    console.log('Redirecting to app with tokens:', {
                      redirectUrl: d.substring(0, 30) + '...',
                    }),
                    t.redirect(d)
                  );
                } catch (e) {
                  return (
                    console.error('Error exchanging code for token:', e),
                    t.redirect(
                      `${c}?error=token_exchange_failed&message=${encodeURIComponent(e.message)}`
                    )
                  );
                }
              } catch (e) {
                return (
                  console.error('Error retrieving state from DynamoDB:', e),
                  t.redirect('joylabs://square-callback?error=database_error')
                );
              }
            } catch (e) {
              return (
                console.error('Error in Square callback:', e),
                t.redirect('joylabs://square-callback?error=server_error')
              );
            }
          }),
          s.get('/square/mobile-init', async (e, t) => {
            console.log('Mobile OAuth initialized with Expo AuthSession');
            try {
              const e = await r.getSquareCredentials();
              if (!e || !e.applicationId) throw new Error('Failed to get Square application ID');
              console.log('Using Square Application ID:', e.applicationId);
              const n = d();
              console.log(`Mobile OAuth initialized with state: ${n}`);
              const s = new f({
                TableName: process.env.DYNAMODB_STATES_TABLE,
                Item: { state: n, createdAt: Date.now(), ttl: Math.floor(Date.now() / 1e3) + 300 },
              });
              await _.send(s);
              const a = `${'https://connect.squareup.com/oauth2/authorize'}?${new URLSearchParams({ client_id: e.applicationId, response_type: 'code', scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE INVENTORY_READ INVENTORY_WRITE', state: n, redirect_uri: process.env.SQUARE_REDIRECT_URL || 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback' }).toString()}`;
              console.log('Generated auth URL for mobile client'), t.json({ url: a, state: n });
            } catch (e) {
              console.error('Error initiating mobile OAuth:', e),
                t
                  .status(500)
                  .json({ error: 'Failed to initiate OAuth process', details: e.message });
            }
          }),
          s.get('/square/test', (e, t) => {
            t.send(
              `\n    <!DOCTYPE html>\n    <html>\n      <head>\n        <meta charset="utf-8">\n        <title>Square OAuth Test Tool</title>\n        <meta name="viewport" content="width=device-width, initial-scale=1">\n        <style>\n          body { \n            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n            line-height: 1.6;\n            color: #333;\n            max-width: 900px;\n            margin: 0 auto;\n            padding: 20px;\n          }\n          .card {\n            background: #fff;\n            border-radius: 8px;\n            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n            padding: 20px;\n            margin: 20px 0;\n          }\n          h1 { color: #4CAF50; }\n          h2 { margin-top: 30px; }\n          pre {\n            background: #f5f5f5;\n            padding: 15px;\n            border-radius: 4px;\n            overflow-x: auto;\n            white-space: pre-wrap;\n          }\n          table {\n            width: 100%;\n            border-collapse: collapse;\n          }\n          table, th, td {\n            border: 1px solid #ddd;\n          }\n          th, td {\n            padding: 10px;\n            text-align: left;\n          }\n          th {\n            background-color: #f2f2f2;\n          }\n          .button {\n            background: #4CAF50;\n            color: white;\n            border: none;\n            padding: 10px 15px;\n            border-radius: 4px;\n            cursor: pointer;\n            text-decoration: none;\n            display: inline-block;\n            margin: 5px 0;\n          }\n          .warning { color: #ff9800; }\n          .error { color: #f44336; }\n          .success { color: #4CAF50; }\n          #verifyResult {\n            display: none;\n            margin-top: 15px;\n          }\n          .token-input {\n            width: 100%;\n            padding: 8px;\n            margin: 5px 0;\n            border: 1px solid #ddd;\n            border-radius: 4px;\n            font-family: monospace;\n          }\n        </style>\n      </head>\n      <body>\n        <h1>Square OAuth Test Tool</h1>\n        \n        <div class="card">\n          <h2>Environment</h2>\n          <table>\n            <tr>\n              <th>Setting</th>\n              <th>Value</th>\n              <th>Status</th>\n            </tr>\n            <tr>\n              <td>SQUARE_ENVIRONMENT</td>\n              <td>${process.env.SQUARE_ENVIRONMENT || 'Not set'}</td>\n              <td>${'production' === process.env.SQUARE_ENVIRONMENT ? '<span class="warning">⚠️ Production mode - test codes won\'t work</span>' : '<span class="success">✓ Sandbox mode - good for testing</span>'}</td>\n            </tr>\n            <tr>\n              <td>SQUARE_APPLICATION_ID</td>\n              <td>${process.env.SQUARE_APPLICATION_ID ? '✓ Set' : '✗ Not set'}</td>\n              <td>${process.env.SQUARE_APPLICATION_ID ? '<span class="success">✓</span>' : '<span class="error">✗ Missing application ID</span>'}</td>\n            </tr>\n            <tr>\n              <td>SQUARE_APPLICATION_SECRET</td>\n              <td>${process.env.SQUARE_APPLICATION_SECRET ? '✓ Set (hidden)' : '✗ Not set'}</td>\n              <td>${process.env.SQUARE_APPLICATION_SECRET ? '<span class="success">✓</span>' : '<span class="error">✗ Missing application secret</span>'}</td>\n            </tr>\n            <tr>\n              <td>SQUARE_REDIRECT_URL</td>\n              <td>${process.env.SQUARE_REDIRECT_URL || 'Not set'}</td>\n              <td>${process.env.SQUARE_REDIRECT_URL ? (process.env.SQUARE_REDIRECT_URL.includes(e.headers.host) ? '<span class="success">✓ Matches current host</span>' : `<span class="warning">⚠️ Does not match current host (${e.headers.host})</span>`) : '<span class="error">✗ Missing redirect URL</span>'}</td>\n            </tr>\n            <tr>\n              <td>Current Host</td>\n              <td>${e.headers.host}</td>\n              <td></td>\n            </tr>\n            <tr>\n              <td>Current Protocol</td>\n              <td>${e.protocol}</td>\n              <td>${'https' === e.protocol ? '<span class="success">✓ Secure</span>' : '<span class="warning">⚠️ Not secure - Square may require HTTPS</span>'}</td>\n            </tr>\n          </table>\n        </div>\n        \n        <div class="card">\n          <h2>Test OAuth Flow</h2>\n          <p>Use these links to test different parts of the OAuth flow:</p>\n          \n          <div>\n            <a href="/api/auth/square?state=test-state-parameter" class="button">Start Regular OAuth Flow</a>\n            <a href="/api/auth/square/mobile-init" class="button">Start Mobile OAuth Flow (PKCE)</a>\n          </div>\n          \n          <h3>Test Callback</h3>\n          <p>This simulates a callback with test codes:</p>\n          <div>\n            <a href="/api/auth/square/set-test-cookie" class="button">1. Set Test Cookies</a>\n            <a href="/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter" class="button">2. Test Callback</a>\n          </div>\n        </div>\n\n        <div class="card">\n          <h2>Test Connection Verification</h2>\n          <p>After successful authentication, you can verify the Square connection using your JWT token:</p>\n          \n          <input type="text" id="jwtToken" class="token-input" placeholder="Paste your JWT token here" />\n          <button onclick="verifyConnection()" class="button">Verify Connection</button>\n          \n          <div id="verifyResult">\n            <h3>Verification Result:</h3>\n            <pre id="verifyOutput"></pre>\n          </div>\n\n          <script>\n            async function verifyConnection() {\n              const token = document.getElementById('jwtToken').value;\n              const resultDiv = document.getElementById('verifyResult');\n              const output = document.getElementById('verifyOutput');\n              \n              resultDiv.style.display = 'block';\n              output.innerHTML = 'Testing connection...';\n              \n              try {\n                const response = await fetch('/api/auth/square/verify', {\n                  headers: {\n                    'Authorization': 'Bearer ' + token\n                  }\n                });\n                \n                const data = await response.json();\n                output.innerHTML = JSON.stringify(data, null, 2);\n                \n                if (response.ok) {\n                  output.className = 'success';\n                } else {\n                  output.className = 'error';\n                }\n              } catch (error) {\n                output.innerHTML = 'Error: ' + error.message;\n                output.className = 'error';\n              }\n            }\n          <\/script>\n        </div>\n      </body>\n    </html>\n  `
            );
          }),
          s.get('/square/test-callback', async (e, t) => {
            try {
              console.log('Test callback invoked');
              const n = process.env.SQUARE_ENVIRONMENT || 'sandbox',
                s = process.env.SQUARE_APPLICATION_ID || 'unknown',
                a = 'test-state-parameter';
              t.cookie('square_oauth_state', a, {
                httpOnly: !0,
                secure: !0,
                sameSite: 'lax',
                maxAge: 36e5,
              }),
                e.session &&
                  (e.session.oauthParams || (e.session.oauthParams = {}),
                  (e.session.oauthParams[a] = {
                    codeVerifier: 'test-code-verifier',
                    createdAt: new Date().toISOString(),
                  }));
              const r = `\n      <!DOCTYPE html>\n      <html>\n      <head>\n        <title>OAuth Callback Simulator</title>\n        <style>\n          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }\n          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }\n          .debug { background: #fff8dc; padding: 10px; border-radius: 5px; margin: 10px 0; }\n          button { padding: 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }\n          button:hover { background: #45a049; }\n          .card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 20px; }\n          .environment { display: inline-block; padding: 5px 10px; border-radius: 3px; margin-left: 10px; }\n          .sandbox { background: #ffd700; color: #333; }\n          .production { background: #32cd32; color: white; }\n          .warning { color: #f44336; }\n          .success { color: #4CAF50; }\n        </style>\n      </head>\n      <body>\n        <h1>Square OAuth Test Tool \n          <span class="environment ${'production' === n ? 'production' : 'sandbox'}">\n            ${n.toUpperCase()}\n          </span>\n        </h1>\n        \n        <div class="card">\n          <h2>Current Configuration</h2>\n          <p><strong>Environment:</strong> ${n}</p>\n          <p><strong>Application ID:</strong> ${s.substring(0, 6)}****${s.substring(s.length - 4)}</p>\n          <p><strong>API Base URL:</strong> ${process.env.API_BASE_URL || 'Not set'}</p>\n          <p><strong class="success">✓ Test state cookie set: </strong> ${a}</p>\n        </div>\n        \n        <div class="card">\n          <h2>Important Notes</h2>\n          <p class="warning"><strong>Important:</strong> This tool has set a required cookie in your browser called <code>square_oauth_state</code> with the value <code>${a}</code>.</p>\n          <p>This cookie is necessary for the callback to work correctly with state validation.</p>\n        </div>\n        \n        <div class="card">\n          <h2>Simulate OAuth Callback</h2>\n          <p>Click the button below to simulate a successful Square OAuth callback:</p>\n          <button onclick="simulateCallback()">Simulate Successful Callback</button>\n        </div>\n        \n        <div class="card debug">\n          <h2>Debug Information</h2>\n          <pre id="debug">Waiting for callback simulation...</pre>\n        </div>\n        \n        <script>\n          function simulateCallback() {\n            const debugElement = document.getElementById('debug');\n            debugElement.innerText = 'Processing callback...';\n            \n            // Directly load the page rather than using fetch which doesn't send cookies\n            window.location.href = '/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter';\n          }\n        <\/script>\n      </body>\n      </html>\n    `;
              t.send(r);
            } catch (e) {
              console.error('Test callback error:', e),
                t.status(500).send('Error in test callback: ' + e.message);
            }
          }),
          s.get('/square/set-test-cookie', (e, t) => {
            console.log('Setting test cookies for OAuth testing'),
              t.cookie('square_oauth_state', 'test-state-parameter', {
                httpOnly: !0,
                secure: !0,
                sameSite: 'lax',
                maxAge: 36e5,
              }),
              t.cookie('square_oauth_code_verifier', 'test_code_verifier', {
                httpOnly: !0,
                secure: !0,
                sameSite: 'lax',
                maxAge: 36e5,
              }),
              t.send(
                '\n    <html>\n      <head>\n        <title>Test Cookies Set</title>\n        <style>\n          body {\n            font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n            line-height: 1.5;\n            margin: 40px auto;\n            max-width: 650px;\n            padding: 0 20px;\n          }\n          .card {\n            background: #fff;\n            border-radius: 8px;\n            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n            padding: 20px;\n            margin: 20px 0;\n          }\n          h1 { color: #4CAF50; }\n          .button {\n            background: #4CAF50;\n            color: white;\n            border: none;\n            padding: 10px 15px;\n            border-radius: 4px;\n            cursor: pointer;\n            text-decoration: none;\n            display: inline-block;\n          }\n        </style>\n      </head>\n      <body>\n        <div class="card">\n          <h1>Test Cookies Set</h1>\n          <p>The following cookies have been set:</p>\n          <ul>\n            <li><strong>square_oauth_state</strong>: test-state-parameter</li>\n            <li><strong>square_oauth_code_verifier</strong>: test_code_verifier</li>\n          </ul>\n          <p>You can now proceed to test the callback:</p>\n          <p><a href="/api/auth/square/callback?code=test_authorization_code&state=test-state-parameter" class="button">Test Callback</a></p>\n        </div>\n      </body>\n    </html>\n  '
              );
          }),
          s.post('/refresh', a.authenticate, (e, t) => {}),
          s.post('/logout', a.authenticate, (e, t) => {}),
          s.post('/logout/:userId', a.authenticate, (e, t) => {}),
          s.get('/success', (e, t) => {}),
          s.get('/square/verify', a.authenticate, async (e, t) => {}),
          s.post('/token-exchange', async (e, t) => {}),
          s.post('/register-token', async (e, t) => {}),
          s.post('/register-state', async (e, t) => {
            console.log('Received state registration request:', {
              body: e.body,
              headers: e.headers,
            });
            try {
              const { state: n, redirectUrl: s, code_verifier: a, code_challenge: r } = e.body;
              if (!n)
                return (
                  console.error('Missing state parameter in request body'),
                  t.status(400).json({ error: 'Missing state parameter' })
                );
              const o = Math.floor(Date.now() / 1e3) + 600,
                i = {
                  TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                  Item: {
                    state: n,
                    timestamp: Date.now(),
                    used: !1,
                    ttl: o,
                    redirectUrl: s || 'joylabs://square-callback',
                  },
                };
              a
                ? ((i.Item.code_verifier = a),
                  console.log('Code verifier included in state registration'))
                : r
                  ? ((i.Item.code_challenge = r),
                    console.log('Code challenge included in state registration'))
                  : console.warn('No code_verifier or code_challenge provided for PKCE flow'),
                console.log('Storing state in DynamoDB:', {
                  tableName: i.TableName,
                  state: n.substring(0, 5) + '...' + n.substring(n.length - 5),
                  ttl: new Date(1e3 * o).toISOString(),
                  hasCodeVerifier: !!a,
                  hasCodeChallenge: !!r,
                });
              const c = await _.send(new f(i));
              console.log('DynamoDB PutCommand result:', {
                statusCode: c.$metadata.httpStatusCode,
                requestId: c.$metadata.requestId,
              }),
                console.log(`State ${n} registered successfully`),
                t.status(200).json({ success: !0 });
            } catch (e) {
              console.error('Error registering state:', e),
                t.status(500).json({ error: 'Failed to register state', details: void 0 });
            }
          }),
          s.get('/connect/url', async (e, t) => {
            console.log('Received OAuth URL request:', { query: e.query, headers: e.headers });
            try {
              const { state: n, code_challenge: s, code_verifier: a, redirect_uri: o } = e.query;
              if (!n || !s || !o)
                return (
                  console.error('Missing required parameters:', {
                    state: n,
                    code_challenge: s,
                    redirect_uri: o,
                  }),
                  t
                    .status(400)
                    .json({
                      error: 'Missing required parameters',
                      details: 'state, code_challenge, and redirect_uri are required',
                    })
                );
              if (!o.startsWith('joylabs://'))
                return (
                  console.error('Invalid redirect_uri format:', o),
                  t
                    .status(400)
                    .json({
                      error: 'Invalid redirect_uri',
                      details: 'redirect_uri must start with joylabs://',
                    })
                );
              const i = Math.floor(Date.now() / 1e3) + 600,
                c = {
                  TableName: process.env.STATES_TABLE || 'joylabs-backend-api-v3-production-states',
                  Item: {
                    state: n,
                    timestamp: Date.now(),
                    used: !1,
                    ttl: i,
                    code_challenge: s,
                    redirect_uri: o,
                  },
                };
              a &&
                ((c.Item.code_verifier = a), console.log('Added code_verifier to state storage')),
                console.log('Storing state in DynamoDB:', {
                  tableName: c.TableName,
                  state: n.substring(0, 5) + '...' + n.substring(n.length - 5),
                  ttl: new Date(1e3 * i).toISOString(),
                  hasCodeChallenge: !0,
                  hasCodeVerifier: !!a,
                });
              const l = await _.send(new f(c));
              console.log('DynamoDB PutCommand result:', {
                statusCode: l.$metadata.httpStatusCode,
                requestId: l.$metadata.requestId,
              });
              const d = await r.generateOAuthUrl(n, s, o);
              console.log('Generated Square OAuth URL'), t.json({ url: d });
            } catch (e) {
              console.error('Error generating OAuth URL:', e),
                t.status(500).json({ error: 'Failed to generate OAuth URL', details: void 0 });
            }
          }),
          s.post('/generate-pkce', async (e, t) => {
            try {
              const e = await r.generateCodeVerifier(),
                n = await r.generateCodeChallenge(e);
              t.json({ code_verifier: e, code_challenge: n });
            } catch (e) {
              console.error('Error generating PKCE codes:', e),
                t.status(500).json({ error: 'Failed to generate PKCE codes', details: void 0 });
            }
          }),
          (e.exports = s);
      },
      90: (e, t, n) => {
        const s = n(938),
          a = n(982),
          { SquareClient: r } = n(539),
          { SecretsManagerClient: o, GetSecretValueCommand: i } = n(420),
          c = n(714),
          l = n(25),
          d = n(729),
          { createErrorWithCause: u } = n(285),
          g = 'v2',
          p = '2025-03-19';
        new o({ region: 'us-west-1' });
        const m = new Map(),
          h = new Map(),
          b = {
            merchantInfo: 3e5,
            catalogCategories: 18e5,
            catalogItems: 3e5,
            locations: 18e5,
            other: 6e4,
          };
        let y = null;
        function getCachedResponse(e, t = 'other') {
          if (h.has(e)) {
            const n = h.get(e);
            if (Date.now() < n.expiry) return console.log(`Using cached ${t} data`), n.data;
            h.delete(e);
          }
          return null;
        }
        function cacheResponse(e, t, n = 'other') {
          const s = b[n] || b.other;
          h.set(e, { data: t, expiry: Date.now() + s });
        }
        async function getSquareCredentials() {
          try {
            console.log('Retrieving Square credentials from AWS Secrets Manager'),
              console.log('SQUARE_CREDENTIALS_SECRET:', process.env.SQUARE_CREDENTIALS_SECRET),
              console.log('AWS_REGION:', process.env.AWS_REGION);
            const e = (y || (y = new o({ region: 'us-west-1' })), y),
              t = new i({
                SecretId: process.env.SQUARE_CREDENTIALS_SECRET || 'square-credentials-production',
              }),
              n = await e.send(t),
              s = JSON.parse(n.SecretString);
            if (!s.applicationId || !s.applicationSecret)
              throw new Error('Invalid Square credentials format');
            return {
              applicationId: s.applicationId,
              applicationSecret: s.applicationSecret,
              webhookSignatureKey: s.webhookSignatureKey,
            };
          } catch (e) {
            throw (
              (console.error('Error getting Square credentials:', e),
              new Error('Failed to get Square credentials'))
            );
          }
        }
        const getSquareClient = (e = null) => {
          const t = `${e || 'default'}-${process.env.SQUARE_ENVIRONMENT}`;
          if (m.has(t)) return console.log('Reusing existing Square client from cache'), m.get(t);
          console.log('Creating new Square v42 client');
          const n = new r({
            token: e || process.env.SQUARE_ACCESS_TOKEN,
            environment: process.env.SQUARE_ENVIRONMENT || 'production',
            userAgentDetail: 'JoyLabs Backend API',
            timeout: 3e4,
          });
          return m.set(t, n), n;
        };
        const getRedirectUrl = () => {
          const e =
            process.env.SQUARE_REDIRECT_URL ||
            'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/api/auth/square/callback';
          return console.log(`Using redirect URL: ${e}`), e;
        };
        async function getMerchantInfo(e) {
          try {
            const t = `merchant-info-${e}`,
              s = getCachedResponse(t, 'merchantInfo');
            if (s) return s;
            const a = getSquareClient(e);
            let r;
            console.log('Getting merchant info with Square v42 SDK');
            const o = {
              numberOfRetries: 4,
              statusCodesToRetry: [429, 500, 502, 503, 504],
              endpoint: 'oauth-api',
              useRateLimiter: !0,
            };
            try {
              console.log('Attempting to retrieve merchant info with retrieveLocation method'),
                (r = await c.executeWithRetry(async e => e.locations.retrieveLocation('me'), a, o)),
                r &&
                  r.result &&
                  r.result.location &&
                  (r = {
                    result: {
                      merchant: {
                        id: r.result.location.merchantId,
                        businessName: r.result.location.name,
                        country: r.result.location.country,
                        languageCode: r.result.location.languageCode,
                        currency: r.result.location.currency,
                        status: 'ACTIVE',
                      },
                    },
                  });
            } catch (t) {
              if (
                !t.message.includes('is not a function') &&
                !t.message.includes('retrieveLocation')
              )
                throw t;
              {
                console.log('Falling back to alternative method for retrieving merchant');
                const t = n(938),
                  directApiCall = async () => ({
                    result: {
                      merchant: (
                        await t({
                          method: 'get',
                          url: 'https://connect.squareup.com/v2/merchants/me',
                          headers: {
                            Authorization: `Bearer ${e}`,
                            'Content-Type': 'application/json',
                            'Square-Version': '2023-12-13',
                          },
                        })
                      ).data.merchant,
                    },
                  });
                (r = await c.executeWithRetry(directApiCall, null, o)),
                  console.log('Successfully retrieved merchant info via direct API call');
              }
            }
            console.log('Successfully retrieved merchant info');
            const i = {
              id: r.result.merchant.id,
              businessName:
                r.result.merchant.businessName ||
                r.result.merchant.business_name ||
                r.result.merchant.businessEmail ||
                r.result.merchant.business_email ||
                'Unknown',
              country: r.result.merchant.country,
              language: r.result.merchant.languageCode || r.result.merchant.language_code,
              currency: r.result.merchant.currency,
              status: r.result.merchant.status,
            };
            return cacheResponse(t, i, 'merchantInfo'), i;
          } catch (e) {
            throw (
              ((401 === e.statusCode || e.message.includes('Unauthorized')) &&
                ((e.code = 'AUTHENTICATION_ERROR'),
                (e.message =
                  'Invalid or expired access token. Please reauthenticate with Square.')),
              console.error('Error getting merchant info:', e),
              e)
            );
          }
        }
        e.exports = {
          getSquareClient,
          generateOAuthUrl: async function generateOAuthUrl(e, t, n) {
            try {
              const n = await getSquareCredentials(),
                s = `${'https://connect.squareup.com/oauth2/authorize'}?${new URLSearchParams({ client_id: n.applicationId, response_type: 'code', scope: 'ITEMS_READ ITEMS_WRITE MERCHANT_PROFILE_READ', state: e, code_challenge: t, code_challenge_method: 'S256', redirect_uri: getRedirectUrl() }).toString()}`;
              return console.log('Generated OAuth URL (redacted):', s.replace(t, '[REDACTED]')), s;
            } catch (e) {
              throw (console.error('Error generating OAuth URL:', e), e);
            }
          },
          exchangeCodeForToken: async function exchangeCodeForToken(e, t) {
            try {
              const n = await getSquareCredentials(),
                a = getRedirectUrl();
              console.log('Exchanging code for token with redirect URL:', a),
                console.log('PKCE status:', {
                  hasCodeVerifier: !!t,
                  codeVerifierLength: t ? t.length : 0,
                  codeVerifierPreview: t
                    ? `${t.substring(0, 5)}...${t.substring(t.length - 5)}`
                    : 'none',
                });
              const r = {
                client_id: n.applicationId,
                code: e,
                grant_type: 'authorization_code',
                redirect_uri: a,
              };
              t
                ? ((r.code_verifier = t),
                  console.log(
                    'Added code_verifier to token request - using PKCE flow without client_secret'
                  ))
                : ((r.client_secret = n.applicationSecret),
                  console.log('Using standard OAuth flow with client_secret')),
                console.log('Sending token request to Square API');
              const o = {
                  numberOfRetries: 3,
                  backoffFactor: 3,
                  statusCodesToRetry: [429, 500, 502, 503, 504],
                  endpoint: 'oauth-api',
                  useRateLimiter: !0,
                  cost: 2,
                },
                exchangeToken = async () => {
                  try {
                    return (await s.post('https://connect.squareup.com/oauth2/token', r)).data;
                  } catch (e) {
                    const t = new Error(
                      e.response?.data?.message || e.response?.data?.error_description || e.message
                    );
                    throw (
                      ((t.statusCode = e.response?.status || 500),
                      (t.code = e.response?.data?.error || 'TOKEN_EXCHANGE_ERROR'),
                      (t.details = [
                        {
                          error: e.response?.data?.error,
                          error_description: e.response?.data?.error_description,
                        },
                      ]),
                      t)
                    );
                  }
                },
                i = await c.executeWithRetry(exchangeToken, null, o);
              return (
                console.log('Successfully received token response'),
                {
                  access_token: i.access_token,
                  refresh_token: i.refresh_token,
                  expires_at: i.expires_at,
                  merchant_id: i.merchant_id,
                }
              );
            } catch (e) {
              console.error('Error exchanging code for token:', e.response?.data || e.message);
              const t = new Error(
                e.response?.data?.message || e.response?.data?.error_description || e.message
              );
              throw (
                ((t.code = e.response?.data?.error || 'TOKEN_EXCHANGE_ERROR'),
                (t.statusCode = e.response?.status || 500),
                t)
              );
            }
          },
          getSquareCredentials,
          getMerchantInfo,
          generateStateParam: function generateStateParam() {
            return (function generateRandomString(e = 32) {
              let t = '';
              const n = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
              for (let s = 0; s < e; s++) t += n.charAt(Math.floor(66 * Math.random()));
              return t;
            })(48);
          },
          generateCodeVerifier: async function generateCodeVerifier() {
            try {
              return await l.generateCodeVerifier();
            } catch (e) {
              return (
                console.warn(
                  'WebCrypto API failed, falling back to legacy implementation:',
                  e.message
                ),
                l.generateCodeVerifierLegacy()
              );
            }
          },
          generateCodeChallenge: async function generateCodeChallenge(e) {
            try {
              return await l.generateCodeChallenge(e);
            } catch (t) {
              return (
                console.warn(
                  'WebCrypto API failed, falling back to legacy implementation:',
                  t.message
                ),
                l.generateCodeChallengeLegacy(e)
              );
            }
          },
          verifyWebhookSignature: async function verifyWebhookSignature(e, t) {
            try {
              console.log('Verifying webhook signature');
              const n = await c.getWebhookSignatureKey(getSquareCredentials);
              if (!n) return console.error('No webhook signature key found in credentials'), !1;
              if (!e) return console.error('No signature provided'), !1;
              if (!t) return console.error('No request body provided'), !1;
              console.log('Request body length for verification:', t.length);
              const s = a.createHmac('sha256', n);
              s.update(t);
              const r = s.digest('base64');
              return (
                console.log('Signature verification:', {
                  providedSignatureLength: e.length,
                  calculatedSignatureLength: r.length,
                  match: e === r,
                  providedSignatureStart: e.substring(0, 5) + '...',
                  calculatedSignatureStart: r.substring(0, 5) + '...',
                }),
                (function timingSafeEqual(e, t) {
                  if (e.length !== t.length) return !1;
                  const n = Buffer.from(e, 'utf8'),
                    s = Buffer.from(t, 'utf8');
                  try {
                    return a.timingSafeEqual(n, s);
                  } catch (e) {
                    return console.error('Error in timingSafeEqual:', e), !1;
                  }
                })(e, r)
              );
            } catch (e) {
              return (
                c.logApiError(
                  {
                    message: 'Error verifying webhook signature: ' + e.message,
                    code: 'WEBHOOK_VERIFICATION_ERROR',
                    statusCode: 400,
                    details: [{ detail: e.stack }],
                  },
                  0
                ),
                !1
              );
            }
          },
          executeSquareRequest: async function executeSquareRequest(e, t, n = 'square-api') {
            try {
              const s = getSquareClient(t);
              return (
                console.log('Executing Square request with v42 SDK and retry logic'),
                await c.executeWithRetry(e, s, { endpoint: n, useRateLimiter: !0 })
              );
            } catch (e) {
              throw e;
            }
          },
          refreshAccessToken: async function refreshAccessToken(e) {
            try {
              const t = await getSquareCredentials();
              console.log('Refreshing Square access token');
              const n = {
                  numberOfRetries: 4,
                  backoffFactor: 3,
                  statusCodesToRetry: [429, 500, 502, 503, 504],
                  endpoint: 'oauth-api',
                  useRateLimiter: !0,
                  cost: 2,
                },
                refreshTokenFn = async () => {
                  try {
                    const n = {
                      client_id: t.applicationId,
                      client_secret: t.applicationSecret,
                      grant_type: 'refresh_token',
                      refresh_token: e,
                    };
                    return (await s.post('https://connect.squareup.com/oauth2/token', n)).data;
                  } catch (e) {
                    const t = new Error(
                      e.response?.data?.message || e.response?.data?.error_description || e.message
                    );
                    throw (
                      ((t.statusCode = e.response?.status || 500),
                      (t.code = e.response?.data?.error || 'TOKEN_REFRESH_ERROR'),
                      (t.details = [
                        {
                          error: e.response?.data?.error,
                          error_description: e.response?.data?.error_description,
                        },
                      ]),
                      400 !== e.response?.status ||
                        ('invalid_grant' !== e.response?.data?.error &&
                          !e.response?.data?.error_description?.includes('refresh token')) ||
                        ((t.code = 'INVALID_REFRESH_TOKEN'),
                        (t.message =
                          'Refresh token is invalid or expired. Please reconnect your Square account.'),
                        (t.requiresReauthentication = !0)),
                      t)
                    );
                  }
                },
                a = await c.executeWithRetry(refreshTokenFn, null, n);
              return (
                console.log('Successfully refreshed access token'),
                {
                  access_token: a.access_token,
                  refresh_token: a.refresh_token,
                  expires_at: a.expires_at,
                  merchant_id: a.merchant_id,
                }
              );
            } catch (e) {
              console.error('Error refreshing access token:', e.response?.data || e.message);
              const t = new Error(
                e.response?.data?.message || e.response?.data?.error_description || e.message
              );
              throw (
                ((t.code = e.response?.data?.error || 'TOKEN_REFRESH_ERROR'),
                (t.statusCode = e.response?.status || 500),
                (e.requiresReauthentication ||
                  (400 === e.response?.status &&
                    ('invalid_grant' === e.response?.data?.error ||
                      e.response?.data?.error_description?.includes('refresh token')))) &&
                  (t.requiresReauthentication = !0),
                t)
              );
            }
          },
          getCachedResponse,
          cacheResponse,
          CACHE_TTL_CONFIG: b,
          getMerchantInfoWithFetch: async function getMerchantInfoWithFetch(e) {
            try {
              const t = `merchant-info-${e}`,
                n = getCachedResponse(t, 'merchantInfo');
              if (n) return n;
              console.log('Getting merchant info with native fetch API');
              const s = {
                  Authorization: `Bearer ${e}`,
                  Accept: 'application/json',
                  'Square-Version': p,
                },
                a = await d.fetchJson(
                  `https://connect.squareup.com/${g}/merchants/me`,
                  { headers: s },
                  1e4
                );
              if (a.merchant) {
                const e = a.merchant,
                  n = await d.fetchJson(
                    `https://connect.squareup.com/${g}/locations`,
                    { headers: s },
                    1e4
                  );
                let r = null;
                n.locations &&
                  n.locations.length > 0 &&
                  (r = n.locations.find(e => 'Default' === e.name) || n.locations[0]);
                const o = {
                  merchantId: e.id,
                  businessName: e.business_name || 'Unknown Business',
                  country: e.country,
                  languageCode: e.language_code,
                  currency: e.currency,
                  status: e.status,
                  mainLocation: r
                    ? {
                        id: r.id,
                        name: r.name,
                        address: r.address,
                        phoneNumber: r.phone_number,
                        businessEmail: r.business_email,
                      }
                    : null,
                };
                return cacheResponse(t, o, 'merchantInfo'), o;
              }
              throw u('Invalid merchant data structure', new Error('Missing merchant data'), {
                statusCode: 500,
              });
            } catch (t) {
              if (
                (console.error('Error getting merchant info with fetch:', t),
                'AUTHENTICATION_ERROR' !== t.code)
              )
                try {
                  return (
                    console.log('Falling back to Square SDK for merchant info'),
                    await getMerchantInfo(e)
                  );
                } catch (e) {
                  throw t;
                }
              throw t;
            }
          },
          SQUARE_API_VERSION: g,
          SQUARE_API_HEADER_VERSION: p,
        };
      },
      96: e => {
        'use strict';
        e.exports = require('morgan');
      },
      103: (e, t, n) => {
        const s = n(252).Router();
        s.get('/', (e, t) => {
          t.json({ message: 'Products API is working' });
        }),
          (e.exports = s);
      },
      107: (e, t, n) => {
        const s = n(252).Router(),
          { protect: a } = n(431),
          r = n(90),
          { handleApiError: o } = n(285);
        s.get('/me', a, async (e, t) => {
          try {
            console.log('Fetching merchant info for authenticated user');
            const n = await r.getMerchantInfoWithFetch(e.user.squareAccessToken);
            if (!n)
              return t
                .status(404)
                .json({ success: !1, message: 'Merchant information not found.' });
            t.json({ success: !0, merchant: n });
          } catch (e) {
            if ((console.error('Error fetching merchant info:', e), 'function' == typeof o))
              return o(t, e, 'Failed to fetch merchant information');
            t.status(e.statusCode || 500).json({
              success: !1,
              message: e.message || 'Failed to fetch merchant information',
              error: e.details || e.toString(),
            });
          }
        }),
          (e.exports = s);
      },
      167: (e, t, n) => {
        const { STSClient: s, GetCallerIdentityCommand: a } = n(55),
          { DynamoDBClient: r, ListTablesCommand: o } = n(929),
          { LambdaClient: i, ListFunctionsCommand: c } = n(518),
          { APIGatewayClient: l, GetRestApisCommand: d } = n(72);
        e.exports = {
          runAwsDiagnostic: async function runAwsDiagnostic(e, t) {
            try {
              const n = {
                timestamp: new Date().toISOString(),
                region: process.env.AWS_REGION,
                tests: {},
              };
              try {
                const e = new s({ region: process.env.AWS_REGION }),
                  t = await e.send(new a({}));
                n.tests.credentials = {
                  status: 'success',
                  message: 'AWS credentials are valid',
                  account: t.Account,
                  userId: t.UserId,
                  arn: t.Arn,
                };
              } catch (e) {
                n.tests.credentials = {
                  status: 'error',
                  message: `AWS credentials test failed: ${e.message}`,
                };
              }
              try {
                const e = new r({ region: process.env.AWS_REGION }),
                  t = await e.send(new o({})),
                  s = [
                    process.env.PRODUCTS_TABLE,
                    process.env.CATEGORIES_TABLE,
                    process.env.USERS_TABLE,
                  ],
                  a = t.TableNames,
                  i = s.filter(e => !a.includes(e));
                n.tests.dynamodb = {
                  status: 0 === i.length ? 'success' : 'warning',
                  message:
                    0 === i.length
                      ? 'All required DynamoDB tables exist'
                      : 'Some required tables are missing',
                  totalTables: a.length,
                  availableTables: a,
                  missingTables: i,
                };
              } catch (e) {
                n.tests.dynamodb = {
                  status: 'error',
                  message: `DynamoDB test failed: ${e.message}`,
                };
              }
              try {
                const e = new i({ region: process.env.AWS_REGION }),
                  t = await e.send(new c({})),
                  s = 'joylabs-backend-api',
                  a = t.Functions.filter(e => e.FunctionName.includes(s));
                n.tests.lambda = {
                  status: 'info',
                  message:
                    a.length > 0
                      ? `Found ${a.length} related Lambda functions`
                      : 'No deployed Lambda functions found for this service',
                  functions: a.map(e => ({
                    name: e.FunctionName,
                    runtime: e.Runtime,
                    memory: e.MemorySize,
                    timeout: e.Timeout,
                  })),
                };
              } catch (e) {
                n.tests.lambda = { status: 'error', message: `Lambda test failed: ${e.message}` };
              }
              try {
                const e = new l({ region: process.env.AWS_REGION }),
                  t = await e.send(new d({})),
                  s = 'joylabs-backend-api',
                  a = t.items.filter(e => e.name.includes(s));
                n.tests.apiGateway = {
                  status: 'info',
                  message:
                    a.length > 0
                      ? `Found ${a.length} related API Gateway APIs`
                      : 'No deployed API Gateway APIs found for this service',
                  apis: a.map(e => ({
                    id: e.id,
                    name: e.name,
                    endpoint: `https://${e.id}.execute-api.${process.env.AWS_REGION}.amazonaws.com/production`,
                    createdDate: e.createdDate,
                  })),
                };
              } catch (e) {
                n.tests.apiGateway = {
                  status: 'error',
                  message: `API Gateway test failed: ${e.message}`,
                };
              }
              const u = process.env.API_PROD_URL || e.protocol + '://' + e.get('host');
              if ('json' === (e.query.format || 'html')) return t.json(n);
              t.send(
                `\n      <!DOCTYPE html>\n      <html>\n        <head>\n          <meta charset="utf-8">\n          <title>JoyLabs AWS Diagnostic Tool</title>\n          <meta name="viewport" content="width=device-width, initial-scale=1">\n          <style>\n            body { \n              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n              line-height: 1.6;\n              color: #333;\n              max-width: 900px;\n              margin: 0 auto;\n              padding: 20px;\n              background-color: #f5f7f9;\n            }\n            .card {\n              background: #fff;\n              border-radius: 8px;\n              box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n              padding: 20px;\n              margin: 20px 0;\n            }\n            h1 { \n              color: #2c3e50; \n              border-bottom: 2px solid #eee;\n              padding-bottom: 10px;\n            }\n            h2 { \n              margin-top: 25px; \n              color: #34495e;\n            }\n            .success { color: #27ae60; }\n            .error { color: #e74c3c; }\n            .warning { color: #f39c12; }\n            .info { color: #3498db; }\n            .mono {\n              font-family: monospace;\n              background: #f5f5f5;\n              padding: 10px;\n              border-radius: 4px;\n              overflow-x: auto;\n            }\n            .status-pill {\n              display: inline-block;\n              padding: 5px 10px;\n              border-radius: 20px;\n              font-size: 12px;\n              font-weight: bold;\n              text-transform: uppercase;\n              margin-left: 10px;\n            }\n            .status-success {\n              background-color: #d4edda;\n              color: #155724;\n            }\n            .status-error {\n              background-color: #f8d7da;\n              color: #721c24;\n            }\n            .status-warning {\n              background-color: #fff3cd;\n              color: #856404;\n            }\n            .status-info {\n              background-color: #d1ecf1;\n              color: #0c5460;\n            }\n            .test-summary {\n              margin-bottom: 30px;\n            }\n            table {\n              width: 100%;\n              border-collapse: collapse;\n              margin: 15px 0;\n            }\n            th, td {\n              text-align: left;\n              padding: 10px;\n              border-bottom: 1px solid #eee;\n            }\n            th {\n              background-color: #f8f9fa;\n            }\n            .button {\n              display: inline-block;\n              background: #3498db;\n              color: white;\n              border: none;\n              padding: 8px 15px;\n              border-radius: 4px;\n              text-decoration: none;\n              margin-right: 10px;\n              margin-top: 10px;\n            }\n            .small {\n              font-size: 0.8em;\n              color: #7f8c8d;\n            }\n          </style>\n        </head>\n        <body>\n          <div class="card">\n            <h1>JoyLabs AWS Diagnostic Tool</h1>\n            <div>\n              <div><strong>Timestamp:</strong> ${n.timestamp}</div>\n              <div><strong>Region:</strong> ${n.region}</div>\n            </div>\n            \n            <div class="button-row">\n              <a href="${e.path}?format=json" class="button">View as JSON</a>\n              <a href="${u}/api/health/test-page" class="button">View General Health</a>\n            </div>\n          </div>\n\n          <div class="card">\n            <h2>IAM Credentials Test</h2>\n            <div class="test-summary">\n              <span class="${n.tests.credentials.status}">\n                ${n.tests.credentials.message}\n              </span>\n              <span class="status-pill status-${n.tests.credentials.status}">\n                ${n.tests.credentials.status}\n              </span>\n            </div>\n            ${'success' === n.tests.credentials.status ? `\n              <table>\n                <tr>\n                  <th>AWS Account</th>\n                  <td>${n.tests.credentials.account}</td>\n                </tr>\n                <tr>\n                  <th>User ID</th>\n                  <td>${n.tests.credentials.userId}</td>\n                </tr>\n                <tr>\n                  <th>ARN</th>\n                  <td class="mono">${n.tests.credentials.arn}</td>\n                </tr>\n              </table>\n            ` : ''}\n          </div>\n\n          <div class="card">\n            <h2>DynamoDB Test</h2>\n            <div class="test-summary">\n              <span class="${n.tests.dynamodb.status}">\n                ${n.tests.dynamodb.message}\n              </span>\n              <span class="status-pill status-${n.tests.dynamodb.status}">\n                ${n.tests.dynamodb.status}\n              </span>\n            </div>\n            ${'error' !== n.tests.dynamodb.status ? `\n              <p>Found ${n.tests.dynamodb.totalTables} tables in this region:</p>\n              <div class="mono">\n                ${n.tests.dynamodb.availableTables.join(', ')}\n              </div>\n              ${n.tests.dynamodb.missingTables.length > 0 ? `\n                <p class="warning">Missing required tables:</p>\n                <div class="mono">\n                  ${n.tests.dynamodb.missingTables.join(', ')}\n                </div>\n              ` : ''}\n            ` : ''}\n          </div>\n          \n          <div class="card">\n            <h2>Lambda Test</h2>\n            <div class="test-summary">\n              <span class="${n.tests.lambda.status}">\n                ${n.tests.lambda.message}\n              </span>\n              <span class="status-pill status-${n.tests.lambda.status}">\n                ${n.tests.lambda.status}\n              </span>\n            </div>\n            ${n.tests.lambda.functions && n.tests.lambda.functions.length > 0 ? `\n              <table>\n                <tr>\n                  <th>Function Name</th>\n                  <th>Runtime</th>\n                  <th>Memory</th>\n                  <th>Timeout</th>\n                </tr>\n                ${n.tests.lambda.functions.map(e => `\n                  <tr>\n                    <td>${e.name}</td>\n                    <td>${e.runtime}</td>\n                    <td>${e.memory} MB</td>\n                    <td>${e.timeout} sec</td>\n                  </tr>\n                `).join('')}\n              </table>\n            ` : '\n              <p>No Lambda functions found for this service</p>\n            '}\n          </div>\n          \n          <div class="card">\n            <h2>API Gateway Test</h2>\n            <div class="test-summary">\n              <span class="${n.tests.apiGateway.status}">\n                ${n.tests.apiGateway.message}\n              </span>\n              <span class="status-pill status-${n.tests.apiGateway.status}">\n                ${n.tests.apiGateway.status}\n              </span>\n            </div>\n            ${n.tests.apiGateway.apis && n.tests.apiGateway.apis.length > 0 ? `\n              <table>\n                <tr>\n                  <th>API Name</th>\n                  <th>API ID</th>\n                  <th>Endpoint URL</th>\n                </tr>\n                ${n.tests.apiGateway.apis.map(e => `\n                  <tr>\n                    <td>${e.name}</td>\n                    <td>${e.id}</td>\n                    <td class="mono">${e.endpoint}</td>\n                  </tr>\n                `).join('')}\n              </table>\n            ` : '\n              <p>No API Gateway APIs found for this service</p>\n            '}\n          </div>\n          \n          <div class="card">\n            <h2>Environment Configuration</h2>\n            <p>Required environment variables:</p>\n            <ul>\n              <li>API_PROD_URL: Your production API Gateway URL</li>\n              <li>SQUARE_REDIRECT_URL: Your production Square OAuth redirect URL</li>\n            </ul>\n          </div>\n        </body>\n      </html>\n    `
              );
            } catch (e) {
              console.error('Diagnostic test error:', e),
                t.status(500).json({ status: 'error', message: e.message });
            }
          },
        };
      },
      210: (e, t, n) => {
        n(938);
        const { getSquareClient: s } = n(90),
          { handleSquareError: a } = n(285),
          r = n(671),
          o = n(903),
          i = n(90),
          c = n(285),
          l = 'v2',
          d = '2025-03-19';
        e.exports = {
          listCatalogItems: async function listCatalogItems(e, t = {}) {
            try {
              console.log('=== REQUEST BOUNDARY: listCatalogItems START ==='),
                console.log(
                  'Listing catalog items from Square with options:',
                  JSON.stringify(t, null, 2)
                );
              const n = JSON.stringify({
                  types: t.types || ['ITEM', 'CATEGORY'],
                  limit: t.limit || 100,
                  cursor: t.cursor || null,
                  includeRelatedObjects:
                    !0 === t.includeRelatedObjects || 'true' === t.includeRelatedObjects,
                  includeDeletedObjects:
                    !0 === t.includeDeletedObjects || 'true' === t.includeDeletedObjects,
                }),
                s = `catalog-items-${e}-${Buffer.from(n).toString('base64')}`,
                a = i.getCachedResponse(s, 'catalogItems');
              if (a)
                return (
                  console.log('Using cached catalog items data'),
                  console.log('=== REQUEST BOUNDARY: listCatalogItems END (Cached) ==='),
                  a
                );
              const r = await i.executeSquareRequest(
                async e => {
                  const n = t.types || ['ITEM', 'CATEGORY'],
                    s = Array.isArray(n) ? n : n.split(','),
                    a = t.limit ? parseInt(t.limit) : 1e3,
                    r = Math.min(Math.max(1, a), 1e3),
                    o = t.cursor || null,
                    i = !0 === t.includeRelatedObjects || 'true' === t.includeRelatedObjects,
                    c = !0 === t.includeDeletedObjects || 'true' === t.includeDeletedObjects;
                  return (
                    console.log('Making ListCatalog call with params:', {
                      types: s,
                      limit: r,
                      cursor: o,
                      includeRelatedObjects: i,
                      includeDeletedObjects: c,
                    }),
                    (e.agent.defaultHeaders['Square-Version'] = d),
                    e.catalog.listCatalog(s, o, r, c, i)
                  );
                },
                e,
                'catalog-api'
              );
              console.log('=== REQUEST BOUNDARY: listCatalogItems END ==='),
                console.log('Successfully retrieved catalog items:', {
                  count: r.result.objects?.length || 0,
                  cursor: r.result.cursor ? 'Present' : 'None',
                });
              const o = {
                success: !0,
                objects: r.result.objects || [],
                cursor: r.result.cursor,
                types: t.types || ['ITEM', 'CATEGORY'],
              };
              return i.cacheResponse(s, o, 'catalogItems'), o;
            } catch (e) {
              return (
                console.error('Error listing catalog items:', e),
                c.handleSquareError(e, 'Failed to list catalog items')
              );
            }
          },
          getCatalogItem: async function getCatalogItem(e, t) {
            try {
              console.log(`Getting catalog item: ${t}`);
              const n = s(e),
                a = await n.catalog.retrieveCatalogObject(t, !0);
              return {
                success: !0,
                catalogObject: a.result.object,
                relatedObjects: a.result.relatedObjects || [],
              };
            } catch (e) {
              return (
                console.error(`Error getting catalog item ${t}:`, e),
                a(e, 'Failed to get catalog item')
              );
            }
          },
          createOrUpdateCatalogItem: async function createOrUpdateCatalogItem(e, t) {
            try {
              console.log('Creating/updating catalog item in Square');
              const n = s(e),
                a = t.idempotencyKey || o.v4(),
                c = (function prepareCatalogObject(e) {
                  const t = {
                    type: e.type || 'ITEM',
                    id: e.id || `#${o.v4()}`,
                    presentAtAllLocations: !0,
                    version: e.version,
                  };
                  switch (t.type) {
                    case 'ITEM':
                      t.itemData = {
                        name: e.name,
                        description: e.description,
                        abbreviation: e.abbreviation,
                        productType: e.productType || 'REGULAR',
                        categoryId: e.categoryId,
                        taxIds: e.taxIds || [],
                        variations: e.variations || [],
                        imageIds: e.imageIds || [],
                        isArchived: e.isArchived || !1,
                        availableOnline: e.availableOnline || !1,
                        availableForPickup: e.availableForPickup || !1,
                        availableElectronically: e.availableElectronically || !1,
                        skipModifierScreen: e.skipModifierScreen || !1,
                        sortName: e.sortName,
                        modifierListInfo: e.modifierListInfo || [],
                        categories: e.categories || [],
                      };
                      break;
                    case 'CATEGORY':
                      t.categoryData = { name: e.name, imageIds: e.imageIds || [] };
                      break;
                    case 'TAX':
                      t.taxData = {
                        name: e.name,
                        calculationPhase: e.calculationPhase || 'TAX_SUBTOTAL_PHASE',
                        inclusionType: e.inclusionType || 'ADDITIVE',
                        percentage: e.percentage,
                        appliesToCustomAmounts: e.appliesToCustomAmounts || !1,
                        enabled: e.enabled || !0,
                      };
                      break;
                    case 'DISCOUNT':
                      t.discountData = {
                        name: e.name,
                        discountType: e.discountType || 'FIXED_PERCENTAGE',
                        percentage: e.percentage,
                        amountMoney: e.amountMoney,
                        pinRequired: e.pinRequired || !1,
                        labelColor: e.labelColor,
                      };
                      break;
                    case 'MODIFIER_LIST':
                      t.modifierListData = {
                        name: e.name,
                        selectionType: e.selectionType || 'SINGLE',
                        modifiers: e.modifiers || [],
                        imageIds: e.imageIds || [],
                      };
                      break;
                    case 'MODIFIER':
                      t.modifierData = {
                        name: e.name,
                        priceMoney: e.priceMoney,
                        ordinal: e.ordinal || 0,
                        modifierListId: e.modifierListId,
                        imageIds: e.imageIds || [],
                      };
                      break;
                    case 'IMAGE':
                      t.imageData = { name: e.name, url: e.url, caption: e.caption };
                      break;
                    default:
                      throw new Error(`Unsupported catalog object type: ${t.type}`);
                  }
                  return t;
                })(t);
              console.log(`Using idempotency key: ${a}`), console.log(`Object type: ${c.type}`);
              const l = { idempotencyKey: a, object: c },
                d = await n.catalog.upsertCatalogObject(l);
              try {
                const t = await i.getMerchantInfo(e);
                await r.create({
                  id: o.v4(),
                  square_catalog_id: d.result.catalogObject.id,
                  name: c.itemData?.name || c.categoryData?.name || 'Unnamed Item',
                  type: c.type,
                  merchant_id: t.id,
                  metadata: { idempotencyKey: a, version: d.result.catalogObject.version },
                });
              } catch (e) {
                console.error('Error storing catalog item reference:', e);
              }
              return { success: !0, catalogObject: d.result.catalogObject, idempotencyKey: a };
            } catch (e) {
              return (
                console.error('Error creating/updating catalog item:', e),
                a(e, 'Failed to create/update catalog item')
              );
            }
          },
          deleteCatalogItem: async function deleteCatalogItem(e, t) {
            try {
              console.log(`Deleting catalog item: ${t}`);
              const n = s(e);
              await n.catalog.deleteCatalogObject(t);
              try {
                const e = await r.findBySquareCatalogId(t);
                e && (await r.remove(e.id));
              } catch (e) {
                console.error('Error removing catalog item reference:', e);
              }
              return { success: !0, deletedObjectId: t };
            } catch (e) {
              return (
                console.error(`Error deleting catalog item ${t}:`, e),
                a(e, 'Failed to delete catalog item')
              );
            }
          },
          searchCatalogItems: async function searchCatalogItems(e, t = {}) {
            try {
              console.log('=== REQUEST BOUNDARY: searchCatalogItems START ==='),
                console.log(
                  'Searching catalog objects in Square with params:',
                  JSON.stringify(t, null, 2)
                );
              const n = {};
              (t.objectTypes || t.object_types) &&
                (n.objectTypes = t.objectTypes || t.object_types),
                t.limit && (n.limit = parseInt(t.limit)),
                t.cursor && (n.cursor = t.cursor),
                (t.includeDeletedObjects || t.include_deleted_objects) &&
                  (n.includeDeletedObjects = t.includeDeletedObjects || t.include_deleted_objects),
                (t.includeRelatedObjects || t.include_related_objects) &&
                  (n.includeRelatedObjects = t.includeRelatedObjects || t.include_related_objects),
                (t.beginTime || t.begin_time) && (n.beginTime = t.beginTime || t.begin_time),
                (t.includeCategoryPathToRoot || t.include_category_path_to_root) &&
                  (n.includeCategoryPathToRoot =
                    t.includeCategoryPathToRoot || t.include_category_path_to_root),
                t.query &&
                  ((n.query = t.query),
                  console.log('Using query from input:', Object.keys(t.query)[0])),
                console.log(
                  'Final search request being sent to Square:',
                  JSON.stringify(n, null, 2)
                );
              const s = await i.executeSquareRequest(
                async e => e.catalog.searchCatalogObjects(n),
                e,
                'catalog-api'
              );
              return (
                console.log('=== REQUEST BOUNDARY: searchCatalogItems END ==='),
                console.log('Results retrieved:', {
                  count: s.result.objects?.length || 0,
                  cursor: s.result.cursor ? 'Present' : 'None',
                }),
                {
                  success: !0,
                  objects: s.result.objects || [],
                  relatedObjects: s.result.relatedObjects || [],
                  cursor: s.result.cursor,
                }
              );
            } catch (e) {
              return (
                console.error('Error searching catalog items:', e),
                a(e, 'Failed to search catalog items')
              );
            }
          },
          batchRetrieveCatalogObjects: async function batchRetrieveCatalogObjects(e, t, n = !0) {
            try {
              console.log('Batch retrieving catalog objects');
              const a = s(e),
                r = await a.catalog.batchRetrieveCatalogObjects({
                  objectIds: t,
                  includeRelatedObjects: n,
                });
              return {
                success: !0,
                objects: r.result.objects || [],
                relatedObjects: r.result.relatedObjects || [],
              };
            } catch (e) {
              return (
                console.error('Error batch retrieving catalog objects:', e),
                a(e, 'Failed to batch retrieve catalog objects')
              );
            }
          },
          batchUpsertCatalogObjects: async function batchUpsertCatalogObjects(e, t) {
            try {
              console.log('Batch upserting catalog objects');
              const n = s(e).catalog,
                a = o.v4(),
                r = await n.batchUpsertCatalogObjects({ idempotencyKey: a, batches: t });
              return {
                success: !0,
                objects: r.result.objects || [],
                updatedAt: r.result.updatedAt,
                idempotencyKey: a,
              };
            } catch (e) {
              return (
                console.error('Error batch upserting catalog objects:', e),
                a(e, 'Failed to batch upsert catalog objects')
              );
            }
          },
          batchDeleteCatalogObjects: async function batchDeleteCatalogObjects(e, t) {
            try {
              if (!t || !Array.isArray(t) || 0 === t.length)
                return { success: !1, error: 'No catalog object IDs provided for deletion' };
              console.log(`Batch deleting ${t.length} catalog objects`);
              const n = s(e),
                a = { objectIds: t },
                o = await n.catalog.batchDeleteCatalogObjects(a);
              console.log('Successfully deleted catalog objects'),
                console.log(
                  'Deleted IDs count:',
                  o.result.deletedObjectIds ? o.result.deletedObjectIds.length : 0
                );
              try {
                const e = t.map(e => r.findBySquareCatalogId(e)),
                  n = (await Promise.all(e)).filter(e => null !== e);
                if (n.length > 0)
                  if (
                    (console.log(`Found ${n.length} local items to remove`),
                    'function' == typeof r.batchRemove)
                  ) {
                    const e = n.map(e => e.id);
                    await r.batchRemove(e),
                      console.log(`Batch removed ${e.length} catalog item references`);
                  } else
                    await Promise.all(n.map(e => r.remove(e.id))),
                      console.log(`Removed ${n.length} catalog item references in parallel`);
              } catch (e) {
                console.error('Error removing catalog item references:', e);
              }
              return { success: !0, deletedObjectIds: o.result.deletedObjectIds || [] };
            } catch (e) {
              return (
                console.error('Error batch deleting catalog objects:', e),
                a(e, 'Failed to batch delete catalog objects')
              );
            }
          },
          updateItemModifierLists: async function updateItemModifierLists(e, t, n = [], r = []) {
            try {
              console.log(`Updating modifier lists for item: ${t}`);
              const a = s(e).catalog;
              return {
                success: !0,
                updatedAt: (
                  await a.updateItemModifierLists({
                    itemIds: [t],
                    modifierListsToEnable: n,
                    modifierListsToDisable: r,
                  })
                ).result.updatedAt,
              };
            } catch (e) {
              return (
                console.error(`Error updating modifier lists for item ${t}:`, e),
                a(e, 'Failed to update item modifier lists')
              );
            }
          },
          updateItemTaxes: async function updateItemTaxes(e, t, n = [], r = []) {
            try {
              console.log(`Updating taxes for item: ${t}`);
              const a = s(e).catalog;
              return {
                success: !0,
                updatedAt: (
                  await a.updateItemTaxes({ itemIds: [t], taxesToEnable: n, taxesToDisable: r })
                ).result.updatedAt,
              };
            } catch (e) {
              return (
                console.error(`Error updating taxes for item ${t}:`, e),
                a(e, 'Failed to update item taxes')
              );
            }
          },
          getCatalogCategories: async function getCatalogCategories(e) {
            try {
              console.log('=== REQUEST BOUNDARY: getCatalogCategories START ===');
              const t = `catalog-categories-${e}`,
                s = i.getCachedResponse(t, 'catalogCategories');
              if (s) return console.log('Using cached catalog categories data'), s;
              console.log('Getting catalog categories from Square');
              const a = n(938),
                r = {
                  object_types: ['CATEGORY'],
                  limit: 200,
                  include_related_objects: !0,
                  query: {
                    range_query: {
                      attribute_name: 'is_top_level',
                      attribute_max_value: 1,
                      attribute_min_value: 1,
                    },
                  },
                };
              console.log('Category search request:', JSON.stringify(r, null, 2)),
                console.log('Making API call to Square for categories...');
              const o = await a({
                method: 'post',
                url: `https://connect.squareup.com/${l}/catalog/search`,
                headers: {
                  Authorization: `Bearer ${e}`,
                  'Content-Type': 'application/json',
                  'Square-Version': d,
                },
                data: r,
              });
              if (
                (console.log('Square response status:', o.status),
                console.log('Response headers:', JSON.stringify(o.headers, null, 2)),
                console.log(
                  'Response data structure:',
                  0 === Object.keys(o.data).length
                    ? 'Empty response body'
                    : JSON.stringify(
                        {
                          objects_array_length: o.data.objects ? o.data.objects.length : 0,
                          objects_present: !!o.data.objects,
                          related_objects_present: !!o.data.related_objects,
                          cursor_present: !!o.data.cursor,
                        },
                        null,
                        2
                      )
                ),
                !o.data.objects || 0 === o.data.objects.length)
              ) {
                console.log(
                  'No top-level categories found, trying fallback query to find all categories...'
                );
                const n = {
                  object_types: ['CATEGORY'],
                  limit: 200,
                  include_related_objects: !0,
                  query: { exact_query: { attribute_name: 'name', attribute_value: '.' } },
                };
                console.log('Fallback category search request:', JSON.stringify(n, null, 2));
                const s = await a({
                  method: 'post',
                  url: `https://connect.squareup.com/${l}/catalog/search`,
                  headers: {
                    Authorization: `Bearer ${e}`,
                    'Content-Type': 'application/json',
                    'Square-Version': d,
                  },
                  data: n,
                });
                console.log('Fallback response status:', s.status),
                  console.log(
                    'Fallback objects found:',
                    s.data.objects ? s.data.objects.length : 0
                  ),
                  console.log('=== REQUEST BOUNDARY: getCatalogCategories END (Success) ===');
                const r = {
                  success: !0,
                  categories: s.data.objects || [],
                  relatedObjects: s.data.related_objects || [],
                  cursor: s.data.cursor,
                };
                return i.cacheResponse(t, r, 'catalogCategories'), r;
              }
              console.log('=== REQUEST BOUNDARY: getCatalogCategories END (Success) ===');
              const c = {
                success: !0,
                categories: o.data.objects || [],
                relatedObjects: o.data.related_objects || [],
                cursor: o.data.cursor,
              };
              return i.cacheResponse(t, c, 'catalogCategories'), c;
            } catch (e) {
              return (
                console.error('=== REQUEST BOUNDARY: getCatalogCategories END (Error) ==='),
                console.error(
                  'Error getting catalog categories:',
                  e.response ? e.response.data : e
                ),
                e.response && e.response.data
                  ? {
                      success: !1,
                      error: {
                        message:
                          e.response.data.errors?.[0]?.detail || 'Failed to get catalog categories',
                        code: e.response.data.errors?.[0]?.code || 'UNKNOWN_ERROR',
                        details: e.response.data.errors || [],
                      },
                    }
                  : a(e, 'Failed to get catalog categories')
              );
            }
          },
          listCatalogCategories: async function listCatalogCategories(e, t = {}) {
            try {
              console.log('=== REQUEST BOUNDARY: listCatalogCategories START ==='),
                console.log(
                  'Listing catalog categories from Square - simplified call without DB access'
                );
              s(e).catalog;
              const { limit: a = 200, cursor: r } = t,
                o = n(938);
              console.log(
                'Making ListCatalog request with params:',
                JSON.stringify({ object_types: ['CATEGORY'], limit: a, cursor: r }, null, 2)
              );
              const i = await o({
                method: 'get',
                url: `https://connect.squareup.com/${l}/catalog/list`,
                headers: {
                  Authorization: `Bearer ${e}`,
                  'Content-Type': 'application/json',
                  'Square-Version': d,
                },
                params: { types: 'CATEGORY', limit: a, cursor: r },
              });
              return (
                i?.data
                  ? (console.log(
                      'ListCatalog response successful. Objects count:',
                      i.data.objects ? i.data.objects.length : 0
                    ),
                    i.data.objects && i.data.objects.length > 0
                      ? console.log(
                          'First few categories:',
                          i.data.objects
                            .slice(0, 3)
                            .map(e => ({
                              id: e.id,
                              type: e.type,
                              name: e.category_data?.name || 'Unknown',
                            }))
                        )
                      : (console.log('Warning: No categories returned. This might indicate:'),
                        console.log('1. There are no categories in the Square account'),
                        console.log(
                          '2. The token might not have access to the requested catalog categories'
                        ),
                        console.log(
                          '3. The merchant account might be empty or incorrectly configured'
                        )))
                  : console.log('Warning: Unexpected response format from Square:', i),
                console.log('=== REQUEST BOUNDARY: listCatalogCategories END (Success) ==='),
                {
                  success: !0,
                  objects: i.data.objects || [],
                  cursor: i.data.cursor,
                  count: i.data.objects ? i.data.objects.length : 0,
                }
              );
            } catch (e) {
              return (
                console.error('=== REQUEST BOUNDARY: listCatalogCategories END (Error) ==='),
                console.error(
                  'Error listing catalog categories:',
                  e.response ? e.response.data : e
                ),
                console.error('Square API Error:', e),
                e.response && e.response.data
                  ? {
                      success: !1,
                      error: {
                        message:
                          e.response.data.errors?.[0]?.detail ||
                          'Failed to list catalog categories',
                        code: e.response.data.errors?.[0]?.code || 'UNKNOWN_ERROR',
                        details: e.response.data.errors || [],
                      },
                    }
                  : a(e, 'Failed to list catalog categories')
              );
            }
          },
        };
      },
      229: (e, t, n) => {
        const s = n(252).Router(),
          a = n(594),
          r = n(167);
        s.get('/', a.checkHealth),
          s.get('/detailed', a.checkDetailedHealth),
          s.get('/test-page', a.renderTestPage),
          s.get('/oauth-test', a.oauthTestPage),
          s.get('/oauth-debug', a.oauthDebugTool),
          s.get('/aws-diagnostic', r.runAwsDiagnostic),
          (e.exports = s);
      },
      252: e => {
        'use strict';
        e.exports = require('express');
      },
      270: e => {
        const t = { tokensPerInterval: 20, intervalMs: 1e3, bucketSize: 30 },
          n = new Map();
        class TokenBucket {
          constructor(e = {}) {
            (this.tokens = e.bucketSize || t.bucketSize),
              (this.tokensPerInterval = e.tokensPerInterval || t.tokensPerInterval),
              (this.intervalMs = e.intervalMs || t.intervalMs),
              (this.bucketSize = e.bucketSize || t.bucketSize),
              (this.lastRefillTimestamp = Date.now());
          }
          _refill() {
            const e = Date.now(),
              t = e - this.lastRefillTimestamp;
            if (t > 0) {
              const n = (t / this.intervalMs) * this.tokensPerInterval;
              (this.tokens = Math.min(this.bucketSize, this.tokens + n)),
                (this.lastRefillTimestamp = e);
            }
          }
          tryConsume(e = 1) {
            return this._refill(), this.tokens >= e && ((this.tokens -= e), !0);
          }
          getWaitTimeMs(e = 1) {
            if ((this._refill(), this.tokens >= e)) return 0;
            return ((e - this.tokens) / this.tokensPerInterval) * this.intervalMs;
          }
        }
        function getBucket(e, s = {}) {
          return n.has(e) || n.set(e, new TokenBucket({ ...t, ...s })), n.get(e);
        }
        async function acquire(e, t = 1) {
          const n = getBucket(e);
          if (n.tryConsume(t)) return;
          const s = n.getWaitTimeMs(t);
          s > 0 &&
            (console.log(`Rate limiting: Waiting ${s}ms before making request to ${e}`),
            await new Promise(e => setTimeout(e, s)),
            n.tryConsume(t));
        }
        e.exports = {
          tryAcquire: function tryAcquire(e, t = 1) {
            return getBucket(e).tryConsume(t);
          },
          acquire,
          rateLimit: function rateLimit(e, t, n = 1) {
            return async (...s) => (await acquire(t, n), e(...s));
          },
          configureBucket: function configureBucket(e, s) {
            n.set(e, new TokenBucket({ ...t, ...s }));
          },
          DEFAULT_BUCKET_CONFIG: t,
        };
      },
      277: e => {
        'use strict';
        e.exports = require('serverless-http');
      },
      285: e => {
        function safeSerialize(e) {
          if (null == e) return e;
          try {
            return JSON.parse(
              JSON.stringify(e, (e, t) => ('bigint' == typeof t ? t.toString() : t))
            );
          } catch (t) {
            if ((console.error('Error in safeSerialize:', t), 'object' == typeof e)) {
              const t = Array.isArray(e) ? [] : {};
              for (const n in e)
                if (Object.prototype.hasOwnProperty.call(e, n)) {
                  const s = e[n];
                  t[n] =
                    'bigint' == typeof s
                      ? s.toString()
                      : 'object' == typeof s && null !== s
                        ? safeSerialize(s)
                        : s;
                }
              return t;
            }
            return e;
          }
        }
        e.exports = {
          handleSquareError: function handleSquareError(e, t = 'An error occurred') {
            console.error('Square API Error:', e);
            const n = e.cause || e,
              s = { success: !1, error: { message: t, code: 'UNKNOWN_ERROR', details: [] } };
            if ('SquareError' === n.name)
              return (
                (s.error.message = n.message),
                (s.error.code = n.code || 'SQUARE_SDK_ERROR'),
                (s.error.details = n.errors || []),
                n.statusCode && (s.statusCode = n.statusCode),
                s
              );
            if (n.errors && Array.isArray(n.errors))
              (s.error.details = n.errors.map(e => ({
                code: e.code || 'UNKNOWN_ERROR',
                detail: e.detail || e.message || 'Unknown error',
                field: e.field || null,
              }))),
                n.errors[0]?.detail && (s.error.message = n.errors[0].detail),
                n.errors[0]?.code && (s.error.code = n.errors[0].code);
            else if (n.response?.data?.errors) {
              const e = n.response.data.errors;
              (s.error.details = e.map(e => ({
                code: e.code || 'UNKNOWN_ERROR',
                detail: e.detail || e.message || 'Unknown error',
                field: e.field || null,
              }))),
                e[0]?.detail && (s.error.message = e[0].detail),
                e[0]?.code && (s.error.code = e[0].code);
            } else
              n.details
                ? ((s.error.details = n.details),
                  (s.error.message = n.message),
                  (s.error.code = n.code || 'UNKNOWN_ERROR'))
                : n.message &&
                  ((s.error.message = n.message),
                  n.code
                    ? (s.error.code = n.code)
                    : n.message.includes('Authentication') || n.message.includes('Unauthorized')
                      ? (s.error.code = 'AUTHENTICATION_ERROR')
                      : n.message.includes('Rate limit')
                        ? (s.error.code = 'RATE_LIMIT_ERROR')
                        : n.message.includes('Timeout')
                          ? (s.error.code = 'TIMEOUT_ERROR')
                          : n.message.includes('Network') && (s.error.code = 'NETWORK_ERROR'));
            if (
              (void 0 !== n.retries &&
                ((s.error.retries = n.retries),
                n.retries > 0 && (s.error.message += ` (after ${n.retries} retries)`)),
              n.statusCode || n.response?.status)
            ) {
              const e = n.statusCode || n.response?.status;
              switch (((s.statusCode = e), e)) {
                case 401:
                  (s.error.code = 'AUTHENTICATION_ERROR'),
                    (s.error.message =
                      'Authentication failed. Please reconnect your Square account.');
                  break;
                case 403:
                  (s.error.code = 'PERMISSION_ERROR'),
                    (s.error.message = 'You do not have permission to perform this action.');
                  break;
                case 404:
                  (s.error.code = 'NOT_FOUND'),
                    (s.error.message = 'The requested resource was not found.');
                  break;
                case 429:
                  (s.error.code = 'RATE_LIMIT_ERROR'),
                    (s.error.message = 'Rate limit exceeded. Please try again later.'),
                    n.response?.headers?.['retry-after'] &&
                      (s.error.retryAfter = parseInt(n.response.headers['retry-after'], 10));
                  break;
                case 400:
                  ('INVALID_REQUEST_ERROR' === n.code || n.message.includes('validation')) &&
                    ((s.error.code = 'VALIDATION_ERROR'),
                    (s.error.message = 'Invalid request: ' + n.message));
                  break;
                case 500:
                case 502:
                case 503:
                case 504:
                  (s.error.code = 'SERVER_ERROR'),
                    (s.error.message =
                      'Square API is currently unavailable. Please try again later.');
              }
            }
            return s;
          },
          createApiResponse: function createApiResponse(e, t = null, n = null) {
            const s = { success: e };
            if (e && t) {
              const e = safeSerialize(t);
              Object.assign(s, e), n && (s.message = n);
            } else
              e ||
                (s.error = {
                  message: n || 'An error occurred',
                  code: t?.code || 'UNKNOWN_ERROR',
                  details: safeSerialize(t?.details) || [],
                });
            return s;
          },
          safeSerialize,
          createErrorWithCause: function createErrorWithCause(e, t, n = {}) {
            const s = new Error(e, { cause: t });
            return n && Object.assign(s, n), s;
          },
        };
      },
      375: (e, t, n) => {
        const s = n(252).Router(),
          { protect: a } = n(431),
          r = n(698);
        s.get('/', a, async (e, t) => {
          try {
            const n = await r.listLocations(e.user.squareAccessToken);
            t.json(n);
          } catch (e) {
            console.error('Error retrieving locations:', e),
              t
                .status(e.statusCode || 500)
                .json({
                  success: !1,
                  message: e.message || 'Failed to get locations',
                  error: e.details || e.toString(),
                });
          }
        }),
          (e.exports = s);
      },
      420: e => {
        'use strict';
        e.exports = require('@aws-sdk/client-secrets-manager');
      },
      431: (e, t, n) => {
        n(252), n(829);
        const s = n(432),
          { getSquareClient: a } = n(90),
          r = n(90);
        const authenticate = async (e, t, n) => {
          try {
            console.log('Authenticating request for', e.path);
            let s = e.headers.authorization;
            if (
              (!s && e.get && (s = e.get('Authorization')),
              console.log('Authorization header found:', !!s),
              !s || !s.startsWith('Bearer '))
            )
              return (
                console.log('Missing or invalid authorization header'),
                t
                  .status(401)
                  .json({
                    success: !1,
                    message: 'Authentication failed - Missing or invalid authorization header',
                  })
              );
            const a = s.split(' ')[1];
            if (!a)
              return (
                console.log('Empty token provided'),
                t.status(401).json({ success: !1, message: 'Authentication failed - Empty token' })
              );
            try {
              console.log('Validating Square access token...');
              const s = await r.getMerchantInfo(a);
              if (!s || !s.id)
                return (
                  console.error('Auth failed: Invalid Square response', {
                    hasMerchant: !!s,
                    hasMerchantId: s && !!s.id,
                  }),
                  t
                    .status(401)
                    .json({ success: !1, message: 'Authentication failed - Invalid merchant data' })
                );
              (e.user = {
                merchantId: s.id,
                squareAccessToken: a,
                businessName: s.businessName || 'Unknown',
                countryCode: s.country,
                languageCode: s.language,
              }),
                console.log('Auth successful:', {
                  merchantId: s.id,
                  businessName: e.user.businessName,
                  path: e.path,
                }),
                n();
            } catch (e) {
              return (
                console.error('Authentication error:', e),
                t
                  .status(401)
                  .json({
                    success: !1,
                    message: 'Authentication failed - ' + (e.message || 'Invalid token'),
                  })
              );
            }
          } catch (e) {
            return (
              console.error('Unexpected auth error:', e),
              t.status(500).json({ success: !1, message: 'Server error during authentication' })
            );
          }
        };
        e.exports = {
          protect: (e, t, n) => {
            console.log('Auth middleware invoked for path:', e.path), authenticate(e, t, n);
          },
          refreshSquareTokenIfNeeded: async function refreshSquareTokenIfNeeded(e, t, n) {
            try {
              const a = e.user;
              if (!a.square_access_token || !a.square_token_expires_at) return n();
              const o = new Date(a.square_token_expires_at).getTime(),
                i = Date.now();
              if (o - i < 36e5)
                try {
                  const n = a.square_refresh_token;
                  if (!n)
                    return t
                      .status(401)
                      .json({ error: 'Square authorization expired', squareAuthRequired: !0 });
                  const o = await r.refreshToken(n),
                    i = await s.update(a.id, {
                      square_access_token: o.access_token,
                      square_refresh_token: o.refresh_token,
                      square_token_expires_at: new Date(
                        Date.now() + 1e3 * o.expires_in
                      ).toISOString(),
                    });
                  e.user = i;
                } catch (e) {
                  return (
                    console.error('Error refreshing Square token:', e),
                    t
                      .status(401)
                      .json({
                        error: 'Failed to refresh Square authorization',
                        squareAuthRequired: !0,
                      })
                  );
                }
              n();
            } catch (e) {
              console.error('Square token refresh error:', e),
                t.status(500).json({ error: 'Server error' });
            }
          },
          authenticate,
        };
      },
      432: (e, t, n) => {
        const { DynamoDBClient: s } = n(929),
          {
            DynamoDBDocumentClient: a,
            GetCommand: r,
            PutCommand: o,
            UpdateCommand: i,
            DeleteCommand: c,
          } = n(515),
          { v4: l } = n(903),
          d =
            (n(829),
            new s({ maxAttempts: 3, requestTimeout: 3e3, region: process.env.AWS_REGION })),
          u = a.from(d),
          g = process.env.USERS_TABLE,
          p = {
            async getById(e) {
              const t = { TableName: g, Key: { id: e } };
              return (await u.send(new r(t))).Item;
            },
            async create(e) {
              const t = new Date().toISOString(),
                n = { ...e, createdAt: t, updatedAt: t },
                s = { TableName: g, Item: n };
              return await u.send(new o(s)), n;
            },
            async update(e, t) {
              const n = new Date().toISOString();
              let s = 'SET updatedAt = :updatedAt';
              const a = { ':updatedAt': n };
              Object.keys(t).forEach((e, n) => {
                if ('id' !== e) {
                  const r = `:attr${n}`;
                  (s += `, ${e} = ${r}`), (a[r] = t[e]);
                }
              });
              const r = {
                TableName: g,
                Key: { id: e },
                UpdateExpression: s,
                ExpressionAttributeValues: a,
                ReturnValues: 'ALL_NEW',
              };
              return (await u.send(new i(r))).Attributes;
            },
            async delete(e) {
              const t = { TableName: g, Key: { id: e } };
              return u.send(new c(t));
            },
          };
        e.exports = p;
      },
      515: e => {
        'use strict';
        e.exports = require('@aws-sdk/lib-dynamodb');
      },
      518: e => {
        'use strict';
        e.exports = require('@aws-sdk/client-lambda');
      },
      539: e => {
        'use strict';
        e.exports = require('square');
      },
      576: (e, t, n) => {
        const s = n(577),
          a = [
            'https://auth.expo.io',
            'https://auth.expo.io/@joylabs',
            'exp://exp.host/@joylabs',
            'joylabs://',
            'exp://',
          ].filter(Boolean);
        (e.exports = () =>
          s({
            origin: (e, t) => {
              if (!e) return t(null, !0);
              console.log('Incoming request origin:', e);
              a.some(t => e.startsWith(t))
                ? (console.log(`Origin ${e} is allowed`), t(null, !0))
                : (console.warn(`Origin ${e} not in allowed list`),
                  t(new Error('Not allowed by CORS')));
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
              'Content-Type',
              'Authorization',
              'X-Requested-With',
              'Accept',
              'Origin',
              'User-Agent',
              'Cookie',
              'Square-Signature',
            ],
            exposedHeaders: ['Set-Cookie'],
            credentials: !0,
            maxAge: 86400,
            preflightContinue: !1,
            optionsSuccessStatus: 204,
          })),
          (e.exports.authCors = () => (e, t, n) => {
            try {
              console.log('Auth CORS middleware:', {
                path: e.path,
                method: e.method,
                origin: e.headers.origin || 'No origin',
                host: e.headers.host,
              });
              const s = e.headers.origin;
              if (
                s &&
                (s.startsWith('https://auth.expo.io') ||
                  s.startsWith('exp://') ||
                  s.startsWith('joylabs://'))
              )
                console.log(`Expo AuthSession origin detected: ${s}`),
                  t.header('Access-Control-Allow-Origin', s);
              else {
                a.some(e => s && s.startsWith(e))
                  ? t.header('Access-Control-Allow-Origin', s)
                  : t.header('Access-Control-Allow-Origin', process.env.API_BASE_URL);
              }
              if (
                (t.header('Access-Control-Allow-Credentials', 'true'),
                t.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'),
                t.header(
                  'Access-Control-Allow-Headers',
                  'Content-Type, Authorization, X-Requested-With, Accept, User-Agent, Origin, Cookie, Square-Signature'
                ),
                t.header('Access-Control-Expose-Headers', 'Set-Cookie'),
                'OPTIONS' === e.method)
              )
                return (
                  console.log('Handling OPTIONS request for auth route:', e.path),
                  t.header('Access-Control-Max-Age', '86400'),
                  t.status(204).end()
                );
              n();
            } catch (e) {
              console.error('Auth CORS error:', e), n(e);
            }
          });
      },
      577: e => {
        'use strict';
        e.exports = require('cors');
      },
      581: e => {
        'use strict';
        e.exports = require('connect-dynamodb');
      },
      594: (e, t, n) => {
        const { DynamoDBClient: s } = n(929),
          { DynamoDBDocumentClient: a, ScanCommand: r, ListTablesCommand: o } = n(515);
        e.exports = {
          checkHealth: function checkHealth(e, t) {
            t.json({
              status: 'ok',
              timestamp: new Date().toISOString(),
              environment: 'production',
              message: 'API is up and running',
            });
          },
          checkDetailedHealth: async function checkDetailedHealth(e, t) {
            try {
              const e = {
                  api: {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    environment: 'production',
                  },
                  dynamoDB: { status: 'checking' },
                  square: {
                    config: {
                      applicationId: process.env.SQUARE_APPLICATION_ID ? 'configured' : 'missing',
                      environment: process.env.SQUARE_ENVIRONMENT || 'not set',
                    },
                  },
                  env: {
                    region: process.env.AWS_REGION || 'not set',
                    apiBaseUrl: process.env.API_BASE_URL || 'not set',
                  },
                },
                i =
                  'true' === process.env.IS_OFFLINE
                    ? new s({ region: 'localhost', endpoint: 'http://localhost:8000' })
                    : new s({ region: process.env.AWS_REGION }),
                c = a.from(i);
              try {
                if ('true' === process.env.IS_OFFLINE) {
                  const t = { TableName: process.env.USERS_TABLE, Limit: 1 };
                  await c.send(new r(t)),
                    (e.dynamoDB = { status: 'ok', message: 'Connected to local DynamoDB' });
                } else {
                  const t = await c.send(new o({}));
                  e.dynamoDB = {
                    status: 'ok',
                    message: 'Connected to AWS DynamoDB',
                    tables: t.TableNames.filter(e => e.includes('joylabs')),
                  };
                }
              } catch (t) {
                e.dynamoDB = {
                  status: 'error',
                  message: `Failed to connect to DynamoDB: ${t.message}`,
                };
              }
              if (process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET) {
                e.square.status = 'configured';
                const t = n(90),
                  s = 'test-state-parameter';
                e.square.testOAuthUrl = t.getAuthorizationUrl(s);
              } else e.square.status = 'not configured';
              t.json(e);
            } catch (e) {
              console.error('Health check error:', e),
                t.status(500).json({ status: 'error', message: e.message });
            }
          },
          renderTestPage: function renderTestPage(e, t) {
            const s = n(90).getAuthorizationUrl('test-state-parameter'),
              a = e.get('host').includes('localhost')
                ? process.env.API_BASE_URL
                : process.env.API_PROD_URL || e.protocol + '://' + e.get('host'),
              r =
                'production' === (process.env.SQUARE_ENVIRONMENT || 'sandbox')
                  ? 'Production'
                  : 'Sandbox';
            t.send(
              `\n    <!DOCTYPE html>\n    <html>\n      <head>\n        <meta charset="utf-8">\n        <title>JoyLabs Backend Test Page</title>\n        <meta name="viewport" content="width=device-width, initial-scale=1">\n        <style>\n          body { \n            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n            line-height: 1.6;\n            color: #333;\n            max-width: 800px;\n            margin: 0 auto;\n            padding: 20px;\n          }\n          .card {\n            background: #fff;\n            border-radius: 8px;\n            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n            padding: 20px;\n            margin: 20px 0;\n          }\n          h1 { color: #4CAF50; }\n          h2 { margin-top: 30px; }\n          .button {\n            background: #4CAF50;\n            color: white;\n            border: none;\n            padding: 10px 15px;\n            border-radius: 4px;\n            cursor: pointer;\n            text-decoration: none;\n            display: inline-block;\n            margin: 10px 0;\n          }\n          .button.aws {\n            background: #FF9900;\n          }\n          .info {\n            background: #f5f5f5;\n            padding: 15px;\n            border-radius: 4px;\n            margin: 15px 0;\n          }\n          .env-var {\n            display: flex;\n            margin-bottom: 5px;\n          }\n          .env-var .key {\n            font-weight: bold;\n            min-width: 200px;\n          }\n          .env-var .value {\n            font-family: monospace;\n          }\n          .good { color: #4CAF50; }\n          .bad { color: #F44336; }\n        </style>\n      </head>\n      <body>\n        <h1>JoyLabs Backend Test Page</h1>\n        \n        <div class="card">\n          <h2>Environment Information</h2>\n          <div class="info">\n            <div class="env-var">\n              <div class="key">Environment:</div>\n              <div class="value">production</div>\n            </div>\n            <div class="env-var">\n              <div class="key">API Base URL:</div>\n              <div class="value">${a}</div>\n            </div>\n            <div class="env-var">\n              <div class="key">AWS Region:</div>\n              <div class="value">${process.env.AWS_REGION || 'not set'}</div>\n            </div>\n            <div class="env-var">\n              <div class="key">Running Offline:</div>\n              <div class="value">${'true' === process.env.IS_OFFLINE ? 'Yes' : 'No'}</div>\n            </div>\n            <div class="env-var">\n              <div class="key">Square Environment:</div>\n              <div class="value">${r}</div>\n            </div>\n            <div class="env-var">\n              <div class="key">Square Application ID:</div>\n              <div class="value">${process.env.SQUARE_APPLICATION_ID ? '✓ Configured' : '✗ Not configured'}</div>\n            </div>\n          </div>\n        </div>\n        \n        <div class="card">\n          <h2>API Health Checks</h2>\n          <p>Click the buttons below to check the health status of your API</p>\n          <a href="${a}/api/health" class="button">Basic Health Check</a>\n          <a href="${a}/api/health/detailed" class="button">Detailed Health Check</a>\n          <a href="${a}/api/health/aws-diagnostic" class="button aws">AWS Diagnostic Tool</a>\n        </div>\n        \n        <div class="card">\n          <h2>Square OAuth Testing</h2>\n          <p>Click the button below to test the Square OAuth flow</p>\n          <a href="${s}" class="button">Test Square OAuth</a>\n          <p class="info">\n            This will redirect you to Square's authentication page. After authenticating, \n            you'll be redirected back to this application with an authentication token.\n          </p>\n        </div>\n\n        <div class="card">\n          <h2>AWS Deployment</h2>\n          <p>Follow these steps to deploy your backend:</p>\n          <ol>\n            <li>Configure AWS credentials (already done if you're seeing this page)</li>\n            <li>Run <code>serverless deploy</code> to deploy to AWS</li>\n            <li>After deployment, update your .env file with the new API Gateway URL</li>\n            <li>Update your Square Developer Dashboard with the new callback URL</li>\n          </ol>\n          <a href="${a}/api/health/aws-diagnostic" class="button aws">Run AWS Diagnostic</a>\n        </div>\n\n        <div class="card">\n          <h2>Documentation</h2>\n          <p>API Documentation and Square OAuth Integration</p>\n          <a href="https://developer.squareup.com/docs/oauth-api/overview" target="_blank" class="button">Square OAuth Docs</a>\n          <a href="https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml/" target="_blank" class="button">Serverless Docs</a>\n        </div>\n      </body>\n    </html>\n  `
            );
          },
          oauthTestPage: function oauthTestPage(e, t) {
            t.send(
              `\n    <!DOCTYPE html>\n    <html>\n      <head>\n        <meta charset="utf-8">\n        <title>OAuth Test Page</title>\n        <meta name="viewport" content="width=device-width, initial-scale=1">\n        <style>\n          body { \n            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;\n            line-height: 1.6;\n            color: #333;\n            max-width: 800px;\n            margin: 0 auto;\n            padding: 20px;\n          }\n          .card {\n            background: #fff;\n            border-radius: 8px;\n            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n            padding: 20px;\n            margin: 20px 0;\n            overflow: hidden;\n          }\n          button, .button {\n            background: #4285f4;\n            color: white;\n            border: none;\n            padding: 10px 15px;\n            border-radius: 4px;\n            font-size: 16px;\n            cursor: pointer;\n            text-decoration: none;\n            display: inline-block;\n            margin: 5px 0;\n          }\n          button:hover, .button:hover {\n            background: #2b6fc5;\n          }\n          h1, h2 { margin-top: 0; }\n          .env-info {\n            background: #e8f5e9;\n            padding: 10px;\n            border-radius: 4px;\n            margin: 10px 0;\n          }\n          .warning {\n            background: #fff3e0;\n            padding: 10px;\n            border-radius: 4px;\n            margin: 10px 0;\n          }\n        </style>\n      </head>\n      <body>\n        <div class="card">\n          <h1>Square OAuth Test</h1>\n          \n          <div class="env-info">\n            <strong>Environment:</strong> production<br>\n            <strong>Square Environment:</strong> ${process.env.SQUARE_ENVIRONMENT}<br>\n            <strong>Redirect URL:</strong> ${process.env.SQUARE_REDIRECT_URL}\n          </div>\n          \n          <div class="warning">\n            <strong>Note:</strong> Each OAuth attempt will generate a unique state parameter for security.\n            The state parameter is stored temporarily and validated when Square redirects back to your application.\n          </div>\n          \n          <h2>Start OAuth Flow</h2>\n          <p>Click the button below to start the Square OAuth flow:</p>\n          <a href="/api/auth/square" class="button">Start OAuth Flow</a>\n        </div>\n      </body>\n    </html>\n  `
            );
          },
          oauthDebugTool: (e, t) => {
            t.send(
              `\n    <!DOCTYPE html>\n    <html>\n      <head>\n        <meta charset="utf-8">\n        <title>OAuth Debug Tool</title>\n        <meta name="viewport" content="width=device-width, initial-scale=1">\n        <style>\n          body { \n            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;\n            line-height: 1.6;\n            color: #333;\n            max-width: 800px;\n            margin: 0 auto;\n            padding: 20px;\n            background: #f5f5f7;\n          }\n          .card {\n            background: #fff;\n            border-radius: 8px;\n            box-shadow: 0 2px 10px rgba(0,0,0,0.1);\n            padding: 20px;\n            margin: 20px 0;\n          }\n          h1, h2, h3 { color: #333; margin-top: 0; }\n          pre {\n            background: #f5f5f5;\n            padding: 15px;\n            border-radius: 4px;\n            overflow-x: auto;\n            white-space: pre-wrap;\n            word-break: break-all;\n          }\n          .code {\n            font-family: monospace;\n            background: #f5f5f5;\n            padding: 15px;\n            border-radius: 4px;\n            overflow-x: auto;\n          }\n          .button {\n            background: #4285f4;\n            color: white;\n            border: none;\n            padding: 10px 15px;\n            border-radius: 4px;\n            cursor: pointer;\n            text-decoration: none;\n            display: inline-block;\n            margin: 5px 5px 5px 0;\n            font-size: 14px;\n          }\n          .button.red { background: #ea4335; }\n          .button.green { background: #34a853; }\n          .button.yellow { background: #fbbc05; }\n          input[type="text"] {\n            padding: 8px;\n            border: 1px solid #ddd;\n            border-radius: 4px;\n            width: 100%;\n            margin-bottom: 10px;\n            font-family: monospace;\n          }\n          .tool-description {\n            color: #666;\n            font-size: 14px;\n            margin-bottom: 15px;\n          }\n          table {\n            width: 100%;\n            border-collapse: collapse;\n            margin: 20px 0;\n          }\n          table, th, td {\n            border: 1px solid #ddd;\n          }\n          th, td {\n            padding: 10px;\n            text-align: left;\n          }\n          th {\n            background-color: #f5f5f5;\n          }\n          #resultContainer {\n            display: none;\n            margin-top: 20px;\n          }\n        </style>\n      </head>\n      <body>\n        <div class="card">\n          <h1>Square OAuth Debug Tool</h1>\n          <p class="tool-description">\n            This tool helps diagnose OAuth issues with Square integration.\n            It provides detailed information about the OAuth process and helps troubleshoot common problems.\n          </p>\n        </div>\n\n        <div class="card">\n          <h2>Environment Information</h2>\n          <table>\n            <tr>\n              <th>Setting</th>\n              <th>Value</th>\n            </tr>\n            <tr>\n              <td>Node Environment</td>\n              <td>production</td>\n            </tr>\n            <tr>\n              <td>Square Environment</td>\n              <td>${process.env.SQUARE_ENVIRONMENT || 'not set'}</td>\n            </tr>\n            <tr>\n              <td>API Base URL</td>\n              <td>${process.env.API_BASE_URL || 'not set'}</td>\n            </tr>\n            <tr>\n              <td>Square Application ID</td>\n              <td>${process.env.SQUARE_APPLICATION_ID ? '✓ Configured' : '✗ Not configured'}</td>\n            </tr>\n            <tr>\n              <td>Session Support</td>\n              <td>${e.session ? '✓ Enabled' : '✗ Disabled'}</td>\n            </tr>\n            <tr>\n              <td>User Agent</td>\n              <td>${e.headers['user-agent'] || 'not available'}</td>\n            </tr>\n          </table>\n        </div>\n\n        <div class="card">\n          <h2>Cookie Debug</h2>\n          <div class="tool-description">\n            Your current cookies:\n          </div>\n          <pre>${JSON.stringify(e.cookies, null, 2) || 'No cookies found'}</pre>\n          \n          <div class="tool-description">\n            Test cookie functionality:\n          </div>\n          <button id="setCookieBtn" class="button green">Set Test Cookie</button>\n          <button id="getCookieBtn" class="button">Check Test Cookie</button>\n          <button id="clearCookieBtn" class="button red">Clear Test Cookie</button>\n        </div>\n        \n        <div class="card">\n          <h2>OAuth Test Tools</h2>\n          \n          <div class="tool-description">\n            <strong>1. Test OAuth Initialization</strong> - Generates state and PKCE parameters\n          </div>\n          <button id="testOAuthInitBtn" class="button">Test OAuth Init</button>\n          \n          <div class="tool-description">\n            <strong>2. Test Direct Callback</strong> - Bypasses Square authorization\n          </div>\n          <a href="/api/auth/square/test-callback" class="button yellow">Simulate Callback</a>\n          \n          <div class="tool-description">\n            <strong>3. Full OAuth Flow</strong> - Complete OAuth process\n          </div>\n          <a href="/api/auth/square?state=test-state-parameter" class="button green">Start OAuth Flow</a>\n        </div>\n        \n        <div class="card">\n          <h2>Manual Callback Test</h2>\n          <div class="tool-description">\n            Simulate a callback with custom parameters:\n          </div>\n          <form id="callbackForm">\n            <label for="codeInput">Authorization Code:</label>\n            <input type="text" id="codeInput" value="test_auth_code" />\n            \n            <label for="stateInput">State Parameter:</label>\n            <input type="text" id="stateInput" value="test-state-parameter" />\n            \n            <button type="submit" class="button yellow">Send Callback</button>\n          </form>\n        </div>\n        \n        <div id="resultContainer" class="card">\n          <h2>Result</h2>\n          <div id="resultOutput" class="code"></div>\n        </div>\n\n        <script>\n          // Cookie test functions\n          document.getElementById('setCookieBtn').addEventListener('click', () => {\n            document.cookie = "oauth_test_cookie=test-value; path=/; max-age=3600";\n            alert("Test cookie set!");\n          });\n          \n          document.getElementById('getCookieBtn').addEventListener('click', () => {\n            const cookies = document.cookie.split(';')\n              .map(c => c.trim())\n              .filter(c => c.startsWith('oauth_test_cookie='));\n            \n            if (cookies.length > 0) {\n              alert("Test cookie found: " + cookies[0]);\n            } else {\n              alert("Test cookie not found!");\n            }\n          });\n          \n          document.getElementById('clearCookieBtn').addEventListener('click', () => {\n            document.cookie = "oauth_test_cookie=; path=/; max-age=0";\n            alert("Test cookie cleared!");\n          });\n          \n          // OAuth init test\n          document.getElementById('testOAuthInitBtn').addEventListener('click', async () => {\n            try {\n              const response = await fetch('/api/auth/square/mobile-init');\n              const data = await response.json();\n              \n              const resultContainer = document.getElementById('resultContainer');\n              const resultOutput = document.getElementById('resultOutput');\n              \n              resultOutput.textContent = JSON.stringify(data, null, 2);\n              resultContainer.style.display = 'block';\n              \n              // Scroll to result\n              resultContainer.scrollIntoView({ behavior: 'smooth' });\n            } catch (error) {\n              alert("Error: " + error.message);\n            }\n          });\n          \n          // Manual callback test\n          document.getElementById('callbackForm').addEventListener('submit', async (e) => {\n            e.preventDefault();\n            \n            const code = document.getElementById('codeInput').value;\n            const state = document.getElementById('stateInput').value;\n            \n            if (!code || !state) {\n              alert("Please provide both code and state parameters");\n              return;\n            }\n            \n            const url = '/api/auth/square/callback?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state);\n            \n            try {\n              window.location.href = url;\n            } catch (error) {\n              alert("Error: " + error.message);\n            }\n          });\n        <\/script>\n      </body>\n    </html>\n  `
            );
          },
        };
      },
      658: e => {
        e.exports = {
          validateRequest: function validateRequest(e) {
            return (t, n, s) => {
              const a = {},
                validateSection = (t, n) => {
                  const s = {};
                  return e[t]
                    ? (Object.keys(e[t]).forEach(a => {
                        const r = e[t][a],
                          o = n[a];
                        if (!r.required || (null != o && '' !== o)) {
                          if (null != o) {
                            if (r.type) {
                              const e = (function validateType(e, t, n) {
                                switch (t) {
                                  case 'string':
                                    if ('string' != typeof e) return `${n} must be a string`;
                                    break;
                                  case 'number':
                                    if ('number' != typeof e || isNaN(e)) {
                                      if ('string' == typeof e && !isNaN(Number(e))) break;
                                      return `${n} must be a number`;
                                    }
                                    break;
                                  case 'integer':
                                    if (!Number.isInteger(Number(e)))
                                      return `${n} must be an integer`;
                                    break;
                                  case 'boolean':
                                    if ('boolean' != typeof e && 'true' !== e && 'false' !== e)
                                      return `${n} must be a boolean`;
                                    break;
                                  case 'array':
                                    if (!Array.isArray(e)) {
                                      if ('string' == typeof e)
                                        try {
                                          const t = JSON.parse(e);
                                          if (Array.isArray(t)) break;
                                        } catch {}
                                      return `${n} must be an array`;
                                    }
                                    break;
                                  case 'object':
                                    if ('object' != typeof e || null === e || Array.isArray(e)) {
                                      if ('string' == typeof e)
                                        try {
                                          const t = JSON.parse(e);
                                          if (
                                            'object' == typeof t &&
                                            null !== t &&
                                            !Array.isArray(t)
                                          )
                                            break;
                                        } catch {}
                                      return `${n} must be an object`;
                                    }
                                    break;
                                  default:
                                    return `Unknown type: ${t}`;
                                }
                                return null;
                              })(o, r.type, a);
                              if (e) return void (s[a] = e);
                            }
                            if (!r.enum || r.enum.includes(o)) {
                              if (
                                (('number' !== r.type && 'integer' !== r.type) ||
                                  (void 0 !== r.min &&
                                    o < r.min &&
                                    (s[a] = `${a} must be at least ${r.min}`),
                                  void 0 !== r.max &&
                                    o > r.max &&
                                    (s[a] = `${a} must be at most ${r.max}`)),
                                'string' === r.type &&
                                  (void 0 !== r.minLength &&
                                    o.length < r.minLength &&
                                    (s[a] = `${a} must be at least ${r.minLength} characters`),
                                  void 0 !== r.maxLength &&
                                    o.length > r.maxLength &&
                                    (s[a] = `${a} must be at most ${r.maxLength} characters`)),
                                'array' === r.type &&
                                  (void 0 !== r.minItems &&
                                    o.length < r.minItems &&
                                    (s[a] = `${a} must have at least ${r.minItems} items`),
                                  void 0 !== r.maxItems &&
                                    o.length > r.maxItems &&
                                    (s[a] = `${a} must have at most ${r.maxItems} items`)),
                                r.pattern &&
                                  !new RegExp(r.pattern).test(o) &&
                                  (s[a] = `${a} does not match required pattern`),
                                r.validate && 'function' == typeof r.validate)
                              ) {
                                const e = r.validate(o);
                                e && (s[a] = e);
                              }
                            } else s[a] = `${a} must be one of: ${r.enum.join(', ')}`;
                          }
                        } else s[a] = `${a} is required`;
                      }),
                      Object.keys(s).length > 0 ? s : null)
                    : null;
                },
                r = validateSection('body', t.body);
              r && (a.body = r);
              const o = validateSection('query', t.query);
              o && (a.query = o);
              const i = validateSection('params', t.params);
              if ((i && (a.params = i), Object.keys(a).length > 0))
                return n.status(400).json({ success: !1, message: 'Validation error', errors: a });
              s();
            };
          },
        };
      },
      671: (e, t, n) => {
        const { DynamoDBClient: s } = n(929),
          {
            DynamoDBDocumentClient: a,
            PutCommand: r,
            GetCommand: o,
            ScanCommand: i,
            UpdateCommand: c,
            DeleteCommand: l,
          } = n(515),
          d = n(903),
          u = new s({ maxAttempts: 3, requestTimeout: 3e3 }),
          g = a.from(u),
          p = process.env.CATALOG_ITEMS_TABLE || 'joylabs-backend-api-v3-catalog-items-v3';
        e.exports = {
          create: async function create(e) {
            const t = new Date().toISOString(),
              n = e.id || d.v4(),
              s = {
                id: n,
                square_catalog_id: e.square_catalog_id,
                name: e.name,
                type: e.type || 'ITEM',
                created_at: t,
                updated_at: t,
                merchant_id: e.merchant_id,
                status: e.status || 'ACTIVE',
                metadata: e.metadata || {},
              },
              a = { TableName: p, Item: s };
            console.log(`Creating catalog item reference: ${n}`);
            try {
              return await g.send(new r(a)), s;
            } catch (e) {
              throw (console.error('Error creating catalog item reference:', e), e);
            }
          },
          findById: async function findById(e) {
            const t = { TableName: p, Key: { id: e } };
            console.log(`Getting catalog item reference by ID: ${e}`);
            try {
              return (await g.send(new o(t))).Item || null;
            } catch (t) {
              throw (console.error(`Error getting catalog item reference ${e}:`, t), t);
            }
          },
          findBySquareCatalogId: async function findBySquareCatalogId(e) {
            const t = {
              TableName: p,
              FilterExpression: 'square_catalog_id = :squareCatalogId',
              ExpressionAttributeValues: { ':squareCatalogId': e },
            };
            console.log(`Getting catalog item reference by Square catalog ID: ${e}`);
            try {
              return (await g.send(new i(t))).Items[0] || null;
            } catch (t) {
              throw (
                (console.error(
                  `Error getting catalog item reference by Square catalog ID ${e}:`,
                  t
                ),
                t)
              );
            }
          },
          update: async function update(e, t) {
            const n = new Date().toISOString();
            let s = 'SET updated_at = :timestamp';
            const a = { ':timestamp': n };
            Object.keys(t).forEach(e => {
              'id' !== e && ((s += `, ${e} = :${e}`), (a[`:${e}`] = t[e]));
            });
            const r = {
              TableName: p,
              Key: { id: e },
              UpdateExpression: s,
              ExpressionAttributeValues: a,
              ReturnValues: 'ALL_NEW',
            };
            console.log(`Updating catalog item reference: ${e}`);
            try {
              return (await g.send(new c(r))).Attributes;
            } catch (t) {
              throw (console.error(`Error updating catalog item reference ${e}:`, t), t);
            }
          },
          remove: async function remove(e) {
            const t = { TableName: p, Key: { id: e } };
            console.log(`Deleting catalog item reference: ${e}`);
            try {
              return await g.send(new l(t)), !0;
            } catch (t) {
              throw (console.error(`Error deleting catalog item reference ${e}:`, t), t);
            }
          },
          list: async function list(e = {}) {
            const { limit: t = 100, startKey: n = null, merchantId: s = null } = e,
              a = { TableName: p, Limit: t };
            n && (a.ExclusiveStartKey = { id: n }),
              s &&
                ((a.FilterExpression = 'merchant_id = :merchantId'),
                (a.ExpressionAttributeValues = { ':merchantId': s })),
              console.log('Listing catalog item references');
            try {
              const e = await g.send(new i(a));
              return { items: e.Items || [], lastEvaluatedKey: e.LastEvaluatedKey, count: e.Count };
            } catch (e) {
              throw (console.error('Error listing catalog item references:', e), e);
            }
          },
        };
      },
      698: (e, t, n) => {
        const { getSquareClient: s } = n(90),
          { handleSquareError: a } = n(285),
          r = n(90),
          o = 'v2',
          i = '2025-03-19';
        e.exports = {
          listLocations: async function listLocations(e) {
            try {
              console.log(`=== REQUEST BOUNDARY: listLocations (${o}) START ===`);
              const t = `locations-${e}`,
                n = r.getCachedResponse(t, 'locations');
              if (n)
                return (
                  console.log('Using cached locations data'),
                  console.log('=== REQUEST BOUNDARY: listLocations END (Cached) ==='),
                  n
                );
              const s = await r.executeSquareRequest(
                async e => (
                  console.log(
                    `Making listLocations call to Square ${o} API with header version ${i}`
                  ),
                  (e.agent.defaultHeaders['Square-Version'] = i),
                  e.locations.listLocations()
                ),
                e,
                'square-api'
              );
              console.log('=== REQUEST BOUNDARY: listLocations END ==='),
                console.log('Successfully retrieved locations:', {
                  count: s.result.locations?.length || 0,
                });
              const a = { success: !0, locations: s.result.locations || [] };
              return r.cacheResponse(t, a, 'locations'), a;
            } catch (e) {
              return console.error('Error listing locations:', e), a(e, 'Failed to list locations');
            }
          },
          SQUARE_API_VERSION: o,
          SQUARE_API_HEADER_VERSION: i,
        };
      },
      714: (e, t, n) => {
        const { SquareError: s } = n(539),
          a = n(270),
          r = {
            numberOfRetries: 3,
            backoffFactor: 2,
            retryInterval: 1e3,
            maxRetryWaitTime: 6e4,
            statusCodesToRetry: [429, 500, 503],
          };
        let o = null,
          i = 0;
        function configureRateLimits() {
          a.configureBucket('catalog-api', {
            tokensPerInterval: 15,
            intervalMs: 1e3,
            bucketSize: 30,
          }),
            a.configureBucket('customers-api', {
              tokensPerInterval: 15,
              intervalMs: 1e3,
              bucketSize: 30,
            }),
            a.configureBucket('orders-api', {
              tokensPerInterval: 10,
              intervalMs: 1e3,
              bucketSize: 25,
            }),
            a.configureBucket('oauth-api', {
              tokensPerInterval: 5,
              intervalMs: 1e3,
              bucketSize: 10,
            }),
            a.configureBucket('square-api', {
              tokensPerInterval: 10,
              intervalMs: 1e3,
              bucketSize: 20,
            });
        }
        function shouldRetryRequest(e, t) {
          const n = e.statusCode || e.response?.status;
          return (
            429 === n ||
            !!t.statusCodesToRetry.includes(n) ||
            !(
              'ECONNRESET' !== e.code &&
              'ETIMEDOUT' !== e.code &&
              'ECONNREFUSED' !== e.code &&
              !e.message.includes('network') &&
              !e.message.includes('timeout')
            )
          );
        }
        function calculateBackoff(e, t, n) {
          let s = n.retryInterval;
          if (
            ((s *= Math.pow(n.backoffFactor, e)),
            429 === t.statusCode && t.response?.headers?.['retry-after'])
          ) {
            const e = parseInt(t.response.headers['retry-after'], 10);
            if (!isNaN(e)) {
              const t = 1e3 * e;
              s = Math.max(s, t);
            }
          }
          return Math.min(s, n.maxRetryWaitTime);
        }
        function enhanceError(e) {
          return (
            e.statusCode ||
              (e.response && e.response.status
                ? (e.statusCode = e.response.status)
                : (e.statusCode = 500),
              e.code ||
                (429 === e.statusCode
                  ? (e.code = 'RATE_LIMIT_ERROR')
                  : 401 === e.statusCode || 403 === e.statusCode
                    ? (e.code = 'AUTHENTICATION_ERROR')
                    : 404 === e.statusCode
                      ? (e.code = 'NOT_FOUND_ERROR')
                      : e.statusCode >= 500
                        ? (e.code = 'SERVER_ERROR')
                        : (e.code = 'UNKNOWN_ERROR'))),
            e
          );
        }
        function logApiError(e, t) {
          console.error('Square API error:', {
            message: e.message,
            code: e.code || e.statusCode || 'UNKNOWN_ERROR',
            statusCode: e.statusCode || e.response?.status || 500,
            details: e.details || e.errors || [],
            retries: t || 0,
          });
        }
        function sleep(e) {
          return new Promise(t => setTimeout(t, e));
        }
        configureRateLimits(),
          (e.exports = {
            executeWithRetry: async function executeWithRetry(e, t, n = {}) {
              const s = { ...r, useRateLimiter: !0, endpoint: 'square-api', cost: 1, ...n };
              let o = 0,
                i = null,
                c = s.retryInterval;
              for (
                s.useRateLimiter && (await a.acquire(s.endpoint, s.cost));
                o <= s.numberOfRetries;

              )
                try {
                  return (
                    o > 0 && console.log(`Retry attempt ${o}/${s.numberOfRetries} after ${c}ms`),
                    await e(t)
                  );
                } catch (e) {
                  i = e;
                  if (!shouldRetryRequest(e, s) || o >= s.numberOfRetries)
                    throw (logApiError(e, o), enhanceError(e));
                  (c = calculateBackoff(o, e, s)),
                    console.warn(`Square API error (will retry): ${e.message}`, {
                      statusCode: e.statusCode || e.response?.status,
                      retryAttempt: o + 1,
                      waitTime: c,
                    }),
                    await sleep(c),
                    o++,
                    s.useRateLimiter && (await a.acquire(s.endpoint, s.cost));
                }
              throw i;
            },
            configureRateLimits,
            shouldRetryRequest,
            calculateBackoff,
            enhanceError,
            logApiError,
            sleep,
            getWebhookSignatureKey: async function getWebhookSignatureKey(e) {
              const t = Date.now();
              if (o && t < i) return o;
              try {
                const n = await e();
                return (
                  n && n.webhookSignatureKey
                    ? ((o = n.webhookSignatureKey),
                      (i = t + 864e5),
                      console.log('Cached webhook signature key for 24 hours'))
                    : (console.warn('No webhook signature key found in credentials'), (o = null)),
                  o
                );
              } catch (e) {
                return console.error('Error retrieving webhook signature key:', e), null;
              }
            },
          });
      },
      729: (e, t, n) => {
        const { createErrorWithCause: s } = n(285);
        async function fetchWithTimeout(e, t = {}, n = 5e3) {
          try {
            const a = new AbortController(),
              r = setTimeout(() => a.abort(), n),
              o = { ...t, signal: a.signal },
              i = await fetch(e, o);
            if ((clearTimeout(r), !i.ok)) {
              let t;
              try {
                t = await i.json();
              } catch (e) {
                t = { message: `HTTP Error ${i.status}` };
              }
              throw s(t.message || `HTTP Error ${i.status}`, new Error(`HTTP ${i.status}`), {
                statusCode: i.status,
                url: e,
                data: t,
              });
            }
            return i;
          } catch (t) {
            if ('AbortError' === t.name)
              throw s(`Request timeout after ${n}ms`, t, {
                code: 'TIMEOUT_ERROR',
                statusCode: 408,
                url: e,
              });
            throw s(`Fetch error: ${t.message}`, t, { code: 'FETCH_ERROR', url: e });
          }
        }
        async function fetchJson(e, t = {}, n = 5e3) {
          return (await fetchWithTimeout(e, t, n)).json();
        }
        e.exports = {
          fetchWithTimeout,
          fetchJson,
          postJson: async function postJson(e, t, n = {}, s = 5e3) {
            return fetchJson(
              e,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...n.headers },
                body: JSON.stringify(t),
                ...n,
              },
              s
            );
          },
        };
      },
      824: e => {
        e.exports = {
          getCategories: (e, t) => {
            t.json({ message: 'Get all categories - Coming soon' });
          },
          getCategoryById: (e, t) => {
            t.json({ message: `Get category ${e.params.id} - Coming soon` });
          },
          createCategory: (e, t) => {
            t.json({ message: 'Create category - Coming soon' });
          },
          updateCategory: (e, t) => {
            t.json({ message: `Update category ${e.params.id} - Coming soon` });
          },
          deleteCategory: (e, t) => {
            t.json({ message: `Delete category ${e.params.id} - Coming soon` });
          },
        };
      },
      829: e => {
        'use strict';
        e.exports = require('jsonwebtoken');
      },
      856: (e, t, n) => {
        const s = n(252).Router(),
          { protect: a } = n(431),
          { validateRequest: r } = n(658),
          o = n(210),
          i = n(671);
        s.get('/list', a, async (e, t) => {
          try {
            const { limit: n = 1e3, types: s = 'ITEM,CATEGORY', cursor: a } = e.query,
              r = await o.listCatalogItems(e.user.squareAccessToken, {
                types: s.split(','),
                limit: parseInt(n),
                cursor: a,
              });
            t.json(r);
          } catch (e) {
            console.error('Error listing catalog items:', e),
              t
                .status(e.statusCode || 500)
                .json({
                  success: !1,
                  message: e.message || 'Failed to list catalog items',
                  error: e.details || e.toString(),
                });
          }
        }),
          s.get('/item/:id', a, async (e, t) => {
            try {
              const { id: n } = e.params,
                s = await o.getCatalogItem(e.user.squareAccessToken, n);
              try {
                const e = await i.findBySquareCatalogId(n);
                e &&
                  (s.catalogObject.local_data = {
                    id: e.id,
                    created_at: e.created_at,
                    updated_at: e.updated_at,
                    metadata: e.metadata,
                  });
              } catch (e) {
                console.error('Error retrieving local catalog data:', e);
              }
              t.json(s);
            } catch (n) {
              console.error(`Error retrieving catalog item ${e.params.id}:`, n),
                t
                  .status(n.statusCode || 500)
                  .json({
                    success: !1,
                    message: n.message || 'Failed to get catalog item',
                    error: n.details || n.toString(),
                  });
            }
          });
        const c = r({
          body: {
            type: {
              type: 'string',
              required: !0,
              enum: ['ITEM', 'CATEGORY', 'TAX', 'DISCOUNT', 'MODIFIER', 'MODIFIER_LIST', 'IMAGE'],
            },
            name: { type: 'string', required: !0 },
            description: { type: 'string' },
            abbreviation: { type: 'string' },
            categoryId: { type: 'string' },
            variations: { type: 'array' },
            productType: { type: 'string', enum: ['REGULAR', 'APPOINTMENTS_SERVICE'] },
            calculationPhase: { type: 'string', enum: ['TAX_SUBTOTAL_PHASE', 'TAX_TOTAL_PHASE'] },
            inclusionType: { type: 'string', enum: ['ADDITIVE', 'INCLUSIVE'] },
            percentage: { type: 'string' },
            appliesToCustomAmounts: { type: 'boolean' },
            enabled: { type: 'boolean' },
            discountType: {
              type: 'string',
              enum: ['FIXED_PERCENTAGE', 'FIXED_AMOUNT', 'VARIABLE_PERCENTAGE', 'VARIABLE_AMOUNT'],
            },
            amountMoney: {
              type: 'object',
              properties: { amount: { type: 'number' }, currency: { type: 'string' } },
            },
            pinRequired: { type: 'boolean' },
            labelColor: { type: 'string' },
            selectionType: { type: 'string', enum: ['SINGLE', 'MULTIPLE'] },
            modifiers: { type: 'array' },
            url: { type: 'string' },
            caption: { type: 'string' },
            imageIds: { type: 'array' },
            idempotencyKey: { type: 'string' },
          },
        });
        s.post('/item', a, c, async (e, t) => {
          try {
            const n = await o.createOrUpdateCatalogItem(e.user.squareAccessToken, e.body);
            t.json(n);
          } catch (e) {
            console.error('Error creating/updating catalog item:', e),
              t
                .status(e.statusCode || 500)
                .json({
                  success: !1,
                  message: e.message || 'Failed to create/update catalog item',
                  error: e.details || e.toString(),
                });
          }
        }),
          s.delete('/item/:id', a, async (e, t) => {
            try {
              const { id: n } = e.params,
                s = await o.deleteCatalogItem(e.user.squareAccessToken, n);
              t.json(s);
            } catch (n) {
              console.error(`Error deleting catalog item ${e.params.id}:`, n),
                t
                  .status(n.statusCode || 500)
                  .json({
                    success: !1,
                    message: n.message || 'Failed to delete catalog item',
                    error: n.details || n.toString(),
                  });
            }
          }),
          s.post('/search', a, async (e, t) => {
            try {
              console.log('[REQUEST BOUNDARY: CATALOG SEARCH START]'),
                console.log(
                  '[ROUTES] Received catalog search request:',
                  JSON.stringify(e.body, null, 2)
                );
              let n = { ...e.body };
              if (!n.query || ('object' == typeof n.query && 0 === Object.keys(n.query).length))
                console.log('[ROUTES] Empty query detected in handler, using default exact_query'),
                  (n.query = { exact_query: { attribute_name: 'name', attribute_value: '.' } });
              else if (n.query.text_query)
                if (void 0 !== n.query.text_query.query) {
                  const e = n.query.text_query.query;
                  e && '' !== e.trim()
                    ? (console.log('[ROUTES] Converting text_query.query to keywords array'),
                      (n.query.text_query = { keywords: [e.trim()] }))
                    : (console.log(
                        '[ROUTES] Empty text_query.query detected, using exact_query instead'
                      ),
                      (n.query = {
                        exact_query: { attribute_name: 'name', attribute_value: '.' },
                      }));
                } else
                  (n.query.text_query.keywords &&
                    Array.isArray(n.query.text_query.keywords) &&
                    0 !== n.query.text_query.keywords.length) ||
                    (console.log(
                      '[ROUTES] Malformed text_query detected, using exact_query instead'
                    ),
                    (n.query = { exact_query: { attribute_name: 'name', attribute_value: '.' } }));
              else {
                const e = [
                  'prefix_query',
                  'exact_query',
                  'sorted_attribute_query',
                  'text_query',
                  'item_query',
                  'item_variation_query',
                  'items_for_tax_query',
                  'items_for_modifier_list_query',
                  'items_for_item_options',
                ];
                0 === Object.keys(n.query).filter(t => e.includes(t)).length &&
                  (console.log(
                    '[ROUTES] No valid query types found in request, using default exact_query'
                  ),
                  (n.query = { exact_query: { attribute_name: 'name', attribute_value: '.' } }));
              }
              console.log('[ROUTES] Modified search params:', JSON.stringify(n, null, 2));
              const s = await o.searchCatalogItems(e.user.squareAccessToken, n);
              console.log('[REQUEST BOUNDARY: CATALOG SEARCH END] Success:', s.success), t.json(s);
            } catch (e) {
              console.error('[REQUEST BOUNDARY: CATALOG SEARCH END] Error:', e.message),
                console.error('[ROUTES] Error searching catalog objects:', e),
                t
                  .status(e.statusCode || 500)
                  .json({
                    success: !1,
                    message: e.message || 'Failed to search catalog objects',
                    error: e.details || e.toString(),
                  });
            }
          }),
          s.post(
            '/batch-retrieve',
            a,
            r({
              body: {
                objectIds: { type: 'array', required: !0 },
                includeRelatedObjects: { type: 'boolean' },
              },
            }),
            async (e, t) => {
              try {
                const { objectIds: n, includeRelatedObjects: s = !0 } = e.body,
                  a = await o.batchRetrieveCatalogObjects(e.user.squareAccessToken, n, s);
                t.json(a);
              } catch (e) {
                console.error('Error batch retrieving catalog objects:', e),
                  t
                    .status(e.statusCode || 500)
                    .json({
                      success: !1,
                      message: e.message || 'Failed to batch retrieve catalog objects',
                      error: e.details || e.toString(),
                    });
              }
            }
          ),
          s.post(
            '/batch-upsert',
            a,
            r({
              body: {
                batches: {
                  type: 'array',
                  required: !0,
                  items: {
                    type: 'object',
                    properties: { objects: { type: 'array', required: !0 } },
                  },
                },
              },
            }),
            async (e, t) => {
              try {
                const { batches: n } = e.body,
                  s = await o.batchUpsertCatalogObjects(e.user.squareAccessToken, n);
                t.json(s);
              } catch (e) {
                console.error('Error batch upserting catalog objects:', e),
                  t
                    .status(e.statusCode || 500)
                    .json({
                      success: !1,
                      message: e.message || 'Failed to batch upsert catalog objects',
                      error: e.details || e.toString(),
                    });
              }
            }
          ),
          s.post(
            '/batch-delete',
            a,
            r({ body: { objectIds: { type: 'array', required: !0 } } }),
            async (e, t) => {
              try {
                const { objectIds: n } = e.body,
                  s = await o.batchDeleteCatalogObjects(e.user.squareAccessToken, n);
                t.json(s);
              } catch (e) {
                console.error('Error batch deleting catalog objects:', e),
                  t
                    .status(e.statusCode || 500)
                    .json({
                      success: !1,
                      message: e.message || 'Failed to batch delete catalog objects',
                      error: e.details || e.toString(),
                    });
              }
            }
          ),
          s.post(
            '/item/:id/modifier-lists',
            a,
            r({
              body: {
                modifierListsToEnable: { type: 'array' },
                modifierListsToDisable: { type: 'array' },
              },
            }),
            async (e, t) => {
              try {
                const { id: n } = e.params,
                  { modifierListsToEnable: s = [], modifierListsToDisable: a = [] } = e.body,
                  r = await o.updateItemModifierLists(e.user.squareAccessToken, n, s, a);
                t.json(r);
              } catch (n) {
                console.error(`Error updating modifier lists for item ${e.params.id}:`, n),
                  t
                    .status(n.statusCode || 500)
                    .json({
                      success: !1,
                      message: n.message || 'Failed to update item modifier lists',
                      error: n.details || n.toString(),
                    });
              }
            }
          ),
          s.post(
            '/item/:id/taxes',
            a,
            r({ body: { taxesToEnable: { type: 'array' }, taxesToDisable: { type: 'array' } } }),
            async (e, t) => {
              try {
                const { id: n } = e.params,
                  { taxesToEnable: s = [], taxesToDisable: a = [] } = e.body,
                  r = await o.updateItemTaxes(e.user.squareAccessToken, n, s, a);
                t.json(r);
              } catch (n) {
                console.error(`Error updating taxes for item ${e.params.id}:`, n),
                  t
                    .status(n.statusCode || 500)
                    .json({
                      success: !1,
                      message: n.message || 'Failed to update item taxes',
                      error: n.details || n.toString(),
                    });
              }
            }
          ),
          s.get('/categories', a, async (e, t) => {
            try {
              const n = await o.searchCatalogItems(e.user.squareAccessToken, {
                object_types: ['CATEGORY'],
                limit: e.query.limit ? parseInt(e.query.limit) : 100,
                cursor: e.query.cursor,
                include_related_objects: 'true' === e.query.include_related_objects,
              });
              t.json(n);
            } catch (e) {
              console.error('Error getting categories:', e),
                t
                  .status(e.statusCode || 500)
                  .json({
                    success: !1,
                    message: e.message || 'Failed to get categories',
                    error: e.details || e.toString(),
                  });
            }
          }),
          (e.exports = s);
      },
      898: e => {
        'use strict';
        e.exports = require('cookie-parser');
      },
      903: e => {
        'use strict';
        e.exports = require('uuid');
      },
      927: (e, t, n) => {
        const s = n(252).Router(),
          a = n(824);
        s.get('/', a.getCategories),
          s.get('/:id', a.getCategoryById),
          s.post('/', a.createCategory),
          s.put('/:id', a.updateCategory),
          s.delete('/:id', a.deleteCategory),
          s.get('/test', (e, t) => {
            t.json({ message: 'Categories API is working' });
          }),
          (e.exports = s);
      },
      929: e => {
        'use strict';
        e.exports = require('@aws-sdk/client-dynamodb');
      },
      938: e => {
        'use strict';
        e.exports = require('axios');
      },
      977: e => {
        'use strict';
        e.exports = require('express-session');
      },
      980: (e, t, n) => {
        const s = n(252),
          a = n(277),
          r = (n(577), n(898)),
          o = n(977),
          i = n(581)(o),
          c = n(96),
          { DynamoDBClient: l } = n(929),
          { DynamoDBDocumentClient: d, PutCommand: u } = n(515),
          g = process.env.STATES_TABLE,
          p = n(576);
        let m = null;
        const h = s();
        h.use(s.json({ limit: '10mb' })), h.use(s.urlencoded({ extended: !0 })), h.use(r());
        const b = {
          store: new i({
            table: 'joylabs-sessions',
            AWSConfigJSON: { region: 'us-west-1' },
            reapInterval: 864e5,
          }),
          secret: process.env.SESSION_SECRET || 'joylabs-session-secret-key-production',
          resave: !1,
          saveUninitialized: !1,
          cookie: { secure: !0, httpOnly: !0, sameSite: 'lax', maxAge: 864e5 },
        };
        h.use(o(b)),
          h.use(p()),
          h.use(c('combined')),
          h.use((e, t, n) => {
            'GET' === e.method &&
              'true' === process.env.ENABLE_RESPONSE_CACHE &&
              (e.path.startsWith('/api/health') || '/' === e.path) &&
              t.set('Cache-Control', 'public, max-age=300'),
              n();
          });
        const y = n(103),
          f = n(927),
          E = n(85),
          v = n(229),
          S = n(856),
          R = n(375),
          _ = n(107);
        h.use((e, t, n) => {
          (e.startTime = Date.now()),
            t.on('finish', () => {
              const t = Date.now() - e.startTime;
              t > 500 && console.warn(`Slow request: ${e.method} ${e.originalUrl} took ${t}ms`);
            }),
            n();
        }),
          h.use('/api/auth', E),
          h.use('/api/catalog', S),
          h.use('/api/health', v),
          h.use('/api/categories', f),
          h.use('/api/products', y),
          h.use('/api/locations', R),
          h.use('/api/merchant', _),
          h.use((e, t, n) => {
            console.log('Incoming request:', {
              method: e.method,
              path: e.path,
              headers: e.headers,
              body: e.body,
              query: e.query,
            }),
              n();
          }),
          h.post('/api/auth/register-state', async (e, t) => {
            console.log('POST to register-state endpoint received:', {
              headers: e.headers,
              body: e.body,
              tableName: g,
              region: process.env.AWS_REGION,
            });
            try {
              const { state: n } = e.body;
              if (!n)
                return (
                  console.error('Missing state parameter'),
                  t.status(400).json({ error: 'Missing state parameter' })
                );
              console.log('Preparing to store state in DynamoDB:', {
                state: n.substring(0, 5) + '...' + n.substring(n.length - 5),
                tableName: g,
              });
              const s = Math.floor(Date.now() / 1e3) + 600,
                a = {
                  TableName: g,
                  Item: {
                    state: n,
                    timestamp: Date.now(),
                    used: !1,
                    ttl: s,
                    redirectUrl: e.body.redirectUrl || '/auth/success',
                  },
                };
              console.log('Sending PutCommand to DynamoDB with params:', {
                TableName: a.TableName,
                Item: {
                  ...a.Item,
                  state:
                    a.Item.state.substring(0, 5) +
                    '...' +
                    a.Item.state.substring(a.Item.state.length - 5),
                },
              });
              const r = (() => {
                  if (!m) {
                    const e = new l({
                      maxAttempts: 3,
                      requestTimeout: 3e3,
                      region: process.env.AWS_REGION,
                    });
                    m = d.from(e);
                  }
                  return m;
                })(),
                o = await r.send(new u(a));
              return (
                console.log('DynamoDB PutCommand result:', {
                  statusCode: o.$metadata.httpStatusCode,
                  requestId: o.$metadata.requestId,
                }),
                console.log(
                  `State parameter '${n.substring(0, 5)}...${n.substring(n.length - 5)}' registered successfully`
                ),
                t
                  .status(200)
                  .json({ success: !0, message: 'State parameter registered successfully' })
              );
            } catch (e) {
              return (
                console.error('Error registering state parameter:', {
                  error: e.message,
                  code: e.code,
                  name: e.name,
                  stack: e.stack,
                  region: process.env.AWS_REGION,
                  tableName: g,
                }),
                t.status(500).json({ error: 'Failed to register state parameter', details: void 0 })
              );
            }
          }),
          h.get('/test', (e, t) => {
            t.redirect('/api/health/test-page');
          }),
          h.options('*', p()),
          h.get('/', (e, t) => {
            t.json({
              message: 'Welcome to the JoyLabs API',
              links: {
                health: '/api/health',
                products: '/api/products',
                categories: '/api/categories',
                auth: '/api/auth',
                catalog: '/api/catalog',
                locations: '/api/locations',
                merchant: '/api/merchant/me',
              },
            });
          }),
          h.use((e, t, n, s) => {
            console.error('Error:', e),
              n.status(e.status || 500).json({ error: e.message || 'Internal server error' });
          }),
          (e.exports.handler = a(h));
      },
      982: e => {
        'use strict';
        e.exports = require('crypto');
      },
    },
    t = {};
  var n = (function __webpack_require__(n) {
    var s = t[n];
    if (void 0 !== s) return s.exports;
    var a = (t[n] = { exports: {} });
    return e[n](a, a.exports, __webpack_require__), a.exports;
  })(980);
  module.exports = n;
})();
//# sourceMappingURL=index.js.map
