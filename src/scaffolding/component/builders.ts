import type { IronveilConfig } from '../../config/index.js';
import type { ResourceNames } from '../names.js';
import { file, namedImport } from '../resource/code.js';

/** `@Module({})`: an empty feature module that later generators fill in. */
export function buildEmptyModule(names: ResourceNames): string {
  return file([
    "import { Module } from '@nestjs/common';",
    '',
    '@Module({})',
    `export class ${names.pascal}Module {}`,
  ]);
}

export function buildPlainService(names: ResourceNames): string {
  return file([
    "import { Injectable } from '@nestjs/common';",
    '',
    '@Injectable()',
    `export class ${names.pascal}Service {}`,
  ]);
}

/**
 * An empty controller routed at the name as typed. Every route is already
 * protected by the global JWT guard when auth is on, so Swagger gets the
 * matching bearer marker.
 */
export function buildPlainController(
  names: ResourceNames,
  config: IronveilConfig,
): string {
  const swagger = config.swagger;
  const bearer = swagger && config.auth === 'jwt';

  return file([
    "import { Controller } from '@nestjs/common';",
    ...(swagger
      ? [namedImport(bearer ? ['ApiBearerAuth', 'ApiTags'] : ['ApiTags'], '@nestjs/swagger')]
      : []),
    '',
    ...(swagger ? [`@ApiTags('${names.kebab}')`] : []),
    ...(bearer ? ['@ApiBearerAuth()'] : []),
    `@Controller('${names.kebab}')`,
    `export class ${names.pascal}Controller {}`,
  ]);
}

/**
 * A guard that rejects every request until the user writes the rule. A stub
 * that lets everything through would be a silent hole if it were applied
 * before it was finished.
 */
export function buildGuard(names: ResourceNames): string {
  return file([
    "import { CanActivate, Injectable } from '@nestjs/common';",
    '',
    '@Injectable()',
    `export class ${names.pascal}Guard implements CanActivate {`,
    '  // Decide who may pass. To inspect the request, take the ExecutionContext:',
    '  //   canActivate(context: ExecutionContext) {',
    '  //     const request = context.switchToHttp().getRequest<Request>();',
    '  //   }',
    '  // Until a rule is written here, every request is rejected.',
    '  canActivate(): boolean {',
    '    return false;',
    '  }',
    '}',
  ]);
}

function spec(
  className: string,
  fileName: string,
  slot: 'controllers' | 'providers',
): string {
  return file([
    "import { Test } from '@nestjs/testing';",
    `import { ${className} } from './${fileName}';`,
    '',
    `describe('${className}', () => {`,
    `  let subject: ${className};`,
    '',
    '  beforeEach(async () => {',
    '    const moduleRef = await Test.createTestingModule({',
    `      ${slot}: [${className}],`,
    '    }).compile();',
    '',
    `    subject = moduleRef.get(${className});`,
    '  });',
    '',
    "  it('is defined', () => {",
    '    expect(subject).toBeDefined();',
    '  });',
    '});',
  ]);
}

export const buildServiceSpec = (names: ResourceNames): string =>
  spec(`${names.pascal}Service`, `${names.kebab}.service`, 'providers');

export const buildControllerSpec = (names: ResourceNames): string =>
  spec(`${names.pascal}Controller`, `${names.kebab}.controller`, 'controllers');

export const buildGuardSpec = (names: ResourceNames): string =>
  spec(`${names.pascal}Guard`, `${names.kebab}.guard`, 'providers');
