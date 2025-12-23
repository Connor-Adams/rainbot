/**
 * Dependency Injection Container
 * Provides centralized service management
 */

type ServiceFactory<T> = () => T;
type ServiceInstance<T> = T;

class DIContainer {
  private services: Map<string, ServiceInstance<unknown>> = new Map();
  private factories: Map<string, ServiceFactory<unknown>> = new Map();

  /**
   * Register a singleton service
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory as ServiceFactory<unknown>);
  }

  /**
   * Get a service instance (lazy initialization)
   */
  get<T>(name: string): T {
    // Return existing instance if available
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    // Create new instance from factory
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service not registered: ${name}`);
    }

    const instance = factory();
    this.services.set(name, instance);
    return instance as T;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.factories.has(name) || this.services.has(name);
  }

  /**
   * Clear all services (for testing)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }

  /**
   * Register multiple services at once
   */
  registerAll(services: Record<string, ServiceFactory<unknown>>): void {
    Object.entries(services).forEach(([name, factory]) => {
      this.register(name, factory);
    });
  }
}

// Export singleton instance
export const container = new DIContainer();

// Helper function to initialize common services
export function initializeServices(_config: unknown = {}): void {
  // Register core services here
  // Example:
  // container.register('logger', () => createLogger(config.logLevel));
  // container.register('database', () => createDatabaseConnection(config.db));
}
