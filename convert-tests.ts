#!/usr/bin/env deno run --allow-read --allow-write

/**
 * Script to convert Jest test files to Deno native testing
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

const testFiles = await Array.fromAsync(
  walk('.', {
    includeDirs: false,
    exts: ['.test.ts'],
    skip: [/node_modules/],
  })
);

console.log(`Found ${testFiles.length} test files to convert`);

for (const entry of testFiles) {
  const content = await Deno.readTextFile(entry.path);

  // Skip if already converted
  if (content.includes('import { assert') || content.includes('Deno.test')) {
    console.log(`Skipping ${entry.path} (already converted)`);
    continue;
  }

  console.log(`Converting ${entry.path}`);

  let converted = content;

  // Add assert imports at the top
  const firstImportMatch = converted.match(/^import.*$/m);
  if (firstImportMatch) {
    const insertPoint = firstImportMatch.index!;
    converted =
      converted.slice(0, insertPoint) +
      'import { assertEquals, assert, assertThrows, assertRejects } from "@std/assert";\n' +
      converted.slice(insertPoint);
  }

  // Convert describe blocks to comments (they're nested, so we'll flatten them)
  converted = converted.replace(
    /describe\(['"]([^'"]*)['"],\s*\(\)\s*=>\s*\{/g,
    (match, suiteName) => {
      return `// ${suiteName} tests`;
    }
  );

  // Convert it() calls to Deno.test
  converted = converted.replace(
    /it\(['"]([^'"]*)['"],\s*(async\s+)?\(\)\s*=>\s*\{/g,
    (match, testName, asyncKeyword) => {
      const asyncStr = asyncKeyword ? 'async ' : '';
      return `Deno.test(${asyncStr}'${testName}', ${asyncKeyword || ''}() => {`;
    }
  );

  // Convert expect() assertions
  converted = converted.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assertEquals($1, $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeDefined\(\)/g, 'assert($1)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeTruthy\(\)/g, 'assert($1)');
  converted = converted.replace(/expect\(([^)]+)\)\.toBeFalsy\(\)/g, 'assert(!$1)');
  converted = converted.replace(
    /expect\(([^)]+)\)\.toContain\(['"]([^'"]*)['"]\)/g,
    'assert($1.includes("$2"))'
  );
  converted = converted.replace(
    /expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/g,
    'assert($1 > $2)'
  );
  converted = converted.replace(/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/g, 'assert($1 < $2)');
  converted = converted.replace(/expect\(([^)]+)\)\.toThrow\(\)/g, 'assertThrows(() => $1)');
  converted = converted.replace(
    /expect\(([^)]+)\)\.toThrow\(['"]([^'"]*)['"]\)/g,
    'assertThrows(() => $1, "$2")'
  );

  // Handle async expect().rejects
  converted = converted.replace(
    /await expect\(([^)]+)\)\.rejects\.toThrow\(['"]([^'"]*)['"]\)/g,
    'await assertRejects(() => $1, "$2")'
  );
  converted = converted.replace(
    /await expect\(([^)]+)\)\.rejects\.toThrow\(\)/g,
    'await assertRejects(() => $1)'
  );

  // Remove closing braces from describe blocks
  converted = converted.replace(/\n\s*\}\);\s*$/gm, '');

  // Fix discord.js imports
  converted = converted.replace(/from 'discord\.js'/g, "from 'npm:discord.js@14.15.3'");

  // Add .ts extensions to relative imports
  converted = converted.replace(/from '\.\.\/([^']*)'/g, "from '../$1.ts'");
  converted = converted.replace(/from '\.\/([^']*)'/g, "from './$1.ts'");

  await Deno.writeTextFile(entry.path, converted);
}

console.log('Conversion complete!');
