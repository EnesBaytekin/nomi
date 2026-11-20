package store

import (
	"strings"
)

// JoinedExpense, harcama + tür + kategori birleşik satırı.
type JoinedExpense struct {
	ID        string
	TypeID    string
	SpentAt   int64
	Data      string // şifreli
	CreatedAt int64

	TypeName    string
	TypeIcon    string
	TypeArchived bool

	CategoryID    string
	CategoryName  string
	CategoryColor string
}

// SelectExpenseRows, filtreli + sayfalı harcama listesi (JOIN'li).
func (s *Store) SelectExpenseRows(userID string, from, to *int64, typeID string, limit, offset int) ([]*JoinedExpense, error) {
	cond := []string{"e.user_id = ?"}
	args := []any{userID}
	if from != nil {
		cond = append(cond, "e.spent_at >= ?")
		args = append(args, *from)
	}
	if to != nil {
		cond = append(cond, "e.spent_at <= ?")
		args = append(args, *to)
	}
	if typeID != "" {
		cond = append(cond, "e.type_id = ?")
		args = append(args, typeID)
	}
	args = append(args, limit, offset)
	rows, err := s.db.Query(
		`SELECT e.id, e.type_id, e.spent_at, e.data, e.created_at,
		        t.name AS type_name, t.icon AS type_icon, t.archived AS type_archived,
		        c.id AS category_id, c.name AS category_name, c.color AS category_color
		 FROM expenses e
		 JOIN expense_types t ON t.id = e.type_id
		 JOIN categories c ON c.id = t.category_id
		 WHERE `+strings.Join(cond, " AND ")+`
		 ORDER BY e.spent_at DESC, e.created_at DESC
		 LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*JoinedExpense
	for rows.Next() {
		j := &JoinedExpense{}
		var archived int
		if err := rows.Scan(&j.ID, &j.TypeID, &j.SpentAt, &j.Data, &j.CreatedAt,
			&j.TypeName, &j.TypeIcon, &archived,
			&j.CategoryID, &j.CategoryName, &j.CategoryColor); err != nil {
			return nil, err
		}
		j.TypeArchived = archived == 1
		out = append(out, j)
	}
	return out, rows.Err()
}

// CountExpenses, filtre sayısındaki toplam harcama adedi.
func (s *Store) CountExpenses(userID string, from, to *int64, typeID string) (int64, error) {
	cond := []string{"user_id = ?"}
	args := []any{userID}
	if from != nil {
		cond = append(cond, "spent_at >= ?")
		args = append(args, *from)
	}
	if to != nil {
		cond = append(cond, "spent_at <= ?")
		args = append(args, *to)
	}
	if typeID != "" {
		cond = append(cond, "type_id = ?")
		args = append(args, typeID)
	}
	var c int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM expenses WHERE `+strings.Join(cond, " AND "), args...).Scan(&c)
	return c, err
}
