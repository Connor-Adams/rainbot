import { swaggerSpec } from '../swagger';

describe('swagger', () => {
  it('exports a valid swagger specification object', () => {
    expect(swaggerSpec).toBeDefined();
    expect(typeof swaggerSpec).toBe('object');
  });

  it('has OpenAPI 3.0.0 specification', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
  });

  it('has API info defined', () => {
    expect(swaggerSpec.info).toBeDefined();
    expect(swaggerSpec.info.title).toBe('Rainbot API');
    expect(swaggerSpec.info.version).toBeDefined();
    expect(swaggerSpec.info.description).toContain('Discord voice bot');
  });

  it('has contact information', () => {
    expect(swaggerSpec.info.contact).toBeDefined();
    expect(swaggerSpec.info.contact.name).toBe('Rainbot');
    expect(swaggerSpec.info.contact.url).toContain('github.com');
  });

  it('has license information', () => {
    expect(swaggerSpec.info.license).toBeDefined();
    expect(swaggerSpec.info.license.name).toBe('ISC');
  });

  it('has server configurations', () => {
    expect(swaggerSpec.servers).toBeDefined();
    expect(Array.isArray(swaggerSpec.servers)).toBe(true);
    expect(swaggerSpec.servers.length).toBeGreaterThan(0);
  });

  it('includes localhost development server', () => {
    const devServer = swaggerSpec.servers.find((s: any) =>
      s.url.includes('localhost')
    );
    expect(devServer).toBeDefined();
    expect(devServer.description).toContain('Development');
  });

  it('has component schemas defined', () => {
    expect(swaggerSpec.components).toBeDefined();
    expect(swaggerSpec.components.schemas).toBeDefined();
  });

  it('defines Error schema', () => {
    const errorSchema = swaggerSpec.components.schemas.Error;
    expect(errorSchema).toBeDefined();
    expect(errorSchema.type).toBe('object');
    expect(errorSchema.properties.success).toBeDefined();
    expect(errorSchema.properties.error).toBeDefined();
  });

  it('defines ApiResponse schema', () => {
    const apiResponseSchema = swaggerSpec.components.schemas.ApiResponse;
    expect(apiResponseSchema).toBeDefined();
    expect(apiResponseSchema.type).toBe('object');
    expect(apiResponseSchema.properties.success).toBeDefined();
    expect(apiResponseSchema.properties.data).toBeDefined();
  });
});
