# 来源与 Provider 策略

## 路由

- 中文、中国市场、中国政策和中文舆情：优先智谱 Web Search Prime `web_search_prime`。
- 外文、国际市场、海外公司与英文文献：优先 Tavily `web_search`。
- 用户给出 URL 或需要阅读全文：优先智谱 Web Reader `webReader`。
- 智谱读页失败：先 Tavily Extract（LinHub `web_read`），仍失败或需要站点级内容时使用 Tavily Crawl（LinHub `web_crawl`）。
- GitHub 仓库文档、Issue、Commit：优先智谱 Zread。
- 混合主题按研究子任务分别选择中文和外文来源，不要无条件让每个查询同时调用全部引擎。

## 来源评级

1. 原始来源：政府、监管、论文、公司公告、产品文档、数据集。
2. 高质量二手来源：主流媒体、专业研究机构、行业数据库。
3. 一般来源：聚合文章、转载、营销内容，仅用于发现线索。

关键结论优先使用一级来源，争议事实至少寻找两个独立来源。记录发布日期和访问日期，去除参数不同但正文相同的重复 URL。
