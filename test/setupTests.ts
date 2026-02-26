import '@testing-library/jest-dom';

afterEach(() => {
  jest.clearAllMocks();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = ResizeObserverMock;
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
}

(globalThis as any).ResizeObserver = ResizeObserverMock;
