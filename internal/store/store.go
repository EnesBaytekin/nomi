// Package store, SQLite veri katmanını içerir (modernc.org/sqlite, cgo'suz).
package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// Store, veritabanı bağlantısı ve sorgu yardımcıları.
type Store struct {
	db *sql.DB
}

// User, users tablosu satırı.
type User struct {
	ID           string
	Username     string
	PasswordHash string
	WrappedDEK   string
	TokenVersion int64
	IsAdmin      bool
	CreatedAt    int64
}

// Category, categories tablosu satırı.
type Category struct {
	ID        string
	UserID    string
	Name      string
	Icon      string
	Color     string
	SortOrder int64
	CreatedAt int64
}

// ExpenseType, expense_types tablosu satırı.
type ExpenseType struct {
	ID        string
	UserID    string
	CategoryID string
	Name      string
	Icon      string
	Archived  bool
	SortOrder int64
	CreatedAt int64
}

// Expense, expenses tablosu satırı (data şifreli).
type Expense struct {
	ID        string
	UserID    string
	TypeID    string
	SpentAt   int64
	Data      string
	CreatedAt int64
	UpdatedAt int64
}

// RefreshToken, refresh_tokens tablosu satırı.
type RefreshToken struct {
	ID        string
	UserID    string
	FamilyID  string
	TokenHash string
	UserAgent sql.NullString
	ExpiresAt int64
	UsedAt    sql.NullInt64
	RevokedAt sql.NullInt64
	CreatedAt int64
}

// migrations, sıralı şema güncellemeleri.
var migrations = []string{
	// 001 — ilk şema (Node sürümüyle birebir)
	`CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		wrapped_dek   TEXT NOT NULL,
		token_version INTEGER NOT NULL DEFAULT 0,
		is_admin      INTEGER NOT NULL DEFAULT 0,
		created_at    INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS refresh_tokens (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		family_id  TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		user_agent TEXT,
		expires_at INTEGER NOT NULL,
		used_at    INTEGER,
		revoked_at INTEGER,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens(user_id);
	CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
	CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON refresh_tokens(expires_at);
	CREATE TABLE IF NOT EXISTS categories (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name       TEXT NOT NULL,
		icon       TEXT NOT NULL DEFAULT '🏷️',
		color      TEXT NOT NULL DEFAULT '#34d399',
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
	CREATE TABLE IF NOT EXISTS expense_types (
		id          TEXT PRIMARY KEY,
		user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
		name        TEXT NOT NULL,
		icon        TEXT NOT NULL DEFAULT '💸',
		archived    INTEGER NOT NULL DEFAULT 0,
		sort_order  INTEGER NOT NULL DEFAULT 0,
		created_at  INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_types_user ON expense_types(user_id);
	CREATE INDEX IF NOT EXISTS idx_types_cat  ON expense_types(category_id);
	CREATE TABLE IF NOT EXISTS expenses (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		type_id    TEXT NOT NULL REFERENCES expense_types(id) ON DELETE RESTRICT,
		spent_at   INTEGER NOT NULL,
		data       TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_expenses_user_time ON expenses(user_id, spent_at DESC);
	CREATE INDEX IF NOT EXISTS idx_expenses_type      ON expenses(type_id);`,
}

// Open, veritabanını açar (gerekirse klasörünü oluşturur) ve pragmaları uygular.
func Open(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("veri klasörü oluşturulamadı: %w", err)
		}
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite tek dosya: aynı anda tek bağlantı hem güvenli hem yeterince hızlı.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

// Migrate, şemayı en son sürüme taşır.
func (s *Store) Migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		return err
	}
	var current int
	row := s.db.QueryRow(`SELECT value FROM meta WHERE key='schema_version'`)
	var v string
	if err := row.Scan(&v); err == nil {
		fmt.Sscanf(v, "%d", &current)
	}
	for i := current; i < len(migrations); i++ {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		for _, stmt := range strings.Split(migrations[i], ";\n") {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := tx.Exec(stmt); err != nil {
				tx.Rollback()
				return fmt.Errorf("migration %d: %w", i+1, err)
			}
		}
		if _, err := tx.Exec(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, fmt.Sprint(i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// CleanupExpiredTokens, 30 günden önce dolmuş refresh tokenları siler.
func (s *Store) CleanupExpiredTokens() {
	cutoff := time.Now().UnixMilli() - 30*24*60*60*1000
	s.db.Exec(`DELETE FROM refresh_tokens WHERE expires_at < ?`, cutoff)
}

// Close bağlantıyı kapatır.
func (s *Store) Close() error { return s.db.Close() }

// Tx, fonksiyonu transaction içinde çalıştırır.
func (s *Store) Tx(fn func(tx *sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// NewID, rastgele UUID v4 üretir.
func NewID() string { return uuid.NewString() }

// CreateUser, kullanıcıyı DEK'iyle birlikte oluşturur ve varsayılan
// kategori/türleri seed eder (Node sürümüyle aynı akış).
func (s *Store) CreateUser(username, passwordHash, wrappedDEK string, isAdmin bool) (*User, error) {
	id := NewID()
	now := time.Now().UnixMilli()
	admin := 0
	if isAdmin {
		admin = 1
	}
	if _, err := s.db.Exec(
		`INSERT INTO users (id, username, password_hash, wrapped_dek, token_version, is_admin, created_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?)`,
		id, username, passwordHash, wrappedDEK, admin, now); err != nil {
		return nil, err
	}
	if err := s.seedDefaultsForUser(id, now); err != nil {
		return nil, err
	}
	return s.UserByID(id)
}

func (s *Store) seedDefaultsForUser(userID string, now int64) error {
	type t struct {
		Name string
		Icon string
	}
	defaults := []struct {
		Name  string
		Icon  string
		Color string
		Types []t
	}{
		{"Yeme İçme", "🍽️", "#34d399", []t{{"Yemek", "🍲"}, {"Abur cubur", "🍫"}}},
		{"Ulaşım", "🚌", "#38bdf8", []t{{"Ulaşım", "🚕"}}},
		{"Teknoloji", "💻", "#a78bfa", []t{{"Yapay zeka", "🤖"}, {"Sunucu", "🖥️"}, {"Telefon", "📱"}}},
		{"Yatırım", "📈", "#fbbf24", []t{{"Altın", "🪙"}, {"Borsa", "📊"}}},
		{"Yaşam", "🏠", "#fb7185", []t{{"Hediye", "🎁"}, {"Kişisel", "🧴"}, {"Eğlence", "🎮"}}},
		{"Seyahat", "✈️", "#2dd4bf", []t{{"Konaklama", "🛏️"}}},
	}
	return s.Tx(func(tx *sql.Tx) error {
		for ci, cat := range defaults {
			catID := NewID()
			if _, err := tx.Exec(
				`INSERT INTO categories (id, user_id, name, icon, color, sort_order, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				catID, userID, cat.Name, cat.Icon, cat.Color, (ci+1)*10, now); err != nil {
				return err
			}
			for ti, ty := range cat.Types {
				if _, err := tx.Exec(
					`INSERT INTO expense_types (id, user_id, category_id, name, icon, archived, sort_order, created_at)
					 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
					NewID(), userID, catID, ty.Name, ty.Icon, (ti+1)*10, now); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// --- Kullanıcı sorguları ---

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	u := &User{}
	var admin int
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.WrappedDEK, &u.TokenVersion, &admin, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.IsAdmin = admin == 1
	return u, nil
}

const userCols = `id, username, password_hash, wrapped_dek, token_version, is_admin, created_at`

// UserByID, kimliğe göre kullanıcı getirir (yoksa nil).
func (s *Store) UserByID(id string) (*User, error) {
	return scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE id = ?`, id))
}

// UserByUsername, ada göre (büyük/küçük harf duyarsız) getirir.
func (s *Store) UserByUsername(username string) (*User, error) {
	return scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE username = ? COLLATE NOCASE`, username))
}

// CountUsers, toplam kullanıcı sayısı.
func (s *Store) CountUsers() (int64, error) {
	var c int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&c)
	return c, err
}

// Users, tüm kullanıcılar (yönetici listesi).
func (s *Store) Users() ([]*User, error) {
	rows, err := s.db.Query(`SELECT ` + userCols + ` FROM users ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// UpdatePasswordHash, parolayı günceller.
func (s *Store) UpdatePasswordHash(userID, hash string) error {
	_, err := s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, hash, userID)
	return err
}

// DeleteUser, kullanıcıyı siler (CASCADE tüm verisini temizler).
func (s *Store) DeleteUser(id string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// CountAdmins, yönetici sayısı.
func (s *Store) CountAdmins() (int64, error) {
	var c int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = 1`).Scan(&c)
	return c, err
}

// UsernameExists, kullanıcı adı alınmış mı.
func (s *Store) UsernameExists(username string) (bool, error) {
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM users WHERE username = ? COLLATE NOCASE`, username).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// BumpTokenVersion, kullanıcının tüm erişim tokenlarını geçersiz kılar.
func (s *Store) BumpTokenVersion(userID string) error {
	_, err := s.db.Exec(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, userID)
	return err
}

// --- Refresh token ---

// InsertRefreshToken, yeni token kaydı ekler.
func (s *Store) InsertRefreshToken(userID, familyID, tokenHash, userAgent string, expiresAt int64) error {
	_, err := s.db.Exec(
		`INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, user_agent, expires_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		NewID(), userID, familyID, tokenHash, userAgent, expiresAt, time.Now().UnixMilli())
	return err
}

// RefreshTokenByHash, hash'e göre token getirir.
func (s *Store) RefreshTokenByHash(hash string) (*RefreshToken, error) {
	r := &RefreshToken{}
	err := s.db.QueryRow(
		`SELECT id, user_id, family_id, token_hash, user_agent, expires_at, used_at, revoked_at, created_at
		 FROM refresh_tokens WHERE token_hash = ?`, hash).
		Scan(&r.ID, &r.UserID, &r.FamilyID, &r.TokenHash, &r.UserAgent, &r.ExpiresAt, &r.UsedAt, &r.RevokedAt, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

// MarkTokenUsed, tokenı kullanılmış işaretler.
func (s *Store) MarkTokenUsed(id string) error {
	_, err := s.db.Exec(`UPDATE refresh_tokens SET used_at = ? WHERE id = ?`, time.Now().UnixMilli(), id)
	return err
}

// RevokeFamily, token ailesinin tüm aktif tokenlarını iptal eder (replay koruması).
func (s *Store) RevokeFamily(familyID string) error {
	_, err := s.db.Exec(`UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`,
		time.Now().UnixMilli(), familyID)
	return err
}

// RevokeTokenByHash, tek tokenı iptal eder.
func (s *Store) RevokeTokenByHash(hash string) error {
	_, err := s.db.Exec(
		`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND used_at IS NULL`,
		time.Now().UnixMilli(), hash)
	return err
}

// RevokeAllForUser, kullanıcının tüm tokenlarını iptal eder.
func (s *Store) RevokeAllForUser(userID string) error {
	_, err := s.db.Exec(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
		time.Now().UnixMilli(), userID)
	return err
}
