Diseña una aplicación web moderna, profesional y responsive para una casa de cambio digital llamada "Global Exchange". El objetivo es crear un prototipo completo de alta fidelidad (High Fidelity) que represente una plataforma profesional de compra y venta de divisas, similar a plataformas fintech como Wise, Revolut o Binance, utilizando una interfaz limpia, moderna y minimalista.

Utiliza colores azul oscuro, blanco y verde como colores principales, con detalles en gris claro. Emplea componentes reutilizables, Auto Layout, diseño responsive, iconografía moderna, gráficos estadísticos, tablas y dashboards profesionales.

La aplicación debe contener navegación lateral (Sidebar) para usuarios autenticados y una barra superior con selector de cliente, notificaciones y perfil de usuario.

==================================================
ROLES DEL SISTEMA
==================================================

La interfaz debe adaptarse automáticamente según el rol del usuario. Deben existir cuatro tipos de cuentas:

1. Usuario no registrado
2. Usuario registrado
3. Analista Cambiario
4. Administrador

Cada rol debe visualizar únicamente las funcionalidades que tenga permiso de utilizar.

==================================================
USUARIO NO REGISTRADO
==================================================

Debe visualizar únicamente:

• Landing Page
• Información institucional
• Tasas de cambio en tiempo real
• Evolución histórica de tasas
• Gráficos de líneas y barras
• Simulador de compra/venta
• Registro
• Inicio de sesión

No puede:

• Comprar divisas
• Vender divisas
• Ver billeteras
• Ver historial
• Administrar clientes

==================================================
PANTALLAS PÚBLICAS
==================================================

Landing Page

Debe incluir:

• Hero principal
• Información de la empresa
• Tasas de cambio en tiempo real
• Botón Comprar
• Botón Simular
• Cómo funciona
• Beneficios
• Monedas soportadas
• Preguntas frecuentes
• Footer

==================================================
CONSULTA DE TASAS
==================================================

Mostrar:

• USD
• EUR
• PYG
• BRL
• ARS
• Otras monedas

Cada tarjeta debe mostrar:

• Compra
• Venta
• Variación
• Hora de actualización

Agregar filtros por moneda.

==================================================
HISTÓRICO DE TASAS
==================================================

Permitir visualizar:

• gráfico de líneas
• gráfico de barras

Filtros:

• Hoy
• Semana
• Mes
• Año
• Personalizado

==================================================
SIMULADOR DE CONVERSIÓN
==================================================

Formulario con:

Moneda origen

Moneda destino

Monto

Botón Simular

Resultado:

Tasa utilizada

Monto convertido

Resumen

Botón Comprar ahora

==================================================
REGISTRO
==================================================

Formulario:

Tipo de cliente

Persona Física

Persona Jurídica

Nombre

Apellido

Correo

Teléfono

Documento

Contraseña

Confirmar contraseña

Checkbox aceptar términos

Botón Registrarse

Después mostrar pantalla:

"Verifique su correo electrónico"

==================================================
LOGIN
==================================================

Correo

Contraseña

Recordarme

Recuperar contraseña

Botón Iniciar sesión

==================================================
USUARIO REGISTRADO
==================================================

Después de iniciar sesión mostrar Dashboard.

==================================================
DASHBOARD
==================================================

Cards con:

Saldo total

Valor de billeteras

Últimas operaciones

Tasas destacadas

Notificaciones

Accesos rápidos

==================================================
SELECTOR DE CLIENTE
==================================================

Si el usuario tiene varios clientes asociados:

Mostrar un selector desplegable.

Debe permitir cambiar de cliente sin cerrar sesión.

Al cambiar de cliente:

Actualizar:

Billeteras

Transacciones

Reportes

Operaciones

==================================================
BILLETERA DIGITAL
==================================================

Mostrar:

Saldo por moneda

USD

EUR

PYG

BRL

Botón:

Depositar

Retirar

Transferir

==================================================
CUENTAS BANCARIAS
==================================================

Listado de cuentas vinculadas.

Formulario para agregar cuenta:

Banco

Número de cuenta

Código bancario

Titular

Documento

Estado

==================================================
COMPRA DE DIVISAS
==================================================

Formulario:

Cliente

Moneda origen

Moneda destino

Monto

Mostrar automáticamente:

Tipo de cambio

Comisión

Monto final

Confirmar compra

Al finalizar:

Mostrar comprobante.

Los fondos deben acreditarse automáticamente en la billetera o cuenta bancaria.

==================================================
VENTA DE DIVISAS
==================================================

Misma estructura.

Permitir seleccionar:

Billetera origen

Cuenta bancaria destino

Confirmación

Los fondos se transfieren automáticamente.

==================================================
PAGOS DIGITALES
==================================================

Seleccionar medio de pago:

Transferencia bancaria

Billetera digital

Tarjeta

QR

Mostrar estado:

Pendiente

Pagada

Cancelada

Anulada

==================================================
HISTORIAL DE TRANSACCIONES
==================================================

Tabla con:

Fecha

Cliente

Tipo

Compra

Venta

Moneda

Monto

Estado

Filtros:

Fecha

Moneda

Estado

Tipo

Botones:

Descargar PDF

Descargar Excel

==================================================
FACTURAS ELECTRÓNICAS
==================================================

Tabla:

Número

Fecha

Estado

Emitida

Aprobada

Rechazada

Botón Descargar

Botón Enviar por correo

==================================================
NOTIFICACIONES
==================================================

Centro de notificaciones.

Notificar:

Cambios importantes en tasas.

Operaciones realizadas.

Facturas emitidas.

==================================================
ANALISTA CAMBIARIO
==================================================

Debe visualizar:

Dashboard

Modificar tasas

Consultar ganancias

Gráficos financieros

No debe visualizar:

Gestión de usuarios

Roles

Configuraciones administrativas

==================================================
MODIFICAR TASAS
==================================================

Tabla editable.

Columnas:

Moneda

Compra

Venta

Última actualización

Botón Guardar

==================================================
GANANCIAS
==================================================

Dashboard financiero.

Cards:

Ganancia total

Ganancia USD

Ganancia EUR

Ganancia PYG

Ganancia BRL

Gráficos:

Líneas

Barras

Torta

==================================================
ADMINISTRADOR
==================================================

Debe tener acceso completo.

Menú lateral:

Dashboard

Clientes

Usuarios

Roles

Permisos

Monedas

Tasas

Métodos de pago

Ganancias

Reportes

Configuración

Notificaciones

==================================================
GESTIÓN DE CLIENTES
==================================================

Tabla:

Cliente

Categoría

Minorista

Corporativo

VIP

Cantidad de operaciones

Usuarios asociados

Estado

Botones:

Crear

Editar

Eliminar

Asociar usuarios

==================================================
GESTIÓN DE USUARIOS
==================================================

Tabla:

Nombre

Correo

Rol

Cliente

Estado

Botones:

Crear

Editar

Eliminar

Asignar cliente

==================================================
GESTIÓN DE ROLES Y PERMISOS
==================================================

Mostrar matriz de permisos.

Roles:

Administrador

Analista

Usuario Registrado

Usuario No Registrado

Cada permiso debe poder activarse o desactivarse.

==================================================
CONFIGURACIÓN
==================================================

Administrar:

Monedas admitidas

USD

EUR

PYG

BRL

Métodos de pago

Seguridad

Autenticación

Notificaciones

==================================================
DISEÑO
==================================================

Generar un prototipo profesional utilizando:

• Auto Layout
• Variables de color
• Componentes reutilizables
• Design System
• Sidebar
• Navbar
• Cards
• Modales
• Formularios
• Tablas
• Dashboards
• Gráficos
• Estados vacíos
• Confirmaciones
• Alertas
• Responsive para escritorio, tablet y móvil

Generar todas las pantallas conectadas mediante navegación simulada (Prototype Mode) y mantener una experiencia consistente entre los cuatro tipos de usuario. La interfaz debe parecer un producto fintech listo para producción, con especial énfasis en usabilidad, claridad visual y experiencia de usuario.