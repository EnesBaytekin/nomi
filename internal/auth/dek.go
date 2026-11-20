package auth

import (
	"sync"

	"github.com/EnesBaytekin/nomi/internal/cryptoutil"
	"github.com/EnesBaytekin/nomi/internal/store"
)

// DEKCache, kullanıcı veri anahtarlarını bellekte tutar
// (veritabanında yalnız MASTER_KEY ile sarılı hali durur).
type DEKCache struct {
	mu   sync.Mutex
	m    map[string][]byte
	mKey []byte
}

// NewDEKCache, yeni önbellek.
func NewDEKCache(masterKey []byte) *DEKCache {
	return &DEKCache{m: map[string][]byte{}, mKey: masterKey}
}

// Get, kullanıcının DEK'ini döner (gerekirse sarılı halden açar).
func (c *DEKCache) Get(u *store.User) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if dek, ok := c.m[u.ID]; ok {
		return dek, nil
	}
	dek, err := cryptoutil.UnwrapDEK(u.WrappedDEK, c.mKey)
	if err != nil {
		return nil, err
	}
	if len(c.m) > 500 {
		c.m = map[string][]byte{}
	}
	c.m[u.ID] = dek
	return dek, nil
}
