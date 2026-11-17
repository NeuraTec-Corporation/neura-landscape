# Sistema → Respaldos — módulo reutilizable

## Alcance

El administrador IT de plataforma puede crear un ZIP cifrado, revisar historial,
emitir agentes de solo respaldo y revocarlos. Los administradores de empresas no
pueden descargar las otras empresas, hashes de acceso o configuración compartida.
No hay endpoint de restauración sobre la base publicada.

El núcleo `src/modules/backups` depende solo de Node y de un puerto transaccional
de consultas. `capture`, `packageSnapshot`, `unseal` y `restoreSnapshot` no importan
Next, React, Google, Landscape, el driver PostgreSQL ni identidad. La selección de
empresas, lectura Blob, autorización, historial y agentes son adaptadores en
`operations/platform-backups.mjs` y la ruta HTTP. No se copian otros repositorios.

## Qué contiene el paquete

- Todas las tablas/columnas, relaciones e índices de public y namespaces de empresa
  registrados; filas consistentes bajo transacción repeatable-read de solo lectura.
- Usuarios nativos, hashes de contraseñas, empresas, perfiles, permisos y vínculos.
- Datos de negocio, metadatos de fotos, bytes PostgreSQL y lectura de fotos privadas
  Blob disponibles. Si falta un archivo requerido, falla sin entregar copia parcial.
- Manifiesto con fuente/versiones, conteos y SHA-256, más instrucciones de recuperación.
- GZIP dentro de AES-256-GCM; clave aleatoria independiente de 32 bytes. El servidor
  recibe esa clave por TLS para esa operación y no la guarda en registros ni en DB.

Se excluyen sesiones activas, enlaces de verificación efímeros, rate limits y tokens
OAuth de acceso/refresh/ID. Las contraseñas **se conservan como hashes**, no texto
legible; después de restaurar se requiere nuevo ingreso. No contiene valores de
variables de entorno, llaves de proveedores, roles/grants del proveedor PostgreSQL,
DNS ni infraestructura Vercel. El manifiesto enumera configuración que debe
reponerse por separado. No equivale por sí solo a recuperación total del servicio.

La descarga tiene límite explícito de 3,5 MB cifrados y 24 MB sin comprimir para
esta implementación económica en Functions. Un conjunto mayor requiere adaptador
de almacenamiento/streaming; el sistema rechaza el paquete en vez de truncarlo.

## Creación desde el menú

Entrar como IT → Sistema → Respaldos. Generar y custodiar una clave, o cargar una
existente; descargar el ZIP. La clave se descarga aparte y queda solo en memoria
del navegador hasta salir. El historial indica **generado para descarga**, no
afirma que el navegador haya guardado el archivo ni que Drive lo haya recibido.

## Agente local automático

1. En el menú, con una clave cargada, descargar la configuración privada del agente.
   Contiene token de solo respaldo y clave; nunca subirla al repo ni junto al ZIP.
2. Editar `output` para una ruta local autorizada o una carpeta de Drive Desktop
   ya conectada al usuario corporativo. El conector de este chat no proporciona
   credenciales al programa ni mantiene una sincronización desatendida.
3. Si el Preview tiene protección Vercel, necesita autorización permanente adecuada
   para automatización (`vercelAutomationBypass` en configuración protegida) o un
   destino autorizado sin esa barrera adicional. Un enlace temporal de revisión
   no sirve como configuración diaria. No se desactiva la protección existente.
4. Desde el mismo checkout actualizado, `npm run backup:pull -- --config RUTA.json`.
   Comprueba la huella de descarga y que el commit coincida con el servidor; usa
   `git archive HEAD` para añadir el código/lockfile y genera un kit ZIP con
   `application-source.zip`, `platform-data.zip` y manifiesto. No empaqueta .git,
   node_modules, .env.local ni directorios de datos ignorados.
5. En Windows: `powershell -File scripts/install-backup-agent.ps1 -Config RUTA.json`.
   Protege la configuración con DPAPI del usuario actual. Una vez verificada,
   retirar la configuración original sin cifrar y conservar la clave de recuperación
   bajo custodia independiente. No se elimina el original automáticamente.
6. Para registrar una tarea diaria explícita: añadir `-RegisterDaily -At 02:00`.
   Se ejecuta oculta, con una única instancia y cuando esté disponible el equipo.
   Usa el usuario Windows que instaló DPAPI y debe tener sesión iniciada, Node/Git,
   red y autorización válidos. Registrar la tarea no garantiza ejecución ni Drive.

Los tokens de agente duran como máximo un año, no conceden lectura de módulos ni
restauración y se invalidan si se revocan o si su IT deja de estar activo. Los
destinos y tareas locales no se activan al pulsar «Preparar agente automático».
La autenticación, el guardado local y la sincronización externa son tres resultados
distintos; no se declara copia externa confirmada a partir de una descarga.

## Recuperar localmente

Usar código y dependencias del commit del manifiesto. Clave y ZIP se entregan por
canales separados. Para probar sin escribir archivos persistentes:

```powershell
npm run backup:restore -- --bundle RUTA/platform-data.zip --key RUTA/clave.key --verify-only
```

Para recuperar en una carpeta **vacía** elegida expresamente:

```powershell
npm run backup:restore -- --bundle RUTA/platform-data.zip --key RUTA/clave.key --target RUTA_VACIA
```

El restaurador no lee DATABASE_URL ni usa `.env.local`. Nunca borra o sustituye una
base preexistente. Crea schemas/tablas, carga filas, reconstruye y valida constraints
e índices, ajusta secuencias y compara cada fila de todas las tablas, incluyendo
JSON anidado. Las fotos Blob se materializan en `property_photo_data`, actualizando
el path local y verificando sus huellas. Una verificación fallida no se acepta.

La DB local instalada es PGlite. Sirve para restaurar/verificar datos sin servicio
extra. El adaptador actual de inicio de sesión de Better Auth requiere PostgreSQL
accesible y configuración de identidad: restaurar en PGlite no habilita por sí
solo un acceso nativo/Google local completo. La recuperación hospedada integral,
secretos y configuración de proveedores siguen siendo una aceptación separada.

## Conservación

Aplicar siete años calendario según evaluation-data.md. Los kits son copias de
recuperación fechadas, no ramas/copies de desarrollo ni órdenes de purga. No se
eliminan automáticamente copias o documentos por antigüedad. Versionar, custodiar
la clave, comprobar descarga/restauración y mantener un destino independiente.
