import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../package.json';

/**
 * Swagger/OpenAPI configuration for API documentation
 */

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Rainbot API',
      version: version,
      description: 'Discord voice bot API for managing sounds, playlists, and voice connections',
      license: {
        name: 'ISC',
      },
      contact: {
        name: 'Rainbot',
        url: 'https://github.com/Connor-Adams/rainbot',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://your-production-domain.com',
        description: 'Production server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            data: {
              type: 'object',
            },
            message: {
              type: 'string',
            },
          },
        },
        Sound: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'sound.mp3',
            },
            size: {
              type: 'number',
              example: 1024,
            },
            duration: {
              type: 'number',
              example: 3.5,
            },
            uploadedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        VoiceConnection: {
          type: 'object',
          properties: {
            guildId: {
              type: 'string',
              example: '123456789',
            },
            channelId: {
              type: 'string',
              example: '987654321',
            },
            channelName: {
              type: 'string',
              example: 'General',
            },
            isPlaying: {
              type: 'boolean',
            },
            currentTrack: {
              type: 'object',
              nullable: true,
            },
            queueLength: {
              type: 'number',
            },
          },
        },
        Queue: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                  },
                  url: {
                    type: 'string',
                  },
                  duration: {
                    type: 'number',
                  },
                  requestedBy: {
                    type: 'string',
                  },
                },
              },
            },
            current: {
              type: 'object',
              nullable: true,
            },
          },
        },
      },
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie from Discord OAuth',
        },
      },
    },
    security: [
      {
        sessionAuth: [],
      },
    ],
    paths: {
      '/api/sounds/search': {
        get: {
          summary: 'Search sounds by name, transcript, or description',
          tags: ['Sounds'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Search query text',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer' },
              description: 'Maximum number of results (capped at 100)',
            },
          ],
          responses: {
            '200': {
              description: 'Ranked search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            score: { type: 'number' },
                            matchedOn: { type: 'string' },
                            snippet: { type: 'string', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/sounds/analyze-sweep': {
        post: {
          summary: 'Backfill analysis across the sound library',
          tags: ['Sounds'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    force: { type: 'boolean' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Sweep results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      analyzed: { type: 'integer' },
                      skipped: { type: 'integer' },
                      failed: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '500': {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/sounds/strip-video-sweep': {
        post: {
          summary: 'Re-mux stored Ogg clips that carry a video stream down to audio only',
          description:
            'Some stored .ogg objects hold a Theora video stream alongside their Opus audio, ' +
            'which Whisper rejects outright with "400 Invalid file format". This copies each ' +
            'affected original to sounds/archived/ and then rewrites it in place with the video ' +
            'stream dropped and the audio packets copied across untouched. Set dryRun to report ' +
            'what would be rewritten without writing anything.',
          tags: ['Sounds'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dryRun: { type: 'boolean' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Sweep results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      stripped: { type: 'integer' },
                      archived: { type: 'integer' },
                      skipped: { type: 'integer' },
                      failed: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '500': {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./server/routes/*.js', './server/routes/*.ts', './server/*.js', './server/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
