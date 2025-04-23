const path = require('path');
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');
const TerserPlugin = require('terser-webpack-plugin');

// Identify which dependencies are in which layers
const coreLayerModules = [
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@aws-sdk/util-dynamodb',
  'express',
  'serverless-http',
  'cookie-parser',
  'cors',
];

const apiDepsModules = [
  '@aws-sdk/client-api-gateway',
  '@aws-sdk/client-lambda',
  'connect-dynamodb',
  'express-session',
  'morgan',
  'joi',
  'jsonwebtoken',
];

const catalogDepsModules = ['@aws-sdk/client-s3', 'uuid'];

const webhooksDepsModules = ['@aws-sdk/client-sns', 'body-parser', 'expo-server-sdk'];

const oauthDepsModules = ['@aws-sdk/client-secrets-manager', 'axios', 'querystring'];

const squareLayerModules = ['square'];

// Combine all layer modules
const allLayerModules = [
  ...coreLayerModules,
  ...apiDepsModules,
  ...catalogDepsModules,
  ...webhooksDepsModules,
  ...oauthDepsModules,
  ...squareLayerModules,
  'aws-sdk', // Keep excluding v2 for safety, though layers should handle v3
];

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  cache: false,
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
          keep_fnames: true,
        },
      }),
    ],
    moduleIds: 'deterministic',
    splitChunks: {
      chunks: 'all',
    },
  },
  performance: {
    hints: false,
  },
  devtool: 'source-map',
  externals: [
    // Explicitly externalize ONLY the known layer modules
    nodeExternals({
      allowlist: moduleName => {
        // If the module is NOT in our list of layer modules,
        // it should NOT be externalized (i.e., it should be bundled).
        // We return `false` to prevent externalization for non-layer modules.
        // We return `true` (implicitly, by not returning false) for layer modules to externalize them.
        // We use split('/')[0] to match base package names (e.g., '@aws-sdk/client-sns' matches '@aws-sdk')
        // This might need refinement depending on specific package import styles
        const baseModuleName = moduleName.split('/')[0];
        if (!allLayerModules.includes(baseModuleName)) {
          // console.log(`Bundling non-layer module: ${moduleName}`); // Debug logging
          return false; // Bundle this module
        }
        // Otherwise, externalize it (module is in allLayerModules)
        // console.log(`Externalizing layer module: ${moduleName}`); // Debug logging
        // return true; // Default behavior if not false
      },
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: { node: '22' },
                    useBuiltIns: 'usage',
                    corejs: 3,
                  },
                ],
              ],
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
    symlinks: false,
    cacheWithContext: false,
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
    sourceMapFilename: '[file].map',
  },
};
