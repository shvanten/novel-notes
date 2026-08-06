#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知乎盐言故事（fiore vip-web）榜单：抓取 → 归档 → 推送 GitHub。

这是「数据分析及可视化」场景里榜单数据的生产管线。
- 抓取（见 scripts/scrape_impl.py）：
    首选直连 JSON 接口（已实测无需登录/签名）：
      GET https://api.zhihu.com/km-vip-zhihu-web/vip_tab/svip_story?modules=billboard
    该接口返回 5 个榜（推荐/热度/口碑/新书/长篇，各 12 本）；
    若接口失败，再回退真实浏览器（Playwright，可带登录 cookie）拦截接口响应。
    接口不返回作者字段，a 保留为空（不丢字段）。
- 归档：
    * data/rank.json               —— 当前实时快照（含「新书榜」，前端会隐藏）
    * data/rank-history/<日期>.json —— 当日归档（剔除「新书榜」，item 仅留 t/a/tag/d）
    * data/rank-history.json       —— 日期清单数组（追加当天，保持有序）
- 推送：仅 add 明确路径（严禁 git add -A），commit 后用 -c http.sslVerify=false 推送，
        规避本机 git 2.54 的 schannel 证书吊销检查失败。

用法：
  python scripts/sync_rank.py                # 抓取 + 归档 + 推送
  python scripts/sync_rank.py --no-push      # 只抓取 + 归档（本地调试，不碰远程）
  python scripts/sync_rank.py --archive-only # 不抓取，用现有 data/rank.json 重新归档当天
  python scripts/sync_rank.py --date 2026-08-06  # 指定归档日期（调试用）

依赖（仅浏览器兜底路径需要）：pip install playwright 并安装系统 Chrome/Edge 即可（无需下载 chromium）。
若接口失效且页面需登录：python scripts/sync_rank.py --cookies scripts/cookies.json
  cookies.json 形如 [{"name":"...","value":"...","domain":".zhihu.com","path":"/"}]
"""
import os, sys, json, argparse, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
RANK_JSON = os.path.join(DATA, "rank.json")
HISTORY_DIR = os.path.join(DATA, "rank-history")
MANIFEST = os.path.join(DATA, "rank-history.json")
SOURCE = "https://www.zhihu.com/fiore/h5/vip-web"
HIDDEN_LIST_NAMES = {"新书榜"}  # 归档每日文件剔除（与前端 HIDDEN_LIST_NAMES 一致）


def today_str():
    return datetime.date.today().strftime("%Y-%m-%d")


def _norm_item(it):
    return {
        "t": it.get("t", "") or it.get("title", ""),
        "a": it.get("a", "") or it.get("author", ""),
        "tag": it.get("tag", "") or it.get("tagText", ""),
        "d": it.get("d", "") or it.get("desc", "") or it.get("description", ""),
    }


def archive(data, date=None, root=ROOT):
    """把一份 rank 数据写入 data/rank.json 与当日归档，并更新清单。返回归档文件路径。"""
    date = date or today_str()
    lists = data.get("lists", [])
    rank_json = os.path.join(root, "data", "rank.json")
    history_dir = os.path.join(root, "data", "rank-history")
    manifest = os.path.join(root, "data", "rank-history.json")

    # 1) 当前实时快照（保留全部榜单，含新书榜）
    src = data.get("source") or SOURCE
    cur = {"updatedAt": date, "source": src, "lists": lists}
    os.makedirs(os.path.dirname(rank_json), exist_ok=True)
    with open(rank_json, "w", encoding="utf-8") as f:
        json.dump(cur, f, ensure_ascii=False, indent=2)

    # 2) 当日归档：剔除新书榜，item 仅留 t/a/tag/d
    arch_lists = []
    for L in lists:
        if L.get("name") in HIDDEN_LIST_NAMES:
            continue
        items = [_norm_item(it) for it in L.get("items", [])]
        arch_lists.append({"name": L["name"], "items": items})
    os.makedirs(history_dir, exist_ok=True)
    arch_path = os.path.join(history_dir, date + ".json")
    with open(arch_path, "w", encoding="utf-8") as f:
        json.dump({"date": date, "lists": arch_lists}, f, ensure_ascii=False, indent=2)

    # 3) 更新清单（追加当天，保持有序，不重写历史）
    man = []
    if os.path.exists(manifest):
        try:
            man = json.load(open(manifest, encoding="utf-8"))
        except Exception:
            man = []
    if not isinstance(man, list):
        man = []
    if date not in man:
        man.append(date)
        man.sort()
        with open(manifest, "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, indent=2)
    return arch_path


def git_commit_push(msg, root=ROOT):
    """仅 add 明确路径，commit，并用 -c http.sslVerify=false 推送。返回是否真的提交了。"""
    day_file = os.path.join("data", "rank-history", today_str() + ".json")
    files = ["data/rank.json", "data/rank-history.json", day_file]
    subprocess.run(["git", "-C", root, "add"] + files, check=True)
    if subprocess.run(["git", "-C", root, "diff", "--cached", "--quiet"]).returncode == 0:
        print("[sync] 无变化，跳过提交。")
        return False
    subprocess.run(["git", "-C", root, "commit", "-m", msg], check=True)
    # 远程 URL 已内嵌 token，无需额外认证；-c 仅对该命令生效
    subprocess.run(
        ["git", "-C", root, "-c", "http.sslVerify=false", "push", "origin", "HEAD:main"],
        check=True,
    )
    print("[sync] 已提交并推送到 GitHub。")
    return True


def scrape_rank(cookies_path=""):
    """
    抓取榜单：优先直连接口（scrape_impl.fetch_api），失败回退浏览器。
    返回 {"updatedAt":..., "source":..., "lists":[{name, items:[{t,a,tag,d}]}]}。
    """
    import asyncio
    from scrape_impl import run_scrape
    return asyncio.run(run_scrape(cookies_path=cookies_path))


def main():
    ap = argparse.ArgumentParser(description="知乎盐言故事榜单：抓取→归档→推送")
    ap.add_argument("--no-push", action="store_true", help="只抓取+归档，不推送")
    ap.add_argument("--archive-only", action="store_true", help="不抓取，用现有 rank.json 归档当天")
    ap.add_argument("--date", default="", help="指定归档日期 YYYY-MM-DD（调试）")
    ap.add_argument("--cookies", default="", help="登录 cookie 文件（榜单需登录时）")
    args = ap.parse_args()

    date = args.date or today_str()

    if args.archive_only:
        print("[sync] --archive-only：读取现有 data/rank.json 归档", date)
        data = json.load(open(RANK_JSON, encoding="utf-8"))
    else:
        print("[sync] 抓取榜单中…")
        data = scrape_rank(cookies_path=args.cookies)
        print("[sync] 抓到榜单：", [(L["name"], len(L.get("items", []))) for L in data["lists"]])

    arch_path = archive(data, date=date)
    print("[sync] 已归档：", arch_path)

    if args.no_push:
        print("[sync] --no-push：跳过推送。")
        return
    git_commit_push("chore(rank): 自动归档榜单 %s" % date)


if __name__ == "__main__":
    main()
