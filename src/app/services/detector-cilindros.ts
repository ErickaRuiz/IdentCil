import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { environment } from '../../environments/environment';

/**
 * Cliente del microservicio de IA que identifica un cilindro a partir de una
 * fotografía del troquelado de su collarín.
 *
 * Reparto de responsabilidades:
 *
 *   Microservicio : "¿qué número de serie veo en esta foto?"
 *   Esta app      : "¿es correcto? ¿qué hago con ese cilindro?"
 *
 * El servicio SIEMPRE devuelve `requires_manual_confirmation = true`: la
 * calibración con datos reales concluyó que no hay un umbral de confianza que
 * permita aceptar una lectura sin revisarla. Por eso la app no registra nunca
 * un número leído por la IA sin que el operario lo confirme.
 */

// --- Contrato del microservicio (POST /api/v1/cylinders/analyze) -----------

export type FuenteDato = 'ai' | 'catalog' | 'backend' | 'manual' | 'unknown';

export interface ValorTrazado<T> {
  value: T | null;
  confidence: number | null;
  source: FuenteDato;
  raw?: string | null;
}

export interface CandidatoCatalogo {
  numero_serie: string;
  distance: number;
  score: number;
}

export type EstadoResolucion =
  | 'matched'
  | 'ambiguous'
  | 'not_found'
  | 'no_catalog'
  | 'not_attempted';

export interface AnalisisCilindro {
  success: boolean;
  request_id: string;
  model_version: string;
  processing_time_ms: number;
  requires_manual_confirmation: boolean;
  review_reasons: string[];
  data: {
    numero_serie: ValorTrazado<string>;
    tipo_gas: ValorTrazado<string>;
    marca: ValorTrazado<string>;
    [campo: string]: ValorTrazado<any>;
  };
  match: {
    status: EstadoResolucion;
    resolved_serial: string | null;
    candidates: CandidatoCatalogo[];
  };
  warnings: string[];
}

/** Traza que se guarda junto al movimiento cuando la serie vino de una foto. */
export interface TrazaIA {
  request_id: string;
  model_version: string;
  serie_propuesta: string | null;
  confianza: number | null;
  /** true si el operario cambió el número que propuso la IA. */
  corregido: boolean;
}

/** Error con un mensaje ya pensado para mostrárselo al operario. */
export class ErrorDetector extends Error {
  constructor(message: string, readonly codigo: string) {
    super(message);
    this.name = 'ErrorDetector';
  }
}

// Mensajes para el operario por cada motivo de revisión. Se ordenan de más a
// menos útil: se muestra el primero que aplique.
const MENSAJES_REVISION: Array<[string, string]> = [
  ['no_serial_detected', 'No se distingue el número. Acérquese al collarín y repita la foto.'],
  ['poor_image_quality', 'La foto está movida u oscura. Repítala con más luz, sin flash de frente.'],
  ['duplicate_serial_in_catalog', 'Ese número está registrado en más de un cilindro: verifique cuál es.'],
  ['serial_too_short', 'El número grabado es muy corto y puede confundirse con otro. Verifíquelo.'],
  ['ambiguous_catalog_match', 'La lectura se parece a varios cilindros. Elija el correcto.'],
  ['serial_not_in_catalog', 'No coincide con ningún cilindro conocido. Revise el número.'],
  ['serial_format_invalid', 'El número leído no tiene un formato válido. Revíselo.'],
  ['low_ocr_confidence', 'Lectura poco clara. Confirme el número.'],
  ['confirmation_required', 'Confirme que el número es correcto.'],
];

/** Tiempo máximo de espera. Con red móvil y fotos de varios MB conviene holgura. */
const TIEMPO_MAXIMO_MS = 30_000;

/** Lado mayor de la foto que se envía. El servicio trabaja a 2048 px. */
const LADO_MAXIMO_PX = 2048;

@Injectable({ providedIn: 'root' })
export class DetectorCilindrosService {
  private readonly baseUrl = String(environment.aiServiceUrl || '').replace(/\/+$/, '');

  /** Abre la cámara (o la galería) y devuelve la foto lista para enviar. */
  async capturarFoto(): Promise<{ blob: Blob; vistaPrevia: string } | null> {
    try {
      const foto = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        // Prompt deja elegir entre cámara y galería: útil para probar con
        // fotos ya tomadas del dataset.
        source: CameraSource.Prompt,
        quality: 85,
        width: LADO_MAXIMO_PX,
        height: LADO_MAXIMO_PX,
        correctOrientation: true,
        // En el navegador usa un selector de archivo, sin dependencias extra.
        webUseInput: true,
        promptLabelHeader: 'Foto del collarín',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelPicture: 'Tomar foto',
        promptLabelCancel: 'Cancelar',
      });
      if (!foto.webPath) return null;

      const blob = await (await fetch(foto.webPath)).blob();
      return { blob, vistaPrevia: foto.webPath };
    } catch (err: any) {
      // Cerrar la cámara sin hacer foto no es un error.
      const texto = String(err?.message || err || '').toLowerCase();
      if (texto.includes('cancel')) return null;
      throw new ErrorDetector(`No se pudo abrir la cámara: ${err?.message || err}`, 'camara');
    }
  }

  /** Envía la foto al microservicio y devuelve su análisis. */
  async analizar(foto: Blob): Promise<AnalisisCilindro> {
    if (!this.baseUrl) {
      throw new ErrorDetector('No está configurada la dirección del servicio de IA.', 'configuracion');
    }

    const formulario = new FormData();
    formulario.append('image', foto, nombreArchivo(foto));

    const cancelador = new AbortController();
    const temporizador = setTimeout(() => cancelador.abort(), TIEMPO_MAXIMO_MS);

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.baseUrl}/api/v1/cylinders/analyze`, {
        method: 'POST',
        body: formulario,
        headers: { 'X-Request-ID': idPeticion() },
        signal: cancelador.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new ErrorDetector('El servicio de IA tardó demasiado en responder. Inténtelo de nuevo.', 'timeout');
      }
      throw new ErrorDetector(
        'No se pudo conectar con el servicio de IA. Compruebe la conexión o introduzca el número a mano.',
        'red'
      );
    } finally {
      clearTimeout(temporizador);
    }

    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const codigo = cuerpo?.error?.code || `http_${respuesta.status}`;
      throw new ErrorDetector(mensajeDeError(codigo, respuesta.status), codigo);
    }
    return cuerpo as AnalisisCilindro;
  }

  /** Comprueba si el servicio responde. Útil para avisar antes de abrir la cámara. */
  async disponible(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const cancelador = new AbortController();
      const temporizador = setTimeout(() => cancelador.abort(), 4000);
      const respuesta = await fetch(`${this.baseUrl}/api/v1/health`, { signal: cancelador.signal });
      clearTimeout(temporizador);
      return respuesta.ok;
    } catch {
      return false;
    }
  }
}

/** Serie que conviene proponer al operario: la resuelta contra el inventario, si la hay. */
export function seriePropuesta(analisis: AnalisisCilindro): string {
  return analisis.match.resolved_serial || analisis.data.numero_serie.value || '';
}

/** Mensaje principal para el operario según los motivos de revisión. */
export function mensajeRevision(analisis: AnalisisCilindro): string {
  const motivos = new Set(analisis.review_reasons || []);
  const encontrado = MENSAJES_REVISION.find(([motivo]) => motivos.has(motivo));
  return encontrado ? encontrado[1] : 'Confirme que el número es correcto.';
}

/** Candidatos alternativos del inventario, sin repetir el propuesto. */
export function candidatosAlternativos(analisis: AnalisisCilindro): string[] {
  const propuesta = seriePropuesta(analisis);
  return (analisis.match.candidates || [])
    .map((c) => c.numero_serie)
    .filter((serie, i, lista) => serie && serie !== propuesta && lista.indexOf(serie) === i)
    .slice(0, 4);
}

function mensajeDeError(codigo: string, estado: number): string {
  switch (codigo) {
    case 'image_too_large':
      return 'La foto es demasiado grande. Tómela de nuevo.';
    case 'unsupported_media_type':
      return 'El archivo no es una imagen válida (JPEG, PNG o WEBP).';
    case 'invalid_image':
      return 'No se pudo leer la imagen. Tómela de nuevo.';
    default:
      return estado >= 500
        ? 'El servicio de IA tuvo un problema. Introduzca el número a mano.'
        : `El servicio de IA rechazó la foto (${codigo}).`;
  }
}

function nombreArchivo(foto: Blob): string {
  const tipo = foto.type || 'image/jpeg';
  const extension = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : 'jpg';
  return `cilindro.${extension}`;
}

function idPeticion(): string {
  const aleatorio = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `app-${aleatorio.replace(/-/g, '').slice(0, 16)}`;
}
