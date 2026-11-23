export function createFloatingMediaObserver() {
  const handlers = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => handlers.get(entry.target)?.(entry));
  }, { threshold: 0 });

  return {
    observe(anchor, handler) {
      if (!anchor) return;
      handlers.set(anchor, handler);
      observer.observe(anchor);
    },
    unobserve(anchor) {
      if (!anchor) return;
      observer.unobserve(anchor);
      handlers.delete(anchor);
    },
  };
}
