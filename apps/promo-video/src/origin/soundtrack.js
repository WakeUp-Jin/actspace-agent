/**
 * 《诞生记》的配乐：'Chasing Daylight'，Scott Buckley，CC BY 4.0（可商用，必须署名）。
 * 钢琴、弦乐加一点合成器；作者自己的说明是「a journey to find meaning」。音频不入库，由 scripts/lib/soundtrack.mjs 下载。
 *
 * 曲子是 106.667 拍/分，每个和弦占 6 拍（3.375 秒），四个和弦一个循环。下面的数字都是「第几个和弦」：
 *
 *   0–31   钢琴起，低音和弦乐一层层加进来
 *   32–39  副歌
 *   40–47  第一次推到最响
 *   48–53  停顿：只剩一个长和弦，越来越轻，到 53 几乎没有声音
 *   54–55  重新起拍
 *   56–59  主题回来
 *   60–67  一路推高
 *   68–71  全曲最响的地方，然后收
 *   72–77  尾声，只剩钢琴；77 是最后一个和弦
 *   78     余音，79 起无声
 *
 * 成片取第 28 个和弦到曲终这一整段，中间不剪接。分镜的长度一律写成「几个和弦」，
 * 所以每一次换镜头都落在换和弦的那一下；哪个分镜对哪一段见 cues.js。
 */
const PULSE = 0.5625;
const SLOT = 6 * PULSE;
/** 曲子里第 0 个和弦的起音时刻（秒）。按波形量出来的，误差约 ±0.02 秒。 */
const FIRST_CHORD = 0.7;
/** 画面比声音早一帧：换镜头略早于起音，看着是齐的；晚了就像慢半拍。 */
const PICTURE_LEAD = 1 / 30;
/** 成片从第几个和弦切入。 */
export const ENTRY = 28;
/** 切入点之前留一拍，声音在这一拍里淡入。 */
export const LEAD_IN = PULSE;

export const sections = { chorus: 32, peak: 40, breakdown: 48, pickup: 54, theme: 56, climb: 60, crest: 68, outro: 72, lastChord: 77, silence: 79 };

export const soundtrack = {
  title: "Chasing Daylight",
  artist: "Scott Buckley",
  license: "CC BY 4.0",
  /** 作者要求的署名写法，原样用在片尾和视频简介里。 */
  credit: "'Chasing Daylight' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
  page: "https://www.scottbuckley.com.au/library/chasing-daylight/",
  url: "https://www.scottbuckley.com.au/library/wp-content/uploads/2021/03/sb_chasingdaylight.mp3",
  file: "music/chasing-daylight.mp3",
  /** 成片第 0 秒对应曲子的第几秒。 */
  start: FIRST_CHORD + ENTRY * SLOT - LEAD_IN - PICTURE_LEAD,
  fadeIn: LEAD_IN,
};

/** 几个和弦换成秒。 */
export const slots = (count) => count * SLOT;
