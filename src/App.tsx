import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './components/Masthead';
import InputPanel from './components/InputPanel';
import ScenePicker from './components/ScenePicker';
import StylePicker from './components/StylePicker';
import ResultsPanel from './components/ResultsPanel';
import SidePanel, { type PanelKind } from './components/SidePanel';
import ShareModal from './components/ShareModal';
import SiteFooter from './components/SiteFooter';
import ToastBar from './components/ToastBar';
import { MAX_INPUT_CHARS, SITE_NAME } from './data/site';
import { SCENE_MAP, type SceneId, isSceneId } from './data/scenes';
import { STYLE_MAP, type StyleId, isStyleId } from './data/styles';
import { checkInput, localGenerate } from './engine/generate';
import { mergeAiVariants } from './engine/ai-merge';
import { buildXPost } from './engine/xpost';
import type { Generation, Variant } from './engine/types';
import { probeHealth, requestAiTranslation, type AiHealth } from './lib/api';
import { copyText } from './lib/clipboard';
import { allVariantsText, variantPlain } from './lib/serialize';
import {
  loadFavorites,
  loadHistory,
  saveFavorites,
  saveHistory,
  storageAvailable,
  clearAllLocal,
  type HistoryEntry,
  type SavedVariant,
} from './lib/storage';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';

type EngineMode = 'local' | 'ai';

/**
 * 只记住「场景 / 风格」两个选项，**不保存用户输入的原文**。
 * 这是隐私说明里「不默认保存用户输入」对应的实际行为：
 * 刷新页面后输入框是空的，但上次选的场景和口气还在。
 * （想找回原文，用「历史」面板 —— 那是用户自己主动翻译过、且可逐条删除的记录。）
 */
const LAST_OPTIONS_KEY = 'ht.v1.lastOptions';

interface LastOptions {
  scene: SceneId;
  style: StyleId;
}

function loadLastOptions(): LastOptions {
  const fallback: LastOptions = { scene: 'workplace', style: 'plain' };
  try {
    const raw = window.localStorage.getItem(LAST_OPTIONS_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<LastOptions>;
    return {
      scene: isSceneId(data.scene) ? data.scene : 'workplace',
      style: isStyleId(data.style) ? data.style : 'plain',
    };
  } catch {
    return fallback;
  }
}

function saveLastOptions(options: LastOptions): void {
  try {
    window.localStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export default function App() {
  const initial = useMemo(loadLastOptions, []);
  // 输入框永远从空开始：不把原文写进本地存储
  const [input, setInput] = useState('');
  const [scene, setScene] = useState<SceneId>(initial.scene);
  const [style, setStyle] = useState<StyleId>(initial.style);

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<SavedVariant[]>(() => loadFavorites());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [ai, setAi] = useState<AiHealth | null>(null);
  const [engine, setEngine] = useState<EngineMode>('local');
  const [aiCold, setAiCold] = useState(false);

  const { theme, toggle } = useTheme();
  const { toast, show } = useToast();

  /* 只允许一次请求在飞：防止连点导致重复请求与重复历史 */
  const inFlight = useRef(false);
  const requestSeq = useRef(0);
  const copyTimer = useRef<number | null>(null);

  const aiReady = Boolean(ai?.configured);

  /* 启动探一次服务端能力；不可用就静默走本地 */
  useEffect(() => {
    let alive = true;
    probeHealth().then((health) => {
      if (!alive) return;
      setAi(health);
      if (health?.configured) {
        setEngine('ai');
      } else {
        setEngine('local');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  /* 只记住场景与风格；输入内容不落盘 */
  useEffect(() => {
    const timer = window.setTimeout(() => saveLastOptions({ scene, style }), 300);
    return () => window.clearTimeout(timer);
  }, [scene, style]);

  /* 场景/风格改动后，标记「结果已过期」 */
  useEffect(() => {
    if (!generation) {
      setStale(false);
      return;
    }
    setStale(
      generation.scene !== scene ||
        generation.style !== style ||
        generation.input !== input.trim(),
    );
  }, [scene, style, input, generation]);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const flashCopied = useCallback((key: string, text: string) => {
    setCopiedKey(key);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
    show(text, 'ok');
  }, [show]);

  const pushHistory = useCallback((gen: Generation) => {
    const entry: HistoryEntry = {
      id: gen.batchId,
      input: gen.input,
      scene: gen.scene,
      style: gen.style,
      createdAt: gen.createdAt,
      source: gen.meta.source,
      texts: gen.variants.map((v) => v.text).slice(0, 3),
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 30);
      saveHistory(next);
      return next;
    });
  }, []);

  /* ---------------- 生成 ---------------- */
  const runGenerate = useCallback(
    async (opts?: { batchSeed?: number; silent?: boolean }) => {
      if (inFlight.current) return;

      const check = checkInput(input, MAX_INPUT_CHARS);
      if (!check.ok) {
        setInputError(check.message ?? '输入有问题');
        setError(null);
        return;
      }
      setInputError(null);

      inFlight.current = true;
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError(null);
      setNotice(null);
      setCopiedKey(null);

      const batchSeed = opts?.batchSeed ?? 0;
      const text = input.trim();

      try {
        if (engine === 'ai' && aiReady) {
          const result = await requestAiTranslation({ input: text, scene, style, count: 5 });
          if (requestSeq.current !== seq) return;

          if (result.ok) {
            const merged = mergeAiVariants({
              input: text,
              scene,
              style,
              intent: result.intent,
              provider: result.provider,
              model: result.model,
              variants: result.variants,
              rationale: [],
              batchSeed,
            });
            const gen: Generation = {
              batchId: newId('b'),
              input: text,
              scene,
              style,
              createdAt: Date.now(),
              variants: merged.variants,
              meta: merged.meta,
              xPost: buildXPost({
                analysis: {
                  raw: text,
                  normalized: text,
                  surfaceShort: text.slice(0, 18),
                  entity: '',
                  address: '你',
                  intentId: 'generic',
                  intentLabel: result.intent || '模型判定',
                  confidence: 'high',
                  matched: [],
                  isQuestion: /[？?]\s*$/.test(text),
                  hasNegative: /(不|没|别|无|未)/.test(text),
                  charCount: [...text].length,
                },
                variants: merged.variants,
                override: result.xPost || undefined,
              }),
            };
            setGeneration(gen);
            pushHistory(gen);
            setLoading(false);
            inFlight.current = false;
            return;
          }

          // AI 失败：如实告知，再降级到本地，不让用户空手而归
          if (result.code !== 'aborted') {
            setAiCold(true);
            setNotice(
              `${result.message}（${result.code}）。已自动改用本地引擎生成，结果质量会低于模型。`,
            );
          }
        }

        // 本地引擎：加一点点延迟让加载态可见，避免闪屏
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        if (requestSeq.current !== seq) return;

        const payload = localGenerate({ input: text, scene, style, batchSeed, count: 5 });
        if (payload.variants.length < 3) {
          setError('这次没能凑出足够多的版本，换个说法再试一次。');
          setLoading(false);
          inFlight.current = false;
          return;
        }
        const gen: Generation = {
          batchId: newId('b'),
          input: text,
          scene,
          style,
          createdAt: Date.now(),
          variants: payload.variants,
          meta: payload.meta,
          xPost: payload.xPost,
        };
        setGeneration(gen);
        pushHistory(gen);
      } catch (err) {
        if (requestSeq.current !== seq) return;
        setError(
          err instanceof Error
            ? `生成失败：${err.message}`
            : '生成失败，可能是浏览器存储或网络异常，请再试一次。',
        );
      } finally {
        if (requestSeq.current === seq) setLoading(false);
        inFlight.current = false;
      }
    },
    [aiReady, engine, input, pushHistory, scene, style],
  );

  const handleRegenerate = useCallback(() => {
    // 换一批：换种子，保证与上一批不同
    const seed = (generation?.meta.batchSeed ?? 0) + 1;
    setStale(false);
    void runGenerate({ batchSeed: seed });
  }, [generation, runGenerate]);

  /* ---------------- 复制 ---------------- */
  const handleCopyVariant = useCallback(
    async (variant: Variant) => {
      const ok = await copyText(variantPlain(variant));
      if (ok) flashCopied(`variant:${variant.id}`, '已复制这一版');
      else show('复制失败，请手动选中文字复制。', 'err');
    },
    [flashCopied, show],
  );

  const handleCopyAll = useCallback(async () => {
    if (!generation) return;
    const ok = await copyText(allVariantsText(generation.variants, generation.input, generation.scene));
    if (ok) flashCopied('all', `已复制 ${generation.variants.length} 个版本`);
    else show('复制失败，请手动选中文字复制。', 'err');
  }, [flashCopied, generation, show]);

  const handleCopyX = useCallback(async () => {
    if (!generation) return;
    const ok = await copyText(generation.xPost.text);
    if (ok) flashCopied('xpost', 'X 文案已复制');
    else show('复制失败，请手动选中文字复制。', 'err');
  }, [flashCopied, generation, show]);

  const handleCopyText = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      show(ok ? '已复制' : '复制失败，请手动选中文字。', ok ? 'ok' : 'err');
    },
    [show],
  );

  /* ---------------- 收藏 ---------------- */
  const favoriteKey = useCallback((variant: Variant, gen: Generation) => `${gen.input}|${variant.text}`, []);

  const isFavorited = useCallback(
    (variant: Variant) => {
      if (!generation) return false;
      const key = favoriteKey(variant, generation);
      return favorites.some((f) => `${f.input}|${f.text}` === key);
    },
    [favoriteKey, favorites, generation],
  );

  const handleFavorite = useCallback(
    (variant: Variant) => {
      if (!generation) return;
      const key = `${generation.input}|${variant.text}`;
      const existing = favorites.find((f) => `${f.input}|${f.text}` === key);
      if (existing) {
        const next = favorites.filter((f) => f.id !== existing.id);
        setFavorites(next);
        saveFavorites(next);
        show('已取消收藏', 'info');
        return;
      }
      const item: SavedVariant = {
        id: newId('f'),
        text: variant.text,
        style: variant.style,
        styleLabel: variant.styleLabel,
        note: variant.note,
        batchId: generation.batchId,
        input: generation.input,
        scene: generation.scene,
        source: generation.meta.source,
        intentLabel: generation.meta.intentLabel,
        savedAt: Date.now(),
      };
      const next = [item, ...favorites].slice(0, 200);
      setFavorites(next);
      const ok = saveFavorites(next);
      show(ok ? '已收藏，存在本机浏览器' : '收藏失败：浏览器存储不可用', ok ? 'ok' : 'err');
    },
    [favorites, generation, show],
  );

  const handleRemoveFavorite = useCallback(
    (id: string) => {
      const next = favorites.filter((f) => f.id !== id);
      setFavorites(next);
      saveFavorites(next);
      show('已删除该收藏', 'info');
    },
    [favorites, show],
  );

  const handleRemoveHistory = useCallback(
    (id: string) => {
      const next = history.filter((h) => h.id !== id);
      setHistory(next);
      saveHistory(next);
      show('已删除该记录', 'info');
    },
    [history, show],
  );

  const handleRestoreHistory = useCallback(
    (entry: HistoryEntry) => {
      setInput(entry.input);
      setScene(entry.scene);
      setStyle(entry.style);
      setPanel(null);
      show('已载入，点「开始翻译」重翻', 'ok');
    },
    [show],
  );

  const handleClearLocal = useCallback(() => {
    clearAllLocal();
    setFavorites([]);
    setHistory([]);
    show('本机数据已清除', 'info');
  }, [show]);

  /* ---------------- 输入 ---------------- */
  const handleInputChange = useCallback((next: string) => {
    setInput(next);
    setInputError(null);
  }, []);

  const handleUseExample = useCallback((text: string) => {
    setInput(text);
    setInputError(null);
  }, []);

  const handleClearInput = useCallback(() => {
    setInput('');
    setInputError(null);
  }, []);

  const storageOk = useMemo(() => storageAvailable(), []);
  const sceneDef = SCENE_MAP[scene];
  const styleDef = STYLE_MAP[style];

  return (
    <div className="app">
      <div className="paper">
        <Masthead
          theme={theme}
          onToggleTheme={toggle}
          favoriteCount={favorites.length}
          historyCount={history.length}
          onOpenPanel={setPanel}
          aiMode={generation ? generation.meta.source === 'ai' : engine === 'ai' && aiReady}
          aiReady={aiReady}
          authorXLink="https://x.com/0xkillcoin"
        />

        <main className="layout">
          <div className="layout-col layout-col-left">
            <InputPanel
              value={input}
              onChange={handleInputChange}
              onClear={handleClearInput}
              scene={scene}
              onUseExample={handleUseExample}
              disabled={loading}
              error={inputError}
            />
            <ScenePicker value={scene} onChange={setScene} disabled={loading} />
            <StylePicker value={style} onChange={setStyle} disabled={loading} />
          </div>

          <div className="layout-col layout-col-right">
            <section className="action-bar" aria-label="执行">
              <div className="action-bar-info">
                <span className="action-scene">{sceneDef.label}</span>
                <span className="action-sep" aria-hidden="true">
                  /
                </span>
                <span className="action-style">{styleDef.label}</span>
                {aiReady ? (
                  <div className="engine-switch" role="group" aria-label="生成通道">
                    <button
                      type="button"
                      className={`engine-btn${engine === 'ai' ? ' engine-btn-on' : ''}`}
                      onClick={() => setEngine('ai')}
                      disabled={loading}
                      data-testid="engine-ai"
                    >
                      模型
                    </button>
                    <button
                      type="button"
                      className={`engine-btn${engine === 'local' ? ' engine-btn-on' : ''}`}
                      onClick={() => setEngine('local')}
                      disabled={loading}
                      data-testid="engine-local"
                    >
                      本地
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="btn btn-translate"
                onClick={() => void runGenerate({ batchSeed: generation?.meta.batchSeed ?? 0 })}
                disabled={loading}
                data-testid="translate"
              >
                {loading ? '翻译中…' : generation ? '重新翻译' : '开始翻译'}
              </button>
            </section>

            {notice ? (
              <p className="notice-bar" role="status" data-testid="notice-bar">
                {notice}
              </p>
            ) : null}

            {aiCold ? (
              <p className="notice-bar notice-bar-soft">
                模型通道刚失败过，本次使用本地引擎。
                <button
                  type="button"
                  className="inline-link"
                  onClick={() => {
                    setAiCold(false);
                    void probeHealth(true).then((h) => {
                      setAi(h);
                      if (h?.configured) setEngine('ai');
                    });
                  }}
                >
                  重新检测
                </button>
              </p>
            ) : null}

            <ResultsPanel
              generation={generation}
              loading={loading}
              error={error}
              stale={stale}
              copiedKey={copiedKey}
              isFavorited={isFavorited}
              onCopyVariant={handleCopyVariant}
              onFavorite={handleFavorite}
              onCopyAll={handleCopyAll}
              onCopyX={handleCopyX}
              onRegenerate={handleRegenerate}
              onOpenShare={() => setShareOpen(true)}
              onRetry={() => void runGenerate({ batchSeed: generation?.meta.batchSeed ?? 0 })}
              styleLabel={styleDef.label}
            />
          </div>
        </main>

        <SiteFooter
          onClearLocal={handleClearLocal}
          aiReady={generation ? generation.meta.source === 'ai' : aiReady && engine === 'ai'}
        />

        <p className="colophon">
          <span>{SITE_NAME}</span>
          <span>·</span>
          <span>{storageOk ? '收藏与历史仅存于本机' : '当前浏览器禁用本地存储，收藏与历史不可用'}</span>
        </p>
      </div>

      <SidePanel
        open={panel}
        favorites={favorites}
        history={history}
        onClose={() => setPanel(null)}
        onCopy={handleCopyText}
        onRemoveFavorite={handleRemoveFavorite}
        onRemoveHistory={handleRemoveHistory}
        onClearFavorites={() => {
          setFavorites([]);
          saveFavorites([]);
          show('已清空收藏', 'info');
        }}
        onClearHistory={() => {
          setHistory([]);
          saveHistory([]);
          show('已清空历史', 'info');
        }}
        onRestoreHistory={handleRestoreHistory}
      />

      {shareOpen && generation ? (
        <ShareModal generation={generation} onClose={() => setShareOpen(false)} />
      ) : null}

      <ToastBar toast={toast} />
    </div>
  );
}
