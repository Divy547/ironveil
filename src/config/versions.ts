export const FORGEKIT_VERSIONS = {
  dependencies: {
    base: {
      '@nestjs/common': '^11.0.0',
      '@nestjs/config': '^4.0.2',
      '@nestjs/core': '^11.0.0',
      '@nestjs/platform-express': '^11.0.0',
      'class-transformer': '0.5.1',
      'class-validator': '0.15.1',
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.1',
      zod: '^4.4.3',
    },
    auth: {
      '@nestjs/jwt': '11.0.2',
      '@nestjs/passport': '11.0.5',
      bcrypt: '6.0.0',
      passport: '0.7.0',
      'passport-jwt': '4.0.1',
    },
    prisma: {
      '@prisma/client': '6.19.3',
    },
    redis: {
      ioredis: '5.6.0',
    },
    swagger: {
      '@nestjs/swagger': '11.0.6',
    },
  },
  devDependencies: {
    base: {
      '@nestjs/cli': '^11.0.0',
      '@nestjs/schematics': '^11.0.0',
      '@types/express': '^5.0.0',
      '@types/node': '^22.0.0',
      eslint: '^9.0.0',
      prettier: '^3.0.0',
      'source-map-support': '^0.5.21',
      'ts-loader': '^9.5.2',
      'ts-node': '^10.9.2',
      'tsconfig-paths': '^4.2.0',
      typescript: '^5.7.0',
    },
    auth: {
      '@types/bcrypt': '6.0.0',
      '@types/passport-jwt': '4.0.1',
    },
    prisma: {
      prisma: '6.19.3',
    },
    testing: {
      '@nestjs/testing': '^11.0.0',
      '@types/jest': '^30.0.0',
      '@types/supertest': '^6.0.2',
      jest: '^30.0.0',
      supertest: '^7.0.0',
      'ts-jest': '^29.2.5',
    },
  },
  tools: {
    node: '22',
    pnpm: '10.5.2',
    yarn: '1.22.22',
  },
} as const;

export type ForgeKitVersions = typeof FORGEKIT_VERSIONS;
