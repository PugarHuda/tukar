# Build the TRISA node statically, then run it on a slim base with CA roots for the GDS TLS.
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /trisa-node ./...

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /trisa-node /trisa-node
# Peers dial the mTLS gRPC port; the HTTP bridge stays on localhost inside the container.
EXPOSE 4433
ENTRYPOINT ["/trisa-node"]
