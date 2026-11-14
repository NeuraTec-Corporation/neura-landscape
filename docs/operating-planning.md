# OPS04 — Planificación viable y control de desviaciones

## 1. Resolver pendientes

Agenda incorpora búsqueda individual y propuesta conjunta de hasta 50 visitas pendientes.
El usuario elige fechas desde hoy, hasta 28 días (14 por defecto); nunca se adelanta una visita futura antes de su día original. se ofrecen comienzos cada 15 minutos
en America/New_York. Se comprueban personal activo y compartido, ocupación de cuadrillas,
traslado previo, descanso total, duración, vigencia del contrato y localidad activa.

El acceso se toma del horario de la localidad únicamente cuando es un intervalo inequívoco
HH:mm–HH:mm. Si falta o contiene texto libre, la propuesta se bloquea con explicación.
Al guardar cualquier visita, un horario de acceso reconocible también se valida en servidor.
La generación futura del escenario sintético comienza sus primeras paradas a las 09:00,
respetando su ventana existente; no se reescribe su historial alojado.

La simulación conjunta reserva cada propuesta antes de calcular la siguiente. No modifica
datos hasta aplicar. Cada visita se guarda en una transacción con bloqueo, revisión vigente,
comprobación de cruces y auditoría. El resultado del lote enumera éxitos y rechazos: puede
ser parcial si la disponibilidad cambió. Las tareas y recursos se conservan; responsables
que no pertenecen a la nueva cuadrilla pasan a responsabilidad conjunta y deben revisarse.

No se interpreta un horario como calendario laboral: días habilitados, vacaciones,
habilidades y excepciones se verifican con la operadora. Los traslados son los previstos
manualmente, no estimaciones de tráfico ni optimización vial. La duración no se divide
automáticamente por el número de empleados. No se envían notificaciones al cliente.

## 2. Catálogo y tarifas de cada operadora

Materiales ofrece un catálogo inicial explícito de ocho recursos habituales, sin inventario
ni precios inventados. La acción es repetible y no sobrescribe recursos con el mismo nombre.
Cada empresa crea y administra sus propios recursos en su almacenamiento aislado.

La tabla de tarifas permite buscar, paginar desde siete filas y modificar varias tarifas
con un motivo. Se actualizan atómicamente y con revisiones: un recurso ajeno o desactualizado
rechaza todo el lote. Vacío significa desconocido; cero es un costo cero explícito.
Se requiere costs.update. La modificación afecta nuevos planes; no cambia tarifas capturadas.
No se afirman costos reales sin que la operadora aporte sus tarifas.

## 3. Comparación gerencial

El panel usa exactamente el período, cliente, región, ciudad, servicio, cuadrilla,
estado y origen ya seleccionados. Agrega recursos en una consulta, sin consultas por fila.

- Tiempo previsto: duración prevista × integrantes identificados de la visita.
- Tiempo real: suma de minutos individuales de visitas cerradas con registro completo.
- Costo previsto comparado: mano de obra prevista + cantidades previstas × tarifas capturadas.
- Costo real comparado: mano de obra registrada + consumo × tarifa real capturada.
- Desviación: real menos previsto; solo se suman visitas con ambos valores conocidos.
- Producción: cantidades previstas y registradas, separadas por servicio y unidad.

Los costos manuales adicionales, traslados e indirectos siguen en Costos. Este comparativo
no los mezcla con una base que no los presupuestó. Muestra cobertura de las comparaciones
y pendientes; no convierte faltantes en cero ni crea rankings individuales ficticios.
Las tablas usan siete filas iniciales, búsqueda y selector de cantidad.

## Verificación mínima

Tres casos focalizados: horarios/lotes y revisión concurrente; catálogo/tarifas atómicas y
aislamiento; cohortes/filtros del panel. Solo se repite el caso modificado. La CI existente
verifica la compilación y regresiones; no se ejecuta otra suite manual completa.

La implementación continúa sobre el mismo checkout y rama. No crea servicios, proveedores,
dependencias, cuentas o almacenamiento paralelo ni requiere una migración nueva.
