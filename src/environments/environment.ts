export const environment = {
  production: false,
  supabaseUrl: 'https://rnnotvuamabgfmfqaqnp.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubm90dnVhbWFiZ2ZtZnFhcW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNDg1NDYsImV4cCI6MjEwMjkyNDU0Nn0.VEHcAEiEG36S6C2g5QpFOm9uiYG4TZRcW77bHrvwJnw',

  // Microservicio de IA que identifica el cilindro a partir de una foto del
  // troquelado. En desarrollo corre en el mismo equipo (make run).
  //
  // Para probar desde un móvil real en la misma red Wi-Fi, sustituya
  // localhost por la IP del equipo que ejecuta el servicio, por ejemplo
  // 'http://192.168.1.50:8000'. Desde el móvil, "localhost" es el propio móvil.
  aiServiceUrl: 'http://localhost:8000',
};
