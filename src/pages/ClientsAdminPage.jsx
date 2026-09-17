import { useState, useEffect } from 'react';
import { Users, Plus, X, Clock, KeyRound, Check } from 'lucide-react';
import { useClientAdmin, useDeliverySettings } from '../hooks/useClientAdmin';

const DAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
];

const input =
  'w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 ' +
  'placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Banner({ tone, children }) {
  const tones = {
    ok:   'bg-emerald-50 border-emerald-100 text-emerald-700',
    err:  'bg-red-50 border-red-100 text-red-600',
    info: 'bg-blue-50 border-blue-100 text-blue-700',
  };
  return <div className={`px-3 py-2 rounded-lg border text-xs font-medium ${tones[tone]}`}>{children}</div>;
}

/* ── Cut-off editor ──────────────────────────────────────────── */
function CutoffPanel() {
  const { global, loading, save } = useDeliverySettings();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (global && !draft) {
      setDraft({
        cutoffTime: String(global.cutoff_time).slice(0, 5),
        timezone: global.timezone,
        leadDays: global.lead_days,
        workingDays: global.working_days || [1, 2, 3, 4, 5],
      });
    }
  }, [global, draft]);

  if (loading || !draft) {
    return <div className="text-xs text-slate-400">Loading cut-off settings…</div>;
  }

  async function submit() {
    setSaving(true); setMsg(null);
    const res = await save({ clientId: null, ...draft, cutoffTime: `${draft.cutoffTime}:00` });
    setSaving(false);
    setMsg(res.ok ? { tone: 'ok', text: 'Cut-off updated.' } : { tone: 'err', text: res.error });
  }

  const toggleDay = (n) =>
    setDraft((d) => ({
      ...d,
      workingDays: d.workingDays.includes(n)
        ? d.workingDays.filter((x) => x !== n)
        : [...d.workingDays, n].sort(),
    }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={14} className="text-slate-400" />
        <h2 className="text-sm font-bold text-slate-800">Delivery cut-off</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Orders placed before the cut-off make the next available slot. After it, they
        move to the following business day.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Field label="Cut-off time">
          <input
            type="time"
            className={input}
            value={draft.cutoffTime}
            onChange={(e) => setDraft((d) => ({ ...d, cutoffTime: e.target.value }))}
          />
        </Field>
        <Field label="Timezone">
          <input
            className={input}
            value={draft.timezone}
            onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
          />
        </Field>
        <Field label="Lead days" hint="Business days on top of the cut-off. 0 = next slot.">
          <input
            type="number"
            min="0"
            className={input}
            value={draft.leadDays}
            onChange={(e) => setDraft((d) => ({ ...d, leadDays: parseInt(e.target.value) || 0 }))}
          />
        </Field>
      </div>

      <Field label="Operating days">
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map(({ n, label }) => {
            const on = draft.workingDays.includes(n);
            return (
              <button
                key={n}
                onClick={() => toggleDay(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                  on ? 'bg-[#0f1f5c] text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={submit}
          disabled={saving || draft.workingDays.length === 0}
          className="px-4 h-9 rounded-lg bg-[#0f1f5c] text-white text-xs font-bold hover:bg-[#16297a] disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save cut-off'}
        </button>
        {draft.workingDays.length === 0 && (
          <span className="text-[11px] text-red-600 font-semibold">Pick at least one operating day.</span>
        )}
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      </div>
    </div>
  );
}

/* ── Portal logins for one client ────────────────────────────── */
function UsersPanel({ client, listUsers, createUser, setUserActive }) {
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reload = async () => setUsers(await listUsers(client.id));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [client.id]);

  async function submit() {
    if (!form.email.trim() || form.password.length < 8) {
      setMsg({ tone: 'err', text: 'Email and a password of at least 8 characters are required.' });
      return;
    }
    setBusy(true); setMsg(null);
    const res = await createUser(client.id, form.email, form.password, form.fullName);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setMsg({
      tone: 'ok',
      text: res.existed
        ? `Existing account ${form.email} linked to ${client.name}.`
        : `${form.email} can now sign in at /portal.`,
    });
    setForm({ email: '', password: '', fullName: '' });
    setAdding(false);
    reload();
  }

  async function toggle(u) {
    await setUserActive(u.user_id, !u.active);
    reload();
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Portal logins</span>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setMsg(null); }}
            className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            <Plus size={11} strokeWidth={3} /> Add login
          </button>
        )}
      </div>

      {users === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : users.length === 0 && !adding ? (
        <p className="text-xs text-slate-400">No portal logins yet.</p>
      ) : (
        <div className="space-y-1">
          {users?.map((u) => (
            <div key={u.user_id} className="flex items-center justify-between gap-2 text-xs py-1">
              <div className="min-w-0">
                <span className={`font-semibold ${u.active ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                  {u.email}
                </span>
                {u.full_name && <span className="text-slate-400 ml-2">{u.full_name}</span>}
                {!u.confirmed && (
                  <span className="ml-2 text-[10px] text-amber-600 font-semibold">unconfirmed</span>
                )}
                <div className="text-[10px] text-slate-400">
                  {u.last_sign_in
                    ? `Last signed in ${new Date(u.last_sign_in).toLocaleDateString('en-SG')}`
                    : 'Never signed in'}
                </div>
              </div>
              <button
                onClick={() => toggle(u)}
                className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer shrink-0 ${
                  u.active
                    ? 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600'
                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                }`}
              >
                {u.active ? 'Revoke' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <input className={input} placeholder="email@client.com" value={form.email}
                   onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <input className={input} placeholder="Full name" value={form.fullName}
                   onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            <input className={input} type="text" placeholder="Temporary password" value={form.password}
                   onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <p className="text-[10px] text-slate-400">
            Share the password with them directly — they can change it via "Forgot your password"
            on the portal login screen.
          </p>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              <KeyRound size={11} />
              {busy ? 'Creating…' : 'Create login'}
            </button>
            <button
              onClick={() => { setAdding(false); setMsg(null); }}
              className="px-3 h-8 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <div className="mt-2"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function ClientsAdminPage() {
  const {
    clients, loading, error, saveClient, setClientActive,
    listUsers, createUser, setUserActive,
  } = useClientAdmin();

  const [editing, setEditing] = useState(null);  // client object or 'new'
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  function startNew() {
    setEditing('new');
    setForm({ code: '', name: '', contactName: '', contactEmail: '', contactPhone: '', address: '' });
    setMsg(null);
  }

  function startEdit(c) {
    setEditing(c.id);
    setForm({
      id: c.id, code: c.code, name: c.name, contactName: c.contact_name || '',
      contactEmail: c.contact_email || '', contactPhone: c.contact_phone || '',
      address: c.address || '', legacyName: c.legacy_company_name || '',
    });
    setMsg(null);
  }

  async function submit() {
    setSaving(true); setMsg(null);
    const res = await saveClient(form);
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setEditing(null);
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-slate-800">Clients</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Client accounts, portal logins and delivery rules.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0f1f5c] text-white text-xs font-bold hover:bg-[#16297a] cursor-pointer"
        >
          <Plus size={13} strokeWidth={3} /> New client
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 bg-slate-50 space-y-4">
        <CutoffPanel />

        {error && <Banner tone="err">{error}</Banner>}

        {editing === 'new' && (
          <div className="bg-white rounded-xl border-2 border-blue-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">New client</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Code" hint="Short handle, e.g. OKI.">
                <input className={input} value={form.code} onChange={set('code')} placeholder="OKI" />
              </Field>
              <Field label="Company name">
                <input className={input} value={form.name} onChange={set('name')} placeholder="Oki Ara Pte Ltd" />
              </Field>
              <Field label="Contact name">
                <input className={input} value={form.contactName} onChange={set('contactName')} />
              </Field>
              <Field label="Contact email">
                <input className={input} value={form.contactEmail} onChange={set('contactEmail')} />
              </Field>
              <Field label="Contact phone">
                <input className={input} value={form.contactPhone} onChange={set('contactPhone')} />
              </Field>
              <Field label="Address">
                <input className={input} value={form.address} onChange={set('address')} />
              </Field>
            </div>
            {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
            <button
              onClick={submit}
              disabled={saving}
              className="mt-4 px-4 h-9 rounded-lg bg-[#0f1f5c] text-white text-xs font-bold hover:bg-[#16297a] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Create client'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-semibold">No clients yet</p>
            <p className="text-xs text-slate-400 mt-1">Create one to give a customer portal access.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {clients.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                {editing === c.id ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Code"><input className={input} value={form.code} onChange={set('code')} /></Field>
                      <Field label="Company name"><input className={input} value={form.name} onChange={set('name')} /></Field>
                      <Field label="Contact name"><input className={input} value={form.contactName} onChange={set('contactName')} /></Field>
                      <Field label="Contact email"><input className={input} value={form.contactEmail} onChange={set('contactEmail')} /></Field>
                      <Field label="Contact phone"><input className={input} value={form.contactPhone} onChange={set('contactPhone')} /></Field>
                      <Field label="Legacy company name" hint="Matches historic movements to this client.">
                        <input className={input} value={form.legacyName} onChange={set('legacyName')} />
                      </Field>
                    </div>
                    {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={submit} disabled={saving}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#0f1f5c] text-white text-xs font-bold hover:bg-[#16297a] disabled:opacity-60 cursor-pointer">
                        <Check size={12} strokeWidth={3} />{saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="px-3 h-8 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {c.code}
                          </span>
                          <span className={`font-bold text-sm ${c.active ? 'text-slate-800' : 'text-slate-400'}`}>
                            {c.name}
                          </span>
                          {!c.active && (
                            <span className="text-[10px] font-bold text-slate-400 uppercase">inactive</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(' · ') || 'No contact details'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200 cursor-pointer">
                          Logins
                        </button>
                        <button onClick={() => startEdit(c)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200 cursor-pointer">
                          Edit
                        </button>
                        <button onClick={() => setClientActive(c.id, !c.active)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-semibold hover:bg-slate-200 cursor-pointer">
                          {c.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>

                    {expanded === c.id && (
                      <UsersPanel
                        client={c}
                        listUsers={listUsers}
                        createUser={createUser}
                        setUserActive={setUserActive}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
