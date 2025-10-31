jest.mock(
  'canvas',
  () => ({
    createCanvas: () => ({
      getContext: () => ({}),
    }),
    loadImage: async () => ({}),
  }),
  { virtual: true }
);

if (typeof global.HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {};
}
