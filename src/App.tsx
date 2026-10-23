import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { Activity, ArrowDownLeft, ArrowRight, Check, ChevronRight, CircleHelp, Crosshair, LockKeyhole, LogOut, Radar, ScanLine, Shield, Signal, Trophy, UserRound, Users, Wifi, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import type { EventSettings, Team } from './lib/supabase';

type Page = 'home' | 'login' | 'register' | 'admin' | 'bootstrap' | 'scanner';
type Notice = { kind: 'good' | 'bad'; text: string } | null;
type AdminTeam = { team_id: string; team_name: string; total_points: number; status: string };
type Scanner = { id?: string; slug: string; name: string; description: string; type: string; points: number; destination_url: string; destination_type: string; active: boolean };
type ScanActivity = { id: string; result: string; points_delta: number; created_at: string; teams: { team_name: string } | null; scanners: { name: string; slug: string } | null };

const DEMO_SETTINGS: EventSettings = { event_name: 'ORBITAL BREACH', announcement: 'The perimeter is unstable. Scan signals in the field to uncover the breach.', registration_open: true };

export default function App() {
  const [page, setPage] = useState<Page>(window.location.pathname.startsWith('/scan/') ? 'scanner' : window.location.pathname === '/admin/bootstrap' ? 'bootstrap' : 'home');
  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [settings, setSettings] = useState<EventSettings>(DEMO_SETTINGS);
  const [notice, setNotice] = useState<Notice>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadIdentity = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next || !supabase) { setTeam(null); setIsAdmin(false); return; }
    if (next.user.user_metadata?.registration_requested === true) {
      const { error: registrationError } = await supabase.rpc('complete_team_registration');
      if (registrationError) { setNotice({ kind: 'bad', text: registrationError.message }); }
    }
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('teams').select('id,team_name,participant1_name,participant1_email,participant2_name,participant2_email,status').maybeSingle(),
      supabase.from('admins').select('id').maybeSingle(),
    ]);
    setTeam(t as Team | null); setIsAdmin(Boolean(a));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => loadIdentity(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { void loadIdentity(next); });
    void supabase.from('event_settings').select('event_name,announcement,registration_open').eq('id', 1).maybeSingle().then(({ data }) => { if (data) setSettings(data as EventSettings); });
    return () => listener.subscription.unsubscribe();
  }, [loadIdentity]);

  useEffect(() => {
    const route = () => setPage(window.location.pathname.startsWith('/scan/') ? 'scanner' : window.location.pathname === '/admin/bootstrap' ? 'bootstrap' : 'home');
    window.addEventListener('popstate', route); return () => window.removeEventListener('popstate', route);
  }, []);

  useEffect(() => {
    const login = () => go('login'); const register = () => go('register');
    window.addEventListener('navigate-login', login); window.addEventListener('navigate-register', register);
    return () => { window.removeEventListener('navigate-login', login); window.removeEventListener('navigate-register', register); };
  });

  const go = (next: Page, path?: string) => { setPage(next); setNotice(null); if (path) { window.history.pushState({}, '', path); } else if (next !== 'scanner' && next !== 'bootstrap' && !(next === 'login' && window.location.pathname.startsWith('/scan/'))) { window.history.pushState({}, '', '/'); } };
  const signOut = async () => { await supabase?.auth.signOut(); setTeam(null); setIsAdmin(false); go('home'); };
  const flash = useCallback((n: Notice) => { setNotice(n); window.setTimeout(() => setNotice(null), 5000); }, []);

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><button className="brand" onClick={() => go('home')}><span className="brand-mark"><Crosshair size={20}/></span><span>ORBITAL <b>BREACH</b><small>FIELD OPERATIONS // 2049</small></span></button><div className="top-status"><span className="live-dot"/> MISSION SYSTEMS ONLINE <span className="status-divider"/> <span className="mono">OB—01</span></div><div className="top-actions">{session ? <><span className="operator"><span className="operator-avatar"><UserRound size={15}/></span>{team?.team_name ?? session.user.email}</span>{isAdmin && <button className="quiet-button" onClick={() => go('admin')}>ADMIN</button>}<button className="icon-button" title="Sign out" onClick={() => void signOut()}><LogOut size={16}/></button></> : <button className="outline-button" onClick={() => go('login')}>SIGN IN <ArrowRight size={14}/></button>}</div></header>
    {!configured && <div className="setup-banner"><Signal size={15}/> DEMO PREVIEW <span>Connect Supabase credentials to enable real accounts, scanning, and secure scoring.</span></div>}
    {notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === 'good' ? <Check size={16}/> : <CircleHelp size={16}/>}</span>{notice.text}<button onClick={() => setNotice(null)}><X size={14}/></button></div>}
    <main>{page === 'login' && <AuthCard mode="login" onBack={() => go('home')} flash={flash} onDone={() => { const scanPath = window.location.pathname.match(/^\/scan\/[A-Za-z0-9-]+\/?$/)?.[0]; if (scanPath) go('scanner', scanPath); else go('home'); }}/>}
      {page === 'register' && <AuthCard mode="register" onBack={() => go('home')} flash={flash} onDone={() => { const scanPath = window.location.pathname.match(/^\/scan\/[A-Za-z0-9-]+\/?$/)?.[0]; if (scanPath) go('scanner', scanPath); else go('home'); }} />}
      {page === 'bootstrap' && <BootstrapCard flash={flash} onDone={() => go('home')}/>}
      {page === 'scanner' && <ScannerPage session={session} flash={flash} onBack={() => go('home')} onSignIn={() => go('login')}/>}
      {page === 'admin' && isAdmin ? <AdminPanel flash={flash}/> : page === 'admin' ? <AuthCard mode="login" onBack={() => go('home')} flash={flash} onDone={() => go('home')}/> : null}
      {page === 'home' && <Home session={session} team={team} settings={settings} isAdmin={isAdmin} go={go} flash={flash}/>}
    </main>
    <footer className="footer"><div><span className="live-dot"/> ALL SYSTEMS NOMINAL</div><span>ORBITAL BREACH <span className="footer-sep">/</span> FIELD INTELLIGENCE UNIT</span><span className="mono">ENCRYPTION: ACTIVE</span></footer>
  </div>;
}

function Home({ session, team, settings, isAdmin, go, flash }: { session: Session | null; team: Team | null; settings: EventSettings; isAdmin: boolean; go: (p: Page, path?: string) => void; flash: (n: Notice) => void }) {
  const [activity, setActivity] = useState<{ created_at: string; label: string }[]>([]);
  useEffect(() => { if (!supabase || !session) return; void supabase.rpc('get_my_activity').then(({ data }) => { setActivity((data ?? []) as typeof activity); }); }, [session]);
  return <>
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> LIVE EVENT <span className="eyebrow-pill">SECTOR 07 // EARTH</span></div><h1>THE SIGNAL<br/><span>IS BREACHED.</span></h1><p className="hero-sub">{settings.announcement ?? 'A signal has crossed the perimeter. Your crew is the only thing standing between order and the unknown.'}</p><div className="hero-buttons">{team ? <button className="primary-button" onClick={() => go('scanner', '/scan')}>OPEN FIELD SCANNER <ScanLine size={17}/></button> : <button className="primary-button" onClick={() => go('register')}>ASSEMBLE YOUR CREW <ArrowRight size={16}/></button>}<button className="text-button" onClick={() => team ? document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' }) : go('login')}>{team ? 'MISSION DASHBOARD' : 'EXISTING CREW SIGN IN'} <ChevronRight size={14}/></button></div><div className="hero-proof"><div className="proof-icon"><Shield size={16}/></div><div><b>YOUR SCORE IS CLASSIFIED</b><span>Only mission control can access team standings.</span></div></div></div>
      <div className="hero-art"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="planet"><div className="planet-shade"/><div className="planet-ring"/></div><div className="radar-ring radar-a"/><div className="radar-ring radar-b"/><div className="radar-ring radar-c"/><div className="radar-core"><Radar size={22}/></div><div className="signal-label label-a"><span className="live-dot"/> SIGNAL DETECTED<small>23.07° N / 72.58° E</small></div><div className="signal-label label-b"><span className="signal-bar"/> UNKNOWN SOURCE<small>RANGE: 1.4 KM</small></div><div className="crosshair-dot"/></div></section>
    <section className="signal-strip"><div><Activity size={15}/><span>FIELD STATUS</span><b>ACTIVE</b></div><div><Wifi size={15}/><span>SCANNER NETWORK</span><b>CONNECTED</b></div><div><Users size={15}/><span>CREW SLOTS</span><b>02 OPERATORS</b></div><div><LockKeyhole size={15}/><span>SCORING</span><b>CLASSIFIED</b></div></section>
    {session && <section className="dashboard" id="dashboard"><div className="section-heading"><div><span className="eyebrow-line"/> YOUR MISSION</div><span className="muted-code">PERSONNEL FILE // {team?.id.slice(0, 8).toUpperCase() ?? 'PENDING'}</span></div><div className="dashboard-grid"><div className="panel crew-panel"><div className="panel-label">REGISTERED CREW <Users size={15}/></div><h2>{team?.team_name ?? 'Account linked'}</h2><div className="crew-member"><span className="member-index">01</span><div><b>{team?.participant1_name ?? session.user.email}</b><small>OPERATOR ALPHA · {team?.participant1_email ?? ''}</small></div><Check className="member-check" size={16}/></div><div className="crew-member"><span className="member-index">02</span><div><b>{team?.participant2_name ?? 'Awaiting crew profile'}</b><small>OPERATOR BETA · {team?.participant2_email ?? ''}</small></div><Check className="member-check" size={16}/></div></div><div className="panel score-panel"><div className="panel-label">MISSION SCORE <LockKeyhole size={14}/></div><div className="classified">██████ <span>PTS</span></div><div className="classified-note"><span className="live-dot"/> CLASSIFIED — SCORE HIDDEN</div><div className="score-rule">Your score is recorded securely and revealed at mission close.</div></div><div className="panel activity-panel"><div className="panel-label">FIELD ACTIVITY <Activity size={15}/></div>{activity.length ? activity.slice(0, 4).map((a, i) => <div className="activity-row" key={i}><span className="activity-icon"><Signal size={13}/></span><span>{a.label}</span><time>{new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>) : <p className="empty-activity">No signal interactions yet. The field is yours to explore.</p>}<button className="text-button small" onClick={() => go('scanner', '/scan')}>LAUNCH SCANNER <ArrowRight size={13}/></button></div></div></section>}
    <section className="protocol"><div className="section-heading"><div><span className="eyebrow-line"/> MISSION PROTOCOL</div><span className="muted-code">3 STEPS TO BREACH</span></div><div className="protocol-grid"><div className="protocol-card"><span className="protocol-num">01</span><div className="protocol-icon"><Users size={19}/></div><h3>FORM YOUR CREW</h3><p>Register two operators under one crew file. Both college emails must be unique.</p></div><div className="protocol-card"><span className="protocol-num">02</span><div className="protocol-icon"><ScanLine size={19}/></div><h3>TRACE THE SIGNAL</h3><p>Use the in-app scanner to inspect QR signals scattered across the field.</p></div><div className="protocol-card"><span className="protocol-num">03</span><div className="protocol-icon"><Trophy size={19}/></div><h3>SECURE THE BREACH</h3><p>Rewards and traps are hidden. Every signal can only be claimed once per crew.</p></div></div></section>
    <section className="bottom-callout"><div className="callout-icon"><Radar size={22}/></div><div><b>{settings.event_name}</b><span>THE PERIMETER WON'T HOLD FOREVER.</span></div>{team ? <button className="outline-button" onClick={() => isAdmin ? go('admin') : go('scanner', '/scan')}>{isAdmin ? 'OPEN CONTROL' : 'ENTER THE FIELD'} <ArrowRight size={14}/></button> : <button className="outline-button" onClick={() => settings.registration_open ? go('register') : flash({ kind: 'bad', text: 'Crew registration is currently closed.' })}>{settings.registration_open ? 'REGISTER CREW' : 'REGISTRATION CLOSED'} <ArrowRight size={14}/></button>}</section>
  </>;
}

function AuthCard({ mode, onBack, flash, onDone }: { mode: 'login' | 'register'; onBack: () => void; flash: (n: Notice) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget); setBusy(true);
    try {
      if (!supabase) throw new Error('Connect your Supabase project first using the setup steps in README.md.');
      if (mode === 'login') {
        const { data, error } = await supabase.functions.invoke('team-login', { body: { email: String(fd.get('email')).trim().toLowerCase(), password: String(fd.get('password')) } });
        if (error || !data?.access_token || !data?.refresh_token) throw new Error('Invalid crew email or password.');
        const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token }); if (sessionError) throw new Error('Unable to start the crew session.');
      } else {
        const password = String(fd.get('password')); if (password !== fd.get('confirm')) throw new Error('The passwords do not match.');
        const payload = { team_name: String(fd.get('team_name')).trim(), participant1_name: String(fd.get('name1')).trim(), participant2_name: String(fd.get('name2')).trim(), participant2_email: String(fd.get('email2')).trim().toLowerCase(), registration_requested: true };
        const { data, error } = await supabase.auth.signUp({ email: String(fd.get('email1')).trim().toLowerCase(), password, options: { data: payload, emailRedirectTo: window.location.origin } }); if (error) throw error;
        if (!data.session) { flash({ kind: 'good', text: 'Verify the primary operator email. Your crew profile will activate after confirmation.' }); onDone(); return; }
        const { error: profileError } = await supabase.rpc('complete_team_registration'); if (profileError) throw profileError;
      }
      flash({ kind: 'good', text: mode === 'login' ? 'Authentication confirmed. Welcome back, operator.' : 'Crew registered. Your mission profile is active.' }); onDone();
    } catch (err) { flash({ kind: 'bad', text: err instanceof Error ? err.message : 'Unable to complete request.' }); } finally { setBusy(false); }
  };
  return <div className="form-wrap"><button className="back-link" onClick={onBack}><ArrowDownLeft size={15}/> BACK TO COMMAND</button><div className="form-card"><div className="form-symbol"><Crosshair size={24}/></div><div className="eyebrow"><span className="eyebrow-line"/> PERSONNEL ACCESS</div><h2>{mode === 'login' ? 'OPERATOR SIGN IN' : 'ASSEMBLE YOUR CREW'}</h2><p className="form-intro">{mode === 'login' ? 'Enter your primary operator credentials to access the mission dashboard.' : 'Register both operators under a single secure crew profile.'}</p><form onSubmit={submit}>
    {mode === 'register' ? <><Field label="CREW NAME" name="team_name" placeholder="e.g. Event Horizon" required maxLength={48}/><div className="form-divider"><span>OPERATOR ALPHA</span></div><div className="two-col"><Field label="FULL NAME" name="name1" placeholder="Operator name" required maxLength={80}/><Field label="COLLEGE EMAIL" name="email1" type="email" placeholder="operator@college.edu" required maxLength={254}/></div><div className="form-divider"><span>OPERATOR BETA</span></div><div className="two-col"><Field label="FULL NAME" name="name2" placeholder="Operator name" required maxLength={80}/><Field label="COLLEGE EMAIL" name="email2" type="email" placeholder="operator@college.edu" required maxLength={254}/></div></> : <Field label="CREW EMAIL (EITHER OPERATOR)" name="email" type="email" placeholder="operator@college.edu" required/>}
    <Field label="CREW PASSWORD" name="password" type="password" placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} required minLength={mode === 'register' ? 10 : 1}/>{mode === 'register' && <Field label="CONFIRM PASSWORD" name="confirm" type="password" placeholder="Re-enter your password" required minLength={10}/>}<button className="primary-button submit-button" disabled={busy}>{busy ? 'CONNECTING…' : mode === 'login' ? 'AUTHENTICATE' : 'CREATE CREW PROFILE'} <ArrowRight size={16}/></button></form><div className="form-switch">{mode === 'login' ? <>NEW TO THE FIELD? <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-register'))}>REGISTER CREW</button></> : <>ALREADY REGISTERED? <button onClick={() => window.dispatchEvent(new CustomEvent('navigate-login'))}>SIGN IN</button></>}</div><div className="form-security"><LockKeyhole size={13}/> ENCRYPTED CONNECTION · SCORE DATA CLASSIFIED</div></div></div>;
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) { return <label className="field"><span>{label}</span><input {...props}/></label>; }

function BootstrapCard({ flash, onDone }: { flash: (n: Notice) => void; onDone: () => void }) {
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!supabase) return flash({ kind: 'bad', text: 'Connect Supabase first.' }); const fd = new FormData(e.currentTarget); const { error } = await supabase.functions.invoke('bootstrap-admin', { body: { email: fd.get('email'), password: fd.get('password'), setup_code: fd.get('setup_code') } }); if (error) flash({ kind: 'bad', text: error.message }); else { flash({ kind: 'good', text: 'Administrator account created. Sign in to continue.' }); onDone(); } };
  return <div className="form-wrap"><div className="form-card"><div className="form-symbol"><Shield size={23}/></div><div className="eyebrow"><span className="eyebrow-line"/> ONE-TIME SETUP</div><h2>ADMIN BOOTSTRAP</h2><p className="form-intro">Create the first administrator using the server-side setup code. Disable the bootstrap function after setup.</p><form onSubmit={submit}><Field label="ADMIN EMAIL" name="email" type="email" required/><Field label="PASSWORD" name="password" type="password" minLength={12} required/><Field label="SETUP CODE" name="setup_code" type="password" required/><button className="primary-button submit-button">CREATE ADMIN <ArrowRight size={16}/></button></form></div></div>;
}

function ScannerPage({ session, flash, onBack, onSignIn }: { session: Session | null; flash: (n: Notice) => void; onBack: () => void; onSignIn: () => void }) {
  const [result, setResult] = useState<{ kind: 'claimed' | 'duplicate' | 'neutral' | 'penalty' | 'error'; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const handledSlug = useRef<string | null>(null);
  const slugFromPath = window.location.pathname.match(/^\/scan\/([A-Za-z0-9-]+)\/?$/)?.[1] ?? null;
  useEffect(() => {
    if (!session || !supabase || (slugFromPath && handledSlug.current === slugFromPath)) return;
    let stopped = false;
    const process = async (slug: string) => {
      if (!/^[A-Za-z0-9-]{2,64}$/.test(slug)) { setResult({ kind: 'error', text: 'SIGNAL NOT RECOGNIZED' }); return; }
      handledSlug.current = slug;
      setProcessing(true); setResult(null);
      try {
        const { data, error } = await supabase!.rpc('resolve_scan', { p_slug: slug });
        if (error) throw error;
        const message = String(data?.[0]?.message ?? 'SIGNAL RECORDED');
        const kind = message.startsWith('ALREADY CLAIMED') ? 'duplicate' : /^\d+ POINTS? CLAIMED/.test(message) ? 'claimed' : message.startsWith('PENALTY APPLIED') ? 'penalty' : 'neutral';
        if (!stopped) setResult({ kind, text: message });
      } catch (err) {
        handledSlug.current = null;
        if (!stopped) setResult({ kind: 'error', text: err instanceof Error ? err.message : 'Unable to process this signal.' });
      } finally { if (!stopped) setProcessing(false); }
    };
    if (slugFromPath) { void process(slugFromPath); return () => { stopped = true; }; }
    let instance: import('html5-qrcode').Html5QrcodeScanner | undefined;
    void import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (stopped) return;
      instance = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 }, false);
      instance.render(async (decoded) => {
        await instance?.clear();
        try {
          const url = new URL(decoded);
          if (url.origin !== window.location.origin || !/^\/scan\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) throw new Error('INVALID_SIGNAL');
          await process(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
        } catch { if (!stopped) setResult({ kind: 'error', text: 'THIS QR IS NOT AN ORBITAL BREACH SIGNAL' }); }
      }, () => {});
    });
    return () => { stopped = true; if (instance) void instance.clear().catch(() => {}); };
  }, [session, flash, slugFromPath]);
  return <div className="form-wrap scanner-wrap"><button className="back-link" onClick={onBack}><ArrowDownLeft size={15}/> RETURN TO ORBITAL BREACH</button><div className="scanner-panel"><div className="eyebrow"><span className="eyebrow-line"/> FIELD SCANNER // OB-01</div><h2>{result ? 'SIGNAL REPORT' : 'TRACE THE SIGNAL'}</h2><p className="form-intro">Each station records the crew and scan time. A station can award points only once to each crew.</p>{!session ? <div className="scanner-login"><LockKeyhole size={20}/><span>Sign in to claim this station.</span><button className="primary-button" onClick={onSignIn}>SIGN IN TO CONTINUE <ArrowRight size={15}/></button></div> : processing ? <div className="scanner-login"><span className="live-dot"/> VERIFYING YOUR CLAIM…</div> : !slugFromPath && !result ? <div id="qr-reader"/> : null}{result && <div className={`scan-result ${result.kind}`}><div className="scan-result-message"><Check size={19}/><strong>{result.text}</strong></div><p>{result.kind === 'claimed' ? 'Your claim is recorded. Your mission score stays classified.' : result.kind === 'duplicate' ? 'This crew already claimed this station. No additional point was added.' : result.kind === 'penalty' ? 'This signal has changed your classified mission score.' : result.kind === 'error' ? 'The signal could not be verified. Please ask mission control for help.' : 'This signal was recorded without adding a point.'}</p><button className="primary-button" onClick={onBack}>RETURN TO ORBITAL BREACH <ArrowRight size={15}/></button></div>}<div className="scanner-foot"><span className="live-dot"/> CLAIMS ARE VERIFIED SERVER-SIDE <span>·</span> CAMERA PERMISSION REQUIRED</div></div></div>;
}

function AdminPanel({ flash }: { flash: (n: Notice) => void }) {
  const [teams, setTeams] = useState<AdminTeam[]>([]); const [scanners, setScanners] = useState<Scanner[]>([]); const [activity, setActivity] = useState<ScanActivity[]>([]); const [settings, setSettings] = useState<EventSettings>(DEMO_SETTINGS); const [tab, setTab] = useState<'overview' | 'scanners' | 'event'>('overview'); const [draft, setDraft] = useState<Scanner>({ slug: '', name: '', description: '', type: 'reward', points: 1, destination_url: '/', destination_type: 'internal', active: true });
  const reload = useCallback(async () => { if (!supabase) return; const [{ data: leaderboard }, { data: scanRows }, { data: ev }, { data: scanActivity }] = await Promise.all([supabase.rpc('admin_get_leaderboard'), supabase.from('scanners').select('*').order('created_at', { ascending: false }), supabase.from('event_settings').select('event_name,announcement,registration_open').eq('id', 1).single(), supabase.from('scanner_interactions').select('id,result,points_delta,created_at,teams(team_name),scanners(name,slug)').order('created_at', { ascending: false }).limit(100)]); if (leaderboard) setTeams(leaderboard as AdminTeam[]); if (scanRows) setScanners(scanRows as Scanner[]); if (ev) setSettings(ev as EventSettings); if (scanActivity) setActivity(scanActivity as unknown as ScanActivity[]); }, []);
  useEffect(() => { void reload(); }, [reload]);
  const emptyDraft: Scanner = { slug: '', name: '', description: '', type: 'reward', points: 1, destination_url: '/', destination_type: 'internal', active: true };
  const copyQrLink = async (slug: string) => { const url = `${window.location.origin}/scan/${slug}`; try { await navigator.clipboard.writeText(url); flash({ kind: 'good', text: 'QR destination copied.' }); } catch { window.prompt('Copy this QR destination', url); } };
  const saveScanner = async (e: FormEvent) => { e.preventDefault(); if (!supabase) return; const destinationType = draft.destination_url.startsWith('https://') ? 'external' : 'internal'; const { error } = await supabase.rpc('admin_upsert_scanner', { p_id: draft.id ?? null, p_slug: draft.slug, p_name: draft.name, p_description: draft.description || null, p_type: draft.type, p_points: Number(draft.points), p_destination_url: draft.destination_url, p_destination_type: destinationType, p_active: draft.active }); if (error) flash({ kind: 'bad', text: error.message }); else { flash({ kind: 'good', text: 'Scanner configuration saved.' }); setDraft(emptyDraft); await reload(); } };
  const adjust = async (teamId: string) => { const delta = Number(window.prompt('Score adjustment (positive or negative number):')); if (!Number.isFinite(delta) || !supabase) return; const reason = window.prompt('Reason for adjustment:'); if (!reason) return; const { error } = await supabase.rpc('admin_adjust_points', { p_team_id: teamId, p_delta: Math.trunc(delta), p_reason: reason }); if (error) flash({ kind: 'bad', text: error.message }); else { flash({ kind: 'good', text: 'Adjustment recorded in the audit log.' }); await reload(); } };
  const saveEvent = async () => { if (!supabase) return; const { error } = await supabase.from('event_settings').update({ event_name: settings.event_name, announcement: settings.announcement, registration_open: settings.registration_open }).eq('id', 1); if (error) flash({ kind: 'bad', text: error.message }); else flash({ kind: 'good', text: 'Event settings updated.' }); };
  return <div className="admin-wrap"><div className="admin-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> COMMAND ACCESS // SECURE</div><h1>MISSION CONTROL</h1></div><span className="admin-badge"><Shield size={13}/> ADMINISTRATOR</span></div><div className="admin-tabs">{(['overview', 'scanners', 'event'] as const).map(t => <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}</div>
    {tab === 'overview' && <><div className="admin-stats"><div className="panel"><span>REGISTERED CREWS</span><b>{teams.length.toString().padStart(2, '0')}</b></div><div className="panel"><span>ACTIVE SIGNALS</span><b>{scanners.filter(s => s.active).length.toString().padStart(2, '0')}</b></div><div className="panel"><span>NETWORK STATUS</span><b className="admin-online"><span className="live-dot"/> LIVE</b></div></div><div className="panel admin-table-panel"><div className="panel-label">CLASSIFIED CREW ROSTER <LockKeyhole size={14}/></div><div className="table-scroll"><table><thead><tr><th>RANK</th><th>CREW</th><th>POINTS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{teams.map((t,i)=><tr key={t.team_id}><td className="mono">{String(i+1).padStart(2,'0')}</td><td>{t.team_name}</td><td className="score-value">{t.total_points}</td><td><span className={`status-tag ${t.status}`}>{t.status}</span></td><td><button className="table-action" onClick={() => void adjust(t.team_id)}>ADJUST SCORE</button></td></tr>)}</tbody></table>{!teams.length && <p className="empty-activity">No crews are registered yet.</p>}</div></div><div className="panel admin-table-panel"><div className="panel-label">RECENT FIELD SCANS <Activity size={14}/></div><div className="table-scroll"><table><thead><tr><th>TEAM</th><th>STATION</th><th>RESULT</th><th>POINTS</th><th>SERVER TIME</th></tr></thead><tbody>{activity.map(a=><tr key={a.id}><td>{a.teams?.team_name ?? 'Unknown team'}</td><td>{a.scanners?.name ?? a.scanners?.slug ?? 'Unknown station'}</td><td>{a.result.replaceAll('_', ' ').toUpperCase()}</td><td className="score-value">{a.points_delta > 0 ? `+${a.points_delta}` : a.points_delta}</td><td className="mono">{new Date(a.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!activity.length && <p className="empty-activity">No scans have been recorded yet.</p>}</div></div></>}
    {tab === 'scanners' && <div className="admin-columns"><div className="panel admin-table-panel"><div className="panel-label">DEPLOYED SIGNALS <ScanLine size={14}/></div><div className="table-scroll"><table><thead><tr><th>SLUG</th><th>TYPE</th><th>DELTA</th><th>STATE</th><th>ACTION</th></tr></thead><tbody>{scanners.map(s=><tr key={s.id}><td>{s.slug}</td><td>{s.type}</td><td>{s.type === 'penalty' ? `−${Math.abs(s.points)}` : s.type === 'reward' ? `+${s.points}` : '0'}</td><td>{s.active ? 'ACTIVE' : 'OFFLINE'}</td><td><button className="table-action" onClick={() => { setDraft(s); document.querySelector('.scanner-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>EDIT</button> <button className="table-action" onClick={() => void copyQrLink(s.slug)}>COPY QR LINK</button></td></tr>)}</tbody></table></div></div><form className="panel scanner-form" onSubmit={saveScanner}><div className="panel-label">{draft.id ? 'EDIT SIGNAL CONFIGURATION' : 'NEW SIGNAL CONFIGURATION'} <Crosshair size={14}/></div><Field label="SLUG (IN QR URL)" value={draft.slug} onChange={e => setDraft({...draft, slug: e.target.value})} required pattern="[A-Za-z0-9-]+" placeholder="sector-alpha"/><Field label="DISPLAY NAME" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} required placeholder="Signal Alpha"/><label className="field"><span>BEHAVIOR</span><select value={draft.type} onChange={e => setDraft({...draft, type: e.target.value})}><option value="reward">Reward</option><option value="penalty">Penalty</option><option value="clue">Clue — no score</option><option value="decoy">Decoy — no score</option><option value="neutral">Neutral — no score</option></select></label><Field label="POINT VALUE" type="number" min="0" max="1000" value={draft.points} onChange={e => setDraft({...draft, points: Number(e.target.value)})}/><Field label="DESTINATION URL" value={draft.destination_url} onChange={e => setDraft({...draft, destination_url: e.target.value})} required placeholder="/dashboard or https://…"/><label className="check-field"><input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft, active: e.target.checked})}/> SIGNAL ACTIVE</label><button className="primary-button submit-button">{draft.id ? 'UPDATE SIGNAL' : 'SAVE SIGNAL'} <Check size={15}/></button>{draft.id && <button type="button" className="text-button" onClick={() => setDraft(emptyDraft)}>CANCEL EDIT</button>}<p className="form-hint">Signals are single-use per crew. Points always follow the selected behavior.</p></form></div>}
    {tab === 'event' && <div className="panel event-settings"><div className="panel-label">EVENT CONFIGURATION <Activity size={14}/></div><Field label="EVENT NAME" value={settings.event_name} onChange={e => setSettings({...settings, event_name: e.target.value})}/><label className="field"><span>ANNOUNCEMENT</span><textarea rows={4} value={settings.announcement ?? ''} onChange={e => setSettings({...settings, announcement: e.target.value})}/></label><label className="check-field"><input type="checkbox" checked={settings.registration_open} onChange={e => setSettings({...settings, registration_open: e.target.checked})}/> REGISTRATION OPEN</label><button className="primary-button" onClick={() => void saveEvent()}>SAVE EVENT SETTINGS <Check size={15}/></button></div>}
  </div>;
}

