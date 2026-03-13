FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Source is mounted as a volume in dev; copy in production builds
COPY . .

EXPOSE 5173

# Vite dev server — binds to 0.0.0.0 so Docker port mapping works
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
