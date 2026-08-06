#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性探测脚本：用真实浏览器打开知乎盐言故事 vip-web 榜单页，
把页面发出的所有接口请求 + 返回的 JSON 结构打印出来，
用于确认「榜单数据到底从哪个接口、以什么字段返回」，
之后再据此写正式的 sync_rank.py 抓取器。

用法：
  python scripts/_discover.py
  python scripts/_discover.py --cookies scripts/cookies.json   # 若榜单需登录

cookies.json 形如：[{"name":"xxx","value":"yyy","domain":".zhihu.com","path":"/"}]
（从浏览器开发者工具 Application→Cookies 复制；仅本地使用，不要提交到仓库）
"""
import sys, os, json, argparse, asyncio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
URL = "https://www.zhihu.com/fiore/h5/vip-web"

def log(*a):
    print("[discover]", *a, flush=True)

# 优先用系统浏览器（Chrome/Edge），最后回退自带 chromium
BROWSER_CHANNELS = ["chrome", "msedge", None]

async def _launch_browser(p):
    last_err = None
    for ch in BROWSER_CHANNELS:
        try:
            if ch is None:
                return await p.chromium.launch(headless=True)
            return await p.chromium.launch(headless=True, channel=ch)
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError("无法启动浏览器：" + repr(last_err))

async def main():
    from playwright.async_api import async_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookies", default="")
    ap.add_argument("--wait", type=int, default=12)
    args = ap.parse_args()

    captured = []
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        ctx = await browser.new_context(
            user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                        "AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),
            viewport={"width": 414, "height": 896},
        )
        if args.cookies and os.path.exists(args.cookies):
            with open(args.cookies, encoding="utf-8") as f:
                await ctx.add_cookies(json.load(f))
            log("已注入 cookies：", args.cookies)

        page = await ctx.new_page()
        page.on("response", lambda r: asyncio.ensure_future(_on_resp(r, captured)))
        log("打开", URL)
        try:
            await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            log("goto 出错：", repr(e))
        await page.wait_for_timeout(args.wait * 1000)

        title = await page.title()
        body_text = (await page.inner_text("body")) if await _has_body(page) else ""
        log("页面标题：", title)
        log("页面文字长度：", len(body_text))
        # 打印页面里出现的已知榜名 / 书名，判断是否真的渲染了榜单
        for kw in ["推荐榜", "热度榜", "口碑榜", "全网热议", "新书榜", "河清海晏", "榜单"]:
            log(f"  含「{kw}」：", kw in body_text)

        await browser.close()

    log("捕获到响应共", len(captured), "条，过滤接口类：")
    for c in captured:
        url = c["url"]
        if any(k in url for k in ["api", "bazaar", "vip", "rank", "fiore", "story"]):
            log("----")
            log("URL:", url)
            log("STATUS:", c["status"], "TYPE:", c.get("ctype"))
            body = c.get("body", "")
            if body:
                log("BODY(len=%d):" % len(body), body[:1500])

async def _on_resp(r, sink):
    try:
        ctype = r.headers.get("content-type", "")
        if "json" in ctype or "javascript" in ctype:
            body = await r.text()
        else:
            body = ""
        sink.append({"url": r.url, "status": r.status, "ctype": ctype, "body": body})
    except Exception:
        pass

async def _has_body(page):
    try:
        await page.wait_for_selector("body", timeout=3000)
        return True
    except Exception:
        return False

if __name__ == "__main__":
    asyncio.run(main())
