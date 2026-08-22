# Production Dockerfile for IELTS Core
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose application port
EXPOSE 4173

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=4173

# Run server
CMD ["node", "server.js"]
