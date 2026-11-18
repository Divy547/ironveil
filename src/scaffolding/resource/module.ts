import type { ResourceNames } from '../names.js';
import { file } from './code.js';

export function buildModule(names: ResourceNames): string {
  const { pluralKebab, pluralPascal } = names;

  return file([
    "import { Module } from '@nestjs/common';",
    `import { ${pluralPascal}Controller } from './${pluralKebab}.controller';`,
    `import { ${pluralPascal}Service } from './${pluralKebab}.service';`,
    '',
    '@Module({',
    `  controllers: [${pluralPascal}Controller],`,
    `  providers: [${pluralPascal}Service],`,
    '})',
    `export class ${pluralPascal}Module {}`,
  ]);
}
