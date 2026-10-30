// Monarch tokenizers for the formats Monaco doesn't ship: Prisma and DBML.
import type { languages } from 'monaco-editor/editor/editor.api';

export const prismaLanguage: languages.IMonarchLanguage = {
  defaultToken: '',
  keywords: ['model', 'enum', 'datasource', 'generator', 'type', 'view'],
  types: [
    'String',
    'Boolean',
    'Int',
    'BigInt',
    'Float',
    'Decimal',
    'DateTime',
    'Json',
    'Bytes',
    'Unsupported',
  ],
  constants: ['true', 'false', 'null'],
  tokenizer: {
    root: [
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/.*$/, 'comment'],
      [/@@?[\w.]+/, 'annotation'],
      [/"/, 'string', '@string'],
      [/\d[\d.]*/, 'number'],
      [
        /[A-Za-z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@types': 'type',
            '@constants': 'constant',
            '[A-Z]\\w*': 'type.identifier',
            '@default': 'identifier',
          },
        },
      ],
      [/[{}()[\]]/, '@brackets'],
      [/[?=:,]/, 'delimiter'],
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
  },
};

export const prismaConfiguration: languages.LanguageConfiguration = {
  comments: { lineComment: '//' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
};

export const dbmlLanguage: languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,
  keywords: [
    'project',
    'table',
    'tablegroup',
    'enum',
    'ref',
    'indexes',
    'note',
    'as',
    'records',
    'tablepartial',
  ],
  settings: [
    'pk',
    'primary',
    'key',
    'unique',
    'not',
    'null',
    'increment',
    'default',
    'delete',
    'update',
    'cascade',
    'restrict',
    'set',
    'action',
    'no',
    'name',
    'type',
    'btree',
    'hash',
    'headercolor',
    'database_type',
  ],
  constants: ['true', 'false'],
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@blockComment'],
      [/'''/, 'string', '@multiString'],
      [/'/, 'string', '@singleString'],
      [/"/, 'identifier.quoted', '@doubleString'],
      [/`/, 'string.backtick', '@backtick'],
      [/#[0-9a-f]{3,6}\b/i, 'number.hex'],
      [/-?\d[\d.]*/, 'number'],
      [/[<>-]/, 'operator'],
      [
        /[A-Za-z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@settings': 'attribute.name',
            '@constants': 'constant',
            '@default': 'identifier',
          },
        },
      ],
      [/[{}()[\]]/, '@brackets'],
      [/[.,:]/, 'delimiter'],
    ],
    blockComment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
    multiString: [
      [/'''/, 'string', '@pop'],
      [/./, 'string'],
    ],
    singleString: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
    doubleString: [
      [/[^\\"]+/, 'identifier.quoted'],
      [/\\./, 'string.escape'],
      [/"/, 'identifier.quoted', '@pop'],
    ],
    backtick: [
      [/[^`]+/, 'string.backtick'],
      [/`/, 'string.backtick', '@pop'],
    ],
  },
};

export const dbmlConfiguration: languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string'] },
    { open: '"', close: '"', notIn: ['string'] },
  ],
};
