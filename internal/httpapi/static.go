package httpapi

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/EnesBaytekin/nomi/internal/apperr"
)

// staticHandler, gömülü web arayüzünü servis eder; /api dışındaki bilinmeyen
// GET yolları SPA fallback olarak index.html'e gider.
func (a *API) staticHandler(dist fs.FS) http.Handler {
	fileServer := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(dist, p); err != nil {
			// Dosya yok: API istekleri JSON 404, diğerleri SPA fallback.
			if strings.HasPrefix(r.URL.Path, "/api") {
				writeErr(w, apperr.New(404, "", "Bulunamadı"))
				return
			}
			index, err2 := fs.ReadFile(dist, "index.html")
			if err2 != nil {
				// Arayüz dosyaları eksik.
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.WriteHeader(404)
				_, _ = w.Write([]byte("Nomi web arayüzü bulunamadı."))
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			w.WriteHeader(200)
			_, _ = w.Write(index)
			return
		}
		// İkonlar değişmez: haftalık önbellek. Kaynak dosyalar: her istekte doğrula.
		switch {
		case strings.HasSuffix(p, ".png") || strings.HasSuffix(p, ".svg"):
			w.Header().Set("Cache-Control", "public, max-age=604800")
		default:
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}
