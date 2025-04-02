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

const catalogDepsModules = [
  '@aws-sdk/client-s3',
  'uuid',
];

const webhooksDepsModules = [
  '@aws-sdk/client-sns',
  'body-parser',
];

const oauthDepsModules = [
  '@aws-sdk/client-secrets-manager',
  'axios',
  'querystring',
];

const squareLayerModules = [
  'square',
];

// Combine all external modules
const allLayerModules = [
  ...coreLayerModules,
  ...apiDepsModules,
  ...catalogDepsModules,
  ...webhooksDepsModules,
  ...oauthDepsModules,
  ...squareLayerModules,
  'aws-sdk', // Still exclude v2
];

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
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
    nodeExternals({
      // Exclude all layer dependencies from the bundle
      allowlist: [/^(?!(@aws-sdk|aws-sdk|express|serverless-http|cookie-parser|cors|connect-dynamodb|express-session|morgan|joi|jsonwebtoken|uuid|body-parser|axios|querystring|square)).*/],
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