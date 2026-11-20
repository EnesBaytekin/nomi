package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/cryptoutil"
	"github.com/EnesBaytekin/nomi/internal/store"
)

// expenseDTO, istemcinin beklediği harcama şekli (Node sürümüyle aynı alan adları).
type expenseDTO struct {
	ID            string  `json:"id"`
	TypeID        string  `json:"typeId"`
	TypeName      string  `json:"typeName"`
	TypeIcon      string  `json:"typeIcon"`
	TypeArchived  bool    `json:"typeIdArchived"`
	CategoryID    string  `json:"categoryId"`
	CategoryName  string  `json:"categoryName"`
	CategoryColor string  `json:"categoryColor"`
	Amount        int64   `json:"amount"`
	Note          *string `json:"note"`
	SpentAt       int64   `json:"spentAt"`
	CreatedAt     int64   `json:"createdAt"`
}

// expensePayload, şifreli yükün açık hali ({a: kuruş, n: not}).
type expensePayload struct {
	A int64   `json:"a"`
	N *string `json:"n"`
}

func (a *API) decryptExpense(userID, blob string) (*expensePayload, error) {
	u, err := a.st.UserByID(userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, apperr.New(401, "TOKEN_INVALID", "Oturum geçersiz")
	}
	dek, err := a.deks.Get(u)
	if err != nil {
		return nil, err
	}
	raw, err := cryptoutil.Open(dek, blob)
	if err != nil {
		return nil, err
	}
	p := &expensePayload{}
	if err := json.Unmarshal(raw, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (a *API) sealExpense(userID string, amount int64, note *string) (string, error) {
	u, err := a.st.UserByID(userID)
	if err != nil {
		return "", err
	}
	dek, err := a.deks.Get(u)
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(expensePayload{A: amount, N: note})
	if err != nil {
		return "", err
	}
	return cryptoutil.Seal(dek, raw)
}

// toDTO, birleşik satırı çözüp DTO'ya çevirir.
func (a *API) toDTO(userID string, row *store.JoinedExpense) (expenseDTO, *expensePayload, error) {
	p, err := a.decryptExpense(userID, row.Data)
	if err != nil {
		return expenseDTO{}, nil, err
	}
	dto := expenseDTO{
		ID:            row.ID,
		TypeID:        row.TypeID,
		TypeName:      row.TypeName,
		TypeIcon:      row.TypeIcon,
		TypeArchived:  row.TypeArchived,
		CategoryID:    row.CategoryID,
		CategoryName:  row.CategoryName,
		CategoryColor: row.CategoryColor,
		Amount:        p.A,
		Note:          p.N,
		SpentAt:       row.SpentAt,
		CreatedAt:     row.CreatedAt,
	}
	return dto, p, nil
}

func (a *API) handleHome(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	types, err := a.st.TypesByUser(uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	cats, err := a.st.CategoriesByUser(uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	catByID := make(map[string]*store.Category, len(cats))
	for _, c := range cats {
		catByID[c.ID] = c
	}

	now := time.Now()
	nowMs := now.UnixMilli()
	loc := time.Local
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).UnixMilli()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc).UnixMilli()

	type typeDTO struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		Icon          string `json:"icon"`
		CategoryID    string `json:"categoryId"`
		CategoryName  string `json:"categoryName"`
		CategoryColor string `json:"categoryColor"`
	}
	activeTypes := make([]typeDTO, 0, len(types))
	for _, t := range types {
		if t.Archived {
			continue
		}
		c := catByID[t.CategoryID]
		name, color := "🏷️", "#34d399"
		if c != nil {
			name, color = c.Name, c.Color
		}
		activeTypes = append(activeTypes, typeDTO{
			ID: t.ID, Name: t.Name, Icon: t.Icon,
			CategoryID: t.CategoryID, CategoryName: name, CategoryColor: color,
		})
	}

	// Bugünün harcamaları
	todayRows, err := a.st.SelectExpenseRows(uid, &dayStart, &nowMs, "", 20, 0)
	if err != nil {
		writeErr(w, err)
		return
	}
	today := make([]expenseDTO, 0, len(todayRows))
	var todayTotal int64
	for _, row := range todayRows {
		dto, p, err := a.toDTO(uid, row)
		if err != nil {
			writeErr(w, err)
			return
		}
		todayTotal += p.A
		today = append(today, dto)
	}

	// Bu ayın harcamaları
	monthRows, err := a.st.SelectExpenseRows(uid, &monthStart, &nowMs, "", 100_000, 0)
	if err != nil {
		writeErr(w, err)
		return
	}
	var monthTotal int64
	for _, row := range monthRows {
		_, p, err := a.toDTO(uid, row)
		if err != nil {
			writeErr(w, err)
			return
		}
		monthTotal += p.A
	}

	recent, err := a.st.RecentTypeIDs(uid)
	if err != nil {
		writeErr(w, err)
		return
	}

	writeJSON(w, 200, map[string]any{
		"todayTotal":    todayTotal,
		"monthTotal":    monthTotal,
		"today":         today,
		"types":         activeTypes,
		"recentTypeIds": recent,
	})
}

func (a *API) handleExpenseCreate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	var body struct {
		TypeID  string  `json:"typeId"`
		Amount  *int64  `json:"amount"`
		Note    *string `json:"note"`
		SpentAt SpentAt `json:"spentAt"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	typeID, verr := validateUUID(body.TypeID, "typeId")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	if body.Amount == nil {
		writeErr(w, invalid("amount", "kuruş cinsinden tam sayı olmalı"))
		return
	}
	if verr := validateAmount(*body.Amount); verr != nil {
		writeErr(w, verr)
		return
	}
	note, verr := trimNote(body.Note)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	t, err := a.st.TypeByID(typeID, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if t == nil {
		writeErr(w, apperr.New(404, "", "Harcama türü bulunamadı"))
		return
	}
	if t.Archived {
		writeErr(w, apperr.New(400, "", "Arşivlenmiş tür seçilemez"))
		return
	}
	spentAt := time.Now().UnixMilli()
	if body.SpentAt.Set {
		spentAt = body.SpentAt.Val
	}
	data, err := a.sealExpense(uid, *body.Amount, note)
	if err != nil {
		writeErr(w, err)
		return
	}
	id, err := a.st.InsertExpense(uid, typeID, spentAt, data)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, map[string]string{"id": id})
}

func (a *API) handleExpenseList(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	q := r.URL.Query()
	var from, to *int64
	if v, ok := parseInt64(q.Get("from")); ok {
		from = &v
	}
	if v, ok := parseInt64(q.Get("to")); ok {
		to = &v
	}
	typeID := ""
	if v := q.Get("typeId"); v != "" {
		t, verr := validateUUID(v, "typeId")
		if verr != nil {
			writeErr(w, verr)
			return
		}
		typeID = t
	}
	limit := 100
	if v, ok := parseInt64(q.Get("limit")); ok {
		if v < 1 || v > 500 {
			writeErr(w, invalid("limit", "1 ile 500 arasında olmalı"))
			return
		}
		limit = int(v)
	}
	offset := 0
	if v, ok := parseInt64(q.Get("offset")); ok {
		if v < 0 {
			writeErr(w, invalid("offset", "0 veya daha büyük olmalı"))
			return
		}
		offset = int(v)
	}

	rows, err := a.st.SelectExpenseRows(uid, from, to, typeID, limit, offset)
	if err != nil {
		writeErr(w, err)
		return
	}
	dtos := make([]expenseDTO, 0, len(rows))
	for _, row := range rows {
		dto, _, err := a.toDTO(uid, row)
		if err != nil {
			writeErr(w, err)
			return
		}
		dtos = append(dtos, dto)
	}
	total, err := a.st.CountExpenses(uid, from, to, typeID)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"rows": dtos, "total": total})
}

func (a *API) handleExpenseUpdate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	var body struct {
		TypeID  *string `json:"typeId"`
		Amount  *int64  `json:"amount"`
		Note    OptStr  `json:"note"`
		SpentAt SpentAt `json:"spentAt"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	row, err := a.st.ExpenseByID(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if row == nil {
		writeErr(w, apperr.New(404, "", "Harcama bulunamadı"))
		return
	}
	if body.TypeID != nil {
		newTypeID, verr := validateUUID(*body.TypeID, "typeId")
		if verr != nil {
			writeErr(w, verr)
			return
		}
		if newTypeID != row.TypeID {
			t, err := a.st.TypeByID(newTypeID, uid)
			if err != nil {
				writeErr(w, err)
				return
			}
			if t == nil {
				writeErr(w, apperr.New(404, "", "Harcama türü bulunamadı"))
				return
			}
			if t.Archived {
				writeErr(w, apperr.New(400, "", "Arşivlenmiş tür seçilemez"))
				return
			}
			row.TypeID = newTypeID
		}
	}
	current, err := a.decryptExpense(uid, row.Data)
	if err != nil {
		writeErr(w, err)
		return
	}
	amount := current.A
	if body.Amount != nil {
		if verr := validateAmount(*body.Amount); verr != nil {
			writeErr(w, verr)
			return
		}
		amount = *body.Amount
	}
	note := current.N
	if body.Note.Set {
		note, verr = trimNote(body.Note.Val)
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	spentAt := row.SpentAt
	if body.SpentAt.Set {
		spentAt = body.SpentAt.Val
	}
	data, err := a.sealExpense(uid, amount, note)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.UpdateExpense(id, row.TypeID, spentAt, data); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleExpenseDelete(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	affected, err := a.st.DeleteExpense(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if affected == 0 {
		writeErr(w, apperr.New(404, "", "Harcama bulunamadı"))
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
