module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["./packages/shard", "./packages/time", "./packages/identity", "./packages/ipfs-pubsub-direct-channel", "./packages/ipfs-pubsub-peer-monitor", "./packages/ipfs-log", "./packages/ipfs-log-entry", "packages/orbit-db-keystore", "packages/orbit-db-ipfs-access-controller", "./packages/orbit-db", "./packages/orbit-db-cache", "./packages/orbit-db-pubsub", "./packages/orbit-db-io", "./packages/io-utils", "./packages/encryption-utils", "./packages/orbit-db-trust-web", "./packages/orbit-db-dynamic-access-controller",/*  "./packages/orbit-db-identity-provider", */ "./packages/orbit-db-store", "./packages/orbit-db-query-store", "./packages/query-protocol", "./packages/orbit-db-string", "./packages/orbit-db-bfeedstore", "./packages/orbit-db-bdocstore"],
  transform: {
    '^.+\\.ts?$': ['ts-jest', {
      tsconfig: {
        allowJs: true,
      }
    }],
  },
  transformIgnorePatterns: [],
  /*   extensionsToTreatAsEsm: [".ts"],
   */
  testRegex: "/__tests__/[A-Za-z0-9]+\\.(test|spec)\\.ts$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testTimeout: 60000,
  setupFilesAfterEnv: ['jest-extended/all'],

};
