async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const errEl = document.getElementById('reg-err');
  const okEl  = document.getElementById('reg-ok');
  const btn   = document.getElementById('reg-btn');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (!name || !email || !pass || !pass2) {
    errEl.textContent = 'Wypełnij wszystkie pola.'; errEl.style.display = 'block'; return;
  }
  if (!email.includes('@')) {
    errEl.textContent = 'Podaj poprawny adres e-mail.'; errEl.style.display = 'block'; return;
  }
  if (pass.length < 6) {
    errEl.textContent = 'Hasło musi mieć co najmniej 6 znaków.'; errEl.style.display = 'block'; return;
  }
  if (pass !== pass2) {
    errEl.textContent = 'Hasła nie są identyczne.'; errEl.style.display = 'block'; return;
  }

  btn.disabled = true; btn.textContent = 'Tworzę konto...';

  try {
    // 1. Look up pending plan from Stripe webhook
    let plan = 'pro'; // default
    try {
      const { data: pending } = await _sb
        .from('pending_registrations')
        .select('plan, stripe_customer_id')
        .eq('email', email)
        .single();
      if (pending?.plan) plan = pending.plan;
    } catch (e) { /* no pending row — use default */ }

    // 2. Sign up with email + password
    const { data, error } = await _sb.auth.signUp({
      email,
      password: pass,
      options: { data: { name } }
    });

    if (error) throw error;

    const userId = data.user?.id;
    if (!userId) throw new Error('Nie udało się utworzyć konta.');

    // 3. Save profile
    await _sb.from('profiles').upsert({
      id: userId,
      name,
      email,
    });

    // 4. Save subscription (trial)
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);
    await _sb.from('subscriptions').upsert({
      user_id: userId,
      plan,
      status: 'trial',
      trial_ends_at: trialEnds.toISOString(),
    }, { onConflict: 'user_id' });

    // 5. Sign in immediately (signUp doesn't auto-login if email confirm is on)
    const { error: signInErr } = await _sb.auth.signInWithPassword({ email, password: pass });
    if (signInErr) {
      // Email confirmation is required — tell the user
      okEl.textContent = '✅ Sprawdź skrzynkę email i kliknij w link aktywacyjny, a następnie wróć i zaloguj się.';
      okEl.style.display = 'block';
      btn.textContent = 'Gotowe';
      return;
    }

    // 6. Clean up pending registration
    await _sb.from('pending_registrations').delete().eq('email', email);

    okEl.textContent = '✅ Konto utworzone! Przekierowuję do panelu…';
    okEl.style.display = 'block';
    setTimeout(() => { window.location.href = '/app.html'; }, 1200);

  } catch (err) {
    // Handle "User already registered" — just sign them in
    if (err.message?.includes('already registered') || err.message?.includes('already been registered')) {
      const { error: signInErr } = await _sb.auth.signInWithPassword({ email, password: pass });
      if (!signInErr) {
        okEl.textContent = '✅ Zalogowano! Przekierowuję do panelu…';
        okEl.style.display = 'block';
        setTimeout(() => { window.location.href = '/app.html'; }, 1200);
        return;
      }
    }
    errEl.textContent = err.message || 'Błąd rejestracji. Spróbuj ponownie.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Utwórz konto i przejdź do panelu →';
  }
}
