/**
 * 风格目录 —— 六种输出语气。
 *
 * 每条风格除了给人看的说明，还带着「句法配方」（recipes）。
 * 配方决定了这一版长什么样，而不是把同一句话换个词：
 * 大白话是直陈，犀利是对撞，阴阳是反讽，职场是公文，段子是比喻。
 * 所以同一个意思在六种风格下，句子结构本身就不同。
 */
export type StyleId = 'plain' | 'highEq' | 'sharp' | 'sarcasm' | 'office' | 'meme';

export interface Style {
  id: StyleId;
  label: string;
  /** 结果卡片上的短标签 */
  short: string;
  en: string;
  /** 面向用户的说明 */
  desc: string;
  /** 句法配方；槽位见 engine/compose.ts */
  recipes: string[];
}

export const STYLES: Style[] = [
  {
    id: 'plain',
    label: '大白话',
    short: '大白话',
    en: 'PLAIN',
    desc: '直接说出真实意思，不绕。',
    recipes: [
      '{truth}。',
      '说人话：{truth}。',
      '{truth}。{stake}。',
      '别绕了，{truth}。',
      '「{surfaceShort}」的真实意思：{truth}。',
      '{truth}，剩下的都是客气话。',
      '{truth}。{stake}。'
    ],
  },
  {
    id: 'highEq',
    label: '高情商',
    short: '高情商',
    en: 'TACTFUL',
    desc: '保留分寸，真的能发出去。',
    recipes: [
      '我理解你的意思。{eq}，{sceneClose}。',
      '先接下你这句「{surfaceShort}」——{eq}，{sceneClose}。',
      '{address}，{eq}。{action}。',
      '说实话，{eq}。我倾向于{action}。',
      '我明白你的顾虑。{eq}，这样对大家都好。',
      '{eq}。有需要我配合的，随时说。',
      '这件事我记下了：{eq}，{sceneClose}。',
      '{eq}。',
    ],
  },
  {
    id: 'sharp',
    label: '犀利版',
    short: '犀利',
    en: 'BLUNT',
    desc: '短句、有态度、不解释。',
    recipes: [
      '{sharp}。',
      '说难听点：{sharp}。',
      '「{surfaceShort}」翻译过来：{sharp}。',
      '{sharp}。别演了。',
      '真相很无聊：{truth}。',
      '{sharp}——就这一条。',
    ],
  },
  {
    id: 'sarcasm',
    label: '阴阳怪气版',
    short: '阴阳',
    en: 'IRONIC',
    desc: '讽刺但有趣，笑着把刀递过去。',
    recipes: [
      '「{surfaceShort}」——好的，翻译一下：{sarcasm}。',
      '{sarcasm}。真体面。',
      '懂了，{sarcasm}。（不是）',
      '您这话说得很有水平，{sarcasm}。',
      '{sarcasm}，这波操作堪称艺术。',
      '妙啊，{sarcasm}。{sceneClose}。',
    ],
  },
  {
    id: 'office',
    label: '职场生存版',
    short: '职场',
    en: 'CORPORATE',
    desc: '委婉、体面、潜台词自己会说话。',
    recipes: [
      '关于{entity}，{office}，后续再同步。',
      '{office}。',
      '按目前情况，{office}，请知悉。',
      '现阶段{office}，相关节点确认后另行通知。',
      '收到。{office}，我们会持续跟进。',
      '{office}，感谢理解与支持。',
      '关于「{surfaceShort}」这一说法，{office}，请知悉。',
      '{office}。',
    ],
  },
  {
    id: 'meme',
    label: '段子版',
    short: '段子',
    en: 'MEME',
    desc: '适合发社交媒体，能被转发的那种。',
    recipes: [
      '{meme}。',
      '{truth}。{entity}现在的状态：{stage}。',
      '{meme}——这一幕适合发朋友圈。',
      '「{surfaceShort}」在当代语境下，属于{stage}。',
      '{truth}，{metaphor}。',
      '{meme}。这句话值得收藏。',
      '{meme}。{stake}。',
      '{meme}。谁听了不笑一下。',
    ],
  },
];

export const STYLE_MAP: Record<StyleId, Style> = STYLES.reduce(
  (acc, style) => {
    acc[style.id] = style;
    return acc;
  },
  {} as Record<StyleId, Style>,
);

export const STYLE_IDS: StyleId[] = STYLES.map((s) => s.id);

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && value in STYLE_MAP;
}
