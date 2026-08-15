import { describe, expect, it } from 'vitest';
import { getPackageManagerSpec } from '../../src/utils/package-manager.js';

describe('PackageManagerSpec abstraction', () => {
  describe('npm', () => {
    it('returns exact npm commands and metadata', () => {
      const spec = getPackageManagerSpec('npm');

      expect(spec.name).toBe('npm');
      expect(spec.displayName).toBe('npm');
      expect(spec.documentationUrl).toBe('https://www.npmjs.com/');
      expect(spec.packageManagerField).toBeUndefined();
      expect(spec.install).toBe('npm install');
      expect(spec.run('start:dev')).toBe('npm run start:dev');
      expect(spec.run('typecheck')).toBe('npm run typecheck');
      expect(spec.run('build')).toBe('npm run build');
      expect(spec.run('test')).toBe('npm test');
      expect(spec.run('test:e2e')).toBe('npm run test:e2e');
      expect(spec.exec('prisma')).toBe('npx prisma');
      expect(spec.exec('prisma', 'generate')).toBe('npx prisma generate');
      expect(spec.prisma('generate')).toBe('npx prisma generate');
      expect(spec.prisma('migrate dev')).toBe('npx prisma migrate dev');
      expect(spec.prisma('migrate deploy')).toBe('npx prisma migrate deploy');
      expect(spec.prisma('studio')).toBe('npx prisma studio');
    });
  });

  describe('pnpm', () => {
    it('returns exact pnpm commands and metadata', () => {
      const spec = getPackageManagerSpec('pnpm');

      expect(spec.name).toBe('pnpm');
      expect(spec.displayName).toBe('pnpm');
      expect(spec.documentationUrl).toBe('https://pnpm.io/');
      expect(spec.packageManagerField).toBe('pnpm@10.5.2');
      expect(spec.install).toBe('pnpm install');
      expect(spec.run('start:dev')).toBe('pnpm run start:dev');
      expect(spec.run('typecheck')).toBe('pnpm run typecheck');
      expect(spec.run('build')).toBe('pnpm run build');
      expect(spec.run('test')).toBe('pnpm test');
      expect(spec.run('test:e2e')).toBe('pnpm run test:e2e');
      expect(spec.exec('prisma')).toBe('pnpm exec prisma');
      expect(spec.exec('prisma', 'generate')).toBe('pnpm exec prisma generate');
      expect(spec.prisma('generate')).toBe('pnpm exec prisma generate');
      expect(spec.prisma('migrate dev')).toBe('pnpm exec prisma migrate dev');
      expect(spec.prisma('migrate deploy')).toBe('pnpm exec prisma migrate deploy');
      expect(spec.prisma('studio')).toBe('pnpm exec prisma studio');
    });
  });

  describe('yarn', () => {
    it('returns exact yarn commands and metadata', () => {
      const spec = getPackageManagerSpec('yarn');

      expect(spec.name).toBe('yarn');
      expect(spec.displayName).toBe('yarn');
      expect(spec.documentationUrl).toBe('https://yarnpkg.com/');
      expect(spec.packageManagerField).toBe('yarn@1.22.22');
      expect(spec.install).toBe('yarn install');
      expect(spec.run('start:dev')).toBe('yarn start:dev');
      expect(spec.run('typecheck')).toBe('yarn typecheck');
      expect(spec.run('build')).toBe('yarn build');
      expect(spec.run('test')).toBe('yarn test');
      expect(spec.run('test:e2e')).toBe('yarn test:e2e');
      expect(spec.exec('prisma')).toBe('yarn prisma');
      expect(spec.exec('prisma', 'generate')).toBe('yarn prisma generate');
      expect(spec.prisma('generate')).toBe('yarn prisma generate');
      expect(spec.prisma('migrate dev')).toBe('yarn prisma migrate dev');
      expect(spec.prisma('migrate deploy')).toBe('yarn prisma migrate deploy');
      expect(spec.prisma('studio')).toBe('yarn prisma studio');
    });
  });

  it('defaults to npm when called with undefined', () => {
    const spec = getPackageManagerSpec();
    expect(spec.name).toBe('npm');
  });

  it('throws for unsupported package managers', () => {
    expect(() => getPackageManagerSpec('bun' as never)).toThrow(
      'Unsupported package manager: bun',
    );
  });
});
