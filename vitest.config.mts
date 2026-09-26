import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// Pruebas unitarias con Vitest. Las ejecuta `ng test` (builder de Analog, que
// da soporte a Vitest en Angular 19) o directamente `npx vitest`.
//
//   *.spec.ts       pruebas de componentes y servicios con TestBed
//   *.unit.test.ts  lógica pura, sin Angular (p. ej. el cliente del servicio de IA)
export default defineConfig(({ mode }) => ({
  plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts', 'src/**/*.unit.test.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
