import type { IronveilConfig } from '../../config/index.js';
import { routeAccess, type ResourceAuthPolicy, type RouteKind } from '../auth-policy.js';
import type { ResourceNames } from '../names.js';
import { file, namedImport } from './code.js';

export function buildController(
  names: ResourceNames,
  config: IronveilConfig,
  policy: ResourceAuthPolicy = 'user',
): string {
  const { pascal, kebab, pluralKebab, pluralPascal, pluralCamel } = names;
  const service = `${pluralCamel}Service`;
  const singular = kebab.replace(/-/g, ' ');
  const plural = pluralKebab.replace(/-/g, ' ');
  const swagger = config.swagger;
  const jwt = config.auth === 'jwt';
  const reads = routeAccess(policy, 'read');
  const writes = routeAccess(policy, 'write');
  const usesPublic = reads === 'public' || writes === 'public';
  const usesRoles = reads === 'admin' || writes === 'admin';
  // One decorator on the controller when every route needs a token, otherwise
  // only on the routes that do (a public route is not "bearer-protected").
  const bearerOnClass = swagger && jwt && reads !== 'public' && writes !== 'public';
  const bearerPerRoute = swagger && jwt && !bearerOnClass;
  const forbidden = swagger && (reads === 'admin' || writes === 'admin');

  const swaggerImports = [
    ...(bearerOnClass || bearerPerRoute ? ['ApiBearerAuth'] : []),
    ...(forbidden ? ['ApiForbiddenResponse'] : []),
    'ApiNotFoundResponse',
    'ApiOperation',
    'ApiQuery',
    'ApiTags',
  ];

  const operation = (summary: string): string[] =>
    swagger ? [`  @ApiOperation({ summary: '${summary}' })`] : [];
  const notFound = (): string[] =>
    swagger ? [`  @ApiNotFoundResponse({ description: '${pascal} not found' })`] : [];
  // Access decorators sit on each route, so a mixed policy reads at a glance
  // and a single route is easy to change.
  const access = (kind: RouteKind): string[] => {
    const level = routeAccess(policy, kind);
    if (level === 'public') {
      return ['  @Public()'];
    }
    return [
      ...(bearerPerRoute ? ['  @ApiBearerAuth()'] : []),
      ...(level === 'admin'
        ? [
            ...(swagger
              ? ["  @ApiForbiddenResponse({ description: 'Requires the admin role' })"]
              : []),
            '  @Roles(Role.ADMIN)',
          ]
        : []),
    ];
  };

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
    ...(usesPublic
      ? ["import { Public } from '../auth/decorators/public.decorator';"]
      : []),
    ...(usesRoles
      ? [
          "import { Roles } from '../auth/decorators/roles.decorator';",
          "import { Role } from '../auth/types/role.type';",
        ]
      : []),
    "import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';",
    `import { Create${pascal}Dto } from './dto/create-${kebab}.dto';`,
    `import { Update${pascal}Dto } from './dto/update-${kebab}.dto';`,
    `import { ${pluralPascal}Service } from './${pluralKebab}.service';`,
    '',
    ...(swagger ? [`@ApiTags('${pluralKebab}')`] : []),
    ...(bearerOnClass ? ['@ApiBearerAuth()'] : []),
    `@Controller('${pluralKebab}')`,
    `export class ${pluralPascal}Controller {`,
    `  constructor(private readonly ${service}: ${pluralPascal}Service) {}`,
    '',
    ...operation(`Create a ${singular}`),
    ...access('write'),
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
    ...access('read'),
    '  @Get()',
    '  findAll(@Query() query: PaginationQueryDto) {',
    `    return this.${service}.findAll(query);`,
    '  }',
    '',
    ...operation(`Get a ${singular} by id`),
    ...notFound(),
    ...access('read'),
    "  @Get(':id')",
    "  findOne(@Param('id') id: string) {",
    `    return this.${service}.findOne(id);`,
    '  }',
    '',
    ...operation(`Update a ${singular}`),
    ...notFound(),
    ...access('write'),
    "  @Patch(':id')",
    `  update(@Param('id') id: string, @Body() dto: Update${pascal}Dto) {`,
    `    return this.${service}.update(id, dto);`,
    '  }',
    '',
    ...operation(`Delete a ${singular}`),
    ...notFound(),
    ...access('write'),
    '  @HttpCode(HttpStatus.NO_CONTENT)',
    "  @Delete(':id')",
    "  async remove(@Param('id') id: string): Promise<void> {",
    `    await this.${service}.remove(id);`,
    '  }',
    '}',
  ]);
}
