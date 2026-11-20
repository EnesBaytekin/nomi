// Giriş / kurulum ekranı.

import { el, toast } from '../dom.js';
import { api } from '../api.js';
import { login, setup } from '../auth.js';

export function renderLoginPage(container) {
  let needsSetup = null;
  let busy = false;
  let error = null;
  let username = '';
  let password = '';
  let password2 = '';
  let root = null;

  api('/auth/status')
    .then((r) => {
      needsSetup = r.needsSetup;
      draw();
    })
    .catch(() => {
      needsSetup = false;
      draw();
    });

  function draw() {
    if (!root) {
      root = el('div', { class: 'login-wrap' });
      container.textContent = '';
      container.appendChild(root);
    }
    root.textContent = '';

    const box = el('div', { class: 'login-box' });

    const brand = el(
      'div',
      { class: 'login-brand' },
      el('img', { src: '/favicon.svg', alt: 'Nomi' }),
      el(
        'div',
        {},
        el('h1', {}, 'Nomi'),
        el(
          'p',
          {},
          needsSetup ? 'Kurulum: ilk kullanıcı yönetici olur' : 'Hesabına giriş yap',
        ),
      ),
    );

    const userInput = el('input', {
      class: 'input',
      placeholder: 'Kullanıcı adı',
      autoComplete: 'username',
      autoCapitalize: 'none',
      required: true,
      minLength: 3,
    });
    userInput.value = username;
    userInput.addEventListener('input', () => (username = userInput.value));

    const passInput = el('input', {
      class: 'input',
      type: 'password',
      placeholder: 'Parola',
      autoComplete: needsSetup ? 'new-password' : 'current-password',
      required: true,
      minLength: 8,
    });
    passInput.value = password;
    passInput.addEventListener('input', () => (password = passInput.value));

    const form = el('form', { class: 'login-form' }, userInput, passInput);

    if (needsSetup) {
      const pass2 = el('input', {
        class: 'input',
        type: 'password',
        placeholder: 'Parola (tekrar)',
        autoComplete: 'new-password',
        required: true,
        minLength: 8,
      });
      pass2.value = password2;
      pass2.addEventListener('input', () => (password2 = pass2.value));
      form.appendChild(pass2);
    }

    if (error) form.appendChild(el('p', { class: 'form-error' }, error));

    const submitBtn = el(
      'button',
      { class: 'btn primary login-submit', type: 'submit' },
      busy ? '…' : needsSetup ? 'Kurulumu Tamamla' : 'Giriş Yap',
    );
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });

    box.appendChild(brand);
    box.appendChild(form);
    box.appendChild(
      el(
        'p',
        { class: 'login-note' },
        'Oturumun bu cihazda 7 gün boyunca tazelenerek açık kalır.',
      ),
    );

    root.appendChild(box);
  }

  async function submit() {
    if (busy || needsSetup === null) return;
    error = null;
    if (needsSetup && password !== password2) {
      error = 'Parolalar eşleşmiyor';
      draw();
      return;
    }
    busy = true;
    draw();
    try {
      if (needsSetup) {
        await setup(username.trim(), password);
        toast('Nomi hazır. Hoş geldin! 🎉');
      } else {
        await login(username.trim(), password);
        toast('Hoş geldin!');
      }
      // auth değişimi router'ı yeniden çizer
    } catch (err) {
      error = err instanceof Error ? err.message : 'Giriş başarısız';
      busy = false;
      draw();
    }
  }

  draw();
}
