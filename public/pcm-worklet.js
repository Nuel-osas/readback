// Microphone to 16 kHz mono PCM16, in 50 ms frames, which is what AssemblyAI's
// streaming endpoint expects. Resamples here rather than asking for a 16 kHz
// AudioContext, because not every browser will connect a mic to one.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.buf = new Int16Array(800);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    let level = 0;
    for (; this.pos < ch.length; this.pos += this.ratio) {
      const i = Math.floor(this.pos);
      const s = Math.max(-1, Math.min(1, ch[i]));
      level = Math.max(level, Math.abs(s));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer.slice(0), level });
        this.n = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('pcm-worklet', PcmWorklet);
