import { Routes } from '@angular/router';
import { sesionGuard } from './guards/sesion.guard';

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
    canActivate: [sesionGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'Perfil',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Perfil/perfil').then((m) => m.PerfilPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./Registro/registro').then((m) => m.RegistroPage),
  },
  {
    path: 'ingreso',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Ingreso_Electrametal/ingreso').then((m) => m.IngresoPage),
  },
  {
    path: 'recojo',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Recojo/recojo').then((m) => m.RecojoComponent),
  },
  {
    path: 'transf-almacenes',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Transf_Almacenes/transf_almacenes').then((m) => m.TransfAlmacenesPage),
  },
  {
    path: 'registrocliente',
    canActivate: [sesionGuard],
    loadComponent: () => import('./RegistroCliente/registrocliente').then((m) => m.RegistroClienteComponent),
  },
  {
    path: 'registrocliente/:id',
    canActivate: [sesionGuard],
    loadComponent: () => import('./RegistroCliente/registrocliente').then((m) => m.RegistroClienteComponent),
  },
  {
    path: 'listaclientes',
    canActivate: [sesionGuard],
    loadComponent: () => import('./ListaClientes/listaclientes').then((m) => m.ListaClientesComponent),
  },
  {
    path: 'registrocilindros',
    canActivate: [sesionGuard],
    loadComponent: () => import('./RegistroCilindros/registrocilindros').then((m) => m.RegistroCilindrosPage),
  },
  {
    path: 'registrocilindros/:id',
    canActivate: [sesionGuard],
    loadComponent: () => import('./RegistroCilindros/registrocilindros').then((m) => m.RegistroCilindrosPage),
  },
  {
    path: 'ver-lista-cilindros',
    canActivate: [sesionGuard],
    loadComponent: () => import('./VerListaCilindros/verlistacilindros').then((m) => m.VerListaCilindrosPage),
  },
  {
    path: 'almacenes',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Almacenes/almacenes').then((m) => m.AlmacenesPage),
  },
  {
    path: 'historial-ingresos',
    canActivate: [sesionGuard],
    loadComponent: () => import('./Historial_Ingreso/historial_ingresos').then(m => m.HistorialIngresosPage)
  },
  {
    path: 'salida',
    canActivate: [sesionGuard],
    loadComponent: () =>
      import('./Salida_Electrametal/salida').then(m => m.SalidaPage)
  },
  {
  path: 'historial-salidas',
    canActivate: [sesionGuard],
  loadComponent: () =>
    import('./Historial_Salida/historial_salida').then(m => m.HistorialSalidasPage)
},
{
  path: 'reportes',
    canActivate: [sesionGuard],
  loadComponent: () => import('./Reportes/reportes').then(m => m.ReportesPage)
},
{
  path: 'cilindros_clientes',
    canActivate: [sesionGuard],
  loadComponent: () => import('./CilindrosClientes/cilindros_clientes').then(m => m.CilindrosClientesPage)
},
{
  path: 'cilindros_proveedores',
    canActivate: [sesionGuard],
  loadComponent: () => import('./CilindrosProveedores/cilindros_proveedores').then(m => m.CilindrosProveedoresPage)
},
{
  path: 'historial-cilindro',
  loadComponent: () => import('./HistorialdeCilindro/historial_cilindro').then(m => m.HistorialDeCilindroPage)
},
{
  path: 'registro-proveedores',
  canActivate: [sesionGuard],
  loadComponent: () => import('./Registro_Proveedores/registro_proveedor').then(m => m.RegistroProveedorPage)
},
{
  path: 'lista-proveedores',
  canActivate: [sesionGuard],
  loadComponent: () => import('./Lista_Proveedores/lista-proveedores').then(m => m.ListaProveedoresPage)
},
{
  path: 'registro-proveedores/:id',
  canActivate: [sesionGuard],
  loadComponent: () => import('./Registro_Proveedores/registro_proveedor').then(m => m.RegistroProveedorPage)
}

];