module.exports = {
  globals: {
    "ts-jest": {
      tsconfig: "test/tsconfig.json",
    },
  },
  globalSetup: ["<rootDir>/test/setupTests.js"],
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.js"],
  coveragePathIgnorePatterns: ["/node_modules/", "index.ts", "src/migrations"],
  testMatch: ["**/*.spec.(ts)"],
  testEnvironment: "node",
}
