import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalisisCilindro,
  DetectorCilindrosService,
  ErrorDetector,
  candidatosAlternativos,
  mensajeRevision,
  seriePropuesta,
} from './detector-cilindros';

function analisis(parcial: Partial<AnalisisCilindro> = {}): AnalisisCilindro {
  return {
    success: true,
    request_id: 'req-1',
    model_version: 'detector:onnx|ocr:rapid|parser:1.0.0',
    processing_time_ms: 650,
    requires_manual_confirmation: true,
    review_reasons: ['confirmation_required'],
    data: {
      numero_serie: { value: '195206055', confidence: 0.82, source: 'ai' },
      tipo_gas: { value: 'CO2', confidence: null, source: 'catalog' },
      marca: { value: 'JP5', confidence: null, source: 'catalog' },
    },
    match: {
      status: 'matched',
      resolved_serial: '19S206055',
      candidates: [
        { numero_serie: '19S206055', distance: 0, score: 0.9 },
        { numero_serie: '19S206054', distance: 1, score: 0.8 },
      ],
    },
    warnings: [],
    ...parcial,
  };
}

const foto = () => new Blob(['jpeg'], { type: 'image/jpeg' });

describe('seriePropuesta', () => {
  it('prefiere la serie resuelta contra el inventario a la lectura cruda', () => {
    // El OCR leyó "195206055" (S como 5); el catálogo lo corrigió.
    expect(seriePropuesta(analisis())).toBe('19S206055');
  });

  it('usa la lectura cruda si no hubo resolución', () => {
    const a = analisis({ match: { status: 'not_found', resolved_serial: null, candidates: [] } });
    expect(seriePropuesta(a)).toBe('195206055');
  });

  it('devuelve cadena vacía si no se leyó nada', () => {
    const a = analisis({
      data: { ...analisis().data, numero_serie: { value: null, confidence: null, source: 'unknown' } },
      match: { status: 'not_attempted', resolved_serial: null, candidates: [] },
    });
    expect(seriePropuesta(a)).toBe('');
  });
});

describe('mensajeRevision', () => {
  it('prioriza el problema más útil para el operario', () => {
    const a = analisis({ review_reasons: ['confirmation_required', 'no_serial_detected'] });
    expect(mensajeRevision(a)).toContain('Acérquese al collarín');
  });

  it('pide confirmar cuando la política lo exige', () => {
    expect(mensajeRevision(analisis())).toBe('Confirme que el número es correcto.');
  });

  it('avisa del serial duplicado en el inventario', () => {
    const a = analisis({ review_reasons: ['duplicate_serial_in_catalog', 'confirmation_required'] });
    expect(mensajeRevision(a)).toContain('más de un cilindro');
  });

  it('tiene un mensaje por defecto para motivos desconocidos', () => {
    const a = analisis({ review_reasons: ['motivo_nuevo_del_servicio'] });
    expect(mensajeRevision(a)).toBe('Confirme que el número es correcto.');
  });
});

describe('candidatosAlternativos', () => {
  it('no repite la serie propuesta', () => {
    expect(candidatosAlternativos(analisis())).toEqual(['19S206054']);
  });

  it('muestra como mucho cuatro alternativas', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      numero_serie: `A${i}`, distance: 1, score: 0.5,
    }));
    const a = analisis({ match: { status: 'ambiguous', resolved_serial: null, candidates } });
    expect(candidatosAlternativos(a)).toHaveLength(4);
  });
});

describe('DetectorCilindrosService.analizar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía la foto como multipart y devuelve el análisis', async () => {
    const respuesta = analisis();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(respuesta), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await new DetectorCilindrosService().analizar(foto());

    expect(resultado.match.resolved_serial).toBe('19S206055');
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/cylinders/analyze');
    expect(opciones.method).toBe('POST');
    expect(opciones.body).toBeInstanceOf(FormData);
    expect((opciones.body as FormData).get('image')).toBeInstanceOf(Blob);
    // El identificador de petición permite seguir una incidencia de punta a punta.
    expect(opciones.headers['X-Request-ID']).toMatch(/^app-/);
  });

  it('traduce un fallo de red a un mensaje para el operario', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(new DetectorCilindrosService().analizar(foto())).rejects.toMatchObject({
      codigo: 'red',
      message: expect.stringContaining('introduzca el número a mano'),
    });
  });

  it('traduce los errores del servicio usando su código estable', async () => {
    const cuerpo = { success: false, error: { code: 'image_too_large', message: 'x' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(cuerpo), { status: 413 })
    ));

    const error = await new DetectorCilindrosService().analizar(foto()).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDetector);
    expect(error.codigo).toBe('image_too_large');
    expect(error.message).toBe('La foto es demasiado grande. Tómela de nuevo.');
  });

  it('un error 5xx sin cuerpo JSON no rompe la app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));

    const error = await new DetectorCilindrosService().analizar(foto()).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDetector);
    expect(error.message).toContain('Introduzca el número a mano');
  });
});

describe('DetectorCilindrosService.disponible', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('es false si el servicio no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await new DetectorCilindrosService().disponible()).toBe(false);
  });

  it('es true si /health responde bien', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    expect(await new DetectorCilindrosService().disponible()).toBe(true);
  });
});
