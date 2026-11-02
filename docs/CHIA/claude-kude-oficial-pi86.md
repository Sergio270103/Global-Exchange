# CHIA – PI-86 (continuación): KuDE y XML oficiales de Factura Segura

| Campo | Detalle |
|---|---|
| Historia (Jira) | PI-86 – Descargar Facturas (continuación de la versión con PDF propio) |
| Relacionada con | PI-30 (emitir factura), PI-84 (estado de la factura) |
| Integrante | JohanaBea |
| Herramienta de IA | Claude (Anthropic), chat en claude.ai |
| Fecha | 24/10/2026 |

## 1. Objetivo

La primera versión de PI-86 genera el PDF en el navegador (jsPDF) con los
datos guardados de la factura. Con la primera factura real aprobada por SIFEN
(`001-003-0000100`, OP-41) se pidió descargar el **documento oficial**: el
KuDE (PDF) y el XML firmado que genera Factura Segura.

## 2. Solución

### Backend (`backend/facturacion/`)

- **`cliente_fs.descargar()`:** operaciones `dwn_kude` y `dwn_xml` del manual
  (`GET {URL}/{operation}/{dRucEm}/{CDC}` con el header `Authentication-Token`).
  Valida que llegue un PDF o un XML; si la API responde un JSON de error, muestra
  su `description`. Según el manual, descargar no genera ni consume números.
- **Endpoints:** `GET /api/facturas/{id}/kude/` y `GET /api/facturas/{id}/xml/`.
  Solo para facturas **reales** y **aprobadas**; respetan la visibilidad del
  listado (cada usuario ve solo sus facturas, el admin todas). El token queda
  en el backend y nunca llega al navegador.

### Frontend

- **`services/api.ts`:** `apiDescargar()` para bajar archivos con el token de Keycloak.
- **`services/facturasDescarga.ts`:** `descargarDocumentoOficial()` y `guardarArchivo()`.
- **`pages/Invoices.tsx`:** en una factura real aprobada, el botón **PDF** baja
  el KuDE oficial y aparece el botón **XML**. Las simuladas siguen con el PDF
  propio de la primera versión (no tienen documento oficial).

## 3. Decisiones

| Decisión | Motivo |
|---|---|
| La descarga pasa por el backend | El token del ESI no puede quedar expuesto en el navegador |
| Se conserva el PDF propio para las simuladas | Su CDC es falso: Factura Segura no tiene documento para ellas |
| Pruebas en archivos nuevos | No modificar las pruebas de la primera versión de PI-86 |

## 4. Verificación

- **Backend:** 5 pruebas nuevas en `facturacion/test_descargas.py` (KuDE, XML,
  solo aprobadas y reales, error de Factura Segura, otro usuario). `requests.get`
  está simulado: no se usa la red. Todo el proyecto en verde (276 pruebas).
- **Frontend:** `InvoicesKude.test.tsx` y `facturasOficiales.test.ts`; todo el
  proyecto en verde (371 pruebas), sin errores de tipos y `npm run build` OK.
