package store

import (
	"database/sql"
	"time"
)

// --- Katalog sorguları ---

// CategoriesByUser, kullanıcının kategorileri (sıralı).
func (s *Store) CategoriesByUser(userID string) ([]*Category, error) {
	return scanCategories(s.db.Query(
		`SELECT id, user_id, name, icon, color, sort_order, created_at
		 FROM categories WHERE user_id = ? ORDER BY sort_order, created_at`, userID))
}

// TypesByUser, kullanıcının tüm türleri (sıralı).
func (s *Store) TypesByUser(userID string) ([]*ExpenseType, error) {
	return scanTypes(s.db.Query(
		`SELECT id, user_id, category_id, name, icon, archived, sort_order, created_at
		 FROM expense_types WHERE user_id = ? ORDER BY sort_order, created_at`, userID))
}

// CategoryByID, kategori getirir (kullanıcıya aitse).
func (s *Store) CategoryByID(id, userID string) (*Category, error) {
	return scanCategory(s.db.QueryRow(
		`SELECT id, user_id, name, icon, color, sort_order, created_at
		 FROM categories WHERE id = ? AND user_id = ?`, id, userID))
}

// TypeByID, tür getirir (kullanıcıya aitse).
func (s *Store) TypeByID(id, userID string) (*ExpenseType, error) {
	return scanType(s.db.QueryRow(
		`SELECT id, user_id, category_id, name, icon, archived, sort_order, created_at
		 FROM expense_types WHERE id = ? AND user_id = ?`, id, userID))
}

// TypeByIDAnyUser, türü sahibinden bağımsız getirir (JOIN kontrolleri için).
func (s *Store) TypeByIDAnyUser(id string) (*ExpenseType, error) {
	return scanType(s.db.QueryRow(
		`SELECT id, user_id, category_id, name, icon, archived, sort_order, created_at
		 FROM expense_types WHERE id = ?`, id))
}

// InsertCategory, yeni kategori ekler.
func (s *Store) InsertCategory(userID, name, icon, color string) (string, error) {
	var max sql.NullInt64
	s.db.QueryRow(`SELECT MAX(sort_order) FROM categories WHERE user_id = ?`, userID).Scan(&max)
	id := NewID()
	_, err := s.db.Exec(
		`INSERT INTO categories (id, user_id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, name, icon, color, max.Int64+10, time.Now().UnixMilli())
	return id, err
}

// UpdateCategory, kategori alanlarını günceller.
func (s *Store) UpdateCategory(id, name, icon, color string) error {
	_, err := s.db.Exec(`UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?`, name, icon, color, id)
	return err
}

// DeleteCategory, kategoriyi siler.
func (s *Store) DeleteCategory(id string) error {
	_, err := s.db.Exec(`DELETE FROM categories WHERE id = ?`, id)
	return err
}

// CountTypesInCategory, kategorideki tür sayısı.
func (s *Store) CountTypesInCategory(id string) (int64, error) {
	var c int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM expense_types WHERE category_id = ?`, id).Scan(&c)
	return c, err
}

// InsertType, yeni tür ekler.
func (s *Store) InsertType(userID, categoryID, name, icon string) (string, error) {
	var max sql.NullInt64
	s.db.QueryRow(`SELECT MAX(sort_order) FROM expense_types WHERE user_id = ?`, userID).Scan(&max)
	id := NewID()
	_, err := s.db.Exec(
		`INSERT INTO expense_types (id, user_id, category_id, name, icon, archived, sort_order, created_at)
		 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
		id, userID, categoryID, name, icon, max.Int64+10, time.Now().UnixMilli())
	return id, err
}

// UpdateType, tür alanlarını günceller.
func (s *Store) UpdateType(id, categoryID, name, icon string, archived bool) error {
	a := 0
	if archived {
		a = 1
	}
	_, err := s.db.Exec(
		`UPDATE expense_types SET name = ?, icon = ?, category_id = ?, archived = ? WHERE id = ?`,
		name, icon, categoryID, a, id)
	return err
}

// DeleteType, türü siler.
func (s *Store) DeleteType(id string) error {
	_, err := s.db.Exec(`DELETE FROM expense_types WHERE id = ?`, id)
	return err
}

// CountExpensesOfType, türün harcama sayısı.
func (s *Store) CountExpensesOfType(id string) (int64, error) {
	var c int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM expenses WHERE type_id = ?`, id).Scan(&c)
	return c, err
}

// SwapSortOrder, iki kaydın sort_order değerlerini yer değiştirir.
func (s *Store) SwapSortOrder(table, a, b, userID string) error {
	if table != "categories" && table != "expense_types" {
		return ErrBadTable
	}
	return s.Tx(func(tx *sql.Tx) error {
		var sa, sb int64
		if err := tx.QueryRow(`SELECT sort_order FROM `+table+` WHERE id = ? AND user_id = ?`, a, userID).Scan(&sa); err != nil {
			return err
		}
		if err := tx.QueryRow(`SELECT sort_order FROM `+table+` WHERE id = ? AND user_id = ?`, b, userID).Scan(&sb); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE `+table+` SET sort_order = ? WHERE id = ?`, sb, a); err != nil {
			return err
		}
		_, err := tx.Exec(`UPDATE `+table+` SET sort_order = ? WHERE id = ?`, sa, b)
		return err
	})
}

// --- Gider sorguları ---

// InsertExpense, harcama ekler.
func (s *Store) InsertExpense(userID, typeID string, spentAt int64, encryptedData string) (string, error) {
	id := NewID()
	_, err := s.db.Exec(
		`INSERT INTO expenses (id, user_id, type_id, spent_at, data, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, typeID, spentAt, encryptedData, spentAt, spentAt)
	return id, err
}

// ExpenseByID, harcama getirir (kullanıcıya aitse).
func (s *Store) ExpenseByID(id, userID string) (*Expense, error) {
	e := &Expense{}
	err := s.db.QueryRow(
		`SELECT id, user_id, type_id, spent_at, data, created_at, updated_at
		 FROM expenses WHERE id = ? AND user_id = ?`, id, userID).
		Scan(&e.ID, &e.UserID, &e.TypeID, &e.SpentAt, &e.Data, &e.CreatedAt, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

// UpdateExpense, harcamayı günceller.
func (s *Store) UpdateExpense(id, typeID string, spentAt int64, encryptedData string) error {
	_, err := s.db.Exec(
		`UPDATE expenses SET type_id = ?, spent_at = ?, data = ?, updated_at = ? WHERE id = ?`,
		typeID, spentAt, encryptedData, time.Now().UnixMilli(), id)
	return err
}

// DeleteExpense, harcamayı siler; silinen satır sayısını döner.
func (s *Store) DeleteExpense(id, userID string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM expenses WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// RecentTypeIDs, son 30 günde en sık kullanılan 5 tür.
func (s *Store) RecentTypeIDs(userID string) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT type_id FROM expenses
		 WHERE user_id = ? AND spent_at > ? GROUP BY type_id ORDER BY COUNT(*) DESC LIMIT 5`,
		userID, time.Now().UnixMilli()-30*24*60*60*1000)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// --- Tarama yardımcıları ---

func scanCategory(row interface{ Scan(...any) error }) (*Category, error) {
	c := &Category{}
	err := row.Scan(&c.ID, &c.UserID, &c.Name, &c.Icon, &c.Color, &c.SortOrder, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func scanCategories(rows *sql.Rows, err error) ([]*Category, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Category
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func scanType(row interface{ Scan(...any) error }) (*ExpenseType, error) {
	t := &ExpenseType{}
	var archived int
	err := row.Scan(&t.ID, &t.UserID, &t.CategoryID, &t.Name, &t.Icon, &archived, &t.SortOrder, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Archived = archived == 1
	return t, nil
}

func scanTypes(rows *sql.Rows, err error) ([]*ExpenseType, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*ExpenseType
	for rows.Next() {
		t, err := scanType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
