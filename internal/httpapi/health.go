package httpapi

import (
	"net/http"
	"time"
)

func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"uptime":  int64(time.Since(a.started).Seconds()),
		"version": a.version,
	})
}
