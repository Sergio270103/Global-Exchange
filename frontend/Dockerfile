# Dockerfile del frontend React/Vite (Global Exchange - PI-88)
# Etapa 1: build de la aplicación con Vite
# Etapa 2: servir con nginx (imagen ligera, lista para producción)

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar caché de Docker
COPY package.json package-lock.json ./
RUN npm ci

# Copiar código fuente y construir
COPY . .
RUN npm run build

# Etapa 2: servir con nginx
FROM nginx:alpine

# Copiar los archivos buildados a la carpeta que sirve nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de nginx para SPA + proxy a la API
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]