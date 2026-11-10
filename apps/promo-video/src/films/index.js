/**
 * 同一套时间线引擎剪出来的几个版本。每个版本只是一份分镜列表：
 * 分镜自带时长，开始时刻由时间线按顺序排出来。
 */
import { demo } from "../scenes/demo.js";
import { brand, hook } from "../scenes/intro.js";
import { approval, context, plugins } from "../scenes/motion.js";
import { closing, start } from "../scenes/outro.js";
import { pulse } from "../scenes/short.js";
import { workbench } from "../scenes/workbench.js";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// 「每个问题，都有它的空间」讲的是 Actor 与 Space，这部分还在开发，用到这句话的版本在页脚写明。
const VISION_FOOT = ["本地优先", "开源 · Apache-2.0", "Actor 与 Space 开发中"];

export const films = {
  /** 真实界面版：一个窗口、一条任务讲到底。需要先运行 capture:ui。 */
  real: {
    title: "真实界面 · 一条任务讲到底",
    needs: "ui",
    scenes: ({ ui }) => [workbench(ui), start, closing({ line: ["敢放手，", "因为<em>看得见、管得住</em>。"] })],
  },
  /** 动效图形版：界面按视频尺寸重画，一个分镜讲一件事。 */
  motion: {
    title: "动效图形 · 大字报节奏",
    scenes: () => [
      hook,
      brand,
      demo,
      context,
      approval,
      plugins,
      start,
      closing({ line: ["给下一个问题，", "一个<em>空间</em>。"], foot: VISION_FOOT }),
    ],
  },
  /** 品牌短片：踩着拍点的十二秒，只留一句话和去哪里找。 */
  short: {
    title: "品牌短片 · 十二秒卡点",
    scenes: () => [pulse, closing({ line: ["会自我进化的", "Agent <em>运行空间</em>。"], foot: VISION_FOOT })],
  },
};

export const DEFAULT_FILM = "real";
