"""
抓取知乎盐言故事【网页真实榜单】（vip-ranking 排行页）的全部内容。

与 scripts/scrape_impl.py（fiore 首页 4 榜口径）不同，这里抓的是用户真正在网页上
看到的榜单：story.zhihu.com/vip-ranking?channel=female 的 7 个 tab。

实测结论（2026-08-06 浏览器探明）：
- 真实接口：GET https://www.zhihu.com/api/vip/km-indep-home-comm/billboard/list
            ?channel_type=female&filter_key=0&limit=N&offset=0&tab_type=<type>
- 该接口【免登录、免签名】，带 Referer 即可（Referer 必须是 vip-ranking 页）。
- tab 真实参数名是 tab_type（不是 filter_key）；7 个 tab 如下：
    盐气榜 recommend / 热度榜 hot / 长篇榜 well / 新书榜 new_book
    口碑榜 reputation / 潜力榜 potential / 互动榜 interactive
  （注：fiore 首页「榜单」板块只展示 推荐/热度/口碑/长篇 4 个；潜力榜、互动榜、新书榜
    是 vip-ranking 页专属 tab，网页真实可见。）
- 返回字段比 billboard(svip_story) 更全：含 author_text（作者！）、labels（标签数组）、
  interaction_text（互动/热度数字，如 "82.4 万"）、content_abstract（简介）、artwork（封面）等。

落盘文件：data/rank-web.json
  结构：{ fetchedAt, channels:{ <频道>:{ source, channel, lists:[ {name, type, items:[...]} ] } } }
  每个 item 同时保留：
    - 归一化四字段 t/a/tag/d（与 notes.js 兼容）
    - 原始富字段 url / labels / interaction / artwork / type

用法：
  python scripts/scrape_web.py                          # 仅抓 female 频道（默认）
  python scripts/scrape_web.py --channels female male   # 男女双频道，最全
  python scripts/scrape_web.py --limit 50               # 每榜最多取多少本（默认 50，足够拿满）
  python scripts/scrape_web.py --out 路径                # 指定输出文件

输出结构（多频道时按 channel 分组）：
  { fetchedAt, channels: { female: {source, channel, lists}, male: {...} } }
  单频道时同样包在 channels 下，保持结构一致。
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "data", "rank-web.json")

API = "https://www.zhihu.com/api/vip/km-indep-home-comm/billboard/list"
REFERER_TPL = "https://story.zhihu.com/vip-ranking?channel={channel}"

# 网页真实 7 个 tab（中文显示名 -> 接口 tab_type）
TABS = [
    ("盐气榜", "recommend"),
    ("热度榜", "hot"),
    ("长篇榜", "well"),
    ("新书榜", "new_book"),
    ("口碑榜", "reputation"),
    ("潜力榜", "potential"),
    ("互动榜", "interactive"),
]


def _norm_item(c):
    labels = c.get("labels") or []
    if not isinstance(labels, list):
        labels = []
    inter = (c.get("interaction_text") or "").strip()
    parts = [str(x).strip() for x in labels if x]
    if inter:
        parts.append(inter)
    tag = " · ".join(parts)
    return {
        # 归一化四字段（与 notes.js / rank.json 兼容）
        "t": c.get("title") or c.get("name") or "",
        "a": (c.get("author_text") or "").strip(),
        "tag": tag,
        "d": (c.get("content_abstract") or "").strip(),
        # 原始富字段（保留完整信息）
        "url": c.get("url") or "",
        "labels": labels,
        "interaction": inter,
        "artwork": c.get("artwork") or c.get("tab_artwork") or "",
        "type": c.get("type") or "",
        "id": c.get("id") or c.get("work_id") or "",
    }


def fetch_tab(channel, tab_type, limit):
    params = {
        "channel_type": channel,
        "filter_key": "0",
        "limit": str(limit),
        "offset": "0",
        "tab_type": tab_type,
    }
    url = API + "?" + urllib.parse.urlencode(params)
    hdr = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
            "AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": REFERER_TPL.format(channel=channel),
        "x-requested-with": "fetch",
    }
    req = urllib.request.Request(url, headers=hdr)
    body = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    obj = json.loads(body)
    data = obj.get("data") or []
    if not isinstance(data, list):
        data = []
    return data


def scrape_web(channels=("female",), limit=50):
    result = {"fetchedAt": "", "channels": {}}
    for ch in channels:
        lists = []
        for cn, tt in TABS:
            try:
                raw = fetch_tab(ch, tt, limit)
            except Exception as e:
                print(f"  [warn][{ch}] {cn}({tt}) 抓取失败：{e}", file=sys.stderr)
                raw = []
            items = [_norm_item(c) for c in raw]
            # 去空书名
            items = [it for it in items if it["t"]]
            lists.append({"name": cn, "type": tt, "items": items})
            authors = sum(1 for it in items if it["a"])
            print(f"  [{ch}] {cn}({tt}): {len(items)} 本，含作者 {authors} 本")
        result["channels"][ch] = {
            "source": REFERER_TPL.format(channel=ch),
            "channel": ch,
            "lists": lists,
        }
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channels", nargs="+", default=["female"])
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    print(f"[web] 抓取网页真实榜单 channels={args.channels} ...")
    data = scrape_web(args.channels, args.limit)
    data["fetchedAt"] = __import__("datetime").date.today().strftime("%Y-%m-%d")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total = 0
    for ch, blob in data["channels"].items():
        ctotal = sum(len(l["items"]) for l in blob["lists"])
        total += ctotal
        print(f"[web]   {ch}: {len(blob['lists'])} 个榜，共 {ctotal} 本")
    print(
        f"[web] 已落盘 {args.out}：{len(data['channels'])} 个频道，共 {total} 本书。"
    )


if __name__ == "__main__":
    main()
