// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');

module.exports = {
  ...baseConfig,
  setupFiles: [...(baseConfig.setupFiles ?? []), '<rootDir>/jest.setup.canvas.js'],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^canvas$': '<rootDir>/src/__mocks__/canvas.ts',
  },
};
