// Package apperr, HTTP istekleri arasında taşınan anlamlı hata tipini tanımlar.
package apperr

import "fmt"

// E, iş mantığından dönen HTTP'e çevrilebilir hatadır.
type E struct {
	Status  int
	Code    string
	Message string
}

func (e *E) Error() string { return e.Message }

// New, yeni bir HTTP hatası üretir.
func New(status int, code, format string, args ...any) *E {
	return &E{Status: status, Code: code, Message: fmt.Sprintf(format, args...)}
}
