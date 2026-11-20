// Package httpapi, tüm REST uçlarını ve statik arayüz servisğini barındırır.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/auth"
	"github.com/EnesBaytekin/nomi/internal/config"
	"github.com/EnesBaytekin/nomi/internal/store"
)

type userKey struct{}

// API, tüm handler'ların paylaşılan bağımlılıkları.
type API struct {
	cfg     *config.Config
	st      *store.Store
	auth    *auth.Service
	deks    *auth.DEKCache
	started time.Time
	version string
}

// New, API örneği.
func New(cfg *config.Config, st *store.Store, au *auth.Service, deks *auth.DEKCache, version string) *API {
	return &API{cfg: cfg, st: st, auth: au, deks: deks, started: time.Now(), version: version}
}

// Register, tüm rotaları mux'a bağlar. staticFS, derlenmiş web arayüzü (web/dist).
func (a *API) Register(mux *http.ServeMux, staticFS fs.FS) {
	// Sağlık
	mux.HandleFunc("GET /api/health", a.handleHealth)

	// Kimlik
	mux.HandleFunc("GET /api/auth/status", a.handleAuthStatus)
	mux.HandleFunc("POST /api/auth/setup", a.handleAuthSetup)
	mux.HandleFunc("POST /api/auth/login", a.handleAuthLogin)
	mux.HandleFunc("POST /api/auth/refresh", a.handleAuthRefresh)
	mux.HandleFunc("POST /api/auth/logout", a.handleAuthLogout)
	mux.HandleFunc("GET /api/auth/me", a.guard(a.handleMe))
	mux.HandleFunc("POST /api/auth/password", a.guard(a.handlePasswordChange))

	// Ana ekran + giderler
	mux.HandleFunc("GET /api/home", a.guard(a.handleHome))
	mux.HandleFunc("POST /api/expenses", a.guard(a.handleExpenseCreate))
	mux.HandleFunc("GET /api/expenses", a.guard(a.handleExpenseList))
	mux.HandleFunc("PATCH /api/expenses/{id}", a.guard(a.handleExpenseUpdate))
	mux.HandleFunc("DELETE /api/expenses/{id}", a.guard(a.handleExpenseDelete))

	// Katalog
	mux.HandleFunc("GET /api/catalog", a.guard(a.handleCatalog))
	mux.HandleFunc("POST /api/catalog/swap", a.guard(a.handleSwap))
	mux.HandleFunc("POST /api/categories", a.guard(a.handleCategoryCreate))
	mux.HandleFunc("PATCH /api/categories/{id}", a.guard(a.handleCategoryUpdate))
	mux.HandleFunc("DELETE /api/categories/{id}", a.guard(a.handleCategoryDelete))
	mux.HandleFunc("POST /api/types", a.guard(a.handleTypeCreate))
	mux.HandleFunc("PATCH /api/types/{id}", a.guard(a.handleTypeUpdate))
	mux.HandleFunc("DELETE /api/types/{id}", a.guard(a.handleTypeDelete))

	// İstatistik + dışa aktarım
	mux.HandleFunc("GET /api/stats/monthly", a.guard(a.handleStatsMonthly))
	mux.HandleFunc("GET /api/export", a.guard(a.handleExport))

	// Kullanıcı yönetimi (yönetici)
	mux.HandleFunc("GET /api/users", a.guard(a.admin(a.handleUsersList)))
	mux.HandleFunc("POST /api/users", a.guard(a.admin(a.handleUsersCreate)))
	mux.HandleFunc("DELETE /api/users/{id}", a.guard(a.admin(a.handleUsersDelete)))

	// Statik arayüz + SPA fallback
	mux.Handle("/", a.staticHandler(staticFS))
}

// guard, Bearer erişim tokenını doğrular; kullanıcıyı bağlama koyar.
func (a *API) guard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeErr(w, apperr.New(401, "NO_TOKEN", "Yetkilendirme gerekli"))
			return
		}
		sub, tv, err := a.auth.VerifyAccessToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			writeErr(w, err)
			return
		}
		user, err := a.st.UserByID(sub)
		if err != nil {
			writeErr(w, err)
			return
		}
		if user == nil || user.TokenVersion != tv {
			writeErr(w, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz"))
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	}
}

// admin, yönetici yetkisi şartı.
func (a *API) admin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := a.user(r)
		if !u.IsAdmin {
			writeErr(w, apperr.New(403, "", "Bu işlem için yönetici yetkisi gerekli"))
			return
		}
		next(w, r)
	}
}

func (a *API) user(r *http.Request) *store.User {
	return r.Context().Value(userKey{}).(*store.User)
}

// --- Yanıt yardımcıları ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type errBody struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

func writeErr(w http.ResponseWriter, err error) {
	var e *apperr.E
	if !errors.As(err, &e) {
		log.Printf("hata: %v", err)
		e = apperr.New(500, "", "Sunucu hatası")
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(e.Status)
	_ = json.NewEncoder(w).Encode(errBody{Error: e.Message, Code: e.Code})
}

// readJSON, istek gövdesini (en fazla 1MB) yapıya çözer. Boş gövde sorun değil.
func readJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return nil // boş gövde (örn. logout)
		}
		var ae *apperr.E
		if errors.As(err, &ae) {
			return ae
		}
		return apperr.New(400, "", "Geçersiz istek")
	}
	return nil
}

// clientIP, X-Forwarded-For'u (ters proxy arkası) dikkate alır.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// --- Refresh çerezi ---

func (a *API) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.RefreshCookie,
		Value:    token,
		Path:     "/api/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   a.cfg.CookieSecure,
		MaxAge:   config.RefreshTTL(),
	})
}

func (a *API) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.RefreshCookie,
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   a.cfg.CookieSecure,
		MaxAge:   -1,
	})
}

func (a *API) readRefreshCookie(r *http.Request) string {
	if c, err := r.Cookie(config.RefreshCookie); err == nil {
		return c.Value
	}
	return ""
}
