package httpapi

import (
	"net/http"
	"strings"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/auth"
	"github.com/EnesBaytekin/nomi/internal/cryptoutil"
	"github.com/EnesBaytekin/nomi/internal/store"
)

type publicUserDTO struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	IsAdmin   bool   `json:"isAdmin"`
	CreatedAt int64  `json:"createdAt"`
}

func toPublicUser(u *store.User) publicUserDTO {
	return publicUserDTO{ID: u.ID, Username: u.Username, IsAdmin: u.IsAdmin, CreatedAt: u.CreatedAt}
}

type authResponse struct {
	AccessToken string        `json:"accessToken"`
	User        publicUserDTO `json:"user"`
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *API) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	c, err := a.st.CountUsers()
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"needsSetup": c == 0})
}

// loginOrSetup, ortak akış: kullanıcıyı doğrula, refresh üret, çerez koy.
func (a *API) issueSession(w http.ResponseWriter, r *http.Request, u *store.User) error {
	ua := r.Header.Get("User-Agent")
	family := store.NewID()
	token, err := a.auth.CreateRefreshToken(u.ID, family, ua)
	if err != nil {
		return err
	}
	access, err := a.auth.SignAccessToken(u)
	if err != nil {
		return err
	}
	a.setRefreshCookie(w, token)
	writeJSON(w, 200, authResponse{AccessToken: access, User: toPublicUser(u)})
	return nil
}

func (a *API) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	c, err := a.st.CountUsers()
	if err != nil {
		writeErr(w, err)
		return
	}
	if c > 0 {
		writeErr(w, apperr.New(403, "", "Kurulum tamamlandı. Lütfen giriş yapın."))
		return
	}
	var body credentials
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	username, verr := validateUsername(body.Username)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	password, verr := validatePassword(body.Password)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	hash, err := cryptoutil.HashPassword(password)
	if err != nil {
		writeErr(w, err)
		return
	}
	dek, err := cryptoutil.RandomBytes(32)
	if err != nil {
		writeErr(w, err)
		return
	}
	wrapped, err := cryptoutil.WrapDEK(dek, a.cfg.MasterKey)
	if err != nil {
		writeErr(w, err)
		return
	}
	user, err := a.st.CreateUser(username, hash, wrapped, true)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.issueSession(w, r, user); err != nil {
		writeErr(w, err)
	}
}

func (a *API) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	username, verr := validateUsername(body.Username)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	password, verr := validatePassword(body.Password)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	key := clientIP(r) + ":" + strings.ToLower(username)
	if err := auth.AssertNotRateLimited(key); err != nil {
		writeErr(w, err)
		return
	}
	user, err := a.st.UserByUsername(username)
	if err != nil {
		writeErr(w, err)
		return
	}
	if user == nil || !cryptoutil.VerifyPassword(password, user.PasswordHash) {
		auth.RecordAuthFailure(key)
		writeErr(w, apperr.New(401, "", "Kullanıcı adı veya parola hatalı"))
		return
	}
	auth.ClearAuthFailures(key)
	if err := a.issueSession(w, r, user); err != nil {
		writeErr(w, err)
	}
}

func (a *API) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	token := a.readRefreshCookie(r)
	if token == "" {
		writeErr(w, apperr.New(401, "NO_SESSION", "Oturum bulunamadı"))
		return
	}
	rot, err := a.auth.RotateRefreshToken(token, r.Header.Get("User-Agent"))
	if err != nil {
		writeErr(w, err)
		return
	}
	access, err := a.auth.SignAccessToken(rot.User)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.setRefreshCookie(w, rot.NewToken)
	writeJSON(w, 200, authResponse{AccessToken: access, User: toPublicUser(rot.User)})
}

func (a *API) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if token := a.readRefreshCookie(r); token != "" {
		_ = a.auth.RevokeToken(token)
	}
	a.clearRefreshCookie(w)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, toPublicUser(a.user(r)))
}

func (a *API) handlePasswordChange(w http.ResponseWriter, r *http.Request) {
	u := a.user(r)
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	if body.CurrentPassword == "" {
		writeErr(w, apperr.New(400, "", "currentPassword: gerekli"))
		return
	}
	newPassword, verr := validatePassword(body.NewPassword)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	if !cryptoutil.VerifyPassword(body.CurrentPassword, u.PasswordHash) {
		writeErr(w, apperr.New(400, "", "Mevcut parola hatalı"))
		return
	}
	if cryptoutil.VerifyPassword(newPassword, u.PasswordHash) {
		writeErr(w, apperr.New(400, "", "Yeni parola eskisiyle aynı olamaz"))
		return
	}
	hash, err := cryptoutil.HashPassword(newPassword)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.UpdatePasswordHash(u.ID, hash); err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.RevokeAllForUser(u.ID); err != nil {
		writeErr(w, err)
		return
	}
	fresh, err := a.st.UserByUsername(u.Username)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.issueSession(w, r, fresh); err != nil {
		writeErr(w, err)
	}
}
