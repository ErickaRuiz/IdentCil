import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavController, AlertController } from '@ionic/angular';
import { SupabaseService } from '../services/supabase';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonModal
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  searchOutline,
  flaskOutline,
  createOutline,
  trashOutline,
  closeOutline,
  imageOutline,
  documentTextOutline,
  alertCircleOutline,
  timeOutline,
  checkmarkCircleOutline,
  cubeOutline
} from 'ionicons/icons';

// Librerías de código de barras y PDF
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-ver-lista-cilindros',
  templateUrl: './verlistacilindros.html',
  styleUrls: ['./verlistacilindros.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    FormsModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonModal
  ]
})
export class VerListaCilindrosPage implements OnInit {

  filtroCilindro: string = '';
  listaCilindros: any[] = [];
  cilindrosFiltrados: any[] = [];

  isModalOpen: boolean = false;
  cilindroSeleccionado: any = null;

  // Resumen de cantidad de cilindros por tipo de gas (para el contador)
  resumenGases: { nombre: string; cantidad: number; clase: string }[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private navCtrl: NavController,
    private alertCtrl: AlertController,
    private router: Router
  ) {
    addIcons({
      arrowBackOutline,
      searchOutline,
      flaskOutline,
      createOutline,
      trashOutline,
      closeOutline,
      imageOutline,
      documentTextOutline,
      alertCircleOutline,
      timeOutline,
      checkmarkCircleOutline,
      cubeOutline
    });
  }

  ngOnInit() {
    this.obtenerCilindros();
  }

  ionViewWillEnter() {
    this.obtenerCilindros();
  }

  async obtenerCilindros() {
    try {
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
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error de Supabase:', error.message);
        const { data: dataSimple, error: errorSimple } = await this.supabaseService.supabase
          .from('cilindros')
          .select('*')
          .order('created_at', { ascending: false });

        if (!errorSimple && dataSimple) {
          this.procesarCilindros(dataSimple);
        }
        return;
      }

      if (data) {
        this.procesarCilindros(data);
      }
    } catch (err) {
      console.error('Error inesperado:', err);
    }
  }

  procesarCilindros(data: any[]) {
    this.listaCilindros = data.map((item: any) => ({
      id: item.id,
      cliente_id: item.cliente_id || item.clienteId,
      numeroSerie: item.numero_serie || item.numeroSerie || 'SIN SERIE',
      tipoGas: item.tipo_gas || item.tipoGas || 'NO ESPECIFICADO',
      marca: item.marca,
      anio_fabricacion: item.anio_fabricacion || item.anioFabricacion,
      m3: item.unidad_medida || item.m3 || item.unidadMedida || 'N/A',
      peso: item.peso,
      ancho_diametro: item.ancho_diametro || item.anchoDiametro,
      largo_altura: item.largo_altura || item.largoAltura,
      litros: item.litros,
      contenido: item.contenido,
      color: item.color,
      ph: item.ph,
      procedencia: item.procedencia,
      capacidad: item.capacidad,
      clienteNombre: item.clientes?.nombre_razon_social || 'SIN CLIENTE',
      clienteDocTipo: item.clientes?.tipo_documento || 'DOC',
      clienteDocNum: item.clientes?.num_documento || '-',
      phInfo: this.calcularPH(
        item.anio_fabricacion || item.anioFabricacion,
        item.ph
      )
    }));

    if (this.filtroCilindro) {
      this.filtrarCilindros({ detail: { value: this.filtroCilindro } });
    } else {
      this.cilindrosFiltrados = [...this.listaCilindros];
      this.actualizarResumenGases();
    }

    this.cdRef.detectChanges();
  }

  filtrarCilindros(event: any) {
    const termino = (event.detail.value || '').toLowerCase().trim();
    this.filtroCilindro = termino;

    if (!termino) {
      this.cilindrosFiltrados = [...this.listaCilindros];
      this.actualizarResumenGases();
      return;
    }

    this.cilindrosFiltrados = this.listaCilindros.filter(c => {
      const serie = (c.numeroSerie || '').toLowerCase();
      const gas = (c.tipoGas || '').toLowerCase();
      const cliente = (c.clienteNombre || '').toLowerCase();
      const doc = (c.clienteDocNum || '').toLowerCase();

      return serie.includes(termino) ||
             gas.includes(termino) ||
             cliente.includes(termino) ||
             doc.includes(termino);
    });

    this.actualizarResumenGases();
  }

  // Cuenta los cilindros mostrados agrupados por tipo de gas
  actualizarResumenGases() {
    const conteo = new Map<string, number>();

    for (const c of this.cilindrosFiltrados) {
      const gas = c.tipoGas || 'NO ESPECIFICADO';
      conteo.set(gas, (conteo.get(gas) || 0) + 1);
    }

    this.resumenGases = Array.from(conteo.entries())
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        clase: this.obtenerClaseGas(nombre)
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }

  obtenerClaseGas(tipoGas: string): string {
    if (!tipoGas) return '';
    const gas = tipoGas.toUpperCase();

    if (gas.includes('OXÍGENO') || gas.includes('OXIGENO')) return 'gas-oxigeno';
    if (gas.includes('ACETILENO')) return 'gas-acetileno';
    if (gas.includes('MEZCLA') || gas.includes('ESTARGOR') || gas.includes('ARGÓN') || gas.includes('ARGON')) return 'gas-estargor';
    if (gas.includes('NITRÓGENO') || gas.includes('NITROGENO')) return 'gas-nitrogeno';
    if (gas.includes('DIÓXIDO') || gas.includes('DIOXIDO') || gas.includes('CO2')) return 'gas-co2';

    return '';
  }

  verDetalleCilindro(item: any) {
    this.cilindroSeleccionado = item;
    this.isModalOpen = true;
  }

  cerrarDetalle() {
    this.isModalOpen = false;
    this.cilindroSeleccionado = null;
  }


  // ===================== PRUEBA HIDROSTÁTICA (PH) =====================

  // Calcula cuánto falta (o cuánto lleva vencida) la prueba hidrostática.
  // Usa el año de fabricación (ej. "08/2020") + los años del PH (ej. "CADA 10 AÑOS PH").
  // Si el PH no indica años, asume 10.
  calcularPH(anioFab: any, ph: any): {
    estado: 'vencida' | 'critica' | 'proxima' | 'vigente';
    texto: string;
    fechaVenc: string;
  } | null {
    if (!anioFab) return null;

    const txtFab = String(anioFab).trim();
    let mes = 1;
    let anio = 0;

    // Formatos aceptados: MM/YYYY, MM-YYYY, YYYY-MM, YYYY/MM, YYYY
    let m = txtFab.match(/^(\d{1,2})\s*[\/\-]\s*(\d{4})$/);
    if (m) {
      mes = parseInt(m[1], 10);
      anio = parseInt(m[2], 10);
    } else {
      m = txtFab.match(/^(\d{4})\s*[\/\-]\s*(\d{1,2})$/);
      if (m) {
        anio = parseInt(m[1], 10);
        mes = parseInt(m[2], 10);
      } else {
        m = txtFab.match(/^(\d{4})$/);
        if (m) anio = parseInt(m[1], 10);
      }
    }

    if (!anio || mes < 1 || mes > 12) return null;

    const matchAnios = String(ph || '').match(/(\d+)\s*A[ÑN]OS?/i);
    const aniosPH = matchAnios ? parseInt(matchAnios[1], 10) : 10;

    // Vence el último día del mes de fabricación + años del PH
    const venc = new Date(anio + aniosPH, mes, 0);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaVenc = `${String(venc.getMonth() + 1).padStart(2, '0')}/${venc.getFullYear()}`;
    const vencida = venc.getTime() < hoy.getTime();

    // Diferencia en años / meses / días
    const desde = vencida ? venc : hoy;
    const hasta = vencida ? hoy : venc;

    let meses = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
    if (hasta.getDate() < desde.getDate()) meses--;
    const ref = new Date(desde.getFullYear(), desde.getMonth() + meses, desde.getDate());
    const dias = Math.round((hasta.getTime() - ref.getTime()) / 86400000);

    const anios = Math.floor(meses / 12);
    const mesesRest = meses % 12;

    const partes: string[] = [];
    if (anios > 0) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
    if (mesesRest > 0) partes.push(`${mesesRest} ${mesesRest === 1 ? 'mes' : 'meses'}`);
    if (anios === 0 && mesesRest < 3 && dias > 0) partes.push(`${dias} ${dias === 1 ? 'día' : 'días'}`);
    const duracion = partes.length ? partes.join(' y ') : 'menos de 1 día';

    if (vencida) {
      return { estado: 'vencida', texto: `PH VENCIDA hace ${duracion}`, fechaVenc };
    }

    let estado: 'critica' | 'proxima' | 'vigente' = 'vigente';
    if (meses < 3) estado = 'critica';
    else if (meses < 12) estado = 'proxima';

    return { estado, texto: `Faltan ${duracion} para la PH`, fechaVenc };
  }

  // ===================== CÓDIGO DE BARRAS =====================

  // Dibuja el código de barras cuando el modal ya está visible
  generarCodigoBarras() {
    const canvas = document.getElementById('barcodeCanvas') as HTMLCanvasElement | null;
    if (!canvas || !this.cilindroSeleccionado) return;

    const serie = String(
      this.cilindroSeleccionado.numeroSerie || this.cilindroSeleccionado.numero_serie || ''
    ).trim();
    if (!serie) return;

    try {
      JsBarcode(canvas, serie, {
        format: 'CODE128',
        width: 3,
        height: 90,
        displayValue: true,
        fontSize: 18,
        margin: 12,
        background: '#ffffff',
        lineColor: '#000000'
      });
    } catch (e) {
      console.error('No se pudo generar el código de barras:', e);
    }
  }

  private obtenerSerieArchivo(): string {
    const serie = String(
      this.cilindroSeleccionado?.numeroSerie || this.cilindroSeleccionado?.numero_serie || 'cilindro'
    );
    return serie.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // Descarga PNG (ideal para app de ticketera)
  descargarCodigoImagen() {
    const canvas = document.getElementById('barcodeCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `barcode-${this.obtenerSerieArchivo()}.png`;
    link.click();
  }

  // Descarga PDF con ancho de ticket (80 mm)
  descargarCodigoPDF() {
    const canvas = document.getElementById('barcodeCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const img = canvas.toDataURL('image/png');
    const anchoPdf = 80;   // cambia a 58 si tu ticketera es de 58 mm
    const margen = 5;
    const anchoImg = anchoPdf - margen * 2;
    const altoImg = (anchoImg * canvas.height) / canvas.width;
    const altoPdf = altoImg + margen * 2;

    const pdf = new jsPDF({
      unit: 'mm',
      orientation: altoPdf > anchoPdf ? 'portrait' : 'landscape',
      format: [anchoPdf, altoPdf]
    });

    pdf.addImage(img, 'PNG', margen, margen, anchoImg, altoImg);
    pdf.save(`barcode-${this.obtenerSerieArchivo()}.pdf`);
  }

  // ===================== ACCIONES =====================

  // REDIRECCIÓN SEGÚN TUS RUTAS DECLARADAS: /registrocilindros/:id
  editarCilindro(item: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    if (item?.id) {
      this.router.navigate(['/registrocilindros', item.id]);
    }
  }

  // Correos autorizados para eliminar cilindros
  private readonly EMAILS_ADMIN: string[] = [
    'ruizericka78@gmail.com',
    'davidruizpolo.drp@gmail.com'   // <-- cambia por el correo de la segunda persona
  ].map(e => e.toLowerCase());

  async eliminarCilindro(item: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    // Verificar el usuario logueado
    const { data: authData } = await this.supabaseService.supabase.auth.getUser();
    const emailActual = (authData?.user?.email || '').toLowerCase();

    if (!this.EMAILS_ADMIN.includes(emailActual)) {
      const aviso = await this.alertCtrl.create({
        header: 'Acceso denegado',
        message: 'No tienes permiso para eliminar cilindros.',
        buttons: ['Aceptar']
      });
      await aviso.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro que quieres eliminar el cilindro con serie ${item.numeroSerie}?`,
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Sí',
          role: 'destructive',
          handler: () => {
            // Pasa a la segunda confirmación
            this.segundaConfirmacion(item);
          }
        }
      ]
    });

    await alert.present();
  }

  // Segundo formulario: confirmar definitivamente
  private async segundaConfirmacion(item: any) {
    const alertConfirmar = await this.alertCtrl.create({
      header: 'Confirmar',
      message: `Esta acción no se puede deshacer. ¿Confirmas que quieres eliminar el cilindro con serie ${item.numeroSerie}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Confirmar',
          role: 'destructive',
          handler: () => {
            this.ejecutarEliminacion(item);
          }
        }
      ]
    });

    await alertConfirmar.present();
  }

  // Elimina el cilindro y muestra la alerta de resultado
  private async ejecutarEliminacion(item: any) {
    const { error } = await this.supabaseService.supabase
      .from('cilindros')
      .delete()
      .eq('id', item.id);

    if (error) {
      console.error('Error al eliminar el cilindro:', error.message);
      const alertError = await this.alertCtrl.create({
        header: 'Error',
        message: 'No se pudo eliminar el cilindro. Inténtalo de nuevo.',
        buttons: ['Aceptar']
      });
      await alertError.present();
      return;
    }

    this.obtenerCilindros();

    const alertOk = await this.alertCtrl.create({
      header: 'Cilindro eliminado',
      message: `El cilindro con serie ${item.numeroSerie} fue eliminado correctamente.`,
      buttons: ['Aceptar']
    });
    await alertOk.present();
  }

  regresar() {
    this.navCtrl.back();
  }
}