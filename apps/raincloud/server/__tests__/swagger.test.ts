/**
 * Tests for Swagger/OpenAPI configuration
 */

import { swaggerSpec } from '../swagger';
import { assert, assertEquals } from '@std/assert';

Deno.test('Swagger configuration', async (t) => {
  await t.step('swaggerSpec is defined', () => {
    assert(swaggerSpec);
    assertEquals(typeof swaggerSpec, 'object');
  });

  await t.step('has correct OpenAPI version', () => {
    assertEquals(swaggerSpec.openapi, '3.0.0');
  });

  await t.step('has correct info', () => {
    assert(swaggerSpec.info);
    assertEquals(swaggerSpec.info.title, 'Rainbot API');
    assert(swaggerSpec.info.version);
    assertEquals(
      swaggerSpec.info.description,
      'Discord voice bot API for managing sounds, playlists, and voice connections'
    );
  });

  await t.step('defines Error schema', () => {
    const errorSchema = swaggerSpec.components.schemas.Error;
    assert(errorSchema);
    assertEquals(errorSchema.type, 'object');
    assert(errorSchema.properties.success);
    assert(errorSchema.properties.error);
  });

  await t.step('defines ApiResponse schema', () => {
    const apiResponseSchema = swaggerSpec.components.schemas.ApiResponse;
    assert(apiResponseSchema);
    assertEquals(apiResponseSchema.type, 'object');
    assert(apiResponseSchema.properties.success);
    assert(apiResponseSchema.properties.data);
  });
});
