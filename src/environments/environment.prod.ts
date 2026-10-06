export const environment = {
  production: true,
  // Antes este fichero no incluía la configuración de Supabase, de modo que
  // una compilación de producción arrancaba sin base de datos. La clave anon
  // es pública por diseño: la protección de los datos la dan las políticas
  // RLS de Supabase, no el secreto de esta clave.
  supabaseUrl: 'https://rnnotvuamabgfmfqaqnp.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubm90dnVhbWFiZ2ZtZnFhcW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNDg1NDYsImV4cCI6MjEwMjkyNDU0Nn0.VEHcAEiEG36S6C2g5QpFOm9uiYG4TZRcW77bHrvwJnw',

  // Dirección pública del microservicio de IA (AWS ECS Express Mode; ver
  // npl_ai/docs/DESPLIEGUE_AWS.md). Debe ser HTTPS: las aplicaciones móviles
  // bloquean por defecto las llamadas HTTP en claro. Si el servicio se borra y
  // se vuelve a crear, AWS le asigna otra URL y hay que cambiarla aquí.
  aiServiceUrl: 'https://ai-52f21abaa0674bb88aa7544cd71eadec.ecs.us-east-1.on.aws',
};
