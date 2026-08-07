#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知乎盐言故事榜单：抓取 → 归档 → 推送 GitHub。

这是「数据分析及可视化」场景里榜单数据的生产管线。
- 抓取（见 scripts/scrape_web.py）：
    改用网页真实榜单接口（km-indep-home-comm/billboard/list），纯 urllib 直连，免登录免签名。
    抓取「网页真实 7 榜」（盐气/热度/长篇/新书/口碑/潜力/互动）× 男女双频道，全部带作者字段
    （这是相对旧 fiore billboard 接口的关键升级：旧接口无作者、仅 4 榜）。
- 归档（升级为全网最全口径）：
    * data/rank.json               —— 当前实时快照（扁平 lists，每个 list 带 channel；item 含 t/a/tag/d/url 等）
    * data/rank-history/<日期>.json —— 当日归档（同结构，item 仅留 t/a/tag/d，list 带 channel）
    * data/rank-history.json       —— 日期清单数组（追加当天，保持有序）
    * data/rank-web.json           —— 同源源的频道分组快照（与归档同源，便于单独查看）
- 推送：仅 add 明确路径（严禁 git add -A），commit 后用 -c http.sslVerify=false 推送，
        规避本机 git 2.54 的 schannel 证书吊销检查失败。

用法：
  python scripts/sync_rank.py                # 抓取 + 归档 + 推送
  python scripts/sync_rank.py --no-push      # 只抓取 + 归档（本地调试，不碰远程）
  python scripts/sync_rank.py --archive-only # 不抓取，用现有 data/rank.json 重新归档当天
  python scripts/sync_rank.py --date 2026-08-06  # 指定归档日期（调试用）

注：旧 fiore 4 榜抓取实现保留在 scripts/scrape_impl.py，但本管线已不再调用（无作者、仅 4 榜）。
"""
import os, sys, json, argparse, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
RANK_JSON = os.path.join(DATA, "rank.json")
HISTORY_DIR = os.path.join(DATA, "rank-history")
MANIFEST = os.path.join(DATA, "rank-history.json")
SOURCE = "https://www.zhihu.com/fiore/h5/vip-web"
HIDDEN_LIST_NAMES = set()  # 抓取侧已只产出 fiore 首页 4 榜（推荐/热度/口碑/长篇），无需再隐藏


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
    """把一份 rank 数据写入 data/rank.json 与当日归档，并更新清单。返回归档文件路径。
    data 期望含扁平 'lists'（每项 {name, channel, items}）与 'channels'（分组，用于 rank-web.json）。"""
    date = date or today_str()
    lists = data.get("lists", [])
    data["fetchedAt"] = data.get("fetchedAt") or date
    rank_json = os.path.join(root, "data", "rank.json")
    history_dir = os.path.join(root, "data", "rank-history")
    manifest = os.path.join(root, "data", "rank-history.json")
    rank_web = os.path.join(root, "data", "rank-web.json")

    # 1) 当前实时快照（扁平 lists，每个 list 带 channel；item 保留 url 等富字段）
    src = data.get("source") or SOURCE
    cur = {"updatedAt": date, "source": src, "lists": lists}
    os.makedirs(os.path.dirname(rank_json), exist_ok=True)
    with open(rank_json, "w", encoding="utf-8") as f:
        json.dump(cur, f, ensure_ascii=False, indent=2)

    # 1b) 网页全量快照（频道分组，含作者/标签/封面/链接），与归档主源同源
    with open(rank_web, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 2) 当日归档：item 仅留 t/a/tag/d，list 保留 channel（供前端/趋势按频道隔离）
    arch_lists = []
    for L in lists:
        if L.get("name") in HIDDEN_LIST_NAMES:
            continue
        items = [_norm_item(it) for it in L.get("items", [])]
        arch_lists.append({"name": L["name"], "channel": L.get("channel", "female"), "items": items})
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


def _authed_push_url(root):
    """从 origin 远程 URL 提取已内嵌的 token，构造「token 作用户名、密码位留空」的
    推送 URL，避免 git 在无 TTY 环境下弹出密码提示导致自动化失败。
    若无法解析则回退为 'origin'（由调用方决定）。"""
    import re
    try:
        out = subprocess.run(["git", "-C", root, "remote", "get-url", "origin"],
                             capture_output=True, text=True, check=True)
    except Exception:
        return None
    url = out.stdout.strip()
    m = re.match(r"https://([^@/]+)@(github\.com/.+)", url)
    if not m:
        return None
    tok, rest = m.group(1), m.group(2)
    return "https://%s:@%s" % (tok, rest)


def git_commit_push(msg, root=ROOT, date=None):
    """仅 add 明确路径，commit，并用 -c http.sslVerify=false 推送（非交互）。
    返回是否真的提交了。"""
    day_file = os.path.join("data", "rank-history", (date or today_str()) + ".json")
    files = ["data/rank.json", "data/rank-web.json", "data/rank-history.json", day_file]
    subprocess.run(["git", "-C", root, "add"] + files, check=True)
    if subprocess.run(["git", "-C", root, "diff", "--cached", "--quiet"]).returncode == 0:
        print("[sync] 无变化，跳过提交。")
        return False
    subprocess.run(["git", "-C", root, "commit", "-m", msg], check=True)
    # 远程 URL 已内嵌 token；构造非交互推送 URL，并关闭 askpass/凭据助手与 TTY 提示
    push_url = _authed_push_url(root)
    env = dict(os.environ)
    env["GIT_ASKPASS"] = ""
    env["GIT_TERMINAL_PROMPT"] = "0"
    base = ["git", "-C", root, "-c", "http.sslVerify=false", "-c", "credential.helper="]
    if push_url:
        cmd = base + ["push", push_url, "HEAD:main"]
    else:
        cmd = base + ["push", "origin", "HEAD:main"]
    subprocess.run(cmd, check=True, env=env)
    print("[sync] 已提交并推送到 GitHub。")
    return True


def scrape_rank(cookies_path=""):
    """
    抓取榜单：改用网页真实榜单接口（scrape_web.scrape_web），男女双频道 7 榜全量（含作者）。
    返回 {"fetchedAt":..., "channels":{...}, "lists":[{name, channel, items:[{t,a,tag,d,url,...}]}]}。
    注：scrape_web 为纯 urllib 直连，免登录免签名；不再依赖 fiore billboard 接口（无作者、仅 4 榜）。
    """
    from scrape_web import scrape_web
    return scrape_web(channels=("female", "male"))


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
    git_commit_push("chore(rank): 自动归档榜单 %s" % date, date=date)


if __name__ == "__main__":
    main()
