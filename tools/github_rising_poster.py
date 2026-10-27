#!/usr/bin/env python3
"""Generate one compact Top 10 PNG and a matching latest.json for Loon."""
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
               "User-Agent": "loonx-github-rising-poster/2.1"}
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

def poster(items, date, filename):
    """Fit all ten repositories into a single notification-friendly 1080x1920 PNG."""
    w, h = 1080, 1920
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    label, heading = font(28, True), font(65, True)
    small, number = font(27), font(37, True)
    name_face, stars_face = font(37, True), font(30, True)
    meta_face, desc_face, foot_face = font(26, True), font(29), font(24)

    d.rounded_rectangle((54, 48, 456, 106), 25, fill="#16374b")
    d.text((79, 60), "GITHUB  /  RISING", font=label, fill=ACCENT)
    d.text((54, 132), "GitHub 新星日报", font=heading, fill=WHITE)
    d.text((58, 234), f"{date}  ·  近7天新建  ·  总 Star 排序", font=small, fill=SUBTLE)

    # 10 cards, each 133px high, separated by 18px for good visual rhythm.
    # The final card ends at 1819, leaving room for the footer.
    for idx, item in enumerate(items):
        y = 310 + idx * 151
        d.rounded_rectangle((48, y, 1032, y + 133), 23, fill=CARD)
        d.text((75, y + 27), f"{idx + 1:02d}", font=number, fill=ACCENT)

        stat = "★ " + stars(item["stars"])
        stat_width = d.textlength(stat, font=stars_face)
        star_x = 1000 - stat_width
        d.text((star_x, y + 28), stat, font=stars_face, fill="#ffd681")
        display_name = clean(item.get("name") or item["full_name"].split("/")[-1], 100)
        d.text((154, y + 22), cut(d, display_name, name_face, star_x - 175),
               font=name_face, fill=WHITE)

        language = cut(d, clean(item.get("language") or "其他", 30), meta_face, 160)
        d.text((156, y + 83), language, font=meta_face, fill=BLUE)
        x = 156 + d.textlength(language, font=meta_face) + 20
        d.text((x, y + 83), "·", font=meta_face, fill=SUBTLE)
        desc_x = x + 28
        description = clean(item.get("description") or "项目暂无简介", 230)
        # One short line per item keeps all Top 10 visible in the poster.
        d.text((desc_x, y + 81), cut(d, description, desc_face, 995 - desc_x),
               font=desc_face, fill=SUBTLE)

    d.line((58, 1856, 1022, 1856), fill="#273950", width=2)
    d.text((61, 1873), "来源 GitHub Search · 非官方 Trending · 累计 Star 排名",
           font=foot_face, fill=SUBTLE)
    img.save(filename, "PNG", optimize=True)

def main():
    now, since, items = fetch()
    date = now.date().isoformat()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    filename = f"{date}.png"
    poster(items, date, OUTPUT / filename)
    manifest = {"version": 2, "date": date, "since": since,
                "generated_at": now.isoformat(timespec="seconds"),
                "sort": "total_stars_of_repositories_created_last_7_days",
                "items": items, "poster_url": BASE + filename}
    (OUTPUT / "latest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Remove legacy two-part posters. Keep dated single-image history for 14 days.
    for old in OUTPUT.glob("????-??-??-part?.png"):
        old.unlink()
    for old in OUTPUT.glob("????-??-??.png"):
        try:
            age = (now.date() - datetime.strptime(old.name[:10], "%Y-%m-%d").date()).days
            if age > 14:
                old.unlink()
        except ValueError:
            continue
    print(f"Generated {date}: 10 repositories, one 1080x1920 PNG and latest.json")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Generation failed:", error, file=sys.stderr)
        sys.exit(1)
