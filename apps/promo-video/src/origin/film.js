/**
 * 《ActSpace 诞生记》的分镜顺序。每个分镜的时长写在 cues.js 里（按配乐的小节数），这里只管先后。
 * 讲什么、为什么这么排、每个数字的出处，见 ORIGIN_STORY.md。
 */
import "./styles/shared.css";
import "./styles/scenes.css";
import { pushback, subtraction } from "./scenes/discipline.js";
import { authors, closingCard, lookingBack } from "./scenes/ending.js";
import { firstNight, firstWords } from "./scenes/firstdays.js";
import { growing, growingAgain } from "./scenes/growth.js";
import { coldOpen, titleCard } from "./scenes/opening.js";
import { rewriting } from "./scenes/rewrite.js";

export const scenes = [
  // 开场：三个数，然后片名
  coldOpen,
  titleCard,
  // 从零开始
  firstNight,
  firstWords,
  growing,
  // 推倒重来
  rewriting,
  growingAgain,
  // 不容易的部分
  subtraction,
  pushback,
  // 回头看
  authors,
  lookingBack,
  closingCard,
];
