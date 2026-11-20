package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

// İstatistikler istemcinin saat dilimine göre gruplanır.
// İstemci tz olarak Date.getTimezoneOffset() gönderir (ör. Türkiye için -180).
// Duvar saati epoch = ts - tz dakika.

type monthBucket struct {
	Ym         string           `json:"ym"`
	Total      int64            `json:"total"`
	Count      int64            `json:"count"`
	ByCategory map[string]int64 `json:"byCategory"`
	ByType     map[string]int64 `json:"byType"`
}

func ymOf(ts, tzMin int64) string {
	d := time.UnixMilli(ts - tzMin*60000).UTC()
	return fmt.Sprintf("%04d-%02d", d.Year(), int(d.Month()))
}

func monthStartTs(ym string, tzMin int64) int64 {
	var y, m int
	fmt.Sscanf(ym, "%d-%d", &y, &m)
	return time.Date(y, time.Month(m), 1, 0, 0, 0, 0, time.UTC).UnixMilli() + tzMin*60000
}

func shiftYm(ym string, delta int) string {
	var y, m int
	fmt.Sscanf(ym, "%d-%d", &y, &m)
	d := time.Date(y, time.Month(m+delta), 1, 0, 0, 0, 0, time.UTC)
	return fmt.Sprintf("%04d-%02d", d.Year(), int(d.Month()))
}

func (a *API) handleStatsMonthly(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	q := r.URL.Query()

	months := int64(6)
	if v, ok := parseInt64(q.Get("months")); ok {
		months = v
	}
	if months < 1 || months > 24 {
		writeErr(w, invalid("months", "1 ile 24 arasında olmalı"))
		return
	}
	tz := int64(-180)
	if v, ok := parseInt64(q.Get("tz")); ok {
		tz = v
	}
	if tz < -840 || tz > 840 {
		writeErr(w, invalid("tz", "geçersiz saat dilimi ofseti"))
		return
	}

	nowYm := ymOf(time.Now().UnixMilli(), tz)
	firstYm := shiftYm(nowYm, int(-(months - 1)))
	fromTs := monthStartTs(firstYm, tz)
	toTs := monthStartTs(shiftYm(nowYm, 1), tz) - 1

	rows, err := a.st.SelectExpenseRows(uid, &fromTs, &toTs, "", 100_000, 0)
	if err != nil {
		writeErr(w, err)
		return
	}

	buckets := make(map[string]*monthBucket, months)
	order := make([]string, 0, months)
	for i := 0; i < int(months); i++ {
		ym := shiftYm(firstYm, i)
		buckets[ym] = &monthBucket{
			Ym:         ym,
			ByCategory: map[string]int64{},
			ByType:     map[string]int64{},
		}
		order = append(order, ym)
	}
	for _, row := range rows {
		dto, p, err := a.toDTO(uid, row)
		if err != nil {
			writeErr(w, err)
			return
		}
		b, ok := buckets[ymOf(dto.SpentAt, tz)]
		if !ok {
			continue
		}
		b.Total += p.A
		b.Count++
		b.ByCategory[dto.CategoryID] += p.A
		b.ByType[dto.TypeID] += p.A
	}

	monthsOut := make([]*monthBucket, 0, len(order))
	for _, ym := range order {
		monthsOut = append(monthsOut, buckets[ym])
	}
	writeJSON(w, 200, map[string]any{"months": monthsOut})
}

func (a *API) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := a.user(r).ID
	user := a.user(r)
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}
	if format != "json" && format != "csv" {
		writeErr(w, invalid("format", "json veya csv olmalı"))
		return
	}

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
	rows, err := a.st.SelectExpenseRows(uid, nil, nil, "", 1_000_000, 0)
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

	if format == "csv" {
		esc := func(v string) string {
			s := strings.ReplaceAll(v, `"`, `""`)
			if strings.ContainsAny(s, "\";\n") {
				return `"` + s + `"`
			}
			return s
		}
		pad := func(n int) string { return fmt.Sprintf("%02d", n) }
		var b strings.Builder
		b.WriteString("Tarih;Saat;Tür;Kategori;Miktar (TL);Not\r\n")
		for _, d := range dtos {
			t := time.UnixMilli(d.SpentAt)
			amount := strings.Replace(fmt.Sprintf("%.2f", float64(d.Amount)/100), ".", ",", 1)
			b.WriteString(strings.Join([]string{
				fmt.Sprintf("%d-%s-%s", t.Year(), pad(int(t.Month())), pad(t.Day())),
				pad(t.Hour()) + ":" + pad(t.Minute()),
				esc(d.TypeName),
				esc(d.CategoryName),
				amount,
				esc(orEmpty(d.Note)),
			}, ";") + "\r\n")
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(b.String()))
		return
	}

	type catExport struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Icon      string `json:"icon"`
		Color     string `json:"color"`
		SortOrder int64  `json:"sort_order"`
	}
	type typeExport struct {
		ID         string `json:"id"`
		CategoryID string `json:"category_id"`
		Name       string `json:"name"`
		Icon       string `json:"icon"`
		Archived   int64  `json:"archived"`
		SortOrder  int64  `json:"sort_order"`
	}
	type expExport struct {
		Amount       int64   `json:"amount"`
		Note         *string `json:"note"`
		TypeName     string  `json:"typeName"`
		CategoryName string  `json:"categoryName"`
		SpentAt      int64   `json:"spentAt"`
		CreatedAt    int64   `json:"createdAt"`
	}
	catsOut := make([]catExport, 0, len(cats))
	for _, c := range cats {
		catsOut = append(catsOut, catExport{ID: c.ID, Name: c.Name, Icon: c.Icon, Color: c.Color, SortOrder: c.SortOrder})
	}
	typesOut := make([]typeExport, 0, len(types))
	for _, t := range types {
		aInt := int64(0)
		if t.Archived {
			aInt = 1
		}
		typesOut = append(typesOut, typeExport{ID: t.ID, CategoryID: t.CategoryID, Name: t.Name, Icon: t.Icon, Archived: aInt, SortOrder: t.SortOrder})
	}
	expsOut := make([]expExport, 0, len(dtos))
	for _, d := range dtos {
		expsOut = append(expsOut, expExport{
			Amount: d.Amount, Note: d.Note, TypeName: d.TypeName, CategoryName: d.CategoryName,
			SpentAt: d.SpentAt, CreatedAt: d.CreatedAt,
		})
	}
	writeJSON(w, 200, map[string]any{
		"exportedAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		"user":       map[string]string{"username": user.Username},
		"categories": catsOut,
		"types":      typesOut,
		"expenses":   expsOut,
	})
}
