/**
 * 《诞生记》的配乐：《Orbit (Instrumental Version)》，Josh Woodward，专辑《Addressed to the Stars》（2016），CC BY 4.0。
 * 可商用，但必须署名，作者要求署名里留着曲名、他的名字和他的网站：片尾卡上有一行，发布时简介里也要写（写法见 ORIGIN_STORY.md 第 9 节）。
 * 同名歌曲的无人声版，木吉他扫弦。音频不入库，由 scripts/lib/soundtrack.mjs 下载。
 *
 * 曲子是 94 拍/分、四拍一小节，一小节 2.553 秒，差不多一小节换一次和弦。下面的数字都是「第几小节」，按波形量的：
 *
 *   0–3      前奏
 *   4–19     第一段，四小节一句；第 8–11 小节扫得更重
 *   20.5–36  第二段，还是四小节一句，但整段晚半小节：句子从 20.5、24.5、28.5、32.5 起
 *   37–43    间奏，全曲最轻；37、41 各起一句
 *   44–47    全曲最响的一句，到第 47 小节落下来
 *   48–51    回到平常的力度
 *   52.5–56  尾奏，越弹越轻
 *   56–58.5  最后几下扫弦渐慢，不在小节线上；最后一个和弦在第 57.2 小节，余音到第 58.5 小节前后
 *
 * 成片从第一下扫弦用到余音收完，中间不剪接。分镜的长度一律写成「几小节」，
 * 所以每一次换镜头都落在小节线上（第二段里是半小节线，跟着曲子晚半小节）；哪个分镜对哪一段见 cues.js。
 */
const BPM = 94;
const BAR = (4 * 60) / BPM;
/** 第一下扫弦在音频文件的第 0.09 秒。 */
const FIRST_STRUM = 0.09;
/** 画面比声音早一帧：换镜头略早于起音，看着是齐的；晚了就像慢半拍。 */
const PICTURE_LEAD = 1 / 30;

/** 每一句从第几小节开始。 */
export const phrases = [0, 4, 8, 12, 16, 20.5, 24.5, 28.5, 32.5, 37, 41, 44, 48, 52.5];

export const sections = { second: 20.5, quiet: 37, loud: 44, calm: 48, outro: 52.5, lastChord: 57.2, silence: 58.5 };

export const soundtrack = {
  title: "Orbit (Instrumental Version)",
  artist: "Josh Woodward",
  /** 作者的网站，署名里要带。 */
  site: "joshwoodward.com",
  license: "CC BY 4.0",
  page: "https://freemusicarchive.org/music/Josh_Woodward/Addressed_to_the_Stars_1995/JoshWoodward-Orbit-NoVox_1885/",
  url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/blocSonic/Josh_Woodward/Addressed_to_the_Stars/Josh_Woodward_-_26_-_Orbit_Instrumental_Version.mp3",
  file: "music/orbit-instrumental.mp3",
  /** 成片从第一下扫弦的前一帧开始放，所以画面的每条小节线都比声音早一帧。第一个音就在开头，不淡入。 */
  start: FIRST_STRUM - PICTURE_LEAD,
  fadeIn: 0,
};

/**
 * 曲子的第 bar 小节在成片里的时刻（秒），可以带小数。
 * 小节线是按波形量出来的：从第一下扫弦起就在 94 拍/分的整拍网格上，到尾奏渐慢之前误差约 ±0.03 秒。
 */
export const barAt = (bar) => bar * BAR;
