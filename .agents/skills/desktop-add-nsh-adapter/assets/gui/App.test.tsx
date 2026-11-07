import { expect, open, test } from "nsh/test";

test("mixed UI reads the shared Rust core and saves language and theme", async () => {
  const app = await open(".", { locale: "en-US" });
  await app.waitFor("Neutral workspace initialized. Define the product in this downstream project.");
  await app.press("Settings");
  await app.press("Dark");
  expect(app.storage().appearance).toBe("dark");
  await app.press("中文");
  await app.waitFor("外观主题");
  expect(app.storage()["interface-language"]).toBe("zh");
  await app.press("首页");
  expect(app.texts()).toContain("中性工程已初始化，请在下游定义产品。");
});

__DESKTOP_TEST__
__SUPPORT_TEST__
