const SECRET_KEYS = new Set(["cloudflare_api_token", "cloudflare_account_id", "tmdb_api_key"]);
const PROVIDER_KEYS = new Set(["tool_provider_id", "judge_provider_id"]);

const MODE_LABELS = {
  llm: "LLM 判断", decision: "AstrBot 判断提供商", cloudflare: "Cloudflare clef",
  always: "总是调用工具", never: "从不调用工具",
};
const ROUTE_LABELS = {
  anime: "动画/番剧", anime_update: "动画更新时间", manga: "漫画/轻小说",
  movie: "影视", weather: "天气", crypto: "加密货币",
};
const CATALOG_STATUS = {
  ok: ["可用", "on"], ok_proxy: ["代理可用", "on"], key: ["需 Key", "warn"],
  unstable: ["不稳定", "warn"], blocked: ["不可用", "off"],
};
const CATALOG_SAMPLES = {
  "关键词": "Frieren", "条目标题": "北京", "词语": "hello", "文本": "hello",
  "城市": "Beijing", "地名": "Beijing", "省": "北京市", "市": "北京市",
  "ID": "400602", "纬度": "39.9", "经度": "116.4", "时区": "Asia/Shanghai",
  "年份": "2026", "国家代码": "CN", "国家": "china", "邮编": "90210",
  "单词": "hello", "包名": "requests", "crate": "serde", "镜像": "nginx",
  "formula": "nginx", "表达式": "2%2B3*4", "菜名": "Arrabiata",
  "owner": "AstrBotDevs", "repo": "AstrBot", "IP": "8.8.8.8",
  "KEY": "TEST", "查询": "spring",
};

// 快速上手：五个步骤，按使用顺序拆开，每步只放真正需要用户决定的几项。
// 步骤里出现的配置项不会再出现在「基础设置 / 高级设置」里，避免同一个值有两个入口。
const GUIDE_STEPS = [
  {
    id: "model",
    index: 1,
    title: "选一个「能调工具」的模型",
    why: "工具桥需要另一个模型替你去查接口，它必须支持函数调用（tool call）。",
    hint: "运行概览页是同一个下拉框，两边会自动同步。填完点「保存这一步」即可。",
    fields: [
      { key: "tool_provider_id", id: "guide-tool-provider", label: "工具模型（必填）" },
    ],
    status: (values) => (values.tool_provider_id
      ? { ok: true, text: "已选好工具模型" }
      : { ok: false, text: "还没选工具模型" }),
  },
  {
    id: "judge",
    index: 2,
    title: "决定「什么时候」才动用工具",
    why: "闲聊不该花钱跑接口，只有真的要查资料的消息才启动工具桥。",
    hint: "先用「LLM 判断」最省心。其余三项按需微调，不确定就保持默认。",
    dynamicHint: (values) => {
      if (values.judge_mode === "always") return "当前每轮都会调用工具，判断模型、阈值和失败策略都不会参与，相关输入已禁用。";
      if (values.judge_mode === "never") return "当前已关闭查询，判断模型、阈值和失败策略都不会参与，相关输入已禁用。";
      if (values.judge_mode === "cloudflare") return "Cloudflare 判断先看第 3 步凭据；这里保留超时和失败兜底。判断模型只作 Cloudflare 失败后的备用。";
      if (values.judge_mode === "decision") return "判断阈值在第 3 步；填了判断模型就直接用它，留空才用 AstrBot 判断提供商。";
      return "判断模型可留空并复用第 1 步的工具模型；超时和失败策略决定闲聊判断的费用与稳定性。";
    },
    fields: [
      { key: "judge_mode", id: "guide-judge-mode", label: "判断方式" },
      { key: "judge_provider_id", id: "guide-judge-provider", label: "判断模型（可留空）" },
      { key: "judge_timeout", id: "guide-judge-timeout", label: "最多等几秒" },
      { key: "judge_error_policy", id: "guide-judge-error-policy", label: "判断失败怎么办" },
    ],
    status: (values) => (values.judge_mode
      ? { ok: true, text: `判断方式：${MODE_LABELS[values.judge_mode] || values.judge_mode}` }
      : { ok: false, text: "还没选判断方式" }),
  },
  {
    id: "cloudflare",
    index: 3,
    title: "用 Cloudflare 判断就填凭据",
    why: "把「要不要用工具」交给 Cloudflare 的 clef 模型判断，需要账户 ID 和 API 令牌。",
    dynamicHint: (values) => (values.judge_mode === "cloudflare"
      ? "第 2 步选了 Cloudflare，这一步必须填完：账户 ID 和 API 令牌缺一个都保存不了。令牌只发往 Cloudflare 官方接口，不会写进插件日志。"
      : "第 2 步不是 Cloudflare，这一步可以先跳过；以后改用 Cloudflare 判断，再回来填就行。"),
    fields: [
      { key: "cloudflare_account_id", id: "guide-cf-account", label: "Cloudflare 账户 ID" },
      { key: "cloudflare_api_token", id: "guide-cf-token", label: "Cloudflare API 令牌" },
      { key: "cloudflare_decision_model", id: "guide-cf-model", label: "决策模型" },
      { key: "judge_threshold", id: "guide-judge-threshold", label: "判断阈值" },
    ],
    status: (values) => {
      if (values.judge_mode !== "cloudflare") return { ok: true, text: "当前模式用不到，先跳过" };
      if (values.cloudflare_account_id && values.cloudflare_api_token) return { ok: true, text: "Cloudflare 凭据已填" };
      return { ok: false, text: "还差账户 ID 或 API 令牌" };
    },
  },
  {
    id: "network",
    index: 4,
    title: "网络与取数方式",
    why: "抓不到网页或老绕弯路，答案就会慢，甚至查不准。",
    hint: "四项都可以保持默认，只有遇到「抓不到网页」或「绕太多弯路」时再改。",
    fields: [
      { key: "http_tool_proxy", id: "guide-http-proxy", label: "HTTP 代理（可留空）" },
      { key: "url_auto_fetch", id: "guide-url-auto-fetch", label: "自动抓取消息里的链接" },
      { key: "url_auto_fetch_max", id: "guide-url-auto-fetch-max", label: "单条消息最多抓几个链接" },
      { key: "force_route", id: "guide-force-route", label: "按类别直达接口" },
    ],
    status: (values) => (values.url_auto_fetch_max >= 1
      ? { ok: true, text: "抓取与路由已就绪" }
      : { ok: false, text: "链接抓取上限至少是 1" }),
  },
  {
    id: "limits",
    index: 5,
    title: "限制用量（省钱、防超时）",
    why: "工具桥每轮都要跑模型，不设上限容易又慢又贵。",
    hint: "默认 6 轮、注入 6000 字、整轮 120 秒，通常不用改。",
    fields: [
      { key: "max_steps", id: "guide-max-steps", label: "工具模型最多跑几轮" },
      { key: "max_inject_chars", id: "guide-max-inject-chars", label: "注入给对话模型的字数上限" },
      { key: "workflow_timeout", id: "guide-workflow-timeout", label: "整轮最多用几秒" },
    ],
    status: (values) => (
      values.max_steps >= 1 && values.max_inject_chars >= 1 && values.workflow_timeout >= 5
        ? { ok: true, text: "用量限制已就绪" }
        : { ok: false, text: "轮数 / 字数 / 超时需要是有效数字" }),
  },
];

const GUIDE_KEYS = GUIDE_STEPS.flatMap((step) => step.fields.map((field) => field.key));

// 基础设置：日常开关，不在向导里出现，避免同一个值有两个入口。
const BASIC_KEYS = [
  "enabled", "hide_tools_from_main_model", "tool_prompt_keep_list", "min_prompt_chars",
];

// 高级设置：剩余的进阶参数，按主题分组。
const GROUPS = [
  { title: "提示词与注入", keys: ["judge_system_prompt", "tool_system_prompt", "inject_header", "strip_prompt_patterns"] },
  { title: "抓取与数据源", keys: ["tmdb_api_key", "http_tool_timeout", "http_tool_max_chars", "tool_site_hints_enabled", "api_catalog_enabled", "tool_site_hints_direct", "tool_site_hints_proxy"] },
  { title: "执行限制", keys: ["tool_call_timeout", "max_concurrent", "max_context_messages", "max_context_chars", "max_tool_result_chars"] },
  { title: "筛选与工具权限", keys: ["force_regex", "skip_regex", "tool_allowlist", "tool_denylist"] },
  { title: "日志", keys: ["verbose_log"] },
];

const bridge = window.AstrBotPluginView;
const $ = (id) => document.getElementById(id);
const busy = new Set();
const controlsByKey = new Map();
const originalValues = new Map();
const dirtyKeys = new Set();
const editedControls = new Map();

let statusData = null;
let schemaItems = {};
let configValues = {};
let providers = null;
let toolChoices = [];
let configLoaded = false;
let refreshing = false;
let catalogItems = [];
let catalogVerifiedAt = "";
let catalogFilter = "ok";
let catalogPingResults = new Map();
let catalogPinging = false;

// 主题：控制台固定默认浅色；用户手动切到深色后以本地选择为准。
const THEME_KEY = "tool-bridge-console-theme";

function isLightTheme() {
  return document.documentElement.dataset.tbTheme !== "dark";
}

function isDarkTheme() {
  return document.documentElement.dataset.tbTheme === "dark";
}

function applyTheme(theme, { persist = false } = {}) {
  const root = document.documentElement;
  const nextTheme = theme === "dark" ? "dark" : "light";
  root.dataset.tbTheme = nextTheme;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      // 隐私模式下 localStorage 不可用，忽略即可。
    }
  }
  const toggle = $("theme-toggle");
  if (toggle) {
    toggle.title = isDarkTheme() ? "切换到浅色" : "切换到深色";
    toggle.setAttribute("aria-label", toggle.title);
  }
}

function initTheme() {
  let stored = "";
  try {
    stored = localStorage.getItem(THEME_KEY) || "";
  } catch (error) {
    stored = "";
  }
  applyTheme(stored === "light" || stored === "dark" ? stored : null);
}

initTheme();

$("theme-toggle").addEventListener("click", () => {
  applyTheme(isDarkTheme() ? "light" : "dark", { persist: true });
});

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showMessage(text = "", kind = "error") {
  const element = $("message");
  element.textContent = text;
  element.className = `message${text && kind !== "error" ? ` ${kind}` : ""}`;
}

function setResult(id, text, failed = false) {
  const element = $(id);
  element.textContent = text;
  element.classList.toggle("error", failed);
}

function providerLabel(id) {
  if (!id) return "未配置";
  const provider = Array.isArray(providers) ? providers.find((item) => item.id === id) : null;
  return provider?.model ? `${provider.model} · ${id}` : id;
}

function renderStatus(data) {
  statusData = data;
  const effective = Boolean(data.effective_enabled);
  const configured = configValues.enabled !== false;
  $("status-badge").textContent = effective ? "运行中" : "已关闭";
  $("status-badge").className = `badge ${effective ? "on" : "off"}`;
  $("toggle").textContent = effective ? "关闭工具桥" : "开启工具桥";
  $("toggle").disabled = busy.has("toggle");

  if (effective) {
    setText("runtime-explanation", "配置与运行开关均已启用，正在按接口优先流程处理请求。");
  } else if (!configured && data.runtime_enabled) {
    setText("runtime-explanation", "运行开关已开，但配置总开关为关；点击开启会同时启用两者。");
  } else if (!configured) {
    setText("runtime-explanation", "配置总开关已关闭。开启时会同时启用配置和运行开关。");
  } else {
    setText("runtime-explanation", "运行开关已关闭，配置总开关仍保持启用。");
  }

  setText("bridge-version", data.version || "—");
  setText("retrieval-policy", data.retrieval_policy === "api_first" ? "接口 → 不足才搜索" : "旧版流程");
  const decisionMode = MODE_LABELS[data.judge_mode] || data.judge_mode || "—";
  const decisionNote = data.judge_mode === "always" ? "当前设置每轮取数，不会跳过闲聊"
    : data.judge_mode === "never" ? "当前设置关闭查询"
    : "无需工具时跳过取数，明确查询先查接口";
  setText("judge-policy", data.judge_gates_retrieval
    ? `需求决策：${decisionMode} · ${decisionNote}`
    : "当前版本每轮检查接口，需求决策未参与正常对话");
  const providerText = providerLabel(data.tool_provider_id || configValues.tool_provider_id);
  setText("tool-provider", providerText);
  $("tool-provider").title = providerText;
  setText("tool-count", String(data.active_tool_count ?? 0));
  setText("http-proxy", data.http_proxy_configured ? "已配置" : "直连");
  const stats = data.stats || {};
  for (const [id, key] of [
    ["stat-requests", "requests"], ["stat-api", "api_phases"],
    ["stat-fallbacks", "search_fallbacks"], ["stat-errors", "errors"],
  ]) setText(id, String(stats[key] ?? 0));
}

function renderEvents(items) {
  const list = $("events");
  list.replaceChildren();
  if (!items.length) {
    const item = document.createElement("li");
    item.className = "subtle";
    item.textContent = "暂无事件";
    list.appendChild(item);
    return;
  }
  for (const event of [...items].reverse()) {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = event.kind || "plugin";
    const date = event.time ? new Date(event.time) : null;
    const time = date && !Number.isNaN(date.getTime())
      ? date.toLocaleString("zh-CN", { hour12: false })
      : String(event.time || "").replace("T", " ").slice(0, 19);
    const elapsed = event.elapsed_ms == null ? "" : ` · ${event.elapsed_ms} ms`;
    meta.append(tag, document.createTextNode(`${time}${elapsed}`));
    const body = document.createElement("div");
    body.className = `event-body${event.level === "error" ? " error" : event.level === "warning" ? " warning" : ""}`;
    body.textContent = event.message || "";
    item.append(meta, body);
    list.appendChild(item);
  }
}

async function refresh({ silent = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  $("refresh").disabled = true;
  try {
    const [nextStatus, logs] = await Promise.all([
      bridge.apiGet("status"), bridge.apiGet("logs", { limit: 60 }),
    ]);
    renderStatus(nextStatus);
    renderEvents(logs.items || []);
    if (!silent) showMessage();
  } catch (error) {
    if (!silent) showMessage(`刷新失败：${error.message}，请稍后重试。`);
  } finally {
    refreshing = false;
    $("refresh").disabled = false;
  }
}

function switchView(name, focusHeading = false) {
  for (const page of document.querySelectorAll("[data-page]")) {
    page.hidden = page.dataset.page !== name;
  }
  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (focusHeading) {
    $(`${name}-title`)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => switchView(button.dataset.view, true));
}

function focusStep(id) {
  switchView("guide");
  const card = $(`guide-step-${id}`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  card.classList.add("is-focus");
  window.setTimeout(() => card.classList.remove("is-focus"), 1800);
}

async function withBusy(key, button, busyLabel, task) {
  if (busy.has(key)) return;
  busy.add(key);
  const previousLabel = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (busyLabel) button.textContent = busyLabel;
  try {
    return await task();
  } finally {
    busy.delete(key);
    button.removeAttribute("aria-busy");
    button.textContent = previousLabel;
    button.disabled = false;
    updateDirtyUI();
    if (key === "toggle" && statusData) renderStatus(statusData);
  }
}

function valuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  }
  return left === right;
}

function readControl(control) {
  const kind = control.dataset.kind;
  if (kind === "bool") return control.checked;
  if (kind === "int" || kind === "float") return control.value === "" ? "" : Number(control.value);
  if (kind === "list") return control.value.split("\n").map((item) => item.trim()).filter(Boolean);
  return control.value;
}

function writeControl(control, value) {
  if (control.dataset.kind === "bool") control.checked = Boolean(value);
  else if (control.dataset.kind === "list") control.value = Array.isArray(value) ? value.join("\n") : (value || "");
  else control.value = value ?? "";
}

function registerControl(control, key, meta, value, ariaLabel = "") {
  control.dataset.key = key;
  control.dataset.kind = meta.type || "string";
  control.setAttribute("aria-label", ariaLabel || meta.description || key);
  if (!controlsByKey.has(key)) controlsByKey.set(key, new Set());
  controlsByKey.get(key).add(control);
  originalValues.set(key, SECRET_KEYS.has(key) ? "" : value);
  writeControl(control, SECRET_KEYS.has(key) ? "" : value);
}

function makeProviderControl(key, meta, value, id) {
  const available = Array.isArray(providers) && providers.length > 0;
  const control = document.createElement(available ? "select" : "input");
  control.id = id;
  if (!available) {
    control.type = "text";
    control.placeholder = "输入 Provider ID";
    control.autocomplete = "off";
    return control;
  }
  const emptyLabel = key === "tool_provider_id" ? "跟随当前对话模型（不推荐）" : "复用工具模型";
  control.appendChild(new Option(emptyLabel, ""));
  const knownIds = new Set();
  for (const provider of providers) {
    if (!provider || !provider.id || knownIds.has(provider.id)) continue;
    knownIds.add(provider.id);
    const model = provider.model || "未命名模型";
    control.appendChild(new Option(`${model} · ${provider.id}`, provider.id));
  }
  if (value && !knownIds.has(value)) {
    control.appendChild(new Option(`当前配置：${value}（未加载）`, value));
  }
  return control;
}

function fieldControl(key, meta, value, id = `cfg-${key}`, labelText = "", hintText = "") {
  const wrap = document.createElement("div");
  const secret = SECRET_KEYS.has(key);
  const wide = meta.type === "text" || meta.type === "list";
  wrap.className = `field${meta.type === "bool" ? " row" : ""}${wide ? " wide" : ""}`;
  const label = document.createElement("label");
  label.textContent = labelText || meta.description || key;
  label.htmlFor = id;

  let control;
  if (PROVIDER_KEYS.has(key)) {
    control = makeProviderControl(key, meta, value, id);
  } else if (meta.type === "bool") {
    control = document.createElement("input");
    control.type = "checkbox";
    control.id = id;
  } else if (Array.isArray(meta.options) && meta.options.length) {
    control = document.createElement("select");
    control.id = id;
    meta.options.forEach((option, index) => {
      control.appendChild(new Option((meta.labels && meta.labels[index]) || option, option));
    });
  } else if (meta.type === "int" || meta.type === "float") {
    control = document.createElement("input");
    control.type = "number";
    control.step = meta.type === "float" ? "0.01" : "1";
    control.id = id;
  } else if (meta.type === "list" || meta.type === "text") {
    control = document.createElement("textarea");
    control.id = id;
    if (meta.type === "list") control.placeholder = "每行一项";
  } else {
    control = document.createElement("input");
    control.type = secret ? "password" : "text";
    control.id = id;
    if (secret) {
      control.autocomplete = "new-password";
      control.placeholder = configValues[`${key}_configured`] ? "已配置，留空保持" : "未配置，留空保持";
    }
  }
  registerControl(control, key, meta, value, labelText || meta.description || key);
  wrap.append(label, control);
  const hintBody = hintText || meta.hint;
  if (hintBody) {
    const hintNode = document.createElement("p");
    hintNode.className = "desc";
    hintNode.textContent = hintBody;
    wrap.appendChild(hintNode);
  }
  const conditionEnabled = conditionMatches(meta);
  control.disabled = !conditionEnabled;
  wrap.classList.toggle("is-disabled", !conditionEnabled);
  return wrap;
}

function conditionMatches(meta) {
  const condition = meta?.condition;
  if (!condition) return true;
  return Object.entries(condition).every(([key, expected]) => {
    const value = liveValue(key);
    return Array.isArray(expected) ? expected.includes(value) : value === expected;
  });
}

function syncConditionalControls() {
  for (const [key, controls] of controlsByKey) {
    const meta = schemaItems[key];
    if (!meta) continue;
    const enabled = key === "tool_prompt_keep_list"
      ? liveValue("hide_tools_from_main_model") !== false
      : conditionMatches(meta);
    for (const control of controls) {
      control.disabled = !enabled;
      control.closest(".field")?.classList.toggle("is-disabled", !enabled);
    }
  }
  renderKeepToolChips();
}

function keyIsEnabled(key) {
  return [...(controlsByKey.get(key) || [])].every((control) => !control.disabled);
}

// 基础/高级设置里保留「第 N 步」前缀；向导里步骤标题已经写明，去掉避免重复。
function stripStepPrefix(text) {
  return String(text || "").replace(/^第\s*\d+\s*步[:：]?\s*/, "");
}

// ------------------------------------------------------------------ //
// 快速上手向导
// ------------------------------------------------------------------ //

function liveValue(key) {
  const control = [...(controlsByKey.get(key) || [])][0];
  if (!control) return configValues[key];
  return readControl(control);
}

function secretReady(key) {
  const control = [...(controlsByKey.get(key) || [])][0];
  if (control && String(readControl(control) ?? "").trim()) return true;
  return Boolean(configValues[`${key}_configured`]);
}

function guideValues() {
  return {
    tool_provider_id: liveValue("tool_provider_id"),
    judge_mode: liveValue("judge_mode"),
    cloudflare_account_id: secretReady("cloudflare_account_id"),
    cloudflare_api_token: secretReady("cloudflare_api_token"),
    url_auto_fetch_max: Number(liveValue("url_auto_fetch_max")) || 0,
    max_steps: Number(liveValue("max_steps")) || 0,
    max_inject_chars: Number(liveValue("max_inject_chars")) || 0,
    workflow_timeout: Number(liveValue("workflow_timeout")) || 0,
  };
}

function stepDirty(step) {
  return step.fields.some((field) => dirtyKeys.has(field.key));
}

function updateGuideState() {
  const values = guideValues();
  let done = 0;
  let pending = null;
  for (const step of GUIDE_STEPS) {
    const card = $(`guide-step-${step.id}`);
    if (!card) continue;
    const status = step.status(values);
    const badge = card.querySelector(".guide-step-status");
    const dirty = stepDirty(step);
    if (badge) {
      badge.textContent = dirty ? `${status.text} · 未保存` : status.text;
      badge.classList.toggle("ok", Boolean(status.ok) && !dirty);
    }
    card.classList.toggle("is-done", Boolean(status.ok));
    card.classList.toggle("is-dirty", dirty);
    const hint = card.querySelector(".guide-step-hint");
    if (hint) hint.textContent = step.dynamicHint ? step.dynamicHint(values) : step.hint;
    // 有未保存改动时不算完成：进度条要提示「还没存」。
    if (status.ok && !dirty) done += 1;
    else if (!pending) pending = { ...step, dirty };
  }

  const total = GUIDE_STEPS.length;
  setText("guide-progress-text", `已完成 ${done} / ${total} 步`);
  const bar = $("guide-progress-bar");
  if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
  setText(
    "guide-progress-note",
    pending
      ? (pending.dirty
        ? `还有改动没保存：第 ${pending.index} 步 · ${pending.title}`
        : `下一步：第 ${pending.index} 步 · ${pending.title}`)
      : "五步都就绪了，去「运行概览」打开总开关即可。",
  );

  const callout = $("home-callout");
  if (!callout) return;
  if (pending) {
    callout.hidden = false;
    setText(
      "home-callout-title",
      pending.dirty
        ? `第 ${pending.index} 步有改动还没保存：${pending.title}`
        : `还差 ${total - done} 步：第 ${pending.index} 步 · ${pending.title}`,
    );
    setText(
      "home-callout-text",
      pending.dirty
        ? `改完记得点「保存这一步」，否则重启后会丢失。（当前进度 ${done}/${total} 步）`
        : `${pending.why}（当前进度 ${done}/${total} 步）`,
    );
  } else {
    callout.hidden = true;
  }
}

function renderGuide() {
  const container = $("guide-steps");
  if (!container) return;
  container.replaceChildren();
  for (const step of GUIDE_STEPS) {
    const card = document.createElement("section");
    card.className = "guide-step";
    card.id = `guide-step-${step.id}`;
    card.dataset.step = step.id;

    const head = document.createElement("div");
    head.className = "guide-step-head";
    const index = document.createElement("div");
    index.className = "guide-step-index";
    index.textContent = String(step.index);
    const titleBox = document.createElement("div");
    titleBox.className = "guide-step-title";
    const heading = document.createElement("h3");
    heading.textContent = step.title;
    const why = document.createElement("p");
    why.className = "guide-step-why";
    why.textContent = step.why;
    titleBox.append(heading, why);
    const badge = document.createElement("span");
    badge.className = "guide-step-status";
    head.append(index, titleBox, badge);

    const body = document.createElement("div");
    body.className = "guide-step-body";
    const fields = document.createElement("div");
    fields.className = "guide-step-fields";
    for (const field of step.fields) {
      const meta = schemaItems[field.key];
      if (!meta) continue;
      fields.appendChild(fieldControl(
        field.key, meta, configValues[field.key], field.id, field.label, stripStepPrefix(meta.hint),
      ));
    }
    body.appendChild(fields);
    const hint = document.createElement("p");
    hint.className = "guide-step-hint";
    hint.textContent = step.hint;
    body.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "guide-step-actions";
    const hintRow = document.createElement("span");
    hintRow.className = "guide-step-hintrow subtle";
    hintRow.textContent = "改动点「保存这一步」才会生效";
    const buttons = document.createElement("div");
    buttons.className = "guide-step-buttons";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "button secondary";
    saveButton.dataset.stepSave = step.id;
    saveButton.textContent = "保存这一步";
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "button ghost";
    nextButton.dataset.stepNext = step.id;
    nextButton.textContent = "下一步 →";
    buttons.append(saveButton, nextButton);
    actions.append(hintRow, buttons);

    card.append(head, body, actions);
    container.appendChild(card);
  }
}

function renderGuideLinks() {
  const box = $("advanced-guide-links");
  if (!box) return;
  box.replaceChildren();
  for (const step of GUIDE_STEPS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button ghost compact";
    button.dataset.gotoStep = step.id;
    button.textContent = `第 ${step.index} 步 · ${step.title}`;
    box.appendChild(button);
  }
}

function renderKeepToolChips() {
  const control = document.querySelector('#basic-settings [data-key="tool_prompt_keep_list"]');
  const field = control?.closest(".field");
  if (!control || !field) return;
  field.querySelector(".quick-chips")?.remove();
  const chips = document.createElement("div");
  chips.className = "quick-chips";
  chips.setAttribute("aria-label", "快捷选择保留提示词的工具");
  const selected = new Set(control.value.split(/\r?\n|[,，]/).map((item) => item.trim()).filter(Boolean));
  const patterns = [...new Set([
    "web_search", "web_*", "toolbridge_http_get",
    ...toolChoices,
  ])];
  for (const pattern of patterns) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${selected.has(pattern) ? " active" : ""}`;
    button.textContent = pattern;
    button.disabled = control.disabled;
    button.addEventListener("click", () => {
      const current = new Set(
        control.value.split(/\r?\n|[,，]/).map((item) => item.trim()).filter(Boolean),
      );
      if (current.has(pattern)) current.delete(pattern);
      else current.add(pattern);
      control.value = [...current].join("\n");
      control.dispatchEvent(new Event("change", { bubbles: true }));
      renderKeepToolChips();
    });
    chips.appendChild(button);
  }
  const note = document.createElement("p");
  note.className = "quick-chip-note subtle";
  note.textContent = toolChoices.length
    ? "点击快捷添加；也可以在上方手动填写工具名或通配符。"
    : "暂未获取到工具名，可直接手填，例如 web_search 或 web_*。";
  chips.appendChild(note);
  const hint = field.querySelector(".desc");
  field.insertBefore(chips, hint);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("[data-goto-step]");
  if (!target) return;
  focusStep(target.dataset.gotoStep);
});

$("guide-steps").addEventListener("click", (event) => {
  const saveTarget = event.target.closest?.("[data-step-save]");
  if (saveTarget) {
    const step = GUIDE_STEPS.find((item) => item.id === saveTarget.dataset.stepSave);
    if (step) saveChanges(step.fields.map((field) => field.key), saveTarget, `save-guide-${step.id}`);
    return;
  }
  const nextTarget = event.target.closest?.("[data-step-next]");
  if (!nextTarget) return;
  const position = GUIDE_STEPS.findIndex((item) => item.id === nextTarget.dataset.stepNext);
  const next = GUIDE_STEPS[position + 1];
  if (next) focusStep(next.id);
  else switchView("home", true);
});

$("guide-goto-home").addEventListener("click", () => switchView("home", true));
$("go-guide").addEventListener("click", () => switchView("guide", true));

// ------------------------------------------------------------------ //
// 配置渲染与脏数据跟踪
// ------------------------------------------------------------------ //

function renderConfig(payload, { preserveDrafts = false } = {}) {
  const drafts = new Map();
  if (preserveDrafts) {
    for (const key of dirtyKeys) {
      const control = [...(controlsByKey.get(key) || [])][0];
      if (control) drafts.set(key, readControl(control));
    }
  }
  schemaItems = payload.schema || {};
  configValues = payload.config || {};
  providers = Array.isArray(payload.providers)
    ? payload.providers.filter((item) => item && typeof item.id === "string")
    : null;
  toolChoices = Array.isArray(payload.tools)
    ? payload.tools.map((item) => String(item?.name || "")).filter(Boolean)
    : [];
  controlsByKey.clear();
  originalValues.clear();
  dirtyKeys.clear();
  editedControls.clear();

  const oldHomeControl = $("home-tool-provider");
  const homeControl = makeProviderControl(
    "tool_provider_id", schemaItems.tool_provider_id || { type: "string" },
    configValues.tool_provider_id || "", "home-tool-provider",
  );
  oldHomeControl.replaceWith(homeControl);
  registerControl(homeControl, "tool_provider_id", schemaItems.tool_provider_id || { type: "string" }, configValues.tool_provider_id || "");
  homeControl.disabled = false;
  setText(
    "home-model-note",
    Array.isArray(providers) && providers.length
      ? `${providers.length} 个已加载文本模型 · 显示“模型 · Provider ID”`
      : "未获取到模型列表，可手动输入 Provider ID。",
  );

  renderGuide();
  renderGuideLinks();

  const basic = $("basic-settings");
  basic.replaceChildren();
  const basicBody = document.createElement("div");
  basicBody.className = "settings-body";
  for (const key of BASIC_KEYS) {
    if (schemaItems[key]) basicBody.appendChild(fieldControl(key, schemaItems[key], configValues[key]));
  }
  basic.appendChild(basicBody);

  const advanced = $("settings");
  advanced.replaceChildren();
  const placed = new Set([...BASIC_KEYS, ...GUIDE_KEYS]);
  for (const group of GROUPS) {
    const keys = group.keys.filter((key) => schemaItems[key] && !placed.has(key));
    if (!keys.length) continue;
    const section = document.createElement("details");
    section.className = "settings-group";
    const summary = document.createElement("summary");
    summary.textContent = group.title;
    const body = document.createElement("div");
    body.className = "settings-body";
    for (const key of keys) {
      body.appendChild(fieldControl(key, schemaItems[key], configValues[key]));
      placed.add(key);
    }
    section.append(summary, body);
    advanced.appendChild(section);
  }
  const rest = Object.keys(schemaItems).filter((key) => (
    !placed.has(key) && !key.endsWith("_configured")
  ));
  if (rest.length) {
    const section = document.createElement("details");
    section.className = "settings-group";
    const summary = document.createElement("summary");
    summary.textContent = "其他设置";
    const body = document.createElement("div");
    body.className = "settings-body";
    for (const key of rest) body.appendChild(fieldControl(key, schemaItems[key], configValues[key]));
    section.append(summary, body);
    advanced.appendChild(section);
  }
  configLoaded = true;
  syncConditionalControls();
  renderKeepToolChips();
  for (const [key, value] of drafts) {
    const controls = controlsByKey.get(key);
    if (!controls || valuesEqual(value, originalValues.get(key))) continue;
    for (const control of controls) {
      if (control.tagName === "SELECT" && value && ![...control.options].some((option) => option.value === value)) {
        control.appendChild(new Option(`未保存：${value}`, value));
      }
      writeControl(control, value);
    }
    dirtyKeys.add(key);
  }
  updateDirtyUI();
  if (statusData) renderStatus(statusData);
}

function syncPeers(key, source) {
  const value = readControl(source);
  editedControls.set(key, source);
  for (const control of controlsByKey.get(key) || []) {
    if (control !== source) writeControl(control, value);
  }
  if (valuesEqual(value, originalValues.get(key))) dirtyKeys.delete(key);
  else dirtyKeys.add(key);
  updateDirtyUI();
}

function handleFieldEvent(event) {
  const control = event.target.closest?.("[data-key]");
  if (control) {
    syncConditionalControls();
    syncPeers(control.dataset.key, control);
  }
}

document.addEventListener("input", handleFieldEvent);
document.addEventListener("change", handleFieldEvent);

function dirtyIn(container) {
  if (!container) return [];
  return [...new Set([...container.querySelectorAll("[data-key]")]
    .map((control) => control.dataset.key)
    .filter((key) => dirtyKeys.has(key) && keyIsEnabled(key)))];
}

function updateDirtyUI() {
  for (const [key, controls] of controlsByKey) {
    for (const control of controls) control.closest(".field")?.classList.toggle("dirty", dirtyKeys.has(key));
  }
  const entries = [
    ["save-home-model", [$("home-tool-provider")], "保存模型", "save-home"],
    ["save-guide", $("guide-steps"), "保存全部修改", "save-guide"],
    ["save-basic", $("basic-settings"), "保存基础设置", "save-basic"],
    ["save-config", $("settings"), "保存高级设置", "save-advanced"],
  ];
  for (const [id, container, label, busyKey] of entries) {
    const button = $(id);
    if (!button || busy.has(busyKey)) continue;
    const keys = Array.isArray(container)
      ? container.filter((control) => control && dirtyKeys.has(control.dataset.key)).map((control) => control.dataset.key)
      : dirtyIn(container);
    button.disabled = !configLoaded || keys.length === 0;
    button.textContent = keys.length ? `${label}（${keys.length}）` : label;
  }
  for (const step of GUIDE_STEPS) {
    const button = document.querySelector(`[data-step-save="${step.id}"]`);
    if (!button) continue;
    const busyKey = `save-guide-${step.id}`;
    if (busy.has(busyKey)) continue;
    const count = step.fields.filter((field) => dirtyKeys.has(field.key) && keyIsEnabled(field.key)).length;
    button.disabled = !configLoaded || count === 0;
    button.textContent = count ? `保存这一步（${count}）` : "保存这一步";
  }
  renderKeepToolChips();
  updateGuideState();
}

function changesFor(keys) {
  const changes = {};
  for (const key of [...new Set(keys)]) {
    if (!dirtyKeys.has(key)) continue;
    if (!keyIsEnabled(key)) continue;
    const control = editedControls.get(key) || [...(controlsByKey.get(key) || [])][0];
    if (!control) continue;
    const value = readControl(control);
    if ((control.dataset.kind === "int" || control.dataset.kind === "float") && (value === "" || !Number.isFinite(value))) {
      throw new Error(`${schemaItems[key]?.description || key} 需要有效数字。`);
    }
    if (SECRET_KEYS.has(key) && !String(value).trim()) continue;
    changes[key] = value;
  }
  return changes;
}

function commitSaved(changes, responseConfig = {}) {
  for (const [key, sentValue] of Object.entries(changes)) {
    const serverValue = SECRET_KEYS.has(key) ? "" : (responseConfig[key] ?? sentValue);
    originalValues.set(key, serverValue);
    if (!SECRET_KEYS.has(key)) configValues[key] = serverValue;
    if (SECRET_KEYS.has(key) && responseConfig[`${key}_configured`] != null) {
      configValues[`${key}_configured`] = responseConfig[`${key}_configured`];
    }
    for (const control of controlsByKey.get(key) || []) {
      const currentValue = readControl(control);
      if (valuesEqual(currentValue, sentValue)) {
        writeControl(control, serverValue);
        if (SECRET_KEYS.has(key)) {
          control.placeholder = configValues[`${key}_configured`] ? "已配置，留空保持" : "未配置，留空保持";
        }
      }
    }
    const currentControl = [...(controlsByKey.get(key) || [])][0];
    if (!currentControl || valuesEqual(readControl(currentControl), serverValue)) dirtyKeys.delete(key);
    editedControls.delete(key);
  }
  updateDirtyUI();
}

async function saveChanges(keys, button, busyKey) {
  if (busy.has(busyKey)) return;
  let changes;
  try {
    changes = changesFor(keys);
  } catch (error) {
    showMessage(error.message);
    return;
  }
  if (!Object.keys(changes).length) {
    showMessage("没有需要保存的修改。", "success");
    return;
  }
  showMessage();
  await withBusy(busyKey, button, "保存中…", async () => {
    try {
      const saved = await bridge.apiPost("config", { config: changes });
      if (saved.saved === false) throw new Error("后端未确认保存");
      commitSaved(changes, saved.config || {});
      if (saved.persisted) showMessage("设置已保存并生效。", "success");
      else showMessage("设置仅对当前运行生效，未能写入磁盘；重启后可能恢复，请检查配置目录权限。", "warning");
      await refresh({ silent: true });
    } catch (error) {
      showMessage(`保存失败：${error.message}。未保存的输入已保留，请重试。`);
    }
  });
}

$("save-home-model").addEventListener("click", () => saveChanges(["tool_provider_id"], $("save-home-model"), "save-home"));
$("save-guide").addEventListener("click", () => saveChanges(GUIDE_KEYS, $("save-guide"), "save-guide"));
$("save-basic").addEventListener("click", () => saveChanges(dirtyIn($("basic-settings")), $("save-basic"), "save-basic"));
$("save-config").addEventListener("click", () => saveChanges(dirtyIn($("settings")), $("save-config"), "save-advanced"));

async function loadConfig({ preserveDrafts = false } = {}) {
  try {
    const data = await bridge.apiGet("config");
    renderConfig(data, { preserveDrafts });
    const catalog = data.catalog || {};
    catalogItems = Array.isArray(catalog.items) ? catalog.items : [];
    catalogVerifiedAt = catalog.verified_at || "";
    const selectedCategory = $("catalog-category").value;
    $("catalog-category").replaceChildren(new Option("全部类别", ""));
    for (const category of new Set(catalogItems.map((item) => item.category).filter(Boolean))) {
      $("catalog-category").appendChild(new Option(category, category));
    }
    $("catalog-category").value = selectedCategory;
    renderCatalog();
    return true;
  } catch (error) {
    showMessage(`读取设置失败：${error.message}，请点击刷新重试。`);
    if (!configLoaded) {
      setText("basic-settings", `读取失败：${error.message}`);
      setText("settings", `读取失败：${error.message}`);
      setText("guide-steps", `读取失败：${error.message}`);
      setText("home-model-note", "模型列表读取失败，请点击刷新重试。");
      $("home-tool-provider").disabled = true;
    }
    return false;
  }
}

$("toggle").addEventListener("click", async () => {
  if (!statusData || busy.has("toggle")) return;
  const next = !statusData.effective_enabled;
  const enableConfig = next && configValues.enabled === false;
  let persisted = true;
  showMessage();
  await withBusy("toggle", $("toggle"), next ? "开启中…" : "关闭中…", async () => {
    try {
      if (enableConfig) {
        const saved = await bridge.apiPost("config", { config: { enabled: true } });
        if (saved.saved === false) throw new Error("配置总开关未能启用");
        persisted = saved.persisted !== false;
        commitSaved({ enabled: true }, saved.config || {});
      }
      renderStatus(await bridge.apiPost("toggle", { enabled: next }));
      if (next) {
        const text = enableConfig ? "工具桥已开启，配置总开关与运行开关均已启用。" : "工具桥已开启，运行开关已启用。";
        showMessage(persisted ? text : `${text} 配置仅在当前运行生效，未能写入磁盘。`, persisted ? "success" : "warning");
      } else {
        showMessage("工具桥已关闭；运行开关已关闭，配置总开关保持不变。", "success");
      }
      await refresh({ silent: true });
    } catch (error) {
      showMessage(`切换失败：${error.message}，请重试。`);
      await refresh({ silent: true });
    }
  });
});

function catalogSampleUrl(template) {
  const match = String(template || "").match(/https?:\/\/[^\s（(]+/);
  if (!match) return "";
  return match[0].replace(/\{([^}]+)\}/g, (_, key) => CATALOG_SAMPLES[key] || "test");
}

function renderCatalog() {
  const box = $("catalog");
  box.replaceChildren();
  let injectedCount = 0;
  for (const item of catalogItems) {
    if (item.injectable === true || (
      item.enabled !== false
      && (item.status === "ok" || item.status === "ok_proxy")
      && item.prompt !== false
      && (item.method || "GET").toUpperCase() === "GET"
    )) {
      injectedCount += 1;
    }
  }
  const query = $("catalog-search").value.trim().toLocaleLowerCase();
  const category = $("catalog-category").value;
  const items = catalogItems.filter((item) => (
    (catalogFilter === "all" || item.status === catalogFilter || (catalogFilter === "ok" && item.status === "ok_proxy"))
    && (!category || item.category === category)
    && (!query || `${item.name} ${item.category} ${item.note || ""} ${item.template || ""}`.toLocaleLowerCase().includes(query))
  ));
  setText("catalog-meta", `${items.length} / ${catalogItems.length} 个接口 · 可用注入 ${injectedCount} 条 · 实测 ${catalogVerifiedAt || "—"}`);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "没有符合当前筛选条件的接口。";
    box.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("article");
    row.className = `catalog-row${item.enabled === false ? " is-off" : ""}`;
    const head = document.createElement("div");
    head.className = "catalog-head";
    const [label, badgeClass] = CATALOG_STATUS[item.status] || [item.status, "off"];
    const badge = document.createElement("span");
    badge.className = `badge ${badgeClass}`;
    badge.textContent = label;
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${item.category} · ${item.method || "GET"}`;
    const switchWrap = document.createElement("label");
    switchWrap.className = "catalog-switch";
    const switchInput = document.createElement("input");
    switchInput.type = "checkbox";
    switchInput.checked = item.enabled !== false;
    switchInput.setAttribute("aria-label", `注入 ${item.name}`);
    switchInput.addEventListener("change", () => {
      saveCatalogSwitch(item.id, switchInput.checked, switchInput);
    });
    switchWrap.append(switchInput, document.createElement("span"));
    switchWrap.setAttribute("title", "开启后参与接口清单注入；关闭则临时停用");
    head.append(badge, title, meta, switchWrap);
    const code = document.createElement("code");
    code.textContent = item.template || "";
    row.append(head, code);
    if (item.note) {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = item.note;
      row.appendChild(note);
    }
    const sample = catalogSampleUrl(item.template);
    if (sample) {
      const actions = document.createElement("div");
      actions.className = "catalog-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.textContent = "填入探测";
      button.addEventListener("click", () => {
        switchView("advanced");
        $("network-diagnostics").open = true;
        $("probe-url").value = sample;
        setResult("probe-result", "已填入接口示例网址，点击“探测网址”开始检查。");
        $("probe-url").focus();
      });
      actions.appendChild(button);
      row.appendChild(actions);
    }
    const ping = catalogPingResults.get(item.id);
    if (ping) {
      const pingNote = document.createElement("p");
      pingNote.className = `note ping-note${ping.ok ? " ok" : ping.skipped ? "" : " failed"}`;
      pingNote.textContent = ping.skipped
        ? `批量探测跳过：${ping.error || "无 GET 示例地址"}`
        : ping.ok
          ? `批量探测可用 · HTTP ${ping.http_status} · ${ping.elapsed_ms} ms${ping.attempts > 1 ? ` · 第 ${ping.attempts} 次成功` : ""}`
          : `批量探测失败 · HTTP ${ping.http_status || "—"} · ${ping.error || "无响应"}${ping.attempts > 1 ? ` · 已重试 ${ping.attempts - 1} 次` : ""}`;
      row.appendChild(pingNote);
    }
    box.appendChild(row);
  }
}

async function saveCatalogSwitch(itemId, enabled, control) {
  control.disabled = true;
  try {
    const data = await bridge.apiPost("catalog/switches", {
      changes: { [itemId]: enabled },
    });
    catalogItems = Array.isArray(data.items) ? data.items : catalogItems;
    showMessage("接口开关已保存。", "success");
  } catch (error) {
    control.checked = !enabled;
    showMessage(`保存接口开关失败：${error.message}`, "error");
  } finally {
    control.disabled = false;
    renderCatalog();
  }
}

async function pingCatalogAll() {
  if (catalogPinging) return;
  catalogPinging = true;
  const button = $("catalog-ping");
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = "探测中…";
  $("catalog-disable-failed").disabled = true;
  setText("catalog-ping-result", "正在按接口示例地址批量探测…");
  try {
    const data = await bridge.apiPost("catalog/ping", {});
    const results = Array.isArray(data.items) ? data.items : [];
    catalogPingResults = new Map(results.map((item) => [item.id, item]));
    const available = results.filter((item) => item.ok).length;
    const skipped = results.filter((item) => item.skipped).length;
    const failed = results.filter((item) => !item.ok && !item.skipped).length;
    setText(
      "catalog-ping-result",
      `探测完成：可用 ${available} · 失败 ${failed} · 跳过 ${skipped}。`,
    );
    $("catalog-disable-failed").disabled = failed === 0;
    renderCatalog();
  } catch (error) {
    setText("catalog-ping-result", `批量探测失败：${error.message}`);
    showMessage(`批量探测失败：${error.message}`, "error");
  } finally {
    catalogPinging = false;
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

async function disableFailedCatalogItems() {
  const failedIds = [...catalogPingResults.values()]
    .filter((item) => !item.ok && !item.skipped)
    .map((item) => item.id);
  if (!failedIds.length) return;
  const button = $("catalog-disable-failed");
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = "保存中…";
  try {
    const data = await bridge.apiPost("catalog/switches", {
      changes: Object.fromEntries(failedIds.map((id) => [id, false])),
    });
    catalogItems = Array.isArray(data.items) ? data.items : catalogItems;
    setText("catalog-ping-result", `已关闭 ${failedIds.length} 个探测失败的接口。`);
    showMessage("探测失败接口已关闭并保存。", "success");
    renderCatalog();
  } catch (error) {
    showMessage(`关闭失败接口时出错：${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
    const failed = [...catalogPingResults.values()].filter(
      (item) => !item.ok && !item.skipped,
    ).length;
    button.disabled = failed === 0;
  }
}

for (const button of $("catalog-filters").querySelectorAll("button")) {
  button.addEventListener("click", () => {
    catalogFilter = button.dataset.filter || "all";
    for (const other of $("catalog-filters").querySelectorAll("button")) {
      const active = other === button;
      other.classList.toggle("active", active);
      other.setAttribute("aria-pressed", String(active));
    }
    renderCatalog();
  });
}
$("catalog-search").addEventListener("input", renderCatalog);
$("catalog-category").addEventListener("change", renderCatalog);
$("catalog-ping").addEventListener("click", pingCatalogAll);
$("catalog-disable-failed").addEventListener("click", disableFailedCatalogItems);

function renderRetrievalResult(result) {
  const box = $("retrieval-result");
  const trace = Array.isArray(result.trace) ? result.trace : [];
  const apiPhase = trace.find((phase) => phase.phase === "api");
  const decision = trace.find((phase) => phase.phase === "decision");
  const phaseLabel = phase => ({ decision: "需求决策", api: "接口阶段", search_fallback: "搜索补充" }[phase.phase] || phase.phase);
  const searched = trace.some((phase) => phase.phase === "search_fallback");
  const searchFailed = trace.some((phase) => phase.phase === "search_fallback" && phase.status === "failed");
  const verdict = apiPhase?.verdict;
  let headline = "真实流程测试完成";
  if (decision?.need === false) headline = "决策已放行，未调用接口或搜索模型";
  else if (verdict === "complete") headline = "接口数据足够，无需搜索";
  else if (verdict === "not_needed") headline = "无需外部数据，已结束取数";
  else if (searched) headline = searchFailed ? "接口信息不足，搜索补充未成功" : "接口信息不足，已完成搜索补充";
  else if (verdict === "insufficient" || verdict === "unverified") headline = "接口信息不足，未取得搜索补充";

  box.classList.remove("error");
  box.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "retrieval-summary";
  const title = document.createElement("strong");
  title.textContent = headline;
  const elapsed = document.createElement("span");
  elapsed.textContent = `耗时 ${result.elapsed_ms ?? "—"} ms`;
  summary.append(title, elapsed);
  box.appendChild(summary);

  if (trace.length) {
    const phases = document.createElement("ol");
    phases.className = "phase-summary";
    const statusLabels = { running: "正在执行", finished: "已完成", failed: "执行失败" };
    const verdictLabels = {
      complete: "数据足够回答，不开放搜索",
      insufficient: "数据不足，继续搜索补充",
      not_needed: "无需外部数据",
      unverified: "未能确认数据完整性",
    };
    for (const phase of trace) {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = `${phaseLabel(phase)} · ${statusLabels[phase.status] || phase.status || "已完成"}`;
      item.appendChild(heading);
      if (phase.phase === "api") {
        const decision = document.createElement("span");
        decision.textContent = `数据检查：${verdictLabels[phase.verdict] || "已完成"}`;
        item.appendChild(decision);
      }
      if (phase.phase === "decision") {
        const reason = document.createElement("span");
        reason.textContent = phase.reason || (phase.need ? "需要外部工具" : "跳过外部工具");
        item.appendChild(reason);
      }
      phases.appendChild(item);
    }
    box.appendChild(phases);
  }

  const details = document.createElement("details");
  details.className = "technical-details";
  const detailsSummary = document.createElement("summary");
  detailsSummary.textContent = "查看技术详情";
  const output = document.createElement("pre");
  const phaseDetails = trace.map((phase, index) => {
    const tools = Array.isArray(phase.tools) ? phase.tools : [];
    const calls = Array.isArray(phase.calls) ? phase.calls : [];
    if (phase.phase === "decision") return `${index + 1}. 需求决策：${phase.need ? "需要工具" : "放行"}\n${phase.reason || ""}`;
    return `${index + 1}. ${phaseLabel(phase)} · ${phase.status || "finished"}\n`
      + `开放工具：${tools.join("、") || "无"}\n`
      + `实际调用：${calls.map((call) => call.name).join(" → ") || "未调用"}`;
  });
  output.textContent = `${phaseDetails.join("\n\n") || "未返回阶段记录"}\n\n${result.result || "无返回内容"}`;
  details.appendChild(detailsSummary, output);
  box.appendChild(details);
}

$("test-retrieval").addEventListener("click", async () => {
  const prompt = $("retrieval-prompt").value.trim();
  if (!prompt) {
    setResult("retrieval-result", "请先填写测试问题。", true);
    return;
  }
  showMessage();
  await withBusy("retrieval", $("test-retrieval"), "正在执行真实流程…", async () => {
    setResult("retrieval-result", "正在检查接口，数据不足时再搜索，请稍候…");
    try {
      const result = await bridge.apiPost("test/retrieval", { prompt });
      renderRetrievalResult(result);
    } catch (error) {
      setResult("retrieval-result", `测试失败：${error.message}。请检查运行状态和网络后重试。`, true);
    }
  });
  await refresh({ silent: true });
});

$("test").addEventListener("click", async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt) {
    setResult("test-result", "请先填写测试消息。", true);
    return;
  }
  await withBusy("judge", $("test"), "正在判断…", async () => {
    setResult("test-result", "正在调用独立判断器…");
    try {
      const result = await bridge.apiPost("test/judge", { prompt });
      setResult("test-result", `${result.need ? "需要工具" : "不需要工具"}\n理由：${result.reason || "（无）"}\n模式：${MODE_LABELS[result.judge_mode] || result.judge_mode || "—"} · 模型：${result.model || "—"}\n耗时：${result.elapsed_ms ?? "—"} ms · 当前可用工具：${result.tool_count ?? "—"}`);
    } catch (error) {
      setResult("test-result", `判断测试失败：${error.message}，请重试。`, true);
    }
  });
  await refresh({ silent: true });
});

$("test-route").addEventListener("click", async () => {
  await withBusy("route", $("test-route"), "正在预抓取…", async () => {
    setResult("diagnostic-result", "正在按类别预抓取…");
    try {
      const result = await bridge.apiPost("test/route", { prompt: $("route-prompt").value });
      if (!result.route) {
        setResult("diagnostic-result", result.message || "没有命中专用接口。");
      } else if (!result.entries?.length) {
        setResult("diagnostic-result", `类别：${ROUTE_LABELS[result.route] || result.route}\n预抓取未取得结果，实际对话会继续检查其他接口。`);
      } else {
        const entry = result.entries[0];
        setResult("diagnostic-result", `类别：${ROUTE_LABELS[result.route] || result.route} · 耗时 ${result.elapsed_ms ?? "—"} ms\n${entry.args ? `URL：${entry.args}\n\n` : ""}${entry.result || "无返回内容"}`);
      }
    } catch (error) {
      setResult("diagnostic-result", `预抓取失败：${error.message}，请重试。`, true);
    }
  });
  await refresh({ silent: true });
});

$("probe").addEventListener("click", async () => {
  const url = $("probe-url").value.trim();
  if (!url) {
    setResult("probe-result", "请先填写网址。", true);
    $("probe-url").focus();
    return;
  }
  await withBusy("probe", $("probe"), "正在探测…", async () => {
    setResult("probe-result", "正在从当前 AstrBot 主机探测…");
    try {
      const result = await bridge.apiGet("probe", { url });
      const finalUrl = result.final_url && result.final_url !== url ? `\n最终 URL：${result.final_url}` : "";
      setResult("probe-result", `HTTP ${result.status ?? "—"}${finalUrl}\nContent-Type: ${result.content_type || "—"}\n\n${result.head ?? result.preview ?? ""}`);
    } catch (error) {
      setResult("probe-result", `探测失败：${error.message}，请检查网址后重试。`, true);
    }
  });
  await refresh({ silent: true });
});

$("refresh").addEventListener("click", async () => {
  if (refreshing || busy.has("manual-refresh")) return;
  await withBusy("manual-refresh", $("refresh"), "刷新中…", async () => {
    const loaded = await loadConfig({ preserveDrafts: configLoaded });
    await refresh({ silent: true });
    if (loaded) {
      showMessage(
        dirtyKeys.size ? `已同步最新配置，${dirtyKeys.size} 项未保存修改已保留。` : "状态、配置、模型和接口清单已刷新。",
        "success",
      );
    }
  });
});

await bridge.ready();
await Promise.all([loadConfig(), refresh({ silent: true })]);

setInterval(() => {
  if (document.visibilityState === "visible" && !refreshing) refresh({ silent: true });
}, 5000);
