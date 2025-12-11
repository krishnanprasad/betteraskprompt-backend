FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (GCP Cloud Run uses PORT env variable)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
