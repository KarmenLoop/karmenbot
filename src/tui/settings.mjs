import { KarmenError } from "../errors.mjs";
import { loadConfig, loadSecrets } from "../home.mjs";
import { modelPresets } from "../kernel.mjs";
import { listModels, recordFor, removeModel, useModel } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { configuredPlatforms } from "../commands/connect.mjs";
import { addFromPreset, probeModel } from "../commands/model.mjs";
import { saveMoaPreset } from "../commands/moa.mjs";
import { runningPid, startGateway, stopGateway } from "../gateway/control.mjs";
import { createPairing } from "../gateway/pairing.mjs";
import { DISCORD_PERMISSIONS } from "../gateway/platforms/discord.mjs";
import { FORMS, SCAN, checkForm, removePlatform, savePlatform, writeSlackManifest } from "../gateway/platforms/forms.mjs";
import { PLATFORM_LABELS } from "../gateway/platforms/labels.mjs";
import { encodeQr, renderQr } from "../gateway/qr.mjs";
import { installService, logFile, serviceInstalled, stopService } from "../gateway/service.mjs";
import { checkUpdate, identityText, OFFICIAL, openInBrowser } from "../official.mjs";
import { VERSION } from "../version.mjs";
import { SYSTEMS, chapterMarkdown, chaptersFor, currentSystem } from "../tutorial/chapters.mjs";
import { logoSpans } from "./banner.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { fitSpans, overlaySpans, sp, spansWidth, wrapSpans } from "./paint.mjs";
import { textWidth, truncate } from "./text.mjs";
import { C, gradient, spectrum } from "./theme.mjs";

// The settings centre: every setting reachable with arrows + Enter or a mouse
// click, one row per item. Pages are rebuilt from config on every frame, so
// what is shown is always what is saved.
//
// Item kinds: link (opens a page), action (button), toggle, radio, check,
// field (typed or pasted text), text and raw (not selectable).
const LABEL = 18;
const LOGO = 16;
const LOGO_LARGE = 24;
const SELECTABLE = new Set(["link", "action", "toggle", "radio", "check", "field"]);
const isSelectable = (item) => SELECTABLE.has(item?.kind);
const clean = (text) => String(text).replace(/[\x00-\x1f\x7f]/g, "");

function pad(text, width) {
  const cut = truncate(text, width - 1);
  return cut + " ".repeat(Math.max(1, width - textWidth(cut)));
}

function qrLines(url, depth, margin) {
  const modules = encodeQr(url).modules;
  if (depth === "none") return renderQr(modules, { margin, color: false }).map((line) => [sp(line)]);
  return renderQr(modules, { margin, color: true }).map((line) => [sp(line.replace(/\x1b\[[0-9;]*m/g, ""), { fg: [0, 0, 0], bg: [255, 255, 255] })]);
}

export function createSettings({
  env = process.env, t, depth = "truecolor", platform = process.platform, workspace = null, fetchImpl = globalThis.fetch,
  prefs, services: overrides = {}, onChange = () => {}, onClose = () => {}, schedule = () => {}, standalone = false,
}) {
  const L = (zh, en) => (prefs.lang() === "en" ? en : zh);
  const plat = (name) => PLATFORM_LABELS[name][prefs.lang() === "en" ? "en" : "zh"];
  const failure = (error) => (error instanceof KarmenError ? t(error.key, error.vars) : error?.message || String(error));
  const services = {
    probe: (record) => probeModel(record, fetchImpl),
    gatewayPid: () => runningPid(env),
    startGateway: () => startGateway(env, { workspace }),
    stopGateway: () => stopGateway(env),
    autostart: () => serviceInstalled(env),
    setAutostart: (on) => (on ? installService({ env }) : stopService({ env }, { remove: true })),
    scan: (name, options) => SCAN[name].run({ fetchImpl, source: env.KARMENBOT_REGISTRATION_SOURCE || "karmenbot", ...options }),
    ...overrides,
  };

  let presets = null;
  modelPresets().then((list) => {
    presets = list.filter((item) => !item.stopped);
    schedule();
  }, () => {
    presets = [];
    schedule();
  });

  const stack = [];
  let note = null;
  let armed = null;
  let hits = [];
  let lastWidth = 80;
  let bodyHeight = 10;

  const top = () => stack[stack.length - 1];
  const say = (text, tone = "info") => {
    note = { text, tone };
    schedule();
  };

  function open(id, data = {}) {
    stack.push({ id, data, index: -1, scroll: 0 });
    note = null;
    armed = null;
    PAGES[id].enter?.(data);
    schedule();
  }

  function pop() {
    const page = stack.pop();
    PAGES[page.id].leave?.(page.data);
  }

  function back(times = 1) {
    for (let i = 0; i < times && stack.length; i += 1) pop();
    note = null;
    armed = null;
    if (!stack.length) onClose();
    schedule();
  }

  function popTo(id) {
    while (stack.length > 1 && top().id !== id) pop();
    note = null;
    armed = null;
  }

  function close() {
    while (stack.length) pop();
    onClose();
  }

  // ── shared actions ───────────────────────────────────────────────────────
  const hint = (message) => (/401|unauthor|invalid.*key/i.test(message) ? L("（密钥不对，重新粘贴试试）", " (check the key)")
    : /402|403|quota|balance|insufficient/i.test(message) ? L("（多半是余额或权限，去厂商控制台看看）", " (balance or permission)")
      : /timeout|abort|ENOTFOUND|ECONN|fetch failed/i.test(message) ? L("（网络不通，换个网络试试）", " (network)") : "");

  async function test(id) {
    let record;
    try {
      record = recordFor(id, env);
    } catch (error) {
      say(failure(error), "bad");
      return;
    }
    say(L(`正在测试 ${record.name}…`, `Testing ${record.name}…`));
    const result = await services.probe(record);
    if (result.ok) say(L(`✓ ${record.name} 连接正常，用时 ${result.ms} 毫秒。可以开始用了。`, `✓ ${record.name} answered in ${result.ms} ms.`), "ok");
    else say(L(`✗ 测试失败：${result.message}${hint(result.message)}`, `✗ Test failed: ${result.message}${hint(result.message)}`), "bad");
  }

  async function saveModel(data) {
    const preset = data.preset;
    const local = preset.id === "local" || preset.auth === "none";
    const model = data.model.trim();
    const apiKey = data.key.trim();
    if (!model) return say(L("型号还没填。", "Model is empty."), "warn");
    if (preset.id === "custom" && !data.baseUrl.trim()) return say(L("接口地址还没填。", "Base URL is empty."), "warn");
    if (!apiKey && !local) return say(L("密钥还没粘贴。", "Paste the API key first."), "warn");
    let entry;
    try {
      entry = addFromPreset(env, preset, {
        model,
        baseUrl: data.baseUrl.trim(),
        protocol: preset.id === "custom" ? (data.anthropic ? "anthropic" : "openai") : preset.protocol,
        apiKey,
        makeDefault: data.makeDefault,
      });
    } catch (error) {
      return say(failure(error), "bad");
    }
    onChange("model");
    back(2);
    return test(entry.id);
  }

  function saveMoa(data) {
    const ids = new Set(listModels(env).map((item) => item.id));
    const references = [...data.refs].filter((id) => ids.has(id));
    if (!references.length) return say(L("至少勾选一个参考模型。", "Tick at least one reference model."), "warn");
    if (!ids.has(data.aggregator)) return say(L("选一个聚合模型。", "Pick an aggregator."), "warn");
    saveMoaPreset(env, { references, aggregator: data.aggregator, fanout: data.fanout, enabled: data.enabled });
    onChange("moa");
    back();
    return say(data.enabled
      ? L(`MoA 已开启：${references.length} 个参考模型 + 1 个聚合模型。`, `MoA on: ${references.length} references + 1 aggregator.`)
      : L("MoA 设置已保存（没有开启）。", "MoA saved (off)."), "ok");
  }

  function connected(name) {
    popTo("platforms");
    say(L(`${plat(name)} 已接入 ✓ 下一步：去「后台网关」点「启动网关」。`, `${plat(name)} connected ✓ Next: Gateway → Start.`), "ok");
  }

  function startScan(data) {
    data.controller?.abort();
    const controller = new AbortController();
    Object.assign(data, { controller, status: "starting", url: null, error: "" });
    const live = () => !controller.signal.aborted;
    services.scan(data.name, {
      signal: controller.signal,
      onCode: ({ url }) => {
        if (!live()) return;
        data.url = url;
        data.status = "waiting";
        schedule();
      },
      onStatus: (status) => {
        if (!live()) return;
        data.status = status === "scanned" ? "scanned" : "expired";
        schedule();
      },
    }).then((result) => {
      if (!live()) return;
      savePlatform(env, data.name, result.settings, result.secrets, result.owner);
      onChange("platforms");
      connected(data.name);
    }, (error) => {
      if (!live()) return;
      data.status = "error";
      data.error = failure(error);
      schedule();
    });
  }

  function savePlatformForm(data) {
    const name = data.name;
    const values = Object.fromEntries(Object.entries(data.values).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
    const problem = checkForm(name, values);
    if (problem) return say(problem, "warn");
    const { settings, secrets } = FORMS[name].build(values);
    savePlatform(env, name, settings, secrets);
    onChange("platforms");
    connected(name);
    if (name === "discord" && values.applicationId) {
      say(L(`Discord 已接入 ✓ 用这个链接把机器人邀请进服务器：https://discord.com/oauth2/authorize?client_id=${values.applicationId}&scope=bot&permissions=${DISCORD_PERMISSIONS}`, `Discord connected ✓ Invite it: https://discord.com/oauth2/authorize?client_id=${values.applicationId}&scope=bot&permissions=${DISCORD_PERMISSIONS}`), "ok");
    }
    return undefined;
  }

  async function setAutostart(data, on) {
    try {
      await services.setAutostart(on);
      data.autostart = on;
      say(on ? L("已设为开机自动运行。", "Starts at login now.") : L("已取消开机自动运行。", "No longer starts at login."), "ok");
    } catch (error) {
      say(L(`没有设置成功：${failure(error)}`, `Could not change it: ${failure(error)}`), "bad");
    }
  }

  // ── item builders ────────────────────────────────────────────────────────
  const link = (label, detail, run, tone = C.dim, icon = "") => ({ kind: "link", label, detail, run, tone, icon });
  const action = (label, run, options = {}) => ({ kind: "action", label, run, ...options });
  const toggle = (label, on, set) => ({ kind: "toggle", label, on, set, run: () => set(!on) });
  const radio = (label, on, run) => ({ kind: "radio", label, on, run });
  const check = (label, on, run) => ({ kind: "check", label, on, run });
  const field = (label, data, key, options = {}) => ({ kind: "field", label, value: data[key] ?? "", set: (value) => { data[key] = value; }, ...options });
  const text = (value, color = C.dim) => ({ kind: "text", spans: [sp(value, { fg: color })] });
  const heading = (value) => ({ kind: "text", spans: [sp("◇ ", { fg: C.violet }), ...gradient(value, { bold: true, to: 0.85 })] });
  const gap = { kind: "text", spans: [] };

  // ── pages ────────────────────────────────────────────────────────────────
  const PAGES = {
    home: {
      title: () => L("设置中心", "Settings"),
      build() {
        const config = loadConfig(env);
        const models = listModels(env);
        const chosen = models.find((item) => item.id === config.model);
        const moa = resolveMoa(config);
        const platforms = configuredPlatforms(env).map((item) => plat(item.name));
        const pid = services.gatewayPid();
        const os = currentSystem(platform);
        return {
          hero: true,
          intro: [L("↑↓ 或鼠标选择，回车、空格或单击打开，Esc 返回。三步就能用：配模型 → 接聊天平台（可选）→ 启动后台网关（可选）。", "Arrows or mouse to choose, Enter, Space or click to open, Esc to go back. Three steps: a model → chat apps (optional) → the gateway (optional).")],
          items: [
            link(L("模型", "Models"), chosen ? `${chosen.name} · ${chosen.model}` : L("还没配置 · 从这里开始", "not set · start here"), () => open("models"), chosen ? C.ok : C.warn, chosen ? "✓" : "!"),
            gap,
            link(L("多模型会商 MoA", "Mixture of Agents"), moa.preset ? (moa.enabled ? L("已开启", "on") : L("已设置，没开启", "set up, off")) : models.length < 2 ? L("需要两个以上模型", "needs two models") : L("未设置", "not set"), () => open("moa"), moa.enabled ? C.cyan : C.dim, moa.enabled ? "✓" : "○"),
            gap,
            link(L("聊天平台", "Chat apps"), platforms.length ? platforms.join("、") : L("未接入（可选）", "none (optional)"), () => open("platforms"), platforms.length ? C.ok : C.dim, platforms.length ? "✓" : "○"),
            gap,
            link(L("后台网关", "Gateway"), pid ? L(`运行中 · 进程 ${pid}`, `running · pid ${pid}`) : L("没有运行（可选）", "stopped (optional)"), () => open("gateway"), pid ? C.ok : C.dim, pid ? "✓" : "○"),
            gap,
            link(L("语言与显示", "Language & display"), [L("中文", "English"), prefs.session ? (prefs.autoYes() ? L("自动确认开", "auto-approve on") : L("自动确认关", "auto-approve off")) : ""].filter(Boolean).join(" · "), () => open("prefs"), C.dim, "·"),
            gap,
            link(L("教程", "Tutorial"), L(`按 ${SYSTEMS[os].name} 讲`, `for ${SYSTEMS[os].name}`), () => open("tutorial"), C.dim, "·"),
            gap,
            link(L("官网与更新", "Official site"), OFFICIAL.site, () => open("about"), C.accent, "·"),
            gap,
            action(standalone ? L("完成", "Done") : L("完成，开始使用", "Done, start using it"), close, { primary: true }),
          ],
        };
      },
    },

    models: {
      title: () => L("模型", "Models"),
      build() {
        const config = loadConfig(env);
        const models = listModels(env);
        return {
          intro: [models.length
            ? L("★ 是默认模型。点一个模型可以设为默认、测试连接或删除。", "★ marks the default. Pick a model to make it default, test or remove it.")
            : L("还没有模型。点「+ 添加模型」，选一家厂商、粘贴密钥，就配好了。", "No model yet. + Add model, pick a vendor, paste the key.")],
          items: [
            ...models.map((item) => link(`${item.id === config.model ? "★" : " "} ${item.name}`, item.model, () => open("model", { id: item.id }), item.id === config.model ? C.ok : C.soft)),
            action(L("+ 添加模型", "+ Add model"), () => open("vendors", { filter: "" }), { primary: !models.length }),
            ...(config.model ? [action(L("测试默认模型", "Test the default model"), () => test(config.model))] : []),
          ],
        };
      },
    },

    model: {
      title: (data) => listModels(env).find((item) => item.id === data.id)?.name || data.id,
      build(data) {
        const entry = listModels(env).find((item) => item.id === data.id);
        if (!entry) return { intro: [L("这个模型已经删除了。", "This model was removed.")], items: [] };
        const isDefault = loadConfig(env).model === entry.id;
        return {
          intro: [`${entry.model} · ${entry.baseUrl}`],
          items: [
            action(isDefault ? L("★ 已是默认模型", "★ Default model") : L("设为默认", "Make default"), () => {
              if (isDefault) return;
              useModel(entry.id, env);
              onChange("model");
              say(L(`默认模型换成了 ${entry.name}。`, `Default model is now ${entry.name}.`), "ok");
            }),
            action(L("测试连接", "Test connection"), () => test(entry.id)),
            action(L("删除这个模型", "Remove this model"), () => {
              removeModel(entry.id, env);
              onChange("model");
              back();
              say(L(`已删除 ${entry.name}。`, `Removed ${entry.name}.`));
            }, { confirm: L("再按一次确认删除", "Press again to remove"), tone: C.bad }),
          ],
        };
      },
    },

    vendors: {
      title: () => L("选择厂商", "Pick a vendor"),
      build(data) {
        const intro = [L("直接打字筛选（比如 deep），回车或单击选中。国内常用 DeepSeek、通义千问、Kimi、智谱；自己电脑上跑的模型选「本地」。", "Type to filter (e.g. deep), Enter or click to pick. Models running on this computer: pick Local.")];
        const keys = {
          filter: data.filter,
          onText(value) {
            data.filter += value;
            return true;
          },
          onBackspace() {
            data.filter = [...data.filter].slice(0, -1).join("");
            return true;
          },
          onEscape() {
            if (!data.filter) return false;
            data.filter = "";
            return true;
          },
        };
        if (!presets) return { intro, items: [text(L("正在读取厂商列表…", "Loading vendors…"))], ...keys };
        const query = data.filter.trim().toLowerCase();
        const list = presets.filter((item) => !query || [item.id, item.name, item.vendor, item.model].some((value) => String(value || "").toLowerCase().includes(query)));
        return {
          intro,
          items: list.length
            ? list.map((item) => link(item.name, [item.vendor && item.vendor !== item.name ? item.vendor : "", item.model].filter(Boolean).join(" · "), () => open("modelForm", { preset: item })))
            : [text(L("没有匹配的厂商，按退格改一改。", "No match; Backspace to edit."), C.warn)],
          ...keys,
        };
      },
    },

    modelForm: {
      title: (data) => L(`添加 ${data.preset.name}`, `Add ${data.preset.name}`),
      enter(data) {
        Object.assign(data, { model: data.preset.model || "", baseUrl: data.preset.id === "custom" ? "" : data.preset.baseUrl || "", anthropic: data.preset.protocol === "anthropic", key: "", makeDefault: true });
      },
      build(data) {
        const preset = data.preset;
        const local = preset.id === "local" || preset.auth === "none";
        const intro = [];
        if (preset.detail) intro.push(preset.detail);
        if (preset.key?.url) intro.push(L(`去这里拿密钥：${preset.key.url}`, `Get a key at ${preset.key.url}`));
        if (preset.key?.steps?.length) intro.push(preset.key.steps.map((step, i) => `${i + 1}. ${step}`).join("   "));
        return {
          intro,
          items: [
            field(L("型号", "Model"), data, "model", { options: preset.models?.length ? preset.models : null, placeholder: L("模型名", "model name") }),
            ...(preset.id === "custom" ? [
              field(L("接口地址", "Base URL"), data, "baseUrl", { placeholder: "https://…/v1" }),
              toggle(L("Anthropic 协议", "Anthropic protocol"), data.anthropic, (on) => { data.anthropic = on; }),
            ] : []),
            field(L("密钥", "API key"), data, "key", { secret: true, placeholder: local ? L("本地模型可以不填", "optional for local models") : L("粘贴 API Key（只显示圆点）", "paste the API key (shown as dots)") }),
            toggle(L("设为默认模型", "Make default"), data.makeDefault, (on) => { data.makeDefault = on; }),
            gap,
            action(L("保存并测试", "Save and test"), () => saveModel(data), { primary: true }),
          ],
        };
      },
    },

    moa: {
      title: () => L("多模型会商 MoA", "Mixture of Agents"),
      enter(data) {
        const config = loadConfig(env);
        const moa = resolveMoa(config);
        Object.assign(data, {
          enabled: moa.preset ? moa.enabled : true,
          refs: new Set(moa.preset?.references || []),
          aggregator: moa.preset?.aggregator || config.model || null,
          fanout: moa.preset?.fanout || "user_turn",
        });
      },
      build(data) {
        const models = listModels(env);
        if (models.length < 2) {
          return {
            intro: [L("开会至少要两个模型：几个参考模型先出主意，一个聚合模型拍板干活。先再添加一个模型吧。", "MoA needs at least two models. Add another one first.")],
            items: [action(L("+ 添加模型", "+ Add model"), () => open("vendors", { filter: "" }), { primary: true })],
          };
        }
        const name = (item) => `${item.name} · ${item.model}`;
        return {
          intro: [L("参考模型先各自出主意（不动手），聚合模型取长补短后亲自干活。适合重要、复杂的事；开会要付会议费。", "References advise without tools; the aggregator combines their advice and does the work. Costs more.")],
          items: [
            toggle(L("开启 MoA", "MoA on"), data.enabled, (on) => { data.enabled = on; }),
            heading(L("参考模型（可多选）", "Reference models (several)")),
            ...models.map((item) => check(name(item), data.refs.has(item.id), () => {
              if (data.refs.has(item.id)) data.refs.delete(item.id);
              else data.refs.add(item.id);
            })),
            heading(L("聚合模型（选一个）", "Aggregator (one)")),
            ...models.map((item) => radio(name(item), data.aggregator === item.id, () => { data.aggregator = item.id; })),
            heading(L("多久开一次会", "How often to confer")),
            radio(L("每个用户回合一次（推荐，省钱）", "Once per user turn (recommended)"), data.fanout === "user_turn", () => { data.fanout = "user_turn"; }),
            radio(L("每一步都开（更周全，更贵）", "Every step (thorough, costly)"), data.fanout === "per_iteration", () => { data.fanout = "per_iteration"; }),
            gap,
            action(L("保存", "Save"), () => saveMoa(data), { primary: true }),
          ],
        };
      },
    },

    platforms: {
      title: () => L("聊天平台", "Chat apps"),
      build() {
        const done = new Set(configuredPlatforms(env).map((item) => item.name));
        return {
          intro: [L("点一个平台接入。飞书、企业微信、钉钉、个人微信可以扫码一键接入；其他平台按提示粘贴令牌。", "Pick an app. Feishu, WeCom, DingTalk and WeChat connect by scanning; the others take a token.")],
          items: [
            ...Object.keys(PLATFORM_LABELS).map((name) => link(plat(name), done.has(name) ? L("✓ 已接入", "✓ connected") : SCAN[name] ? L("扫码接入", "scan to connect") : L("粘贴令牌接入", "paste a token"), () => open("platform", { name }), done.has(name) ? C.ok : C.dim)),
            gap,
            link(L("后台网关", "Gateway"), L("接好后在这里启动", "start it here"), () => open("gateway"), C.accent),
          ],
        };
      },
    },

    platform: {
      title: (data) => plat(data.name),
      enter(data) {
        if (data.name === "slack") data.manifest = writeSlackManifest(env);
      },
      build(data) {
        const name = data.name;
        const isConnected = configuredPlatforms(env).some((item) => item.name === name);
        const intro = [];
        if (name === "weixin") intro.push(L("个人微信通过腾讯 iLink 扫码登录，扫码的微信号自动成为主人。", "Personal WeChat signs in by scanning (Tencent iLink); the scanning account becomes the owner."));
        else if (FORMS[name]) intro.push(FORMS[name].steps);
        if (data.manifest) intro.push(L(`Slack 应用清单已写到：${data.manifest}`, `Slack manifest written to ${data.manifest}`));
        if (name === "whatsapp" && isConnected) {
          const token = loadSecrets(env).platforms?.whatsapp?.verifyToken;
          if (token) intro.push(L(`Meta 后台 Webhooks 填：回调 https://<你的公网地址>/whatsapp/webhook，验证令牌 ${token}，订阅 messages。`, `Meta Webhooks: callback https://<public host>/whatsapp/webhook, verify token ${token}, subscribe to messages.`));
        }
        return {
          intro,
          items: [
            ...(SCAN[name] ? [action(L("扫码一键接入（推荐）", "Scan to connect (recommended)"), () => open("scan", { name }), { primary: true })] : []),
            ...(FORMS[name] ? [action(L("手动填写", "Enter by hand"), () => open("platformForm", { name }), { primary: !SCAN[name] })] : []),
            ...(isConnected ? [action(L("断开并移除", "Disconnect"), () => {
              removePlatform(env, name);
              onChange("platforms");
              say(L(`${plat(name)} 已移除。`, `${plat(name)} removed.`));
            }, { confirm: L("再按一次确认移除", "Press again to remove"), tone: C.bad })] : []),
          ],
        };
      },
    },

    scan: {
      title: (data) => L(`扫码接入 ${plat(data.name)}`, `Scan to connect ${plat(data.name)}`),
      enter: startScan,
      leave(data) {
        data.controller?.abort();
      },
      build(data, width, height) {
        const items = [];
        if (data.url) {
          const size = encodeQr(data.url).modules.length;
          const margin = (size + 4) / 2 + 3 <= height ? 2 : 1;
          const lines = qrLines(data.url, depth, margin);
          const indent = sp(" ".repeat(Math.max(0, Math.floor((width - spansWidth(lines[0])) / 2))));
          for (const line of lines) items.push({ kind: "raw", spans: [indent, ...line] });
        }
        const status = {
          starting: [L("正在获取二维码…", "Fetching the code…"), C.dim],
          waiting: [SCAN[data.name].hint, C.accent],
          scanned: [L("已扫码，请在手机上确认…", "Scanned; confirm on the phone…"), C.ok],
          expired: [L("二维码过期了，正在换一个…", "Code expired; getting a new one…"), C.warn],
          error: [L(`没有接上：${data.error}`, `Not connected: ${data.error}`), C.bad],
        }[data.status];
        items.push(text(status[0], status[1]));
        if (data.url) items.push(text(L(`扫不了就用手机打开：${data.url}`, `Can't scan? Open on your phone: ${data.url}`), C.faint));
        if (data.status === "error") items.push(action(L("重试", "Retry"), () => startScan(data), { primary: true }));
        return { intro: data.url ? [] : [SCAN[data.name].hint], items, compact: true };
      },
    },

    platformForm: {
      title: (data) => L(`填写 ${plat(data.name)}`, `${plat(data.name)} by hand`),
      enter(data) {
        data.values = Object.fromEntries(FORMS[data.name].fields.map((item) => [item.key, item.toggle ? false : item.initial || ""]));
      },
      build(data) {
        const form = FORMS[data.name];
        return {
          intro: [form.steps],
          items: [
            ...form.fields.map((item) => (item.toggle
              ? toggle(item.label, data.values[item.key], (on) => { data.values[item.key] = on; })
              : field(item.label, data.values, item.key, { secret: item.secret, placeholder: item.optional ? L("可以不填", "optional") : L("粘贴到这里", "paste here") }))),
            gap,
            action(L("保存", "Save"), () => savePlatformForm(data), { primary: true }),
          ],
        };
      },
    },

    gateway: {
      title: () => L("后台网关", "Gateway"),
      enter(data) {
        try {
          data.autostart = Boolean(services.autostart());
        } catch {
          data.autostart = false;
        }
      },
      build(data) {
        const names = configuredPlatforms(env).map((item) => item.name);
        const pid = services.gatewayPid();
        const pairing = createPairing({ env });
        const lists = pairing.list(names);
        const intro = [pid
          ? L(`● 运行中（进程 ${pid}）。聊天里发来的消息由它接收。`, `● Running (pid ${pid}); it receives chat messages.`)
          : L("○ 没有运行。启动后，Karmen 会在后台接收聊天消息。", "○ Stopped. Start it to receive chat messages in the background.")];
        if (!names.length) intro.push(L("还没接入聊天平台：先去接一个，再回来启动。", "No chat app connected yet: connect one first."));
        const items = [];
        if (!names.length) items.push(link(L("去接入聊天平台", "Connect a chat app"), "", () => open("platforms"), C.accent));
        else {
          items.push(action(pid ? L("停止网关", "Stop the gateway") : L("启动网关", "Start the gateway"), async () => {
            if (pid) {
              await services.stopGateway();
              say(L("网关已停止。", "Gateway stopped."));
              return;
            }
            say(L("正在启动…", "Starting…"));
            const started = await services.startGateway();
            say(started ? L(`网关已启动（进程 ${started}）。日志：${logFile(env)}`, `Gateway running (pid ${started}). Log: ${logFile(env)}`) : L(`网关没有起来，看看日志：${logFile(env)}`, `Gateway did not start; see ${logFile(env)}`), started ? "ok" : "bad");
          }, { primary: !pid }));
        }
        items.push(toggle(L("开机自动运行", "Start at login"), data.autostart, (on) => setAutostart(data, on)));
        items.push(heading(L("配对请求", "Pairing requests")));
        const pending = lists.flatMap((entry) => entry.pending.map((item) => ({ ...item, platform: entry.platform })));
        if (!pending.length) items.push(text(L("暂时没有。有人在聊天里找 Karmen 时，请求会出现在这里。", "None. Requests appear here when someone messages Karmen."), C.faint));
        for (const item of pending) {
          items.push(action(L(`批准 ${item.name || item.userId}（${plat(item.platform)}）· 配对码 ${item.code}`, `Approve ${item.name || item.userId} (${plat(item.platform)}) · ${item.code}`), () => {
            pairing.approve(item.platform, item.userId, item.name);
            say(L(`已批准 ${item.name || item.userId}，现在可以和 Karmen 聊天了。`, `Approved ${item.name || item.userId}.`), "ok");
          }));
        }
        items.push(heading(L("已授权的人", "Approved people")));
        const approved = lists.flatMap((entry) => Object.entries(entry.approved).map(([userId, value]) => ({ userId, name: value.name, platform: entry.platform })));
        if (!approved.length) items.push(text(L("还没有。", "None yet."), C.faint));
        for (const item of approved) {
          items.push(action(L(`撤销 ${item.name || item.userId}（${plat(item.platform)}）`, `Revoke ${item.name || item.userId} (${plat(item.platform)})`), () => {
            pairing.revoke(item.platform, item.userId);
            say(L(`已撤销 ${item.name || item.userId}。`, `Revoked ${item.name || item.userId}.`));
          }, { confirm: L("再按一次确认撤销", "Press again to revoke"), tone: C.bad }));
        }
        return { intro, items };
      },
    },

    prefs: {
      title: () => L("语言与显示", "Language & display"),
      build() {
        const items = [
          heading(L("语言", "Language")),
          radio("中文", prefs.lang() === "zh", () => prefs.setLang("zh")),
          radio("English", prefs.lang() === "en", () => prefs.setLang("en")),
        ];
        if (prefs.session) {
          items.push(
            heading(L("本次会话", "This session")),
            toggle(L("自动确认写文件和跑命令", "Auto-approve edits and commands"), prefs.autoYes(), (on) => prefs.setAutoYes(on)),
            toggle(L("显示侧栏", "Show the sidebar"), prefs.sidebar(), (on) => prefs.setSidebar(on)),
          );
        }
        return { intro: [L("自动确认只管写文件和跑命令；选择题和登录永远会问你。", "Auto-approve covers edits and commands only; choices and logins always ask.")], items };
      },
    },

    tutorial: {
      title: () => L("教程", "Tutorial"),
      enter(data) {
        data.os = data.os || currentSystem(platform);
      },
      build(data) {
        return {
          intro: [L("每个系统的命令和按键都不一样：先选系统，再点章节阅读。", "Commands and keys differ per system: pick one, then a chapter.")],
          items: [
            heading(L("按哪个系统讲", "System")),
            ...Object.entries(SYSTEMS).map(([id, system]) => radio(system.name, data.os === id, () => { data.os = id; })),
            heading(L("章节", "Chapters")),
            ...chaptersFor(data.os).map((chapter, index) => link(`${index + 1}. ${chapter.title}`, "", () => open("reader", { os: data.os, index }), C.dim)),
          ],
        };
      },
    },

    about: {
      title: () => L("官网与更新", "Official site"),
      build() {
        const intro = identityText(prefs.lang()).split("\n");
        return {
          intro,
          items: [
            action(L("在浏览器打开官网", "Open the official site"), () => openInBrowser(OFFICIAL.site), { primary: true }),
            action(L("打开更新页", "Open the updates page"), () => openInBrowser(OFFICIAL.updates)),
            action(L("检查更新", "Check for updates"), async () => {
              say(L("正在向官网查询…", "Asking the official site…"));
              const result = await checkUpdate({ env, fetchImpl });
              if (!result.ok) return say(L(`没有查到。请打开 ${OFFICIAL.updates}`, `No answer. Open ${OFFICIAL.updates}`), "warn");
              say(result.newer
                ? L(`官网有新版本 ${result.latest}（当前 ${VERSION}）。说明在 ${OFFICIAL.updates}`, `Version ${result.latest} is listed (this copy is ${VERSION}). Notes: ${OFFICIAL.updates}`)
                : L(`官网记录的就是当前版本 ${VERSION}。`, `The official site lists this version, ${VERSION}.`), result.newer ? "ok" : "info");
            }),
          ],
        };
      },
    },

    reader: {
      title: (data) => chaptersFor(data.os)[data.index].title,
      build(data, width) {
        const chapters = chaptersFor(data.os);
        return {
          intro: [],
          items: [],
          reader: renderMarkdown(chapterMarkdown(chapters[data.index], data.index), width),
          footer: L(`第 ${data.index + 1}/${chapters.length} 章 · ↑↓ 滚轮 滚动 · ←→ 上一章/下一章 · Esc 返回`, `Chapter ${data.index + 1}/${chapters.length} · ↑↓ wheel scroll · ←→ chapters · Esc back`),
        };
      },
    },
  };

  // ── rendering ────────────────────────────────────────────────────────────
  function build() {
    const page = top();
    const built = PAGES[page.id].build(page.data, lastWidth, bodyHeight);
    const selectable = built.items.map((item, i) => (isSelectable(item) ? i : -1)).filter((i) => i >= 0);
    if (!selectable.includes(page.index)) page.index = selectable.find((i) => i > page.index) ?? selectable[selectable.length - 1] ?? -1;
    return { ...built, selectable };
  }

  function renderItem(item, selected, width) {
    const st = (fg, extra = {}) => ({ fg, ...(selected ? { bg: C.selectBg } : {}), ...extra });
    const fill = selected ? { bg: C.selectBg } : null;
    const mark = sp(selected ? "❯ " : "  ", st(C.violet, { bold: true }));
    const row = (spans) => [fitSpans(spans, width, fill)];
    switch (item.kind) {
      case "text":
        return item.spans.length ? wrapSpans(item.spans, width, { hang: [sp("  ")] }) : [[]];
      case "raw":
        return [item.spans];
      case "link":
        return row([
          mark,
          ...(item.icon ? [sp(`${item.icon} `, st(item.tone === C.dim ? C.faint : item.tone, { bold: true }))] : []),
          sp(pad(item.label, item.detail ? LABEL : width - 5), st(selected ? C.text : C.accent, { bold: selected })),
          sp(truncate(item.detail || "", Math.max(0, width - LABEL - 7)), st(item.tone)),
          sp(" ›", st(C.faint)),
        ]);
      case "action": {
        const id = `${top().id}:${item.label}`;
        const label = armed === id ? item.confirm : item.label;
        const style = item.primary
          ? { fg: C.headerBg, bg: selected ? C.text : C.accent, bold: true }
          : st(armed === id ? C.warn : item.tone || (selected ? C.text : C.soft), { bold: selected });
        return row([mark, sp(item.primary || selected ? ` ${label} ` : `[ ${label} ]`, style)]);
      }
      case "toggle":
        return row([mark, sp(pad(item.label, LABEL + 8), st(C.text)), item.on ? sp(L(" ● 开 ", " ● on "), { fg: C.headerBg, bg: C.ok, bold: true }) : sp(L(" ○ 关 ", " ○ off "), { fg: C.soft, bg: C.border })]);
      case "radio":
        return row([mark, sp(item.on ? "◉ " : "○ ", st(item.on ? C.accent : C.faint, { bold: true })), sp(item.label, st(item.on ? C.text : C.soft))]);
      case "check":
        return row([mark, sp(item.on ? "[✓] " : "[ ] ", st(item.on ? C.ok : C.faint, { bold: true })), sp(item.label, st(item.on ? C.text : C.soft))]);
      case "field": {
        const room = Math.max(6, width - LABEL - 4 - (item.options ? 4 : 0));
        let shown = item.secret ? "•".repeat(Math.min([...item.value].length, room - 1)) : item.value;
        while (textWidth(shown) > room - 1) shown = [...shown].slice(1).join("");
        const box = { bg: selected ? [40, 46, 64] : C.codeBg };
        const content = item.value
          ? [sp(shown, { ...box, fg: C.text })]
          : [sp(truncate(item.placeholder || "", room - 1), { ...box, fg: C.faint })];
        const cursor = selected ? [sp("▏", { ...box, fg: C.accent, bold: true })] : [];
        return row([mark, sp(pad(item.label, LABEL), st(C.soft)), ...fitSpans([...content, ...cursor], room, box), sp(item.options ? " ‹›" : "", st(C.faint))]);
      }
      default:
        return [[]];
    }
  }

  function view({ cols, rows }) {
    if (!stack.length) return Array.from({ length: rows }, () => []);
    const page = top();
    const width = Math.max(24, Math.min(cols - 4, 96));
    const left = Math.max(0, Math.floor((cols - width) / 2));
    lastWidth = width;
    const noteLines = note ? wrapSpans([sp(note.text, { fg: { ok: C.ok, warn: C.warn, bad: C.bad }[note.tone] || C.accent, bold: true })], width).slice(0, 3) : [];
    bodyHeight = Math.max(3, rows - 4 - noteLines.length);
    const built = build();
    const def = PAGES[page.id];

    const lines = [];
    const head = [];
    head.push({ spans: gradient(def.title(page.data), { bold: true, from: 0.4 }) });
    for (const paragraph of built.intro) for (const line of wrapSpans([sp(paragraph, { fg: C.soft })], width)) head.push({ spans: line });
    if (built.filter !== undefined) head.push({ spans: [sp(L("筛选：", "Filter: "), { fg: C.dim }), sp(built.filter, { fg: C.text, bold: true }), sp("▏", { fg: C.accent, bold: true })] });
    head.push({ spans: [] });
    if (built.reader) for (const spans of built.reader) lines.push({ spans });
    const ringSize = width >= 88 && bodyHeight >= LOGO_LARGE / 2 + 4 ? LOGO_LARGE : LOGO;
    const hero = built.hero && depth !== "none" && width >= 72 && bodyHeight >= ringSize / 2 + 2;
    const itemWidth = hero ? width - ringSize - 3 : width;
    built.items.forEach((item, i) => {
      for (const spans of renderItem(item, i === page.index, itemWidth)) lines.push({ spans, hit: isSelectable(item) ? i : undefined });
    });

    // A QR code must be seen whole: on short screens drop everything around it.
    const bare = built.compact && head.length + lines.length > bodyHeight;
    const content = bare ? lines : [...head, ...lines];
    const height = bare ? rows - noteLines.length : bodyHeight;
    if (built.reader) {
      page.scroll = Math.max(0, Math.min(page.scroll, content.length - height));
    } else {
      const first = content.findIndex((line) => line.hit === page.index && page.index >= 0);
      const last = content.findLastIndex((line) => line.hit === page.index && page.index >= 0);
      if (first <= head.length || first < 0) page.scroll = Math.min(page.scroll, 0);
      if (first >= 0 && first < page.scroll) page.scroll = first;
      if (last >= page.scroll + height) page.scroll = last - height + 1;
      if (built.selectable[0] === page.index) page.scroll = 0;
      page.scroll = Math.max(0, Math.min(page.scroll, Math.max(0, content.length - height)));
    }
    const indent = sp(" ".repeat(left));
    const out = [];
    hits = [];
    if (!bare) {
      const crumbs = stack.map((entry) => PAGES[entry.id].title(entry.data)).join(" › ");
      const chip = stack.length > 1 ? L(" ‹ 返回  Esc ", " ‹ Back  Esc ") : L(" ✕ 关闭  Esc ", " ✕ Close  Esc ");
      const band = { bg: C.headerBg };
      const leftPart = [sp(" ", band), ...gradient("◆ KARMEN", { bold: true }).map((item) => ({ ...item, style: { ...item.style, bg: C.headerBg } })), sp(`  ${L("设置", "Settings")}  `, { fg: C.dim, bg: C.headerBg })];
      const chipWidth = textWidth(chip);
      const crumbRoom = Math.max(0, cols - spansWidth(leftPart) - chipWidth - 1);
      out.push([...fitSpans([...leftPart, sp(truncate(crumbs, crumbRoom), { fg: C.soft, bg: C.headerBg })], cols - chipWidth - 1, band), sp(chip, { fg: C.headerBg, bg: C.accent, bold: true }), sp(" ", band)]);
      hits[0] = { back: true, x0: cols - chipWidth - 1, x1: cols - 1 };
      const bar = [];
      for (let x = 0; x < cols; x += 1) bar.push(sp("━", { fg: spectrum(0.15 + 0.7 * (x / Math.max(1, cols - 1))) }));
      out.push(bar);
    }
    const visible = content.slice(page.scroll, page.scroll + height);
    for (let y = 0; y < height; y += 1) {
      const line = visible[y];
      if (line?.hit !== undefined) hits[out.length] = { item: line.hit };
      out.push(line ? [indent, ...line.spans] : []);
    }
    // The glass ring beside the home menu when there is room for it.
    if (hero && !bare) {
      const ring = logoSpans({ size: ringSize, depth });
      const x = left + width - ringSize - 1;
      const y = 2 + head.length - page.scroll;
      ring.forEach((line, i) => {
        if (y + i >= 2 && y + i < 2 + height) out[y + i] = overlaySpans(out[y + i], x, line, cols);
      });
    }
    for (const line of noteLines) out.push([indent, ...line]);
    if (!bare) {
      const item = built.items[page.index];
      const keys = built.footer || (item?.kind === "field"
        ? L(`直接打字或粘贴 · 退格删除 · Ctrl+U 清空 · 回车下一项${item.options ? " · ←→ 换型号" : ""} · Esc 返回`, `Type or paste · Backspace · Ctrl+U clear · Enter next${item.options ? " · ←→ other models" : ""} · Esc back`)
        : L("↑↓ 选择 · 回车/空格 确定 · Esc 返回 · 鼠标单击选择、滚轮翻动", "↑↓ move · Enter/Space choose · Esc back · click to choose, wheel to scroll"));
      const more = content.length > page.scroll + height ? L("  ↓ 下面还有", "  ↓ more") : "";
      out.push([indent, sp(truncate(keys, width - textWidth(more)), { fg: C.faint }), sp(more, { fg: C.accent })]);
    }
    while (out.length < rows) out.push([]);
    return out.slice(0, rows);
  }

  // ── input ────────────────────────────────────────────────────────────────
  function move(page, built, delta) {
    const list = built.selectable;
    if (!list.length) return;
    const at = Math.max(0, list.indexOf(page.index));
    const next = list[Math.max(0, Math.min(list.length - 1, at + delta))];
    if (next !== page.index) armed = null;
    page.index = next;
  }

  function activate(page, built, index) {
    const item = built.items[index];
    if (!isSelectable(item)) return;
    if (item.kind === "field") {
      move(page, built, 1);
      return;
    }
    const id = `${page.id}:${item.label}`;
    if (item.confirm && armed !== id) {
      armed = id;
      say(item.confirm, "warn");
      return;
    }
    armed = null;
    try {
      const result = item.run();
      if (result?.then) result.catch((error) => say(failure(error), "bad")).finally(schedule);
    } catch (error) {
      say(failure(error), "bad");
    }
  }

  function editField(page, built, item, key) {
    if (key.name === "text" || key.name === "paste") item.set(item.value + clean(key.text));
    else if (key.name === "backspace") item.set([...item.value].slice(0, -1).join(""));
    else if (key.ctrl && key.name === "u") item.set("");
    else if ((key.name === "left" || key.name === "right") && item.options) {
      const at = item.options.indexOf(item.value);
      const step = key.name === "right" ? 1 : -1;
      item.set(item.options[(Math.max(at, step > 0 ? -1 : 0) + step + item.options.length) % item.options.length]);
    } else if (key.name === "enter") move(page, built, 1);
    else return false;
    return true;
  }

  function readerKey(page, key) {
    const chapters = chaptersFor(page.data.os);
    const step = Math.max(1, bodyHeight - 2);
    if (key.name === "up") page.scroll -= 1;
    else if (key.name === "down") page.scroll += 1;
    else if (key.name === "pageup") page.scroll -= step;
    else if (key.name === "pagedown" || (key.name === "text" && key.text === " ")) page.scroll += step;
    else if (key.name === "home") page.scroll = 0;
    else if (key.name === "end") page.scroll = Number.MAX_SAFE_INTEGER;
    else if (key.name === "mouse" && key.action === "wheel") page.scroll += key.button === "down" ? 3 : -3;
    else if ((key.name === "left" || key.name === "right" || key.name === "enter") && chapters.length) {
      const next = page.data.index + (key.name === "left" ? -1 : 1);
      if (next >= 0 && next < chapters.length) {
        page.data.index = next;
        page.scroll = 0;
      }
    } else if (key.name === "escape") back();
    page.scroll = Math.max(0, page.scroll);
  }

  function mouse(page, built, event) {
    if (event.action === "wheel") {
      move(page, built, event.button === "down" ? 1 : -1);
      return;
    }
    if (event.action !== "press" || event.button !== "left") return;
    const hit = hits[event.y];
    if (!hit) return;
    if (hit.back) {
      if (event.x >= hit.x0 && event.x < hit.x1) back();
      return;
    }
    if (page.index !== hit.item) armed = null;
    page.index = hit.item;
    if (built.items[hit.item].kind !== "field") activate(page, built, hit.item);
  }

  function key(event) {
    const page = top();
    if (!page) return;
    const built = build();
    if (built.reader) {
      if (event.name === "mouse" && event.action === "press" && hits[event.y]?.back) mouse(page, built, event);
      else readerKey(page, event);
    } else if (event.name === "mouse") mouse(page, built, event);
    else {
      const item = built.items[page.index];
      if (item?.kind === "field" && editField(page, built, item, event)) {
        // handled by the field
      } else if (event.name === "escape") {
        if (built.onEscape?.()) page.index = -1;
        else back();
      } else if (event.name === "up" || event.name === "backtab") move(page, built, -1);
      else if (event.name === "down" || event.name === "tab") move(page, built, 1);
      else if (event.name === "pageup") move(page, built, -8);
      else if (event.name === "pagedown") move(page, built, 8);
      else if (event.name === "home") move(page, built, -Infinity);
      else if (event.name === "end") move(page, built, Infinity);
      else if (event.name === "enter" || (event.name === "text" && event.text === " ")) activate(page, built, page.index);
      else if ((event.name === "left" || event.name === "right") && item?.kind === "toggle") {
        if ((event.name === "right") !== item.on) activate(page, built, page.index);
      } else if ((event.name === "text" || event.name === "paste") && built.onText?.(clean(event.text))) page.index = -1;
      else if (event.name === "backspace" && built.onBackspace?.()) page.index = -1;
    }
    schedule();
  }

  return {
    open,
    key,
    view,
    close,
    get page() {
      return top()?.id || null;
    },
    get note() {
      return note;
    },
  };
}
