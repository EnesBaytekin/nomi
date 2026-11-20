// Package config, .env dosyasını ve ortam değişkenlerini yükler.
// .env hem çalışma dizininde hem de bir üst dizinde aranır (geliştirme kolaylığı).
package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Config, sunucunun çalışma zamanı yapılandırması.
type Config struct {
	Host         string
	Port         int
	DBPath       string
	JWTSecret    []byte // 32 byte
	MasterKey    []byte // 32 byte — DEK sarma anahtarı
	CookieSecure bool   // refresh çerezi yalnız HTTPS üzerinden taşınır mı
}

const (
	accessTTL  = 10 * 60           // saniye — 10 dakika
	refreshTTL = 7 * 24 * 60 * 60  // saniye — 7 gün kayan pencere
)

// AccessTTL JWT erişim tokenı ömrü.
func AccessTTL() int { return accessTTL }

// RefreshTTL refresh token ömrü (saniye).
func RefreshTTL() int { return refreshTTL }

// RefreshCookie, refresh token çerezinin adı.
const RefreshCookie = "nomi_rt"

// Load, yapılandırmayı okur ve doğrular. Hata durumunda açıklamayla döner.
func Load() (*Config, error) {
	loadDotenv()

	var problems []string
	cfg := &Config{
		Host:         getenv("HOST", "0.0.0.0"),
		Port:         atoiDefault(getenv("PORT", "3000"), 3000),
		DBPath:       getenv("DB_PATH", "./data/nomi.db"),
		CookieSecure: getenv("COOKIE_SECURE", "false") == "true",
	}

	var err error
	if cfg.JWTSecret, err = decodeKey("JWT_SECRET", os.Getenv("JWT_SECRET")); err != nil {
		problems = append(problems, err.Error())
	}
	if cfg.MasterKey, err = decodeKey("MASTER_KEY", os.Getenv("MASTER_KEY")); err != nil {
		problems = append(problems, err.Error())
	}
	if len(problems) > 0 {
		return nil, fmt.Errorf("ortam değişkenleri geçersiz:\n  - %s\nÖrnek için .env.example dosyasına bak. Anahtar üretmek için: openssl rand -base64 32",
			strings.Join(problems, "\n  - "))
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func atoiDefault(s string, def int) int {
	n := 0
	ok := true
	for _, r := range s {
		if r < '0' || r > '9' {
			ok = false
			break
		}
		n = n*10 + int(r-'0')
	}
	if !ok || s == "" {
		return def
	}
	return n
}

func decodeKey(name, v string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(v))
	if err != nil || len(raw) != 32 {
		return nil, fmt.Errorf("%s: 32 byte uzunluğunda base64 olmalı (openssl rand -base64 32)", name)
	}
	return raw, nil
}

var envLine = regexp.MustCompile(`^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$`)

// loadDotenv, .env dosyasını cwd ve parent dizinlerde arar;
// mevcut ortam değişkenlerini asla ezmez.
func loadDotenv() {
	cwd, _ := os.Getwd()
	for _, dir := range []string{cwd, filepath.Dir(cwd)} {
		path := filepath.Join(dir, ".env")
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			m := envLine.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			key, val := m[1], m[2]
			if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
				val = val[1 : len(val)-1]
			}
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, val)
			}
		}
	}
}
