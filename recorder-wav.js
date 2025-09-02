// Minimal WAV encoder from Float32 samples (mono)
async function recordAndEncodeWav(stream, seconds=5){
  // The stream is now passed in, not created here.
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
  const source = ctx.createMediaStreamSource(stream);

  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

  const samples = [];
  processor.onaudioprocess = e => {
    const ch = e.inputBuffer.getChannelData(0);
    samples.push(new Float32Array(ch)); // copy
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  // Turn mic ON by enabling the tracks right before recording.
  stream.getTracks().forEach(track => track.enabled = true);

  try {
    // Wait for the recording duration.
    await new Promise(res => setTimeout(res, seconds*1000));
  } finally {
    // ALWAYS turn mic OFF by disabling tracks after recording.
    stream.getTracks().forEach(track => track.enabled = false);
  }

  processor.disconnect();
  source.disconnect();

  // Concatenate
  let length = samples.reduce((a,b)=>a+b.length,0);
  let pcm = new Float32Array(length);
  let off = 0;
  for(const chunk of samples){ pcm.set(chunk, off); off += chunk.length; }

  // Encode WAV (16-bit PCM)
  const wavBytes = encodeWav(pcm, ctx.sampleRate);
  return new Blob([wavBytes], { type: "audio/wav" });
}

function encodeWav(samples, sampleRate){
  // convert to 16-bit PCM
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  // RIFF header
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;
  // fmt chunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size
  view.setUint16(offset, 1, true); offset += 2;  // PCM
  view.setUint16(offset, 1, true); offset += 2;  // mono
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2; // bits per sample
  // data chunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataSize, true); offset += 4;

  // PCM samples
  let pos = 44;
  for (let i = 0; i < samples.length; i++, pos += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function writeString(view, offset, str){
  for (let i=0; i<str.length; i++) view.setUint8(offset+i, str.charCodeAt(i));
}