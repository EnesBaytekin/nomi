package cryptoutil

import (
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
	uninorm "golang.org/x/text/unicode/norm"
)

// scrypt parametreleri Node sürümüyle aynı (N=2^15, r=8, p=1).
const (
	scryptN = 1 << 15
	scryptR = 8
	scryptP = 1
)

// HashPassword, parolayı scrypt ile hash'ler.
// Format: "scrypt$N$r$p$saltB64$hashB64" (Node sürümüyle uyumlu).
func HashPassword(password string) (string, error) {
	salt, err := RandomBytes(16)
	if err != nil {
		return "", err
	}
	hash, err := scrypt.Key(normalize(password), salt, scryptN, scryptR, scryptP, 32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("scrypt$%d$%d$%d$%s$%s",
		scryptN, scryptR, scryptP,
		base64.StdEncoding.EncodeToString(salt),
		base64.StdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPassword, parolayı saklanan hash ile sabit zamanlı karşılaştırır.
func VerifyPassword(password, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return false
	}
	n, err1 := strconv.Atoi(parts[1])
	r, err2 := strconv.Atoi(parts[2])
	p, err3 := strconv.Atoi(parts[3])
	salt, err4 := base64.StdEncoding.DecodeString(parts[4])
	expected, err5 := base64.StdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil || len(expected) == 0 {
		return false
	}
	actual, err := scrypt.Key(normalize(password), salt, n, r, p, len(expected))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

// Node sürümü scrypt öncesi parolayı NFKC normalize ediyor; birebir aynı davranış.
func normalize(s string) []byte { return uninorm.NFKC.Bytes([]byte(s)) }
