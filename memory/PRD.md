# PRD — Aplicaciones Fitosanidad — AJVJ Hidropónicos

## Problem Statement (original)
Sistema de gestión fitosanitaria para invernaderos hidropónicos. Permite a un equipo
técnico (asesor, monitor, jefe de producción) registrar aplicaciones de agroquímicos
por módulo y ciclo de cultivo, controlar inventario automáticamente, registrar
compras, generar órdenes de pedido en PDF con identidad corporativa AJVJ, y
visualizar indicadores de gasto en un dashboard interactivo.

## Stack
- **Backend**: FastAPI + Motor (MongoDB) + JWT (bcrypt + PyJWT) + reportlab (PDF)
- **Frontend**: React 19 + TailwindCSS + Recharts + Sonner toasts + Lucide icons
- **DB**: MongoDB (`ajvj_fitosanidad`)
- **Auth**: JWT Bearer en header `Authorization`, token en localStorage(`ajvj_token`)

## Personas / Roles
- **Admin (Asesor)**: acceso total. Crea usuarios, configura módulos/ciclos/catálogos, edita inventario, gestiona compras, genera PDFs, ve dashboard.
- **Monitor / Jefe**: captura y consulta. No modifica catálogos ni usuarios.

## Implementado (Feb 2026)
### Backend (FastAPI · `/api/*`)
- Auth JWT: `POST /api/auth/login`, `GET /api/auth/me`. Admin sembrado en startup.
- Users CRUD (solo admin)
- Config (empresa, asesor, jefe_produccion, objetivos[], categorias_producto[])
- Módulos con ciclos anidados (1 o 2 ciclos por módulo, cultivo independiente)
- Productos (catálogo con dosis/unidad/precio)
- Inventario con stock + kardex de movimientos (entrada/salida/ajuste)
- Compras: registrar compra → suma a inventario + movimiento entrada
- Bitácoras: crear → calcula costo total + descuenta inventario por producto + movimientos salida. Eliminar revierte movimientos.
- Pedidos: `POST /api/pedidos/calcular` (necesito vs tengo en rango), `POST /api/pedidos/pdf` (PDF reportlab con membrete AJVJ, subtotales por categoría)
- Dashboard: agregaciones para KPIs, costo por módulo/objetivo/cultivo/tipo, gasto por mes, top 10 productos, inventario valorizado.

### Frontend (React + Tailwind, paleta AJVJ)
- `/login` con logo AJVJ y portada de invernadero
- `/dashboard` con 4 KPIs + 6 gráficas Recharts + tabla inventario valorizado
- `/captura` con captura semanal/individual, mezclas N productos por aplicación, cálculo de cantidad por unidad de dosis (mL/L, L/ha, mL/planta…), conversión a unidad base, costo en vivo
- `/inventario` con kardex expandible y badges (OK / stock bajo / stock negativo) + ajuste manual (admin)
- `/compras` con autocomplete de productos, filtro de búsqueda
- `/pedidos` con selector multi-módulo + rango de fechas + descarga PDF
- `/historial` con filtros (módulo, ciclo, cultivo, producto, fechas) + filas expandibles
- `/config` con tabs Empresa, Módulos & Ciclos, Productos, Catálogos
- `/usuarios` (admin) con creación de usuarios y roles
- Sidebar fijo (`#4B5828`) + drawer mobile + ProtectedRoute con `adminOnly`

## Tests
- 16/16 backend pytest (`/app/backend/tests/backend_test.py`) ✅
- 8/8 páginas cargan sin errores (Playwright) ✅
- Flujo completo validado: compra → bitácora descuenta inventario → pedido calcula → PDF se genera → delete bitácora revierte inventario.

## Backlog (P0 / P1 / P2)
### P0 (siguientes pasos sugeridos)
- Validación de stock al crear bitácora (advertir si quedará negativo)
- Componente Calendar de shadcn en `/pedidos` (en lugar de input nativo)

### P1
- Migrar `@app.on_event` a lifespan handler (FastAPI moderno)
- Validar dependencias en DELETE de módulos / productos para evitar huérfanos
- Exportar bitácoras individuales en PDF con membrete AJVJ
- Exportar movimientos de inventario en Excel
- Buscador global de bitácoras por nombre de producto

### P2
- Cálculo de cantidad_usada_total también en backend (defensa cliente)
- Dividir `server.py` en routers por dominio
- Notificaciones de stock bajo

## Credenciales
- Admin: `admin@ajvj.com` / `admin123`
- Ver `/app/memory/test_credentials.md`
