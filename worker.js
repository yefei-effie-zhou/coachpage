// ============================================================
// Dutch Notebook · Cloudflare Worker API
// ============================================================
// 部署前请确保：
// 1. 已创建 D1 数据库并填入 wrangler.toml 中的 database_id
// 2. 已运行 schema.sql 创建表
// 3. 已设置 ALLOWED_ORIGIN 环境变量
//
// D1 连接方式：
//   env.DB 由 wrangler.toml 中的 [[d1_databases]] 绑定自动注入
//   无需手动配置连接字符串或驱动 — Cloudflare 在运行时自动处理
// ============================================================

const MAX_TEXT_LENGTH = 300;

// ── CORS ──────────────────────────────────────────────
function corsHeaders(origin, allowedOrigin) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Secret, Authorization, X-Audio-Filename, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(data, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin, allowedOrigin),
  });
}

// Models occasionally wrap JSON in Markdown or add a short preface even when
// response_format is requested. Extract the first complete JSON object before
// falling back to treating the answer as ordinary text.
function parseModelJson(rawValue) {
  const raw = String(rawValue || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!raw) return { raw: "", value: null };
  try { return { raw, value: JSON.parse(raw) }; } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return { raw, value: JSON.parse(raw.slice(start, end + 1)) }; } catch {}
  }
  return { raw, value: null };
}

// ── 鉴权 ──────────────────────────────────────────────
function authOK(request, env, token) {
  if (!env.API_SECRET) return true;
  if (!token) return false;
  return token === env.API_SECRET;
}

function extractToken(request) {
  const xSecret = request.headers.get("X-API-Secret");
  if (xSecret) return xSecret;
  const authz = request.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// ── 翻译 ──────────────────────────────────────────────
async function handleTranslate(request, env, origin, allowedOrigin) {
  if (request.method !== "POST") {
    return json({ error: "仅支持 POST 请求。" }, 405, origin, allowedOrigin);
  }
  if (!env.DEEPSEEK_API_KEY) {
    return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  // 长句只保留必要上下文；所选文本会单独发送，因此不会丢失查询目标。
  const sentenceContext = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  const mode = body.mode === "phrase" ? "phrase" : "word";
  const language = ["en", "ja", "nl"].includes(body.language) ? body.language : "nl";

  if (!text || text.length > MAX_TEXT_LENGTH) {
    return json({ error: `text 必须是 1–${MAX_TEXT_LENGTH} 个字符。` }, 400, origin, allowedOrigin);
  }

  const languageLabel = language === "ja" ? "Japanese" : language === "en" ? "English" : "Dutch";
  const task = `${languageLabel} ${mode === "phrase" ? "phrase" : "word"}`;
  const requestBody = {
    model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    thinking: { type: "disabled" },
    // 160 tokens 对“翻译 + 整句语法”容易截断；保留足够空间并要求精炼输出。
    max_tokens: 420,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You teach ${languageLabel} to a Chinese-speaking learner. Reply with JSON only: {\"english\":\"...\",\"chinese\":\"...\",\"grammar\":\"...\"}. Give concise English and Chinese meanings; when the source is English, make the english field a concise paraphrase. Analyze the most important grammar in the supplied full sentence and the selected text's role in it. Keep grammar under 100 Chinese characters.`,
      },
      { role: "user", content: `Translate this ${task}: ${text}${sentenceContext ? `\nFull sentence context: ${sentenceContext}` : ""}` },
    ],
  };

  let lastError = "翻译服务暂时不可用。";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const details = await response.text();
        console.error("DeepSeek request failed", response.status, details);
        lastError = response.status === 429 ? "翻译请求过于频繁，请稍后重试。" : "翻译服务暂时不可用。";
        // 认证、请求格式等 4xx 不会通过重试恢复。
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } else {
        const payload = await response.json();
        const raw = String(payload.choices?.[0]?.message?.content || "").replace(/^```json\s*|\s*```$/g, "");
        const result = JSON.parse(raw);
        if (!result.english || !result.chinese) throw new Error("missing translation fields");
        return json({ english: result.english, chinese: result.chinese, grammar: result.grammar || "暂无额外语法说明。" }, 200, origin, allowedOrigin);
      }
    } catch (error) {
      console.error("DeepSeek translation attempt failed", error);
      lastError = "翻译结果生成异常，请稍后重试。";
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return json({ error: lastError }, 502, origin, allowedOrigin);
}

// ── Japanese selected-text reading ─────────────────────
async function handleJapaneseReading(request, env, origin, allowedOrigin) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) return json({ error: `text 必须是 1–${MAX_TEXT_LENGTH} 个字符。` }, 400, origin, allowedOrigin);

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      thinking: { type: "disabled" },
      max_tokens: 100,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You provide Japanese readings for a Chinese learner. Return JSON only: {\"reading\":\"...\",\"pitch\":0}. Give the pronunciation of the selected text in hiragana (katakana only when appropriate), without parentheses or brackets. pitch is the Tokyo pitch-accent number, 0–9; use 0 if uncertain. Do not translate, explain, or use markdown." },
        { role: "user", content: text },
      ],
    }),
  });
  if (!response.ok) return json({ error: "日语读音服务暂时不可用。" }, 502, origin, allowedOrigin);
  try {
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "");
    const reading = typeof parsed.reading === "string" ? parsed.reading.replace(/[^\u3040-\u30ffー]/g, "") : "";
    const pitch = Math.max(0, Math.min(9, Number.parseInt(parsed.pitch, 10) || 0));
    if (!reading) throw new Error("missing reading");
    return json({ reading, pitch }, 200, origin, allowedOrigin);
  } catch {
    return json({ error: "日语读音结果格式异常。" }, 502, origin, allowedOrigin);
  }
}

// ── Japanese sentence analyzer ───────────────────────
// The response contract follows cokice/japanese-analyzer so the static client
// can render tokens without bundling its Next.js application.
async function handleJapaneseAnalyze(request, env, origin, allowedOrigin) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 2000) return json({ error: "text 必须是 1–2000 个字符。" }, 400, origin, allowedOrigin);

  const requestBody = {
    model: env.DEEPSEEK_MODEL || "deepseek-chat",
    thinking: { type: "disabled" },
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Japanese grammar analyzer for Chinese-speaking learners. Segment the input according to Japanese school grammar (学校文法). Separate particles and auxiliary verbs, preserve punctuation and line breaks, and ensure concatenating every token.word reconstructs the input exactly. Allowed pos values: 名詞、代名詞、動詞、形容詞、形容動詞、副詞、連体詞、接続詞、感動詞、助詞、助動詞、記号、改行. For kanji tokens provide hiragana furigana; provide Hepburn romaji for readable Japanese tokens. Translate the complete sentence naturally into Simplified Chinese. Return JSON only: {"tokens":[{"word":"...","pos":"...","furigana":"...","romaji":"..."}],"translation":"..."}. Omit furigana and romaji for punctuation and whitespace. Do not omit or normalize any source character.`,
      },
      { role: "user", content: text },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        console.error("Japanese analyze failed", response.status, await response.text());
        continue;
      }
      const payload = await response.json();
      const result = parseModelJson(payload.choices?.[0]?.message?.content || "").value || {};
      const allowedPos = new Set(["名詞","代名詞","動詞","形容詞","形容動詞","副詞","連体詞","接続詞","感動詞","助詞","助動詞","記号","改行"]);
      const tokens = Array.isArray(result.tokens) ? result.tokens.map(token => ({
        word: String(token?.word || ""),
        pos: allowedPos.has(token?.pos) ? token.pos : "名詞",
        ...(token?.furigana ? { furigana: String(token.furigana) } : {}),
        ...(token?.romaji ? { romaji: String(token.romaji) } : {}),
      })).filter(token => token.word) : [];
      if (!tokens.length || tokens.map(token => token.word).join("") !== text) {
        requestBody.messages[0].content += " Previous output failed exact reconstruction. Check every character and whitespace before returning.";
        continue;
      }
      return json({ tokens, translation: String(result.translation || "") }, 200, origin, allowedOrigin);
    } catch (error) {
      console.error("Japanese analyze attempt failed", error);
    }
  }
  return json({ error: "日语解析结果不完整，请缩短句子后重试。" }, 502, origin, allowedOrigin);
}

async function handleJapaneseWordDetail(request, env, origin, allowedOrigin) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin); }
  const word = typeof body.word === "string" ? body.word.trim() : "";
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 2000) : "";
  if (!word || word.length > 100) return json({ error: "word 必须是 1–100 个字符。" }, 400, origin, allowedOrigin);

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat",
        thinking: { type: "disabled" },
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You explain Japanese vocabulary to a Chinese-speaking learner. Respect the supplied sentence context. Return JSON only with: {"originalWord":"surface form","chineseTranslation":"concise contextual meaning","pos":"Japanese part of speech","furigana":"hiragana reading","romaji":"Hepburn romaji","dictionaryForm":"dictionary/base form","explanation":"concise Chinese explanation of meaning, inflection and usage in this sentence"}. Never invent a different word and do not use markdown.` },
          { role: "user", content: `Word: ${word}${sentence ? `\nSentence: ${sentence}` : ""}` },
        ],
      }),
    });
    if (!response.ok) {
      console.error("Japanese word detail failed", response.status, await response.text());
      return json({ error: "日语词语详情暂时不可用。" }, 502, origin, allowedOrigin);
    }
    const payload = await response.json();
    const result = parseModelJson(payload.choices?.[0]?.message?.content || "").value || {};
    const detail = {
      originalWord: String(result.originalWord || word),
      chineseTranslation: String(result.chineseTranslation || ""),
      pos: String(result.pos || ""),
      furigana: String(result.furigana || ""),
      romaji: String(result.romaji || ""),
      dictionaryForm: String(result.dictionaryForm || result.originalWord || word),
      explanation: String(result.explanation || ""),
    };
    if (!detail.chineseTranslation) throw new Error("missing translation");
    return json(detail, 200, origin, allowedOrigin);
  } catch (error) {
    console.error("Japanese word detail error", error);
    return json({ error: "日语词语详情结果格式异常。" }, 502, origin, allowedOrigin);
  }
}

// ── Native-style speaking partner ─────────────────────
async function generateConversationCorrection(env, language, utterance, includeNotes = false, noteLanguage = "Chinese") {
  const languageLabel = language === "ja" ? "Japanese" : language === "nl" ? "Dutch" : "English";
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat",
        thinking: { type: "disabled" },
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You are a meticulous native ${languageLabel} language editor. Audit the learner's entire utterance clause by clause. Check verb tense and aspect, agreement, articles, prepositions, word order, collocations, spelling, register, and spoken naturalness. Preserve the intended meaning and do not omit any idea. Before answering, silently verify that your corrected sentence is itself grammatically valid and idiomatic. Return JSON only: {"correction":"the complete corrected utterance, or an empty string if fully natural","notes":["short explanation of each important change"]}. ${includeNotes ? `Include concise notes for every important correction, written in ${noteLanguage}.` : "Keep notes empty."}` },
          { role: "user", content: String(utterance || "").slice(0, 3000) },
        ],
      }),
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "").value || {};
    const correction = String(parsed.correction || "").trim();
    const notes = Array.isArray(parsed.notes) ? parsed.notes.map(note => String(note).trim()).filter(Boolean).slice(0, 6) : [];
    return { correction, notes };
  } catch (error) {
    console.error("Conversation correction fallback failed", error);
    return { correction: "", notes: [] };
  }
}

async function handleConversation(request, env, origin, allowedOrigin) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin); }

  const language = ["en", "nl", "ja"].includes(body.language) ? body.language : "en";
  const mode = body.mode === "roleplay" ? "roleplay" : "friend";
  const correctionMode = body.correction_mode === "strict" ? "strict" : "natural";
  const uiLanguage = body.ui_language === "en" ? "English" : "Chinese";
  const scenario = String(body.scenario || "open conversation").slice(0, 120);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-16).filter(message =>
    ["user", "assistant"].includes(message?.role) && typeof message.content === "string" && message.content.trim()
  ).map(message => ({ role: message.role, content: message.content.trim().slice(0, 3000) })) : [];
  if (!messages.length) return json({ error: "至少需要一条对话消息。" }, 400, origin, allowedOrigin);

  const profiles = {
    en: "The learner understands English at C1-C2, but spoken output is less fluent. Use natural adult English and help with concise, well-structured, context-appropriate expression.",
    nl: "The learner understands basic Dutch but struggles to speak. Use short, clear A1-A2 Dutch, gently activate useful vocabulary, and provide light scaffolding when needed.",
    ja: "The learner has basic Japanese and partial listening comprehension but struggles to start speaking. Use short, friendly Japanese turns, common patterns, and occasional reading support in parentheses only when genuinely helpful.",
  };
  const roleInstruction = mode === "friend"
    ? "You are a warm, curious long-term native-speaking friend. Respond to the meaning first, ask genuine follow-up questions, and never sound like a textbook teacher. Never introduce yourself with a name."
    : `Stay fully in a realistic role-play for the scenario '${scenario}'. Act like the relevant native speaker and keep the interaction moving.`;
  const correctionInstruction = correctionMode === "strict"
    ? "A separate language editor will audit the learner's wording. Respond naturally to the meaning and invite a retry when useful."
    : "Conversation comes first, but always provide a natural corrected version when the latest utterance has noticeable grammar, word-choice, or idiomatic issues; leave correction empty only when it is already fully natural.";
  const latestUtterance = messages.filter(message => message.role === "user").at(-1)?.content || "";

  const baseInstruction = `${profiles[language]} ${roleInstruction} ${correctionInstruction} Reply in the target language, not Chinese. Keep the reply to 2-5 sentences and any correction to 1-2 sentences. Do not explain grammar.`;

  // Some models occasionally spend the whole first completion on internal
  // reasoning once conversation history is present, leaving content empty.
  // Retry once with a larger budget and a looser JSON request so turn two and
  // later keep both the reply and the natural correction.
  for (let attempt = 0; attempt < 2; attempt++) {
    const structured = attempt === 0;
    const requestBody = {
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      thinking: { type: "disabled" },
      max_tokens: structured ? 700 : 1400,
      messages: [{
        role: "system",
        content: `${baseInstruction} Return JSON only: {"reply":"your in-character response","correction":"a natural version of only the learner's latest utterance, or empty string","correction_notes":[]}.`,
      }, ...messages],
    };
    if (structured) requestBody.response_format = { type: "json_object" };

    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        console.error("Conversation API failed", response.status, await response.text());
        if (attempt === 1) return json({ error: "对话服务暂时不可用。" }, 502, origin, allowedOrigin);
        continue;
      }
      const payload = await response.json();
      const modelMessage = payload.choices?.[0]?.message || {};
      const content = Array.isArray(modelMessage.content)
        ? modelMessage.content.map(part => typeof part === "string" ? part : part?.text || "").join("\n")
        : modelMessage.content;
      const parsed = parseModelJson(content);
      if (parsed.value?.reply) {
        let correction = String(parsed.value.correction || "").trim();
        let correctionNotes = Array.isArray(parsed.value.correction_notes) ? parsed.value.correction_notes : [];
        if (correctionMode === "strict" || !correction) {
          const reviewed = await generateConversationCorrection(env, language, latestUtterance, correctionMode === "strict", uiLanguage);
          if (reviewed.correction || correctionMode === "strict") correction = reviewed.correction;
          correctionNotes = reviewed.notes;
        }
        return json({ reply: String(parsed.value.reply), correction, correction_notes: correctionNotes }, 200, origin, allowedOrigin);
      }
      if (parsed.raw) {
        const reviewed = await generateConversationCorrection(env, language, latestUtterance, correctionMode === "strict", uiLanguage);
        return json({ reply: parsed.raw, correction: reviewed.correction, correction_notes: reviewed.notes }, 200, origin, allowedOrigin);
      }
      console.error("Conversation completion was empty", payload.choices?.[0]?.finish_reason || "unknown");
    } catch (error) {
      console.error("Conversation attempt failed", error);
    }
  }
  return json({ error: "对话服务返回了空内容，请重试。" }, 502, origin, allowedOrigin);
}

async function handleConversationTitle(request, env, origin, allowedOrigin) {
  if (!env.DEEPSEEK_API_KEY) return json({ error: "Worker 尚未设置 DEEPSEEK_API_KEY。" }, 500, origin, allowedOrigin);
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 12).filter(message =>
    ["user", "assistant"].includes(message?.role) && typeof message.content === "string"
  ).map(message => `${message.role}: ${message.content.slice(0, 800)}`).join("\n") : "";
  if (!messages) return json({ error: "没有可用于提取主题的对话。" }, 400, origin, allowedOrigin);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash", thinking: { type: "disabled" }, max_tokens: 80,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract the central topic of this language-practice conversation. Return JSON only: {\"title\":\"...\"}. Write a specific, file-name-like Chinese title of 4-16 characters. Do not use generic titles such as 口语练习 or 日常对话." },
        { role: "user", content: messages },
      ],
    }),
  });
  if (!response.ok) return json({ error: "主题提取暂时不可用。" }, 502, origin, allowedOrigin);
  try {
    const payload = await response.json();
    const result = JSON.parse(String(payload.choices?.[0]?.message?.content || "").replace(/^```json\s*|\s*```$/g, ""));
    const title = String(result.title || "").trim().slice(0, 60);
    if (!title) throw new Error("missing title");
    return json({ title }, 200, origin, allowedOrigin);
  } catch { return json({ error: "主题提取结果格式异常。" }, 502, origin, allowedOrigin); }
}

// ── Cards CRUD ─────────────────────────────────────────
// 所有数据库操作通过 env.DB（D1 binding）执行
// Cloudflare Worker 在运行时自动注入该绑定，无需手动连接

async function listCards(env, origin, allowedOrigin) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM cards ORDER BY created_at DESC"
  ).all();
  return json(results, 200, origin, allowedOrigin);
}

async function addCard(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  const { id, text, sentence, meaning, note, level, next_review } = body;
  const language = ["en", "ja", "nl"].includes(body.language) ? body.language : "nl";
  if (!id || !text) {
    return json({ error: "id 和 text 为必填。" }, 400, origin, allowedOrigin);
  }

  await env.DB.prepare(
    `INSERT INTO cards (id, text, sentence, meaning, note, level, next_review, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, text, sentence || "", meaning || "", note || "", level || 0, next_review || new Date().toISOString(), language).run();

  return json({ ok: true, id }, 201, origin, allowedOrigin);
}

async function syncCards(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  if (!Array.isArray(body)) {
    return json({ error: "请求体必须是卡片数组。" }, 400, origin, allowedOrigin);
  }

  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO cards (id, text, sentence, meaning, note, level, next_review, created_at, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const batch = body.map(card =>
    stmt.bind(
      card.id, card.text,
      card.sentence || "", card.meaning || "", card.note || "",
      card.level || 0, card.next_review || new Date().toISOString(),
      card.created_at || new Date().toISOString(), ["en", "ja", "nl"].includes(card.language) ? card.language : "nl"
    )
  );

  await env.DB.batch(batch);
  return json({ ok: true, count: body.length }, 200, origin, allowedOrigin);
}

async function deleteCard(id, env, origin, allowedOrigin) {
  await env.DB.prepare("DELETE FROM cards WHERE id = ?").bind(id).run();
  return json({ ok: true, id }, 200, origin, allowedOrigin);
}

async function patchCard(id, request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  const { level, next_review, meaning, note } = body;
  const sets = [];
  const vals = [];

  if (level !== undefined) { sets.push("level = ?"); vals.push(level); }
  if (next_review) { sets.push("next_review = ?"); vals.push(next_review); }
  if (meaning !== undefined) { sets.push("meaning = ?"); vals.push(meaning); }
  if (note !== undefined) { sets.push("note = ?"); vals.push(note); }

  if (sets.length === 0) {
    return json({ error: "没有需要更新的字段。" }, 400, origin, allowedOrigin);
  }

  vals.push(id);
  await env.DB.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true, id }, 200, origin, allowedOrigin);
}

// ── Full transcript archive ──────────────────────────
const MAX_DOCUMENT_HTML_LENGTH = 500000;
const MAX_ANNOTATIONS_LENGTH = 250000;
let audioColumnReady = false;

async function ensureDocumentAudioColumn(env) {
  if (audioColumnReady) return;
  try {
    await env.DB.prepare("ALTER TABLE documents ADD COLUMN audio_url TEXT DEFAULT ''").run();
  } catch (error) {
    // Existing databases raise a duplicate-column error after the first deploy.
    if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
  }
  audioColumnReady = true;
}

function documentFromRow(row) {
  let annotations = [];
  try { annotations = JSON.parse(row.annotations_json || "[]"); } catch {}
  return {
    id: row.id,
    document_date: row.document_date,
    title: row.title,
    html: row.html,
    video_url: row.video_url || "",
    audio_url: row.audio_url || "",
    language: row.language || "nl",
    annotations,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listDocuments(env, origin, allowedOrigin) {
  await ensureDocumentAudioColumn(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM documents ORDER BY document_date DESC, updated_at DESC"
  ).all();
  return json(results.map(documentFromRow), 200, origin, allowedOrigin);
}

// ── Google Cloud Text-to-Speech ───────────────────────
async function handleTts(request, env, origin, allowedOrigin) {
  if (!env.GOOGLE_TTS_API_KEY) {
    return json({ error: "Worker 尚未设置 GOOGLE_TTS_API_KEY。" }, 500, origin, allowedOrigin);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language = ["en", "ja", "nl"].includes(body.language) ? body.language : "nl";
  const speed = Number(body.speed);
  const speakingRate = Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 1;
  // 每次朗读从同一语言的 WaveNet 声线中随机选择；前端会带回上一条声线，避免连续重复。
  const voiceOptions = {
    nl: ["nl-NL-Wavenet-F", "nl-NL-Wavenet-G"],
    en: ["en-US-Wavenet-A", "en-US-Wavenet-B", "en-US-Wavenet-C", "en-US-Wavenet-D", "en-US-Wavenet-E", "en-US-Wavenet-F", "en-US-Wavenet-G", "en-US-Wavenet-H", "en-US-Wavenet-I", "en-US-Wavenet-J"],
    ja: ["ja-JP-Wavenet-A", "ja-JP-Wavenet-B", "ja-JP-Wavenet-C", "ja-JP-Wavenet-D"],
  };
  const previousVoice = typeof body.previous_voice === "string" ? body.previous_voice : "";
  const candidates = voiceOptions[language].filter(voice => voice !== previousVoice);
  const availableVoices = candidates.length ? candidates : voiceOptions[language];
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const selectedVoice = availableVoices[randomBytes[0] % availableVoices.length];
  const languageCode = language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "nl-NL";

  if (!text || text.length > 1000) {
    return json({ error: "text 必须是 1–1000 个字符。" }, 400, origin, allowedOrigin);
  }

  const googleResponse = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_TTS_API_KEY,
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: selectedVoice },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate,
        },
      }),
    }
  );

  if (!googleResponse.ok) {
    console.error("Google Cloud TTS failed", googleResponse.status, await googleResponse.text());
    return json({ error: "Google Cloud 发音服务暂时不可用。" }, 502, origin, allowedOrigin);
  }

  try {
    const { audioContent } = await googleResponse.json();
    if (!audioContent) throw new Error("missing audioContent");
    const binary = Uint8Array.from(atob(audioContent), char => char.charCodeAt(0));
    return new Response(binary, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-API-Secret, Authorization",
        "Content-Type": "audio/mpeg",
        "X-TTS-Voice": selectedVoice,
        "Cache-Control": "private, max-age=86400",
        "Vary": "Origin",
      },
    });
  } catch (error) {
    console.error("Could not decode Google Cloud TTS response", error);
    return json({ error: "Google Cloud 发音结果格式异常。" }, 502, origin, allowedOrigin);
  }
}

// ── Persisted audio files (Cloudflare R2) ─────────────
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

async function uploadAudio(request, env, origin, allowedOrigin) {
  if (!env.AUDIO_BUCKET) return json({ error: "Worker 尚未绑定 AUDIO_BUCKET R2 存储桶。" }, 500, origin, allowedOrigin);
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("audio/")) return json({ error: "只允许上传音频文件。" }, 415, origin, allowedOrigin);
  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (declaredSize > MAX_AUDIO_BYTES) return json({ error: "单个音频文件不能超过 50 MB。" }, 413, origin, allowedOrigin);
  const encodedName = request.headers.get("X-Audio-Filename") || "audio";
  let originalName = "audio";
  try { originalName = decodeURIComponent(encodedName); } catch {}
  const extension = (originalName.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || contentType.split("/")[1] || "bin").toLowerCase();
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
  const key = `${Date.now().toString(36)}-${crypto.randomUUID()}.${safeExtension}`;
  await env.AUDIO_BUCKET.put(key, request.body, {
    httpMetadata: { contentType, cacheControl: "private, max-age=3600" },
    customMetadata: { originalName: originalName.slice(0, 180) },
  });
  const url = new URL(`/api/audio/${encodeURIComponent(key)}`, request.url).href;
  return json({ ok: true, key, url }, 201, origin, allowedOrigin);
}

async function getAudio(key, request, env, origin, allowedOrigin) {
  if (!env.AUDIO_BUCKET) return json({ error: "Worker 尚未绑定 AUDIO_BUCKET R2 存储桶。" }, 500, origin, allowedOrigin);
  const object = await env.AUDIO_BUCKET.get(key, { range: request.headers });
  if (!object) return json({ error: "未找到音频文件。" }, 404, origin, allowedOrigin);
  const headers = new Headers(corsHeaders(origin, allowedOrigin));
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  let status = 200;
  if (object.range && request.headers.has("Range")) {
    status = 206;
    const offset = object.range.offset || 0;
    const length = object.range.length || 0;
    headers.set("Content-Range", `bytes ${offset}-${offset + Math.max(0, length - 1)}/${object.size}`);
    headers.set("Content-Length", String(length));
  } else {
    headers.set("Content-Length", String(object.size));
  }
  return new Response(object.body, { status, headers });
}

async function deleteAudio(key, env, origin, allowedOrigin) {
  if (!env.AUDIO_BUCKET) return json({ error: "Worker 尚未绑定 AUDIO_BUCKET R2 存储桶。" }, 500, origin, allowedOrigin);
  await env.AUDIO_BUCKET.delete(key);
  return json({ ok: true, key }, 200, origin, allowedOrigin);
}

async function deleteDocument(id, env, origin, allowedOrigin) {
  const result = await env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return json({ error: "未找到该历史全文。" }, 404, origin, allowedOrigin);
  return json({ ok: true, id }, 200, origin, allowedOrigin);
}

// ── Resource task list ────────────────────────────────
let resourcesTableReady = false;
async function ensureResourcesTable(env) {
  if (resourcesTableReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT DEFAULT '',
    type TEXT NOT NULL,
    language TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    description TEXT DEFAULT '',
    emoji TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog',
    completed_at TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  try {
    await env.DB.prepare("ALTER TABLE resources ADD COLUMN description TEXT DEFAULT ''").run();
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
  }
  try {
    await env.DB.prepare("ALTER TABLE resources ADD COLUMN emoji TEXT DEFAULT ''").run();
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
  }
  resourcesTableReady = true;
}

let resourceSettingsTableReady = false;
async function ensureResourceSettingsTable(env) {
  if (resourceSettingsTableReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS resource_settings (
    id TEXT PRIMARY KEY,
    languages TEXT NOT NULL DEFAULT '[]',
    groups_json TEXT NOT NULL DEFAULT '[]',
    types_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`).run();
  resourceSettingsTableReady = true;
}

function parseJsonArray(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function getResourceSettings(env, origin, allowedOrigin) {
  await ensureResourceSettingsTable(env);
  const row = await env.DB.prepare("SELECT languages, groups_json, types_json, updated_at FROM resource_settings WHERE id = 'default'").first();
  if (!row) return json({ languages: [], groups: [], types: [], updated_at: '' }, 200, origin, allowedOrigin);
  return json({
    languages: parseJsonArray(row.languages),
    groups: parseJsonArray(row.groups_json),
    types: parseJsonArray(row.types_json),
    updated_at: row.updated_at || '',
  }, 200, origin, allowedOrigin);
}

async function saveResourceSettings(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体必须是 JSON。' }, 400, origin, allowedOrigin); }
  const languages = Array.isArray(body.languages) ? body.languages.map(value => String(value).trim().slice(0, 80)).filter(Boolean).slice(0, 200) : [];
  const groups = Array.isArray(body.groups) ? body.groups.map(item => ({ id: String(item?.id || '').trim().slice(0, 120), name: String(item?.name || '').trim().slice(0, 80) })).filter(item => item.id && item.name).slice(0, 200) : [];
  const groupIds = new Set(groups.map(item => item.id));
  const types = Array.isArray(body.types) ? body.types.map(item => ({ id: String(item?.id || '').trim().slice(0, 120), name: String(item?.name || '').trim().slice(0, 80), group: String(item?.group || '').trim().slice(0, 120) })).filter(item => item.id && item.name && groupIds.has(item.group)).slice(0, 500) : [];
  const updatedAt = new Date().toISOString();
  await ensureResourceSettingsTable(env);
  await env.DB.prepare(`INSERT INTO resource_settings (id,languages,groups_json,types_json,updated_at) VALUES ('default',?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET languages=excluded.languages,groups_json=excluded.groups_json,types_json=excluded.types_json,updated_at=excluded.updated_at`)
    .bind(JSON.stringify(languages), JSON.stringify(groups), JSON.stringify(types), updatedAt).run();
  return json({ languages, groups, types, updated_at: updatedAt }, 200, origin, allowedOrigin);
}

function resourceFromBody(body, existingId = '') {
  const allowedStatuses = new Set(['backlog', 'active', 'completed']);
  const now = new Date().toISOString();
  return {
    id: existingId || String(body.id || ''),
    name: String(body.name || '').trim().slice(0, 300),
    url: String(body.url || '').trim().slice(0, 2000),
    type: String(body.type || 'website').trim().slice(0, 120),
    language: String(body.language || '').trim().slice(0, 80),
    topic: String(body.topic || '').trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 500),
    emoji: String(body.emoji || '').trim().slice(0, 32),
    status: allowedStatuses.has(body.status) ? body.status : 'backlog',
    completed_at: String(body.completed_at || '').slice(0, 40),
    created_at: String(body.created_at || now).slice(0, 40),
    updated_at: now,
  };
}

async function listResources(env, origin, allowedOrigin) {
  await ensureResourcesTable(env);
  const { results } = await env.DB.prepare('SELECT * FROM resources ORDER BY updated_at DESC').all();
  return json(results, 200, origin, allowedOrigin);
}

async function saveResource(request, env, origin, allowedOrigin, id = '') {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体必须是 JSON。' }, 400, origin, allowedOrigin); }
  const resource = resourceFromBody(body, id);
  if (!resource.id || !resource.name) return json({ error: 'id 和 name 为必填。' }, 400, origin, allowedOrigin);
  await ensureResourcesTable(env);
  await env.DB.prepare(`INSERT INTO resources (id,name,url,type,language,topic,description,emoji,status,completed_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,type=excluded.type,
    language=excluded.language,topic=excluded.topic,description=excluded.description,emoji=excluded.emoji,status=excluded.status,completed_at=excluded.completed_at,updated_at=excluded.updated_at`)
    .bind(resource.id, resource.name, resource.url, resource.type, resource.language, resource.topic, resource.description, resource.emoji, resource.status, resource.completed_at, resource.created_at, resource.updated_at).run();
  return json(resource, 200, origin, allowedOrigin);
}

async function deleteResource(id, env, origin, allowedOrigin) {
  await ensureResourcesTable(env);
  await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run();
  return json({ ok: true, id }, 200, origin, allowedOrigin);
}

// ── Review preferences and stable daily order ────────────────
let reviewStateTablesReady = false;
async function ensureReviewStateTables(env) {
  if (reviewStateTablesReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS review_preferences (
    id TEXT PRIMARY KEY,
    batch_size INTEGER NOT NULL DEFAULT 20,
    exercise_mode TEXT NOT NULL DEFAULT 'card',
    updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_review_plans (
    plan_key TEXT PRIMARY KEY,
    card_order TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`).run();
  reviewStateTablesReady = true;
}

async function getReviewPreferences(env, origin, allowedOrigin) {
  await ensureReviewStateTables(env);
  const row = await env.DB.prepare("SELECT batch_size, exercise_mode, updated_at FROM review_preferences WHERE id = 'default'").first();
  return json(row || { batch_size: 20, exercise_mode: 'card', updated_at: '' }, 200, origin, allowedOrigin);
}

async function saveReviewPreferences(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体必须是 JSON。' }, 400, origin, allowedOrigin); }
  const batchSize = [0, 10, 20, 30].includes(Number(body.batch_size)) ? Number(body.batch_size) : 20;
  const exerciseMode = body.exercise_mode === 'cloze' ? 'cloze' : 'card';
  const updatedAt = new Date().toISOString();
  await ensureReviewStateTables(env);
  await env.DB.prepare(`INSERT INTO review_preferences (id,batch_size,exercise_mode,updated_at) VALUES ('default',?,?,?)
    ON CONFLICT(id) DO UPDATE SET batch_size=excluded.batch_size,exercise_mode=excluded.exercise_mode,updated_at=excluded.updated_at`)
    .bind(batchSize, exerciseMode, updatedAt).run();
  return json({ batch_size: batchSize, exercise_mode: exerciseMode, updated_at: updatedAt }, 200, origin, allowedOrigin);
}

async function getDailyReviewPlan(request, env, origin, allowedOrigin) {
  const key = String(new URL(request.url).searchParams.get('key') || '').slice(0, 160);
  if (!key) return json({ error: '缺少复习计划 key。' }, 400, origin, allowedOrigin);
  await ensureReviewStateTables(env);
  const row = await env.DB.prepare('SELECT plan_key, card_order, updated_at FROM daily_review_plans WHERE plan_key = ?').bind(key).first();
  if (!row) return json({ plan_key: key, order: [], updated_at: '' }, 200, origin, allowedOrigin);
  let order = [];
  try { order = JSON.parse(row.card_order); } catch {}
  return json({ plan_key: row.plan_key, order: Array.isArray(order) ? order : [], updated_at: row.updated_at }, 200, origin, allowedOrigin);
}

async function saveDailyReviewPlan(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体必须是 JSON。' }, 400, origin, allowedOrigin); }
  const key = String(body.plan_key || '').slice(0, 160);
  if (!key) return json({ error: '缺少复习计划 key。' }, 400, origin, allowedOrigin);
  const order = Array.isArray(body.order) ? body.order.map(String).filter(Boolean).slice(0, 10000) : [];
  const updatedAt = new Date().toISOString();
  await ensureReviewStateTables(env);
  await env.DB.prepare(`INSERT INTO daily_review_plans (plan_key,card_order,updated_at) VALUES (?,?,?)
    ON CONFLICT(plan_key) DO UPDATE SET card_order=excluded.card_order,updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(order), updatedAt).run();
  return json({ plan_key: key, order, updated_at: updatedAt }, 200, origin, allowedOrigin);
}

async function saveDocument(request, env, origin, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "请求体必须是 JSON。" }, 400, origin, allowedOrigin);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const documentDate = typeof body.document_date === "string" ? body.document_date.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const html = typeof body.html === "string" ? body.html : "";
  const videoUrl = typeof body.video_url === "string" ? body.video_url.trim().slice(0, 2000) : "";
  const audioUrl = typeof body.audio_url === "string" ? body.audio_url.trim().slice(0, 4000) : "";
  const language = ["en", "ja", "nl"].includes(body.language) ? body.language : "nl";
  const annotations = Array.isArray(body.annotations) ? body.annotations : [];
  const annotationsJson = JSON.stringify(annotations);

  if (!id || !/^[-_a-zA-Z0-9]+$/.test(id)) {
    return json({ error: "文档 id 格式无效。" }, 400, origin, allowedOrigin);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    return json({ error: "document_date 必须为 YYYY-MM-DD。" }, 400, origin, allowedOrigin);
  }
  if (!html || html.length > MAX_DOCUMENT_HTML_LENGTH || annotationsJson.length > MAX_ANNOTATIONS_LENGTH) {
    return json({ error: "全文或标注内容超出保存限制。" }, 400, origin, allowedOrigin);
  }

  const now = new Date().toISOString();
  await ensureDocumentAudioColumn(env);
  await env.DB.prepare(
    `INSERT INTO documents (id, document_date, title, html, video_url, audio_url, annotations_json, language, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       document_date = excluded.document_date,
       title = excluded.title,
       html = excluded.html,
       video_url = excluded.video_url,
       audio_url = excluded.audio_url,
       annotations_json = excluded.annotations_json,
       language = excluded.language,
       updated_at = excluded.updated_at`
  ).bind(id, documentDate, title || "未命名 transcript", html, videoUrl, audioUrl, annotationsJson, language, now, now).run();

  return json({ ok: true, id, updated_at: now }, 201, origin, allowedOrigin);
}

// ── NHK Easy HLS proxy ───────────────────────────────
// NHK's signed playlists are readable on the article page but their media
// host does not allow another website to fetch the playlist/segments through
// JavaScript. Proxy only this exact media host and path; never accept an
// arbitrary URL, otherwise this endpoint would become an open proxy.
function validNhkMediaUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "media.vd.st.nhk" && url.pathname.startsWith("/news/easy_audio/");
  } catch { return false; }
}

async function proxyNhkHls(request, origin, allowedOrigin) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = requestUrl.searchParams.get("url") || "";
  if (!validNhkMediaUrl(upstreamUrl)) return json({ error: "只允许代理 NHK Easy 音频地址。" }, 400, origin, allowedOrigin);

  const upstreamHeaders = new Headers({
    "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, audio/aac, */*",
    "Referer": "https://news.web.nhk/",
    "User-Agent": "Mozilla/5.0",
  });
  const range = request.headers.get("Range");
  if (range) upstreamHeaders.set("Range", range);

  let response;
  try {
    response = await fetch(upstreamUrl, { headers: upstreamHeaders, redirect: "follow" });
  } catch {
    return json({ error: "无法连接 NHK 音频服务。" }, 502, origin, allowedOrigin);
  }
  if (!response.ok) return json({ error: response.status === 403 ? "NHK 音频链接已过期，请重新复制。" : "NHK 音频暂时不可用。" }, response.status, origin, allowedOrigin);
  if (!validNhkMediaUrl(response.url || upstreamUrl)) return json({ error: "NHK 音频重定向地址无效。" }, 502, origin, allowedOrigin);

  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  const isPlaylist = /mpegurl/i.test(contentType) || /\.m3u8(?:[?#]|$)/i.test(upstreamUrl);
  const headers = new Headers(corsHeaders(origin, allowedOrigin));
  headers.set("Cache-Control", "private, max-age=30");

  if (isPlaylist) {
    const manifest = await response.text();
    const proxyOrigin = requestUrl.origin;
    const wrap = value => `${proxyOrigin}/api/nhk-hls?url=${encodeURIComponent(new URL(value, upstreamUrl).href)}`;
    const rewritten = manifest.split(/\r?\n/).map(line => {
      if (!line) return line;
      if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${wrap(uri)}"`);
      return wrap(line.trim());
    }).join("\n");
    headers.set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    return new Response(rewritten, { status: 200, headers });
  }

  headers.set("Content-Type", contentType);
  ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"].forEach(name => {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  });
  return new Response(response.body, { status: response.status, headers });
}

// ── 同步协议 v2：旧表仅作为一次性迁移源 ─────────────────
const SYNC_ENTITIES = new Set(['card', 'document', 'resource', 'settings']);
const SYNC_KINDS = new Set(['create', 'patch', 'delete', 'restore']);
const SYNC_RETRIES = 4;

class SyncError extends Error {
  constructor(status, code, message, current = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

function syncAssert(condition, message) {
  if (!condition) throw new SyncError(400, 'invalid_request', message);
}

function syncRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function syncCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(syncCanonical).join(',')}]`;
  if (syncRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${syncCanonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function syncHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function syncTime(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  let text = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) text = text.replace(' ', 'T') + 'Z';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function syncText(value, field, max, required = false) {
  syncAssert(typeof value === 'string' && value.length <= max && (!required || value.trim()), `${field} 格式或长度无效。`);
  return value;
}

function syncId(value, field = 'id', max = 120) {
  syncAssert(typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f]/.test(value), `${field} 无效。`);
  return value;
}

function syncSettings(value) {
  const result = { id: 'resources', schema_version: 3 };
  for (const [key, limit] of [['languages', 200], ['groups', 200], ['types', 500]]) {
    syncAssert(Array.isArray(value[key]) && value[key].length <= limit, `${key} 必须是数组且不能超过 ${limit} 项。`);
    const ids = new Set();
    const names = new Set();
    result[key] = value[key].map(item => {
      syncAssert(syncRecord(item), `${key} 项必须是对象。`);
      syncAssert(Object.keys(item).every(k => (key === 'types' ? ['id', 'name', 'group', 'emoji'] : ['id', 'name']).includes(k)), `${key} 存在未知字段。`);
      const id = syncId(item.id);
      const name = syncText(item.name, 'name', 80, true).trim();
      syncAssert(!ids.has(id) && !names.has(name), `${key} 的 ID 和名称不能重复。`);
      syncAssert(key !== 'languages' || name !== '不限语言', '不限语言使用 language_id: null，不能作为语言标签。');
      ids.add(id);
      names.add(name);
      if (key !== 'types') return { id, name };
      const type = { id, name, emoji: syncText(item.emoji ?? '', 'emoji', 32).trim() };
      // group 仅作为历史迁移信息保留；新类型不再依赖分组。
      if (item.group) type.group = syncId(item.group, 'group');
      return type;
    });
  }
  for (const [key, limit] of [['tags', 1000], ['decks', 500]]) {
    const ids = new Set(), names = new Set();
    const source = value[key] ?? [];
    syncAssert(Array.isArray(source) && source.length <= limit, `${key} 必须是数组且不能超过 ${limit} 项。`);
    result[key] = source.map(item => {
      syncAssert(syncRecord(item) && Object.keys(item).every(k => ['id', 'name', 'emoji'].includes(k)), `${key} 项格式无效。`);
      const id = syncId(item.id), name = syncText(item.name, 'name', 80, true).trim();
      const normalized = name.normalize('NFKC').toLocaleLowerCase();
      syncAssert(!ids.has(id) && !names.has(normalized), `${key} 的 ID 和名称不能重复。`);
      ids.add(id); names.add(normalized);
      return { id, name, emoji: syncText(item.emoji ?? '', 'emoji', 32).trim() };
    });
  }
  return result;
}

async function syncSeedSettings(row) {
  // 只有记录不存在时才初始化默认值；空数组明确表示用户已清空配置。
  const readArray = field => {
    const value = JSON.parse(row[field]);
    if (!Array.isArray(value)) throw new Error('旧配置不是有效数组，停止迁移以保留原数据。');
    return value;
  };
  const languages = row ? readArray('languages') : ['中文', 'English', '日本語', 'Nederlands'];
  const groups = row ? readArray('groups_json') : [
    { id: 'work', name: '工作' }, { id: 'study', name: '学习' }, { id: 'personal', name: '课余' },
  ];
  const types = row ? readArray('types_json') : [
    { id: 'movie_series', name: '影视', emoji: '🎬' },
    { id: 'book', name: '书籍', emoji: '📚' },
    { id: 'article', name: '文章', emoji: '📝' },
    { id: 'audio', name: '音频', emoji: '🎧' },
    { id: 'course', name: '课程', emoji: '🎓' },
    { id: 'website', name: '网站 / 工具', emoji: '🌐' },
    { id: 'project', name: '项目资料', emoji: '📁' },
    { id: 'game', name: '游戏', emoji: '🎮' },
    { id: 'other', name: '其他', emoji: '📌' },
  ];
  const converted = [];
  for (const item of languages) {
    const name = typeof item === 'string' ? item : item.name;
    if (name === '不限语言') continue;
    converted.push({ id: typeof item === 'string' ? `lang_${await syncHash(name)}` : item.id, name });
  }
  // 迁移不套用写入时的裁剪/去重规则，避免静默丢失历史自定义名称。
  return { id: 'resources', schema_version: 3, languages: converted, groups, types, tags: [], decks: [] };
}

async function ensureSyncV2(db, readOnly) {
  const tables = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(row => row.name));
  if (tables.has('sync_v2_meta')) {
    const meta = await db.prepare('SELECT epoch, head FROM sync_v2_meta WHERE id = 1').first();
    if (meta) return;
  }
  if (readOnly) throw new SyncError(503, 'sync_read_only', '同步处于只读模式，尚未执行首次迁移。');
  const names = ['cards', 'documents', 'resources', 'resource_settings'].filter(name => tables.has(name));
  const sources = names.length ? await db.batch(names.map(name => db.prepare(`SELECT * FROM ${name} ORDER BY id`))) : [];
  const rows = Object.fromEntries(names.map((name, i) => [name, sources[i].results]));
  const settingsRows = rows.resource_settings || [];
  const settings = await syncSeedSettings(settingsRows.find(row => row.id === 'default') || settingsRows[0]);
  const now = new Date().toISOString();
  const objects = [{ entity: 'settings', id: 'resources', data: settings }];
  for (const [table, entity] of [['cards', 'card'], ['documents', 'document'], ['resources', 'resource']]) {
    for (const row of rows[table] || []) {
      let data = entity === 'document' ? documentFromRow(row) : { ...row };
      data = { ...data, id: row.id, created_at: syncTime(row.created_at, now), updated_at: syncTime(row.updated_at, syncTime(row.created_at, now)) };
      if (entity === 'card') {
        data.language = row.language || 'nl';
        data.next_review = syncTime(row.next_review, now);
      }
      if (entity === 'resource') {
        for (const key of ['url', 'topic', 'description', 'emoji']) data[key] ??= '';
        const language = settings.languages.find(item => item.name === row.language);
        data.language_id = language?.id || null;
        data.language = language?.name || row.language || '不限语言';
        if (!language && row.language && row.language !== '不限语言') data.legacy_language = row.language;
        data.completed_at = syncTime(row.completed_at, '');
      }
      objects.push({ entity, id: row.id, data });
    }
  }
  const epoch = crypto.randomUUID();
  // DDL、唯一的 epoch seed 及全部对象在同一个事务中提交。并发 isolate 的
  // 第二次 INSERT 必须失败并回滚整个 batch，绝不部分导入或覆盖已迁移数据。
  const statements = [
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1), epoch TEXT NOT NULL,
      head INTEGER NOT NULL CHECK (head >= 0 AND head <= 9007199254740991)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_objects (
      entity TEXT NOT NULL CHECK (entity IN ('card','document','resource','settings')),
      id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
      deleted INTEGER NOT NULL CHECK (deleted IN (0,1)), data TEXT NOT NULL,
      PRIMARY KEY (entity, id), CHECK (entity != 'settings' OR id = 'resources')
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_ops (
      op_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response TEXT NOT NULL,
      guard INTEGER NOT NULL CHECK (guard = 1)
    )`),
    db.prepare('INSERT INTO sync_v2_meta (id, epoch, head) VALUES (1, ?, ?)').bind(epoch, objects.length),
    ...objects.map((object, i) => db.prepare('INSERT INTO sync_v2_objects (entity,id,revision,deleted,data) VALUES (?,?,?,0,?)')
      .bind(object.entity, object.id, i + 1, JSON.stringify(object.data))),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const ready = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_v2_meta'").first();
    if (ready && await db.prepare('SELECT epoch FROM sync_v2_meta WHERE id = 1').first()) return;
    throw error;
  }
}

async function syncSnapshot(db, opId) {
  const statements = [
    db.prepare('SELECT epoch, head FROM sync_v2_meta WHERE id = 1'),
    db.prepare('SELECT entity,id,revision,deleted,data FROM sync_v2_objects ORDER BY entity,id'),
  ];
  if (opId) statements.push(db.prepare('SELECT request_hash,response FROM sync_v2_ops WHERE op_id = ?').bind(opId));
  // 读取本身也使用事务，避免返回旧 head 配上新对象的撕裂快照。
  const results = await db.batch(statements);
  return {
    ...results[0].results[0],
    objects: results[1].results.map(row => ({ ...row, deleted: Boolean(row.deleted), data: JSON.parse(row.data) })),
    receipt: results[2]?.results[0],
  };
}

function syncVisible(object, settings) {
  if (!object || object.entity !== 'resource') return object;
  const name = settings?.languages.find(item => item.id === object.data.language_id)?.name;
  // language 是展示投影，不参与版本判断；重命名标签无需改写每个资源。
  return { ...object, data: { ...object.data, language: name || object.data.legacy_language || (object.data.language_id === null ? '不限语言' : object.data.language) } };
}

function syncNormalizeData(op, current, snapshot) {
  const allowedFields = {
    card: ['id', 'text', 'sentence', 'meaning', 'note', 'level', 'next_review', 'language', 'created_at', 'updated_at'],
    document: ['id', 'document_date', 'title', 'html', 'video_url', 'audio_url', 'annotations', 'language', 'created_at', 'updated_at'],
    resource: ['id', 'name', 'url', 'type', 'language_id', 'language', 'legacy_language', 'topic', 'description', 'emoji', 'tag_ids', 'deck_ids', 'status', 'completed_at', 'created_at', 'updated_at'],
    settings: ['id', 'schema_version', 'languages', 'groups', 'types', 'tags', 'decks'],
  };
  syncAssert(Object.keys(op.patch).every(key => allowedFields[op.entity].includes(key)), 'patch 含有未知字段。');
  syncAssert(op.patch.id === undefined || op.patch.id === op.id, 'patch.id 不能修改对象 ID。');
  const value = { ...current?.data, ...op.patch, id: op.id };
  const activeResources = snapshot.objects.filter(object => object.entity === 'resource' && !object.deleted);
  if (op.entity === 'settings') {
    const data = syncSettings(value);
    const removedLanguages = new Set((current?.data.languages || []).filter(item => !data.languages.some(next => next.id === item.id)).map(item => item.id));
    const removedTypes = new Set((current?.data.types || []).filter(item => !data.types.some(next => next.id === item.id)).map(item => item.id));
    if (activeResources.some(object => removedLanguages.has(object.data.language_id) || removedTypes.has(object.data.type))) {
      throw new SyncError(409, 'reference_conflict', '不能删除仍被活动资源使用的语言或类型。', current);
    }
    return data;
  }
  const now = new Date().toISOString();
  const data = { id: op.id, created_at: current?.data.created_at || now, updated_at: now };
  if (op.entity === 'card' || op.entity === 'document') {
    syncAssert(value.language === undefined || ['en', 'ja', 'nl'].includes(value.language), 'language 必须是 en、ja 或 nl。');
    data.language = value.language || 'nl';
  }
  if (op.entity === 'card') {
    data.text = syncText(value.text, 'text', Infinity, true);
    for (const key of ['sentence', 'meaning', 'note']) data[key] = syncText(value[key] ?? '', key, Infinity);
    data.level = value.level ?? 0;
    syncAssert(Number.isSafeInteger(data.level) && data.level >= 0, 'level 必须为非负整数。');
    data.next_review = syncTime(value.next_review ?? now, null);
    syncAssert(data.next_review !== null, 'next_review 必须是有效日期。');
  } else if (op.entity === 'document') {
    syncAssert(/^[-_a-zA-Z0-9]+$/.test(op.id), '文档 id 格式无效。');
    const date = value.document_date;
    syncAssert(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && syncTime(date, '')?.slice(0, 10) === date, 'document_date 必须为有效的 YYYY-MM-DD。');
    data.document_date = date;
    data.title = syncText(value.title ?? '', 'title', 300).trim() || '未命名 transcript';
    data.html = syncText(value.html, 'html', MAX_DOCUMENT_HTML_LENGTH, true);
    data.video_url = syncText(value.video_url ?? '', 'video_url', 2000).trim();
    data.audio_url = syncText(value.audio_url ?? '', 'audio_url', 4000).trim();
    syncAssert(value.annotations === undefined || Array.isArray(value.annotations), 'annotations 必须是数组。');
    data.annotations = value.annotations ?? [];
    syncAssert(JSON.stringify(data.annotations).length <= MAX_ANNOTATIONS_LENGTH, '标注内容超出保存限制。');
  } else {
    const settings = snapshot.objects.find(object => object.entity === 'settings' && !object.deleted)?.data;
    for (const [key, limit] of [['name', 300], ['url', 2000], ['topic', 120], ['description', 500], ['emoji', 32]]) {
      data[key] = syncText(value[key] ?? '', key, limit, key === 'name').trim();
    }
    data.type = syncText(value.type ?? 'website', 'type', 120, true).trim();
    data.language_id = value.language_id ?? null;
    const language = settings?.languages.find(item => item.id === data.language_id);
    if (!settings?.types.some(item => item.id === data.type) || (data.language_id !== null && !language)) {
      throw new SyncError(409, 'reference_conflict', '资源引用了不存在的类型或语言。', syncVisible(current, settings));
    }
    const oldLegacy = current?.data.legacy_language;
    syncAssert(value.legacy_language == null || value.legacy_language === '' || (oldLegacy && value.legacy_language === oldLegacy), '不能伪造或改写 legacy_language。');
    if (data.language_id === null && value.legacy_language && oldLegacy) data.legacy_language = oldLegacy;
    if (op.patch.language !== undefined && data.language_id === null) {
      syncAssert(op.patch.language === '' || op.patch.language === '不限语言' || op.patch.language === data.legacy_language, '指定语言必须提供有效的 language_id。');
    }
    data.language = language?.name || data.legacy_language || '不限语言';
    for (const [field, config] of [['tag_ids', settings?.tags || []], ['deck_ids', settings?.decks || []]]) {
      const ids = value[field] ?? current?.data[field] ?? [];
      syncAssert(Array.isArray(ids) && ids.length <= 500 && ids.every(id => typeof id === 'string'), `${field} 必须是字符串数组。`);
      data[field] = [...new Set(ids)];
      const valid = new Set(config.map(item => item.id));
      syncAssert(data[field].every(id => valid.has(id)), `${field} 引用了不存在的配置。`);
    }
    data.status = value.status ?? 'backlog';
    syncAssert(['backlog', 'active', 'completed'].includes(data.status), 'status 无效。');
    data.completed_at = value.completed_at ? syncTime(syncText(value.completed_at, 'completed_at', 40), null) : '';
    syncAssert(data.completed_at !== null, 'completed_at 必须是有效日期。');
  }
  return data;
}

function syncValidateOperation(op) {
  syncAssert(syncRecord(op), '请求体必须是对象。');
  syncAssert(Object.keys(op).every(key => ['protocol', 'epoch', 'opId', 'entity', 'id', 'kind', 'baseRevision', 'patch'].includes(key)), '请求存在未知字段。');
  syncAssert(op.protocol === 2, 'protocol 必须为 2。');
  syncId(op.epoch, 'epoch', 200);
  syncId(op.opId, 'opId', 200);
  syncAssert(SYNC_ENTITIES.has(op.entity) && SYNC_KINDS.has(op.kind), 'entity 或 kind 无效。');
  syncId(op.id);
  syncAssert(op.entity !== 'settings' || op.id === 'resources', 'settings 的唯一 ID 为 resources。');
  syncAssert(Number.isSafeInteger(op.baseRevision) && op.baseRevision >= 0, 'baseRevision 必须为非负安全整数。');
  syncAssert(syncRecord(op.patch), 'patch 必须是对象。');
  if (op.kind === 'delete') syncAssert(Object.keys(op.patch).length === 0, 'delete 的 patch 必须为空对象。');
}

async function syncOperate(db, op) {
  const hash = await syncHash(syncCanonical(op));
  for (let attempt = 0; attempt < SYNC_RETRIES; attempt++) {
    const snapshot = await syncSnapshot(db, op.opId);
    const stored = snapshot.objects.find(object => object.entity === op.entity && object.id === op.id) || null;
    const settings = snapshot.objects.find(object => object.entity === 'settings' && !object.deleted)?.data;
    const current = syncVisible(stored, settings);
    if (snapshot.epoch !== op.epoch) throw new SyncError(409, 'epoch_mismatch', '同步 epoch 已变化，请重新读取状态。', current);
    if (snapshot.receipt) {
      if (snapshot.receipt.request_hash !== hash) throw new SyncError(409, 'op_id_conflict', 'opId 已用于不同请求。', current);
      return JSON.parse(snapshot.receipt.response);
    }
    if ((op.kind === 'create' && (stored || op.baseRevision !== 0)) ||
        (op.kind !== 'create' && (!stored || stored.revision !== op.baseRevision))) {
      throw new SyncError(409, 'revision_conflict', '对象版本已变化，请先合并最新版本。', current);
    }
    if (op.kind !== 'create' && (op.kind === 'restore' ? !stored.deleted : stored.deleted)) {
      throw new SyncError(409, 'revision_conflict', '墓碑只能通过当前版本的 restore 恢复。', current);
    }
    if (op.kind === 'delete' && op.entity === 'settings' && snapshot.objects.some(object => object.entity === 'resource' && !object.deleted)) {
      throw new SyncError(409, 'reference_conflict', '存在活动资源，不能删除资源配置。', current);
    }
    const data = op.kind === 'delete' ? stored.data : syncNormalizeData(op, stored, snapshot);
    const head = snapshot.head + 1;
    if (!Number.isSafeInteger(head)) throw new SyncError(503, 'revision_exhausted', '同步版本已达到上限。');
    const object = { entity: op.entity, id: op.id, revision: head, deleted: op.kind === 'delete', data };
    const response = { ok: true, epoch: snapshot.epoch, head, opId: op.opId, object: syncVisible(object, op.entity === 'settings' ? data : settings) };
    const statements = [
      db.prepare(`INSERT INTO sync_v2_ops (op_id,request_hash,response,guard)
        VALUES (?,?,?, CASE WHEN
          EXISTS (SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch=? AND head=?) AND
          ((?=0 AND NOT EXISTS (SELECT 1 FROM sync_v2_objects WHERE entity=? AND id=?)) OR
           EXISTS (SELECT 1 FROM sync_v2_objects WHERE entity=? AND id=? AND revision=? AND deleted=?))
          THEN 1 ELSE 0 END)`)
        .bind(op.opId, hash, JSON.stringify(response), snapshot.epoch, snapshot.head,
          op.baseRevision, op.entity, op.id, op.entity, op.id, op.baseRevision, stored?.deleted ? 1 : 0),
      db.prepare(`INSERT INTO sync_v2_objects (entity,id,revision,deleted,data) VALUES (?,?,?,?,?)
        ON CONFLICT(entity,id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted,data=excluded.data`)
        .bind(op.entity, op.id, head, object.deleted ? 1 : 0, JSON.stringify(data)),
      db.prepare('UPDATE sync_v2_meta SET head = head + 1 WHERE id = 1 AND epoch = ? AND head = ?').bind(snapshot.epoch, snapshot.head),
      // 后置断言同时防止 UPDATE 零行却留下成功回执。
      db.prepare(`UPDATE sync_v2_ops SET guard = CASE WHEN
        EXISTS (SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch=? AND head=?) AND
        EXISTS (SELECT 1 FROM sync_v2_objects WHERE entity=? AND id=? AND revision=? AND deleted=? AND data=?)
        THEN 1 ELSE 0 END WHERE op_id=?`)
        .bind(snapshot.epoch, head, op.entity, op.id, head, object.deleted ? 1 : 0, JSON.stringify(data), op.opId),
    ];
    try {
      await db.batch(statements);
      return response;
    } catch (error) {
      // 包含“已提交但响应丢失”的情况：先查询持久回执，再决定是否重试。
      const latest = await syncSnapshot(db, op.opId);
      if (latest.epoch !== snapshot.epoch || latest.receipt || latest.head !== snapshot.head) continue;
      throw error;
    }
  }
  // 最后一次并发提交也可能已经产生本操作回执；不能把它误报成失败。
  const latest = await syncSnapshot(db, op.opId);
  const settings = latest.objects.find(object => object.entity === 'settings' && !object.deleted)?.data;
  const current = syncVisible(latest.objects.find(object => object.entity === op.entity && object.id === op.id) || null, settings);
  if (latest.epoch !== op.epoch) throw new SyncError(409, 'epoch_mismatch', '同步 epoch 已变化，请重新读取状态。', current);
  if (latest.receipt) {
    if (latest.receipt.request_hash !== hash) throw new SyncError(409, 'op_id_conflict', 'opId 已用于不同请求。', current);
    return JSON.parse(latest.receipt.response);
  }
  if ((op.kind === 'create' && current) || (op.kind !== 'create' && current?.revision !== op.baseRevision)) {
    throw new SyncError(409, 'revision_conflict', '对象版本已变化，请先合并最新版本。', current);
  }
  throw new SyncError(503, 'sync_busy', '并发写入较多，请使用相同 opId 和请求重试。');
}

async function handleSyncV2(request, env, origin, allowedOrigin) {
  const respond = (body, status) => {
    const response = json(body, status, origin, allowedOrigin);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  try {
    const path = new URL(request.url).pathname;
    const state = path === '/api/sync/state';
    if (request.method !== (state ? 'GET' : 'POST')) return respond({ error: '请求方法不支持。', code: 'method_not_allowed' }, 405);
    if (!state && env.SYNC_READ_ONLY === '1') throw new SyncError(503, 'sync_read_only', '同步暂时只读，请保留未提交操作。');
    let op;
    if (!state) {
      try { op = await request.json(); } catch { throw new SyncError(400, 'invalid_request', '请求体必须是 JSON。'); }
      syncValidateOperation(op);
    }
    // 开启 D1 读副本时也从主库启动会话，避免把过期 head 用于 CAS 重试。
    const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
    await ensureSyncV2(db, env.SYNC_READ_ONLY === '1');
    if (!state) return respond(await syncOperate(db, op), 200);
    const snapshot = await syncSnapshot(db);
    const settings = snapshot.objects.find(object => object.entity === 'settings' && !object.deleted)?.data;
    return respond({ protocol: 2, epoch: snapshot.epoch, head: snapshot.head, objects: snapshot.objects.map(object => syncVisible(object, settings)) }, 200);
  } catch (error) {
    if (error instanceof SyncError) return respond({ error: error.message, code: error.code, ...(error.status === 409 ? { current: error.current } : {}) }, error.status);
    return respond({ error: '同步存储暂时不可用，请使用相同 opId 和请求重试。', code: 'storage_error' }, 503);
  }
}

// ── 路由 ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    // 浏览器的 Origin 永远不包含末尾斜杠；部署变量中误加斜杠时也应正常工作。
    const allowedOrigin = String(env.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");
    const normalizedOrigin = origin.trim().replace(/\/+$/, "");

    if (!allowedOrigin) return json({ error: "Worker 尚未设置 ALLOWED_ORIGIN。" }, 500, origin, "");
    if (origin && normalizedOrigin !== allowedOrigin) return json({ error: "不允许的来源。", origin: normalizedOrigin }, 403, origin, "");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/auth" && request.method === "POST") {
      return json({ token: env.API_SECRET || null }, 200, origin, allowedOrigin);
    }

    const token = extractToken(request);
    const isRead = request.method === "GET";
    if (!isRead && !authOK(request, env, token)) {
      return json({ error: "无效的访问令牌。" }, 401, origin, allowedOrigin);
    }

    const path = url.pathname;

    if (path === '/api/sync/state' || path === '/api/sync/operations') {
      return handleSyncV2(request, env, origin, allowedOrigin);
    }
    // 保留原鉴权次序；已授权的旧同步请求统一拒绝，禁止旧缓存覆盖或复活。
    if (/^\/api\/(cards|documents|resources|resource-settings)(?:\/|$)/.test(path)) {
      return json({ error: '请更新前端并使用同步协议 v2。', code: 'upgrade_required', protocol: 2 }, 426, origin, allowedOrigin);
    }

    if (path === "/api/nhk-hls" && request.method === "GET") {
      return proxyNhkHls(request, origin, allowedOrigin);
    }

    if (path === "/api/translate" && request.method === "POST") {
      return handleTranslate(request, env, origin, allowedOrigin);
    }

    if (path === "/api/japanese/reading" && request.method === "POST") {
      return handleJapaneseReading(request, env, origin, allowedOrigin);
    }

    if (path === "/api/japanese/analyze" && request.method === "POST") {
      return handleJapaneseAnalyze(request, env, origin, allowedOrigin);
    }

    if (path === "/api/japanese/word-detail" && request.method === "POST") {
      return handleJapaneseWordDetail(request, env, origin, allowedOrigin);
    }

    if (path === "/api/tts" && request.method === "POST") {
      return handleTts(request, env, origin, allowedOrigin);
    }

    if (path === "/api/conversation/title" && request.method === "POST") {
      return handleConversationTitle(request, env, origin, allowedOrigin);
    }

    if ((path === "/api/conversation" || path === "/api/chat") && request.method === "POST") {
      return handleConversation(request, env, origin, allowedOrigin);
    }

    if (path === "/api/audio" && request.method === "POST") {
      return uploadAudio(request, env, origin, allowedOrigin);
    }

    const audioMatch = path.match(/^\/api\/audio\/([^/]+)$/);
    if (audioMatch) {
      const audioKey = decodeURIComponent(audioMatch[1]);
      if (request.method === "GET") return getAudio(audioKey, request, env, origin, allowedOrigin);
      if (request.method === "DELETE") return deleteAudio(audioKey, env, origin, allowedOrigin);
    }

    if (path === "/api/documents" && request.method === "GET") {
      return listDocuments(env, origin, allowedOrigin);
    }

    if (path === "/api/documents" && request.method === "POST") {
      return saveDocument(request, env, origin, allowedOrigin);
    }

    const documentMatch = path.match(/^\/api\/documents\/([-_a-zA-Z0-9]+)$/);
    if (documentMatch && request.method === "DELETE") {
      return deleteDocument(documentMatch[1], env, origin, allowedOrigin);
    }

    if (path === "/api/resources" && request.method === "GET") return listResources(env, origin, allowedOrigin);
    if (path === "/api/resources" && request.method === "POST") return saveResource(request, env, origin, allowedOrigin);
    if (path === "/api/resource-settings") {
      if (request.method === "GET") return getResourceSettings(env, origin, allowedOrigin);
      if (request.method === "PUT") return saveResourceSettings(request, env, origin, allowedOrigin);
    }
    const resourceMatch = path.match(/^\/api\/resources\/([-_a-zA-Z0-9]+)$/);
    if (resourceMatch) {
      if (request.method === "PATCH") return saveResource(request, env, origin, allowedOrigin, resourceMatch[1]);
      if (request.method === "DELETE") return deleteResource(resourceMatch[1], env, origin, allowedOrigin);
    }

    if (path === "/api/review/preferences") {
      if (request.method === "GET") return getReviewPreferences(env, origin, allowedOrigin);
      if (request.method === "PUT") return saveReviewPreferences(request, env, origin, allowedOrigin);
    }

    if (path === "/api/review/plan") {
      if (request.method === "GET") return getDailyReviewPlan(request, env, origin, allowedOrigin);
      if (request.method === "PUT") return saveDailyReviewPlan(request, env, origin, allowedOrigin);
    }

    if (path === "/api/cards" && request.method === "GET") {
      return listCards(env, origin, allowedOrigin);
    }

    if (path === "/api/cards" && request.method === "POST") {
      return addCard(request, env, origin, allowedOrigin);
    }

    if (path === "/api/cards/sync" && request.method === "POST") {
      return syncCards(request, env, origin, allowedOrigin);
    }

    const cardMatch = path.match(/^\/api\/cards\/([a-zA-Z0-9_-]+)$/);
    if (cardMatch) {
      const cardId = cardMatch[1];
      if (request.method === "DELETE") return deleteCard(cardId, env, origin, allowedOrigin);
      if (request.method === "PATCH") return patchCard(cardId, request, env, origin, allowedOrigin);
    }

    return json({ error: "未知的 API 路径。" }, 404, origin, allowedOrigin);
  },
};
