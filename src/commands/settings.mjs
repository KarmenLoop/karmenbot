import { fullScreen } from "./tui.mjs";

// `karmenbot settings` (设置): the settings centre on its own, keyboard and mouse.
export const run = (ctx) => fullScreen(ctx, { settings: "only" });
