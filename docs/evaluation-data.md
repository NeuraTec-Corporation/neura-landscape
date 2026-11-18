# OPS07 — Datos operativos y conservación

Decisión del propietario, 2026-11-16: detener nuevas integraciones y priorizar datos
ficticios coherentes para presentación. No se crean empresas, identidades, bases,
ramas ni servicios adicionales. Los UUID y accesos existentes se conservan.

## Ejecución y seguridad

`/api/evaluation-scenario` funciona exclusivamente en Preview para el administrador
IT de plataforma, seleccionando Rojas o Evergreen. GET devuelve cobertura; GET con
`export=1` exporta los datos de negocio de esa empresa sin contraseñas, cuentas,
sesiones ni configuración compartida. POST exige confirmación y el SHA-256 de la
exportación previa. Si cambió cualquier dato de negocio, devuelve 409. La carga
usa una transacción, un bloqueo operativo por empresa y un lote único OPS07;
repetirla devuelve cobertura sin duplicar ni reescribir las ediciones posteriores.

La exportación JSON representa un checkpoint lógico de la empresa, no sustituye
un pg_dump completo, respaldos de identidades, secretos y objetos Blob externos.
El ejecutor guarda y descifra/verifica una copia cifrada antes de permitir POST.
Los nombres de archivos y sus huellas se registran sin publicar su contenido.

Solo las localidades, contactos, empleados y contratos identificados en los lotes
sintéticos se enriquecen. No se borran registros manuales. Los contratos vinculados
a ofertas aceptadas conservan términos y versiones. Las instantáneas históricas de
precios y personal se mantienen; las ediciones de condiciones vigentes no rehacen
historia. Cambios en acceso/calendario dejan las alertas operativas visibles.

## Dos escenarios diferentes

| Dimensión | Rojas | Evergreen |
| --- | --- | --- |
| Enfoque | Residencial, jardines, rutas cortas | Comercial, mayor escala y trabajos estacionales |
| Superficies supuestas | Escala base | 2,7 veces la escala base |
| Visitas adicionales | 12 | 16 |
| Tarifas de contrato | Desde USD 320/mes | Desde USD 780/mes |
| Calendario | Lunes a sábado | Lunes a viernes |
| Depósito adicional | Ruta sur | Base comercial |
| Inventario añadido | Base 90 + variación por material | Base 180 + variación por material |
| Geografía | Rotación residencial | Rotación y asociación de cuentas distinta |

Estos importes, superficies y rendimientos son supuestos, no precios de mercado ni
mediciones reales. Los correos utilizan dominios reservados; los teléfonos usan
el intervalo ficticio 555-0100–0199. No se activan consentimientos ni envíos.

## Matriz de escenarios verificables

| Área | Casos y evidencia |
| --- | --- |
| Clientes | Personas/empresas existentes, prospectos/activos, contactos propios y alternos, canales y horarios distintos |
| Localidades | Cartera existente de una/múltiples sedes, cuatro ciudades, ocho referencias públicas, superficies independientes y precauciones |
| Levantamiento | Frente, césped posterior, paso lateral, driveway, frutales, setos/riego; medidas estimadas y conservación |
| Comercial | Frecuencias semanal/14 días/mensual/dos veces por semana, importes distintos; ofertas emitida, declinada, retirada y aceptada sin vincular |
| Personal | Cuadrillas e integrantes conservados, habilidades variadas, habilitaciones vigentes/vencidas y ausencia futura |
| Recursos | Tarifas supuestas, existencias, traslado entre almacenes, reservas, consumos por unidad y equipo físico |
| Equipo | Activos disponibles, reserva en taller, mantenimiento abierto/vencido y realizado con costo |
| Agenda | Pendientes, iniciada, completadas, cancelación por cliente/clima, bloqueo parcial, servicio invernal condicionado al clima |
| Producción | Césped en ft², poda en unidades, cantidades previstas/reales, responsables y minutos-persona; menor/mayor esfuerzo que el previsto |
| Costos | Mano de obra, recursos, traslado e indirectos; desvíos y casos de contribución positiva/negativa según registros |
| Finanzas | Borrador, emitida, anulada, pagada, parcial, vencida y cheque revertido; documentos ligados a cliente/localidad |
| Historia | Siete años activos más un par antiguo pagado/pendiente que ejemplifica archivo y retención por saldo abierto |
| Integridad | Cero factura/localidad de distinto cliente, cantidades excesivas, duraciones negativas o pagos superiores al documento |

La cobertura se consulta desde registros; no se inventan cifras del dashboard.
No representa la totalidad ilimitada de casos empresariales ni certificación
enterprise. No se crean falsas fotografías de trabajos ni telemetría GPS: los
archivos existentes se conservan y esos casos requieren evidencias reales o
ilustraciones expresamente identificadas. Los controles de solapamiento, stock,
capacidad, acceso y seguridad siguen siendo los mismos servicios del producto.

## Geografía: referencias públicas, no domicilios atribuidos

Ocho direcciones de parques, bibliotecas y edificios municipales de Saddle Brook,
Ridgewood, Rochelle Park y Bloomfield. Cada referencia puede representar varias
localidades ficticias; no son ochenta predios distintos verificados ni contratos
con estas instituciones. No se desplazan coordenadas arbitrariamente para simular
domicilios. Las coordenadas se obtuvieron del geocodificador US Census
`Public_AR_Current` el 2026-11-16; son interpolaciones, no levantamientos GPS.
Sirven para examinar posicionamiento y trayectos entre referencias; el tráfico,
rutas por carretera y la optimización del proveedor continúan pendientes.

Fuentes primarias de direcciones:

- [Bergen County: Saddle River Park y áreas](https://www.co.bergen.nj.us/images/Departments__Services/Parks/Permits_And_Fees/2021/07/2022_General_Picnic_Application.pdf).
- [Saddle Brook: complejo municipal](https://saddlebrooknj.us/saddle-brook-tax-collectors-office/home/).
- [Ridgewood Public Library](https://ridgewoodlibrary.org/wp-content/uploads/2024/11/Ridgewood-Library-Generator-RFP-11_13_2024-update.pdf).
- [Rochelle Park: registro municipal](https://www.rochelleparknj.gov/registrar/).
- [Essex County: Brookdale Park](https://essexcountyparks.org/index.php/parks/brookdale-park).
- [Bloomfield Public Library](https://www.bplnj.org/hours-location).
- [US Census geocoder](https://geocoding.geo.census.gov/geocoder/).

## Siete años calendario

Se mantiene el año en curso y los seis anteriores: durante 2026, 2020–2026;
al comenzar 2027, 2021–2027. Registros anteriores son candidatos a archivo,
**no a borrado automático**. Clientes, activos y contratos aún vigentes, saldos
abiertos, reclamaciones, referencias históricas y otras dependencias se retienen.

Antes de retirar cualquier conjunto: seleccionar su cierre relacional completo,
crear copia independiente cifrada con inventario y huella, comprobar su descifrado,
restaurar en destino aislado, reconciliar documentos/archivos y registrar resultado
y ubicación externa. Mantener metadatos mínimos que permitan localizar el archivo.
Una copia en la misma base no cumple independencia; una copia en el mismo equipo
no sustituye almacenamiento externo. No hay trabajo programado de purga ni de
archivo automático. La decisión de ubicación externa y la restauración hospedada
continúan pendientes; aplicar la política no equivale a declarar esos pasos hechos.

El alcance incluye los datos sintéticos actuales como si fueran operativos. Una
venta no es requisito para hacer respaldos. Credenciales y llaves de cifrado se
administran por separado; jamás se incluyen en los informes públicos.
