# ---------- BUILD STAGE ----------
    FROM node:18-alpine AS build

    WORKDIR /app
    
    COPY package*.json ./
    RUN npm install
    
    COPY . .
    RUN npm run build
    
    
    # ---------- RUN STAGE ----------
    FROM nginx:alpine
    
    # Xoá config mặc định
    RUN rm /etc/nginx/conf.d/default.conf
    
    # Copy nginx config
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    
    # Copy build files
    COPY --from=build /app/dist /usr/share/nginx/html
    
    EXPOSE 80
    
    CMD ["nginx", "-g", "daemon off;"]
    