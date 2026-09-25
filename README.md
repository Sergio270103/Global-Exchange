
```
Global-Exchange
├─ backend
│  ├─ clientes
│  │  ├─ admin.py
│  │  ├─ apps.py
│  │  ├─ migrations
│  │  │  ├─ 0001_initial.py
│  │  │  ├─ 0002_comisiones_default.py
│  │  │  ├─ 0003_clientes_demo.py
│  │  │  └─ __init__.py
│  │  ├─ models.py
│  │  ├─ permisos.py
│  │  ├─ serializers.py
│  │  ├─ tests.py
│  │  ├─ urls.py
│  │  ├─ views.py
│  │  └─ __init__.py
│  ├─ core
│  │  ├─ asgi.py
│  │  ├─ settings.py
│  │  ├─ urls.py
│  │  ├─ wsgi.py
│  │  └─ __init__.py
│  ├─ cotizaciones
│  │  ├─ admin.py
│  │  ├─ apps.py
│  │  ├─ migrations
│  │  │  ├─ 0001_initial.py
│  │  │  ├─ 0002_cotizaciones_demo.py
│  │  │  └─ __init__.py
│  │  ├─ models.py
│  │  ├─ permisos.py
│  │  ├─ serializers.py
│  │  ├─ tests.py
│  │  ├─ urls.py
│  │  ├─ views.py
│  │  └─ __init__.py
│  ├─ docker-compose.yml
│  ├─ docs
│  │  └─ CHIA
│  │     └─ sesion-backend-hito4.md
│  ├─ manage.py
│  ├─ monedas
│  │  ├─ admin.py
│  │  ├─ apps.py
│  │  ├─ autenticacion.py
│  │  ├─ fixtures
│  │  │  └─ monedas_iniciales.json
│  │  ├─ migrations
│  │  │  ├─ 0001_initial.py
│  │  │  ├─ 0002_monedas_default.py
│  │  │  └─ __init__.py
│  │  ├─ models.py
│  │  ├─ permisos.py
│  │  ├─ serializers.py
│  │  ├─ tests.py
│  │  ├─ urls.py
│  │  ├─ views.py
│  │  └─ __init__.py
│  ├─ pagos
│  │  ├─ admin.py
│  │  ├─ apps.py
│  │  ├─ migrations
│  │  │  ├─ 0001_initial.py
│  │  │  ├─ 0002_metodos_default.py
│  │  │  └─ __init__.py
│  │  ├─ models.py
│  │  ├─ serializers.py
│  │  ├─ tests.py
│  │  ├─ urls.py
│  │  ├─ views.py
│  │  └─ __init__.py
│  └─ requirements.txt
└─ frontend
   ├─ .figma
   │  └─ make
   │     ├─ analyze-routes
   │     ├─ deploy
   │     ├─ deploy-preview
   │     ├─ dev
   │     ├─ dev.json
   │     ├─ format
   │     ├─ install
   │     ├─ langserver
   │     └─ site.json
   ├─ .mise.toml
   ├─ AGENTS.md
   ├─ CLAUDE.md
   ├─ docker-compose.yml
   ├─ docs
   │  ├─ CHIA
   │  │  ├─ gemini-dashboard-cajero-rf.md
   │  │  ├─ gemini-git-flow-configuracion.md
   │  │  ├─ gemini-keycloak-integracion.md
   │  │  ├─ gemini-keycloak-verificacion-email-temp.md
   │  │  ├─ muse-crud-medios-pago-cliente.md
   │  │  └─ sesion-frontend-hito4.md
   │  └─ PDO
   │     ├─ .nojekyll
   │     ├─ assets
   │     │  ├─ hierarchy.js
   │     │  ├─ highlight.css
   │     │  ├─ icons.js
   │     │  ├─ icons.svg
   │     │  ├─ main.js
   │     │  ├─ navigation.js
   │     │  ├─ search.js
   │     │  └─ style.css
   │     ├─ hierarchy.html
   │     └─ index.html
   ├─ index.html
   ├─ package-lock.json
   ├─ package.json
   ├─ realm-export.json
   ├─ src
   │  ├─ App.test.tsx
   │  ├─ App.tsx
   │  ├─ components
   │  │  ├─ Layout.tsx
   │  │  ├─ Navbar.test.tsx
   │  │  ├─ Navbar.tsx
   │  │  ├─ Sidebar.test.tsx
   │  │  └─ Sidebar.tsx
   │  ├─ data
   │  │  ├─ mockData.test.ts
   │  │  └─ mockData.ts
   │  ├─ imports
   │  │  └─ pasted_text
   │  │     ├─ global-exchange-app-1.md
   │  │     └─ global-exchange-app.md
   │  ├─ index.css
   │  ├─ keycloak.ts
   │  ├─ main.tsx
   │  ├─ pages
   │  │  ├─ admin
   │  │  │  ├─ Clients.test.tsx
   │  │  │  ├─ Clients.tsx
   │  │  │  ├─ Configuration.tsx
   │  │  │  ├─ Currencies.tsx
   │  │  │  ├─ RolesPermissions.test.tsx
   │  │  │  ├─ RolesPermissions.tsx
   │  │  │  ├─ Users.test.tsx
   │  │  │  └─ Users.tsx
   │  │  ├─ analyst
   │  │  │  ├─ Earnings.tsx
   │  │  │  └─ RatesManagement.tsx
   │  │  ├─ Banks.test.tsx
   │  │  ├─ Banks.tsx
   │  │  ├─ BuySell.tsx
   │  │  ├─ cashier
   │  │  │  ├─ CashCountView.tsx
   │  │  │  └─ CashierDashboard.tsx
   │  │  ├─ Dashboard.tsx
   │  │  ├─ Invoices.tsx
   │  │  ├─ Landing.test.tsx
   │  │  ├─ Landing.tsx
   │  │  ├─ Login.test.tsx
   │  │  ├─ Login.tsx
   │  │  ├─ Notifications.tsx
   │  │  ├─ Payments.tsx
   │  │  ├─ Rates.test.tsx
   │  │  ├─ Rates.tsx
   │  │  ├─ Register.test.tsx
   │  │  ├─ Register.tsx
   │  │  ├─ Simulator.tsx
   │  │  ├─ Transactions.tsx
   │  │  └─ Wallets.tsx
   │  ├─ services
   │  │  ├─ api.ts
   │  │  ├─ clientes.ts
   │  │  ├─ cotizaciones.ts
   │  │  ├─ cuentas.ts
   │  │  ├─ metodos.ts
   │  │  ├─ monedas.ts
   │  │  ├─ simulador.test.ts
   │  │  └─ simulador.ts
   │  ├─ test
   │  │  └─ setup.ts
   │  ├─ types.ts
   │  └─ vite-env.d.ts
   ├─ tsconfig.json
   ├─ typedoc.json
   ├─ vite.config.ts
   └─ vitest.config.ts

```