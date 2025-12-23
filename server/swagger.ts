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
  },
  apis: [
    './server/routes/*.js',
    './server/routes/*.ts',
    './server/*.js',
    './server/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
