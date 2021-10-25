# syntax=docker/dockerfile:1
FROM docker.io/node:16-alpine

# Install dependencies first, so that they can be cached
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm clean-install

# Copy all local files into the image.
COPY . .

# Compile with typescript
RUN npx tsc

# Remove dev dependencies
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "./build/index.js"]