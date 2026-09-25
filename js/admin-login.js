/* Admin sign-in: password -> (authenticator code | first-time authenticator set-up) -> dashboard. */
(function () {
  const $ = (id) => document.getElementById(id);
  const steps = { login: $('stepLogin'), code: $('stepCode'), enroll: $('stepEnroll') };
  const errBox = $('loginError');
  let enrol = null;

  function show(name) {
    Object.entries(steps).forEach(([k, el]) => el.classList.toggle('on', k === name));
    errBox.classList.remove('show');
    const focus = { login: 'email', code: 'code', enroll: 'enrolCode' }[name];
    setTimeout(() => $(focus).focus(), 50);
  }
  function fail(msg) {
    errBox.textContent = msg;
    errBox.classList.remove('show');
    void errBox.offsetWidth; // restart the animation
    errBox.classList.add('show');
  }
  function busy(form, on, label) {
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
  const digits = (el) => el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 6); });
  digits($('code')); digits($('enrolCode'));

  async function proceed(step) {
    if (step.status === 'ok') { window.location.replace('/admin/dashboard/'); return; }
    if (step.status === 'mfa_verify') { show('code'); return; }
    if (step.status === 'mfa_enroll') {
      try {
        enrol = await CMS.startMfaEnroll();
        $('qr').src = enrol.qr;
        $('secret').textContent = enrol.secret;
        show('enroll');
      } catch (e) { fail(e.message); show('login'); }
      return;
    }
    fail('Your password is right, but this account is not on the dashboard\'s admin list yet. The site owner needs to add it (see SECURITY.md).');
    show('login');
  }

  if (CMS.mode === 'demo') {
    const n = $('demoNote');
    n.classList.remove('hidden');
    n.innerHTML = `<strong>Demo mode</strong> (nothing here touches the live site).<br>Email: <code>${CMS.demoCredentials.email}</code><br>Password: <code>${CMS.demoCredentials.password}</code>`;
  }

  if (new URLSearchParams(location.search).get('idle') === '1') {
    $('loginSub').textContent = 'You were signed out after a few minutes of inactivity. Anything you were writing is saved on this device.';
  }

  steps.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy(steps.login, true, 'Signing in…');
    try {
      const step = await CMS.login($('email').value.trim(), $('password').value);
      $('password').value = '';
      await proceed(step);
    } catch (err) { fail(err.message); $('password').value = ''; $('password').focus(); }
    finally { busy(steps.login, false); }
  });

  steps.code.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy(steps.code, true, 'Checking…');
    try { await CMS.verifyMfa($('code').value); window.location.replace('/admin/dashboard/'); }
    catch (err) { fail(err.message); $('code').value = ''; $('code').focus(); }
    finally { busy(steps.code, false); }
  });

  steps.enroll.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy(steps.enroll, true, 'Checking…');
    try { await CMS.finishMfaEnroll(enrol.factorId, $('enrolCode').value); window.location.replace('/admin/dashboard/'); }
    catch (err) { fail(err.message); $('enrolCode').value = ''; $('enrolCode').focus(); }
    finally { busy(steps.enroll, false); }
  });

  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', async () => { await CMS.logout(); show('login'); }));

  // Already signed in (and finished any code step)? Go straight in.
  (async function init() {
    try {
      const me = await CMS.getAdmin();
      if (me && !me.needs) { window.location.replace('/admin/dashboard/'); return; }
      if (me && me.needs) await proceed({ status: me.needs });
    } catch (e) { /* show the form */ }
  })();
})();
