import { swaggerSpec } from '../swagger';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// swagger tests
Deno.test('swagger - exports a valid swagger specification object', () => {
  assert(swaggerSpec);
  assertEquals(typeof swaggerSpec, 'object');
});

Deno.test('swagger - has OpenAPI 3.0.0 specification', () => {
  assertEquals(swaggerSpec.openapi, '3.0.0');
});

Deno.test('swagger - has API info defined', () => {
  assert(swaggerSpec.info);
  assertEquals(swaggerSpec.info.title, 'Rainbot API');
  assert(swaggerSpec.info.version);
  assert(swaggerSpec.info.description?.includes('Discord voice bot'));
});

Deno.test('swagger - has contact information', () => {
  assert(swaggerSpec.info.contact);
  assertEquals(swaggerSpec.info.contact.name, 'Rainbot');
  assert(swaggerSpec.info.contact.url?.includes('github.com'));
});

Deno.test('swagger - has license information', () => {
  assert(swaggerSpec.info.license);
  assertEquals(swaggerSpec.info.license.name, 'ISC');
});

Deno.test('swagger - has server configurations', () => {
  assert(swaggerSpec.servers);
  assert(Array.isArray(swaggerSpec.servers));
  assert(swaggerSpec.servers.length > 0);
});

Deno.test('swagger - includes localhost development server', () => {
  const devServer = swaggerSpec.servers?.find((s: any) => s.url?.includes('localhost'));
  assert(devServer);
  assert(devServer.description?.includes('Development'));
});

Deno.test('swagger - has component schemas defined', () => {
  assert(swaggerSpec.components);
  assert(swaggerSpec.components.schemas);
});

Deno.test('swagger - defines Error schema', () => {
  const errorSchema = swaggerSpec.components.schemas?.Error;
  assert(errorSchema);
  assertEquals(errorSchema.type, 'object');
  assert(errorSchema.properties?.success);
  assert(errorSchema.properties?.error);
});

Deno.test('swagger - defines ApiResponse schema', () => {
  const apiResponseSchema = swaggerSpec.components.schemas?.ApiResponse;
  assert(apiResponseSchema);
  assertEquals(apiResponseSchema.type, 'object');
  assert(apiResponseSchema.properties?.success);
  assert(apiResponseSchema.properties?.data);
});
