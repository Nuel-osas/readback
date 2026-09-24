/** Say something, and resolve when it has finished being said. */
let current;
export async function speak(text) {
  current?.pause();
  try {
    const r = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r.status === 200) {
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      current = a;
      await new Promise((res) => { a.onended = res; a.onerror = res; a.play().catch(res); });
      URL.revokeObjectURL(url);
      return;
    }
  } catch {}
  if (typeof speechSynthesis === 'undefined') return;
  await new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.onend = res; u.onerror = res;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
export const hush = () => { current?.pause(); if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); };
