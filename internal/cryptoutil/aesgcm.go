// Package cryptoutil, veri şifreleme ve parola hash'leme yardımcılarını barındırır.
//
// Şifreleme mimarisi (Node sürümüyle aynı format):
//   - MASTER_KEY (ortam değişkeni): her kullanıcının veri anahtarını (DEK) sarar.
//   - DEK (kullanıcı başına rastgele 32 byte): hassas verileri (tutar + not)
//     AES-256-GCM ile şifreler.
// Blob biçimi: "v1.<base64(iv[12] + tag[16] + ciphertext)>"
package cryptoutil

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

const (
	gcmIV  = 12
	gcmTag = 16
	prefix = "v1"
)

// Seal, plaintext'i AES-256-GCM ile şifreler ve "v1." önekli blob döner.
func Seal(key, plaintext []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcmIV)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	out := gcm.Seal(iv, iv, plaintext, nil) // iv + ct||tag
	return prefix + "." + base64.StdEncoding.EncodeToString(out), nil
}

// Open, Seal ile üretilmiş blob'u çözer.
func Open(key []byte, blob string) ([]byte, error) {
	ver, body, ok := strings.Cut(blob, ".")
	if !ok || ver != prefix || body == "" {
		return nil, errors.New("şifreli veri biçimi geçersiz")
	}
	raw, err := base64.StdEncoding.DecodeString(body)
	if err != nil || len(raw) < gcmIV+gcmTag {
		return nil, errors.New("şifreli veri biçimi geçersiz")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	iv, ct := raw[:gcmIV], raw[gcmIV:]
	pt, err := gcm.Open(nil, iv, ct, nil)
	if err != nil {
		return nil, fmt.Errorf("şifre çözme başarısız: %w", err)
	}
	return pt, nil
}

// WrapDEK, kullanıcı veri anahtarını ana anahtarla sarmalar.
func WrapDEK(dek, masterKey []byte) (string, error) { return Seal(masterKey, dek) }

// UnwrapDEK, sarılı DEK'i açar.
func UnwrapDEK(wrapped string, masterKey []byte) ([]byte, error) { return Open(masterKey, wrapped) }

// RandomBytes, kriptografik rastgele bayt üretir.
func RandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}
