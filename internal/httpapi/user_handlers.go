package httpapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/cryptoutil"
)

func (a *API) handleUsersList(w http.ResponseWriter, r *http.Request) {
	users, err := a.st.Users()
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]publicUserDTO, 0, len(users))
	for _, u := range users {
		out = append(out, toPublicUser(u))
	}
	writeJSON(w, 200, map[string]any{"users": out})
}

func (a *API) handleUsersCreate(w http.ResponseWriter, r *http.Request) {
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
	exists, err := a.st.UsernameExists(username)
	if err != nil {
		writeErr(w, err)
		return
	}
	if exists {
		writeErr(w, apperr.New(409, "", "Bu kullanıcı adı zaten alınmış"))
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
	user, err := a.st.CreateUser(username, hash, wrapped, false)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"user": toPublicUser(user)})
}

func (a *API) handleUsersDelete(w http.ResponseWriter, r *http.Request) {
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	me := a.user(r)
	if me.ID == id {
		writeErr(w, apperr.New(400, "", "Kendi hesabını silemezsin"))
		return
	}
	admins, err := a.st.CountAdmins()
	if err != nil {
		writeErr(w, err)
		return
	}
	if admins <= 1 {
		target, err := a.st.UserByID(id)
		if err != nil {
			writeErr(w, err)
			return
		}
		if target != nil && target.IsAdmin {
			writeErr(w, apperr.New(400, "", "Son yönetici silinemez"))
			return
		}
	}
	affected, err := a.st.DeleteUser(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, apperr.New(404, "", "Kullanıcı bulunamadı"))
			return
		}
		writeErr(w, err)
		return
	}
	if affected == 0 {
		writeErr(w, apperr.New(404, "", "Kullanıcı bulunamadı"))
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
