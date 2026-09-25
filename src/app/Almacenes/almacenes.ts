import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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

  constructor(
    private supabaseService: SupabaseService,
    private navCtrl: NavController,
    private cdRef: ChangeDetectorRef
  ) {
    addIcons({ arrowBackOutline, addCircleOutline, listOutline, businessOutline, locationOutline, createOutline, trashOutline, archiveOutline, cubeOutline, flaskOutline, chevronForwardOutline, closeOutline, searchOutline });
  }

 ngOnInit() {}

  regresar() {
    this.navCtrl.back();
  }

  async abrirModalAlmacenes() {
    this.modalAbierto = true;
    await this.obtenerAlmacenes();
  }

  async obtenerAlmacenes() {
    this.cargandoLista = true;
    this.cdRef.detectChanges();

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

      await this.calcularCantidadPorAlmacen();
    } catch (err) {
      console.error('Error de red al cargar:', err);
    } finally {
      this.cargandoLista = false;
      this.cdRef.detectChanges();
    }
  }

  /**
   * Cuenta, para cada almacén, cuántos cilindros están DENTRO ahora mismo
   * (su último movimiento en los historiales de ingreso/salida/recojo los
   * deja en ese almacén). No cuenta los que salieron y aún no se recogen.
   */
  async calcularCantidadPorAlmacen() {
    try {
      const estados = await cargarEstados(this.supabaseService.supabase);
      const conteo: { [id: number]: number } = {};

      estados.forEach((e: EstadoCilindro) => {
        if (estaDentro(e) && e.almacenId) {
          conteo[e.almacenId] = (conteo[e.almacenId] || 0) + 1;
        }
      });

      this.cantidadPorAlmacen = conteo;
    } catch (err) {
      console.error('Error al calcular cilindros por almacén:', err);
    }
  }

  /**
   * Abre el modal con el detalle completo (marca, año, medidas, PH,
   * propietario, etc.) de cada cilindro que está DENTRO de este almacén.
   */
  async verCilindrosDeAlmacen(almacen: any) {
    this.almacenSeleccionado = almacen;
    this.filtroCilindroAlmacen = '';
    this.modalAbierto = false;
    this.modalCilindrosAbierto = true;
    this.cargandoCilindros = true;
    this.cilindrosDelAlmacen = [];
    this.cilindrosDelAlmacenFiltrados = [];
    this.cdRef.detectChanges();

    try {
      const estados = await cargarEstados(this.supabaseService.supabase);
      const series = Array.from(estados.values())
        .filter((e: EstadoCilindro) => estaDentro(e) && e.almacenId === almacen.id)
        .map((e: EstadoCilindro) => e.serie);

      if (series.length === 0) {
        this.cilindrosDelAlmacen = [];
      } else {
        const { data, error } = await this.supabaseService.supabase
          .from('cilindros')
          .select(`
            *,
            clientes (
              nombre_razon_social,
              tipo_documento,
              num_documento
            )
          `)
          .in('numero_serie', series);

        if (error) {
          console.error('Error al cargar los cilindros del almacén:', error);
          this.cilindrosDelAlmacen = [];
        } else {
          this.cilindrosDelAlmacen = (data || [])
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
      }
    } catch (err) {
      console.error('Error inesperado al cargar los cilindros del almacén:', err);
      this.cilindrosDelAlmacen = [];
    } finally {
      this.filtrarCilindrosDelAlmacen();
      this.cargandoCilindros = false;
      this.cdRef.detectChanges();
    }
  }

  cerrarModalCilindros() {
    this.modalCilindrosAbierto = false;
    this.almacenSeleccionado = null;
    this.cilindrosDelAlmacen = [];
    this.cilindrosDelAlmacenFiltrados = [];
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

    if (valor.includes('OXIGENO')) return 'gas-oxigeno';
    if (valor.includes('ACETILENO')) return 'gas-acetileno';
    if (valor.includes('ARGON')) return 'gas-argon';
    if (valor.includes('NITROGENO')) return 'gas-nitrogeno';
    if (valor.includes('DIOXIDO') || valor === 'CO2') return 'gas-co2';
    if (valor.includes('MEZCLA')) return 'gas-mezcla';

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