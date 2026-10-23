/**
 * 前后端共享的枚举与限制。
 * 前端从 src/ 导入同值常量，服务端从这里读，避免两边漂移。
 * （用 .mjs 是为了让 Node 直接 import，不经过构建。）
 */
export const STYLE_IDS = ['plain', 'highEq', 'sharp', 'sarcasm', 'office', 'meme'];

export const SCENE_IDS = [
  'workplace',
  'negotiation',
  'romance',
  'friends',
  'buzzwords',
  'service',
  'refusal',
  'passiveAggressive',
  'smoothReply',
];

export const MAX_INPUT_CHARS = 300;
