import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  cameraReverseOutline,
  checkmarkCircleOutline,
  closeOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import {
  AnalisisCilindro,
  candidatosAlternativos,
  mensajeRevision,
  seriePropuesta,
} from '../../services/detector-cilindros';

export type AccionConfirmacion = 'confirmar' | 'repetir' | 'cancelar';

export interface ResultadoConfirmacion {
  serie: string;
  /** true si el operario cambió el número propuesto por la IA. */
  corregido: boolean;
}

/**
 * Muestra lo que la IA leyó en la foto y deja que el operario lo confirme,
 * lo corrija o repita la foto.
 *
 * Nada de lo que propone la IA se registra sin pasar por aquí: la
 * calibración del servicio concluyó que ningún umbral de confianza permite
 * aceptar una lectura sin revisarla.
 */
@Component({
  selector: 'app-confirmar-serie',
  templateUrl: './confirmar-serie.modal.html',
  styleUrls: ['./confirmar-serie.modal.scss'],
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
    IonInput,
    IonFooter,
  ],
})
export class ConfirmarSerieComponent implements OnInit {
  @Input() analisis!: AnalisisCilindro;
  @Input() vistaPrevia = '';

  serie = '';
  propuesta = '';
  mensaje = '';
  alternativas: string[] = [];
  coincideConInventario = false;
  sinLectura = false;
  confianza: number | null = null;

  constructor(private modalCtrl: ModalController) {
    addIcons({
      alertCircleOutline,
      cameraReverseOutline,
      checkmarkCircleOutline,
      closeOutline,
      informationCircleOutline,
    });
  }

  ngOnInit(): void {
    this.propuesta = seriePropuesta(this.analisis);
    this.serie = this.propuesta;
    this.mensaje = mensajeRevision(this.analisis);
    this.alternativas = candidatosAlternativos(this.analisis);
    this.coincideConInventario = this.analisis.match.status === 'matched';
    this.sinLectura = !this.propuesta;
    this.confianza = this.analisis.data.numero_serie.confidence;
  }

  get serieNormalizada(): string {
    return String(this.serie || '').trim().toUpperCase();
  }

  /** Porcentaje entero, o null si el servicio no dio confianza. */
  get confianzaPct(): number | null {
    return this.confianza === null ? null : Math.round(this.confianza * 100);
  }

  elegir(alternativa: string): void {
    this.serie = alternativa;
  }

  confirmar(): void {
    if (!this.serieNormalizada) return;
    const resultado: ResultadoConfirmacion = {
      serie: this.serieNormalizada,
      corregido: this.serieNormalizada !== this.propuesta.toUpperCase(),
    };
    this.modalCtrl.dismiss(resultado, 'confirmar');
  }

  repetir(): void {
    this.modalCtrl.dismiss(null, 'repetir');
  }

  cancelar(): void {
    this.modalCtrl.dismiss(null, 'cancelar');
  }
}
