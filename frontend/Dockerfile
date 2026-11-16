# Dockerfile del frontend React/Vite (Global Exchange - PI-88 / PI-96)
# Etapa 1: build de la aplicación con Vite
# Etapa 2: servir con nginx (imagen ligera, lista para producción)

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar caché de Docker
COPY package.json package-lock.json ./
RUN npm ci

# Configuración del build. Vite deja estos valores fijos dentro del
# JavaScript generado, por eso se pasan como argumentos de build
# (docker-compose.prod.yml los arma a partir de .env.prod) y no se usa el
# .env local, que queda fuera de la imagen (ver .dockerignore).
ARG VITE_API_URL=/api
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=Global-Exchange
ARG VITE_KEYCLOAK_CLIENT_ID=global-exchange-frontend
ENV VITE_API_URL=$VITE_API_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

# Copiar código fuente y construir
COPY . .
RUN npm run build

# Etapa 2: servir con nginx
FROM nginx:alpine

# Copiar los archivos buildados a la carpeta que sirve nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de nginx: SPA + proxy a la API y a Keycloak
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
