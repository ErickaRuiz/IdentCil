// Entorno de pruebas: Angular 19 con zone.js sobre jsdom (Vitest).
//
// No se usa `setupTestBed()` de Analog porque activa por defecto la detección
// de cambios sin zone.js mediante una API que sólo existe desde Angular 20.
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { addIcons } from 'ionicons';
import * as icons from 'ionicons/icons';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// Igual que main.ts: sin esto, ion-icon intenta descargar cada SVG.
addIcons(icons);

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
