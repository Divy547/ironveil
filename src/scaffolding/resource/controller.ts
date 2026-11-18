import type { IronveilConfig } from '../../config/index.js';
import type { ResourceNames } from '../names.js';
import { file, namedImport } from './code.js';

export function buildController(
  names: ResourceNames,
  config: IronveilConfig,
): string {
  const { pascal, kebab, pluralKebab, pluralPascal, pluralCamel } = names;
  const service = `${pluralCamel}Service`;
  const singular = kebab.replace(/-/g, ' ');
  const plural = pluralKebab.replace(/-/g, ' ');
  const swagger = config.swagger;
  const bearer = swagger && config.auth === 'jwt';

  const swaggerImports = [
    ...(bearer ? ['ApiBearerAuth'] : []),
    'ApiNotFoundResponse',
    'ApiOperation',
    'ApiQuery',
    'ApiTags',
  ];

  const operation = (summary: string): string[] =>
    swagger ? [`  @ApiOperation({ summary: '${summary}' })`] : [];
  const notFound = (): string[] =>
    swagger ? [`  @ApiNotFoundResponse({ description: '${pascal} not found' })`] : [];

  return file([
    namedImport(
      [
        'Body',
        'Controller',
        'Delete',
        'Get',
        'HttpCode',
        'HttpStatus',
        'Param',
        'Patch',
        'Post',
        'Query',
      ],
      '@nestjs/common',
    ),
    ...(swagger ? [namedImport(swaggerImports, '@nestjs/swagger')] : []),
    "import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';",
    `import { Create${pascal}Dto } from './dto/create-${kebab}.dto';`,
    `import { Update${pascal}Dto } from './dto/update-${kebab}.dto';`,
    `import { ${pluralPascal}Service } from './${pluralKebab}.service';`,
    '',
    ...(swagger ? [`@ApiTags('${pluralKebab}')`] : []),
    ...(bearer ? ['@ApiBearerAuth()'] : []),
    `@Controller('${pluralKebab}')`,
    `export class ${pluralPascal}Controller {`,
    `  constructor(private readonly ${service}: ${pluralPascal}Service) {}`,
    '',
    ...operation(`Create a ${singular}`),
    '  @Post()',
    `  create(@Body() dto: Create${pascal}Dto) {`,
    `    return this.${service}.create(dto);`,
    '  }',
    '',
    ...operation(`List ${plural} (paginated)`),
    ...(swagger
      ? [
          "  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })",
          "  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })",
        ]
      : []),
    '  @Get()',
    '  findAll(@Query() query: PaginationQueryDto) {',
    `    return this.${service}.findAll(query);`,
    '  }',
    '',
    ...operation(`Get a ${singular} by id`),
    ...notFound(),
    "  @Get(':id')",
    "  findOne(@Param('id') id: string) {",
    `    return this.${service}.findOne(id);`,
    '  }',
    '',
    ...operation(`Update a ${singular}`),
    ...notFound(),
    "  @Patch(':id')",
    `  update(@Param('id') id: string, @Body() dto: Update${pascal}Dto) {`,
    `    return this.${service}.update(id, dto);`,
    '  }',
    '',
    ...operation(`Delete a ${singular}`),
    ...notFound(),
    '  @HttpCode(HttpStatus.NO_CONTENT)',
    "  @Delete(':id')",
    "  async remove(@Param('id') id: string): Promise<void> {",
    `    await this.${service}.remove(id);`,
    '  }',
    '}',
  ]);
}
