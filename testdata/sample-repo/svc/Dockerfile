FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN go build -o /out/svc .

FROM gcr.io/distroless/base
COPY --from=build /out/svc /svc
ENTRYPOINT ["/svc"]
