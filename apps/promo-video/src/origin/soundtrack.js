/**
 * 《诞生记》的配乐：《Blue Skies》，HoliznaCC0，专辑《Lazy Summer Lofi》，CC0 1.0（公有领域，可商用、不需要署名）。
 * Lo-fi 器乐，和产品宣传片的配乐是同一位作者。音频不入库，由 scripts/lib/soundtrack.mjs 下载。
 *
 * 曲子是 82 拍/分、四拍一小节，一小节 2.927 秒，两小节换一次和弦。下面的数字都是「第几小节」：
 *
 *   0–3    前奏：只有和弦
 *   4–15   鼓和贝斯进来
 *   16–27  再加一层高音
 *   28–31  间奏：鼓和贝斯停下，只剩和弦和那层高音
 *   32–43  鼓和贝斯回来
 *   44–55  那层高音回来
 *   56–58  尾奏：鼓停，几个音收住；第 59 小节起没有声音
 *
 * 成片从曲子的第 0 秒用到最后一个音，中间不剪接。分镜的长度一律写成「几小节」，
 * 所以每一次换镜头都落在小节线上；哪个分镜对哪一段见 cues.js。
 */
const BPM = 82;
const BAR = (4 * 60) / BPM;
/** 画面比声音早一帧：换镜头略早于起音，看着是齐的；晚了就像慢半拍。 */
const PICTURE_LEAD = 1 / 30;

export const sections = { drums: 4, high: 16, pause: 28, back: 32, highBack: 44, outro: 56, silence: 59 };

export const soundtrack = {
  title: "Blue Skies",
  artist: "HoliznaCC0",
  license: "CC0 1.0",
  page: "https://freemusicarchive.org/music/holiznacc0/lazy-summer-lofi-1/blue-skiesmp3/",
  url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/XpOthDGLRLQULX4ayE2hezIK43FqPYAo69N5xxhn.mp3",
  file: "music/blue-skies.mp3",
  /** 成片第 0 秒就是曲子的第 0 秒。第一个音就落在那里，所以不淡入。 */
  start: 0,
  fadeIn: 0,
};

/**
 * 曲子的第 bar 小节在成片里的时刻（秒），可以带小数。
 * 小节线是按波形量出来的：就在 82 拍/分的整拍网格上，从第 0 秒起算，误差约 ±0.01 秒。
 */
export const barAt = (bar) => Math.max(0, bar * BAR - PICTURE_LEAD);
