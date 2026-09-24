// Microphone to 24 kHz mono PCM16 in 100 ms frames, the Voice Agent API's input format.
// Resampled here because not every browser will attach a mic to a 24 kHz AudioContext.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 24000;
    this.pos = 0;
    this.buf = new Int16Array(2400);
    this.n = 0;
    this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (; this.pos < ch.length; this.pos += this.ratio) {
      const s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]));
      this.peak = Math.max(this.peak, Math.abs(s));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer.slice(0), level: this.peak });
        this.n = 0; this.peak = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('pcm-worklet', PcmWorklet);
