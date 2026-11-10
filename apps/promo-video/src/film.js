/** 成片的分镜顺序。每个分镜自带时长，开始时间由时间线按顺序排出来。 */
import { featureScenes } from "./scenes/features.js";
import { howto } from "./scenes/howto.js";
import { brand, hook } from "./scenes/intro.js";
import { closing, next } from "./scenes/outro.js";
import { plugins } from "./scenes/plugins.js";
import { work } from "./scenes/work.js";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const scenes = [
  // 是什么
  hook,
  brand,
  work,
  // 核心特点
  ...featureScenes,
  plugins,
  // 怎么用
  howto,
  // 接下来与收尾
  next,
  closing,
];
