const PRIVATE_KNOWLEDGE_QUERY_PATTERN = new RegExp(
  [
    "知识库(?:里|中|内|里的|中的|里面|内容|文档|资料|报告)",
    "(?:用|基于|根据|检索|搜索|查询|查找|查|看看|读取|从|在|我的).{0,20}知识库",
    "(?:基于|根据).{0,12}知识库.{0,20}(?:文档|文件|报告|资料|材料)?",
  ].join("|"),
  "u"
);
const PRIVATE_MATERIAL_REFERENCE_PATTERN =
  /(?:资料库|已上传|上传的|附件|私有资料|我的资料|检索资料|基于资料|根据资料)/iu;
const ENGLISH_PRIVATE_KNOWLEDGE_QUERY_PATTERN = new RegExp(
  [
    "(?:use|search|query|check|look\\s*up|find|retrieve|read|consult|based\\s+on|according\\s+to).{0,48}(?:(?:selected|my|our|this|the)\\s+)?knowledge\\s*base",
    "(?:use|search|query|check|look\\s*up|find|retrieve|read|consult).{0,48}(?:uploaded|private)\\s+(?:documents?|files?|materials?)",
    "(?:(?:selected|my|our|this)\\s+knowledge\\s*base|(?:uploaded|private)\\s+(?:documents?|files?|materials?)).{0,48}(?:answer|find|search|query|retrieve|read|consult)",
  ].join("|"),
  "iu"
);
const KNOWLEDGE_CAPABILITY_QUERY_PATTERN =
  /(?:知识库检索|资料检索|search_knowledge).{0,12}(?:开(?:启|着|了|吗|没开)?|打开|启用|关闭|关着|可用|支持|能用|有没有|是否)/iu;
const ENGLISH_KNOWLEDGE_CAPABILITY_QUERY_PATTERN =
  /(?:knowledge\s*(?:base|retrieval|search)|search_knowledge).{0,24}(?:enabled|disabled|available|on|off|supported|working)/iu;

const PROJECT_MATERIAL_QUERY_PATTERN =
  /(?:项目资料|项目文件|项目文档|本项目|这个项目|项目里的|项目中的|已上传.{0,6}(?:资料|文件|文档|报告)|上传的.{0,6}(?:资料|文件|文档|报告)|这份.{0,8}(?:资料|文件|文档|报告|总结)|这个.{0,8}(?:资料|文件|文档|报告|总结)|(?:基于|根据).{0,12}(?:资料|文件|文档|报告|材料|总结))/u;
const ENGLISH_PROJECT_MATERIAL_QUERY_PATTERN =
  /(?:project\s+(?:files?|documents?|materials?|reports?)|(?:this|the\s+current|our|my)\s+project).{0,48}(?:answer|find|search|summari[sz]e|read|review|based\s+on|according\s+to)|(?:based\s+on|according\s+to|use|read|review|summari[sz]e).{0,48}(?:project\s+(?:files?|documents?|materials?|reports?)|(?:this|the\s+current|our|my)\s+project)/iu;

const IMAGE_TOOL_QUERY_PATTERN =
  /(?:调用|使用).{0,12}(?:图像生成工具|图片生成工具|生图工具|图片编辑工具|图像编辑工具|generate_image|edit_image)/iu;

const ARTIFACT_TERM_PATTERN =
  /(?:SVG|HTML|React|Canvas|Mermaid|Logo|logo|LOGO|品牌标识|品牌标志|代码|组件|网页|页面|网站|应用|小工具|工具|Artifact|矢量|矢量图|图标|图标组件|流程图|时序图|架构图|ER图|甘特图|图表|表格)/iu;
const NEGATED_ARTIFACT_TERM_PATTERN =
  /(?:不要|别|禁止|不能|不准|不要用|别用|别拿|不要拿).{0,16}(?:SVG|HTML|React|Canvas|Mermaid|Logo|logo|LOGO|品牌标识|品牌标志|代码|组件|网页|页面|Artifact|矢量|矢量图|图标|图标组件)/iu;
const IMAGE_RELATED_ARTIFACT_QUERY_PATTERNS = [
  new RegExp(
    "(?:用|使用|写|做|制作|创建|生成|实现|设计).{0,24}(?:SVG|HTML|React|Canvas|Mermaid|Logo|logo|LOGO|品牌标识|品牌标志|代码|组件|网页|页面|网站|应用|小工具|工具|Artifact|矢量|矢量图|图标|图标组件|流程图|时序图|架构图|ER图|甘特图|图表|表格)",
    "iu"
  ),
  new RegExp(
    "(?:Logo|logo|LOGO|品牌标识|品牌标志|矢量|矢量图).{0,32}(?:创建|生成|实现|写|做|制作|设计|更新|草案|方案)",
    "iu"
  ),
  new RegExp(
    "(?:图片|图像|照片|头像|海报|相册|照片墙).{0,20}(?:压缩|上传|裁剪|编辑器|生成器|管理|预览|标注|处理).{0,20}(?:工具|页面|应用|组件|网页|网站|系统|demo|Demo)?",
    "iu"
  ),
  new RegExp(
    "(?:做|制作|创建|写|实现).{0,16}(?:图片|图像|照片|头像|海报|相册|照片墙).{0,20}(?:压缩|上传|裁剪|编辑器|生成器|管理|预览|标注|处理)",
    "iu"
  ),
];

const IMAGE_EDIT_QUERY_PATTERNS = [
  /(?:P图|修图|改图|编辑图片|编辑图像|编辑这张图|编辑这张图片|编辑这张照片|图片编辑|图像编辑)/iu,
  /(?:这张图|这张图片|这张照片|图片|图像|照片|头像).{0,20}(?:去背景|换背景|抠图|换成|改成|移除|删除|擦除|编辑|修改|调整|美化)/iu,
  /(?:去掉|移除|删除|替换|更换).{0,12}(?:背景|水印|文字|人物|物体)/iu,
];

const IMAGE_GENERATION_QUERY_PATTERNS = [
  IMAGE_TOOL_QUERY_PATTERN,
  /(?:生图|出图|文生图|以图生图)/iu,
  /(?:图片生成|图像生成|生图工具|图片编辑|图像编辑|generate_image|edit_image).{0,12}(?:开(?:启|着|了|吗|没开)?|打开|启用|关闭|关着|可用|支持|能用|有没有|是否)/iu,
  /(?:能|可以|会|支持).{0,8}(?:画图|生图|生成图片|生成图像|编辑图片|修图)/iu,
  new RegExp(
    "(?:生成|创作|画|绘制|做|制作).{0,12}(?:一张|一幅|一个|一款|张|幅|个|款)?.{0,28}(?:图片|图像|插画|照片|海报|头像|壁纸|表情包|封面|贴纸|猫图|狗图)",
    "iu"
  ),
  new RegExp(
    "(?:帮我|给我).{0,8}(?:画|生成|做|制作).{0,36}(?:图片|图像|插画|照片|海报|头像|壁纸|表情包|封面|贴纸|猫|狗|机器人|人物|风景)",
    "iu"
  ),
  /(?:^|[，。！？\s])(?:帮我|给我)?(?:画|绘制)(?!.*(?:流程图|时序图|架构图|ER图|甘特图|图表|函数图|曲线图|表格)).{2,60}/iu,
  /(?:generate|create|draw|make).{0,24}(?:image|picture|photo|avatar|poster|wallpaper|sticker)/iu,
];

const CODE_EXECUTION_QUERY_PATTERNS = [
  new RegExp("(?:调用|使用).{0,12}(?:代码运行工具|run_code)", "iu"),
  /(?:代码运行|run_code).{0,12}(?:开(?:启|着|了|吗|没开)?|打开|启用|关闭|关着|可用|支持|能用|有没有|是否)/iu,
  /(?:运行|执行|跑一下|验证).{0,24}(?:代码|脚本|程序|SQL|JavaScript|TypeScript|Python|JS|TS)|(?:run_code|运行结果|执行结果|输出结果)/iu,
  new RegExp(
    "(?:运行|执行|跑|验证).{0,16}(?:这段|下面|上述|以下|上面|这个|这些|给定|我发的).{0,16}(?:代码|脚本|程序|JavaScript|JS|TypeScript|TS|Python|SQL)",
    "iu"
  ),
  new RegExp(
    "(?:运行|执行|跑|验证).{0,16}(?:代码块|代码片段|脚本|程序)",
    "iu"
  ),
  new RegExp(
    "(?:这段|下面|上述|以下|上面|这个|这些|给定|我发的).{0,16}(?:代码|脚本|程序|JavaScript|JS|TypeScript|TS|Python|SQL).{0,16}(?:运行|执行|跑|输出|打印)",
    "iu"
  ),
  /运行得到的输出|运行结果|执行结果/iu,
];

const CODE_CONCEPT_QUERY_PATTERN = new RegExp(
  [
    "执行计划",
    "运行时",
    "输出格式",
    "时间复杂度",
    "空间复杂度",
    "结果(?:怎么|如何|为什么|原因|分析)",
    "(?:是什么|有哪些|区别|原理|概念)",
  ].join("|"),
  "iu"
);

const CONTEXTUAL_IMAGE_FOLLOW_UP_PATTERNS = [
  /(?:换成|改成|改为|调整为|变成|换个).{0,24}(?:风格|画风|背景|颜色|色调|光线|构图|姿势|人物|效果|尺寸|比例|场景|材质|服装|表情)/iu,
  /(?:风格|画风|背景|颜色|色调|光线|构图|姿势|人物|效果|尺寸|比例|场景|材质|服装|表情).{0,16}(?:换成|改成|改为|调整为|变成)/iu,
  /(?:去掉|移除|删除|加上|增加|替换|更换|保留|突出|弱化).{0,24}(?:背景|水印|文字|人物|物体|元素|颜色|阴影|光线)/iu,
  /^(?:再来|再做|再画|重做|重新生成)(?:一张|一个|一次)?[。！!？?\s]*$/iu,
  /^(?:这个|这张|上一张|刚才那张).{0,24}(?:换|改|调整|重做|不要|不太)/iu,
];

const CONTEXTUAL_CODE_FOLLOW_UP_PATTERN =
  /^(?:跑一下|运行一下|执行一下|试一下|验证一下|看看输出|看看结果|再跑一次|重新运行)[。！!？?\s]*$/iu;

const CONTEXTUAL_WEB_FOLLOW_UP_PATTERN =
  /^(?:再查一下|继续查|继续搜索|搜一下最新的|看看最新的|打开这个|读一下这个|看看这个来源|核实一下)[。！!？?\s]*$/iu;

const CONTEXTUAL_KNOWLEDGE_FOLLOW_UP_PATTERN =
  /^(?:继续检索|再查一下资料|再搜一下资料|用刚才的资料|根据刚才的资料|看看上一份报告|continue\s+(?:the\s+)?(?:knowledge\s+)?search|search\s+(?:the\s+)?(?:same|selected|previous)\s+(?:knowledge\s+base|documents?)\s+again|use\s+(?:the\s+)?(?:same|selected|previous)\s+(?:knowledge\s+base|documents?)|according\s+to\s+(?:the\s+)?(?:same|selected|previous)\s+(?:knowledge\s+base|documents?))[。！!？?\s.]*$/iu;

export function isKnowledgeDirectedQuery(text: string) {
  return (
    PRIVATE_KNOWLEDGE_QUERY_PATTERN.test(text) ||
    PRIVATE_MATERIAL_REFERENCE_PATTERN.test(text) ||
    KNOWLEDGE_CAPABILITY_QUERY_PATTERN.test(text) ||
    ENGLISH_PRIVATE_KNOWLEDGE_QUERY_PATTERN.test(text) ||
    ENGLISH_KNOWLEDGE_CAPABILITY_QUERY_PATTERN.test(text)
  );
}

export function isProjectMaterialDirectedQuery(text: string) {
  return (
    PROJECT_MATERIAL_QUERY_PATTERN.test(text) ||
    ENGLISH_PROJECT_MATERIAL_QUERY_PATTERN.test(text)
  );
}

export function isImageGenerationDirectedQuery(text: string) {
  if (IMAGE_TOOL_QUERY_PATTERN.test(text)) return true;
  if (isArtifactDirectedImageQuery(text)) return false;
  if (ARTIFACT_TERM_PATTERN.test(text) && !NEGATED_ARTIFACT_TERM_PATTERN.test(text)) {
    return false;
  }
  return (
    IMAGE_EDIT_QUERY_PATTERNS.some((pattern) => pattern.test(text)) ||
    IMAGE_GENERATION_QUERY_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function isCodeExecutionDirectedQuery(text: string) {
  const explicitlyRequestsRunner =
    /(?:代码运行工具|run_code|运行得到的输出|运行结果|执行结果)/iu.test(text);
  if (!explicitlyRequestsRunner && CODE_CONCEPT_QUERY_PATTERN.test(text)) {
    return false;
  }
  return CODE_EXECUTION_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}

export function isContextualImageFollowUp(text: string) {
  return CONTEXTUAL_IMAGE_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

export function isContextualCodeFollowUp(text: string) {
  return CONTEXTUAL_CODE_FOLLOW_UP_PATTERN.test(text.trim());
}

export function isContextualWebFollowUp(text: string) {
  return CONTEXTUAL_WEB_FOLLOW_UP_PATTERN.test(text.trim());
}

export function isContextualKnowledgeFollowUp(text: string) {
  return CONTEXTUAL_KNOWLEDGE_FOLLOW_UP_PATTERN.test(text.trim());
}

function isArtifactDirectedImageQuery(text: string) {
  if (NEGATED_ARTIFACT_TERM_PATTERN.test(text)) return false;
  return IMAGE_RELATED_ARTIFACT_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}
