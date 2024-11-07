FROM golang:1 AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o traceroute-server main.go

FROM alpine:latest

WORKDIR /root/

COPY --from=build /app/traceroute-server .

COPY --from=build /app/assets /root/assets
COPY --from=build /app/frontend /root/frontend

EXPOSE 8080

CMD ["./traceroute-server"]

