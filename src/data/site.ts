/**
 * 站点常量与隐私文案。
 * 这里也是唯一放「对外承诺」的地方：说明必须与实际行为一致。
 */
export const SITE_NAME = '人话翻译局';
export const SITE_NAME_EN = 'PLAIN SPEAK BUREAU';
export const SITE_TAGLINE = '把绕弯子的话，翻译成人能听懂的话';
export const SITE_URL_LABEL = 'human-translator';

/** 输入上限：一句话的量级，超过就提示用户别把它当论文 */
export const MAX_INPUT_CHARS = 300;
/** 超过这个字数给「有点长」的提示，但仍可翻译 */
export const SOFT_INPUT_CHARS = 120;

export const PRIVACY_POINTS: string[] = [
  '未连接模型通道时，结果全部在浏览器本地生成，输入的文字不会离开这台设备。',
  '站点配置了模型时，点击「翻译」才会把这句话发给服务端；模型密钥只存在服务端的环境变量里，前端拿不到、也不会写进日志。',
  '收藏与历史记录只保存在本机浏览器（localStorage），可以随时逐条删除或一键清空。',
  '不做用户账号、不做行为埋点、不接入第三方统计；页面启动时只会探一次是否具备模型能力。',
  '分享图在本地截图生成，不上传服务器。',
];

export const FOOTER_NOTE = '本工具只做语言层面的改写，不提供事实核查、法律或医疗意见。';
