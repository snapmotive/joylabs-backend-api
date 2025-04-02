module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { 
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }]
      ]
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chai|chai-as-promised)/)'
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  testMatch: [
    '**/test/**/*.test.(js|jsx|ts|tsx)'
  ],
  setupFilesAfterEnv: ['./test/setup.js'],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/'
  ],
  verbose: true,
  moduleNameMapper: {
    '^chai$': 'chai'
  }
}; 