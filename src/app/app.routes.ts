import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./Login/login').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'Perfil',
    loadComponent: () => import('./Perfil/perfil').then((m) => m.PerfilPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./Registro/registro').then((m) => m.RegistroPage),
  },
  {
    path: 'ingreso',
    loadComponent: () => import('./Ingreso_Electrametal/ingreso').then((m) => m.IngresoPage),
  },
  {
    path: 'recojo',
    loadComponent: () => import('./Recojo/recojo').then((m) => m.RecojoComponent),
  },
  {
    path: 'registrocliente',
    loadComponent: () => import('./RegistroCliente/registrocliente').then((m) => m.RegistroClienteComponent),
  },
  {
    path: 'registrocliente/:id',
    loadComponent: () => import('./RegistroCliente/registrocliente').then((m) => m.RegistroClienteComponent),
  },
  {
    path: 'listaclientes',
    loadComponent: () => import('./ListaClientes/listaclientes').then((m) => m.ListaClientesComponent),
  },
  {
    path: 'registrocilindros',
    loadComponent: () => import('./RegistroCilindros/registrocilindros').then((m) => m.RegistroCilindrosPage),
  },
  {
    path: 'registrocilindros/:id',
    loadComponent: () => import('./RegistroCilindros/registrocilindros').then((m) => m.RegistroCilindrosPage),
  },
  {
    path: 'ver-lista-cilindros',
    loadComponent: () => import('./VerListaCilindros/verlistacilindros').then((m) => m.VerListaCilindrosPage),
  },
  {
    path: 'almacenes',
    loadComponent: () => import('./Almacenes/almacenes').then((m) => m.AlmacenesPage),
  },
];