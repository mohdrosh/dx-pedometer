/* ============================================================================
   マイ設定 — 仕様書 4.5.

   「参加登録と同じ項目（受取場所、お知らせの送り先）を変更できる。受け取りの
   条件は同意日を表示する」.

   The same three answers as the sign-up, afterwards. Two differences
   worth knowing:

   The terms are not re-agreed here — they show the date somebody agreed,
   because that is a record, not a setting. Changing it would mean asking
   again, which is a different screen and a different question.

   And there is deliberately no way to pause. 「参加を休む設定は設けない。
   休みたい週はリクエストしなければよい」 — a pause switch is a thing to
   remember to turn off, and the week you forget is the week you get no
   eggs and cannot see why.
   ========================================================================= */

import React, { useState } from 'react';
import { mg, officeList } from './moraegg-text.js';
import { TOKYO_OFFICE } from './egg.js';
import { apiRoot } from './storage';

const TERMS = ['t1', 't2', 't3', 't4'];

export default function EggSettings({ d, reload, lang, toast, img }) {
  const t = (k, vars) => mg(k, lang, vars);
  const s = d?.signup || null;
  const [office, setOffice] = useState(s?.office || '');
  const [priv, setPriv] = useState(s?.privateMail || '');
  const [notifyPriv, setNotifyPriv] = useState(!!s?.notifyPriv);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!s) return null;
  const offices = officeList(lang);
  const dirty = office !== s.office
    || (priv || '') !== (s.privateMail || '')
    || notifyPriv !== !!s.notifyPriv;

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${apiRoot()}/egg/signup`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ office, privateMail: priv.trim() || null, notifyPriv }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        setErr(t(j.error === 'bad_mail' ? 'mailErr' : 'locErr'));
        return;
      }
      toast?.(t('saved'));
      reload?.();
    } catch { setErr(t('mailErr')); } finally { setBusy(false); }
  };

  /* 辞書の agreed は「同意済み（2026年11月14日）」で、日付が文に入っている。
     Shown as written it would tell everybody they agreed on the launch
     day, which is only true for the people who did. Her wording is kept
     and the date inside it is swapped for the real one — 仕様書 6 says to
     check with her before changing any Japanese, and this changes none of
     it. Flagged to her: the key would be cleaner as 同意済み（{n}）. */
  const iso = d?.consentAt || s.joinedAt || null;
  const agreedLine = (() => {
    const base = t('agreed');
    if (!iso) return base;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return base;
    const real = lang === 'ja'
      ? `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`
      : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return base.replace(/\d{4}年\d{1,2}月\d{1,2}日/, real)
      .replace(/\d{1,2}\s+\w+\s+\d{4}/, real);
  })();

  return (
    <div className="mg-set">
      <div className="sechead"><span>{t('setTitle')}</span></div>

      <section className="card">
        <h3 className="eg-q">{t('locTitle')}</h3>
        <p className="muted sm">{t('locLead')}</p>
        {/* 「変更すると、次のリクエストから反映されます」 — a note about
            changing it, so it sits with the control rather than being
            used as the heading. */}
        <p className="muted sm">{t('locChange')}</p>
        {/* 「受取場所を変えたい人は、リクエストの前にマイ設定で変更する」 —
            so the deadline for changing it is said here, where it is
            changed, not only on the sign-up. */}
        {d?.dates?.locDeadline && <p className="mg-set-by">{t('regDeadline')}</p>}
        <div className="eg-opts mg-reg-offs">
          {offices.map((o) => (
            <button
              key={o.id} type="button"
              className={`eg-opt${office === o.name ? ' on' : ''}`}
              onClick={() => { setOffice(o.name); setErr(''); }}
            >
              {o.label}
              {o.name === TOKYO_OFFICE && <small>{t('tokyoNote')}</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="eg-q">{t('mailTitle')}</h3>
        <div className="kv mg-reg-mail">
          <span>{t('workMail')}</span><strong>{d?.me?.email || '—'}</strong>
        </div>
        <p className="muted sm">{t('mailFixed')}</p>
        <label className="fld"><span>{t('privMail')}</span>
          <input
            type="email" value={priv} placeholder={t('privPh')} maxLength={120}
            onChange={(e) => { setPriv(e.target.value); setErr(''); }}
          />
        </label>
        <label className="check mg-tick">
          <input
            type="checkbox" checked={notifyPriv} disabled={!priv.trim()}
            onChange={(e) => setNotifyPriv(e.target.checked)}
          />
          <span>{t('addPrivate')}</span>
        </label>
      </section>

      {/* 「受け取りの条件は同意日を表示する」 — a record of what happened,
          not a box to tick again. */}
      <section className="card">
        <h3 className="eg-q">{t('termsSet')}</h3>
        <p className="mg-set-agreed">{agreedLine}</p>
        <button className="btn sm" onClick={() => setShowTerms((v) => !v)}>
          {t(showTerms ? 'hideTerms' : 'showTerms')}
        </button>
        {showTerms && (
          <ul className="mg-terms mg-set-terms">
            {TERMS.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
        )}
      </section>

      {err && <p className="eg-warn sm">{err}</p>}
      <div className="mg-set-go">
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>
          {t('save')}
        </button>
      </div>
    </div>
  );
}
