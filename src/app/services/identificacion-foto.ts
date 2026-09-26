import { Injectable } from '@angular/core';
import { AlertController, LoadingController, ModalController } from '@ionic/angular';
import {
  ConfirmarSerieComponent,
  ResultadoConfirmacion,
} from '../components/confirmar-serie/confirmar-serie.modal';
import {
  DetectorCilindrosService,
  ErrorDetector,
  TrazaIA,
  seriePropuesta,
} from './detector-cilindros';

export interface IdentificacionFoto {
  /** Número de serie confirmado por el operario. */
  serie: string;
  /** Datos de la lectura, para guardarlos junto al movimiento. */
  traza: TrazaIA;
}

const CLAVE_CONSEJO_VISTO = 'identcil.consejoFotoVisto';

/**
 * Flujo completo de "identificar un cilindro por foto", compartido por las
 * pantallas de ingreso, salida y recojo:
 *
 *   comprobar servicio -> consejo de encuadre -> foto -> análisis IA
 *   -> confirmación del operario (o repetir foto) -> serie confirmada
 *
 * Devuelve null si el operario cancela o si no se pudo completar; en ese caso
 * ya se le ha explicado el motivo y puede seguir con el QR o a mano.
 */
@Injectable({ providedIn: 'root' })
export class IdentificacionFotoService {
  constructor(
    private detector: DetectorCilindrosService,
    private modalCtrl: ModalController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController
  ) {}

  async identificar(): Promise<IdentificacionFoto | null> {
    if (!(await this.detector.disponible())) {
      await this.avisar(
        'Servicio de IA no disponible',
        'No se pudo conectar con el servicio que lee el número de serie. ' +
          'Puede escanear el código QR o escribir el número a mano.'
      );
      return null;
    }

    await this.mostrarConsejoSiHaceFalta();

    // Se repite mientras el operario pida otra foto.
    for (;;) {
      const foto = await this.capturar();
      if (!foto) return null;

      const analisis = await this.analizarConCarga(foto.blob);
      if (!analisis) return null;

      const modal = await this.modalCtrl.create({
        component: ConfirmarSerieComponent,
        componentProps: { analisis, vistaPrevia: foto.vistaPrevia },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ResultadoConfirmacion>();

      if (role === 'repetir') continue;
      if (role !== 'confirmar' || !data) return null;

      return {
        serie: data.serie,
        traza: {
          request_id: analisis.request_id,
          model_version: analisis.model_version,
          serie_propuesta: seriePropuesta(analisis) || null,
          confianza: analisis.data.numero_serie.confidence,
          corregido: data.corregido,
        },
      };
    }
  }

  private async capturar() {
    try {
      return await this.detector.capturarFoto();
    } catch (err) {
      await this.avisar('Cámara', mensaje(err));
      return null;
    }
  }

  private async analizarConCarga(foto: Blob) {
    const carga = await this.loadingCtrl.create({ message: 'Leyendo el número de serie…' });
    await carga.present();
    try {
      return await this.detector.analizar(foto);
    } catch (err) {
      await carga.dismiss();
      await this.avisar('No se pudo leer la foto', mensaje(err));
      return null;
    } finally {
      // dismiss() es idempotente: no falla si ya se cerró en el catch.
      await carga.dismiss().catch(() => undefined);
    }
  }

  /**
   * El encuadre decide el resultado: con la foto cerca del troquelado el
   * sistema acierta el 60%; de frente o de lejos, el 13%. Por eso se explica
   * antes de la primera foto.
   */
  private async mostrarConsejoSiHaceFalta() {
    if (leerPreferencia(CLAVE_CONSEJO_VISTO)) return;
    await this.avisar(
      'Cómo tomar la foto',
      'Acérquese al collarín hasta que el número grabado ocupe buena parte de la foto. ' +
        'Evite el flash de frente: si hay poca luz, ilumine desde un lado.'
    );
    guardarPreferencia(CLAVE_CONSEJO_VISTO);
  }

  private async avisar(titulo: string, texto: string) {
    const alerta = await this.alertCtrl.create({ header: titulo, message: texto, buttons: ['Entendido'] });
    await alerta.present();
    await alerta.onDidDismiss();
  }
}

function mensaje(err: unknown): string {
  if (err instanceof ErrorDetector) return err.message;
  return `Ocurrió un error inesperado: ${(err as any)?.message || err}`;
}

// El almacenamiento local puede no estar disponible (modo privado, webview
// restringido): el consejo simplemente se volverá a mostrar.
function leerPreferencia(clave: string): boolean {
  try {
    return localStorage.getItem(clave) === '1';
  } catch {
    return false;
  }
}

function guardarPreferencia(clave: string): void {
  try {
    localStorage.setItem(clave, '1');
  } catch {
    /* sin persistencia: no pasa nada */
  }
}
