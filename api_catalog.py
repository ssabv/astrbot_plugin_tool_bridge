# -*- coding: utf-8 -*-
"""常用公开接口清单（2026-11-23 通过 AstrBot 全局代理实测）。

status:
  ok        通过插件 HTTP 代理可用（直连结果只作参考）
  ok_proxy  只有走代理时才稳定可用
  key       可达，但必须配置 API Key
  unstable  可达但有限流、偶发超时或反爬
  blocked   已实测不可用，不要再尝试

插件运行在全局代理环境，直连不一定可达；本清单以 http_tool_proxy 的实测结果为准。
template 里的 {关键词}、{ID}、{城市} 等由工具模型替换；
含中文的关键词/地名需要 URL 编码。

build_catalog_hint() 只把 ok / ok_proxy 的条目注入提示词；key、unstable、
blocked 只在控制台展示，避免工具模型把轮次浪费在不可用接口上。
"""

from __future__ import annotations

CATALOG_VERIFIED_AT = "2026-11-23"
# TMDB 官方文档长期使用的公开示例 v3 Key，可直接调用；失效时可在插件配置里覆盖。
TMDB_PUBLIC_API_KEY = "3fd2be6f0c70a2a598f084ddfb75487c"

CATEGORY_ORDER = [
    "动画/漫画",
    "影视",
    "天气/地理",
    "加密货币",
    "金融",
    "新闻/热榜",
    "搜索",
    "百科",
    "学术/图书",
    "开发",
    "翻译",
    "IP/地理",
    "时间/杂项",
]


def _entry(
    id_: str,
    category: str,
    name: str,
    template: str,
    *,
    method: str = "GET",
    status: str = "ok",
    via: str = "both",
    note: str = "",
    prompt: bool = True,
) -> dict:
    return {
        "id": id_,
        "category": category,
        "name": name,
        "method": method,
        "template": template,
        "status": status,
        "via": via,
        "note": note,
        "prompt": prompt,
    }


API_CATALOG: list[dict] = [
    # ------------------------------ 动画 / 漫画 ------------------------------ #
    _entry(
        "bangumi_calendar", "动画/漫画", "Bangumi 每日放送",
        "https://api.bgm.tv/calendar",
        note="当前季度每日放送表，无参数。",
    ),
    _entry(
        "bangumi_search", "动画/漫画", "Bangumi 番剧搜索",
        "https://api.bgm.tv/search/subject/{关键词}?type=2&responseGroup=small&max_results=10",
        note="type=2 动画；更新时间路由内部会用 large 取 air_date、eps_count。",
    ),
    _entry(
        "bangumi_episodes", "动画/漫画", "Bangumi 分集放送日期",
        "https://api.bgm.tv/v0/episodes?subject_id={ID}&type=0&limit=100&offset=0",
        note="动画更新时间首选；airdate 精确到天，不含具体时刻。",
    ),
    _entry(
        "bangumi_book_search", "动画/漫画", "Bangumi 书籍搜索",
        "https://api.bgm.tv/search/subject/{关键词}?type=1&responseGroup=small&max_results=10",
        note="type=1 漫画/轻小说/书籍。",
    ),
    _entry(
        "bangumi_subject", "动画/漫画", "Bangumi 条目详情",
        "https://api.bgm.tv/v0/subjects/{ID}",
        note="放送开始、话数、平台、简介、评分。",
    ),
    _entry(
        "anilist", "动画/漫画", "AniList GraphQL",
        "https://graphql.anilist.co（POST GraphQL）",
        method="POST",
        status="ok_proxy", via="proxy",
        note="可按标题/季节查番剧、放送状态与集数；直连偶发超时。",
        prompt=False,
    ),
    _entry(
        "kitsu", "动画/漫画", "Kitsu",
        "https://kitsu.io/api/edge/anime?filter[text]={关键词}&page[limit]=5",
        note="英文标题检索，JSON:API 格式。",
    ),
    _entry(
        "shikimori", "动画/漫画", "Shikimori",
        "https://shikimori.one/api/animes?search={关键词}&limit=5",
        note="俄站番剧库，响应较慢但可用。",
    ),
    _entry(
        "bilibili_bangumi", "动画/漫画", "B站番剧搜索",
        "https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword={关键词}",
        status="unstable", via="proxy",
        note="插件已自动带 B站 Referer，但仍会间歇触发 412 风控；搜索优先用 Bangumi。",
        prompt=False,
    ),
    _entry(
        "moegirl", "动画/漫画", "萌娘百科 API",
        "https://zh.moegirl.org.cn/api.php?action=query&format=json&list=search&srsearch={关键词}",
        status="blocked", via="none",
        note="返回 200 但 action-notallowed（Unauthorized API call）。",
        prompt=False,
    ),
    _entry(
        "jikan", "动画/漫画", "Jikan (MyAnimeList)",
        "https://api.jikan.moe/v4/anime?q={关键词}&limit=5",
        status="blocked", via="none",
        note="TLS 握手失败/连接被重置，直连和代理均不可用。",
        prompt=False,
    ),
    # -------------------------------- 影视 -------------------------------- #
    _entry(
        "tmdb", "影视", "TMDB 影视搜索",
        "https://api.themoviedb.org/3/search/movie"
        f"?api_key={TMDB_PUBLIC_API_KEY}&query={{关键词}}&language=zh-CN",
        status="ok", via="both",
        note="公开示例 Key 已内置，可直接调用；失效时可在插件配置中换成自己的 v3 Key。",
    ),
    _entry(
        "tvmaze", "影视", "TVmaze 剧集搜索",
        "https://api.tvmaze.com/search/shows?q={关键词}",
        note="欧美剧集/播出信息，无需 Key。",
    ),
    _entry(
        "omdb", "影视", "OMDb",
        "https://www.omdbapi.com/?apikey={KEY}&s={关键词}",
        status="key", via="both",
        note="必须配置 OMDb Key。",
        prompt=False,
    ),
    _entry(
        "trakt", "影视", "Trakt",
        "https://api.trakt.tv/movies/trending?limit=10",
        status="key", via="both",
        note="需要 client_id / trakt-api-key，未配置返回 403。",
        prompt=False,
    ),
    _entry(
        "douban", "影视", "豆瓣 API",
        "https://api.douban.com/v2/movie/search?q={关键词}",
        status="blocked", via="none",
        note="公开 API 已关闭，实测 403。",
        prompt=False,
    ),
    # ------------------------------ 天气 / 地理 ------------------------------ #
    _entry(
        "open_meteo_geo", "天气/地理", "Open-Meteo 地名解析",
        "https://geocoding-api.open-meteo.com/v1/search?name={城市}&count=1&language=zh&format=json",
        note="中文地名转经纬度。",
    ),
    _entry(
        "open_meteo_forecast", "天气/地理", "Open-Meteo 天气预报",
        "https://api.open-meteo.com/v1/forecast?latitude={纬度}&longitude={经度}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=3",
        note="当前天气 + 未来 3 天；插件天气路由已内置。",
    ),
    _entry(
        "open_meteo_air", "天气/地理", "Open-Meteo 空气质量",
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={纬度}&longitude={经度}&current=pm2_5,us_aqi",
        note="PM2.5、US AQI。",
    ),
    _entry(
        "wttr", "天气/地理", "wttr.in",
        "https://wttr.in/{城市}?format=j1",
        note="JSON 天气，支持中英文城市名。",
    ),
    _entry(
        "metno", "天气/地理", "MET Norway",
        "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={纬度}&lon={经度}",
        note="需要自定义 User-Agent。",
        prompt=False,
    ),
    _entry(
        "7timer", "天气/地理", "7Timer",
        "https://www.7timer.info/bin/astro.php?lon={经度}&lat={纬度}&ac=1&unit=metric&output=json",
        note="天文/天气简表。",
        prompt=False,
    ),
    _entry(
        "weather_cn", "天气/地理", "中国天气网旧接口",
        "http://www.weather.com.cn/data/sk/101010100.html",
        note="城市 ID 查询；接口较老，作为国内直连备用。",
        prompt=False,
    ),
    _entry(
        "qq_weather", "天气/地理", "QQ 天气",
        "https://wis.qq.com/weather/common?source=pc&weather_type=observe&province={省}&city={市}",
        note="中文省市，实测返回 JSON；需 URL 编码。",
    ),
    _entry(
        "nominatim", "天气/地理", "OpenStreetMap Nominatim",
        "https://nominatim.openstreetmap.org/search?q={地名}&format=json&limit=1",
        note="需要 User-Agent，遵守 1 次/秒限速。",
        prompt=False,
    ),
    _entry(
        "photon", "天气/地理", "Photon 地理编码",
        "https://photon.komoot.io/api/?q={地名}&limit=1",
        note="OSM 地名搜索，无需 Key。",
        prompt=False,
    ),
    # ------------------------------ 加密货币 ------------------------------ #
    _entry(
        "coingecko", "加密货币", "CoinGecko 币价",
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=cny,usd",
        note="插件币价路由已内置；偶发代理超时，重试即可。",
    ),
    _entry(
        "binance", "加密货币", "Binance 行情",
        "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
        note="现货最新价，无需 Key。",
    ),
    _entry(
        "okx", "加密货币", "OKX 行情",
        "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
        note="现货 ticker，无需 Key。",
    ),
    _entry(
        "coinbase", "加密货币", "Coinbase 现货",
        "https://api.coinbase.com/v2/prices/BTC-USD/spot",
        note="USD 现货价。",
    ),
    _entry(
        "kraken", "加密货币", "Kraken 行情",
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
        note="XBT/USD ticker。",
    ),
    _entry(
        "cryptocompare", "加密货币", "CryptoCompare",
        "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD,CNY",
        status="key", via="both",
        note="实测 401，需要 API Key。",
        prompt=False,
    ),
    _entry(
        "coincap", "加密货币", "CoinCap",
        "https://api.coincap.io/v2/assets/bitcoin",
        status="blocked", via="none",
        note="实测 530（Cloudflare 源站错误）。",
        prompt=False,
    ),
    # -------------------------------- 金融 -------------------------------- #
    _entry(
        "tencent_quote", "金融", "腾讯股票行情",
        "https://qt.gtimg.cn/q=sh000001,sz399001",
        note="A 股/指数文本行情，GBK 编码。",
    ),
    _entry(
        "sina_quote", "金融", "新浪股票行情",
        "https://hq.sinajs.cn/list=sh000001",
        note="插件已自动带新浪财经 Referer；不带 Referer 会 403。",
    ),
    _entry(
        "eastmoney", "金融", "东方财富行情",
        "https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=f43,f57,f58",
        status="unstable", via="proxy",
        note="偶发连接重置；失败后改用腾讯/新浪。",
        prompt=False,
    ),
    _entry(
        "yahoo_finance", "金融", "Yahoo Finance",
        "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d",
        note="美股/指数/外汇历史与最新价。",
    ),
    _entry(
        "frankfurter", "金融", "Frankfurter 汇率",
        "https://api.frankfurter.app/latest?from=CNY&to=USD",
        note="欧洲央行参考汇率，无 Key。",
    ),
    _entry(
        "er_api", "金融", "open.er-api 汇率",
        "https://open.er-api.com/v6/latest/CNY",
        note="插件提示词里的默认汇率源。",
    ),
    _entry(
        "exchangerate_api", "金融", "ExchangeRate-API",
        "https://api.exchangerate-api.com/v4/latest/CNY",
        note="汇率备用源。",
        prompt=False,
    ),
    _entry(
        "ecb", "金融", "欧洲央行汇率 XML",
        "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
        note="官方 EUR 参考汇率；解析 XML。",
        prompt=False,
    ),
    _entry(
        "gold_api", "金融", "Gold API",
        "https://api.gold-api.com/price/XAU",
        note="黄金现货 USD/盎司，无 Key。",
    ),
    _entry(
        "stooq", "金融", "Stooq CSV",
        "https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv",
        status="blocked", via="none",
        note="实测 404，接口路径已失效。",
        prompt=False,
    ),
    # ------------------------------ 新闻 / 热榜 ------------------------------ #
    _entry(
        "baidu_board", "新闻/热榜", "百度热搜网页",
        "https://top.baidu.com/board?tab=realtime",
        note="HTML，需抓正文；可作热榜兜底。",
    ),
    _entry(
        "baidu_api", "新闻/热榜", "百度热搜 API",
        "https://top.baidu.com/api/board?platform=wise&tab=realtime",
        note="JSON，比网页更干净。",
    ),
    _entry(
        "bilibili_popular", "新闻/热榜", "B站热门",
        "https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1",
        note="公开热门列表，无需 Referer。",
    ),
    _entry(
        "bilibili_rank", "新闻/热榜", "B站排行榜",
        "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all",
        status="unstable", via="proxy",
        note="实测间歇返回 code=-352 风控；热榜优先用 B站热门。",
        prompt=False,
    ),
    _entry(
        "toutiao_hot", "新闻/热榜", "头条热榜",
        "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        note="JSON 热榜。",
    ),
    _entry(
        "hackernews", "新闻/热榜", "Hacker News",
        "https://hacker-news.firebaseio.com/v0/topstories.json",
        note="科技新闻 ID 列表；再取 item。",
        prompt=False,
    ),
    _entry(
        "google_news", "新闻/热榜", "Google News RSS",
        "https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
        note="中文新闻 RSS。",
    ),
    _entry(
        "weibo_hot", "新闻/热榜", "微博热搜",
        "https://weibo.com/ajax/side/hotSearch",
        status="blocked", via="none",
        note="实测 403，需要登录/签名。",
        prompt=False,
    ),
    _entry(
        "zhihu_hot", "新闻/热榜", "知乎热榜",
        "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10",
        status="blocked", via="none",
        note="实测 401，需要登录。",
        prompt=False,
    ),
    _entry(
        "bing_news", "新闻/热榜", "Bing News RSS",
        "https://www.bing.com/news/search?q={关键词}&format=rss",
        status="blocked", via="none",
        note="format=rss 已失效，实际返回 HTML 搜索页。",
        prompt=False,
    ),
    # -------------------------------- 搜索 -------------------------------- #
    _entry(
        "bing_html", "搜索", "Bing 网页搜索",
        "https://www.bing.com/search?q={关键词}",
        note="HTML 搜索页；需要正文抽取。",
        prompt=False,
    ),
    _entry(
        "mojeek", "搜索", "Mojeek 搜索",
        "https://www.mojeek.com/search?q={关键词}",
        note="独立搜索引擎，HTML 结果。",
        prompt=False,
    ),
    _entry(
        "ddg_html", "搜索", "DuckDuckGo HTML",
        "https://html.duckduckgo.com/html/?q={关键词}",
        status="blocked", via="none",
        note="实测 202 反爬挑战页，不适合直接抓。",
        prompt=False,
    ),
    # -------------------------------- 百科 -------------------------------- #
    _entry(
        "wikipedia_api", "百科", "中文维基 API",
        "https://zh.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch={关键词}",
        note="搜索条目，JSON。",
    ),
    _entry(
        "wikipedia_rest", "百科", "中文维基摘要",
        "https://zh.wikipedia.org/api/rest_v1/page/summary/{条目标题}",
        note="直接取条目摘要。",
    ),
    _entry(
        "wikidata", "百科", "Wikidata 搜索",
        "https://www.wikidata.org/w/api.php?action=wbsearchentities&search={关键词}&language=zh&format=json&limit=5",
        note="实体 ID 与描述。",
        prompt=False,
    ),
    _entry(
        "wiktionary", "百科", "中文维基词典",
        "https://zh.wiktionary.org/w/api.php?action=query&format=json&list=search&srsearch={词语}",
        note="词语释义搜索。",
        prompt=False,
    ),
    _entry(
        "baidu_baike", "百科", "百度百科",
        "https://baike.baidu.com/item/{词条}",
        status="blocked", via="none",
        note="实测 403。",
        prompt=False,
    ),
    # ----------------------------- 学术 / 图书 ----------------------------- #
    _entry(
        "crossref", "学术/图书", "Crossref",
        "https://api.crossref.org/works?query={关键词}&rows=3",
        note="论文元数据/DOI。",
    ),
    _entry(
        "openalex", "学术/图书", "OpenAlex",
        "https://api.openalex.org/works?search={关键词}&per-page=3",
        note="开放学术图谱；偶发 TLS 重试。",
    ),
    _entry(
        "pubmed", "学术/图书", "PubMed E-utilities",
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={关键词}&retmode=json&retmax=3",
        note="生物医学文献检索。",
    ),
    _entry(
        "arxiv", "学术/图书", "arXiv",
        "http://export.arxiv.org/api/query?search_query=all:{关键词}&max_results=3",
        note="预印本检索，返回 Atom XML。",
    ),
    _entry(
        "semanticscholar", "学术/图书", "Semantic Scholar",
        "https://api.semanticscholar.org/graph/v1/paper/search?query={关键词}&limit=3",
        status="unstable", via="proxy",
        note="匿名调用常 429，需要重试或 API Key。",
        prompt=False,
    ),
    _entry(
        "openlibrary", "学术/图书", "Open Library",
        "https://openlibrary.org/search.json?q={关键词}&limit=3",
        status="blocked", via="none",
        note="代理实测连续 502，暂不作为图书搜索数据源。",
        prompt=False,
    ),
    _entry(
        "google_books", "学术/图书", "Google Books",
        "https://www.googleapis.com/books/v1/volumes?q={关键词}&maxResults=3",
        status="unstable", via="both",
        note="匿名调用常见 429。",
        prompt=False,
    ),
    # -------------------------------- 开发 -------------------------------- #
    _entry(
        "github_search", "开发", "GitHub 仓库搜索",
        "https://api.github.com/search/repositories?q={关键词}&per_page=5",
        note="匿名搜索有频率限制；403 时改用网页或 web_search。",
    ),
    _entry(
        "github_repo", "开发", "GitHub 仓库详情",
        "https://api.github.com/repos/{owner}/{repo}",
        status="unstable", via="both",
        note="匿名 60 次/小时后 403；重要查询需 Token。",
        prompt=False,
    ),
    _entry(
        "gitlab", "开发", "GitLab 项目搜索",
        "https://gitlab.com/api/v4/projects?search={关键词}&per_page=5",
        note="公开项目搜索。",
        prompt=False,
    ),
    _entry(
        "npm", "开发", "npm registry",
        "https://registry.npmjs.org/{包名}/latest",
        note="Node 包最新版本。",
        prompt=False,
    ),
    _entry(
        "pypi", "开发", "PyPI JSON",
        "https://pypi.org/pypi/{包名}/json",
        note="Python 包元数据。",
        prompt=False,
    ),
    _entry(
        "crates", "开发", "crates.io",
        "https://crates.io/api/v1/crates/{crate}",
        note="Rust crate 元数据。",
        prompt=False,
    ),
    _entry(
        "maven", "开发", "Maven Central",
        "https://search.maven.org/solrsearch/select?q={查询}&rows=3&wt=json",
        note="Java 依赖检索。",
        prompt=False,
    ),
    _entry(
        "stackexchange", "开发", "StackExchange API",
        "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q={关键词}&site=stackoverflow&pagesize=3",
        note="Stack Overflow 问答检索。",
        prompt=False,
    ),
    _entry(
        "dockerhub", "开发", "Docker Hub",
        "https://hub.docker.com/v2/repositories/library/{镜像}/",
        note="镜像标签/拉取数。",
        prompt=False,
    ),
    _entry(
        "homebrew", "开发", "Homebrew API",
        "https://formulae.brew.sh/api/formula/{formula}.json",
        note="macOS 软件包信息。",
        prompt=False,
    ),
    # -------------------------------- 翻译 -------------------------------- #
    _entry(
        "mymemory", "翻译", "MyMemory 翻译",
        "https://api.mymemory.translated.net/get?q={文本}&langpair=en%7Czh-CN",
        note="免费翻译，匿名有配额。",
    ),
    _entry(
        "libretranslate", "翻译", "LibreTranslate",
        "https://libretranslate.com/translate（POST JSON）",
        method="POST",
        status="key", via="both",
        note="需要 API Key；无 Key 返回 400。",
        prompt=False,
    ),
    _entry(
        "deepl", "翻译", "DeepL",
        "https://api-free.deepl.com/v2/translate",
        status="key", via="both",
        note="需要 DeepL Auth Key。",
        prompt=False,
    ),
    _entry(
        "lingva", "翻译", "Lingva",
        "https://lingva.ml/api/v1/{源语言}/{目标语言}/{文本}",
        status="blocked", via="none",
        note="实测 403。",
        prompt=False,
    ),
    _entry(
        "google_translate", "翻译", "Google Translate 非官方",
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q={文本}",
        status="blocked", via="none",
        note="TLS 握手失败，直连和代理均不可用。",
        prompt=False,
    ),
    # ------------------------------ IP / 地理 ------------------------------ #
    _entry(
        "ipapi", "IP/地理", "ipapi.co",
        "https://ipapi.co/{IP}/json/",
        note="IP 归属地；不填 IP 查询本机。",
        prompt=False,
    ),
    _entry(
        "ipinfo", "IP/地理", "ipinfo.io",
        "https://ipinfo.io/{IP}/json",
        note="IP 归属地，匿名有配额。",
        prompt=False,
    ),
    _entry(
        "ip_api", "IP/地理", "ip-api.com",
        "http://ip-api.com/json/{IP}?lang=zh-CN",
        note="免费版仅 HTTP；不要传敏感查询。",
        prompt=False,
    ),
    _entry(
        "ipwho", "IP/地理", "ipwho.is",
        "https://ipwho.is/{IP}",
        note="IP 归属地，HTTPS。",
        prompt=False,
    ),
    # ------------------------------ 时间 / 杂项 ------------------------------ #
    _entry(
        "timeapi", "时间/杂项", "timeapi.io",
        "https://timeapi.io/api/Time/current/zone?timeZone={时区}",
        note="当前时间；代理偶发 502，重试即可。",
        prompt=False,
    ),
    _entry(
        "nager_holidays", "时间/杂项", "Nager 节假日",
        "https://date.nager.at/api/v3/PublicHolidays/{年份}/{国家代码}",
        note="公共节假日。",
        prompt=False,
    ),
    _entry(
        "usgs_quake", "时间/杂项", "USGS 地震",
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
        note="最近 24 小时地震。",
        prompt=False,
    ),
    _entry(
        "iss", "时间/杂项", "ISS 位置",
        "http://api.open-notify.org/iss-now.json",
        note="国际空间站实时经纬度。",
        prompt=False,
    ),
    _entry(
        "restcountries", "时间/杂项", "REST Countries",
        "https://restcountries.com/v3.1/name/{国家}",
        note="国家概况；偶发慢。",
        prompt=False,
    ),
    _entry(
        "universities", "时间/杂项", "Universities API",
        "http://universities.hipolabs.com/search?name={关键词}",
        note="大学列表。",
        prompt=False,
    ),
    _entry(
        "dictionary", "时间/杂项", "Dictionary API",
        "https://api.dictionaryapi.dev/api/v2/entries/en/{单词}",
        note="英文词典。",
        prompt=False,
    ),
    _entry(
        "musicbrainz", "时间/杂项", "MusicBrainz",
        "https://musicbrainz.org/ws/2/artist?query={关键词}&fmt=json&limit=3",
        status="ok_proxy", via="proxy",
        note="需要 User-Agent；直连偶发 503。",
        prompt=False,
    ),
    _entry(
        "lyrics", "时间/杂项", "Lyrics.ovh",
        "https://api.lyrics.ovh/v1/{歌手}/{歌名}",
        note="歌词查询；代理可用。",
        prompt=False,
    ),
    _entry(
        "themealdb", "时间/杂项", "TheMealDB",
        "https://www.themealdb.com/api/json/v1/1/search.php?s={菜名}",
        note="菜谱搜索。",
        prompt=False,
    ),
    _entry(
        "dogceo", "时间/杂项", "Dog CEO",
        "https://dog.ceo/api/breeds/image/random",
        note="随机狗图。",
        prompt=False,
    ),
    _entry(
        "zippopotam", "时间/杂项", "Zippopotam",
        "https://api.zippopotam.us/{国家}/{邮编}",
        note="邮编转地名。",
        prompt=False,
    ),
    _entry(
        "mathjs", "时间/杂项", "Math.js",
        "https://api.mathjs.org/v4/?expr={表达式}",
        note="数学表达式计算。",
        prompt=False,
    ),
    _entry(
        "qrserver", "时间/杂项", "QR Server",
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={文本}",
        note="生成二维码图片。",
        prompt=False,
    ),
    _entry(
        "worldtimeapi", "时间/杂项", "WorldTimeAPI",
        "https://worldtimeapi.org/api/timezone/{时区}",
        status="blocked", via="none",
        note="TLS 握手失败，直连和代理均不可用；改用 timeapi.io。",
        prompt=False,
    ),
]


# Include every verified, readable GET source. Search-engine HTML belongs to
# the fallback phase; raw image generation isn't readable by the HTTP tool.
for _item in API_CATALOG:
    if (_item["status"] in ("ok", "ok_proxy")
            and (_item.get("method") or "GET").upper() == "GET"
            and _item["id"] not in ("bing_html", "mojeek", "qrserver")):
        _item["prompt"] = True

STATUS_LABELS = {
    "ok": "可用",
    "ok_proxy": "代理可用",
    "key": "需 Key",
    "unstable": "不稳定",
    "blocked": "不可用",
}


def build_catalog_hint(
    tmdb_api_key: str = "",
    disabled_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> str:
    """生成注入工具模型的紧凑清单，只列实测可用的接口。"""
    lines = [f"【常用接口实测清单（{CATALOG_VERIFIED_AT}，全局代理）】"]
    tmdb_key = (tmdb_api_key or TMDB_PUBLIC_API_KEY).strip()
    disabled = {str(item) for item in (disabled_ids or ())}
    for category in CATEGORY_ORDER:
        items = [
            item for item in API_CATALOG
            if item["category"] == category
            and item["status"] in ("ok", "ok_proxy")
            and item.get("prompt", True)
            and item["id"] not in disabled
            and (item.get("method") or "GET").upper() == "GET"
        ]
        if not items:
            continue
        chunks = []
        for item in items:
            suffix = "（需代理）" if item["status"] == "ok_proxy" else ""
            template = item["template"]
            if item["id"] == "tmdb":
                template = template.replace(TMDB_PUBLIC_API_KEY, tmdb_key)
            purpose = item.get("note", "")
            chunks.append(f"{item['name']}{suffix} {template}" + (f"（{purpose}）" if purpose else ""))
        lines.append(f"· {category}：" + "；".join(chunks))
    lines.append(
        "· 中文关键词/地名必须 URL 编码；接口返回 4xx/5xx、超时或无结果时才改用 web_search。"
    )
    return "\n".join(lines)
