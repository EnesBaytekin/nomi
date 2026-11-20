package httpapi

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/EnesBaytekin/nomi/internal/apperr"
)

// küçük soyutlamalar (opt.go'daki import karmaşasını önler)

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

type jsonNumber = json.Number

var (
	// errBadDate, readJSON tarafından doğrudan istemciye iletilir.
	errBadDate = apperr.New(400, "", "spentAt: geçerli bir tarih olmalı")

	timeRFC3339     = time.RFC3339Nano
	timeRFC3339NoTZ = "2006-01-02T15:04:05.999999"
)

func timeParse(layout, value string) (time.Time, error) { return time.Parse(layout, value) }

// parseInt64, query parametresini tam sayıya çevirir (yoksa/boşsa ok=false).
func parseInt64(s string) (int64, bool) {
	if s == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}
