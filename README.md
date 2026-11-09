# Inventario Hugo — demo web

Adaptación estática de la interfaz de Inventario para Vercel.

- 2 empresas ficticias, 4 almacenes, 12 andamios y 36 productos, distribuidos en 3 niveles por andamio.
- Inicio automático como administrador demo. Si cierras sesión: **demo / demo**.
- En **Administración → Empresas, almacenes y espacios** puedes explorar y editar las empresas, almacenes, andamios y productos ubicados.
- El catálogo permite crear y editar productos. Los cambios se guardan en localStorage y se pueden restablecer con el botón de la franja demo.
- Cada navegador tiene sus propios datos. No hay autenticación real ni sincronización entre equipos.
- Conteos compartidos, reportes del servidor, copias de seguridad, cuentas y funciones nativas requieren la aplicación de escritorio y no están implementados en esta demo; sus solicitudes muestran un aviso explícito.

No contiene la base SQLite, productos reales, ejecutables, perfiles de navegador ni credenciales del equipo original.

## Publicación

Importar este repositorio en Vercel con preset **Other**, sin comando de build y directorio de salida `.`. `vercel.json` incluye esa configuración.

## Verificación local

Ejecutar `npm ci` y `npm test`. Utiliza Chrome instalado en Windows para comprobar la carga de la interfaz, datos ficticios, edición y persistencia.
