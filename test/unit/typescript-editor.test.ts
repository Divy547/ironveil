import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import {
  EditError,
  addImportDeclaration,
  addModuleImport,
  addProvider,
  registerInModule,
} from '../../src/editing/index.js';

const APP_MODULE = `import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    CommonModule,
  ],
})
export class AppModule {}
`;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('addImportDeclaration', () => {
  it('adds a new named import after the existing imports', () => {
    const result = addImportDeclaration(APP_MODULE, {
      moduleSpecifier: './modules/orders/orders.module',
      namedImports: ['OrdersModule'],
    });

    expect(result).toContain(
      "import { OrdersModule } from './modules/orders/orders.module';",
    );
    expect(result.indexOf('OrdersModule')).toBeLessThan(
      result.indexOf('@Module'),
    );
  });

  it('keeps the quote style of the file', () => {
    const doubleQuoted = `import { Module } from "@nestjs/common";\n\n@Module({})\nexport class A {}\n`;
    const result = addImportDeclaration(doubleQuoted, {
      moduleSpecifier: './x',
      namedImports: ['X'],
    });

    expect(result).toContain('import { X } from "./x";');
  });

  it('is idempotent', () => {
    const spec = {
      moduleSpecifier: './modules/orders/orders.module',
      namedImports: ['OrdersModule'],
    };
    const once = addImportDeclaration(APP_MODULE, spec);
    const twice = addImportDeclaration(once, spec);

    expect(twice).toBe(once);
  });

  it('merges new names into an existing import from the same module', () => {
    const source = `import { Module } from '@nestjs/common';\n\n@Module({})\nexport class A {}\n`;
    const result = addImportDeclaration(source, {
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Module', 'Global'],
    });

    expect(count(result, "from '@nestjs/common'")).toBe(1);
    expect(result).toMatch(/import \{[^}]*Module[^}]*\} from/);
    expect(result).toMatch(/import \{[^}]*Global[^}]*\} from/);
    expect(count(result, 'Module,')).toBeLessThanOrEqual(1);
  });

  it('only adds the names that are missing from an existing import', () => {
    const source = `import { Module, Global } from '@nestjs/common';\n`;
    const result = addImportDeclaration(source, {
      moduleSpecifier: '@nestjs/common',
      namedImports: ['Global', 'Injectable'],
    });

    expect(count(result, 'Global')).toBe(1);
    expect(result).toContain('Injectable');
  });

  it('refuses to import a name that is already imported from somewhere else', () => {
    expect(() =>
      addImportDeclaration(APP_MODULE, {
        moduleSpecifier: './other/common.module',
        namedImports: ['CommonModule'],
      }),
    ).toThrow(EditError);

    expect(() =>
      addImportDeclaration(APP_MODULE, {
        moduleSpecifier: './other/common.module',
        namedImports: ['CommonModule'],
      }),
    ).toThrow(/CommonModule.*\.\/common\/common\.module/);
  });

  it('rejects an empty list of names', () => {
    expect(() =>
      addImportDeclaration(APP_MODULE, {
        moduleSpecifier: './x',
        namedImports: [],
      }),
    ).toThrow(EditError);
  });
});

describe('addModuleImport', () => {
  it('adds the import statement and registers the module in @Module imports', () => {
    const result = addModuleImport(APP_MODULE, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toContain(
      "import { OrdersModule } from './modules/orders/orders.module';",
    );
    expect(result).toMatch(
      /imports: \[\s*CommonModule,\s*OrdersModule,?\s*\]/,
    );
  });

  it('is idempotent: a second run changes nothing', () => {
    const spec = {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    };
    const once = addModuleImport(APP_MODULE, spec);
    const twice = addModuleImport(once, spec);

    expect(twice).toBe(once);
    expect(count(twice, 'OrdersModule')).toBe(2);
  });

  it('keeps existing modules in their original order', () => {
    const first = addModuleImport(APP_MODULE, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });
    const second = addModuleImport(first, {
      moduleName: 'ProductsModule',
      importPath: './modules/products/products.module',
    });

    const arrayBody = second.slice(
      second.indexOf('imports: ['),
      second.indexOf(']'),
    );
    expect(arrayBody.indexOf('CommonModule')).toBeLessThan(
      arrayBody.indexOf('OrdersModule'),
    );
    expect(arrayBody.indexOf('OrdersModule')).toBeLessThan(
      arrayBody.indexOf('ProductsModule'),
    );
  });

  it('adds the module when it is imported but not registered', () => {
    const source = `import { Module } from '@nestjs/common';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(count(result, "from './modules/orders/orders.module'")).toBe(1);
    expect(result).toMatch(/imports: \[\s*OrdersModule,?\s*\]/);
  });

  it('adds the import statement when the module is registered but not imported', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({
  imports: [OrdersModule],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toContain(
      "import { OrdersModule } from './modules/orders/orders.module';",
    );
    expect(count(result, 'OrdersModule')).toBe(2);
  });

  it('creates the imports property when @Module has none', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({
  providers: [],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toMatch(/imports: \[\s*OrdersModule,?\s*\]/);
    expect(result).toContain('providers: []');
  });

  it('creates the object when @Module() has no arguments', () => {
    const source = `import { Module } from '@nestjs/common';

@Module()
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toMatch(/@Module\(\{[\s\S]*imports: \[[\s\S]*OrdersModule/);
  });

  describe('creating a missing array', () => {
    const add = (source: string) =>
      registerInModule(source, {
        property: 'controllers',
        name: 'BillingController',
        importPath: './billing.controller',
      });

    it('writes it on one line, with a trailing comma, in a bare @Module({})', () => {
      const result = add(`import { Module } from '@nestjs/common';

@Module({})
export class BillingModule {}
`);

      expect(result).toBe(`import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';

@Module({
  controllers: [BillingController],
})
export class BillingModule {}
`);
    });

    it('writes it in a bare @Module()', () => {
      const result = add(`import { Module } from '@nestjs/common';

@Module()
export class BillingModule {}
`);

      expect(result).toContain('  controllers: [BillingController],\n})');
    });

    it('follows the object: a trailing comma stays, and none is added when the file uses none', () => {
      const withComma = add(`import { Module } from '@nestjs/common';

@Module({
  providers: [],
})
export class BillingModule {}
`);
      expect(withComma).toContain('  providers: [],\n  controllers: [BillingController],\n})');

      const withoutComma = add(`import { Module } from '@nestjs/common';

@Module({
  providers: []
})
export class BillingModule {}
`);
      expect(withoutComma).toContain('  providers: [],\n  controllers: [BillingController]\n})');
    });

    it('stays idempotent', () => {
      const once = add(`import { Module } from '@nestjs/common';

@Module({})
export class BillingModule {}
`);

      expect(add(once)).toBe(once);
    });

    it('appends to the one-line array it created', () => {
      const once = add(`import { Module } from '@nestjs/common';

@Module({})
export class BillingModule {}
`);
      const twice = registerInModule(once, {
        property: 'controllers',
        name: 'TaxController',
        importPath: './tax.controller',
      });

      expect(twice).toMatch(/controllers: \[BillingController, TaxController\],/);
    });
  });

  it('targets the named class when a file declares several modules', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({ imports: [] })
export class FirstModule {}

@Module({ imports: [] })
export class SecondModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './orders.module',
      targetClass: 'SecondModule',
    });

    const first = result.slice(
      result.indexOf('class FirstModule') - 40,
      result.indexOf('class FirstModule'),
    );
    expect(first).not.toContain('OrdersModule');
    expect(
      result.slice(result.indexOf('export class FirstModule')),
    ).toContain('OrdersModule');
  });

  it('throws a clear error when the file has no @Module class', () => {
    expect(() =>
      addModuleImport('export class NotAModule {}\n', {
        moduleName: 'OrdersModule',
        importPath: './orders.module',
      }),
    ).toThrow(/@Module/);
  });

  it('throws when the named target class does not exist', () => {
    expect(() =>
      addModuleImport(APP_MODULE, {
        moduleName: 'OrdersModule',
        importPath: './orders.module',
        targetClass: 'MissingModule',
      }),
    ).toThrow(/MissingModule/);
  });

  it('throws when the imports property is not an array literal', () => {
    const source = `import { Module } from '@nestjs/common';
const shared = [];

@Module({
  imports: shared,
})
export class AppModule {}
`;
    expect(() =>
      addModuleImport(source, {
        moduleName: 'OrdersModule',
        importPath: './orders.module',
      }),
    ).toThrow(/array literal/);
  });

  it('throws on a syntax error instead of producing broken code', () => {
    expect(() =>
      addModuleImport('@Module({ imports: [ \n export class', {
        moduleName: 'OrdersModule',
        importPath: './orders.module',
      }),
    ).toThrow(EditError);
  });
});

describe('formatting of edits', () => {
  it('produces exactly the code a person would write', () => {
    const result = addModuleImport(APP_MODULE, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toBe(`import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    CommonModule,
    OrdersModule,
  ],
})
export class AppModule {}
`);
  });

  it('does not add a trailing comma to an array that has none', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({
  imports: [
    CommonModule
  ],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './orders.module',
    });

    expect(result).toContain('    CommonModule,\n    OrdersModule\n  ],');
  });

  it('follows four-space indentation', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({
    imports: [
        CommonModule,
    ],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './orders.module',
    });

    expect(result).toContain('        CommonModule,\n        OrdersModule,\n    ],');
  });

  it('follows tab indentation', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({
\timports: [
\t\tCommonModule,
\t],
})
export class AppModule {}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './orders.module',
    });

    expect(result).toContain('\t\tCommonModule,\n\t\tOrdersModule,\n\t],');
  });

  it('keeps CRLF line endings throughout', () => {
    const source = APP_MODULE.replace(/\n/g, '\r\n');
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(result).toContain('\r\n');
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('leaves every untouched line byte-for-byte as it was', () => {
    const result = addModuleImport(APP_MODULE, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });
    const after = new Set(result.split('\n'));

    for (const line of APP_MODULE.split('\n')) {
      expect(after.has(line)).toBe(true);
    }
  });
});

describe('addProvider and registerInModule', () => {
  it('registers a provider and its import', () => {
    const result = addProvider(APP_MODULE, {
      className: 'OrdersService',
      importPath: './modules/orders/orders.service',
    });

    expect(result).toContain(
      "import { OrdersService } from './modules/orders/orders.service';",
    );
    expect(result).toMatch(/providers: \[\s*OrdersService,?\s*\]/);
    expect(result).toContain('imports: [');
  });

  it('is idempotent', () => {
    const spec = {
      className: 'OrdersService',
      importPath: './modules/orders/orders.service',
    };
    const once = addProvider(APP_MODULE, spec);

    expect(addProvider(once, spec)).toBe(once);
  });

  it('supports controllers and exports', () => {
    let result = registerInModule(APP_MODULE, {
      property: 'controllers',
      name: 'OrdersController',
      importPath: './orders.controller',
    });
    result = registerInModule(result, {
      property: 'exports',
      name: 'OrdersService',
      importPath: './orders.service',
    });

    expect(result).toMatch(/controllers: \[\s*OrdersController,?\s*\]/);
    expect(result).toMatch(/exports: \[\s*OrdersService,?\s*\]/);
  });

  it('works on an inline single-line array without breaking it', () => {
    const source = `import { Module } from '@nestjs/common';

@Module({ providers: [A, B] })
export class AppModule {}
`;
    const result = addProvider(source, {
      className: 'C',
      importPath: './c',
    });

    expect(result).toMatch(/providers: \[\s*A,\s*B,\s*C,?\s*\]/);
  });

  it('preserves comments and unrelated code', () => {
    const source = `import { Module } from '@nestjs/common';

// Keep this comment.
@Module({
  // modules
  imports: [],
})
export class AppModule {
  // class comment
  configure() {}
}
`;
    const result = addModuleImport(source, {
      moduleName: 'OrdersModule',
      importPath: './orders.module',
    });

    expect(result).toContain('// Keep this comment.');
    expect(result).toContain('// modules');
    expect(result).toContain('// class comment');
    expect(result).toContain('configure() {}');
  });

  it('rejects a property it does not know', () => {
    expect(() =>
      registerInModule(APP_MODULE, {
        property: 'nope' as 'imports',
        name: 'X',
        importPath: './x',
      }),
    ).toThrow(EditError);
  });
});

describe('editing a real generated AppModule', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function readAppModule(
    overrides: Parameters<typeof resolveConfig>[0],
  ): Promise<string> {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-editing-'));
    const config = resolveConfig({ projectName: 'test-api', ...overrides });
    const { destination } = await generateProject(config, dir);
    return readFile(path.join(destination, 'src/app.module.ts'), 'utf8');
  }

  it.each([
    ['without auth', {}],
    ['with auth', { auth: 'jwt' as const }],
  ])('adds a module idempotently (%s)', async (_label, overrides) => {
    const original = await readAppModule(overrides);

    const edited = addModuleImport(original, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    });

    expect(edited).toContain('OrdersModule,');
    expect(edited).toContain(
      "import { OrdersModule } from './modules/orders/orders.module';",
    );
    // Everything that was registered before still is.
    for (const name of ['CommonModule', 'InfrastructureModule', 'HealthModule']) {
      expect(edited).toContain(name);
    }
    if (overrides.auth === 'jwt') {
      expect(edited).toContain('AuthModule');
    }
    expect(addModuleImport(edited, {
      moduleName: 'OrdersModule',
      importPath: './modules/orders/orders.module',
    })).toBe(edited);
  });
});
