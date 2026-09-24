'use client';
import { useEffect, useState } from 'react';

/** Nav that turns solid once you leave the hero, and scroll reveals for .reveal blocks. */
export function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <nav className={`nav ${solid ? 'solid' : ''}`}>
      <div className="wrap nav__in">
        <a href="#top" className="logo"><Mark /> Readback</a>
        <div className="nav__links">
          <a href="#problem">Why</a><a href="#how">How it works</a><a href="#rules">Rules</a><a href="#measured">Measured</a>
          <a href="https://github.com/Nuel-osas/readback">GitHub</a>
        </div>
        <a href="/app" className="btn btn--launch">Launch dApp <span className="arrow">→</span></a>
      </div>
    </nav>
  );
}

export function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#12151a" stroke="rgba(255,255,255,.12)" />
      <path d="M5 12c4 0 6 4 11 4s7-4 11-4" stroke="#ffb547" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M5 20c4 0 6-4 11-4s7 4 11 4" stroke="#3ddc97" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Reveal() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
