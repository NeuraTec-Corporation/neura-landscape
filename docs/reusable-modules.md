# Reutilización: Clientes, Seguridad y navegación por perfiles

Decisión permanente: reutilizar contratos y módulos, no copiar toda Landscape ni
crear otra base para cada evaluación. Estos límites se conservan al evolucionar.

| Pieza | Entrada pública | Adaptadores del proyecto receptor |
| --- | --- | --- |
| Clientes | `src/modules/customers/index.mjs` | Puerto query/transaction compatible, migraciones de clientes, normalización de país/teléfono y rutas autenticadas |
| Seguridad | `src/modules/security/index.mjs` y `policy.mjs` | Identidad del sujeto, empresa activa validada, persistencia transaccional y registro de capacidades del nuevo producto |
| Autenticación | `src/modules/identity` | Sesiones, códigos/claves, proveedor Google opcional; nunca trasladar credenciales, usuarios ni secretos de Landscape |
| Menú por permisos | `src/app/_security-manifest.mjs`, política y componentes de navegación | Rutas, iconos, nombres y capacidades del producto receptor; el servidor decide autorización |
| Conservación | `evaluation-policy.mjs:retentionWindow` | Clasificación de datos, archivo externo, cifrado, restauración y bloqueos de negocio |

El núcleo de Seguridad ya es independiente de Next, React, Google y empleados.
Los clientes de cada empresa se resuelven mediante el adaptador de persistencia,
sin importar las cuadrillas, presupuestos ni servicios de Landscape. Identidad y
navegación aún contienen adaptadores de esta aplicación: no se declaran paquetes
universales ya publicados. Reutilizar requiere mapear esos adaptadores, no volver
a implementar la política ni transportar datos sintéticos al otro proyecto.

Procedimiento de adopción: registrar capacidades del receptor, mapear empresa y
sujeto, instalar las migraciones necesarias una sola vez, conectar persistencia,
componer autenticación y menú y comprobar denegación entre empresas, mínimo
privilegio y revisiones concurrentes. Ocultar una opción nunca autoriza una API.
Perfiles se configuran mediante capacidades; no condicionar permisos al nombre
visible del perfil. Cada producto conserva sus datos y sus secretos.

La exportación OPS07 es evidencia/datos de evaluación, no un mecanismo para
duplicar módulos o una plantilla de usuarios para otros productos.
