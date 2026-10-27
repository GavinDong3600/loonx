#!/usr/bin/env python3
"""Generate two PNG GitHub Rising posters and a matching latest.json for Loon."""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "github-rising"
BASE = "https://raw.githubusercontent.com/GavinDong3600/loonx/main/assets/github-rising/"
TZ = timezone(timedelta(hours=8))
BG, CARD = "#0b1324", "#152238"
WHITE, SUBTLE, ACCENT, BLUE = "#f5f8ff", "#aabbd5", "#70e5b6", "#87b9ff"

def font(size, bold=False):
    name = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
    for path in ("/usr/share/fonts/opentype/noto/" + name,
                 "/usr/share/fonts/truetype/noto/" + name):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("Install fonts-noto-cjk")

def clean(value, limit=250):
    text = re.sub(r"https?://\S+", "", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]

def brief(value):
    s = clean(value)
    if not s:
        return "项目暂无简介"
    if re.search(r"[\u3400-\u9fff]", s):
        clause = re.split(r"[。！!？?；;]", s)[0]
        if len(re.findall(r"[\u3400-\u9fff]", clause)) >= 7:
            s = clause
    return s

def stars(value):
    n = int(value or 0)
    if n >= 1000000:
        return f"{n/1000000:.1f}".rstrip("0").rstrip(".") + "m"
    return (f"{n/1000:.1f}".rstrip("0").rstrip(".") + "k") if n >= 1000 else str(n)

def cut(draw, text, face, width):
    if draw.textlength(text, font=face) <= width:
        return text
    while text and draw.textlength(text + "…", font=face) > width:
        text = text[:-1]
    return text.rstrip(" ,，:：-—") + "…"

def wrap(draw, text, face, width):
    lines, line = [], ""
    for char in clean(text):
        if draw.textlength(line + char, font=face) <= width:
            line += char
        else:
            if line:
                lines.append(line.strip())
            line = char.lstrip()
            if len(lines) >= 2:
                break
    if len(lines) < 2 and line:
        lines.append(line.strip())
    result = lines[:2]
    if result and len("".join(result).replace(" ", "")) < len(clean(text).replace(" ", "")):
        result[-1] = cut(draw, result[-1].rstrip("…") + "…", face, width)
    return result

def fetch():
    now = datetime.now(TZ)
    since = (now.date() - timedelta(days=7)).isoformat()
    qs = urlencode({"q": f"created:>={since} stars:>=5 fork:false",
                    "sort": "stars", "order": "desc", "per_page": 10})
    headers = {"Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28",
               "User-Agent": "loonx-github-rising-poster/2.0"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    with urlopen(Request("https://api.github.com/search/repositories?" + qs,
                         headers=headers), timeout=20) as response:
        data = json.load(response)
    items = []
    for repo in data.get("items", []):
        name = str(repo.get("full_name") or "")
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", name):
            continue
        items.append({"full_name": name, "name": clean(repo.get("name"), 100),
                      "language": clean(repo.get("language") or "其他", 30),
                      "stars": int(repo.get("stargazers_count") or 0),
                      "description": brief(repo.get("description")),
                      "html_url": "https://github.com/" + name})
    if len(items) != 10:
        raise RuntimeError("Expected ten repositories, got " + str(len(items)))
    return now, since, items

def poster(items, date, part, filename):
    w, h = 1080, 1440
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    logo, title = font(28, True), font(64, True)
    small, num, name = font(28), font(43, True), font(38, True)
    count, lang, desc, footer = font(32, True), font(25, True), font(28), font(23)
    d.rounded_rectangle((54, 45, 455, 104), 24, fill="#16374b")
    d.text((78, 58), "GITHUB  /  RISING", font=logo, fill=ACCENT)
    d.text((54, 134), "GitHub 新星日报", font=title, fill=WHITE)
    d.text((58, 230), f"{date}    近 7 天新建 · 累计 Star", font=small, fill=SUBTLE)
    d.rounded_rectangle((786, 218, 1028, 275), 23, fill="#233b59")
    d.text((814, 226), f"TOP {part} / 2", font=small, fill=BLUE)
    for idx, item in enumerate(items):
        y = 330 + idx * 208
        d.rounded_rectangle((48, y, 1032, y + 192), 26, fill=CARD)
        d.text((75, y + 24), f"{(part-1)*5+idx+1:02d}", font=num, fill=ACCENT)
        d.text((154, y + 28), cut(d, item["full_name"], name, 640), font=name, fill=WHITE)
        stat = "★ " + stars(item["stars"])
        d.text((1002 - d.textlength(stat, font=count), y + 35),
               stat, font=count, fill="#ffd681")
        d.text((156, y + 82), cut(d, item["language"], lang, 155), font=lang, fill=BLUE)
        for j, line in enumerate(wrap(d, item["description"], desc, 805)):
            d.text((156, y + 117 + j * 32), line, font=desc, fill=SUBTLE)
    d.line((56, 1372, 1024, 1372), fill="#273950", width=2)
    d.text((60, 1390), "基于 GitHub Search · 非 GitHub 官方 Trending 榜单",
           font=footer, fill=SUBTLE)
    img.save(filename, "PNG", optimize=True)

def main():
    now, since, items = fetch()
    date = now.date().isoformat()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    urls = []
    for part in (1, 2):
        filename = f"{date}-part{part}.png"
        poster(items[(part-1)*5:part*5], date, part, OUTPUT / filename)
        urls.append(BASE + filename)
    manifest = {"version": 1, "date": date, "since": since,
                "generated_at": now.isoformat(timespec="seconds"),
                "sort": "total_stars_of_repositories_created_last_7_days",
                "items": items, "poster_urls": urls}
    (OUTPUT / "latest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for old in OUTPUT.glob("????-??-??-part?.png"):
        try:
            age = (now.date() - datetime.strptime(old.name[:10], "%Y-%m-%d").date()).days
            if age > 14:
                old.unlink()
        except ValueError:
            continue
    print(f"Generated {date}: 10 repositories, two PNGs and latest.json")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Generation failed:", error, file=sys.stderr)
        sys.exit(1)
