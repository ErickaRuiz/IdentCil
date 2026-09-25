/**
 * CICLO DE VIDA DE UN CILINDRO  (se repite todas las veces que haga falta)
 *
 *   INGRESO ──► DENTRO ──► SALIDA ──► FUERA ──► RECOJO ──► DENTRO ──► SALIDA ...
 *
 * El estado NO se guarda en la tabla `cilindros`: se calcula leyendo los
 * historiales que ya existen (ingreso_cilindros, salida_cilindros, recojos).
 * El ÚLTIMO movimiento de la serie decide dónde está:
 *
 *   último = INGRESO o RECOJO  -> DENTRO  (está en planta)
 *   último = SALIDA            -> FUERA   (salió y aún no se recoge)
 *   sin movimientos            -> NUEVO   (todavía no ha tenido ninguno)
 *
 * Lo único que se bloquea son los pasos DUPLICADOS:
 *   - Ingreso : NO si ya está DENTRO.
 *   - Salida  : NO si ya está FUERA.
 *   - Recojo  : SOLO si está FUERA.
 * Nunca se bloquea por "ya tuvo un ingreso / una salida" en el pasado.
 */

export type Ubicacion = 'NUEVO' | 'DENTRO' | 'FUERA';
export type TipoMovimiento = 'INGRESO' | 'SALIDA' | 'RECOJO';

export interface EstadoCilindro {
  serie: string;
  ubicacion: Ubicacion;
  movimiento: TipoMovimiento | null;   // último movimiento
  fecha: string | null;                // fecha de ese movimiento
  ms: number;                          // fecha en milisegundos (para ordenar)
  almacenId: number | null;            // DENTRO: dónde está | FUERA: almacén del que salió
  almacenDestinoId: number | null;     // FUERA: almacén al que se transfirió (si aplica)
  clienteId: number | null;            // FUERA: cliente / empresa que se lo llevó (si aplica)
  destino: string;                     // FUERA: texto de a dónde fue
  estadoRegistro: string;              // estado con el que se despachó (LLENO, VACIO...)
  observacion: string;                 // observación de la salida
}

const LIMITE_FILAS = 1000;

/** Serie normalizada para comparar (sin espacios y en mayúsculas). */
export function normalizarSerie(serie: any): string {
  return String(serie ?? '').trim().toUpperCase();
}

/** true si el cilindro ya está ingresado y dentro de planta. */
export function estaDentro(e?: EstadoCilindro | null): boolean {
  return e?.ubicacion === 'DENTRO';
}

/** true si el cilindro salió y todavía no ha sido recogido. */
export function haSalido(e?: EstadoCilindro | null): boolean {
  return e?.ubicacion === 'FUERA';
}

function estadoNuevo(serie: string): EstadoCilindro {
  return {
    serie,
    ubicacion: 'NUEVO',
    movimiento: null,
    fecha: null,
    ms: 0,
    almacenId: null,
    almacenDestinoId: null,
    clienteId: null,
    destino: '',
    estadoRegistro: '',
    observacion: ''
  };
}

function comoLista(valor: any): any[] {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function serieDe(c: any): string {
  return normalizarSerie(c?.numero_serie ?? c?.numeroSerie ?? c?.serie ?? (typeof c === 'string' ? c : ''));
}

/**
 * Lee los tres historiales y devuelve, para CADA serie, su último movimiento.
 * Lanza error si no se pueden leer ingresos o salidas (para no dejar pasar un
 * duplicado en silencio). Si falla `recojos` no pasa nada: cada recojo también
 * deja un registro de reingreso en ingreso_cilindros.
 */
export async function cargarEstados(supabase: any): Promise<Map<string, EstadoCilindro>> {
  const mapa = new Map<string, EstadoCilindro>();

  const poner = (est: EstadoCilindro) => {
    if (!est.serie || isNaN(est.ms)) return;
    const previo = mapa.get(est.serie);
    if (!previo || est.ms >= previo.ms) mapa.set(est.serie, est);
  };

  const [ing, sal, rec] = await Promise.all([
    supabase
      .from('ingreso_cilindros')
      .select('created_at, almacen_id, cilindros_ingresados')
      .order('created_at', { ascending: false })
      .limit(LIMITE_FILAS),
    supabase
      .from('salida_cilindros')
      .select('created_at, cliente_id, almacen_id, almacen_destino_id, estado, observacion, cilindros_egresados')
      .order('created_at', { ascending: false })
      .limit(LIMITE_FILAS),
    supabase
      .from('recojos')
      .select('codigo_qr, fecha_recojo, almacen_destino_id')
      .order('fecha_recojo', { ascending: false })
      .limit(LIMITE_FILAS)
  ]);

  if (ing.error) throw ing.error;
  if (sal.error) throw sal.error;
  if (rec.error) console.warn('No se pudo leer la tabla recojos:', rec.error);

  // INGRESOS -> DENTRO
  (ing.data || []).forEach((fila: any) => {
    const ms = Date.parse(fila.created_at);
    comoLista(fila.cilindros_ingresados).forEach((c: any) => {
      poner({
        ...estadoNuevo(serieDe(c)),
        ubicacion: 'DENTRO',
        movimiento: 'INGRESO',
        fecha: fila.created_at,
        ms,
        almacenId: fila.almacen_id ?? null
      });
    });
  });

  // SALIDAS -> FUERA
  (sal.data || []).forEach((fila: any) => {
    const ms = Date.parse(fila.created_at);
    comoLista(fila.cilindros_egresados).forEach((c: any) => {
      poner({
        ...estadoNuevo(serieDe(c)),
        ubicacion: 'FUERA',
        movimiento: 'SALIDA',
        fecha: fila.created_at,
        ms,
        almacenId: c?.origen_almacen_id ?? fila.almacen_id ?? null,
        almacenDestinoId: fila.almacen_destino_id ?? null,
        clienteId: fila.cliente_id ?? null,
        destino: String(c?.destino || '').trim(),
        estadoRegistro: fila.estado || '',
        observacion: fila.observacion || ''
      });
    });
  });

  // RECOJOS -> DENTRO
  (rec.data || []).forEach((fila: any) => {
    poner({
      ...estadoNuevo(normalizarSerie(fila.codigo_qr)),
      ubicacion: 'DENTRO',
      movimiento: 'RECOJO',
      fecha: fila.fecha_recojo,
      ms: Date.parse(fila.fecha_recojo),
      almacenId: fila.almacen_destino_id ?? null
    });
  });

  return mapa;
}

/** Estado actual de UNA serie (NUEVO si nunca ha tenido movimientos). */
export async function obtenerEstado(supabase: any, serie: any): Promise<EstadoCilindro> {
  const s = normalizarSerie(serie);
  const mapa = await cargarEstados(supabase);
  return mapa.get(s) ?? estadoNuevo(s);
}