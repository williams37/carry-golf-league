import { useEffect, useState } from 'react';
import { Icon, BrandMark, Seg } from '../components/ui.jsx';
import { auth } from '../lib/store/cloud.js';
import { writePrefs } from '../lib/useLeague.js';

/**
 * Sign-in that can't get stuck:
 *  - email + password is the default: no redirect URLs involved, works on any host
 *  - sign-up handles email confirmation explicitly ("check your email" + resend)
 *  - "checking" has a visible timeout path (retry / go offline) after 8 s
 *  - the 6-digit email code is the optional passwordless path
 *  - the demo league is always one tap away
 */
export default function AuthScreen({ ctx, joining }) {
  const { authState, checkAuth, cfg, setMode } = ctx;
  const [tab, setTab] = useState(localStorage.getItem('carry:authTab') || 'password');
  const [pwMode, setPwMode] = useState('signin'); // signin | signup | forgot
  const [email, setEmail] = useState(localStorage.getItem('carry:email') || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [confirmFor, setConfirmFor] = useState(null); // email awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [errCode, setErrCode] = useState(null);
  const [slow, setSlow] = useState(false);
  const [info, setInfo] = useState(null);
  const [exists, setExists] = useState(null); // email that already has an account (sign-up or a failed sign-in)

  useEffect(() => {
    if (authState.status !== 'checking') return;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [authState.status]);
  useEffect(() => { if (authState.error) setErr(authState.error); }, [authState.error]);

  const run = async (fn) => {
    setBusy(true); setErr(null); setErrCode(null); setInfo(null); setExists(null);
    localStorage.setItem('carry:email', email.trim());
    try { await fn(); } catch (e) {
      const m = e.message || String(e);
      setErrCode(e.code || null);
      if (e.code === 'invalid_credentials') { setExists({ email: email.trim(), why: 'signin' }); return; }
      setErr(/failed to fetch|networkerror|load failed/i.test(m) ? "Couldn't reach the league server. Check your connection and try again." : m);
    } finally { setBusy(false); }
  };
  const offline = () => { writePrefs({ onboarded: true }); setMode('local'); location.hash = '/home'; location.reload(); };
  const pickTab = (t) => { setTab(t); localStorage.setItem('carry:authTab', t); setErr(null); setInfo(null); setExists(null); };
  const em = email.trim();
  const okEmail = /^\S+@\S+\.\S+$/.test(em);
  // The two ways back into an existing account that has no (known) password
  const emailCode = () => run(async () => { pickTab('code'); await auth.sendLink(cfg, em); setSent(true); setInfo(`We emailed a sign-in code to ${em}. Type it below, or tap the link in the email on this device.`); });
  const forgot = () => run(async () => { setPwMode('forgot'); await auth.resetPassword(cfg, em); setInfo(`We emailed a reset link to ${em}. Open it on this device to choose a password.`); });

  if (authState.status === 'checking') {
    return (
      <div className="welcome"><div className="welcome-inner" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <BrandMark size={56} />
        <div className="display" style={{ fontSize: 26 }}>Signing you in…</div>
        <div className="moneybar" style={{ width: 200 }}><i style={{ width: '60%', background: 'var(--tracer)', animation: 'grow 1.2s ease-in-out infinite alternate' }} /></div>
        {slow && (
          <div className="stack rise" style={{ justifyItems: 'center' }}>
            <p className="t2" style={{ margin: 0 }}>This is taking longer than it should. Check your connection.</p>
            <div className="row"><button className="btn primary" onClick={checkAuth}>Retry</button><button className="btn" onClick={offline}>Use offline mode</button></div>
          </div>
        )}
      </div></div>
    );
  }

  // ---- "check your email" after sign-up with confirmation on ----
  if (confirmFor) {
    return (
      <div className="welcome"><div className="welcome-inner" data-testid="check-email">
        <div className="rise" style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'color-mix(in oklab, var(--aqua) 18%, var(--surface))' }}><Icon name="mail" size={30} style={{ color: 'var(--aqua)' }} /></div>
        <h1 className="rise rise-1" style={{ fontSize: 'clamp(34px, 8vw, 48px)' }}>Check your email</h1>
        <p className="lede rise rise-2">We sent a confirmation link to <b>{confirmFor}</b>. Tap it to activate your account, then come back here and sign in{joining ? <> to join with code <b className="num">{joining}</b></> : null}.</p>
        <p className="t2" style={{ margin: 0, fontSize: 13.5 }}>Nothing after a minute? Check spam or promotions. The link works on any device: if it opens somewhere else, your account is still confirmed.</p>
        {err && <div className="banner err" role="alert"><Icon name="info" size={18} style={{ color: 'var(--red)', flex: 'none' }} /><div className="grow">{err}</div></div>}
        {info && <div className="banner"><Icon name="check" size={18} style={{ color: 'var(--lime)', flex: 'none' }} />{info}</div>}
        <button className="btn primary block" onClick={() => { setConfirmFor(null); setPwMode('signin'); setErr(null); setInfo(null); }}>I've confirmed. Sign in</button>
        <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await auth.resendConfirmation(cfg, confirmFor); setInfo('Sent again. It can take a minute to arrive.'); })}>{busy ? 'Sending…' : 'Resend the email'}</button>
        <button className="btn ghost" onClick={() => { setConfirmFor(null); setPwMode('signup'); }}>Use a different email</button>
      </div></div>
    );
  }

  const title = joining ? 'Join your league' : pwMode === 'signup' && tab === 'password' ? 'Create your account' : pwMode === 'forgot' && tab === 'password' ? 'Reset password' : 'Sign in';
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <BrandMark size={48} />
        <h1 style={{ fontSize: 'clamp(36px, 9vw, 52px)' }}>{title}</h1>
        <p className="lede">{joining
          ? <>You're joining with code <b className="num">{joining}</b>. Sign in, or create an account if you're new, and you'll be in.</>
          : 'Your league lives here: scores, handicaps, skins and the live leaderboard, shared with everyone in it.'}</p>
        {err && (
          <div className="banner err" role="alert">
            <Icon name="info" size={18} style={{ color: 'var(--red)', flex: 'none' }} />
            <div className="grow">{err}</div>
            {errCode === 'email_not_confirmed'
              ? <button className="btn xs" disabled={busy} onClick={() => run(async () => { await auth.resendConfirmation(cfg, em); setConfirmFor(em); })}>Resend email</button>
              : authState.error && err === authState.error ? <button className="btn xs" onClick={() => { setErr(null); checkAuth(); }}>Retry</button> : null}
          </div>
        )}
        {info && <div className="banner"><Icon name="mail" size={18} style={{ color: 'var(--aqua)', flex: 'none' }} />{info}</div>}
        {exists && (
          <div className="banner warn" role="alert" style={{ display: 'grid', gap: 10 }} data-testid="account-exists">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Icon name="info" size={18} style={{ color: 'var(--gold)', flex: 'none', marginTop: 2 }} />
              <div>
                {exists.why === 'signup'
                  ? <><b>{exists.email} already has a Carry account.</b> Sign in with its password instead.</>
                  : <><b>That password didn't work for {exists.email}.</b> Check it and try again.</>}
                <div className="t2" style={{ marginTop: 4 }}>Made the account with an email code? Then it has no password yet. Get a code to sign in, or use Forgot password to set one.</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm primary" disabled={busy} onClick={emailCode} data-testid="exists-code"><Icon name="mail" size={15} /> Email me a code</button>
              <button className="btn sm" disabled={busy} onClick={forgot} data-testid="exists-forgot">Forgot password</button>
              {exists.why === 'signup' && <button className="btn sm ghost" onClick={() => { setExists(null); setPwMode('signin'); }}>Sign in</button>}
            </div>
          </div>
        )}
        <Seg value={tab} onChange={pickTab} options={[{ value: 'password', label: 'Password' }, { value: 'code', label: 'Email code' }]} />
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>

        {tab === 'password' && pwMode !== 'forgot' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault();
            if (pwMode === 'signin') run(async () => { await auth.signInPassword(cfg, em, password); await checkAuth(); });
            else run(async () => {
              const r = await auth.signUp(cfg, em, password);
              if (r.session) await checkAuth();
              else if (r.exists) { setPwMode('signin'); setPassword(''); setExists({ email: em, why: 'signup' }); }
              else setConfirmFor(em);
            });
          }}>
            <label className="field"><span>Password{pwMode === 'signup' ? ' (6+ characters)' : ''}</span><input className="input" name="password" type="password" autoComplete={pwMode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {pwMode === 'signin' ? (
              <>
                <button type="submit" className="btn primary block" disabled={busy || !okEmail || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
                <div className="row spread" style={{ fontSize: 13.5 }}>
                  <button type="button" className="btn ghost sm" onClick={() => { setPwMode('signup'); setErr(null); setInfo(null); }}>New here? Create an account</button>
                  <button type="button" className="btn ghost sm" onClick={() => { setPwMode('forgot'); setErr(null); setInfo(null); }}>Forgot password?</button>
                </div>
              </>
            ) : (
              <>
                <button type="submit" className="btn primary block" disabled={busy || !okEmail || password.length < 6}>{busy ? 'Creating…' : 'Create account'}</button>
                <button type="button" className="btn ghost sm" onClick={() => { setPwMode('signin'); setErr(null); setInfo(null); }}>Already have an account? Sign in</button>
              </>
            )}
          </form>
        )}

        {tab === 'password' && pwMode === 'forgot' && (
          <>
            <button className="btn primary block" disabled={busy || !okEmail} onClick={() => run(async () => { await auth.resetPassword(cfg, em); setInfo('Check your email for a reset link. Open it on this device to choose a new password.'); })}>{busy ? 'Sending…' : 'Email me a reset link'}</button>
            <button className="btn ghost sm" onClick={() => { setPwMode('signin'); setErr(null); setInfo(null); }}>Back to sign in</button>
          </>
        )}

        {tab === 'code' && (!sent ? (
          <button className="btn primary block" disabled={busy || !okEmail} onClick={() => run(async () => { await auth.sendLink(cfg, em); setSent(true); setInfo('Check your email. Type the code here, or tap the link in the email on this device.'); })}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        ) : (
          <>
            <label className="field"><span>Code from the email</span><input className="input code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus /></label>
            <button className="btn primary block" disabled={busy || code.length < 6} onClick={() => run(async () => { await auth.verifyCode(cfg, em, code); await checkAuth(); })}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await auth.sendLink(cfg, em); setInfo('New code sent.'); })}>Send a new code</button>
          </>
        ))}

        <div className="hr" style={{ height: 1, background: 'var(--line)', margin: '6px 0' }} />
        <button className="choice" onClick={offline}>
          <span className="ic"><Icon name="play" size={20} /></span>
          <span className="grow"><b>Just looking? Explore the demo league</b><small>8 players, 7 weeks, on this device only. Sign in any time from League.</small></span><Icon name="chev" />
        </button>
      </div>
    </div>
  );
}

/** Shown after a password-reset link: choose a new password. */
export function NewPassword({ ctx }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <div className="welcome"><div className="welcome-inner">
      <BrandMark size={48} />
      <h1 style={{ fontSize: 44 }}>Choose a new password</h1>
      {err && <div className="banner err"><Icon name="info" size={18} />{err}</div>}
      <label className="field"><span>New password (6+ characters)</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <button className="btn primary block" disabled={busy || pw.length < 6} onClick={async () => { setBusy(true); setErr(null); try { await auth.updatePassword(ctx.cfg, pw); ctx.toast('Password updated'); location.hash = '/home'; location.reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Save password'}</button>
    </div></div>
  );
}
