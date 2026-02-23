# ---- Bước 1: Build môi trường ----
FROM node:24-alpine AS builder
WORKDIR /usr/src/app

# Cài đặt thư viện
COPY package*.json ./
RUN npm install

# Copy toàn bộ code và Build ra thư mục /dist
COPY . .
RUN npm run build

# ---- Bước 2: Chạy môi trường Production ----
FROM node:24-alpine
WORKDIR /usr/src/app

# Chỉ copy những thứ cần thiết từ Bước 1 sang
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist

# Khai báo cổng (Port) mà ứng dụng sẽ chạy
EXPOSE 3001

# Lệnh khởi động Backend
CMD ["npm", "run", "start:prod"]