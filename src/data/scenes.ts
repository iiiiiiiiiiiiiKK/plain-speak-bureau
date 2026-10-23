/**
 * 场景目录 —— 产品里所有可选场景的唯一来源。
 * 只放配置，不放业务逻辑：引擎读这里，UI 也从这里渲染。
 *
 * 每个场景提供三类素材，供生成器在「没有具体实体」时兜底：
 *  - nouns    场景里最常被谈论的东西（方案、预算、订单……）
 *  - openers  场景口吻的开场短语
 *  - closers  场景口吻的收尾短语
 */
export type SceneId =
  | 'workplace'
  | 'negotiation'
  | 'romance'
  | 'friends'
  | 'buzzwords'
  | 'service'
  | 'refusal'
  | 'passiveAggressive'
  | 'smoothReply';

export interface Scene {
  id: SceneId;
  label: string;
  en: string;
  /** 一句话说明这个场景在翻译什么 */
  blurb: string;
  /** 场景里可能出现的称呼 */
  address: string[];
  nouns: string[];
  openers: string[];
  closers: string[];
  /** 点击即可填入的示例句子（都是原创句子，不含第三方内容） */
  examples: string[];
}

export const SCENES: Scene[] = [
  {
    id: 'workplace',
    label: '职场沟通',
    en: 'WORKPLACE',
    blurb: '邮件、周会、群消息里那些不直说的话。',
    address: ['老板', '领导', '各位', '你'],
    nouns: ['这个方案', '排期', '这份需求', '汇报'],
    openers: ['关于这件事', '按目前节奏', '内部沟通下来'],
    closers: ['后续再同步', '有结论第一时间同步你', '先按这个节奏走'],
    examples: [
      '这个方案我们再研究一下。',
      '我这边先看看，有消息同步你。',
      '你提的这块我们内部再对齐一下。',
      '这个需求优先级不高，先排在后面。',
    ],
  },
  {
    id: 'negotiation',
    label: '商业谈判',
    en: 'NEGOTIATION',
    blurb: '价格、条款、交付范围之间的柔软与强硬。',
    address: ['王总', '对方', '咱们', '你'],
    nouns: ['这个价格', '合同条款', '交付范围', '预算'],
    openers: ['从我们的角度看', '按目前预算', '合作层面'],
    closers: ['我们保持沟通', '细节可以再谈', '看能不能找到中间地带'],
    examples: [
      '这个价格我们再商量商量。',
      '预算就这么多，你看能不能再让一步。',
      '条款我们法务还要过一下。',
      '先合作看看，后面量大了再说。',
    ],
  },
  {
    id: 'romance',
    label: '恋爱关系',
    en: 'ROMANCE',
    blurb: '试探、撒娇、后退，和所有没发出的消息。',
    address: ['你', '宝', '我们'],
    nouns: ['这条消息', '我们的关系', '这个周末', '昨天的事'],
    openers: ['说真的', '这两天我一直在想', '坦白讲'],
    closers: ['晚上我等你一句准话', '想听你说实话', '别自己扛着'],
    examples: [
      '在干嘛？',
      '你最近是不是有点忙？',
      '我们冷静一下。',
      '改天一起吃饭吧。',
    ],
  },
  {
    id: 'friends',
    label: '朋友社交',
    en: 'FRIENDS',
    blurb: '群聊里的客气、玩笑，和真正的意思。',
    address: ['你', '兄弟', '姐妹'],
    nouns: ['这顿饭', '这次聚会', '你这个想法', '那个局'],
    openers: ['说句实话', '不装了啊', '你想听真话吗'],
    closers: ['有空真聚', '到时候我喊你', '别光说不练'],
    examples: [
      '下次一定！',
      '有空聚聚。',
      '你这个想法挺有意思的。',
      '最近有点忙，回头聊。',
    ],
  },
  {
    id: 'buzzwords',
    label: '互联网黑话',
    en: 'JARGON',
    blurb: '把术语吹成的云，再把它拍回地面。',
    address: ['各位', '团队', '我们'],
    nouns: ['这个项目', '业务抓手', '这条链路', '方法论'],
    openers: ['落到执行层面', '拆开看', '一句话总结'],
    closers: ['先对齐再动手', '别再用词糊弄事', '写成人能看懂的话'],
    examples: [
      '我们要拉通对齐，形成闭环，找到抓手。',
      '这个项目要提升颗粒度，打通底层逻辑。',
      '先做个小范围试点，跑通链路再复制。',
      '我们要在生态位上占住用户心智。',
    ],
  },
  {
    id: 'service',
    label: '客服与售后',
    en: 'SERVICE',
    blurb: '「已为您加急」到底加了几倍速。',
    address: ['亲', '您', '客户'],
    nouns: ['这笔订单', '退款', '保修', '物流'],
    openers: ['按售后规则', '这边核实到', '先跟您同步'],
    closers: ['今天内给您答复', '处理进度我会盯到最后', '需要您提供订单号'],
    examples: [
      '我要找你们领导投诉。',
      '这个已经过保了，修不了。',
      '我这边帮您登记一下，等通知。',
      '退款要等七个工作日。',
    ],
  },
  {
    id: 'refusal',
    label: '拒绝别人',
    en: 'SAY NO',
    blurb: '既要把「不」说出口，又不至于撕破脸。',
    address: ['你', '对方'],
    nouns: ['这个忙', '这次邀约', '这个请求', '这单活'],
    openers: ['实话说', '我很想答应', '先谢谢你想到我'],
    closers: ['希望你理解', '下次我主动找你', '别为难我'],
    examples: [
      '这个忙我真帮不了。',
      '下次有机会再说吧。',
      '我最近真的没时间。',
      '不好意思，不太方便。',
    ],
  },
  {
    id: 'passiveAggressive',
    label: '阴阳怪气',
    en: 'PASSIVE',
    blurb: '字面礼貌，句句带刺，还能配上笑脸。',
    address: ['您', '你'],
    nouns: ['您的高见', '这波操作', '这个决定', '这句评价'],
    openers: ['不敢当', '承蒙关照', '您这话'],
    closers: ['您开心就好', '打扰了', '您忙您的'],
    examples: [
      '挺好的，你觉得行就行。',
      '您说的都对。',
      '没关系，反正也不重要。',
      '哦，那你忙吧。',
    ],
  },
  {
    id: 'smoothReply',
    label: '高情商回复',
    en: 'SMOOTH',
    blurb: '别人的一句话砸过来，怎么接得漂亮。',
    address: ['你', '对方'],
    nouns: ['这件事', '你这个问题', '现在的情况', '这句话'],
    openers: ['先接住你这句', '我理解你的感受', '换个角度说'],
    closers: ['我们坐下来聊', '你怎么想，我听你的', '别急，先把话说开'],
    examples: [
      '你怎么这么久才回我？',
      '这件事你怎么看？',
      '你觉得我是不是很烦？',
      '为什么又是我？',
    ],
  },
];

export const SCENE_MAP: Record<SceneId, Scene> = SCENES.reduce(
  (acc, scene) => {
    acc[scene.id] = scene;
    return acc;
  },
  {} as Record<SceneId, Scene>,
);

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && value in SCENE_MAP;
}
