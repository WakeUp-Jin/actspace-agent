/**
 * 配乐：一首现成的曲子，不再用脚本合成。
 *
 * 《The Good Times》，HoliznaCC0，专辑《Be Happy With Who You Are》，CC0 1.0（公有领域，可商用、不需要署名）。
 * 音频不入库：渲染或预览前由 scripts/lib/soundtrack.mjs 下载到 .cache/music/。
 *
 * 曲子是 90 拍/分，前 4 小节只有和声，鼓从第 5 小节进，第 17–20 小节是一段只剩和声的间奏。
 * 成片从第 2 小节开始用：开场占 3 小节，品牌亮相正好落在鼓进来的那一拍；
 * 间奏落在「一切皆插件」，鼓回来时「怎么用」里的桌面端刚好启动。
 * 所以分镜时长一律写成拍数（beats），换曲子时改这里的 bpm 和 start，再对一遍上面这几个落点。
 */
export const soundtrack = {
  title: "The Good Times",
  artist: "HoliznaCC0",
  license: "CC0 1.0",
  page: "https://freemusicarchive.org/music/holiznacc0/be-happy-with-who-you-are/the-good-times/",
  url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/4e5GjL0fiBnn8ZtCegJ7U337KfG91HXRzDjE3mkg.mp3",
  file: "music/the-good-times.mp3",
  bpm: 90,
  /** 成片第 0 秒对应曲子的第几秒：第 2 小节的第一拍。 */
  start: 4 * (60 / 90),
};

/** 拍数换成秒。 */
export const beats = (count) => Number(((count * 60) / soundtrack.bpm).toFixed(4));
