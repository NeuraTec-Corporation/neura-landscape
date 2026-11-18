# Google Maps — piloto de Landscape

## Alcance

Integración con Maps JavaScript API, Places API (New) y Routes API en el Preview de la rama existente. El mapa carga por acción explícita, sin Street View, tráfico en vivo ni seguimiento de personas. Las ubicaciones de las visitas se obtienen dentro de la empresa autenticada y requieren lectura de visitas y personal. Las búsquedas de direcciones requieren lectura de clientes o propiedades. Ninguna clave privada llega al navegador.

Places usa autocompletado y Place Details Essentials (`id,addressComponents,location`), sin fotos, reseñas ni campos Pro/Enterprise. Routes usa matriz DRIVE / TRAFFIC_UNAWARE; solo coordenadas, sin nombres de clientes. La propuesta aplica la heurística existente de siguiente parada factible por tiempo vial, con acceso del inmueble, duración, descanso y retorno dentro del turno. No es una prueba de óptimo global. No cambia citas ni asignaciones ni certifica disponibilidad de personal/equipo: Agenda conserva esos controles. Una visita iniciada o con asignación pendiente de revisión bloquea la propuesta.

## Protección de consumo

| Uso | Google: máximo diario configurado | Landscape: máximo mensual |
|---|---:|---:|
| Cargas de mapa | 100 | 3.000 |
| Autocompletado | 100 | 3.000 |
| Detalles del lugar | 50 | 1.500 |
| Elementos de matriz vial | 250 | 7.500 |

Landscape aplica además los mismos máximos diarios. Los contadores son compartidos por todas las empresas y persistidos en `public.entity_sequences`, mediante una única transacción que reserva mes y día antes de cada consulta. Se usa America/Los_Angeles para coincidir con el reinicio diario del proveedor. Un error del proveedor no devuelve unidades ni desencadena reintentos automáticos. Alcanzar una cuota devuelve 429 y conserva las funciones manuales.

Una matriz de N puntos (base + visitas) consume N² elementos. Máximo 14 visitas por cálculo, sin recortar paradas silenciosamente. El cliente muestra las visitas que no caben y divide la navegación móvil en tramos con un máximo de 3 puntos intermedios. El regreso a la base tiene enlace separado.

Objetivo de uso USD 0 dentro de los cupos gratuitos verificados de los SKUs Essentials; no se contrató plan mensual. Las cuotas no son un contrato de gasto cero: cambios de Google, otros proyectos sobre la misma cuenta, otras APIs/campos o cambios manuales pueden causar cobros. Los presupuestos/alertas no sustituyen estos bloqueos. No ampliar límites sin revisar precios y unidades.

## Configuración y reutilización

Variables de servidor solo en Preview de `feat/bootstrap-foundation`: `LANDSCAPE_MAPS_ENABLED=true`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY`. La última pareja reutiliza una sola clave privada restringida a Places New y Routes. La clave de navegador se restringe a Maps JavaScript y al origen estable de Preview. OAuth de ingreso permanece independiente. Para detener las consultas, establecer `LANDSCAPE_MAPS_ENABLED=false` y redesplegar.

`src/modules/maps` implementa límites/adaptador Google sin dependencia de interfaces; `src/integrations/road-planning.mjs` mantiene el algoritmo independiente del proveedor. Los handlers conectan esos puertos a la identidad y almacenamiento de la empresa. No se requiere nueva base, migración ni proyecto. Las credenciales quedan fuera del repositorio y los respaldos documentales.

Referencias oficiales: [control de costos](https://developers.google.com/maps/billing-and-pricing/manage-costs), [seguridad de claves](https://developers.google.com/maps/api-security-best-practices), [matriz vial](https://developers.google.com/maps/documentation/routes/compute_route_matrix).
