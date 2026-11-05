/* ============================================================================
   モラエッグ参加登録 — 仕様書 4.1.

   「社員は、参加登録が済むまで参加登録の画面だけを見る」. So this is a gate,
   not a tab: until somebody has registered there is nothing else on the
   site for them, and the four tabs do not exist yet.

   Three steps, in the order she set them: 受け取りの条件 → 受取場所 →
   お知らせの送り先. They are three screens rather than one long form
   because the first is a thing to read and agree to, and a wall of terms
   above the fields people came to fill in gets scrolled past.

   All three are saved in one request. Half a registration — an office
   with no agreement, or the other way round — is a state no screen here
   knows how to show, so the server takes all three or none.
   ========================================================================= */

import React, { useState } from 'react';
import { mg, officeList } from './moraegg-text.js';
import { HQ_OFFICE } from './egg.js';

const TERMS = ['t1', 't2', 't3', 't4'];

export default function EggSignup({ lang, user, dates, onDone, api, img, offices: rows = [] }) {
  const t = (k, vars) => mg(k, lang, vars);
  const [step, setStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [office, setOffice] = useState('');
  const [priv, setPriv] = useState('');
  const [notifyPriv, setNotifyPriv] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);     /* 'joined' | 'notNow' */

  /* 仕様書 4.1:「事業所名の下に、所在地を小さく表示する」. The name comes
     from her dictionary and the address from 事業所の設定, so an office
     whose address nobody has filled in yet simply shows no second line —
     never the word "undefined", and never a placeholder that reads like
     an address. */
  const where = new Map((rows || []).map((o) => [o.name, o.address || '']));
  const offices = officeList(lang);
  const workMail = user?.email || '';

  const save = async () => {
    setBusy(true); setErr('');
    const r = await api('/signup', 'POST', {
      agree: agreed, office, privateMail: priv.trim() || null, notifyPriv,
    });
    setBusy(false);
    if (r?.error) {
      setErr(t(r.error === 'bad_mail' ? 'mailErr'
        : r.error === 'bad_office' ? 'locErr' : 'agreeErr'));
      return;
    }
    setDone('joined');
    onDone?.(r.signup);
  };

  /* ---- after ---------------------------------------------------------- */
  if (done === 'joined') {
    return (
      <div className="mg-reg mg-reg-done">
        <img src={img('hug')} alt="" />
        <h2>{t('doneTitle')}</h2>
        <p>{t('doneText')}</p>
        <button className="btn primary" onClick={() => onDone?.(null, true)}>{t('toHome')}</button>
      </div>
    );
  }
  if (done === 'notNow') {
    /* 「『今は参加しない』を選んだ人は、あとからいつでも登録できる」 — so
       this is a message, not a record. Nothing is stored, and the way
       back is on the same screen. */
    return (
      <div className="mg-reg mg-reg-done">
        <img src={img('empty')} alt="" />
        <h2>{t('notNowTitle')}</h2>
        <p>{t('notNowText')}</p>
        <button className="btn primary" onClick={() => { setDone(null); setStep(1); }}>
          {t('regAgain')}
        </button>
      </div>
    );
  }

  /* ---- the three steps ------------------------------------------------ */
  return (
    <div className="mg-reg">
      <header className="mg-reg-top">
        <h2>{t('regTitle')}</h2>
        <p>{t('regLead')}</p>
        {dates?.locDeadline && <p className="mg-reg-by">{t('regDeadline')}</p>}
      </header>

      {/* Which of the three you are on. Numbered, because she numbered
          them and because "2 of 3" is the only thing that makes a gate
          feel finite. */}
      <ol className="mg-steps3">
        {['st1', 'st2', 'st3'].map((k, i) => (
          <li key={k} className={step === i + 1 ? 'on' : step > i + 1 ? 'did' : ''}>
            <b>{i + 1}</b><span>{t(k)}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="card mg-reg-card">
          <p className="mg-reg-lead">{t('termsLead')}</p>
          <ul className="mg-terms">
            {TERMS.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <label className="check mg-tick">
            <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErr(''); }} />
            <span>{t('agree')}</span>
          </label>
          {err && <p className="eg-warn sm">{err}</p>}
          <div className="mg-reg-go">
            <button
              className="btn primary" disabled={!agreed}
              onClick={() => (agreed ? setStep(2) : setErr(t('agreeErr')))}
            >{t('next')}</button>
            <button className="btn ghost" onClick={() => setDone('notNow')}>{t('notNow')}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card mg-reg-card">
          <h3 className="eg-q">{t('locTitle')}</h3>
          <p className="mg-reg-lead">{t('locLead')}</p>
          <div className="eg-opts mg-reg-offs">
            {offices.map((o) => (
              <button
                key={o.id} type="button"
                className={`eg-opt${office === o.name ? ' on' : ''}`}
                onClick={() => { setOffice(o.name); setErr(''); }}
              >
                {o.label}
                {where.get(o.name) && <small className="eg-opt-loc">{where.get(o.name)}</small>}
              </button>
            ))}
          </div>
          {err && <p className="eg-warn sm">{err}</p>}
          <div className="mg-reg-go">
            <button className="btn ghost" onClick={() => setStep(1)}>{t('backStep')}</button>
            <button
              className="btn primary" disabled={!office}
              onClick={() => (office ? setStep(3) : setErr(t('locErr')))}
            >{t('next')}</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card mg-reg-card">
          <h3 className="eg-q">{t('mailTitle')}</h3>
          <p className="mg-reg-lead">{t('mailLead')}</p>

          {/* 「会社のメールアドレスは変更できない」. Shown from the record and
              never sent back — the server reads it from the employee row,
              so there is nothing here for a browser to change. */}
          <div className="kv mg-reg-mail">
            <span>{t('workMail')}</span><strong>{workMail || '—'}</strong>
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

          {err && <p className="eg-warn sm">{err}</p>}
          <p className="muted sm">{t('regLater')}</p>
          <div className="mg-reg-go">
            <button className="btn ghost" onClick={() => setStep(2)}>{t('backStep')}</button>
            <button className="btn primary" disabled={busy} onClick={save}>{t('doReg')}</button>
          </div>
        </section>
      )}
    </div>
  );
}

export { HQ_OFFICE };
