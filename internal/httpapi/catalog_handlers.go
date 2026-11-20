package httpapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/EnesBaytekin/nomi/internal/apperr"
	"github.com/EnesBaytekin/nomi/internal/store"
)

type catalogTypeDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Archived  bool   `json:"archived"`
	SortOrder int64  `json:"sortOrder"`
}

type catalogCategoryDTO struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Icon      string            `json:"icon"`
	Color     string            `json:"color"`
	SortOrder int64             `json:"sortOrder"`
	Types     []catalogTypeDTO  `json:"types"`
}

func (a *API) handleCatalog(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	cats, err := a.st.CategoriesByUser(uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	types, err := a.st.TypesByUser(uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]catalogCategoryDTO, 0, len(cats))
	for _, c := range cats {
		dto := catalogCategoryDTO{
			ID: c.ID, Name: c.Name, Icon: c.Icon, Color: c.Color, SortOrder: c.SortOrder,
			Types: make([]catalogTypeDTO, 0),
		}
		for _, t := range types {
			if t.CategoryID != c.ID {
				continue
			}
			dto.Types = append(dto.Types, catalogTypeDTO{
				ID: t.ID, Name: t.Name, Icon: t.Icon, Archived: t.Archived, SortOrder: t.SortOrder,
			})
		}
		out = append(out, dto)
	}
	writeJSON(w, 200, map[string]any{"categories": out})
}

func (a *API) handleCategoryCreate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	var body struct {
		Name  string  `json:"name"`
		Icon  *string `json:"icon"`
		Color *string `json:"color"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	name, verr := validateName(body.Name)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	icon, verr := validateIcon(body.Icon)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	color, verr := validateColor(body.Color)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	id, err := a.st.InsertCategory(uid, name, icon, color)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (a *API) handleCategoryUpdate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	var body struct {
		Name  OptStr `json:"name"`
		Icon  OptStr `json:"icon"`
		Color OptStr `json:"color"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	row, err := a.st.CategoryByID(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if row == nil {
		writeErr(w, apperr.New(404, "", "Kategori bulunamadı"))
		return
	}
	name := row.Name
	if body.Name.Set {
		name, verr = validateName(orEmpty(body.Name.Val))
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	icon := row.Icon
	if body.Icon.Set {
		icon, verr = validateIcon(body.Icon.Val)
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	color := row.Color
	if body.Color.Set {
		color, verr = validateColor(body.Color.Val)
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	if err := a.st.UpdateCategory(id, name, icon, color); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleCategoryDelete(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	row, err := a.st.CategoryByID(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if row == nil {
		writeErr(w, apperr.New(404, "", "Kategori bulunamadı"))
		return
	}
	typeCount, err := a.st.CountTypesInCategory(id)
	if err != nil {
		writeErr(w, err)
		return
	}
	if typeCount > 0 {
		writeErr(w, apperr.New(409, "", "Kategori boş değil. Önce türleri başka kategoriye taşıyın veya silin."))
		return
	}
	if err := a.st.DeleteCategory(id); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleTypeCreate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	var body struct {
		CategoryID string  `json:"categoryId"`
		Name       string  `json:"name"`
		Icon       *string `json:"icon"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	catID, verr := validateUUID(body.CategoryID, "categoryId")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	name, verr := validateName(body.Name)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	icon, verr := validateIcon(body.Icon)
	if verr != nil {
		writeErr(w, verr)
		return
	}
	cat, err := a.st.CategoryByID(catID, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if cat == nil {
		writeErr(w, apperr.New(404, "", "Kategori bulunamadı"))
		return
	}
	id, err := a.st.InsertType(uid, catID, name, icon)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (a *API) handleTypeUpdate(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	var body struct {
		Name       OptStr  `json:"name"`
		Icon       OptStr  `json:"icon"`
		CategoryID OptStr  `json:"categoryId"`
		Archived   OptBool `json:"archived"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	row, err := a.st.TypeByID(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if row == nil {
		writeErr(w, apperr.New(404, "", "Tür bulunamadı"))
		return
	}
	categoryID := row.CategoryID
	if body.CategoryID.Set && body.CategoryID.Val != nil {
		newCatID, verr := validateUUID(*body.CategoryID.Val, "categoryId")
		if verr != nil {
			writeErr(w, verr)
			return
		}
		if newCatID != row.CategoryID {
			cat, err := a.st.CategoryByID(newCatID, uid)
			if err != nil {
				writeErr(w, err)
				return
			}
			if cat == nil {
				writeErr(w, apperr.New(404, "", "Hedef kategori bulunamadı"))
				return
			}
			categoryID = newCatID
		}
	}
	name := row.Name
	if body.Name.Set {
		name, verr = validateName(orEmpty(body.Name.Val))
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	icon := row.Icon
	if body.Icon.Set {
		icon, verr = validateIcon(body.Icon.Val)
		if verr != nil {
			writeErr(w, verr)
			return
		}
	}
	archived := row.Archived
	if body.Archived.Set {
		archived = body.Archived.Val
	}
	if err := a.st.UpdateType(id, categoryID, name, icon, archived); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleTypeDelete(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	id, verr := validateUUID(r.PathValue("id"), "id")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	row, err := a.st.TypeByID(id, uid)
	if err != nil {
		writeErr(w, err)
		return
	}
	if row == nil {
		writeErr(w, apperr.New(404, "", "Tür bulunamadı"))
		return
	}
	used, err := a.st.CountExpensesOfType(id)
	if err != nil {
		writeErr(w, err)
		return
	}
	if used > 0 {
		writeErr(w, apperr.New(409, "IN_USE", "Bu türde harcamalar var. Silmek yerine arşivleyebilirsin."))
		return
	}
	if err := a.st.DeleteType(id); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) handleSwap(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	var body struct {
		Kind string `json:"kind"`
		A    string `json:"a"`
		B    string `json:"b"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeErr(w, err)
		return
	}
	if body.Kind != "category" && body.Kind != "type" {
		writeErr(w, apperr.New(400, "", "kind: category veya type olmalı"))
		return
	}
	aID, verr := validateUUID(body.A, "a")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	bID, verr := validateUUID(body.B, "b")
	if verr != nil {
		writeErr(w, verr)
		return
	}
	table := "expense_types"
	if body.Kind == "category" {
		table = "categories"
	}
	if err := a.st.SwapSortOrder(table, aID, bID, uid); err != nil {
		if errors.Is(err, store.ErrBadTable) || errors.Is(err, sql.ErrNoRows) {
			writeErr(w, apperr.New(404, "", "Kayıt bulunamadı"))
			return
		}
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// orEmpty, OptStr.Val nil ise boş dize (zod optional dizenin default akışı).
func orEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
