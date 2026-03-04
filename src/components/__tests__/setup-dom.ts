import { GlobalWindow } from 'happy-dom';

const window = new GlobalWindow();

// Register happy-dom globals so @testing-library/react can find document, window, etc.
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try {
    Object.defineProperty(globalThis, key, {
      value: (window as unknown as Record<string, unknown>)[key],
      writable: true,
      configurable: true,
    });
  } catch {
    // Some properties can't be overridden — skip them
  }
}

// Ensure critical globals are set
if (!('document' in globalThis)) {
  Object.defineProperty(globalThis, 'document', {
    value: window.document,
    writable: true,
    configurable: true,
  });
}
if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    value: window,
    writable: true,
    configurable: true,
  });
}
if (!('navigator' in globalThis)) {
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    writable: true,
    configurable: true,
  });
}
if (!('HTMLElement' in globalThis)) {
  Object.defineProperty(globalThis, 'HTMLElement', {
    value: window.HTMLElement,
    writable: true,
    configurable: true,
  });
}
