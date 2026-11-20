// Nomi — kişisel harcama takibi. Tek binary: web arayüzü gömülü, SQLite veritabanı.
//
// Çalıştırma:
//
//	nomi                # .env / ortam değişkenlerini okur, :3000 dinler
//	nomi -version       # sürümü yazdırır
package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/EnesBaytekin/nomi/internal/auth"
	"github.com/EnesBaytekin/nomi/internal/config"
	"github.com/EnesBaytekin/nomi/internal/httpapi"
	"github.com/EnesBaytekin/nomi/internal/store"
)

// version, release derlemelerinde -ldflags "-X main.version=vX.Y.Z" ile basılır.
var version = "dev"

//go:embed all:web
var webDist embed.FS

func main() {
	// .webmanifest uzantısı Go'nun varsayılan mime tablosunda yoktur.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")

	showVersion := flag.Bool("version", false, "sürüm bilgisi ve çık")
	flag.Parse()
	if *showVersion {
		fmt.Printf("Nomi %s\n", version)
		return
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("nomi: %v", err)
	}

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("nomi: veritabanı açılamadı: %v", err)
	}
	defer st.Close()
	if err := st.Migrate(); err != nil {
		log.Fatalf("nomi: şema güncellenemedi: %v", err)
	}

	au := auth.New(cfg.JWTSecret, st)
	deks := auth.NewDEKCache(cfg.MasterKey)
	api := httpapi.New(cfg, st, au, deks, version)

	// NOMI_DEV=1 ile arayüz diskten servis edilir (go run + tarayıcı yenile ile
	// ön yüz geliştirmesi; ayrı derleme gerekmez).
	var dist fs.FS
	if os.Getenv("NOMI_DEV") == "1" {
		dist = os.DirFS("web")
		log.Println("nomi: geliştirme modu — arayüz ./web diskten servis ediliyor")
	} else {
		dist, err = fs.Sub(webDist, "web")
		if err != nil {
			log.Fatalf("nomi: gömülü arayüz okunamadı: %v", err)
		}
	}

	mux := http.NewServeMux()
	api.Register(mux, dist)

	srv := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Süresi geçmiş refresh tokenları saatte bir temizle.
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for range t.C {
			st.CleanupExpiredTokens()
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		log.Println("nomi: kapanıyor...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Printf("nomi %s hazır → http://%s:%d (db: %s)", version, cfg.Host, cfg.Port, cfg.DBPath)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("nomi: %v", err)
	}
}
