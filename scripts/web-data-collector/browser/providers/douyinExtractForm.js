// 自助取数表单的驱动步骤。所有控件的定位方式都在 2026-07-30 的生产页面上逐个确认过。
//
// 这里全部使用可信事件（CDP Input 域）。罗盘的日期控件只认可信事件：程序化写 value
// 与合成 MouseEvent 都只改显示、不进表单模型，提交时仍报「请输入时间」，而且不报错
// ——这是今天反复踩到的一类故障。

import {
  DEFAULT_METRIC_VALUES,
  PRIMARY_DIMENSIONS,
  buildExtractPlan
} from "../../../../src/domain/douyinSelfServiceExtract.js";

function extractError(code, message) {
  return Object.assign(new Error(message), { code });
}

// 元素定位一律返回表达式，由控制器求值后取包围盒再点，避免在采集器里硬编码坐标。
// 罗盘一改版硬编码坐标就失效，而且失效时不报错、只会点空。
const LOCATORS = Object.freeze({
  // 不能加 !el.children.length：页签在不同窗口宽度下渲染结构不同，专用浏览器里
  // 「取数配置」带子元素，加了这个限制就永远找不到。文本全等已足够唯一。
  configTab: `[...document.querySelectorAll("div,span,button")]
    .find(el => el.getClientRects().length && el.textContent.trim() === "取数配置")`,
  taskName: `[...document.querySelectorAll("input[type=text]")]
    .find(el => el.getClientRects().length && /^新建任务|^采集-/.test(el.value || ""))`,
  dimension: value => `document.querySelector('input[type=radio][value=${JSON.stringify(value)}]')?.closest("label")
    || document.querySelector('input[type=radio][value=${JSON.stringify(value)}]')`,
  granularity: label => `[...document.querySelectorAll("label,span,div")]
    .find(el => el.getClientRects().length && el.textContent.trim() === ${JSON.stringify(label)})`,
  startDate: `[...document.querySelectorAll("input")].find(el => /开始日期/.test(el.placeholder || ""))`,
  metric: value => `[...document.querySelectorAll("label")]
    .find(el => el.getClientRects().length && el.querySelector('input[type=checkbox][value=${JSON.stringify(value)}]'))`,
  submit: `[...document.querySelectorAll("button")]
    .find(el => el.getClientRects().length && el.textContent.trim() === "创建任务")`,
  confirm: `[...document.querySelectorAll("button")]
    .find(el => el.getClientRects().length && el.textContent.trim() === "确定")`,
  taskListTab: `[...document.querySelectorAll("div,span,button")]
    .find(el => el.getClientRects().length && el.textContent.trim() === "任务列表")`
});

// 任务列表是标准表格，五列：任务名称、创建人、状态、创建日期、操作（查看/下载/删除）。
// 只取名称与状态——回找靠名称，判定靠状态，其余列没有业务含义。
const TASK_ROWS = `[...document.querySelectorAll("tr")]
  .filter(row => row.getClientRects().length && row.querySelectorAll("td").length >= 4)
  .map(row => {
    const cells = [...row.querySelectorAll("td")].map(cell => cell.textContent.trim());
    return { taskName: cells[0], status: cells[2] };
  })
  .filter(row => row.taskName)`;

// 下载入口按所在行的任务名称定位。绝不能取「第一个下载链接」——
// 队列全平台共用，列表里随时有别人的任务，取第一个会下错文件。
function downloadLocator(taskName) {
  return `(() => {
    const row = [...document.querySelectorAll("tr")]
      .filter(item => item.getClientRects().length && item.querySelectorAll("td").length >= 4)
      .find(item => item.querySelector("td")?.textContent.trim() === ${JSON.stringify(taskName)});
    if (!row) return null;
    return [...row.querySelectorAll("a,span,button")]
      .find(el => el.getClientRects().length && el.textContent.trim() === "下载") || null;
  })()`;
}

// 日历面板显示的是「YYYY 年 M 月」。补历史时目标月份不在当前视图，必须先翻月。
const PANEL_MONTHS = `[...document.querySelectorAll("[class*=picker-panel],[class*=picker-body]")]
  .filter(el => el.getClientRects().length)
  .flatMap(panel => [...panel.querySelectorAll("[class*=header]")].map(el => el.textContent.trim()))
  .filter(text => /\\d{4}\\s*年/.test(text))`;

function monthKey(text) {
  const match = String(text).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, "0")}` : "";
}

// 日期格必须限定在 in-view（当月）且非 disabled，否则会点到相邻月份的同号日期。
function dayCellLocator(day) {
  return `[...document.querySelectorAll("td[class*=picker-cell],div[class*=picker-cell]")]
    .filter(el => el.getClientRects().length && /in-view/.test(el.className) && !/disabled/.test(el.className))
    .find(el => ((el.querySelector("[class*=cell-inner]") || el).textContent.trim()) === ${JSON.stringify(String(day))})`;
}

export function createDouyinExtractForm({ controller, evaluate, wait, maxMonthSteps = 18 }) {
  async function openConfigTab() {
    await controller.trustedClickElement(
      LOCATORS.configTab, "DOUYIN_EXTRACT_TAB_MISSING", "自助取数的取数配置页签不可用。"
    );
    await wait(1200);
  }

  // 翻到目标月份。翻不到就明确失败——继续点日期只会选中错误的一天，
  // 而错误的一天不会报错，只会悄悄采回别人日子的数据。
  async function ensureMonth(targetMonth) {
    for (let step = 0; step < maxMonthSteps; step += 1) {
      const months = (await evaluate(PANEL_MONTHS)) || [];
      const keys = months.map(monthKey).filter(Boolean);
      if (keys.includes(targetMonth)) return;
      if (!keys.length) throw extractError("DOUYIN_EXTRACT_CALENDAR_MISSING", "日期面板不可用。");
      const direction = targetMonth < keys[0] ? "prev" : "next";
      await controller.trustedClickElement(
        `[...document.querySelectorAll("[class*=picker-header] button,[class*=${direction}-btn]")]
          .find(el => el.getClientRects().length)`,
        "DOUYIN_EXTRACT_CALENDAR_NAV_MISSING",
        "日期面板的翻月控件不可用。"
      );
      await wait(500);
    }
    throw extractError("DOUYIN_EXTRACT_MONTH_UNREACHABLE", `日期面板翻不到 ${targetMonth}。`);
  }

  async function pickDate(date) {
    const month = String(date).slice(0, 7);
    await ensureMonth(month);
    const day = String(Number(String(date).slice(8, 10)));
    await controller.trustedClickElement(
      dayCellLocator(day),
      "DOUYIN_EXTRACT_DATE_CELL_MISSING",
      `日期面板中找不到可选的 ${date}。`
    );
    await wait(600);
  }

  return Object.freeze({
    async createTask({ resourceType, from, to, metricValues = DEFAULT_METRIC_VALUES }) {
      const plan = buildExtractPlan({ resourceType, from, to });
      await openConfigTab();

      await controller.trustedClearAndType(
        LOCATORS.taskName, plan.taskName,
        "DOUYIN_EXTRACT_NAME_MISSING", "任务名称输入框不可用。"
      );

      await controller.trustedClickElement(
        LOCATORS.dimension(PRIMARY_DIMENSIONS[resourceType]),
        "DOUYIN_EXTRACT_DIMENSION_MISSING", "主要维度选项不可用。"
      );
      await controller.trustedClickElement(
        LOCATORS.granularity(plan.granularity),
        "DOUYIN_EXTRACT_GRANULARITY_MISSING", "时间粒度选项不可用。"
      );

      await controller.trustedClickElement(
        LOCATORS.startDate, "DOUYIN_EXTRACT_DATE_INPUT_MISSING", "统计周期输入框不可用。"
      );
      await wait(900);
      await pickDate(plan.from);
      await pickDate(plan.to);

      for (const value of metricValues) {
        await controller.trustedClickElement(
          LOCATORS.metric(value),
          "DOUYIN_EXTRACT_METRIC_MISSING", `指标 ${value} 不可用。`
        );
        await wait(150);
      }

      // 提交前复核：日期是唯一会「显示对了但没进模型」的字段，必须以表单校验为准，
      // 不能只看输入框的文字。
      const applied = await evaluate(`(() => {
        const inputs = [...document.querySelectorAll("input")].filter(el => /日期/.test(el.placeholder || ""));
        const errors = [...document.querySelectorAll("[class*=error]")]
          .filter(el => el.getClientRects().length && el.textContent.trim())
          .map(el => el.textContent.trim());
        return { values: inputs.map(el => el.value), errors };
      })()`);
      if ((applied?.errors || []).some(text => /请输入时间|请选择/.test(text))) {
        throw extractError("DOUYIN_EXTRACT_DATE_NOT_APPLIED", "统计周期未进入表单，取数任务未创建。");
      }

      await controller.trustedClickElement(
        LOCATORS.submit, "DOUYIN_EXTRACT_SUBMIT_MISSING", "创建任务按钮不可用。"
      );
      await wait(1200);
      await controller.trustedClickElement(
        LOCATORS.confirm, "DOUYIN_EXTRACT_CONFIRM_MISSING", "创建任务的确认按钮不可用。"
      );
      await wait(2000);
      return plan;
    },

    // 读取任务列表。返回原始行，由 selectExtractTask 按名称回找并判定状态——
    // 判定逻辑放在可测的域模块里，这里只负责把页面上的东西取回来。
    async readTasks() {
      await controller.trustedClickElement(
        LOCATORS.taskListTab, "DOUYIN_EXTRACT_TASK_TAB_MISSING", "任务列表页签不可用。"
      );
      await wait(2500);
      return (await evaluate(TASK_ROWS)) || [];
    },

    async downloadTask(taskName) {
      const located = await controller.trustedClickElement(
        downloadLocator(taskName),
        "DOUYIN_EXTRACT_DOWNLOAD_MISSING",
        `任务「${taskName}」的下载入口不可用。`
      );
      await wait(3000);
      return located;
    }
  });
}
