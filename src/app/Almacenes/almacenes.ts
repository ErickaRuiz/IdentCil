import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular';

import { SupabaseService } from '../services/supabase';
import { cargarEstados, estaDentro, normalizarSerie, EstadoCilindro } from '../services/cilindro-estado';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSpinner,
  IonModal,
  IonSearchbar
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, addCircleOutline, trashOutline, listOutline, businessOutline, locationOutline, archiveOutline, createOutline, cubeOutline, flaskOutline, chevronForwardOutline, closeOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-almacenes',
  templateUrl: './almacenes.html',
  styleUrls: ['./almacenes.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonSpinner,
    IonModal,
    IonSearchbar
  ]
})
export class AlmacenesPage implements OnInit {

  nuevoAlmacen = {
    nombre: '',
    ubicacion: ''
  };

  listaAlmacenes: any[] = [];
  cargando: boolean = false;
  cargandoLista: boolean = false;
  modalAbierto: boolean = false;
  almacenEditandoId: number | null = null;

  // Cuántos cilindros hay AHORA MISMO en cada almacén (id -> cantidad),
  // calculado desde el ciclo Ingreso/Salida/Recojo (igual que en las demás
  // páginas): un cilindro cuenta aquí solo si su último movimiento lo deja
  // DENTRO de planta y en ese almacén.
  cantidadPorAlmacen: { [id: number]: number } = {};

  // --- Modal: detalle completo de los cilindros de un almacén ---
  modalCilindrosAbierto: boolean = false;
  almacenSeleccionado: any = null;
  cargandoCilindros: boolean = false;
  cilindrosDelAlmacen: any[] = [];
  cilindrosDelAlmacenFiltrados: any[] = [];
  filtroCilindroAlmacen: string = '';

  // --- Modal: detalle de UN cilindro ---
  modalDetalleAbierto: boolean = false;
  cilindroDetalle: any = null;

  // --- Caché para que la lista cargue rápido ---
  private readonly TTL_ESTADOS_MS = 30000;
  private estadosCache: Awaited<ReturnType<typeof cargarEstados>> | null = null;
  private estadosCacheTs = 0;
  private estadosPromesa: Promise<Awaited<ReturnType<typeof cargarEstados>>> | null = null;
  private cacheCilindrosPorAlmacen: { [id: number]: any[] } = {};

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({ arrowBackOutline, addCircleOutline, listOutline, businessOutline, locationOutline, createOutline, trashOutline, archiveOutline, cubeOutline, flaskOutline, chevronForwardOutline, closeOutline, searchOutline });
  }


  ngOnInit() {
    // Precarga en segundo plano: cuando toques "Ver Lista" ya estará listo
    this.obtenerAlmacenes(true);
  }

  regresar() {
    this.navCtrl.back();
  }

  trackPorId(_: number, item: any) {
    return item.id;
  }

  trackPorSerie(_: number, item: any) {
    return item.numeroSerie;
  }

  /**
   * Devuelve los estados de los cilindros. Reutiliza el resultado reciente
   * (30 s) y evita lanzar dos cargas iguales al mismo tiempo.
   */
  private async obtenerEstados(forzar = false) {
    const vigente = this.estadosCache && (Date.now() - this.estadosCacheTs) < this.TTL_ESTADOS_MS;
    if (vigente && !forzar) return this.estadosCache!;

    if (this.estadosPromesa) return this.estadosPromesa;

    this.estadosPromesa = cargarEstados(this.supabaseService.supabase)
      .then(estados => {
        this.estadosCache = estados;
        this.estadosCacheTs = Date.now();
        return estados;
      })
      .finally(() => {
        this.estadosPromesa = null;
      });

    return this.estadosPromesa;
  }

  async abrirModalAlmacenes() {
    this.modalAbierto = true;
    this.cdRef.detectChanges();
    // Si ya hay lista, se muestra al instante y se actualiza en segundo plano
    await this.obtenerAlmacenes(this.listaAlmacenes.length > 0);
  }

  async obtenerAlmacenes(silencioso = false) {
    if (!silencioso) {
      this.cargandoLista = true;
      this.cdRef.detectChanges();
    }

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('almacenes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al cargar almacenes:', error.message);
      } else if (data) {
        this.listaAlmacenes = data;
      }
    } catch (err) {
      console.error('Error de red al cargar:', err);
    } finally {
      // La lista ya se puede ver; las cantidades se calculan aparte
      this.cargandoLista = false;
      this.cdRef.detectChanges();
    }

    await this.calcularCantidadPorAlmacen();
  }

  /**
   * Cuenta, para cada almacén, cuántos cilindros están DENTRO ahora mismo
   * (su último movimiento en los historiales de ingreso/salida/recojo los
   * deja en ese almacén). No cuenta los que salieron y aún no se recogen.
   */
  async calcularCantidadPorAlmacen() {
    try {
      const estados = await this.obtenerEstados();
      const conteo: { [id: number]: number } = {};

      estados.forEach((e: EstadoCilindro) => {
        if (estaDentro(e) && e.almacenId) {
          conteo[e.almacenId] = (conteo[e.almacenId] || 0) + 1;
        }
      });

      this.cantidadPorAlmacen = conteo;
      this.cdRef.detectChanges();
    } catch (err) {
      console.error('Error al calcular cilindros por almacén:', err);
    }
  }

  /**
   * Abre la lista de series de los cilindros DENTRO de este almacén.
   * Si ya se cargó antes, se muestra al instante y se actualiza en segundo plano.
   */
  async verCilindrosDeAlmacen(almacen: any) {
    this.almacenSeleccionado = almacen;
    this.filtroCilindroAlmacen = '';
    this.modalAbierto = false;
    this.modalCilindrosAbierto = true;

    const enCache = this.cacheCilindrosPorAlmacen[almacen.id];
    if (enCache) {
      this.cilindrosDelAlmacen = enCache;
      this.cargandoCilindros = false;
      this.filtrarCilindrosDelAlmacen();
      this.cdRef.detectChanges();
      await this.cargarCilindrosDeAlmacen(almacen, true);
    } else {
      this.cargandoCilindros = true;
      this.cilindrosDelAlmacen = [];
      this.cilindrosDelAlmacenFiltrados = [];
      this.cdRef.detectChanges();
      await this.cargarCilindrosDeAlmacen(almacen, false);
    }
  }

  private async cargarCilindrosDeAlmacen(almacen: any, refrescando: boolean) {
    try {
      const estados = await this.obtenerEstados(refrescando);
      const series = Array.from(estados.values())
        .filter((e: EstadoCilindro) => estaDentro(e) && e.almacenId === almacen.id)
        .map((e: EstadoCilindro) => e.serie);

      let lista: any[] = [];

      if (series.length > 0) {
        // Consultas en paralelo por tandas, para que no se arme una URL gigante
        const tandas: string[][] = [];
        for (let i = 0; i < series.length; i += 150) {
          tandas.push(series.slice(i, i + 150));
        }

        const resultados = await Promise.all(
          tandas.map(tanda =>
            this.supabaseService.supabase
              .from('cilindros')
              .select(`
                numero_serie, tipo_gas, marca, anio_fabricacion, unidad_medida,
                peso, ancho_diametro, largo_altura, litros, contenido, color, ph,
                procedencia,
                clientes ( nombre_razon_social, tipo_documento, num_documento )
              `)
              .in('numero_serie', tanda)
          )
        );

        for (const r of resultados) {
          if (r.error) {
            console.error('Error al cargar los cilindros del almacén:', r.error);
            continue;
          }
          lista = lista.concat(r.data || []);
        }

        lista = lista
          .map((c: any) => ({
            numeroSerie: c.numero_serie,
            tipoGas: c.tipo_gas || 'NO ESPECIFICADO',
            marca: c.marca,
            anioFabricacion: c.anio_fabricacion,
            unidadMedida: c.unidad_medida,
            peso: c.peso,
            anchoDiametro: c.ancho_diametro,
            largoAltura: c.largo_altura,
            litros: c.litros,
            contenido: c.contenido,
            color: c.color,
            ph: c.ph,
            procedencia: c.procedencia,
            propietarioNombre: c.clientes?.nombre_razon_social || 'SIN PROPIETARIO',
            propietarioDocTipo: c.clientes?.tipo_documento || 'DOC',
            propietarioDocNum: c.clientes?.num_documento || '-'
          }))
          .sort((a: any, b: any) => normalizarSerie(a.numeroSerie).localeCompare(normalizarSerie(b.numeroSerie)));
      }

      this.cacheCilindrosPorAlmacen[almacen.id] = lista;

      // Solo se pinta si el usuario sigue viendo este mismo almacén
      if (this.almacenSeleccionado?.id === almacen.id) {
        this.cilindrosDelAlmacen = lista;
        this.filtrarCilindrosDelAlmacen();
      }
    } catch (err) {
      console.error('Error inesperado al cargar los cilindros del almacén:', err);
      if (!refrescando && this.almacenSeleccionado?.id === almacen.id) {
        this.cilindrosDelAlmacen = [];
        this.filtrarCilindrosDelAlmacen();
      }
    } finally {
      if (this.almacenSeleccionado?.id === almacen.id) {
        this.cargandoCilindros = false;
      }
      this.cdRef.detectChanges();
    }
  }

  cerrarModalCilindros() {
    this.modalCilindrosAbierto = false;
    this.almacenSeleccionado = null;
    this.cilindrosDelAlmacen = [];
    this.cilindrosDelAlmacenFiltrados = [];
  }

  // --- Detalle de un cilindro (al tocar su número de serie) ---
  verDetalleCilindro(cilindro: any) {
    this.cilindroDetalle = cilindro;
    this.modalDetalleAbierto = true;
  }

  cerrarDetalleCilindro() {
    this.modalDetalleAbierto = false;
    this.cilindroDetalle = null;
  }

  filtrarCilindrosDelAlmacen(event?: any) {
    if (event) {
      this.filtroCilindroAlmacen = (event.detail?.value || '').toString();
    }

    const termino = this.filtroCilindroAlmacen.toLowerCase().trim();

    if (!termino) {
      this.cilindrosDelAlmacenFiltrados = [...this.cilindrosDelAlmacen];
      return;
    }

    this.cilindrosDelAlmacenFiltrados = this.cilindrosDelAlmacen.filter((c: any) => {
      const serie = String(c.numeroSerie || '').toLowerCase();
      const gas = String(c.tipoGas || '').toLowerCase();
      const propietario = String(c.propietarioNombre || '').toLowerCase();
      return serie.includes(termino) || gas.includes(termino) || propietario.includes(termino);
    });
  }

  /**
   * Devuelve la clase de color según el tipo de gas, sin depender de que el
   * texto venga EXACTAMENTE igual (tildes, mayúsculas o espacios de más).
   */
  obtenerClaseGas(tipoGas: string | null | undefined): string {
    if (!tipoGas) return '';

    const valor = tipoGas
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

    // Las mezclas (Stargold / Estargold / Estargor) van primero para que
    // no se confundan con "ARGON" cuando el nombre lo contiene.
    if (valor.includes('STARGOLD') || valor.includes('STARGOR') || valor.includes('MEZCLA')) return 'gas-mezcla';
    if (valor.includes('OXIGENO')) return 'gas-oxigeno';
    if (valor.includes('ACETILENO')) return 'gas-acetileno';
    if (valor.includes('ARGON')) return 'gas-argon';
    if (valor.includes('NITROGENO')) return 'gas-nitrogeno';
    if (valor.includes('DIOXIDO') || valor === 'CO2' || valor.includes('CO2')) return 'gas-co2';

    return '';
  }

  prepararEdicion(almacen: any) {
    this.almacenEditandoId = almacen.id;
    this.nuevoAlmacen = {
      nombre: almacen.nombre,
      ubicacion: almacen.ubicacion || ''
    };
    this.modalAbierto = false;
    this.cdRef.detectChanges();
  }

  cancelarEdicion() {
    this.almacenEditandoId = null;
    this.nuevoAlmacen = { nombre: '', ubicacion: '' };
    this.cdRef.detectChanges();
  }

  async guardarAlmacen() {
    if (!this.nuevoAlmacen.nombre.trim()) {
      alert('Ingrese el nombre del almacén.');
      return;
    }

    this.cargando = true;
    this.cdRef.detectChanges();

    try {
      if (this.almacenEditandoId) {
        // Actualizar
        const { error } = await this.supabaseService.supabase
          .from('almacenes')
          .update({
            nombre: this.nuevoAlmacen.nombre.trim().toUpperCase(),
            ubicacion: this.nuevoAlmacen.ubicacion.trim()
          })
          .eq('id', this.almacenEditandoId);

        if (error) {
          alert('Error al actualizar almacén: ' + error.message);
        } else {
          alert('¡Almacén actualizado con éxito!');
          this.cancelarEdicion();
        }
      } else {
        // Insertar
        const { error } = await this.supabaseService.supabase
          .from('almacenes')
          .insert([{
            nombre: this.nuevoAlmacen.nombre.trim().toUpperCase(),
            ubicacion: this.nuevoAlmacen.ubicacion.trim()
          }]);

        if (error) {
          alert('Error al guardar almacén: ' + error.message);
        } else {
          alert('¡Almacén registrado con éxito!');
          this.nuevoAlmacen = { nombre: '', ubicacion: '' };
        }
      }
    } catch (err: any) {
      alert('Ocurrió un error inesperado: ' + err.message);
    } finally {
      this.cargando = false;
      this.cdRef.detectChanges();
    }
  }

  async eliminarAlmacen(id: number) {
    if (!confirm('¿Desea eliminar este almacén?')) return;

    const { error } = await this.supabaseService.supabase
      .from('almacenes')
      .delete()
      .eq('id', id);

    if (error) {
      alert('No se puede eliminar el almacén si tiene registros asociados.');
    } else {
      this.obtenerAlmacenes();
    }
  }
}