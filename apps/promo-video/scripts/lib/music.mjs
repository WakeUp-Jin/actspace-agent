/**
 * 程序合成的配乐：不依赖任何音频素材，同样的输入永远得到同样的波形。
 *
 * 四层声音按分镜的「强度」逐层进出：铺底和弦一直在，往上依次加拨弦、低音、沙锤。
 * 每个分镜开始时敲一声钟，最后一个分镜回到主和弦并淡出。
 */

const RATE = 44_100;
const BEAT = 60 / 96;
const BAR = BEAT * 4;
const EIGHTH = BEAT / 2;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// D 大调：Dmaj7 → Bm7 → Gmaj7 → A6，每小节一个和弦。
const CHORDS = [
  { root: 38, tones: [62, 66, 69, 73] },
  { root: 47, tones: [59, 62, 66, 69] },
  { root: 43, tones: [55, 59, 62, 66] },
  { root: 45, tones: [57, 61, 64, 66] },
];
const ARPEGGIO = [0, 2, 1, 3, 2, 3, 1, 2];

function createNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 31 - 1;
  };
}

/**
 * @param {{ duration: number, sections: Array<{ at: number, level: 0 | 1 | 2 | 3 }> }} score
 *   level：0 只有铺底，1 加稀疏拨弦，2 加琶音和低音，3 再加沙锤。
 * @returns {{ left: Float32Array, right: Float32Array, sampleRate: number }}
 */
export function composeMusic({ duration, sections }) {
  const length = Math.ceil(duration * RATE);
  const dry = [new Float32Array(length), new Float32Array(length)];
  const echoed = [new Float32Array(length), new Float32Array(length)];
  const finale = sections.at(-1)?.at ?? duration;

  /** 强度在分镜切换后的两秒内平滑过渡，层的进出就不会突兀。 */
  const levelAt = (time) => {
    let level = sections[0]?.level ?? 0;
    for (let index = 1; index < sections.length; index += 1) {
      const { at, level: next } = sections[index];
      if (time < at) break;
      level += (next - level) * Math.min(1, (time - at) / 2);
    }
    return level;
  };
  const layer = (time, from) => Math.max(0, Math.min(1, levelAt(time) - from));
  const chordAt = (time) => (time >= finale - 0.01 ? CHORDS[0] : CHORDS[Math.floor(time / BAR) % CHORDS.length]);

  const add = (bus, start, seconds, pan, sample) => {
    const first = Math.max(0, Math.round(start * RATE));
    const last = Math.min(length, first + Math.round(seconds * RATE));
    const gainLeft = Math.cos(((pan + 1) * Math.PI) / 4);
    const gainRight = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let index = first; index < last; index += 1) {
      const value = sample((index - first) / RATE);
      bus[0][index] += value * gainLeft;
      bus[1][index] += value * gainRight;
    }
  };

  const pad = (start, midi, seconds, gain, pan) => {
    const frequency = hz(midi);
    const attack = 1.3;
    const release = 2;
    add(dry, start, seconds + release, pan, (t) => {
      const envelope = Math.min(1, t / attack) * Math.min(1, Math.max(0, (seconds + release - t) / release));
      const phase = 2 * Math.PI * frequency * t;
      const tone = Math.sin(phase) + 0.6 * Math.sin(phase * 1.004) + 0.12 * Math.sin(phase * 2);
      return gain * envelope * envelope * tone * (0.9 + 0.1 * Math.sin(2 * Math.PI * 0.21 * (start + t)));
    });
  };

  const pluck = (start, midi, gain, pan, decay = 0.32) => {
    const frequency = hz(midi);
    add(echoed, start, decay * 7, pan, (t) => {
      const envelope = Math.min(1, t / 0.006) * Math.exp(-t / decay);
      const phase = 2 * Math.PI * frequency * t;
      return (
        gain *
        envelope *
        (Math.sin(phase) +
          0.28 * Math.sin(phase * 2) * Math.exp(-t / 0.12) +
          0.08 * Math.sin(phase * 3) * Math.exp(-t / 0.05))
      );
    });
  };

  const bass = (start, midi, seconds, gain) => {
    const frequency = hz(midi);
    add(dry, start, seconds, 0, (t) => {
      const envelope = Math.min(1, t / 0.02) * Math.exp(-t / (seconds * 0.45)) * Math.min(1, (seconds - t) / 0.05);
      const phase = 2 * Math.PI * frequency * t;
      return gain * envelope * (Math.sin(phase) + 0.2 * Math.sin(phase * 2));
    });
  };

  const noise = createNoise(20261110);
  const shaker = (start, gain, pan) => {
    let previous = 0;
    add(dry, start, 0.07, pan, (t) => {
      const white = noise();
      const bright = white - previous;
      previous = white;
      return gain * bright * Math.exp(-t / 0.018);
    });
  };

  for (let bar = 0; bar * BAR < duration; bar += 1) {
    const barStart = bar * BAR;
    const chord = chordAt(barStart);
    const closing = barStart >= finale - 0.01;

    chord.tones.forEach((midi, voice) => {
      pad(barStart, midi, BAR, 0.03, (voice - 1.5) * 0.4);
    });
    pad(barStart, chord.root + 12, BAR, 0.028, 0);

    for (let step = 0; step < 8; step += 1) {
      const time = barStart + step * EIGHTH;
      if (time >= duration) break;
      const sparse = layer(time, 0);
      const full = layer(time, 1);
      const pan = step % 2 === 0 ? -0.4 : 0.4;
      const midi = chord.tones[ARPEGGIO[step]] + 12;

      // 强度 1 时只弹每小节的第 1、3 拍；到强度 2 才补齐成完整琶音。
      const onBeat = step === 0 || step === 4;
      const gain = onBeat ? 0.1 * sparse : 0.085 * full;
      if (gain > 0.002 && !(closing && !onBeat)) pluck(time, midi, gain, pan);

      if (full > 0.02 && !closing) {
        if (step === 0) bass(time, chord.root, BEAT * 1.8, 0.17 * full);
        if (step === 5) bass(time, chord.root, BEAT * 0.9, 0.11 * full);
      }
      const shake = layer(time, 2);
      if (shake > 0.02 && step % 2 === 1 && !closing) shaker(time, 0.05 * shake, step % 4 === 1 ? 0.5 : -0.5);
    }
  }

  // 每个分镜开始时敲一声钟，音高取当时和弦的五音。
  for (const { at } of sections.slice(1)) pluck(at, chordAt(at).tones[2] + 24, 0.085, 0, 1.1);

  // 拨弦和钟声过一条左右交叉的附点八分延迟，给干声留出空间感。
  const delay = Math.round(EIGHTH * 1.5 * RATE);
  for (let index = delay; index < length; index += 1) {
    const left = echoed[0][index] + 0.34 * echoed[1][index - delay];
    const right = echoed[1][index] + 0.34 * echoed[0][index - delay];
    echoed[0][index] = left;
    echoed[1][index] = right;
  }

  const fadeIn = 0.4 * RATE;
  const fadeOut = Math.min(length, 3.5 * RATE);
  let peak = 0;
  for (const side of [0, 1]) {
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.min(1, index / fadeIn) * Math.min(1, (length - index) / fadeOut) ** 1.5;
      const value = Math.tanh((dry[side][index] + echoed[side][index]) * 1.4) * envelope;
      dry[side][index] = value;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  // 归一到 -4 dBFS，给编码留余量。
  const normalize = peak > 0 ? 0.63 / peak : 1;
  for (const side of [0, 1]) for (let index = 0; index < length; index += 1) dry[side][index] *= normalize;

  return { left: dry[0], right: dry[1], sampleRate: RATE };
}

/** 16 位立体声 PCM 的 WAV 文件内容。 */
export function encodeWav({ left, right, sampleRate }) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(frames * 4, 40);
  for (let index = 0; index < frames; index += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[index])) * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[index])) * 32767), 46 + index * 4);
  }
  return buffer;
}

/** 各分镜的配乐强度；没列出的分镜按 2 处理。 */
const LEVELS = { hook: 0, brand: 1, work: 2, plugins: 3, howto: 2, next: 3, closing: 1 };

export function scoreFor(film) {
  return {
    duration: film.duration,
    sections: film.scenes.map(({ id, start }) => ({
      at: start,
      level: LEVELS[id] ?? (id.startsWith("feature-") ? 3 : 2),
    })),
  };
}
