# Inventario Hugo — demo web

Copia del catálogo y de la interfaz de Inventario, preparada para GitHub y Vercel.

- **2.278 productos** del catálogo original: nombres, códigos, categorías, marcas y precios.
- **2.176 imágenes originales**, copiadas sin modificar a `assets/products/`. Los otros 102 productos no tienen foto en el catálogo de origen.
- Las existencias son ficticias: no representan el stock real.
- 2 empresas de ejemplo, 4 almacenes y 12 andamios. Todos los productos están distribuidos en 3 niveles por andamio.
- Inventarios **ficticios y cerrados** de septiembre y octubre de 2026. Cada mes tiene 2.278 registros con cantidades y responsables inventados.
- Los históricos se conservan separados de las modificaciones del editor actual.
- Consulta en Gestión, Reportes → Inventarios anteriores o Informe mensual y analítica. La analítica exporta CSV; Excel requiere el servidor de escritorio.
- Inicio automático como administrador demo. Acceso: **demo / demo**.
- Las ediciones se guardan solo en el navegador. No hay autenticación real ni sincronización entre equipos.
- **Restablecer demo** recupera los ejemplos iniciales. Esta versión utiliza un almacenamiento separado de la demo anterior de 36 productos.

No incluye la base SQLite, credenciales, usuarios reales, movimientos reales, ejecutables ni perfiles de navegador.

## Datos

- `demo-catalog.js`: catálogo copiado con existencias ficticias.
- `demo-seed.js`: estructura e inventarios reproducibles de septiembre y octubre.
- `demo-api.js`: API local de demostración.
- `assets/products/`: imágenes originales (aproximadamente 916 MB).

## Publicación

Proyecto Vercel `inventario-hugo-demo-vercel`, preset **Other**, sin build y salida `.`. Los archivos privados y herramientas de prueba se excluyen mediante `.vercelignore`.

## Verificación

Ejecutar `npm ci` y `npm test`. Utiliza Chrome instalado en Windows. Comprueba catálogo, fotos, históricos, comparación mensual, edición y persistencia sin modificar datos del servidor de escritorio.
