package httpapi

import (
	"regexp"
	"strings"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/google/uuid"
)

// Doğrulama hataları, Node/zod sürümündeki mesaj biçimiyle aynıdır: "alan: mesaj".

func invalid(field, msg string) *apperr.E {
	return apperr.New(400, "", "%s: %s", field, msg)
}

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)
var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validateUsername(v string) (string, *apperr.E) {
	v = strings.TrimSpace(v)
	if len([]rune(v)) < 3 {
		return "", invalid("username", "en az 3 karakter")
	}
	if len([]rune(v)) > 32 {
		return "", invalid("username", "en fazla 32 karakter")
	}
	if !usernameRe.MatchString(v) {
		return "", invalid("username", "yalnızca harf, rakam, nokta, tire ve alt çizgi")
	}
	return v, nil
}

func validatePassword(v string) (string, *apperr.E) {
	if len(v) < 8 {
		return "", invalid("password", "en az 8 karakter")
	}
	if len(v) > 128 {
		return "", invalid("password", "en fazla 128 karakter")
	}
	return v, nil
}

const maxAmount = 1_000_000_000_000 // 10 milyar TL (kuruş)

func validateAmount(v int64) *apperr.E {
	if v <= 0 {
		return invalid("amount", "sıfırdan büyük olmalı")
	}
	if v > maxAmount {
		return invalid("amount", "çok büyük")
	}
	return nil
}

// trimNote, notu kırpar (280 karakter sınırı). nil koruması çağıranın.
func trimNote(v *string) (*string, *apperr.E) {
	if v == nil {
		return nil, nil
	}
	t := strings.TrimSpace(*v)
	if len([]rune(t)) > 280 {
		return nil, invalid("note", "en fazla 280 karakter")
	}
	if t == "" {
		return nil, nil
	}
	return &t, nil
}

func validateName(v string) (string, *apperr.E) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", invalid("name", "boş olamaz")
	}
	if len([]rune(v)) > 40 {
		return "", invalid("name", "en fazla 40 karakter")
	}
	return v, nil
}

func validateIcon(v *string) (string, *apperr.E) {
	if v == nil {
		return "🏷️", nil
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return "🏷️", nil
	}
	if len([]rune(t)) > 8 {
		return "", invalid("icon", "en fazla 8 karakter")
	}
	return t, nil
}

func validateColor(v *string) (string, *apperr.E) {
	if v == nil {
		return "#34d399", nil
	}
	t := strings.TrimSpace(*v)
	if !colorRe.MatchString(t) {
		return "", invalid("color", "#rrggbb biçiminde olmalı")
	}
	return t, nil
}

func validateUUID(v, field string) (string, *apperr.E) {
	if _, err := uuid.Parse(v); err != nil {
		return "", invalid(field, "geçerli bir UUID olmalı")
	}
	return v, nil
}
