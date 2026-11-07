import { lazy, type ComponentType } from "react";
import { SPACE_DEMO_ENABLED } from "./space/space-demo-enabled";

/**
 * 整页 / 非首屏组件的按需加载入口（卡顿修复 R1）：首屏只需要聊天页，设置、扩展、Space、轨迹视图
 * 在第一次进入时才下载。使用处都要包 `<Suspense>`。
 * Space 演示在生产构建里是常量 false，这里的动态 import 随分支一起被删掉，不会产生多余的 chunk。
 */

export const SettingsPage = lazy(() => import("./settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
export const ExtensionsPage = lazy(() => import("./extensions/ExtensionsPage").then((module) => ({ default: module.ExtensionsPage })));
export const TrajectoryView = lazy(() => import("./TrajectoryView").then((module) => ({ default: module.TrajectoryView })));

export const SubagentsPanel = lazy(() => import("./right-panel/SubagentsPanel").then((module) => ({ default: module.SubagentsPanel })));

const Disabled: ComponentType<never> = () => null;

export const SpaceWorkbench = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/SpaceWorkbench").then((module) => ({ default: module.SpaceWorkbench })))
  : (Disabled as ComponentType);
export const SpaceRightPanel = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/SpaceRightPanel").then((module) => ({ default: module.SpaceRightPanel })))
  : (Disabled as ComponentType);
export const SpaceObjectMenu = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/panel/SpaceObjectMenu").then((module) => ({ default: module.SpaceObjectMenu })))
  : (Disabled as ComponentType);
export const SpaceTabBar = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/tabs/SpaceTabBar").then((module) => ({ default: module.SpaceTabBar })))
  : (Disabled as ComponentType);
export const SpaceDemoHelpButton = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/dialogs/SpaceDemoHelpDialog").then((module) => ({ default: module.SpaceDemoHelpButton })))
  : (Disabled as ComponentType);
export const NewSpaceDialog = SPACE_DEMO_ENABLED
  ? lazy(() => import("./space/dialogs/NewSpaceDialog").then((module) => ({ default: module.NewSpaceDialog })))
  : (Disabled as unknown as typeof import("./space/dialogs/NewSpaceDialog").NewSpaceDialog);
