FROM node:26-alpine AS ui-builder
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM golang:1.26-alpine AS go-builder
ARG APP_VERSION
WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=ui-builder /src/internal/web/dist ./internal/web/dist
RUN version="${APP_VERSION:-$(cat VERSION)}" && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -X lepatch/internal/server.Version=${version}" -o /out/lepatch ./cmd/lepatch
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/lepatch-import ./cmd/lepatch-import

FROM alpine:3.22 AS runner
RUN apk add --no-cache ca-certificates tzdata && addgroup -S lepatch && adduser -S -G lepatch lepatch
WORKDIR /app
COPY --from=go-builder /out/lepatch /usr/local/bin/lepatch
COPY --from=go-builder /out/lepatch-import /usr/local/bin/lepatch-import
RUN mkdir -p /app/data && chown -R lepatch:lepatch /app/data
USER lepatch
ENV APP_ENV=production PORT=3000 DATA_DIR=/app/data DATABASE_PATH=/app/data/lepatch.sqlite
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["/usr/local/bin/lepatch"]
