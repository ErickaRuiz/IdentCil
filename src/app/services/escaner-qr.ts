import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Comprueba que el escáner de QR se puede usar ya.
 *
 * En Android, `BarcodeScanner.scan()` usa el escáner de Google Play, un módulo
 * que se descarga aparte. Si la app se instala desde la Play Store llega con
 * ella; si se instala a mano (el APK de pruebas), no, y `scan()` falla con un
 * error en inglés hasta que se descargue.
 *
 * Devuelve true si se puede escanear. Si falta el módulo, inicia su descarga y
 * devuelve false: la pantalla debe pedir que se reintente en unos segundos.
 */
export async function prepararEscanerQR(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;

  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return true;

  // Si ya se está descargando, el plugin lo rechaza: da igual, hay que esperar.
  await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => undefined);
  return false;
}

export const MENSAJE_ESCANER_DESCARGANDO =
  'Descargando el escáner de QR de Google. Vuelva a intentarlo en unos segundos.';
