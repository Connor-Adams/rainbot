import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `@testing-library/react`'s auto-cleanup only fires when the globals API is
// enabled; this suite imports `describe`/`it`/`expect` explicitly, so unmount
// between tests has to be wired up here or a component's effects (and the
// focus/keydown listeners `ConfirmDialog` installs on `document`) leak into the
// next test.
afterEach(() => {
  cleanup();
});
