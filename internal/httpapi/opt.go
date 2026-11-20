package httpapi

// OptStr, "alan hiç gönderilmedi" ile "null gönderildi" ayrımını yapar
// (Node sürümündeki zod optional/nullable davranışının karşılığı).
type OptStr struct {
	Set bool
	Val *string
}

func (o *OptStr) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		return nil
	}
	var s string
	if err := jsonUnmarshal(b, &s); err != nil {
		return err
	}
	o.Val = &s
	return nil
}

// OptBool, tıpkı OptStr gibi ama bool için.
type OptBool struct {
	Set bool
	Val bool
}

func (o *OptBool) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		return nil
	}
	return jsonUnmarshal(b, &o.Val)
}

// SpentAt, sayı (epoch ms) veya ISO tarih dizesi kabul eder.
type SpentAt struct {
	Set bool
	Val int64
}

func (s *SpentAt) UnmarshalJSON(b []byte) error {
	s.Set = true
	var num jsonNumber
	if err := jsonUnmarshal(b, &num); err == nil {
		v, err := num.Int64()
		if err != nil || v <= 0 {
			return errBadDate
		}
		s.Val = v
		return nil
	}
	var str string
	if err := jsonUnmarshal(b, &str); err != nil {
		return errBadDate
	}
	for _, layout := range []string{timeRFC3339, timeRFC3339NoTZ, "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
		if t, err := timeParse(layout, str); err == nil {
			s.Val = t.UnixMilli()
			return nil
		}
	}
	return errBadDate
}
