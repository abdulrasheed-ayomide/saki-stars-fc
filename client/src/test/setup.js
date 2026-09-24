import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout engine; ScrollRestoration calls scrollTo on navigation.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
});
