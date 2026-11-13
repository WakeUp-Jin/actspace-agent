/**
 * 这个目录里的片子。默认是产品宣传片；预览页加 `?film=<id>`、渲染加 `--film <id>` 换成另一部。
 * 这个文件网页和 Node 脚本都会引用，所以分镜（要经 Vite 处理图片和样式）只在 scenes() 里按需加载。
 */
import { soundtrack as promoSoundtrack } from "./soundtrack.js";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const DEFAULT_FILM = "promo";

export const films = {
  promo: {
    title: "ActSpace 产品宣传片",
    output: "out/actspace-promo.mp4",
    stills: "out/stills",
    soundtrack: promoSoundtrack,
    scenes: async () => (await import("./film.js")).scenes,
  },
};

export function filmById(id) {
  const film = films[id];
  if (!film) throw new Error(`没有「${id}」这部片子，可选：${Object.keys(films).join("、")}`);
  return film;
}
