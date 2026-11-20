// Package auth, JWT erişim tokenı, rotasyonlu refresh token ve
// brute-force korumasını içerir (Node sürümüyle aynı davranış).
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/store"
)

// Service, kimlik doğrulama işlemleri.
type Service struct {
	secret []byte
	st     *store.Store
}

// New, yeni auth servisi.
func New(secret []byte, st *store.Store) *Service {
	return &Service{secret: secret, st: st}
}

// --- JWT ---

type claims struct {
	tv int64
	sub string
}

// SignAccessToken, 10 dakikalık HS256 JWT üretir (issuer: nomi).
func (a *Service) SignAccessToken(u *store.User) (string, error) {
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"tv":  u.TokenVersion,
		"iss": "nomi",
		"sub": u.ID,
		"iat": now.Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
	})
	return token.SignedString(a.secret)
}

// VerifyAccessToken, tokenı doğrular; kullanıcı kimliğini ve token sürümünü döner.
func (a *Service) VerifyAccessToken(raw string) (userID string, tv int64, err error) {
	parsed, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("beklenmeyen imza yöntemi: %v", t.Header["alg"])
		}
		return a.secret, nil
	}, jwt.WithIssuer("nomi"), jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return "", 0, apperr.New(401, "TOKEN_EXPIRED", "Oturum süresi doldu")
		}
		return "", 0, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz")
	}
	mc, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", 0, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz")
	}
	sub, _ := mc["sub"].(string)
	if sub == "" {
		return "", 0, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz")
	}
	var tvv int64
	switch v := mc["tv"].(type) {
	case float64:
		tvv = int64(v)
	case int64:
		tvv = v
	}
	return sub, tvv, nil
}

// --- Refresh token (döndürümlü, kayan pencere) ---

func sha256hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// CreateRefreshToken, yeni refresh token üretir ve kaydeder; düz metni döner.
func (a *Service) CreateRefreshToken(userID, familyID, userAgent string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	err := a.st.InsertRefreshToken(userID, familyID, sha256hex(token), userAgent,
		time.Now().UnixMilli()+7*24*60*60*1000)
	if err != nil {
		return "", err
	}
	return token, nil
}

// Rotated, rotasyon sonucu.
type Rotated struct {
	User     *store.User
	NewToken string
}

// RotateRefreshToken, çerezdeki tokenı doğrular, döndürür ve 7 günlük
// pencereyi sıfırlar. Eski token yeniden sunulursa aile iptal edilir.
func (a *Service) RotateRefreshToken(token, userAgent string) (*Rotated, error) {
	row, err := a.st.RefreshTokenByHash(sha256hex(token))
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, apperr.New(401, "NO_SESSION", "Oturum bulunamadı")
	}
	now := time.Now().UnixMilli()
	if row.UsedAt.Valid || row.RevokedAt.Valid {
		// Replay tespiti: ailenin tamamını kapat
		if err := a.st.RevokeFamily(row.FamilyID); err != nil {
			return nil, err
		}
		return nil, apperr.New(401, "REUSE_DETECTED", "Oturum güvenlik nedeniyle kapatıldı")
	}
	if row.ExpiresAt < now {
		return nil, apperr.New(401, "SESSION_EXPIRED", "Oturum süresi doldu")
	}
	user, err := a.st.UserByID(row.UserID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz")
	}
	if err := a.st.MarkTokenUsed(row.ID); err != nil {
		return nil, err
	}
	newToken, err := a.CreateRefreshToken(user.ID, row.FamilyID, userAgent)
	if err != nil {
		return nil, err
	}
	return &Rotated{User: user, NewToken: newToken}, nil
}

// RevokeToken, tek tokenı iptal eder.
func (a *Service) RevokeToken(token string) error {
	return a.st.RevokeTokenByHash(sha256hex(token))
}

// --- Brute-force koruması (bellek içi) ---

const (
	rateWindow   = 15 * time.Minute
	rateMaxFails = 8
)

type failure struct {
	count int
	until time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	failures map[string]*failure
}

var limiter = &rateLimiter{failures: map[string]*failure{}}

// AssertNotRateLimited, pencere içinde çok fazla hata varsa 429 döner.
func AssertNotRateLimited(key string) error {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	e, ok := limiter.failures[key]
	if ok && e.until.After(time.Now()) && e.count >= rateMaxFails {
		mins := int(e.until.Sub(time.Now()).Minutes()) + 1
		return apperr.New(429, "", "Çok fazla hatalı deneme. %d dakika sonra tekrar dene.", mins)
	}
	return nil
}

// RecordAuthFailure, hatalı denemeyi kaydeder.
func RecordAuthFailure(key string) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	e, ok := limiter.failures[key]
	if !ok || e.until.Before(time.Now()) {
		limiter.failures[key] = &failure{count: 1, until: time.Now().Add(rateWindow)}
		return
	}
	e.count++
	e.until = time.Now().Add(rateWindow)
}

// ClearAuthFailures, başarılı girişte sayaçları temizler.
func ClearAuthFailures(key string) {
	limiter.mu.Lock()
	delete(limiter.failures, key)
	limiter.mu.Unlock()
}
