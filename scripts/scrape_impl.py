#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知乎盐言故事（fiore vip-web）榜单抓取实现，供 sync_rank.py 调用。

数据源（已实测，无需登录、无需签名）：
  GET https://api.zhihu.com/km-vip-zhihu-web/vip_tab/svip_story?modules=billboard
  带 Referer: https://www.zhihu.com/fiore/h5/vip-web 即可拿到真实 JSON。
  返回结构：
    data[0].module_data.data.data[]  -> 每个榜
        .head.title  = 榜名（推荐榜/热度榜/口碑榜/新书榜/长篇榜）
        .head.type   = recommend / hot / reputation / new_book / well
        .content_list[] -> 每本书
            .title       书名
            .subtitle    "66.7 万赞"（展示性徽章数字，不计入热度）
            .label_text  "言情 · 警察"（分类标签）
            .description 简介
            （注：该接口不返回作者字段，a 保留为空，不丢字段）

抓取策略：
  1) 优先直连上面的 JSON 接口（快、稳、无需浏览器）；
  2) 若接口失败/返回空，再退化为真实浏览器（Playwright，可带登录 cookie）
     打开 https://www.zhihu.com/fiore/h5/vip-web，拦截接口响应拿原始 JSON；
  3) 任何情况下抓不到都明确报错，绝不直接写空/假数据。

榜名：直接使用接口返回的真实榜名（推荐榜/热度榜/口碑榜/新书榜/长篇榜），
           不再编造/映射成不存在的榜名；输出顺序按 PREFERRED_ORDER 固定。
"""
import os, json, asyncio, urllib.request, urllib.error

# 接口返回的榜单顺序较随意，按此顺序固定输出，保证前端展示顺序稳定
PREFERRED_ORDER = ["推荐榜", "热度榜", "口碑榜", "新书榜", "长篇榜"]
# 接口 type -> 真实榜名（head.title 即已是中文名，type 仅作兜底/校验）
TYPE_TO_NAME = {
    "recommend": "推荐榜",
    "hot": "热度榜",
    "reputation": "口碑榜",
    "new_book": "新书榜",
    "well": "长篇榜",
}

API_URL = "https://api.zhihu.com/km-vip-zhihu-web/vip_tab/svip_story?modules=billboard"
PAGE_URL = "https://www.zhihu.com/fiore/h5/vip-web"

# 本机若已装 Chrome/Edge，优先用系统浏览器（省去下载 chromium）。
BROWSER_CHANNELS = ["chrome", "msedge", None]


def _norm_item(raw):
    """把接口 item 归一化成 {t,a,tag,d}。作者字段本接口无，保留为空。"""
    if not isinstance(raw, dict):
        return None
    t = (raw.get("title") or raw.get("t") or "").strip()
    if not t:
        return None
    a = (raw.get("a") or raw.get("author") or raw.get("penname") or "").strip()
    label = (raw.get("label_text") or raw.get("tag") or "").strip()
    sub = (raw.get("subtitle") or "").strip()
    # tag = "分类 · 数字徽章"，与前端 parseTag 兼容
    tag = " · ".join(x for x in [label, sub] if x)
    d = (raw.get("description") or raw.get("d") or raw.get("desc") or "").strip()
    return {"t": t, "a": a, "tag": tag, "d": d}


def _parse_api_response(obj):
    """从接口 JSON 里取出榜单列表，映射成统一结构。返回 [] 表示没解析到。"""
    try:
        lists_raw = obj["data"][0]["module_data"]["data"]["data"]
    except (KeyError, IndexError, TypeError):
        return []
    out = []
    for L in lists_raw:
        head = L.get("head", {}) or {}
        tname = head.get("type") or ""
        name = TYPE_TO_NAME.get(tname) or head.get("title") or tname
        items = [_norm_item(c) for c in L.get("content_list", [])]
        items = [x for x in items if x]
        if items:
            out.append({"name": name, "items": items})
    # 按前端期望顺序排序
    out.sort(key=lambda x: PREFERRED_ORDER.index(x["name"])
             if x["name"] in PREFERRED_ORDER else 99)
    return out


def _http_get_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def fetch_api():
    """直连 JSON 接口拿榜单；失败抛异常。"""
    headers = {
        "User-Agent": ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                       "AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),
        "Accept": "application/json, text/plain, */*",
        "Referer": PAGE_URL,
        "x-requested-with": "fetch",
    }
    obj = _http_get_json(API_URL, headers)
    lists = _parse_api_response(obj)
    if not lists:
        raise RuntimeError("接口返回结构异常或为空：" + json.dumps(obj, ensure_ascii=False)[:300])
    return {"updatedAt": "", "source": API_URL, "lists": lists}


# ----------------- 以下为 Playwright 兜底路径 -----------------
EXPECTED_LISTS = ["推荐榜", "热度榜", "口碑榜", "新书榜", "长篇榜"]


def _candidate_lists(obj):
    out = []
    blobs = obj if isinstance(obj, list) else []
    if isinstance(obj, dict):
        for k in ("lists", "data", "list", "items", "boards", "result", "results", "rank"):
            v = obj.get(k)
            if isinstance(v, list) and v:
                blobs = v
                break
        if not blobs:
            blobs = [obj]
    for b in blobs:
        if not isinstance(b, dict):
            continue
        name = b.get("name") or b.get("title") or b.get("boardName") or ""
        items = (b.get("items") or b.get("list") or b.get("data")
                 or b.get("books") or b.get("content_list") or b.get("contents") or [])
        if isinstance(items, list) and items:
            normed = [_norm_item(it) for it in items]
            normed = [x for x in normed if x]
            if normed:
                out.append({"name": str(name), "items": normed})
    return out


def _pick_best(lists):
    if not lists:
        return []
    def score(ls):
        names = {l["name"] for l in ls}
        return sum(1 for n in EXPECTED_LISTS if n in names)
    return max(lists, key=score)


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
    raise RuntimeError("无法启动浏览器（系统 Chrome/Edge 与自带 chromium 均不可用）："
                       + repr(last_err))


async def _try_intercept(page, wait_ms=0):
    captured = []

    async def on_resp(r):
        try:
            ct = r.headers.get("content-type", "")
            if "json" in ct:
                captured.append(await r.text())
        except Exception:
            pass

    page.on("response", on_resp)
    if wait_ms:
        try:
            await page.wait_for_timeout(wait_ms)
        except Exception:
            pass
    return captured


async def _try_dom(page):
    out = []
    try:
        for name in EXPECTED_LISTS:
            node = await page.query_selector(f"text={name}")
            if not node:
                continue
            container = await node.evaluate_handle("n => n.parentElement")
            items = await container.query_selector_all("a, li, [class*='item']")
            normed = []
            for it in items:
                txt = (await it.inner_text()).strip()
                if txt:
                    normed.append({"t": txt.split("\n")[0], "a": "", "tag": "", "d": ""})
            if normed:
                out.append({"name": name, "items": normed})
    except Exception:
        return []
    return out


async def _run_browser(cookies_path=""):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        ctx = await browser.new_context(
            user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                        "AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),
            viewport={"width": 414, "height": 896},
        )
        if cookies_path and os.path.exists(cookies_path):
            with open(cookies_path, encoding="utf-8") as f:
                await ctx.add_cookies(json.load(f))
        page = await ctx.new_page()
        bodies = await _try_intercept(page, wait_ms=0)
        try:
            await page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            await browser.close()
            raise RuntimeError("打开榜单页失败：" + repr(e))
        await _try_intercept(page, wait_ms=12000)

        captured = []
        for body in bodies:
            try:
                captured.append(_candidate_lists(json.loads(body)))
            except Exception:
                continue
        if not captured:
            dom = await _try_dom(page)
            if dom:
                captured.append(dom)
        await browser.close()
        return _pick_best(captured) if captured else []


async def run_scrape(cookies_path="", wait_ms=12000):
    """抓取榜单：先直连接口，失败再回退浏览器。返回 {updatedAt,source,lists}。"""
    try:
        data = fetch_api()
        print("[scrape] 直连接口成功，抓到 %d 个榜。" % len(data["lists"]), flush=True)
        return data
    except Exception as e:
        print("[scrape] 直连接口失败，回退浏览器：", repr(e), flush=True)
        best = await _run_browser(cookies_path=cookies_path)
        if not best:
            raise RuntimeError(
                "直连接口与浏览器均未能抓到榜单数据。若页面要求登录，"
                "请用 --cookies scripts/cookies.json 传入登录 cookie。"
            )
        return {"updatedAt": "", "source": PAGE_URL, "lists": best}


if __name__ == "__main__":
    async def _m():
        import sys
        ck = sys.argv[1] if len(sys.argv) > 1 else ""
        print(json.dumps(await run_scrape(ck), ensure_ascii=False, indent=2))
    asyncio.run(_m())
