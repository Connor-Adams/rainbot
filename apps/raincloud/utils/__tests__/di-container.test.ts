import { container, initializeServices } from '../di-container';

describe('di-container', () => {
  beforeEach(() => {
    // Clear container before each test
    container.clear();
  });

  afterEach(() => {
    container.clear();
  });

  describe('DIContainer', () => {
    describe('register', () => {
      it('registers a service factory', () => {
        const factory = jest.fn(() => ({ value: 'test' }));

        container.register('testService', factory);

        expect(container.has('testService')).toBe(true);
      });

      it('allows registering multiple services', () => {
        container.register('service1', () => ({ name: 'one' }));
        container.register('service2', () => ({ name: 'two' }));

        expect(container.has('service1')).toBe(true);
        expect(container.has('service2')).toBe(true);
      });
    });

    describe('get', () => {
      it('creates and returns a service instance', () => {
        const expectedInstance = { value: 'test' };
        container.register('testService', () => expectedInstance);

        const instance = container.get('testService');

        expect(instance).toBe(expectedInstance);
      });

      it('returns the same instance on subsequent calls (singleton)', () => {
        let counter = 0;
        container.register('counterService', () => ({ count: ++counter }));

        const instance1 = container.get<{ count: number }>('counterService');
        const instance2 = container.get<{ count: number }>('counterService');

        expect(instance1).toBe(instance2);
        expect(instance1.count).toBe(1);
        expect(instance2.count).toBe(1);
      });

      it('throws error when getting unregistered service', () => {
        expect(() => {
          container.get('nonexistentService');
        }).toThrow('Service not registered: nonexistentService');
      });

      it('calls factory only once for singleton', () => {
        const factory = jest.fn(() => ({ value: 'test' }));
        container.register('testService', factory);

        container.get('testService');
        container.get('testService');
        container.get('testService');

        expect(factory).toHaveBeenCalledTimes(1);
      });

      it('supports generic type parameter', () => {
        interface MyService {
          doSomething: () => string;
        }

        const service: MyService = {
          doSomething: () => 'result',
        };

        container.register('myService', () => service);

        const instance = container.get<MyService>('myService');

        expect(instance.doSomething()).toBe('result');
      });
    });

    describe('has', () => {
      it('returns true for registered factory', () => {
        container.register('testService', () => ({ value: 'test' }));

        expect(container.has('testService')).toBe(true);
      });

      it('returns true for instantiated service', () => {
        container.register('testService', () => ({ value: 'test' }));
        container.get('testService'); // Instantiate

        expect(container.has('testService')).toBe(true);
      });

      it('returns false for unregistered service', () => {
        expect(container.has('nonexistentService')).toBe(false);
      });
    });

    describe('clear', () => {
      it('clears all services and factories', () => {
        container.register('service1', () => ({ name: 'one' }));
        container.register('service2', () => ({ name: 'two' }));
        container.get('service1'); // Instantiate

        container.clear();

        expect(container.has('service1')).toBe(false);
        expect(container.has('service2')).toBe(false);
      });

      it('allows re-registering after clear', () => {
        container.register('testService', () => ({ value: 1 }));
        const instance1 = container.get<{ value: number }>('testService');

        container.clear();

        container.register('testService', () => ({ value: 2 }));
        const instance2 = container.get<{ value: number }>('testService');

        expect(instance1.value).toBe(1);
        expect(instance2.value).toBe(2);
        expect(instance1).not.toBe(instance2);
      });
    });

    describe('registerAll', () => {
      it('registers multiple services at once', () => {
        const services = {
          service1: () => ({ name: 'one' }),
          service2: () => ({ name: 'two' }),
          service3: () => ({ name: 'three' }),
        };

        container.registerAll(services);

        expect(container.has('service1')).toBe(true);
        expect(container.has('service2')).toBe(true);
        expect(container.has('service3')).toBe(true);
      });

      it('works with empty object', () => {
        container.registerAll({});

        expect(container.has('anything')).toBe(false);
      });

      it('allows getting services registered via registerAll', () => {
        const services = {
          testService: () => ({ value: 'test' }),
        };

        container.registerAll(services);
        const instance = container.get<{ value: string }>('testService');

        expect(instance.value).toBe('test');
      });
    });
  });

  describe('initializeServices', () => {
    it('executes without error', () => {
      expect(() => {
        initializeServices();
      }).not.toThrow();
    });

    it('accepts config parameter', () => {
      const config = { logLevel: 'debug', db: 'postgres://localhost/test' };

      expect(() => {
        initializeServices(config);
      }).not.toThrow();
    });
  });
});
