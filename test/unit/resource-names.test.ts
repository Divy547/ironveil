import { describe, expect, it } from 'vitest';
import {
  GenerateError,
  deriveResourceNames,
  pluralize,
} from '../../src/scaffolding/index.js';

describe('pluralize', () => {
  it.each([
    ['product', 'products'],
    ['category', 'categories'],
    ['day', 'days'],
    ['box', 'boxes'],
    ['bus', 'buses'],
    ['class', 'classes'],
    ['match', 'matches'],
    ['dish', 'dishes'],
    ['quiz', 'quizzes'],
    ['person', 'people'],
    ['child', 'children'],
    ['photo', 'photos'],
    ['news', 'news'],
    ['sheep', 'sheep'],
    ['series', 'series'],
  ])('%s -> %s', (singular, plural) => {
    expect(pluralize(singular)).toBe(plural);
  });
});

describe('deriveResourceNames', () => {
  it('derives every spelling from a plain singular name', () => {
    expect(deriveResourceNames('product')).toEqual({
      input: 'product',
      kebab: 'product',
      pascal: 'Product',
      camel: 'product',
      pluralKebab: 'products',
      pluralPascal: 'Products',
      pluralCamel: 'products',
      pluralSnake: 'products',
    });
  });

  it.each(['blog-post', 'BlogPost', 'blogPost', 'blog_post', 'Blog-Post'])(
    'treats %s as the same multi-word name',
    (input) => {
      expect(deriveResourceNames(input)).toMatchObject({
        kebab: 'blog-post',
        pascal: 'BlogPost',
        camel: 'blogPost',
        pluralKebab: 'blog-posts',
        pluralPascal: 'BlogPosts',
        pluralCamel: 'blogPosts',
        pluralSnake: 'blog_posts',
      });
    },
  );

  it('pluralizes only the last word', () => {
    expect(deriveResourceNames('product-category')).toMatchObject({
      pascal: 'ProductCategory',
      pluralKebab: 'product-categories',
      pluralPascal: 'ProductCategories',
    });
  });

  it('keeps acronyms together', () => {
    expect(deriveResourceNames('APIKey')).toMatchObject({
      kebab: 'api-key',
      pascal: 'ApiKey',
      camel: 'apiKey',
    });
  });

  it('keeps digits attached to their word', () => {
    expect(deriveResourceNames('oauth2-client')).toMatchObject({
      kebab: 'oauth2-client',
      pascal: 'Oauth2Client',
    });
  });

  it.each([
    '',
    '   ',
    '1product',
    '-product',
    'product-',
    'pro--duct',
    'pro duct',
    'pro/duct',
    '../product',
    'prödukt',
  ])('rejects the invalid name %j', (input) => {
    expect(() => deriveResourceNames(input)).toThrow(GenerateError);
  });

  it.each(['Prisma', 'prisma-client', 'Date', 'object', 'Promise'])(
    'rejects %s, which would clash with a name the generated code uses',
    (input) => {
      expect(() => deriveResourceNames(input)).toThrow(/reserved|clash/i);
    },
  );

  it('says what is wrong with the name', () => {
    expect(() => deriveResourceNames('1product')).toThrow(/1product/);
  });
});
