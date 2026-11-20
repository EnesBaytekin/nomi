# Nomi — tek binary (Go + gömülü web arayüzü).
# Node/npm gerekmez: web/ düz statik dosyalardır, doğrudan gömülür.

BINARY := nomi
VERSION := $(shell git describe --tags --always 2>/dev/null || echo dev)

LDFLAGS := -s -w -X main.version=$(VERSION)

.PHONY: dev build run vet test fmt clean

# Ön yüzü diskten servis eder (NOMI_DEV=1): go run + tarayıcı yenile yeterli.
dev:
	NOMI_DEV=1 go run . -version=false

build:
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o $(BINARY) .

run: build
	./$(BINARY)

vet:
	go vet ./...

test:
	go test ./...

fmt:
	gofmt -w .

clean:
	rm -f $(BINARY) $(BINARY).exe
