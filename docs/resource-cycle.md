# OPS03 — Asignación, recursos y resultados

El inicializador de reparto original solo admite el catálogo/consumos de recursos
vacíos; no vuelve a repartir empresas ya configuradas ni ignora recursos nuevos.
Un traslado posterior de recursos poblados requiere un contrato de transferencia
propio. La compatibilidad de columnas se compara por nombre/tipo/nulabilidad,
independiente del orden físico en que una actualización las haya añadido.

## Reasignación compatible

Agenda ofrece un lote de hasta 50 visitas marcadas por empresa. Mantiene fecha,
duración, contrato y tareas. Ordena cuadrillas propias por carga prevista y usa la
transacción existente de saveVisit para comprobar personal activo, solapamientos,
turno, capacidad y vigencia. Una visita incompatible conserva la marca y devuelve
su motivo. No crea trabajadores ni cancela/reprograma fechas silenciosamente.
Repetir la acción solo considera las visitas aún pendientes. Las nuevas paradas
se añaden a la cuadrilla de destino; esto no optimiza rutas por carretera.

## Recursos por empresa y visita

Migración 020 crea operating_resources y visit_resources en todos los namespaces
existentes y en el bootstrap de empresas nuevas. El catálogo admite crear, editar,
desactivar y retirar lógicamente materiales/equipos, con código único y auditoría.
Las unidades se mantienen en el catálogo editable existente. Las tarifas desconocidas
se conservan como null, nunca como costo cero. El catálogo no acredita inventario,
existencias físicas, compras, reservas de máquinas o ubicación de activos.

Cada visita programada prepara cantidades por recurso. Nombre, tipo, unidad y tarifa
quedan capturados; cambiar el catálogo no revaloriza planes anteriores. Solo visitas
programadas sin consumo admiten cambiar el plan. Confirmar un plan vacío declara
expresamente que no se preparan materiales/equipos; no preparar un plan se muestra
como pendiente. No se inventan cantidades a partir de superficies sin un rendimiento
o dosificación configurados por el operador.

## Consumos y costos

La cuadrilla registra cantidades acumuladas usadas y notas, sin precios. Registrar
de nuevo la misma cantidad no añade un segundo cargo. Cambiar cantidades conserva
auditoría y motivo. Finanzas/supervisor con costs.update pueden valorar o corregir
una tarifa capturada con motivo. Una tarifa ausente deja el costo incompleto aunque
el tiempo laboral sea conocido; no borra la mano de obra ya calculada.

Los costos por recursos se agregan a las líneas manuales existentes. Guardar otros
costos recalcula ambas fuentes sin copiar consumos como nuevas líneas manuales.
La UI advierte que no se registren de nuevo en otras líneas. No es contabilidad ni
control de stock: materiales = cantidad usada × tarifa por unidad; equipos = uso
en la unidad elegida (por ejemplo horas) × tarifa, no valor de compra.

Previsto y real se comparan en cantidades/costos. Minutos-persona son la suma de
tiempos de los integrantes; la producción se agrupa por servicio y unidad. Cantidad
real / horas-persona de la visita es un indicador contextual que comparte denominador
si existen varios servicios. No se infieren horas por tarea ni un ranking individual.
Datos ausentes se muestran pendientes y no se mezclan unidades incompatibles.

## Cuadrilla móvil y seguridad

Migración 021 añade el permiso explícito my_work.execute a perfiles estándar de
operación/IT y cuadrillas; no concede costos ni acceso empresarial global. Se puede
gestionar con la matriz existente. Los perfiles personalizados no se amplían solos.
La cuadrilla abre solo sus visitas actuales, ve personas/tareas/recursos, inicia,
registra cantidades y minutos, finaliza o cancela un inicio por error con historial.
Se comprueba asignación vigente bajo bloqueo transaccional; una visita ajena o ya
fuera de su alcance no se puede modificar. Tarifas e importes no salen en su payload.

Las APIs conservan el contexto empresarial autenticado y el mismo motor de permisos;
sin nuevas cuentas, proveedores, secretos, servicios ni bases de datos.

## Verificación enfocada

Tres casos en tests/resource-cycle.test.mjs: lote compatible/idempotente con casos
bloqueados; plan/consumo/correcciones y costos sin duplicar; migración multicompañía
y ejecución asignada. Solo se reejecutan casos fallidos/modificados. Tipos/lint y CI
existente acompañan la publicación; Vercel compila sin repetir la suite de CI.
