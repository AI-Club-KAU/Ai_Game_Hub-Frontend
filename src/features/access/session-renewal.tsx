
"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { accessService } from "@/services";
import { platformSession } from "@/services/platform-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function SessionBoundary({children}:{children:React.ReactNode}) {
  const [required,setRequired]=useState(false);
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{const update=()=>setRequired(platformSession.needsRenewal()); const stop=platformSession.subscribe(update);update();return stop;},[]);
  useEffect(()=>{if(required) input.current?.focus();},[required]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try {const result=await accessService.verify(code);if(result.status==="verified"){setCode("");}else setError(result.message);}
    catch {setError("تعذّر تجديد الجلسة. حاول مجددًا؛ بيانات المحاولة محفوظة في الشاشة.");}
    finally{setBusy(false);}
  }
  return <><div inert={required} hidden={required}>{children}</div>{required && <main className="result-shell"><section className="result-card" role="dialog" aria-modal="true" aria-labelledby="renew-title"><h1 id="renew-title">انتهت جلسة البوث</h1><p>أعد الجهاز إلى عضو النادي لإدخال رمز الوصول. ستُستكمل العملية دون فقد سياق المحاولة.</p><form onSubmit={submit}><label htmlFor="renew-code">رمز الوصول</label><Input id="renew-code" ref={input} type="password" value={code} disabled={busy} onChange={event=>setCode(event.target.value)} autoComplete="off" required />{error && <p role="alert">{error}</p>}<Button disabled={busy} type="submit">{busy?"جارٍ التحقق…":"تجديد جلسة البوث"}</Button></form></section></main>}</>;
}
