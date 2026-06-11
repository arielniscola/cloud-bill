# Manual de Usuario — Cloud-Bill

**Sistema de Gestión Comercial**
Versión 1.1 — Junio 2026

---

## Tabla de Contenidos

1. [Introducción](#1-introducción)
2. [Acceso al Sistema](#2-acceso-al-sistema)
3. [Roles y Permisos](#3-roles-y-permisos)
4. [Inicio y Panel Principal](#4-inicio-y-panel-principal)
5. [Ventas](#5-ventas)
   - 5.1 [Órdenes de Pedido](#51-órdenes-de-pedido)
   - 5.2 [Presupuestos](#52-presupuestos)
   - 5.3 [Facturas](#53-facturas)
   - 5.4 [Remitos](#54-remitos)
   - 5.5 [Recibos](#55-recibos)
   - 5.6 [Clientes](#56-clientes)
   - 5.7 [Cuentas Corrientes](#57-cuentas-corrientes)
6. [Compras](#6-compras)
   - 6.1 [Proveedores](#61-proveedores)
   - 6.2 [Órdenes de Compra](#62-órdenes-de-compra)
   - 6.3 [Compras](#63-compras)
   - 6.4 [Órdenes de Pago](#64-órdenes-de-pago)
7. [Catálogo](#7-catálogo)
   - 7.1 [Productos](#71-productos)
   - 7.2 [Categorías y Marcas](#72-categorías-y-marcas)
   - 7.3 [Stock e Inventario](#73-stock-e-inventario)
   - 7.4 [Almacenes](#74-almacenes)
   - 7.5 [Stock Inteligente](#75-stock-inteligente)
   - 7.6 [Rubros](#76-rubros)
   - 7.7 [Campos Personalizados de Producto](#77-campos-personalizados-de-producto)
8. [Finanzas](#8-finanzas)
   - 8.1 [Cajas](#81-cajas)
   - 8.2 [Banco de Cheques](#82-banco-de-cheques)
   - 8.3 [Cuentas Bancarias](#83-cuentas-bancarias)
   - 8.4 [Libro IVA](#84-libro-iva)
   - 8.5 [Reporte de Ventas](#85-reporte-de-ventas)
   - 8.6 [Tarjetas](#86-tarjetas)
   - 8.7 [MercadoPago](#87-mercadopago)
   - 8.8 [Contabilidad](#88-contabilidad)
9. [Configuración del Sistema](#9-configuración-del-sistema)
10. [Impresión Térmica](#10-impresión-térmica)
11. [Gestión de Empresas y Usuarios (Super Admin)](#11-gestión-de-empresas-y-usuarios-super-admin)

---

## 1. Introducción

**Cloud-Bill** es un sistema de gestión comercial diseñado para pequeñas y medianas empresas argentinas. Permite administrar el ciclo completo de ventas y compras: desde la generación de presupuestos y facturas hasta el control de stock, pagos y cuentas corrientes.

### Características principales

- Emisión de facturas, presupuestos, remitos y recibos
- Control de stock con múltiples almacenes
- Gestión de compras y proveedores
- Cuentas corrientes por cliente
- Integración con AFIP (facturación electrónica)
- Cobros con tarjeta (recargos por cuotas) y MercadoPago
- Contabilidad por partida doble con plan de cuentas
- Libro IVA y reportes de ventas
- Gestión de cajas, cheques y cuentas bancarias
- Catálogo flexible: categorías, marcas, rubros y campos personalizados
- Multi-empresa con módulos y planes configurables por empresa
- Acceso por roles con permisos granulares

---

## 2. Acceso al Sistema

### Inicio de sesión

1. Abrir el navegador y acceder a la URL del sistema.
2. Ingresar el **usuario** (email) y la **contraseña** provistos por el administrador.
3. Hacer clic en **Ingresar**.

Una vez autenticado, el sistema redirige automáticamente según el rol del usuario:
- **SUPER_ADMIN** → Página de empresas (`/companies`)
- **Otros roles** → Inicio (`/`)

### Cierre de sesión

Hacer clic en el ícono de usuario en la esquina superior derecha y seleccionar **Cerrar sesión**.

---

## 3. Roles y Permisos

El sistema cuenta con cuatro roles de usuario:

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **SUPER_ADMIN** | Administrador global del sistema | Solo gestión de empresas y usuarios |
| **ADMIN** | Administrador de empresa | Acceso completo a su empresa |
| **SELLER** | Vendedor | Ventas, catálogo y stock |
| **WAREHOUSE_CLERK** | Encargado de depósito | Solo lectura |

### Accesos por módulo

| Módulo | ADMIN | SELLER | WAREHOUSE_CLERK |
|--------|-------|--------|-----------------|
| Dashboard | ✓ | ✓ | ✓ |
| Ventas (facturas, presupuestos, etc.) | ✓ | ✓ | Solo lectura |
| Compras (proveedores, órdenes de compra) | ✓ | ✗ | ✗ |
| Catálogo (productos, stock) | ✓ | ✓ | Solo lectura |
| Finanzas (cajas, IVA, reportes) | ✓ | ✗ | ✗ |
| Configuración | ✓ | ✗ | ✗ |

> **Nota:** Los módulos visibles también dependen de cuáles estén habilitados para la empresa (configurable por el SUPER_ADMIN).

---

## 4. Inicio y Panel Principal

### Página de inicio

**Ruta:** `/`

Es la primera pantalla que se ve al iniciar sesión. Muestra:

- Un saludo personalizado ("Bienvenido, [nombre]").
- **Accesos rápidos configurables:** una grilla de atajos a las funciones más usadas (nueva factura, clientes, stock, etc.).
- **Accesos a los módulos** disponibles según el rol del usuario y los módulos habilitados de la empresa.

#### Configurar los accesos rápidos

Cada usuario puede personalizar sus propios accesos rápidos:

1. En la sección **Accesos rápidos**, hacer clic en **Editar**.
2. En el modal, **agregar** atajos desde la lista de disponibles y **quitar** los que no se usen.
3. **Reordenarlos** con las flechas (subir / bajar).
4. Hacer clic en **Guardar**.

> La configuración se guarda por usuario. Los accesos disponibles dependen del rol, el plan y los módulos habilitados de la empresa.

### Panel Principal (Dashboard)

**Ruta:** `/dashboard`

El dashboard muestra indicadores clave del negocio en tiempo real:

- **Ventas del período:** total facturado, cantidad de facturas emitidas.
- **Ingresos cobrados:** total recibido en el período.
- **Stock crítico:** productos con stock por debajo del mínimo.
- **Cuentas corrientes:** saldo total a cobrar.
- **Gráficos de ventas:** evolución por período.
- **Últimas operaciones:** acceso a las transacciones recientes (órdenes de pedido, pagos, remitos).

---

## 5. Ventas

### 5.1 Órdenes de Pedido

**Ruta:** `/orden-pedidos`

Las órdenes de pedido permiten registrar solicitudes de compra de los clientes antes de emitir una factura formal.

#### Crear una orden de pedido

1. Ir a **Ventas → Órdenes de Pedido**.
2. Hacer clic en **Nueva orden**.
3. Completar los campos:
   - **Cliente** (requerido)
   - **Productos/ítems** con cantidad y precio
   - **Observaciones** (opcional)
4. Guardar con **Crear orden**.

#### Estados posibles

| Estado | Descripción |
|--------|-------------|
| PENDING | Pendiente de atención |
| IN_PROGRESS | En proceso |
| READY | Lista para entrega |
| DELIVERED | Entregada |
| CANCELLED | Cancelada |

#### Impresión térmica

Desde el detalle de una orden, hacer clic en **Imprimir** para abrir la vista de impresión térmica optimizada para ticket.

---

### 5.2 Presupuestos

**Ruta:** `/budgets`

Los presupuestos son cotizaciones enviadas a clientes que pueden convertirse en facturas o cobrarse directamente.

#### Crear un presupuesto

1. Ir a **Ventas → Presupuestos** y hacer clic en **Nuevo presupuesto**.
2. Completar:
   - **Cliente** (requerido)
   - **Condición de cobro:** CONTADO o CUENTA CORRIENTE
   - **Condiciones de venta** (plazo de pago, etc.)
   - **Ítems:** descripción, cantidad, precio unitario, descuento por ítem. Se puede asociar un producto del catálogo o ingresar descripción libre.
3. Guardar como **BORRADOR** o enviarlo directamente.

#### Flujo de un presupuesto

```
BORRADOR → ENVIADO → ACEPTADO → CONVERTIDO (a factura)
                   → RECHAZADO
                   → EXPIRADO
         → PAGO PARCIAL → PAGADO
```

#### Cobrar un presupuesto

Desde el detalle del presupuesto, hacer clic en **Registrar pago**. El sistema crea un recibo y actualiza el estado:
- Si se paga parcialmente → estado **PAGO PARCIAL**
- Si se paga el total → estado **PAGADO**

#### Convertir a factura

1. Abrir el presupuesto aceptado.
2. Hacer clic en **Convertir a factura**.
3. El sistema crea una factura en estado BORRADOR con los mismos ítems.
4. El presupuesto queda en estado **CONVERTIDO**.

---

### 5.3 Facturas

**Ruta:** `/invoices`

Las facturas son los comprobantes fiscales de venta. Soportan integración con AFIP para facturación electrónica.

#### Tipos de comprobante

- **Factura A** — Clientes responsables inscriptos
- **Factura B** — Consumidores finales / monotributistas
- **Factura C** — Emisor monotributista
- **Nota de Crédito (NC)** — Anulación/ajuste de una factura
- **Nota de Débito (ND)** — Cargo adicional sobre una factura

#### Crear una factura

1. Ir a **Ventas → Facturas** y hacer clic en **Nueva factura**.
2. Completar los campos obligatorios:
   - **Cliente**
   - **Tipo de comprobante** (A, B, C — se sugiere según condición impositiva del cliente)
   - **Condición de cobro:** CONTADO o CUENTA CORRIENTE
   - **Ítems:** producto (del catálogo), cantidad, precio, descuento
3. Opciones adicionales:
   - **Descontar stock al crear:** Si está marcado, el stock se descuenta inmediatamente (DISCOUNT). Si está desmarcado, se reserva sin descontar (RESERVE).
   - **Registrar pago al crear:** Permite registrar el cobro en el mismo formulario.
4. Hacer clic en **Crear factura**.

#### Notas de Crédito y Débito

Para emitir una NC o ND vinculada a una factura existente:

1. Abrir la factura original.
2. Hacer clic en **Generar NC** o **Generar ND**.
3. El sistema pre-carga el formulario con el comprobante de origen vinculado.
4. Ajustar los ítems y confirmar.

#### Cobrar una factura

1. Abrir la factura emitida.
2. Hacer clic en **Registrar pago**.
3. Completar:
   - **Monto** (permite pagos parciales)
   - **Método de pago:** Efectivo, Transferencia, Cheque, Tarjeta
   - **Caja** (si aplica)
   - **Referencia / Banco / Cuotas** (según método)
4. Confirmar. Se genera un **Recibo** automáticamente.

#### Estados de una factura

| Estado | Descripción |
|--------|-------------|
| DRAFT | Borrador (no emitida) |
| ISSUED | Emitida |
| PAID | Pagada totalmente |
| PARTIALLY_PAID | Pago parcial recibido |
| CANCELLED | Anulada |

---

### 5.4 Remitos

**Ruta:** `/remitos`

Los remitos son comprobantes de entrega de mercadería. Pueden estar vinculados a una factura o presupuesto, o ser independientes.

#### Crear un remito

1. Ir a **Ventas → Remitos** y hacer clic en **Nuevo remito**.
2. Opciones:
   - **Remito vinculado:** seleccionar factura o presupuesto de origen. Los ítems se cargan automáticamente.
   - **Remito independiente:** cargar ítems manualmente.
3. Completar destinatario y dirección de entrega.
4. Guardar.

#### Entregar un remito

Desde el detalle del remito, hacer clic en **Marcar como entregado**. Si el remito estaba vinculado a un documento con comportamiento RESERVE, el stock se descuenta en este momento.

#### Comportamiento de stock en remitos

| Origen | Comportamiento | Cuándo descuenta stock |
|--------|---------------|----------------------|
| Factura/Presupuesto DISCOUNT | No mueve stock | Al crear factura/presupuesto |
| Factura/Presupuesto RESERVE | Libera reserva + mueve stock | Al entregar el remito |
| Independiente | Siempre DISCOUNT | Al crear el remito |

---

### 5.5 Recibos

**Ruta:** `/recibos`

Los recibos documentan los pagos recibidos de los clientes. Se generan automáticamente al cobrar una factura o presupuesto.

#### Ver un recibo

1. Ir a **Ventas → Recibos**.
2. Buscar por número, cliente o fecha.
3. Hacer clic en el recibo para ver el detalle.

#### Cancelar un recibo

1. Abrir el recibo.
2. Hacer clic en **Cancelar recibo**.
3. Confirmar. El sistema:
   - Revierte el movimiento de cuenta corriente (si aplica).
   - Recalcula el estado de la factura o presupuesto.

> **Importante:** La cancelación de un recibo no elimina el comprobante, lo marca como CANCELADO.

#### Número de recibo

El formato es: `REC-AAAA-XXXXXXXX` (ej: `REC-2026-00000001`).

---

### 5.6 Clientes

**Ruta:** `/customers`

#### Crear un cliente

1. Ir a **Ventas → Clientes** y hacer clic en **Nuevo cliente**.
2. Completar:
   - **Razón social / Nombre**
   - **CUIT** (número de identificación fiscal)
   - **Condición IVA:** Responsable Inscripto, Monotributista, Consumidor Final, Exento
   - **Condición de venta predeterminada:** CONTADO o CUENTA CORRIENTE
   - **Email, teléfono, dirección** (opcional)
3. Guardar.

#### Condición de venta predeterminada

Al seleccionar un cliente en el formulario de factura o presupuesto, el sistema auto-completa la condición de cobro y las condiciones de venta según lo configurado en el cliente:
- **CUENTA CORRIENTE** → genera movimientos en cuenta corriente
- **CONTADO** → no genera movimientos en cuenta corriente

---

### 5.7 Cuentas Corrientes

**Ruta:** `/current-accounts`

Las cuentas corrientes registran el saldo deudor/acreedor de cada cliente.

#### Ver el estado de cuenta de un cliente

1. Ir a **Ventas → Cuentas Corrientes**.
2. Hacer clic en el cliente para ver su estado de cuenta.
3. La pantalla muestra:
   - Saldo actual
   - Historial de movimientos (débitos por facturas, créditos por pagos)

#### Cuándo se generan movimientos

Los movimientos de cuenta corriente se generan **solo cuando la condición de cobro es CUENTA CORRIENTE**:

| Evento | Movimiento |
|--------|-----------|
| Crear factura | DÉBITO por el monto de la factura |
| Cobrar factura | CRÉDITO por el monto cobrado |
| Anular factura | Reversión del débito |
| Cobrar presupuesto | CRÉDITO por el monto cobrado |
| Convertir presupuesto a factura | DÉBITO por el monto |

---

## 6. Compras

> **Acceso:** Solo rol ADMIN (y módulo "compras" habilitado).

### 6.1 Proveedores

**Ruta:** `/suppliers`

Gestión del directorio de proveedores.

#### Crear un proveedor

1. Ir a **Compras → Proveedores** y hacer clic en **Nuevo proveedor**.
2. Completar razón social, CUIT, condición IVA, contacto y dirección.
3. Guardar.

---

### 6.2 Órdenes de Compra

**Ruta:** `/orden-compras`

Las órdenes de compra son solicitudes formales de compra enviadas a proveedores.

#### Crear una orden de compra

1. Ir a **Compras → Órdenes de Compra** y hacer clic en **Nueva orden**.
2. Seleccionar el **proveedor**.
3. Agregar ítems con descripción, cantidad y precio estimado.
4. Guardar y enviar al proveedor.

#### Recibir mercadería

Desde el detalle de la orden de compra, hacer clic en **Recibir mercadería** para registrar la entrada al stock.

---

### 6.3 Compras

**Ruta:** `/purchases`

Registro de compras efectivamente realizadas (facturas de proveedor).

#### Registrar una compra

1. Ir a **Compras → Compras** y hacer clic en **Nueva compra**.
2. Completar:
   - **Proveedor**
   - **Número de comprobante** del proveedor
   - **Almacén destino** (opcional — para auto-registrar movimiento de stock)
   - **Ítems:** descripción, cantidad, precio unitario. Si se selecciona un **producto del catálogo**, el sistema genera automáticamente un movimiento de stock de tipo COMPRA.
3. Guardar.

---

### 6.4 Órdenes de Pago

**Ruta:** `/orden-pagos`

Las órdenes de pago registran los pagos realizados a proveedores.

#### Crear una orden de pago

1. Ir a **Compras → Órdenes de Pago** y hacer clic en **Nueva orden de pago**.
2. Seleccionar el **proveedor** y los **comprobantes de compra** a cancelar.
3. Indicar el método de pago y el monto.
4. Guardar.

---

## 7. Catálogo

### 7.1 Productos

**Ruta:** `/products`

#### Crear un producto

1. Ir a **Catálogo → Productos** y hacer clic en **Nuevo producto**.
2. Completar:
   - **Nombre** (requerido)
   - **Código / SKU**
   - **Categoría** y **Marca**
   - **Precio de venta**
   - **Precio de costo**
   - **IVA aplicable**
   - **Lead time en días** (para cálculo de stock inteligente)
3. Guardar.

#### Actualización masiva de precios

1. Ir a **Catálogo → Productos**.
2. Hacer clic en **Actualizar precios en masa**.
3. Seleccionar los productos, el tipo de ajuste (porcentaje o valor fijo) y confirmar.

---

### 7.2 Categorías y Marcas

**Rutas:** `/categories` | `/brands`

Permiten organizar el catálogo de productos.

- **Categorías:** jerarquía de clasificación de productos (ej: Electrónica > Celulares).
- **Marcas:** fabricante o marca comercial del producto.

---

### 7.3 Stock e Inventario

**Ruta:** `/stock`

#### Panel de inventario

Muestra:
- **Alertas de stock:** productos con cantidad disponible por debajo del mínimo.
- **Tabla de productos:** stock actual, reservado, disponible y mínimo por almacén.
- Acciones rápidas por fila: ajuste rápido de cantidad y edición del stock mínimo.

#### Ajuste rápido de stock

Desde la tabla de stock, hacer clic en el ícono de edición de una fila para ingresar directamente la nueva cantidad.

#### Conteo físico

**Ruta:** `/stock/physical-count`

Permite realizar un inventario físico por almacén:

1. Seleccionar el **almacén**.
2. La tabla muestra el stock del sistema vs. el stock contado.
3. Ingresar la cantidad real de cada producto.
4. Hacer clic en **Aplicar ajuste**. El sistema genera movimientos de ADJUSTMENT_IN o ADJUSTMENT_OUT por las diferencias.

#### Movimientos de stock

**Ruta:** `/stock/movements`

Historial completo de todos los movimientos de inventario con filtros por:
- Tipo de movimiento
- Almacén
- Producto
- Rango de fechas

#### Tipos de movimiento

| Tipo | Descripción |
|------|-------------|
| PURCHASE | Entrada por compra |
| SALE | Salida por venta (factura) |
| ADJUSTMENT_IN | Ajuste positivo |
| ADJUSTMENT_OUT | Ajuste negativo |
| TRANSFER_IN | Entrada por transferencia |
| TRANSFER_OUT | Salida por transferencia |
| RETURN | Devolución de cliente |
| REMITO_OUT | Salida por entrega de remito |
| RESERVATION | Reserva de stock |
| RESERVATION_RELEASE | Liberación de reserva |

#### Transferencia entre almacenes

**Ruta:** `/stock/transfer`

1. Seleccionar **almacén origen** y **almacén destino**.
2. Agregar los productos y cantidades a transferir.
3. Confirmar. El sistema genera movimientos TRANSFER_OUT (origen) y TRANSFER_IN (destino).

#### Exportar stock

Desde el detalle de un almacén, hacer clic en **Exportar CSV** para descargar el stock completo en formato CSV compatible con Excel.

---

### 7.4 Almacenes

**Ruta:** `/warehouses`

Los almacenes representan ubicaciones físicas donde se guarda la mercadería.

#### Crear un almacén

1. Ir a **Catálogo → Almacenes** y hacer clic en **Nuevo almacén**.
2. Ingresar nombre y descripción.
3. Guardar.

#### Detalle de almacén

El detalle muestra:
- **Valorización total** del stock en ese almacén.
- **Tabla de stock** con cantidades y alertas.
- **Exportar CSV** del stock del almacén.

---

### 7.5 Stock Inteligente

**Ruta:** `/stock/intelligence`

Análisis automatizado del inventario para identificar riesgos y oportunidades.

#### Indicadores calculados

| Indicador | Descripción |
|-----------|-------------|
| **Días hasta quiebre** | Estimación de cuántos días dura el stock actual al ritmo de ventas |
| **Cantidad recomendada a comprar** | Calculada en base a lead time + días de seguridad |
| **Stock muerto** | Productos sin ventas en los últimos N días (configurable) |
| **Capital inmovilizado** | Valor del stock sin rotación |

#### Niveles de riesgo

| Nivel | Condición |
|-------|-----------|
| **CRÍTICO** | Días hasta quiebre < días de seguridad configurados |
| **ALERTA** | Días hasta quiebre < días de seguridad × 2 |
| **SIN DATOS** | No hay ventas registradas del producto |
| **OK** | Stock suficiente |

#### Filtros disponibles

- **Almacén**
- **Período de análisis** (días de historial de ventas)

---

### 7.6 Rubros

**Ruta:** `/rubros`

Los rubros (o líneas de producto) son una clasificación adicional del catálogo, complementaria a categorías y marcas (ej: "Limpieza", "Bebidas", "Ferretería").

#### Crear un rubro

1. Ir a **Catálogo → Rubros** y hacer clic en **Nuevo rubro**.
2. Completar **nombre** y **descripción** (opcional).
3. Guardar.

Los rubros pueden activarse o desactivarse sin eliminarlos.

#### Asignar un rubro a un producto

En el formulario de producto, en la sección **Clasificación**, seleccionar el **Rubro** (junto a Categoría y Marca).

---

### 7.7 Campos Personalizados de Producto

**Ruta:** `/products/custom-fields`

Permite definir campos adicionales propios de la empresa para los productos, más allá de los campos estándar (nombre, SKU, precio, etc.).

#### Definir un campo personalizado

1. Ir a **Catálogo → Campos personalizados** y hacer clic en **Nuevo campo**.
2. Completar:
   - **Nombre** del campo.
   - **Tipo:** Texto, Número, Fecha, Sí/No (booleano) o Lista de opciones (SELECT).
   - Para tipo **Lista de opciones (SELECT):** ingresar las opciones separadas por coma (mínimo 2). Ej: `Chico, Mediano, Grande`.
   - **Requerido:** marcar si el campo es obligatorio al cargar un producto.
3. Guardar.

Los campos definidos se pueden **reordenar** (con las flechas) y **activar/desactivar**.

#### Cargar valores

Una vez definidos, los campos personalizados aparecen en el formulario de producto, donde se completa el valor correspondiente a cada producto.

---

## 8. Finanzas

> **Acceso:** Solo rol ADMIN (y módulo "finanzas" habilitado).

### 8.1 Cajas

**Ruta:** `/cash-registers`

Las cajas registran los ingresos y egresos de efectivo del negocio.

#### Crear una caja

1. Ir a **Finanzas → Cajas** y hacer clic en **Nueva caja**.
2. Ingresar nombre (ej: "Caja Principal", "Caja Mostrador").
3. Guardar.

#### Detalle de caja

Muestra el saldo actual y el historial de movimientos asociados.

---

### 8.2 Banco de Cheques

**Ruta:** `/banco-cheques`

Gestión de cheques recibidos de clientes:
- Registro de cheques (monto, banco, fecha de vencimiento, librador)
- Estados: EN CARTERA, DEPOSITADO, RECHAZADO, ENDOSADO
- Historial de cheques por estado

---

### 8.3 Cuentas Bancarias

**Ruta:** `/banks`

Registro de cuentas bancarias de la empresa:
- Alta de cuentas con banco, tipo (caja de ahorro / cuenta corriente) y CBU
- Detalle con saldo y movimientos

---

### 8.4 Libro IVA

**Ruta:** `/iva`

Reporte del libro de IVA con:
- IVA compras (crédito fiscal)
- IVA ventas (débito fiscal)
- Saldo de IVA por período
- Filtros por período y tipo de comprobante

---

### 8.5 Reporte de Ventas

**Ruta:** `/reports/sales`

Análisis de ventas con:
- Total facturado por período
- Ventas por producto / categoría
- Ventas por cliente
- Comparativa entre períodos
- Exportación de datos

---

### 8.6 Tarjetas

**Ruta:** `/cards`
**Disponibilidad:** según el plan de la empresa (PRO o superior).

Permite definir las tarjetas de crédito/débito que acepta el negocio y los recargos por cuotas, para aplicarlos automáticamente al momento de cobrar.

#### Crear una tarjeta

1. Ir a **Finanzas → Tarjetas** y hacer clic en **Nueva tarjeta**.
2. Completar:
   - **Nombre** (ej: "Visa Crédito", "Mastercard Débito").
   - **Tipo:** CRÉDITO o DÉBITO.
   - **Banco** (opcional).
3. Para tarjetas de crédito, agregar los **recargos por cantidad de cuotas**: cada fila define una cantidad de cuotas y su porcentaje de recargo (ej: 3 cuotas → 10%).
4. Guardar.

#### Cobrar con tarjeta

Al registrar un pago de una factura o presupuesto y elegir el método **Tarjeta**:

1. Seleccionar la **tarjeta**.
2. Seleccionar la cantidad de **cuotas** (entre las definidas en los recargos de esa tarjeta).
3. El sistema muestra el **porcentaje de recargo** aplicado y el **total a cobrar** (monto base + recargo).

> **Nota:** El recargo se guarda como dato informativo en el recibo. El monto que se imputa al saldo de la factura/presupuesto es el **monto base** (sin el recargo).

---

### 8.7 MercadoPago

**Ruta:** `/mercadopago`
**Disponibilidad:** según el plan de la empresa (ENTERPRISE).

Integración con MercadoPago para cobrar facturas y presupuestos mediante link de pago y conciliar los movimientos de la cuenta.

#### Configuración

1. Ir a **Configuración → Pagos** (pestaña **Pagos**).
2. Completar las credenciales de MercadoPago:
   - **Access Token**
   - **Public Key**
   - **Webhook Secret**
   - **Modo:** Sandbox (pruebas) o Producción.
3. Guardar.

#### Cobrar con MercadoPago

1. Abrir el detalle de una **factura** o **presupuesto**.
2. Hacer clic en **Cobrar con MP**.
3. El sistema genera un **link / preferencia de pago** para compartir con el cliente.
4. Cuando el cliente paga, MercadoPago notifica al sistema (webhook) y el pago queda disponible para vincularse al comprobante.

#### Panel de MercadoPago

Desde **Finanzas → MercadoPago** se puede consultar:
- **Saldo** disponible en la cuenta.
- **Movimientos** registrados.
- Vinculación de pagos con facturas/presupuestos.

---

### 8.8 Contabilidad

**Rutas:** `/accounting/journal-entries` (Asientos Contables) · `/accounting/accounts` (Plan de Cuentas)
**Disponibilidad:** según el plan de la empresa (ENTERPRISE). Aparece como menú propio **Contabilidad**.

Módulo de contabilidad por partida doble. Genera asientos automáticamente a partir de las operaciones del sistema y permite también registrar asientos manuales.

#### Inicializar el plan de cuentas

La primera vez, ir a **Contabilidad → Plan de Cuentas** y hacer clic en **Inicializar plan de cuentas**. El sistema carga un plan de cuentas estándar para PyMEs argentinas (~70 cuentas) para la empresa.

#### Asientos automáticos

Al confirmar ciertas operaciones, el sistema genera el asiento de partida doble correspondiente, por ejemplo:
- Emisión de factura.
- Cobro de factura / pago a proveedor.
- Registro de compra.

#### Asientos manuales

1. Ir a **Contabilidad → Asientos Contables** y hacer clic en **Nuevo asiento**.
2. Agregar las **líneas** del asiento (cuenta, importe en el **Debe** o en el **Haber**).
3. El asiento debe **balancear** (total Debe = total Haber). El botón **Guardar asiento** se habilita únicamente cuando el asiento balancea.
4. Guardar.

#### Consultar asientos

La lista de **Asientos Contables** muestra todos los asientos (manuales y automáticos). Hacer clic en uno para ver su detalle con las líneas y cuentas afectadas.

---

## 9. Configuración del Sistema

**Ruta:** `/settings`
**Acceso:** Solo ADMIN

### Configuración General (Empresa)

- Razón social, CUIT, dirección, teléfono, email.
- Logo de la empresa (aparece en facturas, presupuestos y en el menú lateral).
- Condición IVA de la empresa.

> **Menú lateral:** el encabezado del menú lateral muestra el **nombre de la empresa logueada** junto a su **logo**. Si la empresa no tiene logo cargado, se muestra la **inicial del nombre** en su lugar.

### Configuración AFIP

Para habilitar la facturación electrónica:

1. Ir a **Configuración → AFIP**.
2. Ingresar:
   - **CUIT** de la empresa emisora.
   - **Certificado digital** (archivo `.crt` emitido por AFIP).
   - **Clave privada** (archivo `.key`).
   - **Punto de venta** habilitado en AFIP.
   - **Ambiente:** Testing (homologación) o Producción.
3. Guardar y verificar la conexión.

### Configuración de Precios

- Porcentaje de IVA por defecto.
- Reglas de redondeo de precios.

### Configuración de Presupuestos

- **Caja por defecto para cobros de presupuestos:** pre-selecciona la caja en el modal de pago.

### Configuración de Stock

- **Días de stock muerto:** cantidad de días sin ventas para clasificar un producto como "stock muerto" (por defecto: 90).
- **Días de seguridad:** días de stock de seguridad para alertas de quiebre (por defecto: 14).

### Configuración de Impresión

- Tipo de impresora (térmica / A4).
- Formato de ticket.
- Pie de página personalizado.

### Configuración de Email (SMTP)

- Servidor SMTP, puerto, usuario y contraseña.
- Email remitente.
- Permite enviar facturas y presupuestos por email directamente desde el sistema.

### Gestión de Usuarios (desde configuración)

El ADMIN puede ver los usuarios de su empresa y asignarles roles desde **Configuración → Usuarios**.

---

## 10. Impresión Térmica

El sistema incluye vistas optimizadas para impresoras térmicas de tickets.

### Imprimir una factura

1. Abrir el detalle de la factura.
2. Hacer clic en el botón **Imprimir**.
3. Se abre la vista térmica en una nueva pestaña con formato de 80mm.
4. Usar `Ctrl+P` o el botón de imprimir del navegador.

### Imprimir una orden de pedido

Desde el detalle de la orden de pedido, hacer clic en **Imprimir** para obtener el comprobante en formato ticket.

---

## 11. Gestión de Empresas y Usuarios (Super Admin)

> **Acceso:** Exclusivo para el rol SUPER_ADMIN.

### Empresas

**Ruta:** `/companies`

El SUPER_ADMIN gestiona las empresas (tenants) del sistema.

#### Crear una empresa

1. Ir a **Empresas** y hacer clic en **Nueva empresa**.
2. Completar razón social, CUIT, condición IVA, email de contacto y **plan**.
3. Opcionalmente, ingresar la **URL del logo** de la empresa (campo "Logo (URL)"). El logo se muestra en el menú lateral; si no se carga, se usa la inicial del nombre.
4. Guardar.

#### Configurar módulos habilitados

Desde el detalle de una empresa, en la sección **Módulos habilitados**:

- **ALL** → La empresa tiene acceso a todos los módulos.
- Selección individual: activar/desactivar módulos por empresa:
  - `ventas` — Facturas, presupuestos, clientes, etc.
  - `catalogo` — Productos, stock, almacenes.
  - `compras` — Proveedores, compras, órdenes.
  - `finanzas` — Cajas, IVA, reportes financieros.

### Usuarios

**Ruta:** `/users`

El SUPER_ADMIN puede crear y gestionar usuarios de cualquier empresa:

1. Ir a **Usuarios** y hacer clic en **Nuevo usuario**.
2. Completar email, nombre, contraseña.
3. Seleccionar la **empresa** a la que pertenece.
4. Asignar el **rol** (ADMIN, SELLER, WAREHOUSE_CLERK).
5. Guardar.

---

## Apéndice: Numeración de Comprobantes

| Comprobante | Formato | Ejemplo |
|-------------|---------|---------|
| Factura | Depende de AFIP (punto de venta + número) | `0001-00000001` |
| Presupuesto | `PRES-AAAA-XXXX` | `PRES-2026-0001` |
| Recibo | `REC-AAAA-XXXXXXXX` | `REC-2026-00000001` |

---

## Apéndice: Glosario

| Término | Definición |
|---------|-----------|
| **AFIP** | Administración Federal de Ingresos Públicos (organismo fiscal argentino) |
| **CUIT** | Clave Única de Identificación Tributaria |
| **IVA** | Impuesto al Valor Agregado |
| **Cuenta Corriente** | Modalidad de crédito donde el cliente paga después de recibir la mercadería |
| **Contado** | Pago al momento de la venta |
| **NC** | Nota de Crédito (ajuste a la baja de una factura) |
| **ND** | Nota de Débito (cargo adicional sobre una factura) |
| **Lead Time** | Tiempo de reposición del proveedor en días |
| **Stock de seguridad** | Cantidad mínima de stock para cubrir demanda durante el lead time |
| **Stock muerto** | Mercadería sin rotación durante un período prolongado |
| **Remito** | Comprobante de entrega de mercadería (no tiene valor fiscal) |
| **Tenant** | Empresa/organización dentro del sistema multi-empresa |
| **Rubro** | Línea o familia de productos; clasificación adicional a categoría y marca |
| **Partida doble** | Método contable donde cada asiento tiene Debe = Haber |
| **Asiento contable** | Registro de una operación en la contabilidad (líneas de Debe y Haber) |
| **Plan de cuentas** | Listado estructurado de las cuentas contables de la empresa |
| **Recargo por cuotas** | Porcentaje adicional aplicado al cobrar con tarjeta en cuotas |

---

*Manual de Usuario Cloud-Bill — v1.1, actualizado el 11 de junio de 2026*
