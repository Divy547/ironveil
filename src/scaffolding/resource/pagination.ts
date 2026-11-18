import { file } from './code.js';

export const PAGINATION_QUERY_PATH = 'src/common/pagination/pagination-query.dto.ts';
export const PAGINATED_PATH = 'src/common/pagination/paginated.ts';

/** `?page=&limit=` query parameters, shared by every generated list endpoint. */
export function buildPaginationQueryDto(): string {
  return file([
    "import { Type } from 'class-transformer';",
    "import { IsInt, Max, Min } from 'class-validator';",
    '',
    'export class PaginationQueryDto {',
    '  @Type(() => Number)',
    '  @IsInt()',
    '  @Min(1)',
    '  page = 1;',
    '',
    '  @Type(() => Number)',
    '  @IsInt()',
    '  @Min(1)',
    '  @Max(100)',
    '  limit = 20;',
    '}',
  ]);
}

/** The response envelope of every generated list endpoint. */
export function buildPaginated(): string {
  return file([
    'export interface Paginated<T> {',
    '  readonly data: T[];',
    '  readonly meta: {',
    '    readonly total: number;',
    '    readonly page: number;',
    '    readonly limit: number;',
    '    readonly totalPages: number;',
    '  };',
    '}',
    '',
    'export function paginate<T>(',
    '  data: T[],',
    '  total: number,',
    '  query: { readonly page: number; readonly limit: number },',
    '): Paginated<T> {',
    '  return {',
    '    data,',
    '    meta: {',
    '      total,',
    '      page: query.page,',
    '      limit: query.limit,',
    '      totalPages: Math.ceil(total / query.limit),',
    '    },',
    '  };',
    '}',
  ]);
}
