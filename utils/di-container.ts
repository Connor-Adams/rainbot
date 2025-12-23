import 'reflect-metadata';
import { Container } from 'inversify';
import { Client } from 'discord.js';
import { TYPES } from '../types/di.symbols';
import type {
  ILoggerService,
  IDatabaseService,
  ICacheService,
  IConfigService,
} from '../types/services';

/**
 * Dependency Injection Container
 * Centralizes all service instantiation and dependency management
 */

export class DIContainer {
  private static instance: Container;

  /**
   * Initialize the DI container with all bindings
   */
  static initialize(client: Client): Container {
    if (!DIContainer.instance) {
      DIContainer.instance = new Container();
      DIContainer.setupBindings(client);
    }
    return DIContainer.instance;
  }

  /**
   * Get the container instance
   */
  static getContainer(): Container {
    if (!DIContainer.instance) {
      throw new Error('DI Container not initialized. Call initialize() first.');
    }
    return DIContainer.instance;
  }

  /**
   * Setup all service bindings
   */
  private static setupBindings(client: Client): void {
    const container = DIContainer.instance;

    // Bind Discord Client
    container.bind<Client>(TYPES.Client).toConstantValue(client);

    // Bind services (these will be implemented progressively)
    // For now, we'll use lazy loading to maintain backward compatibility

    // Config Service
    container
      .bind<IConfigService>(TYPES.ConfigService)
      .toDynamicValue(() => {
        const { loadConfig } = require('./config');
        return {
          get: (key: string) => loadConfig()[key],
          getAll: () => loadConfig(),
          validate: () => true,
        };
      })
      .inSingletonScope();

    // Logger Service
    container
      .bind<ILoggerService>(TYPES.Logger)
      .toDynamicValue((context) => {
        const { createLogger } = require('./logger');
        return createLogger('DIContainer');
      })
      .inSingletonScope();

    // Database Service
    container
      .bind<IDatabaseService>(TYPES.DatabaseService)
      .toDynamicValue(() => {
        const database = require('./database');
        return {
          getPool: () => database.getPool(),
          query: database.query,
          transaction: database.transaction,
          close: database.close,
        };
      })
      .inSingletonScope();

    // Cache Service (Redis)
    container
      .bind<ICacheService>(TYPES.CacheService)
      .toDynamicValue(() => {
        // This will be implemented when we add Redis caching
        return {
          get: async () => null,
          set: async () => {},
          delete: async () => {},
          clear: async () => {},
          exists: async () => false,
        };
      })
      .inSingletonScope();
  }

  /**
   * Reset the container (useful for testing)
   */
  static reset(): void {
    if (DIContainer.instance) {
      DIContainer.instance.unbindAll();
    }
  }
}

/**
 * Convenience function to get a service from the container
 */
export function getService<T>(serviceIdentifier: symbol): T {
  return DIContainer.getContainer().get<T>(serviceIdentifier);
}
