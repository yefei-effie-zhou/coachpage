import { createFeedback } from './ui-feedback.js';
import { createFloatingMediaObserver } from './media-observer.js';
import { NotebookSync } from './sync-v2.js';
import { createEditorAdapter } from './editor-adapter.js';

const FEATURES = Object.freeze({ conversation: false });
const NOTEBOOK_VIEWS = ['editor', 'history', 'cards', 'daily-review', 'settings'];
if (FEATURES.conversation) NOTEBOOK_VIEWS.push('conversation');
document.documentElement.dataset.conversationEnabled = String(FEATURES.conversation);
if (!FEATURES.conversation) {
  const url = new URL(location.href);
  if (url.searchParams.get('view') === 'conversation') {
    url.searchParams.set('view', 'editor');
    url.searchParams.delete('chat');
    history.replaceState({ view: 'editor' }, '', url);
  }
}

(async () => {
  // ── DOM 引用 ─────────────────────────────────────
  const $ = s => document.querySelector(s);
  const { notify, confirmAction } = createFeedback($);
  const editor = $('#editor'), editorMount = $('#editorMount'), pop = $('#selectionPop'),
        dialog = $('#noteDialog'), reviewView = $('#reviewView'), dailyReviewView = $('#dailyReviewView');

  // ── 常量 ─────────────────────────────────────────
  const defaultIntervals = [1, 2, 4, 7, 15, 30, 60];
  const legacyKey = 'dutch-transcript-notebook-v1';
  const legacyBackupKey = 'dutch-transcript-notebook-backup-v1';
  const migrationKey = 'dutch-transcript-notebook-v2-migration';
  const scopeKey = 'dutch-transcript-notebook-v2-scope';
  // 在任何保存、默认值填充或编辑器变动前保留原始字符串，旧标签页只能写 v1。
  const legacyRaw = localStorage.getItem(legacyKey);
  const legacyBackupRaw = localStorage.getItem(legacyBackupKey);
  const gptKey = 'dutch-transcript-gpt-proxy';
  const apiKey = 'dutch-transcript-api-config';
  const defaultApiBaseUrl = 'https://ducknotebook.yefeizhou0086.workers.dev';
  const defaultGptProxyUrl = defaultApiBaseUrl + '/api/translate';

  // ── 云端 API 配置 ────────────────────────────────
  const storedApiConfig = (() => {
    try { return JSON.parse(localStorage.getItem(apiKey) || sessionStorage.getItem(apiKey) || 'null'); }
    catch { return null; }
  })();
  let apiConfig = {
    baseUrl: typeof storedApiConfig?.baseUrl === 'string' ? storedApiConfig.baseUrl : '',
    email: typeof storedApiConfig?.email === 'string' ? storedApiConfig.email : '',
  };
  // 旧版本会把 Worker 主密钥写进浏览器；升级后立即从持久配置中移除。
  if (storedApiConfig?.secret) {
    const sanitized = apiConfig.baseUrl ? JSON.stringify(apiConfig) : null;
    if (sanitized) localStorage.setItem(apiKey, sanitized);
    else localStorage.removeItem(apiKey);
    sessionStorage.removeItem(apiKey);
  }
  const normalizeScope = value => String(value).trim().replace(/\/+$/, '');
  const productionFrontendOrigin = 'https://coach-page.yefeizhou0086.workers.dev';
  const apiRequestUrl = value => {
    const parsed = new URL(value, location.href);
    if (location.origin === productionFrontendOrigin && parsed.origin === defaultApiBaseUrl) {
      return location.origin + parsed.pathname + parsed.search + parsed.hash;
    }
    return parsed.href;
  };
  const initialScope = normalizeScope(apiConfig.baseUrl || localStorage.getItem(scopeKey) || defaultApiBaseUrl);
  let activeScope = initialScope;
  const key = 'dutch-transcript-notebook-v2:' + encodeURIComponent(initialScope);
  const backupKey = key + ':backup';
  const migration = JSON.parse(localStorage.getItem(migrationKey) || 'null') || {
    scope: initialScope, raw: legacyRaw, backupRaw: legacyBackupRaw
  };
  if (!localStorage.getItem(migrationKey)) localStorage.setItem(migrationKey, JSON.stringify(migration));
  const legacyState = JSON.parse(migration.raw || 'null');
  let engine = null, collectionsEngine = null, collectionsRecoveryEngine = null;
  let syncInitialized = false, syncBusy = false, networkGeneration = 0;
  let projectionRenderTimer = 0, flushTimer = 0, syncPanelBusy = false;
  let lastSyncAttempt = 0, syncFailure = '', flushAfterSync = false;
  const syncRequests = new Set();
  const settingsDirtyRows = new Set();
  let resourceLanguageMapped = false, resourceFormBusy = false, resourceSettingsBusy = false;
  let documentSaveBusy = false, reviewRatingBusy = false;
  let resourceEditOriginal = null, reviewEditOriginal = null;
  document.body.inert = true;
  let range = null, kind = 'card', reviewQueue = [], reviewIndex = 0;

  // ── 状态 ─────────────────────────────────────────
  let state = JSON.parse(localStorage.getItem(key) || 'null') ||
    (migration.scope === initialScope && legacyState ? structuredClone(legacyState) : null) || {
    title: '荷兰语文本',
    html: '',
    items: [],
    videoUrl: ''
  };
  state.videoUrl = state.videoUrl || '';
  state.schemaVersion = 2;
  state.audioUrl = state.audioUrl || '';
  state.displayLanguage = state.displayLanguage === 'en' ? 'en' : 'zh';
  // null 表示默认 100%，不能通过 Number(null) 被刷新转换为最小字号 90%。
  state.siteFontScale = state.siteFontScale != null && state.siteFontScale !== '' && Number.isFinite(Number(state.siteFontScale))
    ? Math.min(1.25, Math.max(.9, Number(state.siteFontScale)))
    : null;
  state.currentLanguage = ['en', 'nl', 'ja'].includes(state.currentLanguage) ? state.currentLanguage : 'nl';
  state.cardLanguage = ['en', 'nl', 'ja'].includes(state.cardLanguage) ? state.cardLanguage : 'nl';
  state.reviewMode = state.reviewMode === 'mixed' ? 'mixed' : 'separate';
  state.reviewExerciseMode = state.reviewExerciseMode === 'cloze' ? 'cloze' : 'card';
  state.reviewBatchSize = [0, 10, 20, 30].includes(Number(state.reviewBatchSize)) ? Number(state.reviewBatchSize) : 20;
  state.dailyReviewPlan = state.dailyReviewPlan && typeof state.dailyReviewPlan === 'object' ? state.dailyReviewPlan : null;
  state.reviewIntervals = Array.isArray(state.reviewIntervals) && state.reviewIntervals.length
    ? state.reviewIntervals.map(Number).filter(Number.isFinite)
    : [...defaultIntervals];
  state.audioSpeed = [0.7, 0.85, 1, 1.15].includes(Number(state.audioSpeed)) ? Number(state.audioSpeed) : 1;
  state.documentId = state.documentId || newDocumentId();
  state.documentDate = state.documentDate || new Date().toISOString().slice(0, 10);
  state.archives = Array.isArray(state.archives) ? state.archives : [];
  state.resources = Array.isArray(state.resources) ? state.resources : [];
  // 资源配置完全由 v2 投影提供；空数组不代表需要恢复默认配置。
  state.resourceLanguages = [];
  state.resourceGroups = [];
  state.resourceTypes = [];
  state.resourceTags = [];
  state.resourceDecks = [];
  state.items = Array.isArray(state.items) ? state.items : [];
  state.editorAnnotations = Array.isArray(state.editorAnnotations) ? state.editorAnnotations : [];
  state.reviewLog = state.reviewLog && typeof state.reviewLog === 'object' ? state.reviewLog : {};
  state.lastNotebookView = NOTEBOOK_VIEWS.includes(state.lastNotebookView) ? state.lastNotebookView : 'editor';
  state.archiveSort = ['updated', 'date', 'title', 'language'].includes(state.archiveSort) ? state.archiveSort : 'updated';
  state.archiveLayout = state.archiveLayout === 'grid' ? 'grid' : 'list';
  let archiveScope = 'all', archiveQuery = '', archiveLanguage = 'all', archiveDetailId = '';
  let archiveVisibleRecords = [], archiveDetailSignature = '', archiveBatchBusy = false, archiveDetailTimer = 0;
  const archiveSelectedIds = new Set(), archiveBusyIds = new Set();
  state.editingArchiveId = state.editingArchiveId || '';
  state.chatLanguage = ['en', 'nl', 'ja'].includes(state.chatLanguage) ? state.chatLanguage : 'en';
  state.chatMode = state.chatMode === 'roleplay' ? 'roleplay' : 'friend';
  state.correctionMode = state.correctionMode === 'strict' ? 'strict' : 'natural';
  state.chatScenario = typeof state.chatScenario === 'string' ? state.chatScenario : '';
  // 隐藏功能不清空用户保存的场景，也不改写旧聊天的关联键。
  state.chats = state.chats && typeof state.chats === 'object' ? state.chats : {};
  state.chatTabs = Array.isArray(state.chatTabs) ? state.chatTabs.filter(tab => tab && tab.id) : [];
  if (FEATURES.conversation && !state.chatTabs.length) {
    const legacyChatKey = `${state.chatLanguage}:${state.chatMode}:${state.chatScenario}`;
    const firstTabId = 'conversation-' + Date.now().toString(36);
    state.chatTabs = [{ id: firstTabId, title: '新对话' }];
    state.chats[firstTabId] = Array.isArray(state.chats[legacyChatKey]) ? state.chats[legacyChatKey] : [];
  }
  state.activeChatTabId = state.chatTabs.some(tab => tab.id === state.activeChatTabId) ? state.activeChatTabId : state.chatTabs[0]?.id || '';
  state.chatDisplay = state.chatDisplay && typeof state.chatDisplay === 'object' ? state.chatDisplay : {};
  state.chatDisplay.font = ['sans', 'serif', 'readable'].includes(state.chatDisplay.font) ? state.chatDisplay.font : 'sans';
  state.chatDisplay.size = Math.min(24, Math.max(17, Number(state.chatDisplay.size) || 18));
  state.chatDisplay.align = ['left', 'center'].includes(state.chatDisplay.align) ? state.chatDisplay.align : 'left';
  state.chatDisplay.width = ['wide', 'standard', 'compact'].includes(state.chatDisplay.width) ? state.chatDisplay.width : 'wide';
  state.chatDisplay.streaming = state.chatDisplay.streaming !== false;
  state.japaneseAnalyzerOpen = state.japaneseAnalyzerOpen !== false;
  state.flashcardsCollapsed = state.flashcardsCollapsed === true;
  state.editorMode = state.editorMode === 'read' ? 'read' : 'edit';
  state.languageAssistantOpen = false;
  let japaneseAnalysis = null;
  let selectedJapaneseTokenIndex = -1;
  let selectedArchiveId = '';
  let lastSaveUndo = null;
  let proxyUrl = localStorage.getItem(gptKey) || sessionStorage.getItem(gptKey) || '';
  const editorAdapter = createEditorAdapter({
    host: editor,
    mount: editorMount,
    placeholder: () => editor.dataset.placeholder || '开始记录…',
  });
  editorAdapter.onUpdate(() => { save(); renderCapturedPhrases(); });

  function editorHTML() { return editorAdapter.getHTML(); }
  function editorText() { return editorAdapter.getText(); }
  function editorIsEditable() { return editorAdapter.isEditable(); }
  function setEditorContent(html = '') { editorAdapter.setContent(html); }
  function setEditorEditable(editable) {
    editorAdapter.setEditable(editable);
    editor.classList.toggle('is-readonly', !editable);
  }

  function applyEditorMode() {
    const reading = state.editorMode === 'read';
    const canEdit = !editor.classList.contains('is-blank');
    setEditorEditable(canEdit && !reading);
    editor.classList.toggle('reading-mode', reading);
    $('#editorTools').hidden = reading;
    const modeToggle = $('#editorModeToggle');
    if (!modeToggle) return;
    modeToggle.classList.toggle('is-editing', !reading);
    modeToggle.classList.toggle('is-reading', reading);
    modeToggle.setAttribute('aria-label', reading
      ? '当前为阅读模式，点击切换到编辑模式'
      : '当前为编辑模式，点击切换到阅读模式');
    modeToggle.title = reading ? '切换到编辑模式' : '切换到阅读模式';
  }

  function applyLanguageAssistantState() {
    const open = state.languageAssistantOpen === true;
    if ($('#languageAssistant')) $('#languageAssistant').hidden = !open;
    $('#editorStage')?.classList.toggle('assistant-open', open);
  }

  function renderCapturedPhrases() {
    const phrases = [...new Set([...editor.querySelectorAll('[data-phrase]')]
      .map(node => node.getAttribute('data-phrase') || node.textContent.trim())
      .filter(Boolean))];
    const target = $('#capturedPhraseList');
    if (!target) return;
    target.innerHTML = phrases.length
      ? phrases.map(phrase => `<button type="button" data-captured-phrase="${esc(phrase)}">${esc(phrase)}</button>`).join('')
      : '<p>还没有提取词伙。</p>';
  }

  // ── 工具函数 ─────────────────────────────────────
  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  let saveCounter = 0;

  function snapshotBackup(reason = 'auto') {
    try {
      if (!syncInitialized) return false;
      const payload = {
        version: 3,
        reason,
        savedAt: new Date().toISOString(),
        state,
        sync: engine.exportBackup(),
        ...(collectionsSyncClient() ? { collectionsSync: collectionsSyncClient().exportBackup() } : {}),
        migration,
      };
      localStorage.setItem(backupKey, JSON.stringify(payload));
      const status = $('#backupStatus');
      if (status) status.textContent = `最近备份：${new Intl.DateTimeFormat(state.displayLanguage === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payload.savedAt))}`;
      return true;
    } catch (error) {
      console.warn('本地备份失败:', error.message);
      return false;
    }
  }
  const interfaceTranslations = {
    '界面语言':'Interface language','调整全站字号':'Adjust site font size','缩小字号':'Decrease font size','放大字号':'Increase font size','全站字号':'Site font size','默认':'Default','未连接云端':'Cloud offline','已连接云端':'Cloud connected','保存到新文本':'Save as new','更新历史文本':'Update history',
    '当前编辑':'Editor','📝 当前编辑':'📝 Editor','历史全文':'Documents','▣ 历史全文':'▣ Documents','词卡列表':'Flashcards','▤ 词卡列表':'▤ Flashcards','今日复习':'Today’s review','↻ 今日复习':'↻ Today’s review','口语陪练':'Speaking practice','◉ 口语陪练':'◉ Speaking practice','设置':'Settings','⚙ 设置':'⚙ Settings',
    '收集说明':'Collection','选中文字，即可连同原句保存为词卡。':'Select text to save it with its sentence.',
    '掌握进度':'Mastery','还没有已掌握的卡片':'No mastered cards yet','＋ 媒体':'+ Media','视频':'Video','音频':'Audio','关闭媒体设置':'Close media settings',
    '正文':'Body','段落样式':'Paragraph style','标题 2':'Heading 2','标题 3':'Heading 3','引用':'Quote','撤销':'Undo','重做':'Redo','粗体':'Bold','斜体':'Italic','下划线':'Underline','高亮':'Highlight','项目符号':'Bulleted list','编号列表':'Numbered list','• 列表':'• Bullets','1. 列表':'1. Numbered','左':'Left','中':'Center','右':'Right','左对齐':'Align left','右对齐':'Align right','增加缩进':'Increase indent','减少缩进':'Decrease indent',
    '更多工具':'More tools','添加链接':'Add link','章节标题':'Section heading','小标题':'Subheading','专业引用':'Professional quote','代码块':'Code block','分隔线':'Divider','2 × 2 表格':'2 × 2 table','上标':'Superscript','下标':'Subscript','清除格式':'Clear formatting',
    '粘贴链接后即可在此播放':'Paste a link to play it here','播放视频':'Play video','从笔记识别':'Find in note','删除':'Delete','在 YouTube 中打开':'Open on YouTube',
    '嵌入音频':'Embed audio','网络链接会随全文保存；本地文件仅供当前页面预览。':'Web links are saved with the document; local files are preview-only.','嵌入链接':'Embed link','上传音频文件':'Upload audio','还没有音频。可使用公开音频直链，或选择本地文件立即播放。':'No audio yet. Use a public audio link or upload a file.','在新窗口打开音频':'Open audio in a new window','NHK 原网页播放':'Play on NHK','音频由 NHK 自己的播放器提供，将在独立小窗口中打开。':'The audio uses NHK’s own player and opens in a separate window.','打开 NHK 播放窗口':'Open NHK player','返回原位':'Return','关闭':'Close',
    '开始一篇文本':'Start a document','记录内容，并将选中的词句保存为词卡。':'Write, then save selected words and sentences as cards.','＋ 新建文本':'+ New document','双击阅读或重命名；编辑不影响词卡。':'Double-click to read or rename. Editing does not affect cards.','排序':'Sort','最近更新':'Recently updated','学习日期':'Study date','名称':'Name','语言':'Language','刷新':'Refresh',
    '调整复习节奏、语音与连接配置。':'Adjust review timing, speech and connection settings.','服务连接':'Service connection','一键使用预设的 Duck Notebook 服务，也可以分别编辑地址。':'Connect to the preset Duck Notebook services or edit each address.','云端':'Cloud','一键连接云端和 GPT':'Connect Cloud and GPT','编辑云端地址':'Edit Cloud URL','编辑 GPT 地址':'Edit GPT URL','复习间隔':'Review intervals','每次记住后会进入下一轮间隔；忘记后回到第一轮。':'Remembering advances to the next interval; forgetting returns to the first.','间隔天数':'Days between reviews','音频速度':'Audio speed','朗读速度':'Speech speed','慢速（0.7×）':'Slow (0.7×)','较慢（0.85×）':'Slower (0.85×)','正常（1.0×）':'Normal (1.0×)','较快（1.15×）':'Faster (1.15×)','保存设置':'Save settings',
    '搜索和管理词卡。':'Search and manage cards.','导出':'Export','＋ 添加词卡':'+ Add flashcard','全部语言':'All languages','朗读原句':'Read sentence','编辑':'Edit','准备本次复习':'Prepare today’s review','退出复习':'Exit review','显示答案':'Show answer','忘记':'Forgot','模糊':'Unsure','掌握':'Mastered',
    '英语':'English','荷兰语':'Dutch','日语':'Japanese','交流方式':'Mode','日常聊天':'Everyday chat','场景角色扮演':'Role-play','场景（可选）':'Scenario (optional)','纠错':'Correction','自然交流':'Natural conversation','严格训练':'Strict training','准备好了，随时开始':'Ready when you are','保存全文':'Save conversation','新对话':'New conversation','对话标签':'Conversation tabs','新建对话':'New conversation','录语音消息':'Record message','结束录音':'Stop recording','发送':'Send',
    '聊天显示':'Chat display','这些选项只影响聊天页面，并会保存在当前设备。':'These options affect only the chat page and are saved on this device.','字体':'Font','现代':'Modern','书本':'Book','易读':'Readable','字号':'Font size','文字对齐':'Text alignment','左对齐':'Left','居中':'Center','对话宽度':'Conversation width','宽':'Wide','标准':'Standard','紧凑':'Compact','流式输出':'Streaming output','回复逐字呈现':'Reveal replies progressively','完成':'Done',
    '添加词卡':'Add flashcard','词语或表达':'Word or expression','完整原句（可选）':'Full sentence (optional)','中文释义（可选）':'Chinese meaning (optional)','英语释义（可选）':'English meaning (optional)','备注（可选）':'Notes (optional)','取消':'Cancel','添加到今日复习':'Add to today’s review','编辑词卡':'Edit flashcard','保存修改':'Save changes','练习方式':'Practice type','句子填空':'Sentence completion','每组数量':'Cards per group','不限':'No limit',
    '返回列表':'Back to list','编辑内容':'Edit content','删除此全文':'Delete document','更自然：':'More natural:','纠正版本：':'Corrected version:',
    '解析':'Analyze','查看分词、读音、词性与释义。':'View words, readings, parts of speech and meanings.','收起':'Collapse','展开':'Expand','选取正文':'Use selection','显示假名':'Show furigana','显示罗马字':'Show romaji','加入词卡':'Add flashcard','朗读词语':'Read word','输入日语，或选取正文…':'Enter Japanese or use a text selection…',
    '把想看的内容变成清晰、可以完成的待看列表。':'Turn things you want to explore into a clear, finishable list.','＋ 添加资源':'+ Add resource','搜索名称、主题或语言…':'Search name, topic or language…','全部主题':'All topics','主题筛选':'Topic filter','类型筛选':'Type filter','全部类型':'All types','电影 / 剧集':'Films / series','书籍':'Books','课程':'Courses','网站':'Websites','综艺':'Variety shows','待处理':'Up next','完成后自动归档':'Completed items are archived automatically','添加资源':'Add resource','编辑资源':'Edit resource','保存资源':'Save resource','链接（可选）':'Link (optional)','类型':'Type','主题':'Topic','收藏理由':'Why I saved this','为什么想看？留下一句以后仍然有用的话…':'Why do you want to explore this? Leave one useful note for later…','待看':'Backlog','进行中':'In progress','已完成':'Completed','开始':'Start','稍后再看':'Backlog','恢复到待看':'Restore to backlog','待看清单':'Saved for later','收下想看的内容，在合适的时候开始。':'Save what interests you and start when the time is right.','新资源':'New resource','填入必要信息即可，之后随时可以编辑。':'Add only the essentials. You can edit them later.','不限语言':'Any language','清空':'Clear','关闭字号设置':'Close font size settings',
    '词卡':'Flashcards','收起词卡侧栏':'Collapse flashcards','展开词卡侧栏':'Expand flashcards','按间隔安排下次复习。':'Your next review follows the interval schedule.','粘贴 YouTube 链接即可播放。':'Paste a YouTube link to play.','音频':'Audio','链接随文本保存；本地文件仅供预览。':'Links are saved; local files are preview-only.','粘贴音频链接或上传文件。':'Paste an audio link or upload a file.','还没有词卡':'No flashcards yet','从正文中选取内容即可添加':'Select text in the document to add one.','完成。点击词语查看详情。':'Done. Select a word for details.','数据备份':'Data backup','自动保留最近一份本地备份。':'The latest local backup is kept automatically.','导出备份':'Export backup','恢复备份':'Restore backup','确认操作':'Confirm action','确认':'Confirm','明天再看':'Review tomorrow','显示':'Display','资源设置':'Resource settings','立即同步':'Sync now','资源分组':'Resource groups','语言标签':'Language labels','资源类型':'Resource types','取消选择':'Clear selection','删除所选':'Delete selected','每种类型归入一个资源分组。':'Assign each type to a resource group.','语言和类型只用于资源库，不影响 Notebook。':'Language and type settings apply only to Resources.','编辑工作、学习和课余，也可以添加自己的分组。':'Rename the default groups or add your own.','添加、重命名或移除资源使用的语言。':'Add, rename or remove resource languages.','选择资源图标':'Choose resource icon','选择图标':'Choose icon','关闭图标选择器':'Close icon picker','自定义 emoji':'Custom emoji','粘贴任意 emoji…':'Paste any emoji…','常用 emoji':'Common emoji','恢复默认图标':'Restore default icon','更改图标':'Change icon','搜索 emoji':'Search emoji','搜索 emoji…':'Search emoji…','Emoji 列表':'Emoji list','Emoji 分类':'Emoji categories','最近使用':'Recently used','表情与人物':'Smileys & people','动物与自然':'Animals & nature','食物与饮品':'Food & drink','活动':'Activities','旅行与地点':'Travel & places','物品':'Objects','符号':'Symbols','旗帜':'Flags','搜索结果':'Search results','没有匹配的 emoji':'No matching emoji','粘贴 emoji…':'Paste emoji…','粘贴任意 emoji':'Paste any emoji','使用默认图标':'Use default icon','图标':'Icon','选择一个 emoji':'Choose an emoji','关闭资源详情':'Close resource details','打开链接':'Open link','资源分组':'Resource group','未设置':'Not set','没有说明':'No description',
    '收藏工作台':'Collections','快速保存，再用类型、标签与收藏册慢慢整理。':'Save quickly, then organize with types, tags, and decks.','管理收藏册':'Manage decks','全部项目':'All items','更多信息':'More details','旧主题（可选）':'Legacy topic (optional)','保留旧分类信息…':'Preserve legacy category details…','标签':'Tags','收藏册':'Decks','搜索或选择标签…':'Search or select tags…','搜索收藏册…':'Search decks…','旧主题筛选':'Legacy topic filter','全部旧主题':'All legacy topics','标签筛选':'Tag filter','收藏册筛选':'Deck filter','最近添加':'Recently added','完成日期':'Completion date','清空筛选':'Clear filters','全选当前筛选结果':'Select all filtered results','选择批量操作':'Choose a bulk action','批量操作':'Bulk action','批量操作值':'Bulk value','修改状态':'Change status','修改类型':'Change type','添加标签':'Add tags','移除标签':'Remove tags','加入收藏册':'Add to decks','移出收藏册':'Remove from decks','应用':'Apply','详情':'Details','共 0 条资源':'0 resources','没有符合当前筛选的资源。':'No resources match the current filters.','还没有资源。先保存一条，之后再慢慢整理。':'No resources yet. Save one now and organize it later.',
    '语言和类型独立管理；旧分组仅保留为迁移资料。':'Languages and types are managed independently; legacy groups are retained only for migration.','Type 表示内容形式，不再依赖资源分组。':'A type describes content format and no longer depends on a group.','标签可跨类型描述主题、兴趣、用途与来源。':'Tags describe topics, interests, purposes, and sources across types.','新类型':'New type','新标签':'New tag','搜索标签…':'Search tags…','按名称':'By name','使用最多':'Most used','使用最少':'Least used','合并':'Merge','使用中':'in use','未使用':'unused','主动整理一组资源；删除收藏册不会删除资源。':'Curate a set of resources; deleting a deck never deletes its resources.','收藏册名称':'Deck name','类型名称':'Type name','标签名称':'Tag name','语言名称':'Language name','说明（可选）':'Description (optional)','创建':'Create','关闭收藏册管理':'Close deck manager','删除收藏册':'Delete deck','删除标签':'Delete tag','删除类型':'Delete type','暂无资源':'No resources','暂无结果':'No results','暂无待处理':'No pending items','暂无已完成':'No completed items','暂无收藏册':'No decks'
  };
  const reverseInterfaceTranslations = Object.fromEntries(Object.entries(interfaceTranslations).map(([zh, en]) => [en, zh]));
  let translatingInterface = false;
  function translateInterfaceValue(value) {
    const leading = value.match(/^\s*/)?.[0] || '', trailing = value.match(/\s*$/)?.[0] || '';
    const core = value.trim();
    if (!core) return value;
    const translated = state.displayLanguage === 'en' ? interfaceTranslations[core] : reverseInterfaceTranslations[core];
    if (translated) return leading + translated + trailing;
    if (state.displayLanguage === 'en') {
      let match = core.match(/^共 (\d+) 张词卡。点击词卡查看原句、释义和复习状态。$/);
      if (match) return `${leading}${match[1]} flashcards. Click a card to view its sentence, meaning and review status.${trailing}`;
      match = core.match(/^开始复习 · (\d+)$/); if (match) return `${leading}Start review · ${match[1]}${trailing}`;
      match = core.match(/^更改 (.+) 的图标$/); if (match) return `${leading}Change icon for ${match[1]}${trailing}`;
    }
    return value;
  }
  function shouldSkipInterfaceNode(node) {
    return node.parentElement?.closest('[data-archive-user-content],[data-resource-user-content],#editor,.chat-bubble,.archive-transcript,.review-list-front,.study-card-term,.title-input,#displayLanguage,.product-switch,#resourceDetailName,.resource-detail-description,.resource-detail-meta dd');
  }
  function applyInterfaceLanguage(root = document.body) {
    if (translatingInterface) return;
    translatingInterface = true;
    const translateElement = element => {
      if (!(element instanceof Element) || shouldSkipInterfaceNode({ parentElement: element })) return;
      ['placeholder','title','aria-label'].forEach(attribute => {
        if (element.hasAttribute(attribute)) {
          const current = element.getAttribute(attribute), translated = translateInterfaceValue(current);
          if (translated !== current) element.setAttribute(attribute, translated);
        }
      });
    };
    if (root.nodeType === Node.TEXT_NODE) {
      if (!shouldSkipInterfaceNode(root)) { const translated = translateInterfaceValue(root.nodeValue); if (translated !== root.nodeValue) root.nodeValue = translated; }
    } else {
      translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node; while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE && !shouldSkipInterfaceNode(node)) { const translated = translateInterfaceValue(node.nodeValue); if (translated !== node.nodeValue) node.nodeValue = translated; }
        else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
      }
    }
    $('#displayLanguage').value = state.displayLanguage;
    document.documentElement.lang = state.displayLanguage === 'en' ? 'en' : 'zh-CN';
    translatingInterface = false;
  }
  function effectiveSiteFontScale() {
    return state.siteFontScale == null ? 1 : state.siteFontScale;
  }
  function applySiteFontScale() {
    const scale = effectiveSiteFontScale(), percent = Math.round(scale * 100);
    document.body.style.zoom = String(scale);
    $('#siteFontScale').value = percent;
    $('#siteFontScaleValue').textContent = `${percent}%${state.siteFontScale == null ? (state.displayLanguage === 'en' ? ' · Default' : ' · 默认') : ''}`;
  }
  function setSiteFontScale(percent) {
    state.siteFontScale = Math.min(1.25, Math.max(.9, Number(percent) / 100));
    save();
    applySiteFontScale();
  }
  $('#siteFontScale').oninput = event => setSiteFontScale(event.target.value);
  $('#decreaseSiteFont').onclick = () => setSiteFontScale(Math.round(effectiveSiteFontScale() * 100) - 5);
  $('#increaseSiteFont').onclick = () => setSiteFontScale(Math.round(effectiveSiteFontScale() * 100) + 5);
  $('#resetSiteFont').onclick = () => { state.siteFontScale = null; save(); applySiteFontScale(); };
  const siteFontControl = $('#siteFontControl');
  function closeSiteFontControl({ restoreFocus = false } = {}) {
    if (!siteFontControl.open) return;
    siteFontControl.open = false;
    if (restoreFocus) siteFontControl.querySelector('summary').focus();
  }
  $('#closeSiteFont').onclick = () => closeSiteFontControl({ restoreFocus: true });
  document.addEventListener('pointerdown', event => {
    if (siteFontControl.open && !siteFontControl.contains(event.target)) closeSiteFontControl();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSiteFontControl({ restoreFocus: true });
  });
  $('#displayLanguage').onchange = event => { state.displayLanguage = event.target.value; save(); applyInterfaceLanguage(); applySiteFontScale(); applyFlashcardPanelState(); };
  new MutationObserver(mutations => {
    if (translatingInterface) return;
    mutations.forEach(mutation => mutation.type === 'characterData' ? applyInterfaceLanguage(mutation.target) : mutation.addedNodes.forEach(node => applyInterfaceLanguage(node)));
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  const reviewDateOf = i => i.next_review || i.nextReview || '';
  // 复习按“自然日”而不是具体时分判断，避免“下次 9/3”却被误判为今日完成。
  const localDayKey = value => {
    const day = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(day.getTime())) return '';
    return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
  };
  const due = item => !reviewDateOf(item) || localDayKey(reviewDateOf(item)) <= localDayKey(new Date());
  const overdueDays = item => {
    if (!reviewDateOf(item)) return 0;
    const scheduled = new Date(localDayKey(reviewDateOf(item)) + 'T00:00:00');
    const today = new Date(localDayKey(new Date()) + 'T00:00:00');
    return Math.max(0, Math.floor((today - scheduled) / 86400000));
  };
  const reviewLogFor = item => Array.isArray(state.reviewLog[String(item.id)]) ? state.reviewLog[String(item.id)] : [];
  const lastReviewedAt = item => reviewLogFor(item).at(-1)?.at || '';
  const scheduleReviewDate = days => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + Math.max(1, Number(days) || 1));
    return next.toISOString();
  };
  const date = value => new Intl.DateTimeFormat(state.displayLanguage === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToSection = element => element?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const languageName = language => language === 'ja' ? '日语' : language === 'en' ? '英语' : '荷兰语';
  const languageCode = language => language === 'ja' ? 'ja-JP' : language === 'en' ? 'en-US' : 'nl-NL';
  const setInterfaceLanguageTheme = language => {
    document.body.dataset.uiLanguage = ['en', 'nl', 'ja'].includes(language) ? language : 'en';
  };
  const cardsForLanguage = language => state.items.filter(item => (item.language || 'nl') === language);
  const activeCards = () => cardsForLanguage(state.cardLanguage);

  function parseIntervals(value) {
    const numbers = String(value).split(/[,，\s]+/).filter(Boolean).map(Number);
    if (!numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1) || numbers.some((n, i) => i && n <= numbers[i - 1])) return null;
    return numbers;
  }

  function intervalSummary(intervals = state.reviewIntervals) {
    return intervals.map((days, index) => `第 ${index + 1} 次记住：${days} 天后`).join(' · ');
  }

  function youtubeIdFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl.trim());
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        id = url.searchParams.get('v') || '';
        if (!id) {
          const parts = url.pathname.split('/').filter(Boolean);
          if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] || '';
        }
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    } catch {
      return '';
    }
  }

  function renderVideo() {
    const rawUrl = state.videoUrl || '';
    const id = youtubeIdFromUrl(rawUrl);
    $('#youtubeUrl').value = rawUrl;
    $('#videoPlayer').hidden = !id;
    $('#videoEmpty').hidden = !!id;
    if (id) {
      $('#youtubeFrame').src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0';
      $('#openYoutube').href = rawUrl;
    } else {
      $('#youtubeFrame').removeAttribute('src');
      if (typeof setVideoFloating === 'function') setVideoFloating(false);
    }
    if (typeof queueFloatingVideoUpdate === 'function') queueFloatingVideoUpdate();
  }

  function setVideoUrl(rawUrl) {
    const url = rawUrl.trim();
    if (!youtubeIdFromUrl(url)) {
      notify('请输入有效的 YouTube、youtu.be 或 YouTube Shorts 链接。');
      return false;
    }
    state.videoUrl = url;
    save();
    renderVideo();
    return true;
  }

  let localAudioObjectUrl = '';
  let audioHls = null;
  let hlsLibraryPromise = null;
  function validAudioUrl(rawUrl) {
    try { return ['http:', 'https:'].includes(new URL(rawUrl.trim()).protocol); } catch { return false; }
  }
  function clearLocalAudioUrl() {
    if (localAudioObjectUrl) URL.revokeObjectURL(localAudioObjectUrl);
    localAudioObjectUrl = '';
  }
  const isHlsAudioUrl = source => /\.m3u8(?:[?#]|$)/i.test(String(source || ''));
  function isNhkMediaUrl(source) {
    try {
      const url = new URL(source);
      return url.protocol === 'https:' && url.hostname === 'media.vd.st.nhk' && url.pathname.startsWith('/news/easy_audio/');
    } catch { return false; }
  }
  function isNhkEasyArticleUrl(source) {
    try {
      const url = new URL(source);
      return url.hostname === 'news.web.nhk' && /^\/news\/easy\/[^/]+\/[^/]+\.html$/.test(url.pathname);
    } catch { return false; }
  }
  function destroyAudioHls() {
    if (audioHls) { audioHls.destroy(); audioHls = null; }
  }
  function loadHlsLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLibraryPromise) return hlsLibraryPromise;
    hlsLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('HLS 播放器加载失败。'));
      script.onerror = () => reject(new Error('无法加载 HLS 播放器，请检查网络连接。'));
      document.head.appendChild(script);
    });
    return hlsLibraryPromise;
  }
  async function attachAudioSource(source, autoplay = false) {
    const player = $('#audioPlayer');
    if (player.dataset.activeSource === source && (player.src || audioHls)) {
      if (autoplay) await player.play().catch(() => {});
      return;
    }
    destroyAudioHls();
    player.pause();
    player.removeAttribute('src');
    player.dataset.activeSource = source || '';
    if (!source) { player.load(); return; }
    const playbackSource = apiRequestUrl(isNhkMediaUrl(source) && isApiOnline()
      ? `${apiConfig.baseUrl}/api/nhk-hls?url=${encodeURIComponent(source)}`
      : source);
    if (!isHlsAudioUrl(source)) {
      player.src = playbackSource;
      if (autoplay) await player.play().catch(() => {});
      return;
    }
    if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = playbackSource;
      if (autoplay) await player.play().catch(() => {});
      return;
    }
    try {
      const HlsPlayer = await loadHlsLibrary();
      if (!HlsPlayer.isSupported()) throw new Error('当前浏览器不支持 HLS 音频。');
      if (player.dataset.activeSource !== source) return;
      audioHls = new HlsPlayer({ enableWorker: true, lowLatencyMode: false });
      audioHls.loadSource(playbackSource);
      audioHls.attachMedia(player);
      audioHls.on(HlsPlayer.Events.MANIFEST_PARSED, () => { if (autoplay) player.play().catch(() => {}); });
      audioHls.on(HlsPlayer.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        destroyAudioHls();
        notify('HLS 音频无法播放。请确认已部署最新 worker.js；如果已经部署，NHK 临时链接可能已过期，请重新复制。');
      });
    } catch (error) {
      notify(error.message || 'HLS 音频播放器加载失败。');
    }
  }
  function renderAudio(source = '', autoplay = false) {
    const remoteUrl = state.audioUrl || '';
    const articleUrl = isNhkEasyArticleUrl(remoteUrl) ? remoteUrl : '';
    const activeSource = articleUrl ? '' : (source || localAudioObjectUrl || remoteUrl);
    $('#audioUrl').value = remoteUrl;
    $('#audioPlayer').hidden = !activeSource;
    $('#audioTransport').hidden = !activeSource;
    $('#audioEmpty').hidden = !!activeSource || !!articleUrl;
    $('#nhkPagePlayer').hidden = !articleUrl;
    $('#openAudio').hidden = !remoteUrl || !!articleUrl;
    $('#openAudio').href = remoteUrl ? apiRequestUrl(remoteUrl) : '#';
    attachAudioSource(activeSource, autoplay);
    if (typeof queueFloatingAudioUpdate === 'function') queueFloatingAudioUpdate();
  }
  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  function removeAudio() {
    destroyAudioHls();
    clearLocalAudioUrl();
    state.audioUrl = '';
    $('#audioFile').value = '';
    save(); renderAudio();
  }

  let nhkPlayerWindow = null;
  function openNhkPlayerWindow(url = state.audioUrl) {
    if (!isNhkEasyArticleUrl(url)) { notify('请先粘贴有效的 NHK Easy 文章链接。'); return; }
    nhkPlayerWindow = window.open(url, 'notebookNhkPlayer', 'popup=yes,width=680,height=820,resizable=yes,scrollbars=yes');
    if (!nhkPlayerWindow) { notify('浏览器阻止了播放窗口，请允许此网站打开弹窗。'); return; }
    nhkPlayerWindow.focus();
  }
  $('#openNhkPagePlayer').onclick = () => openNhkPlayerWindow();

  $('#playAudioUrl').onclick = () => {
    const url = $('#audioUrl').value.trim();
    if (!validAudioUrl(url)) { notify('请输入以 http:// 或 https:// 开头的有效音频链接。'); return; }
    if (isNhkEasyArticleUrl(url)) {
      destroyAudioHls(); clearLocalAudioUrl(); state.audioUrl = url; save(); renderAudio(); openNhkPlayerWindow(url);
      return;
    }
    if (isNhkMediaUrl(url) && !isApiOnline()) {
      notify('NHK 音频需要通过 Worker 播放。请先在“设置”中连接云端，然后重新嵌入链接。');
      return;
    }
    clearLocalAudioUrl(); state.audioUrl = url; save(); renderAudio('', true);
  };
  $('#audioFile').onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { notify('请选择音频文件。'); event.target.value = ''; return; }
    if (file.size > 50 * 1024 * 1024) { notify('单个音频文件请控制在 50 MB 以内。'); event.target.value = ''; return; }
    clearLocalAudioUrl(); localAudioObjectUrl = URL.createObjectURL(file); renderAudio();
    if (!isApiOnline()) { notify('当前未连接云端，音频只会临时预览。连接 Worker 后可上传保存。'); return; }
    const label = event.target.closest('.audio-file-label');
    label.classList.add('uploading'); label.firstChild.textContent = '正在上传…';
    try {
      const headers = apiHeaders();
      headers['Content-Type'] = file.type || 'application/octet-stream';
      headers['X-Audio-Filename'] = encodeURIComponent(file.name);
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/audio'), { method: 'POST', headers, body: file, credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '音频上传失败。');
      clearLocalAudioUrl(); state.audioUrl = payload.url; save(); renderAudio();
    } catch (error) {
      notify(`${error.message}\n当前仍可临时播放，但不会保存到云端。`);
    } finally {
      label.classList.remove('uploading'); label.firstChild.textContent = '上传音频文件';
    }
  };
  $('#removeAudio').onclick = removeAudio;

  $('#audioBack').onclick = () => { $('#audioPlayer').currentTime = Math.max(0, $('#audioPlayer').currentTime - 5); };
  $('#audioForward').onclick = () => { $('#audioPlayer').currentTime = Math.min($('#audioPlayer').duration || Infinity, $('#audioPlayer').currentTime + 5); };

  function showMediaPane(type) {
    if (type !== 'audio' && typeof setAudioFloating === 'function') setAudioFloating(false);
    $('#mediaSwitcher').hidden = false;
    $('#videoPanel').hidden = type !== 'video';
    $('#audioPanel').hidden = type !== 'audio';
    $('#showVideoMedia').classList.toggle('active', type === 'video');
    $('#showAudioMedia').classList.toggle('active', type === 'audio');
    if (type === 'video') $('#youtubeUrl').focus(); else $('#audioUrl').focus();
  }
  $('#openMediaBtn').onclick = () => {
    if (!editorIsEditable()) { notify('请先点击“新建文本”。'); return; }
    if (!$('#mediaSwitcher').hidden) { $('#mediaSwitcher').hidden = true; $('#videoPanel').hidden = true; $('#audioPanel').hidden = true; return; }
    showMediaPane(state.audioUrl || localAudioObjectUrl ? 'audio' : 'video');
  };
  $('#showVideoMedia').onclick = () => showMediaPane('video');
  $('#showAudioMedia').onclick = () => showMediaPane('audio');
  $('#closeMediaPanel').onclick = () => { $('#mediaSwitcher').hidden = true; $('#videoPanel').hidden = true; $('#audioPanel').hidden = true; if (typeof setAudioFloating === 'function') setAudioFloating(false); };

  // A single observer coordinates every floating media surface without global scroll listeners.
  const floatingMedia = createFloatingMediaObserver();
  function observeFloatingMedia(anchor, handler) {
    floatingMedia.observe(anchor, handler);
  }
  function unobserveFloatingMedia(anchor) {
    floatingMedia.unobserve(anchor);
  }

  // ── 向下阅读时保持音频控制可用 ────────────────────
  const audioPanel = $('#audioPanel');
  const audioSentinel = document.createElement('span');
  audioSentinel.className = 'media-float-sentinel';
  audioPanel.before(audioSentinel);
  const audioPlaceholder = document.createElement('div');
  audioPlaceholder.className = 'audio-placeholder';
  audioPanel.after(audioPlaceholder);
  let floatingAudioSuppressed = false;
  let floatingAudioFrame = 0;

  function audioCanFloat() {
    return !audioPanel.hidden && !$('#audioPlayer').hidden && !!($('#audioPlayer').src || state.audioUrl || localAudioObjectUrl);
  }
  function setAudioFloating(floating) {
    if (!floating) {
      audioPanel.classList.remove('is-floating');
      audioPlaceholder.classList.remove('active');
      audioPlaceholder.style.height = '';
      return;
    }
    if (!audioCanFloat() || audioPanel.classList.contains('is-floating')) return;
    audioPlaceholder.style.height = `${audioPanel.offsetHeight}px`;
    audioPlaceholder.classList.add('active');
    audioPanel.classList.add('is-floating');
  }
  function updateFloatingAudio() {
    floatingAudioFrame = 0;
    if (!audioCanFloat()) { setAudioFloating(false); return; }
    const reference = audioPanel.classList.contains('is-floating') ? audioPlaceholder : audioPanel;
    const rect = reference.getBoundingClientRect();
    if (floatingAudioSuppressed) {
      if (rect.bottom >= 0) floatingAudioSuppressed = false;
      else return;
    }
    setAudioFloating(rect.bottom < 0);
  }
  function queueFloatingAudioUpdate() {
    if (!floatingAudioFrame) floatingAudioFrame = requestAnimationFrame(updateFloatingAudio);
  }
  $('#restoreAudio').onclick = () => { floatingAudioSuppressed = false; setAudioFloating(false); scrollToSection(audioPanel); };
  $('#closeFloatingAudio').onclick = () => { floatingAudioSuppressed = true; setAudioFloating(false); };
  window.addEventListener('resize', queueFloatingAudioUpdate);
  observeFloatingMedia(audioSentinel, entry => {
    if (!audioCanFloat()) return setAudioFloating(false);
    if (entry.isIntersecting) { floatingAudioSuppressed = false; setAudioFloating(false); }
    else if (entry.boundingClientRect.bottom < 0 && !floatingAudioSuppressed) setAudioFloating(true);
  });

  // ── 站内悬浮视频播放器 ─────────────────────────────
  const videoPanel = $('#videoPanel');
  const videoSentinel = document.createElement('span');
  videoSentinel.className = 'media-float-sentinel';
  videoPanel.before(videoSentinel);
  const videoPlaceholder = document.createElement('div');
  videoPlaceholder.className = 'video-placeholder';
  videoPanel.after(videoPlaceholder);
  let floatingVideoSuppressed = false;
  let floatingVideoFrame = 0;

  function videoCanFloat() {
    return !$('#videoPlayer').hidden && !!youtubeIdFromUrl(state.videoUrl || '');
  }

  function setVideoFloating(floating) {
    if (!floating) {
      videoPanel.classList.remove('is-floating');
      videoPlaceholder.classList.remove('active');
      videoPlaceholder.style.height = '';
      return;
    }
    if (!videoCanFloat() || videoPanel.classList.contains('is-floating')) return;
    videoPlaceholder.style.height = videoPanel.offsetHeight + 'px';
    videoPlaceholder.classList.add('active');
    videoPanel.classList.add('is-floating');
  }

  function updateFloatingVideo() {
    floatingVideoFrame = 0;
    if (!videoCanFloat()) {
      setVideoFloating(false);
      return;
    }
    const reference = videoPanel.classList.contains('is-floating') ? videoPlaceholder : videoPanel;
    const rect = reference.getBoundingClientRect();
    if (floatingVideoSuppressed) {
      if (rect.bottom >= 0) floatingVideoSuppressed = false;
      else return;
    }
    if (rect.bottom < 0) setVideoFloating(true);
    else setVideoFloating(false);
  }

  function queueFloatingVideoUpdate() {
    if (!floatingVideoFrame) floatingVideoFrame = requestAnimationFrame(updateFloatingVideo);
  }

  $('#restoreVideo').onclick = () => {
    floatingVideoSuppressed = false;
    setVideoFloating(false);
    scrollToSection(videoPanel);
  };
  $('#closeFloatingVideo').onclick = () => {
    floatingVideoSuppressed = true;
    setVideoFloating(false);
  };
  window.addEventListener('resize', queueFloatingVideoUpdate);
  observeFloatingMedia(videoSentinel, entry => {
    if (!videoCanFloat()) return setVideoFloating(false);
    if (entry.isIntersecting) { floatingVideoSuppressed = false; setVideoFloating(false); }
    else if (entry.boundingClientRect.bottom < 0 && !floatingVideoSuppressed) setVideoFloating(true);
  });

  function firstYoutubeUrl(text) {
    return (text.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s<]+/i) || [])[0] || '';
  }

  // ── 荷兰语句子朗读（通过 Worker 调用官方 Google Cloud TTS）──
  let speakingButton = null;
  let googleAudio = null;
  let activeAudioUrl = null;
  // 记录每种语言上一次返回的声线，供 Worker 避免连续选择同一声线。
  const lastTtsVoice = {};
  function clearSpeakingState() {
    if (speakingButton) speakingButton.classList.remove('playing');
    speakingButton = null;
  }

  async function speakSentence(sentence, button, language = 'nl') {
    if (!sentence) return;
    if (!isApiOnline()) {
      notify('请先在“云端设置”中连接语音后端。');
      return;
    }
    if (googleAudio) {
      googleAudio.pause();
      googleAudio = null;
    }
    if (activeAudioUrl) {
      URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = null;
    }
    clearSpeakingState();
    speakingButton = button || null;
    if (speakingButton) speakingButton.classList.add('playing');

    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/tts'), {
        method: 'POST',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({ text: sentence, speed: state.audioSpeed, language, previous_voice: lastTtsVoice[language] || '' }),
      });
      if (!response.ok) {
        let message = 'Google Cloud 发音暂时无法播放。';
        try { message = (await response.json()).error || message; } catch {}
        throw new Error(message);
      }
      const selectedVoice = response.headers.get('X-TTS-Voice');
      if (selectedVoice) lastTtsVoice[language] = selectedVoice;
      const audioBlob = await response.blob();
      activeAudioUrl = URL.createObjectURL(audioBlob);
      googleAudio = new Audio(activeAudioUrl);
      googleAudio.onended = () => {
        if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
        googleAudio = null;
        clearSpeakingState();
      };
      googleAudio.onerror = () => {
        if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
        googleAudio = null;
        clearSpeakingState();
        notify('Google Cloud 发音音频无法播放，请稍后重试。');
      };
      await googleAudio.play();
    } catch (error) {
      clearSpeakingState();
      notify(error.message || 'Google Cloud 发音暂时无法播放，请稍后重试。');
    }
  }

  // ══════════════════════════════════════════════════
  // 云端 API 层
  // ══════════════════════════════════════════════════

  function isApiOnline() {
    return !!(apiConfig.baseUrl && apiConfig.baseUrl.startsWith('http'));
  }

  function apiHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function resourceEngine() {
    return collectionsEngine || engine;
  }

  function collectionsSyncClient() {
    return collectionsEngine || collectionsRecoveryEngine;
  }

  function combinedSyncStatus() {
    const statuses = [engine, collectionsEngine, collectionsRecoveryEngine].filter(Boolean).map(instance => instance.status());
    if (!statuses.length) return null;
    return {
      pending: statuses.reduce((sum, status) => sum + (status.pending || 0), 0),
      conflicts: statuses.reduce((sum, status) => sum + (status.conflicts || 0), 0),
      candidates: statuses.reduce((sum, status) => sum + (status.candidates || 0), 0),
      ready: statuses.every(status => status.ready),
      error: statuses.map(status => status.error).filter(Boolean).join(' · '),
      epochChanged: statuses.some(status => status.epochChanged),
    };
  }

  function syncSummary(status = combinedSyncStatus()) {
    if (!status) return '正在读取本机内容';
    const parts = ['本机已保存'];
    const confirmations = (status.conflicts || 0) + (status.candidates || 0);
    if (status.error || syncFailure) parts.push('同步未完成，内容已保留');
    else if (status.epochChanged) parts.push('同步已暂停');
    else if (syncBusy) parts.push('正在同步');
    else if (status.pending) parts.push('等待同步');
    else if (!isApiOnline()) parts.push('未连接云端');
    else if (!status.ready) parts.push('等待同步');
    else if (!confirmations) parts.push('已同步');
    if (confirmations) parts.push(`有${confirmations}项需要确认`);
    return parts.join(' · ');
  }

  function updateSyncIndicator() {
    const status = combinedSyncStatus();
    const style = status?.error || syncFailure || status?.epochChanged ? 'error' : syncBusy ? 'syncing'
      : status?.pending || status?.conflicts || status?.candidates ? 'pending' : status?.ready && isApiOnline() ? 'online' : 'offline';
    const el = $('#syncStatus');
    el.className = 'sync-indicator ' + style;
    el.setAttribute('aria-busy', String(syncBusy));
    el.innerHTML = `<span class="sync-dot ${style}"></span> ${esc(syncSummary(status))}`;
    el.title = '查看同步状态和需要确认的内容';
    $('#syncPanelStatus').textContent = syncSummary(status);
    $('#syncEpochWarning').hidden = !status?.epochChanged;
  }

  async function syncTransport(scope, path, operation) {
    if (!isApiOnline() || normalizeScope(apiConfig.baseUrl) !== scope || activeScope !== scope) {
      throw Object.assign(new Error('网络同步已停用，队列保留在本机。'), { status: 0, payload: null });
    }
    const controller = new AbortController(), generation = networkGeneration;
    syncRequests.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(apiRequestUrl(scope + path), {
        method: operation === undefined ? 'GET' : 'POST', headers: apiHeaders(), credentials: 'include',
        redirect: 'manual', cache: 'no-store', signal: controller.signal,
        ...(operation === undefined ? {} : { body: JSON.stringify(operation) })
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) ||
          !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
        throw Object.assign(new Error('同步接口返回登录页、重定向或非 JSON；请重新连接，队列已保留。'), { status: response.status, payload: null });
      }
      let payload;
      try { payload = await response.json(); }
      catch { throw Object.assign(new Error('同步响应不是有效 JSON，队列已保留。'), { status: response.status, payload: null }); }
      if (generation !== networkGeneration || activeScope !== scope) throw Object.assign(new Error('连接已切换，队列保留。'), { status: 0, payload });
      if (!response.ok) throw Object.assign(new Error(payload?.error || `同步失败（HTTP ${response.status}）`), { status: response.status, payload });
      return payload;
    } catch (error) {
      if (error.status === undefined) Object.assign(error, { status: 0, payload: null });
      throw error;
    } finally { clearTimeout(timer); syncRequests.delete(controller); }
  }

  function stopSyncNetwork() {
    networkGeneration++;
    clearTimeout(flushTimer);
    for (const controller of syncRequests) controller.abort();
  }

  function applySyncProjection() {
    if (!syncInitialized || !engine || activeScope !== initialScope) return;
    state.items = engine.view('card');
    state.archives = sortArchives(engine.view('document').map(normalizeArchive));
    const resources = resourceEngine();
    state.resources = resources.view('resource');
    const settings = resources.view('settings').find(item => item.id === 'resources');
    state.resourceLanguages = settings?.languages || [];
    state.resourceGroups = settings?.groups || [];
    state.resourceTypes = settings?.types || [];
    state.resourceTags = settings?.tags || [];
    state.resourceDecks = settings?.decks || [];
    updateSyncIndicator();
    clearTimeout(projectionRenderTimer);
    projectionRenderTimer = setTimeout(() => {
      if (!syncInitialized || activeScope !== initialScope) return;
      render();
      if (!$('#archiveDates').querySelector('.archive-rename-input')) renderArchives();
      renderResources();
      renderResourceSettings();
      if (!reviewView.hidden) renderReviewList();
      renderSyncPanel();
    }, 0);
  }

  function editableSyncRecord(entity, id, data) {
    const instance = ['resource', 'settings'].includes(entity) ? resourceEngine() : engine;
    const row = instance?.view(entity).find(item => String(item.id) === String(id));
    if (data?._syncCandidate || row?._syncCandidate) {
      notify('这份内容需要先确认，请到“设置 → 同步”选择要保留的版本。当前输入已保留。', 'error');
      return false;
    }
    return true;
  }

  function editedFields(data, original, fields) {
    if (!original) return data;
    return { id: data.id, _syncCandidate: data._syncCandidate,
      ...Object.fromEntries(fields.filter(key => JSON.stringify(data[key]) !== JSON.stringify(original[key])).map(key => [key, data[key]])) };
  }

  async function commitSync(change, instance = engine) {
    if (!syncInitialized || !instance || activeScope !== initialScope) {
      notify('同步存储尚未就绪，操作未保存；请保留当前输入。', 'error');
      return false;
    }
    try {
      await change(instance);
    } catch (error) {
      applySyncProjection();
      notify(syncActionError(error), 'error');
      return false;
    }
    applySyncProjection();
    renderSaveStatus(state.localSavedAt ? 'saved' : 'idle');
    // 写入后安排同步；save、投影和渲染仍不触发网络。
    scheduleSyncFlush(instance);
    return true;
  }

  function syncActionError(error) {
    const message = String(error?.message || '');
    if (/删除|缺失|不存在/.test(message)) return '内容已变化，请重新确认。当前输入已保留。';
    if (/类型|语言|引用|分组|配置|reference/i.test(message)) return '类型或语言暂不可用，请先检查资源设置。当前输入已保留。';
    if (/epoch|世代|暂停/.test(message)) return '同步已暂停，请先保留备份。当前输入已保留。';
    return '操作未完成，请稍后重试。当前输入已保留。';
  }

  function canAutoSync() {
    if (!syncInitialized || !engine || syncBusy || syncPanelBusy || activeScope !== initialScope ||
        document.visibilityState !== 'visible' || navigator.onLine === false) return false;
    try { return ['http:', 'https:'].includes(new URL(apiConfig.baseUrl).protocol) && normalizeScope(apiConfig.baseUrl) === activeScope; }
    catch { return false; }
  }

  function scheduleSyncFlush(instance = engine) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      if (![engine, collectionsEngine, collectionsRecoveryEngine].includes(instance) || !instance?.status().pending) return;
      if (syncBusy) { flushAfterSync = true; return; }
      if (canAutoSync()) void pushAllToCloud();
    }, 150);
  }

  function refreshSyncWhenAvailable() {
    if (canAutoSync() && Date.now() - lastSyncAttempt >= 30000) void pushAllToCloud();
  }
  window.addEventListener('online', refreshSyncWhenAvailable);
  document.addEventListener('visibilitychange', refreshSyncWhenAvailable);

  async function pushCardToCloud(card) {
    if (!editableSyncRecord('card', card.id, card)) return false;
    return commitSync(instance => instance.put('card', String(card.id), card));
  }

  async function pushAllToCloud({ announce = false } = {}) {
    if (!syncInitialized || !engine || syncBusy) return false;
    if (!isApiOnline()) {
      updateSyncIndicator();
      if (announce) notify('尚未连接云端，本机内容已保留。');
      return false;
    }
    const instances = [engine, collectionsEngine, collectionsRecoveryEngine].filter(Boolean);
    syncBusy = true;
    lastSyncAttempt = Date.now();
    updateSyncIndicator();
    try {
      const statuses = [];
      for (const instance of instances) statuses.push(await instance.sync());
      if (instances[0] !== engine || activeScope !== initialScope) return false;
      syncFailure = '';
      const status = combinedSyncStatus();
      const success = isApiOnline() && status?.ready && !status.error && !status.pending && !status.conflicts && !status.candidates && !status.epochChanged;
      syncBusy = false;
      if (announce) notify(syncSummary(status), success ? 'success' : 'info');
      return success;
    } catch (error) {
      syncFailure = '同步未完成';
      if (announce) notify('同步未完成，本机内容已保留，请稍后重试。', 'error');
      return false;
    } finally {
      if (instances[0] === engine) {
        syncBusy = false;
        applySyncProjection();
        const status = combinedSyncStatus();
        if (flushAfterSync && !syncFailure && !status.error && !status.epochChanged && !status.conflicts) {
          const pendingInstance = instances.find(candidate => candidate.status().pending);
          if (pendingInstance) scheduleSyncFlush(pendingInstance);
        }
        flushAfterSync = false;
      }
    }
  }

  async function deleteFromCloud(id) {
    if (!editableSyncRecord('card', id)) return false;
    return commitSync(instance => instance.remove('card', String(id)));
  }

  async function patchReviewOnCloud(id, level, nextReview) {
    if (!editableSyncRecord('card', id)) return false;
    return commitSync(instance => instance.put('card', String(id), { level: Number(level) || 0, next_review: nextReview }));
  }

  // ── 完整 transcript 归档 API ─────────────────────
  function newDocumentId() {
    return crypto.randomUUID();
  }

  function prepareArchiveIdentity() {
    const documentDate = $('#documentDate').value || state.documentDate || new Date().toISOString().slice(0, 10);
    // 默认每次保存均创建一篇新全文；仅从历史列表进入编辑时更新原记录。
    if (!state.editingArchiveId) state.documentId = newDocumentId();
    state.documentDate = documentDate;
    return documentDate;
  }

  function archiveAnnotationsFromEditor() {
    const annotationIds = new Set([...editor.querySelectorAll('[data-item]')].map(node => node.dataset.item));
    const annotations = new Map(state.editorAnnotations.map(item => [String(item.id), item]));
    state.items.forEach(item => annotations.set(String(item.id), item));
    return [...annotations.values()].filter(item => annotationIds.has(String(item.id)));
  }

  function archiveSnapshot() {
    const documentDate = prepareArchiveIdentity();
    return {
      id: state.documentId,
      document_date: documentDate,
      title: $('#docTitle').value.trim() || '未命名文本',
      html: editorHTML(),
      video_url: state.videoUrl || '',
      audio_url: state.audioUrl || '',
      annotations: archiveAnnotationsFromEditor(),
      language: state.currentLanguage,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveArchiveToCloud(document) {
    if (!editableSyncRecord('document', document.id, document)) return false;
    return commitSync(instance => instance.put('document', String(document.id), document));
  }

  async function connectAndSync() {
    return pushAllToCloud({ announce: true });
  }

  // ══════════════════════════════════════════════════
  // 本地存储 + 渲染
  // ══════════════════════════════════════════════════

  function renderSaveStatus(kind = 'saved', detail = '') {
    const status = $('#saveStatus');
    if (!status) return;
    const english = state.displayLanguage === 'en';
    const savedAt = new Date(state.localSavedAt || Date.now());
    const savedTime = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(savedAt);
    const copy = detail || ({
      saved: `${english ? 'Saved' : '已保存'} ${savedTime}`,
      editing: english ? 'Editing' : '编辑中',
      idle: english ? 'Not saved' : '尚未保存',
      error: english ? 'Save failed' : '保存失败',
    }[kind] || (english ? 'Not saved' : '尚未保存'));
    const dot = document.createElement('span');
    dot.className = 'local-save-dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'save-status-copy';
    text.textContent = copy;
    status.dataset.state = kind;
    status.replaceChildren(dot, text);
  }

  function save() {
    if (!syncInitialized || activeScope !== initialScope) return false;
    state.title = $('#docTitle').value;
    state.documentDate = $('#documentDate').value || state.documentDate || new Date().toISOString().slice(0, 10);
    state.html = editorHTML();
    state.schemaVersion = 2;
    state.localSavedAt = new Date().toISOString();
    try {
      localStorage.setItem(key, JSON.stringify(state));
      if (++saveCounter % 20 === 0) snapshotBackup('auto');
      renderSaveStatus('saved');
      return true;
    } catch (error) {
      renderSaveStatus('error');
      notify('本地空间不足，内容未保存。请先导出备份后清理浏览器数据。', 'error');
      return false;
    }
  }

  function setSaveModeUI() {
    const editingHistory = !!state.editingArchiveId;
    $('#saveAsNewBtn').hidden = false;
    $('#updateHistoryBtn').hidden = !editingHistory;
    $('#saveAsNewBtn').textContent = editingHistory ? '保存到新文本' : '保存全文';
  }

  function applyFlashcardPanelState() {
    const collapsed = state.flashcardsCollapsed === true;
    const panel = $('#flashcardPanel');
    const collapseButton = $('#collapseFlashcards');
    const restoreButton = $('#restoreFlashcards');
    const collapseLabel = state.displayLanguage === 'en' ? 'Collapse flashcards' : '收起词卡侧栏';
    const restoreLabel = state.displayLanguage === 'en' ? 'Expand flashcards' : '展开词卡侧栏';
    document.body.classList.toggle('flashcards-collapsed', collapsed);
    panel.setAttribute('aria-hidden', String(collapsed));
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapseLabel);
    collapseButton.title = collapseLabel;
    restoreButton.hidden = !collapsed;
    restoreButton.setAttribute('aria-expanded', String(!collapsed));
    restoreButton.setAttribute('aria-label', restoreLabel);
    restoreButton.title = restoreLabel;
  }

  function setFlashcardPanelCollapsed(collapsed) {
    state.flashcardsCollapsed = collapsed === true;
    applyFlashcardPanelState();
    save();
    if (!state.flashcardsCollapsed) $('#collapseFlashcards').focus();
  }

  function clearCurrentEditor(message = '点击新建创建新文本') {
    state.editingArchiveId = '';
    state.editorAnnotations = [];
    state.editorDocumentOriginal = null;
    state.documentId = newDocumentId();
    state.documentDate = new Date().toISOString().slice(0, 10);
    state.videoUrl = '';
    clearLocalAudioUrl(); state.audioUrl = '';
    $('#docTitle').value = '';
    $('#documentDate').value = state.documentDate;
    setEditorEditable(false);
    editor.classList.add('is-blank');
    setEditorContent('');
    $('#newTextPrompt').hidden = false;
    $('#videoPanel').hidden = true;
    $('#audioPanel').hidden = true;
    $('#mediaSwitcher').hidden = true;
    setSaveModeUI();
    renderSaveStatus('idle', message);
    renderVideo();
    renderAudio();
    applyEditorMode();
    renderCapturedPhrases();
  }

  function startNewText() {
    state.editingArchiveId = '';
    state.editorAnnotations = [];
    state.editorDocumentOriginal = null;
    state.documentId = newDocumentId();
    state.documentDate = new Date().toISOString().slice(0, 10);
    state.videoUrl = '';
    clearLocalAudioUrl(); state.audioUrl = '';
    $('#docTitle').value = defaultDocumentTitle(state.currentLanguage);
    $('#documentDate').value = state.documentDate;
    setEditorEditable(true);
    editor.classList.remove('is-blank');
    setEditorContent('');
    $('#newTextPrompt').hidden = true;
    $('#videoPanel').hidden = true;
    $('#audioPanel').hidden = true;
    $('#mediaSwitcher').hidden = true;
    setSaveModeUI();
    renderSaveStatus('editing');
    renderVideo();
    renderAudio();
    applyEditorMode();
    renderCapturedPhrases();
    editorAdapter.focus('start');
  }

  function render() {
    const items = activeCards();
    const dues = items.filter(due);
    const mastered = items.filter(i => i.level >= 4).length;

    $('#annotationCount').textContent = cardsForLanguage(state.currentLanguage).length;
    $('#allNum').textContent = items.length;
    $('#cardListCount').textContent = state.items.length;
    $('#dueCount').textContent = state.reviewMode === 'mixed' ? state.items.filter(due).length : dues.length;
    $('#archiveCount').textContent = state.archives.length;

    $('#progressBar').style.width = state.items.length
      ? (mastered / state.items.length * 100) + '%'
      : '0%';
    $('#progressText').textContent = state.items.length
      ? `已掌握 ${mastered} / ${state.items.length} 条`
      : '还没有已掌握的卡片';

    const reviewDues = state.reviewMode === 'mixed' ? state.items.filter(due) : dues;
    const overdueCount = reviewDues.filter(item => overdueDays(item) > 0).length;
    $('#reviewTitle').textContent = reviewDues.length
      ? `今天有 ${reviewDues.length} 条待复习${overdueCount ? `，其中 ${overdueCount} 条逾期` : ''}`
      : '今日无需复习';
    $('#reviewHint').textContent = reviewDues.length
      ? (state.reviewMode === 'mixed' ? '英语、荷兰语与日语卡片将一起复习。' : `本次只复习${languageName(state.cardLanguage)}卡片。`)
      : '按你的复习间隔安排下一次巩固。';
    $('#startReview').disabled = !reviewDues.length;
    $('#startReview').textContent = reviewDues.length ? `开始复习 · ${reviewDues.length}` : '今日已完成';

    $('#collectionList').innerHTML = items.length
      ? items.map(i => `
        <div class="item">
          <button class="remove" data-id="${esc(i.id)}" title="删除" aria-label="删除词卡“${esc(i.text)}”">×</button>
          <div class="term">${esc(i.text)} <span class="small">${languageName(i.language || 'nl')}</span></div>
          <div class="sentence">${esc(i.sentence || '未保存原句')}</div>
          <button class="speak-sentence" data-speak="${i.id}" type="button" title="朗读保存的完整句子">朗读原句</button>
          <div class="translation">${esc(i.meaning || '未添加释义')}</div>
          <div class="review-date">${overdueDays(i) ? `逾期 ${overdueDays(i)} 天` : due(i) ? '今日待复习' : '下次 ' + date(reviewDateOf(i))}</div>
        </div>
      `).join('')
      : '<div class="empty">还没有词卡<br>从正文中选取内容即可添加</div>';
  }

  // ── 全文归档与历史查看 ────────────────────────────
  function formatArchiveDate(value) {
    if (!value) return '未设置日期';
    const parsed = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(parsed.getTime()) ? '未设置日期' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsed);
  }

  function normalizeArchive(record) {
    // 外部 JSON 的正文只按编辑器支持的静态富文本展示，原始 HTML 仍留在备份中。
    const template = document.createElement('template');
    template.innerHTML = typeof record.html === 'string' ? record.html : '';
    const tags = new Set(['P', 'BR', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'MARK', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'UL', 'OL', 'LI', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'SUP', 'SUB', 'RUBY', 'RT', 'RP']);
    for (const node of template.content.querySelectorAll('*')) {
      if (!tags.has(node.tagName)) { node.replaceWith(document.createTextNode(node.textContent)); continue; }
      const style = ['color', 'background-color', 'font-weight', 'font-style', 'font-size', 'text-align', 'text-decoration', 'margin-left', 'white-space'].map(property => [property, node.style.getPropertyValue(property)]);
      for (const attribute of [...node.attributes]) {
        if (['class', 'title', 'data-item', 'colspan', 'rowspan'].includes(attribute.name)) continue;
        if (node.tagName === 'A' && attribute.name === 'href' && /^https?:\/\//i.test(attribute.value.trim())) continue;
        node.removeAttribute(attribute.name);
      }
      for (const [property, value] of style) if (value && !/url\s*\(|var\s*\(/i.test(value)) node.style.setProperty(property, value);
    }
    return { ...record, html: template.innerHTML, annotations: Array.isArray(record.annotations) ? record.annotations : [] };
  }

  function sortArchives(archives) {
    const sort = state.archiveSort || 'updated';
    return archives.sort((a, b) => {
      if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
      if (sort === 'language') return languageName(a.language || 'nl').localeCompare(languageName(b.language || 'nl'), 'zh-CN') || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      if (sort === 'date') return String(b.document_date || '').localeCompare(String(a.document_date || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
  }

  let archiveVideoFloatingSuppressed = false;
  let archiveVideoFloatingFrame = 0;
  let archiveFloatingAnchor = null;

  function archiveVideoElements() {
    const reader = $('#archiveReader');
    return {
      video: reader.querySelector('[data-archive-video]'),
      placeholder: reader.querySelector('[data-archive-video-placeholder]'),
    };
  }

  function setArchiveVideoFloating(floating) {
    const { video, placeholder } = archiveVideoElements();
    if (!video || !placeholder) return;
    if (!floating) {
      video.classList.remove('is-floating');
      placeholder.classList.remove('active');
      placeholder.style.height = '';
      return;
    }
    if (video.classList.contains('is-floating')) return;
    placeholder.style.height = video.offsetHeight + 'px';
    placeholder.classList.add('active');
    video.classList.add('is-floating');
  }

  function releaseArchiveVideoFloating() {
    archiveVideoFloatingSuppressed = false;
    setArchiveVideoFloating(false);
  }

  function updateArchiveVideoFloating() {
    archiveVideoFloatingFrame = 0;
    if ($('#archiveReader').hidden) {
      setArchiveVideoFloating(false);
      return;
    }
    const { video, placeholder } = archiveVideoElements();
    if (!video || !placeholder) return;
    const reference = video.classList.contains('is-floating') ? placeholder : video;
    const rect = reference.getBoundingClientRect();
    if (archiveVideoFloatingSuppressed) {
      if (rect.bottom >= 0) archiveVideoFloatingSuppressed = false;
      else return;
    }
    if (rect.bottom < 0) setArchiveVideoFloating(true);
    else setArchiveVideoFloating(false);
  }

  function queueArchiveVideoFloatingUpdate() {
    if (!archiveVideoFloatingFrame) archiveVideoFloatingFrame = requestAnimationFrame(updateArchiveVideoFloating);
  }

  window.addEventListener('resize', queueArchiveVideoFloatingUpdate);

  function archiveCard(annotation) {
    return state.items.find(item => String(item.id) === String(annotation.id)) || annotation;
  }

  function splitArchiveIntoPassages(html, maxLength = 320) {
    const source = document.createElement('div');
    source.innerHTML = html || '';
    const text = source.innerText.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return [];
    const sentences = text.match(/[^.!?。！？\n]+(?:[.!?。！？]+[”’"』】）)]*)?|[^.!?。！？\n]+$/g)?.map(value => value.trim()).filter(Boolean) || [text];
    const passages = [];
    let current = '';
    sentences.forEach(sentence => {
      if (current && current.length + sentence.length + 1 > maxLength) {
        passages.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    });
    if (current) passages.push(current);
    return passages;
  }

  function contextPassageHtml(text, annotations) {
    const matches = [];
    annotations.forEach(annotation => {
      const term = String(annotation.text || '').trim();
      if (!term) return;
      const haystack = text.toLocaleLowerCase();
      const needle = term.toLocaleLowerCase();
      let start = 0;
      while ((start = haystack.indexOf(needle, start)) !== -1) {
        matches.push({ start, end: start + term.length, annotation });
        start += Math.max(1, term.length);
      }
    });
    matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const accepted = [];
    matches.forEach(match => {
      if (!accepted.some(item => match.start < item.end && match.end > item.start)) accepted.push(match);
    });
    let cursor = 0;
    return accepted.map(match => {
      const before = esc(text.slice(cursor, match.start));
      const word = esc(text.slice(match.start, match.end));
      cursor = match.end;
      return `${before}<button class="context-word" type="button" data-context-card-id="${esc(match.annotation.id)}">${word}</button>`;
    }).join('') + esc(text.slice(cursor));
  }

  function contextReadingHtml(documentRecord, annotations) {
    const passages = splitArchiveIntoPassages(documentRecord.html);
    if (!passages.length) return '<div class="empty">这篇全文没有可阅读的正文。</div>';
    return `<div class="context-reading-intro"><strong>${passages.length} 个阅读段落</strong><span>按完整句子切分；点击标记词语即可更新状态。</span></div><div class="context-passages">${passages.map((passage, index) => `<section class="context-passage"><span class="context-passage-number">${index + 1}</span><p>${contextPassageHtml(passage, annotations)}</p></section>`).join('')}</div>`;
  }

  function showArchiveCardEditor(annotation, anchor, documentRecord) {
    const item = archiveCard(annotation);
    const existing = $('#archiveReader').querySelector('.archive-card-editor');
    if (existing) existing.remove();
    const panel = document.createElement('section');
    panel.className = 'archive-card-editor';
    panel.innerHTML = `<div><strong>${esc(item.text)}</strong><span>${esc(item.meaning || '未添加释义')}</span></div><div class="archive-card-stage">阶段 ${Number(item.level) || 0} · ${due(item) ? '当前待复习' : `下次 ${date(reviewDateOf(item))}`}</div><div class="archive-card-actions"><button type="button" data-reading-rating="forgot">忘记</button><button type="button" data-reading-rating="fuzzy">模糊</button><button type="button" data-reading-rating="mastered">认识</button><button type="button" data-reading-close aria-label="关闭">×</button></div>`;
    const host = anchor.closest('.context-passage') || anchor.closest('.archive-transcript');
    host.insertAdjacentElement('afterend', panel);
    panel.querySelector('[data-reading-close]').onclick = () => panel.remove();
    panel.querySelectorAll('[data-reading-rating]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      const saved = await applyReviewRating(item, button.dataset.readingRating);
      button.disabled = false;
      if (!saved) return;
      showArchiveCardEditor(item, anchor, documentRecord);
      notify(`“${item.text}”的复习状态已保存本机，云端进度请查看同步状态。`);
    });
  }

  function renderArchiveReader(document) {
    const target = $('#archiveReader');
    unobserveFloatingMedia(archiveFloatingAnchor);
    archiveFloatingAnchor = null;
    releaseArchiveVideoFloating();
    if (!document) {
      target.innerHTML = '<div class="empty">选择一个日期查看已保存的正文。</div>';
      return;
    }
    const annotations = Array.isArray(document.annotations) ? document.annotations : [];
    const videoId = youtubeIdFromUrl(document.video_url || '');
    const video = videoId ? `<div class="archive-video-placeholder" data-archive-video-placeholder></div><div class="archive-video" data-archive-video><div class="archive-video-head"><span>历史视频浮窗</span><div class="archive-video-tools"><button type="button" data-archive-video-restore>恢复</button><button type="button" data-archive-video-close>关闭</button></div></div><div class="video-frame"><iframe title="已保存的 YouTube 视频" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><a class="video-link" href="${esc(document.video_url)}" target="_blank" rel="noopener noreferrer">在 YouTube 中打开</a></div>` : '';
    const audioUrl = document.audio_url || '';
    const audio = isNhkEasyArticleUrl(audioUrl)
      ? `<div class="archive-audio"><strong>NHK 原网页音频</strong><br><button class="btn primary" type="button" data-open-nhk-page="${esc(audioUrl)}">打开 NHK 播放窗口</button></div>`
      : validAudioUrl(audioUrl) ? `<div class="archive-audio"><audio controls preload="metadata" src="${esc(audioUrl)}"></audio><a class="video-link" href="${esc(audioUrl)}" target="_blank" rel="noopener noreferrer">在新窗口打开音频</a></div>` : '';
    const annotationHtml = annotations.length ? annotations.map((item, index) => `
      <button class="meaning-toggle" type="button" data-meaning-index="${index}" aria-expanded="false"><strong>${esc(item.text)}</strong> · 点击查看释义</button>
      <div class="meaning-detail"><strong>中文：</strong>${esc(item.meaning || '未添加释义')}<br><strong>原句：</strong>${esc(item.sentence || '未保存原句')}${item.note ? `<br><strong>备注：</strong>${esc(item.note)}` : ''}</div>
    `).join('') : '<div class="empty">这篇全文没有保存标注。</div>';
    target.innerHTML = `
      <div class="archive-reader-head">
        <div>
          <h2>${esc(document.title || '未命名文本')}</h2>
          <div class="archive-meta">学习日期：${esc(formatArchiveDate(document.document_date))} · ${annotations.length} 条标注</div>
        </div>
        <div class="archive-reader-actions">
          <button class="btn" id="backToArchiveList" type="button">← 返回列表</button>
          <button class="btn" id="toggleContextReading" type="button" aria-pressed="false">情境阅读</button>
          <button class="btn" id="editArchiveContent" type="button" data-id="${esc(document.id)}">编辑内容</button>
          <button class="btn danger" id="deleteArchive" type="button" data-id="${esc(document.id)}">删除此全文</button>
        </div>
      </div>
      ${video}
      ${audio}
      <div class="archive-transcript">${document.html || '<p>未保存正文。</p>'}</div>
      <section class="archive-context-reading" id="archiveContextReading" hidden>${contextReadingHtml(document, annotations)}</section>
      <section class="archive-annotations"><h3>标注释义</h3>${annotationHtml}</section>
    `;
    decorateArchiveHighlights(target, annotations);
    $('#backToArchiveList').onclick = closeArchiveReader;
    $('#toggleContextReading').onclick = event => {
      const context = $('#archiveContextReading');
      const transcript = target.querySelector('.archive-transcript');
      const opening = context.hidden;
      context.hidden = !opening;
      transcript.hidden = opening;
      event.currentTarget.textContent = opening ? '返回原文' : '情境阅读';
      event.currentTarget.setAttribute('aria-pressed', String(opening));
      target.querySelector('.archive-card-editor')?.remove();
    };
    $('#editArchiveContent').onclick = () => openEditorForArchive(document.id);
    $('#deleteArchive').onclick = async event => {
      if (await removeArchive(document.id, event.currentTarget)) closeArchiveReader();
    };
    target.querySelectorAll('.meaning-toggle').forEach(button => button.onclick = () => {
      button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
    });
    target.querySelectorAll('.archive-highlight').forEach(highlight => highlight.onclick = () => {
      const annotation = annotations.find(item => String(item.id) === String(highlight.dataset.item));
      if (annotation) showArchiveCardEditor(annotation, highlight, document);
    });
    target.querySelectorAll('[data-context-card-id]').forEach(button => button.onclick = () => {
      const annotation = annotations.find(item => String(item.id) === String(button.dataset.contextCardId));
      if (annotation) showArchiveCardEditor(annotation, button, document);
    });
    target.querySelectorAll('[data-open-nhk-page]').forEach(button => button.onclick = () => openNhkPlayerWindow(button.dataset.openNhkPage));
    const archiveVideo = target.querySelector('[data-archive-video]');
    if (archiveVideo) {
      const archivePlaceholder = target.querySelector('[data-archive-video-placeholder]');
      archiveFloatingAnchor = archivePlaceholder;
      observeFloatingMedia(archivePlaceholder, entry => {
        if ($('#archiveReader').hidden) return setArchiveVideoFloating(false);
        if (entry.isIntersecting) { archiveVideoFloatingSuppressed = false; setArchiveVideoFloating(false); }
        else if (entry.boundingClientRect.bottom < 0 && !archiveVideoFloatingSuppressed) setArchiveVideoFloating(true);
      });
      archiveVideo.querySelector('[data-archive-video-restore]').onclick = () => {
        archiveVideoFloatingSuppressed = false;
        setArchiveVideoFloating(false);
        scrollToSection(archiveVideo);
      };
      archiveVideo.querySelector('[data-archive-video-close]').onclick = () => {
        archiveVideoFloatingSuppressed = true;
        setArchiveVideoFloating(false);
      };
      queueArchiveVideoFloatingUpdate();
    }
  }

  function decorateArchiveHighlights(target, annotations) {
    const annotationById = new Map(annotations.map(item => [String(item.id), item]));
    target.querySelectorAll('.archive-transcript [data-item]').forEach(highlight => {
      const item = annotationById.get(String(highlight.dataset.item));
      if (!item) return;
      const meaning = item.meaning || '未添加释义';
      const details = item.note ? `${meaning} · ${item.note}` : meaning;
      highlight.classList.add('archive-highlight');
      highlight.tabIndex = 0;
      highlight.setAttribute('role', 'button');
      highlight.setAttribute('aria-label', `${item.text}：${meaning}`);
      highlight.dataset.meaning = details;
    });
  }

  function archivePlainText(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    template.content.querySelectorAll('script,style').forEach(node => node.remove());
    template.content.querySelectorAll('br,p,div,li,h1,h2,h3,h4,blockquote,tr').forEach(node => node.append(' '));
    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function archiveRecords() {
    if (archiveScope === 'trash') {
      return typeof engine?.trash === 'function' ? engine.trash('document').map(item => ({
        ...normalizeArchive({ ...item.data, id: item.id }), _archiveTrash: item
      })) : [];
    }
    return state.archives;
  }

  function archiveSyncStates() {
    const sync = engine?.exportBackup();
    const states = new Map();
    for (const entry of sync?.queue || []) {
      if (entry.entity !== 'document') continue;
      const id = String(entry.id), current = states.get(id) || {};
      const paused = entry.paused || (entry.epoch !== null && entry.epoch !== sync.epoch);
      current.paused ||= paused;
      if (!paused) { current.pending = true; current.restoring ||= entry.kind === 'restore'; }
      states.set(id, current);
    }
    for (const conflict of Object.values(sync?.conflicts || {})) {
      if (conflict.entity === 'document') {
        const id = String(conflict.entityId);
        states.set(id, { ...states.get(id), conflict: true });
      }
    }
    return { states, epochChanged: !!sync?.epochChanged };
  }

  function archiveStateLabel(record, sync) {
    if (record._syncCandidate) return '需要确认 · 前往设置选择';
    const info = record._archiveTrash || sync.states.get(String(record.id)) || {};
    const labels = [];
    if (info.conflict) labels.push('需要确认 · 请先选择要保留的版本');
    if (info.paused || sync.epochChanged) labels.push('同步已暂停 · 请先查看同步提示');
    if (info.pending) labels.push(record._archiveTrash ? '移入回收站待同步' : info.restoring ? '恢复待同步' : '本机修改待同步');
    if (record._archiveTrash && !info.canRestore && !info.conflict && !info.paused) labels.push('暂不可恢复 · 请检查同步面板');
    return labels.join('；') || (record._archiveTrash ? '已在回收站' : '');
  }

  function archiveMediaLabel(record) {
    return [record.video_url && '视频链接', record.audio_url && '音频链接'].filter(Boolean).join(' · ') || '无媒体链接';
  }

  function archiveStatus(message, error = false) {
    const status = $('#archiveOperationStatus');
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('error', error);
  }

  function openArchiveSyncPanel() {
    void activateView('settings');
    $('#syncPanel').tabIndex = -1;
    $('#syncPanel').focus();
    scrollToSection($('#syncPanel'));
  }

  function renderArchiveSelection() {
    const count = archiveSelectedIds.size, total = archiveVisibleRecords.length;
    $('#archiveSelectionCount').textContent = `已选 ${count} 项`;
    $('#archiveSelectAll').checked = total > 0 && count === total;
    $('#archiveSelectAll').indeterminate = count > 0 && count < total;
    $('#archiveSelectAll').disabled = !total || archiveBatchBusy;
    $('#archiveExportSelected').disabled = !count || archiveBatchBusy;
    $('#archiveDeleteSelected').hidden = archiveScope === 'trash';
    $('#archiveDeleteSelected').disabled = !count || archiveBatchBusy;
    $('#archiveDates').querySelectorAll('[data-select-archive-id]').forEach(input => {
      input.checked = archiveSelectedIds.has(input.dataset.selectArchiveId);
      input.disabled = archiveBatchBusy;
    });
  }

  function renderArchiveDetails(sync = archiveSyncStates()) {
    const record = archiveVisibleRecords.find(item => String(item.id) === archiveDetailId);
    const panel = $('#archiveDetails');
    if (!record || !$('#archiveReader').hidden) {
      const hadFocus = panel.contains(document.activeElement);
      panel.hidden = true;
      if (!record) archiveDetailId = '';
      if (hadFocus && !record && document.body.dataset.activeView === 'history') $('#archiveSearch').focus({ preventScroll: true });
      archiveDetailSignature = '';
      return;
    }
    panel.hidden = false;
    const status = archiveStateLabel(record, sync), trash = record._archiveTrash;
    const signature = JSON.stringify([record, status]);
    if (signature === archiveDetailSignature) return;
    archiveDetailSignature = signature;
    const focusedAction = panel.contains(document.activeElement) ? document.activeElement.dataset.detailAction : null;
    const action = (name, label, disabled = false) => `<button class="btn${name === 'delete' ? ' danger' : ''}" type="button" data-detail-action="${name}" data-detail-id="${esc(record.id)}"${disabled ? ' disabled' : ''}>${label}</button>`;
    $('#archiveDetailsContent').innerHTML = `
      <h3 class="archive-detail-title" data-archive-user-content>${esc(record.title || '未命名文本')}</h3>
      <dl class="archive-detail-meta"><div><dt>学习日期</dt><dd>${esc(formatArchiveDate(record.document_date))}</dd></div><div><dt>最近更新</dt><dd>${esc(record.updated_at || '未记录')}</dd></div><div><dt>语言</dt><dd>${esc(languageName(record.language || 'nl'))}</dd></div><div><dt>标注</dt><dd>${record.annotations.length} 条</dd></div><div><dt>媒体</dt><dd>${archiveMediaLabel(record)}</dd></div></dl>
      ${status ? `<p class="archive-file-status">${esc(status)}</p>` : ''}
      <div class="archive-detail-actions">${trash
        ? action('restore', '恢复全文', !trash.canRestore || trash.conflict || trash.paused)
        : action('open', '阅读') + (record._syncCandidate ? '' : action('edit', '编辑内容') + action('rename', '重命名') + action('delete', '移入回收站'))}${action('export', '下载全文备份')}${record._syncCandidate || (trash && !trash.canRestore) || trash?.conflict || trash?.paused || sync.epochChanged ? action('sync', '前往同步面板') : ''}</div>
      <h4>正文摘要</h4><p class="archive-detail-summary" data-archive-user-content>${esc(archivePlainText(record.html).slice(0, 1000) || '未保存正文。')}</p>
      <h4>标注释义与备注</h4><div class="archive-detail-annotations" data-archive-user-content>${record.annotations.map(item => `<div><strong>${esc(item.text || '')}</strong><p>${esc(item.meaning || '未添加释义')}</p>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>`).join('') || '<p>没有标注。</p>'}</div>`;
    if (focusedAction) panel.querySelector(`[data-detail-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }

  function selectArchiveDetails(id, focus = false) {
    archiveDetailId = String(id);
    $('#archiveDates').querySelectorAll('.archive-file-row').forEach(row => {
      const selected = row.dataset.archiveId === archiveDetailId;
      row.classList.toggle('active', selected);
      row.setAttribute('aria-expanded', String(selected));
    });
    renderArchiveDetails();
    if (focus && !$('#archiveDetails').hidden) $('#archiveDetails').focus({ preventScroll: true });
  }

  function closeArchiveDetails(focus = true) {
    clearTimeout(archiveDetailTimer);
    const id = archiveDetailId;
    archiveDetailId = '';
    selectArchiveDetails('');
    if (focus) [...$('#archiveDates').querySelectorAll('.archive-file-row')].find(row => row.dataset.archiveId === id)?.focus({ preventScroll: true });
  }

  function renderArchives() {
    const dates = $('#archiveDates');
    // 保留后台投影刷新时尚未提交的行内标题，搜索框和筛选控件不重建。
    if (dates.querySelector('.archive-rename-input')) return;
    const sync = archiveSyncStates(), all = archiveRecords(), query = archiveQuery.trim().toLocaleLowerCase();
    const recentStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    archiveVisibleRecords = sortArchives(all.filter(record => {
      if (archiveLanguage !== 'all' && (record.language || 'nl') !== archiveLanguage) return false;
      if (archiveScope === 'recent' && !(Date.parse(record.updated_at) >= recentStart)) return false;
      if (!query) return true;
      return [record.title, archivePlainText(record.html), ...(record.annotations || []).flatMap(item => [item.text, item.meaning, item.note])].join(' ').toLocaleLowerCase().includes(query);
    }));
    const visibleIds = new Set(archiveVisibleRecords.map(record => String(record.id)));
    for (const id of archiveSelectedIds) if (!visibleIds.has(id)) archiveSelectedIds.delete(id);
    $('#archiveCount').textContent = state.archives.length;
    $('#archiveTotalCount').textContent = `${archiveVisibleRecords.length} / ${all.length}`;
    $('#archiveSort').value = state.archiveSort;
    $('#archiveScopeHelp').textContent = archiveScope === 'trash'
      ? '回收站保留全文和标注；恢复先保存在本机，随后同步。不提供永久删除。'
      : archiveScope === 'recent' ? '显示最近 7 天更新的全文。导出包含标注与媒体链接，不含音频实体。' : '全文与独立词卡分开管理。导出包含标注与媒体链接，不含音频实体。';
    document.querySelectorAll('[data-archive-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.archiveScope === archiveScope)));
    document.querySelectorAll('[data-archive-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.archiveLayout === state.archiveLayout)));
    dates.dataset.layout = state.archiveLayout;
    const focused = dates.contains(document.activeElement) ? document.activeElement : null;
    const focusedId = focused?.closest('.archive-file-row')?.dataset.archiveId;
    const focusedAttribute = focused && [...focused.attributes].find(attribute => /^data-(?:open|edit|delete|restore|select|sync)-archive-id$/.test(attribute.name))?.name;
    const rows = archiveVisibleRecords.map(record => {
      const id = esc(record.id), trash = record._archiveTrash, candidate = record._syncCandidate;
      const status = archiveStateLabel(record, sync);
      return `<article class="archive-date archive-file-row${String(record.id) === archiveDetailId ? ' active' : ''}" data-archive-id="${id}" tabindex="0" aria-label="${esc(record.title || '未命名文本')}" aria-expanded="${String(record.id) === archiveDetailId}" aria-controls="archiveDetails">
        <label class="archive-file-select"><input type="checkbox" data-select-archive-id="${id}" aria-label="选择 ${esc(record.title || '未命名文本')}"></label>
        <div class="archive-date-copy"><strong class="archive-name" data-archive-user-content${!trash && !candidate ? ` data-rename-archive-id="${id}" title="双击重命名"` : ''}>${esc(record.title || '未命名文本')}</strong>
          <span>${esc(formatArchiveDate(record.document_date))} · ${esc(languageName(record.language || 'nl'))} · ${(record.annotations || []).length} 条标注</span>
          <p class="archive-file-summary" data-archive-user-content>${esc(archivePlainText(record.html).slice(0, 180) || '未保存正文。')}</p>
          <span>${archiveMediaLabel(record)}</span>${status ? `<span class="archive-file-status">${esc(status)}</span>` : ''}</div>
        <div class="archive-row-actions">${trash
          ? `<button class="btn" type="button" data-restore-archive-id="${id}"${!trash.canRestore || trash.conflict || trash.paused ? ' disabled' : ''}>恢复</button>${trash.conflict || trash.paused || !trash.canRestore ? `<button class="btn" type="button" data-sync-archive-id="${id}">处理同步</button>` : ''}`
          : `<button class="btn" type="button" data-open-archive-id="${id}" data-open-archive-button="${id}">阅读</button>${candidate ? `<button class="btn" type="button" data-sync-archive-id="${id}">确认版本</button>` : `<button class="btn" type="button" data-edit-archive-id="${id}">编辑内容</button><button class="btn danger" type="button" data-delete-archive-id="${id}">删除</button>`}`}</div></article>`;
    }).join('');
    const empty = archiveScope === 'trash' && typeof engine?.trash !== 'function' ? '回收站接口尚未就绪，请更新同步模块后重试。' : query || archiveLanguage !== 'all' ? '没有匹配的全文。可清除筛选后重试。' : archiveScope === 'trash' ? '回收站为空。' : archiveScope === 'recent' ? '最近 7 天没有更新的全文。' : '还没有历史全文。新建文本后，使用“保存到新文本”归档。';
    dates.innerHTML = rows || `<div class="empty">${empty}</div>`;
    renderArchiveSelection();
    renderArchiveDetails(sync);
    if (focusedId) {
      const row = [...dates.querySelectorAll('.archive-file-row')].find(node => node.dataset.archiveId === focusedId);
      (focusedAttribute ? row?.querySelector(`[${focusedAttribute}]`) : row)?.focus({ preventScroll: true });
    }
  }

  function openArchiveReader(id) {
    const record = state.archives.find(item => String(item.id) === String(id));
    if (!record) return;
    selectedArchiveId = String(record.id);
    $('#archiveListHeader').hidden = true;
    $('#archiveDates').hidden = true;
    $('#archiveManager').hidden = true;
    $('#archiveDetails').hidden = true;
    $('#archiveReader').hidden = false;
    setInterfaceLanguageTheme(record.language || 'en');
    renderArchiveReader(record);
    $('#backToArchiveList').focus({ preventScroll: true });
    scrollToSection($('#archiveView'));
  }

  function closeArchiveReader() {
    releaseArchiveVideoFloating();
    const previousId = selectedArchiveId;
    selectedArchiveId = '';
    $('#archiveReader').querySelectorAll('audio').forEach(audio => audio.pause());
    $('#archiveReader').replaceChildren();
    $('#archiveReader').hidden = true;
    $('#archiveListHeader').hidden = false;
    $('#archiveDates').hidden = false;
    $('#archiveManager').hidden = false;
    setInterfaceLanguageTheme('en');
    renderArchives();
    [...$('#archiveDates').querySelectorAll('.archive-file-row')].find(row => row.dataset.archiveId === previousId)?.focus({ preventScroll: true });
    scrollToSection($('#archiveView'));
  }

  async function saveCurrentDocument(mode = 'new') {
    if (documentSaveBusy) return;
    if (!editorIsEditable() || !editorText().trim()) {
      notify('请先点击“新建文本”并输入内容。');
      return;
    }
    if (mode !== 'new' && !state.editingArchiveId) {
      notify('当前不是历史文本，无法更新。请使用“保存全文”。');
      return;
    }
    const identity = { editingArchiveId: state.editingArchiveId, documentId: state.documentId };
    if (mode === 'new') state.editingArchiveId = '';
    const document = archiveSnapshot();
    const changes = mode === 'new' ? document : editedFields(document, state.editorDocumentOriginal,
      ['document_date', 'title', 'html', 'video_url', 'audio_url', 'annotations', 'language']);
    documentSaveBusy = true;
    $('#workspace').inert = true;
    try {
      if (!await saveArchiveToCloud(changes)) { Object.assign(state, identity); return; }
      state.lastArchivedDate = document.document_date;
      clearCurrentEditor('本机已保存 · 等待同步');
      save(); render(); renderArchives();
      renderSaveStatus('saved');
    } finally { documentSaveBusy = false; $('#workspace').inert = false; }
  }

  async function deleteArchiveFromCloud(id) {
    if (!editableSyncRecord('document', id)) return false;
    return commitSync(instance => instance.remove('document', String(id)));
  }

  async function removeArchive(id, button = null, confirmed = false) {
    id = String(id);
    if (archiveBusyIds.has(id)) return false;
    if (!editableSyncRecord('document', id)) { openArchiveSyncPanel(); return false; }
    if (!state.archives.some(record => String(record.id) === id)) return false;
    archiveBusyIds.add(id);
    try {
      if (!confirmed && !await confirmAction('将这篇历史全文移入回收站？之后可以恢复；已收集的独立词卡不会被删除。', { title: '移入回收站', confirmLabel: '移入回收站' })) return false;
      if (!confirmed) snapshotBackup('before-delete-document');
      if (button) button.disabled = true;
      if (!await deleteArchiveFromCloud(id)) {
        archiveStatus('移入回收站未完成，现有内容已保留。', true);
        return false;
      }
      if (String(state.editingArchiveId) === id) {
        state.editingArchiveId = '';
        state.documentId = newDocumentId();
      }
      archiveSelectedIds.delete(id);
      save(); render(); renderArchives();
      if (!confirmed) {
        archiveStatus('已在本机移入回收站，删除待同步。独立词卡保持不变。');
        notify('已在本机移入回收站，待同步。');
      }
      return true;
    } finally {
      archiveBusyIds.delete(id);
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function restoreArchive(id, button = null) {
    id = String(id);
    if (archiveScope !== 'trash' || archiveBusyIds.has(id)) return;
    const lookup = () => engine?.trash?.('document').find(item => String(item.id) === id);
    let item = lookup();
    if (!item) return;
    if (!item.canRestore || item.conflict || item.paused) {
      archiveStatus('此全文存在冲突或同步暂停，请先在“设置 → 同步处理”处理。', true);
      notify('当前不能恢复，请先处理同步冲突或暂停。', 'error');
      return;
    }
    archiveBusyIds.add(id);
    try {
      if (!await confirmAction(`恢复“${item.data?.title || '未命名文本'}”？恢复后会先保存在本机，再同步到其他设备。`, { title: '恢复全文', confirmLabel: '恢复' })) return;
      item = lookup();
      if (!item?.canRestore || item.conflict || item.paused) {
        archiveStatus('数据状态已变化，未提交恢复。请检查同步面板。', true);
        return;
      }
      if (button) button.disabled = true;
      if (!await commitSync(client => client.restore('document', id))) {
        archiveStatus('恢复未完成，现有内容已保留。', true);
        return;
      }
      archiveSelectedIds.delete(id);
      save(); render(); renderArchives();
      archiveStatus('已在本机恢复，恢复待同步。可切换“全部”查看；云端状态以同步面板为准。');
      notify('已在本机恢复全文，待同步。');
    } finally {
      archiveBusyIds.delete(id);
      if (button?.isConnected) button.disabled = false;
    }
  }

  function exportArchives(records) {
    if (!records.length) return;
    const documents = records.map(record => {
      const source = record._archiveTrash?.data || record;
      return Object.fromEntries(['id', 'title', 'document_date', 'language', 'html', 'annotations', 'video_url', 'audio_url', 'created_at', 'updated_at']
        .filter(key => source[key] !== undefined).map(key => [key, source[key]]));
    });
    const payload = { version: 1, exportedAt: new Date().toISOString(), type: 'notebook-document-export',
      description: '全文、标注和媒体链接；不包含音频实体、独立词卡或同步队列。此文件不是完整同步备份。', documents };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `notebook-documents-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    archiveStatus(`已导出 ${documents.length} 篇全文，包含标注和媒体链接，不含音频实体或独立词卡。`);
  }

  async function deleteSelectedArchives() {
    if (archiveBatchBusy || archiveScope === 'trash') return;
    const records = archiveVisibleRecords.filter(record => archiveSelectedIds.has(String(record.id)));
    if (!records.length) return;
    archiveBatchBusy = true;
    renderArchiveSelection();
    try {
      if (!await confirmAction(`将所选 ${records.length} 篇全文逐项移入回收站？独立词卡不会删除；需要确认的内容会跳过，失败项会保留。`, { title: '批量移入回收站', confirmLabel: '逐项移入' })) return;
      snapshotBackup('before-delete-documents');
      let removed = 0, skipped = 0;
      const failures = [];
      for (const record of records) {
        const current = state.archives.find(item => String(item.id) === String(record.id));
        if (!current || current._syncCandidate) { skipped++; continue; }
        if (await removeArchive(record.id, null, true)) removed++;
        else failures.push(record.title || record.id);
      }
      archiveStatus(`本机已移入 ${removed} 项，待同步；跳过 ${skipped} 项（需要确认或已不在列表）；失败 ${failures.length} 项。${failures.length ? `失败项：${failures.join('、')}` : ''}`, failures.length > 0);
      notify(`批量结果：本机移入 ${removed} 项，跳过 ${skipped} 项，失败 ${failures.length} 项。`);
    } finally {
      archiveBatchBusy = false;
      renderArchives();
    }
  }

  async function refreshArchives() {
    await pushAllToCloud({ announce: true });
    render();
    renderArchives();
    if (selectedArchiveId) {
      const selected = state.archives.find(item => String(item.id) === selectedArchiveId);
      if (selected) renderArchiveReader(selected);
      else closeArchiveReader();
    }
  }

  function openEditorForArchive(id) {
    const record = state.archives.find(item => item.id === id);
    if (!record) return;
    if (!editableSyncRecord('document', id, record)) { openArchiveSyncPanel(); return; }
    state.editingArchiveId = record.id;
    state.documentId = record.id;
    state.documentDate = record.document_date;
    state.currentLanguage = record.language || 'nl';
    state.cardLanguage = state.currentLanguage;
    $('#docTitle').value = record.title || '未命名文本';
    $('#documentDate').value = record.document_date;
    setEditorContent(record.html || '');
    state.videoUrl = record.video_url || '';
    clearLocalAudioUrl();
    state.audioUrl = record.audio_url || '';
    // 归档标注只是编辑器快照，不能回写或复活独立词卡；同 ID 词卡以引擎投影为准。
    state.editorAnnotations = structuredClone(record.annotations || []);
    state.editorDocumentOriginal = structuredClone(record);
    document.body.dataset.activeView = 'editor';
    $('#workspace').hidden = false;
    $('#archiveView').hidden = true;
    $('#settingsView').hidden = true;
    reviewView.hidden = true;
    dailyReviewView.hidden = true;
    $('#conversationView').hidden = true;
    document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'editor'));
    applyLanguageUI();
    $('#videoPanel').hidden = true;
    $('#audioPanel').hidden = true;
    $('#mediaSwitcher').hidden = true;
    setEditorEditable(true);
    editor.classList.remove('is-blank');
    $('#newTextPrompt').hidden = true;
    setSaveModeUI();
    renderVideo();
    renderAudio();
    state.editorMode = 'edit';
    applyEditorMode();
    renderCapturedPhrases();
    if (state.audioUrl) {
      $('#mediaSwitcher').hidden = false;
      $('#showVideoMedia').classList.remove('active');
      $('#showAudioMedia').classList.add('active');
      $('#audioPanel').hidden = false;
    } else if (state.videoUrl) {
      $('#mediaSwitcher').hidden = false;
      $('#showVideoMedia').classList.add('active');
      $('#showAudioMedia').classList.remove('active');
      $('#videoPanel').hidden = false;
    }
    setSaveModeUI();
    state.lastNotebookView = 'editor';
    syncRouteState('editor');
    save();
    render();
    editorAdapter.focus('start');
  }

  function beginArchiveRename(titleNode) {
    if (!titleNode || archiveScope === 'trash' || $('#archiveDates').querySelector('.archive-rename-input')) return;
    const record = state.archives.find(item => String(item.id) === titleNode.dataset.renameArchiveId);
    if (!record) return;
    if (!editableSyncRecord('document', record.id, record)) { openArchiveSyncPanel(); return; }
    const input = document.createElement('input');
    input.className = 'archive-rename-input';
    input.setAttribute('aria-label', '重命名全文');
    input.maxLength = 300;
    input.value = record.title || '未命名文本';
    titleNode.replaceWith(input);
    input.focus(); input.select();
    let committed = false, pending = false;
    const finish = focus => {
      input.onblur = null;
      input.replaceWith(titleNode);
      renderArchives();
      if (focus) [...$('#archiveDates').querySelectorAll('.archive-file-row')].find(row => row.dataset.archiveId === String(record.id))?.focus({ preventScroll: true });
    };
    const commit = async (focus = false) => {
      if (committed || pending) return;
      const nextTitle = input.value.trim() || record.title || '未命名文本';
      if (nextTitle === record.title) { committed = true; finish(focus); return; }
      if (!state.archives.some(item => String(item.id) === String(record.id))) {
        archiveStatus('此全文已不在活动列表；标题输入保留，请复制后取消编辑。', true);
        return;
      }
      pending = true;
      input.readOnly = true;
      const saved = await saveArchiveToCloud({ id: record.id, title: nextTitle, _syncCandidate: record._syncCandidate });
      pending = false;
      input.readOnly = false;
      if (!saved) { archiveStatus('重命名未完成，标题输入已保留，可重试或按 Escape 取消。', true); return; }
      committed = true;
      save(); finish(focus);
      archiveStatus('标题已保存到本机，待同步。');
    };
    input.onblur = () => void commit();
    input.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void commit(true); }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!pending) { committed = true; finish(true); }
      }
    };
  }

  $('#archiveSearch').oninput = event => { archiveQuery = event.target.value; renderArchives(); };
  $('#archiveLanguageFilter').onchange = event => { archiveLanguage = event.target.value; renderArchives(); };
  $('#archiveSort').onchange = event => { state.archiveSort = event.target.value; save(); renderArchives(); };
  $('#archiveClearFilters').onclick = () => {
    archiveQuery = ''; archiveLanguage = 'all';
    $('#archiveSearch').value = ''; $('#archiveLanguageFilter').value = 'all';
    renderArchives(); $('#archiveSearch').focus();
  };
  document.querySelectorAll('[data-archive-scope]').forEach(button => button.onclick = () => {
    archiveScope = button.dataset.archiveScope;
    closeArchiveDetails(false);
    renderArchives();
  });
  document.querySelectorAll('[data-archive-layout]').forEach(button => button.onclick = () => {
    state.archiveLayout = button.dataset.archiveLayout;
    save(); renderArchives();
  });
  $('#archiveSelectAll').onchange = event => {
    for (const record of archiveVisibleRecords) {
      if (event.target.checked) archiveSelectedIds.add(String(record.id));
      else archiveSelectedIds.delete(String(record.id));
    }
    renderArchiveSelection();
  };
  $('#archiveDates').onchange = event => {
    const input = event.target.closest('[data-select-archive-id]');
    if (!input) return;
    if (input.checked) archiveSelectedIds.add(input.dataset.selectArchiveId);
    else archiveSelectedIds.delete(input.dataset.selectArchiveId);
    renderArchiveSelection();
  };
  $('#archiveExportSelected').onclick = () => exportArchives(archiveVisibleRecords.filter(record => archiveSelectedIds.has(String(record.id))));
  $('#archiveDeleteSelected').onclick = deleteSelectedArchives;
  $('#archiveDates').onclick = async event => {
    clearTimeout(archiveDetailTimer);
    const target = event.target;
    if (target.closest('input,label')) return;
    const open = target.closest('[data-open-archive-id]');
    if (open) return openArchiveReader(open.dataset.openArchiveId);
    const edit = target.closest('[data-edit-archive-id]');
    if (edit) return openEditorForArchive(edit.dataset.editArchiveId);
    const remove = target.closest('[data-delete-archive-id]');
    if (remove) return removeArchive(remove.dataset.deleteArchiveId, remove);
    const restore = target.closest('[data-restore-archive-id]');
    if (restore) return restoreArchive(restore.dataset.restoreArchiveId, restore);
    if (target.closest('[data-sync-archive-id]')) return openArchiveSyncPanel();
    const row = target.closest('.archive-file-row');
    // 给双击留出判定窗口，避免首击展开详情改变正文或标题的位置。
    if (row) archiveDetailTimer = setTimeout(() => selectArchiveDetails(row.dataset.archiveId), 240);
  };
  $('#archiveDates').ondblclick = event => {
    clearTimeout(archiveDetailTimer);
    if (event.target.closest('button,input,select,label')) return;
    const titleNode = event.target.closest('[data-rename-archive-id]');
    if (titleNode) return beginArchiveRename(titleNode);
    const row = event.target.closest('.archive-file-row');
    if (row && archiveScope !== 'trash') openArchiveReader(row.dataset.archiveId);
  };
  $('#archiveDates').onkeydown = event => {
    if (event.target.matches('.archive-file-row') && event.key === 'Enter') {
      event.preventDefault(); selectArchiveDetails(event.target.dataset.archiveId, true);
    }
  };
  $('#archiveDetailsClose').onclick = () => closeArchiveDetails();
  $('#archiveView').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.matches('input,textarea,select')) return;
    if (!$('#archiveDetails').hidden) { event.preventDefault(); closeArchiveDetails(); }
    else if (!$('#archiveReader').hidden) { event.preventDefault(); closeArchiveReader(); }
  });
  $('#archiveDetailsContent').onclick = event => {
    const button = event.target.closest('[data-detail-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.detailId;
    if (button.dataset.detailAction === 'open') openArchiveReader(id);
    if (button.dataset.detailAction === 'edit') openEditorForArchive(id);
    if (button.dataset.detailAction === 'delete') void removeArchive(id, button);
    if (button.dataset.detailAction === 'restore') void restoreArchive(id, button);
    if (button.dataset.detailAction === 'sync') openArchiveSyncPanel();
    if (button.dataset.detailAction === 'export') exportArchives(archiveVisibleRecords.filter(record => String(record.id) === id));
    if (button.dataset.detailAction === 'rename') {
      const titleNode = [...$('#archiveDates').querySelectorAll('[data-rename-archive-id]')].find(node => node.dataset.renameArchiveId === id);
      beginArchiveRename(titleNode);
      titleNode?.closest('.archive-file-row')?.scrollIntoView({ block: 'nearest' });
    }
  };
  $('#archiveNewTextBtn').onclick = async () => {
    if (documentSaveBusy) return;
    if (editorIsEditable() && editorText().trim() && !await confirmAction('当前编辑器仍有内容。新建将清空当前编辑器，不会删除历史全文或独立词卡。继续新建？', { title: '新建文本', confirmLabel: '新建' })) return;
    await activateView('editor');
    startNewText();
    save();
  };
  $('#refreshArchives').onclick = refreshArchives;

  // ── 从选区提取原句 ────────────────────────────────
  function defaultDocumentTitle(language) {
    return language === 'ja' ? '日语文本' : language === 'en' ? '英语文本' : '荷兰语文本';
  }

  function applyLanguageUI() {
    setInterfaceLanguageTheme(state.currentLanguage);
    document.querySelectorAll('[data-language]').forEach(input => {
      const active = input.dataset.language === state.currentLanguage;
      input.checked = active;
      input.classList.toggle('active', active);
    });
    $('#editorLanguageLabel').textContent = languageName(state.currentLanguage);
    document.querySelectorAll('[data-card-language]').forEach(button => button.classList.toggle('active', button.dataset.cardLanguage === state.cardLanguage));
    $('#docTitle').placeholder = defaultDocumentTitle(state.currentLanguage);
    editor.dataset.placeholder = state.currentLanguage === 'ja'
      ? '点击这里粘贴日语文本。\n\n选中单词或短语，即可加入你的日语 Collection。'
      : state.currentLanguage === 'en'
        ? '点击这里粘贴英语 transcript。\n\n选中一个词或短语，即可加入你的英语 Collection。'
        : '点击这里粘贴荷兰语 transcript。\n\n选中一个词或短语，即可加入你的荷兰语 Collection。';
    editorAdapter.refreshPlaceholder();
    $('#japaneseAnalyzer').hidden = state.currentLanguage !== 'ja';
    $('#japaneseAnalyzerBody').hidden = !state.japaneseAnalyzerOpen;
    $('#toggleJapaneseAnalyzer').textContent = state.japaneseAnalyzerOpen ? '收起' : '展开';
  }

  document.querySelectorAll('[data-language]').forEach(input => {
    input.onchange = () => {
      const previousLanguage = state.currentLanguage;
      const currentTitle = $('#docTitle').value.trim();
      state.currentLanguage = input.dataset.language;
      state.cardLanguage = state.currentLanguage;
      const previousTranscriptTitle = previousLanguage === 'ja' ? '日语 transcript' : previousLanguage === 'en' ? '英语 transcript' : '荷兰语 transcript';
      if (!currentTitle || currentTitle === defaultDocumentTitle(previousLanguage) || currentTitle === previousTranscriptTitle) {
        $('#docTitle').value = defaultDocumentTitle(state.currentLanguage);
      }
      applyLanguageUI();
      input.closest('details')?.removeAttribute('open');
      save();
      render();
    };
  });
  document.querySelectorAll('[data-card-language]').forEach(button => {
    button.onclick = () => {
      state.cardLanguage = button.dataset.cardLanguage;
      applyLanguageUI();
      render();
    };
  });
  document.querySelectorAll('input[name="reviewMode"]').forEach(input => {
    input.checked = input.value === state.reviewMode;
    input.onchange = () => {
      state.reviewMode = input.value;
      save();
      render();
    };
  });

  // ── 可隐藏富文本工具栏 ───────────────────────────
  document.addEventListener('selectionchange', () => {
    const selection = getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
      editorAdapter.rememberDOMSelection(selection);
      const selected = selection.toString().trim();
      if (selected && $('#assistantSelection')) $('#assistantSelection').textContent = selected;
    }
  });

  function renderEditorTools() {
    $('#editorTools').hidden = state.editorMode === 'read';
  }

  $('#editorModeToggle').onclick = () => {
    state.editorMode = state.editorMode === 'read' ? 'edit' : 'read';
    applyEditorMode();
    save();
  };
  $('#closeLanguageAssistant').onclick = () => { state.languageAssistantOpen = false; applyLanguageAssistantState(); save(); };

  function runEditorCommand(command, value = null) {
    if (!editorIsEditable()) { notify('请先新建或打开一篇文本。'); return; }
    editorAdapter.rememberSelection();
    if (command === 'createLink') editorAdapter.setLink(value);
    else if (command === 'insertHorizontalRule') editorAdapter.insertHorizontalRule();
    else if (command === 'hiliteColor') editorAdapter.toggleHighlight(value);
    else if (command === 'insertHTML') editorAdapter.insertTable();
    else editorAdapter.run(command);
    save();
  }

  document.querySelectorAll('[data-editor-command]').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => { runEditorCommand(button.dataset.editorCommand); button.closest('details')?.removeAttribute('open'); };
  });
  document.querySelectorAll('[data-highlight-color]').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      if (!editorIsEditable()) return notify('请先切换到编辑模式。');
      editorAdapter.toggleHighlight(button.dataset.highlightColor);
      button.closest('details')?.removeAttribute('open');
      save();
    };
  });
  document.querySelectorAll('[data-editor-format]').forEach(select => select.onchange = () => {
    if (!editorIsEditable()) return notify('请先新建或打开一篇文本。');
    editorAdapter.setBlock(select.value);
    save();
  });
  document.querySelectorAll('[data-editor-block]').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      if (!editorIsEditable()) notify('请先新建或打开一篇文本。');
      else { editorAdapter.setBlock(button.dataset.editorBlock); save(); }
      button.closest('details')?.removeAttribute('open');
    };
  });
  document.querySelectorAll('[data-editor-action]').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      const action = button.dataset.editorAction;
      if (action === 'link') {
        const url = prompt('输入链接地址（https://…）');
        if (!url) return;
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
          runEditorCommand('createLink', parsed.href);
        } catch { notify('请输入有效的 http 或 https 链接。'); }
      }
      if (action === 'divider') runEditorCommand('insertHorizontalRule');
      if (action === 'highlight') runEditorCommand('hiliteColor', '#fbe6a9');
      if (action === 'table') runEditorCommand('insertHTML', '<table><tbody><tr><td>内容</td><td>内容</td></tr><tr><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>');
      button.closest('details')?.removeAttribute('open');
    };
  });

  // ── 从选区提取原句 ────────────────────────────────
  function sentenceForRange(r) {
    try {
      const node = r.commonAncestorContainer.nodeType === 1
        ? r.commonAncestorContainer
        : r.commonAncestorContainer.parentElement;
      const block = node?.closest('p,li,blockquote') || editor;

      const beforeRange = r.cloneRange(), afterRange = r.cloneRange();
      beforeRange.selectNodeContents(block);
      beforeRange.setEnd(r.startContainer, r.startOffset);
      afterRange.selectNodeContents(block);
      afterRange.setStart(r.endContainer, r.endOffset);

      const before = beforeRange.toString();
      const selected = r.toString();
      const full = before + selected + afterRange.toString();

      const cut = Math.max(
        before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'),
        before.lastIndexOf('。'), before.lastIndexOf('！'), before.lastIndexOf('？')
      ) + 1;

      const rest = full.slice(before.length + selected.length);
      const endMatch = rest.match(/[.!?。！？]/);
      const end = endMatch
        ? before.length + selected.length + endMatch.index + 1
        : full.length;

      return full.slice(cut, end).replace(/\s+/g, ' ').trim() || selected.trim();
    } catch {
      return r.toString().trim();
    }
  }

  // ── 选中弹出菜单 ──────────────────────────────────
  function showPop() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    range = sel.getRangeAt(0).cloneRange();
    editorAdapter.rememberDOMSelection(sel);
    if ($('#assistantSelection')) $('#assistantSelection').textContent = sel.toString().trim();
    const r = range.getBoundingClientRect();
    $('#addJapaneseReading').hidden = state.currentLanguage !== 'ja';
    pop.style.display = 'flex';
    pop.style.left = Math.min(innerWidth - 230, Math.max(8, r.left + r.width / 2 - 90)) + 'px';
    pop.style.top = Math.max(8, r.top - 46) + 'px';
  }

  function closePop() { pop.style.display = 'none'; getSelection().removeAllRanges(); }

  editor.addEventListener('mouseup', () => setTimeout(showPop, 0));
  editor.addEventListener('keyup', e => {
    if (e.key === 'Shift' || e.key.startsWith('Arrow')) setTimeout(showPop, 0);
    save();
  });
  editor.addEventListener('input', save);

  // ── YouTube 视频 ──────────────────────────────────
  $('#playYoutube').onclick = () => setVideoUrl($('#youtubeUrl').value);
  $('#removeVideo').onclick = () => { state.videoUrl = ''; save(); renderVideo(); };
  $('#youtubeUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setVideoUrl(e.currentTarget.value);
    }
  });
  $('#detectYoutube').onclick = () => {
    const url = firstYoutubeUrl(editorText());
    if (!url) {
      notify('当前 transcript 中没有识别到 YouTube 链接。');
      return;
    }
    setVideoUrl(url);
  };

  // ── 日语句子解析器（数据结构兼容 japanese-analyzer） ──
  $('#toggleJapaneseAnalyzer').onclick = () => {
    state.japaneseAnalyzerOpen = !state.japaneseAnalyzerOpen;
    save();
    applyLanguageUI();
  };

  $('#useJapaneseSelection').onclick = () => {
    const selected = getSelection()?.toString().trim() || range?.toString().trim() || '';
    if (!selected) {
      $('#japaneseAnalyzerStatus').textContent = '请先在正文中选中一个日语句子。';
      return;
    }
    $('#japaneseAnalyzerText').value = selected;
    $('#japaneseAnalyzerStatus').textContent = '已带入正文选区。';
  };

  function renderJapaneseAnalysis() {
    if (!japaneseAnalysis) return;
    const showFurigana = $('#showJapaneseFurigana').checked;
    const showRomaji = $('#showJapaneseRomaji').checked;
    $('#japaneseTranslation').textContent = japaneseAnalysis.translation ? '整句：' + japaneseAnalysis.translation : '';
    $('#japaneseTokens').innerHTML = japaneseAnalysis.tokens.map((token, index) => {
      const symbol = token.pos === '記号' || token.pos === '改行';
      const word = esc(token.word || '');
      const display = showFurigana && token.furigana
        ? `<ruby>${word}<rt>${esc(token.furigana)}</rt></ruby>` : word;
      return `<button class="ja-token${symbol ? ' symbol' : ''}${index === selectedJapaneseTokenIndex ? ' active' : ''}" type="button" data-ja-token="${index}" ${symbol ? 'disabled' : ''}>${display}${showRomaji && token.romaji ? `<span class="ja-token-romaji">${esc(token.romaji)}</span>` : ''}${symbol ? '' : `<span class="ja-token-pos">${esc(token.pos || '')}</span>`}</button>`;
    }).join('');
    $('#japaneseAnalysisResult').hidden = false;
  }

  $('#showJapaneseFurigana').onchange = renderJapaneseAnalysis;
  $('#showJapaneseRomaji').onchange = renderJapaneseAnalysis;

  $('#analyzeJapanese').onclick = async () => {
    const text = $('#japaneseAnalyzerText').value.trim();
    if (!text) { $('#japaneseAnalyzerStatus').textContent = '请输入需要解析的日语句子。'; return; }
    if (!isApiOnline()) { $('#japaneseAnalyzerStatus').textContent = '请先连接 Cloudflare Worker。'; return; }
    const button = $('#analyzeJapanese');
    button.disabled = true;
    button.textContent = '解析中…';
    $('#japaneseAnalyzerStatus').textContent = '正在分析分词、读音和词性…';
    $('#japaneseWordDetail').hidden = true;
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/japanese/analyze'), {
        method: 'POST', headers: apiHeaders(), credentials: 'include', body: JSON.stringify({ text })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '日语解析暂时不可用。');
      if (!Array.isArray(data.tokens) || !data.tokens.length) throw new Error('没有收到有效的分词结果。');
      japaneseAnalysis = { sentence: text, tokens: data.tokens, translation: data.translation || '' };
      selectedJapaneseTokenIndex = -1;
      renderJapaneseAnalysis();
      $('#japaneseAnalyzerStatus').textContent = '完成。点击词语查看详情。';
    } catch (error) {
      $('#japaneseAnalyzerStatus').textContent = error.message || '日语解析暂时不可用。';
    } finally {
      button.disabled = false;
      button.textContent = '解析';
    }
  };

  $('#japaneseTokens').onclick = async event => {
    const button = event.target.closest('[data-ja-token]');
    if (!button || !japaneseAnalysis) return;
    const index = Number(button.dataset.jaToken);
    const token = japaneseAnalysis.tokens[index];
    if (!token) return;
    selectedJapaneseTokenIndex = index;
    renderJapaneseAnalysis();
    const detail = $('#japaneseWordDetail');
    detail.hidden = false;
    detail.innerHTML = '<p>正在查询词语详情…</p>';
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/japanese/word-detail'), {
        method: 'POST', headers: apiHeaders(), credentials: 'include', body: JSON.stringify({ word: token.word, sentence: japaneseAnalysis.sentence })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '词语详情暂时不可用。');
      japaneseAnalysis.tokens[index].detail = data;
      const meta = [data.furigana, data.romaji, data.pos, data.dictionaryForm && data.dictionaryForm !== data.originalWord ? '原形：' + data.dictionaryForm : ''].filter(Boolean).join(' · ');
      detail.innerHTML = `<h3>${esc(data.originalWord || token.word)}</h3><div class="ja-word-meta">${esc(meta)}</div><p><strong>${esc(data.chineseTranslation || '暂无释义')}</strong></p><p>${esc(data.explanation || '')}</p><div class="ja-word-actions"><button class="btn primary" id="saveJapaneseWord" type="button">加入词卡</button><button class="btn" id="speakJapaneseWord" type="button">朗读词语</button></div>`;
      $('#saveJapaneseWord').onclick = () => saveJapaneseWordCard(index);
      $('#speakJapaneseWord').onclick = event => speakSentence(data.originalWord || token.word, event.currentTarget, 'ja');
    } catch (error) {
      detail.innerHTML = `<p>${esc(error.message || '词语详情暂时不可用。')}</p>`;
    }
  };

  async function saveJapaneseWordCard(index) {
    const token = japaneseAnalysis?.tokens?.[index];
    const detail = token?.detail;
    if (!token || !detail) return;
    const id = crypto.randomUUID();
    const note = [
      detail.furigana && `读音：${detail.furigana}`,
      detail.romaji && `罗马字：${detail.romaji}`,
      detail.pos && `词性：${detail.pos}`,
      detail.dictionaryForm && `原形：${detail.dictionaryForm}`,
      detail.explanation && `说明：${detail.explanation}`,
    ].filter(Boolean).join('\n');
    const card = { id, text: detail.originalWord || token.word, sentence: japaneseAnalysis.sentence, meaning: detail.chineseTranslation || '', note, level: 0, language: 'ja', next_review: new Date().toISOString(), created_at: new Date().toISOString() };
    if (!await pushCardToCloud(card)) return;
    save();
    render();
    $('#japaneseAnalyzerStatus').textContent = `“${card.text}”已加入日语词卡。`;
    const button = $('#saveJapaneseWord');
    if (button) { button.disabled = true; button.textContent = '已加入词卡'; }
  }

  // ── 日语选中读音 ──────────────────────────────────
  $('#addJapaneseReading').onclick = async () => {
    const text = range?.toString().trim();
    if (state.currentLanguage !== 'ja' || !text) return;
    if (!isApiOnline()) {
      notify('请先在“云端设置”中连接后端，才能生成日语读音。');
      return;
    }

    const button = $('#addJapaneseReading');
    button.disabled = true;
    button.textContent = '正在添加…';
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/japanese/reading'), {
        method: 'POST', headers: apiHeaders(), credentials: 'include', body: JSON.stringify({ text })
      });
      if (!response.ok) {
        let message = '日语读音暂时不可用。';
        try { message = (await response.json()).error || message; } catch {}
        throw new Error(message);
      }
      const { reading, pitch } = await response.json();
      if (!reading) throw new Error('未收到有效读音。');
      const readingNode = document.createElement('span');
      readingNode.className = 'ja-reading';
      readingNode.textContent = `（${reading}[${Number.isFinite(Number(pitch)) ? Number(pitch) : 0}]）`;
      range.collapse(false);
      range.insertNode(readingNode);
      save();
      closePop();
    } catch (error) {
      notify(error.message || '日语读音暂时不可用。');
    } finally {
      button.disabled = false;
      button.textContent = '＋ 添加读音';
    }
  };

  // ── 弹出菜单按钮 ──────────────────────────────────
  $('#speakSelection').onclick = () => {
    const text = range?.toString().trim();
    if (!text) return;
    pop.style.display = 'none';
    speakSentence(text, $('#speakSelection'), state.currentLanguage);
  };
  $('#closePop').onclick = closePop;

  // ── GPT 设置 ──────────────────────────────────────
  $('#gptSettings').onclick = () => {
    $('#proxyUrl').value = proxyUrl || defaultGptProxyUrl;
    $('#gptDialog').showModal();
  };
  $('#saveGptSettings').onclick = e => {
    e.preventDefault();
    proxyUrl = $('#proxyUrl').value.trim().replace(/\/$/, '');
    if (!proxyUrl) { $('#proxyUrl').focus(); return; }
    localStorage.setItem(gptKey, proxyUrl);
    $('#gptDialog').close();
  };

  // ── GPT 翻译 ──────────────────────────────────────
  $('#translateBtn').onclick = async () => {
    const text = range?.toString().trim();
    if (!text) return;
    if (!proxyUrl) { $('#proxyUrl').value = ''; $('#gptDialog').showModal(); return; }
    pop.style.display = 'none';
    $('#dialogTitle').textContent = 'GPT 正在翻译';
    $('#selectedText').textContent = '「' + text + '」';
    $('#gptResult').hidden = false;
    $('#gptResult').innerHTML = '<strong>正在生成双语释义与语法分析…</strong><p>请稍候</p>';
    const prefersEnglishMeaning = state.currentLanguage === 'nl';
    $('#meaningLabel').textContent = prefersEnglishMeaning ? '英语释义（可选）' : '中文释义（可选）';
    $('#meaning').placeholder = prefersEnglishMeaning ? '优先保存英语释义…' : '优先保存中文释义…';
    $('#meaning').value = '';
    $('#note').value = '';
    dialog.showModal();

    try {
      const mode = /\s/.test(text) ? 'phrase' : 'word';
      const res = await fetch(apiRequestUrl(proxyUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text,
          sentence: sentenceForRange(range),
          mode,
          source_language: state.currentLanguage === 'ja' ? 'Japanese' : state.currentLanguage === 'en' ? 'English' : 'Dutch',
          target_languages: ['English', 'Chinese'],
          instruction: `Translate the selected ${state.currentLanguage === 'ja' ? 'Japanese' : state.currentLanguage === 'en' ? 'English' : 'Dutch'} text. Analyze the key grammar of its full sentence context in Chinese, and explain the selected text's role in that sentence.`,
          language: state.currentLanguage,
        })
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || ('翻译服务返回 ' + res.status));
      }
      const data = await res.json();
      let translated = data;
      if (typeof data.output_text === 'string') {
        translated = JSON.parse(data.output_text.replace(/^```json\s*|\s*```$/g, ''));
      }
      const english = translated.english || translated.en || '';
      const chinese = translated.chinese || translated.zh || '';
      const grammar = translated.grammar || translated.grammar_analysis || '';
      if (!english && !chinese) throw new Error('未收到可用翻译');
      $('#dialogTitle').textContent = 'GPT 翻译与语法';
      $('#gptResult').innerHTML =
        '<strong>English</strong><p>' + esc(english || '暂无') + '</p>' +
        '<strong>中文</strong><p>' + esc(chinese || '暂无') + '</p>' +
        '<strong>重点语法</strong><p>' + esc(grammar || '暂无额外语法说明。') + '</p>';
      $('#meaning').value = prefersEnglishMeaning ? (english || chinese) : (chinese || english);
      $('#note').value = [
        prefersEnglishMeaning ? (chinese && ('中文：' + chinese)) : (english && ('English: ' + english)),
        grammar && ('语法：' + grammar)
      ].filter(Boolean).join('\n');
    } catch (err) {
      $('#dialogTitle').textContent = 'GPT 翻译未完成';
      $('#gptResult').innerHTML =
        '<strong>翻译暂未完成</strong><p>' + esc(err.message) + '。可稍后重试；若持续出现，请检查后端 Worker 日志与 DeepSeek 额度。</p>';
    }
  };

  // ── 添加卡片（含云端同步）──────────────────────────
  $('#addItem').onclick = async e => {
    e.preventDefault();
    if (!range) return;
    const text = range.toString().trim();
    if (!text) return;

    const sentence = sentenceForRange(range);
    const id = crypto.randomUUID();
    const card = {
      id,
      text,
      sentence,
      meaning: $('#meaning').value.trim(),
      note: $('#note').value.trim(),
      level: 0,
      language: state.currentLanguage,
      next_review: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (!await pushCardToCloud(card)) return;
    // 词卡持久化后才修改正文高亮及关闭输入。
    const span = document.createElement('span');
    span.className = 'hl-phrase';
    span.dataset.item = id;
    try {
      range.surroundContents(span);
      span.textContent = text;
    } catch {
      const fragment = range.extractContents();
      span.append(fragment);
      range.insertNode(span);
    }

    save();
    render();
    dialog.close();
  };

  // ── Collection：朗读句子与删除卡片 ─────────────────
  $('#collectionList').onclick = async e => {
    const speakButton = e.target.closest('[data-speak]');
    if (speakButton) {
      const card = state.items.find(item => item.id === speakButton.dataset.speak);
      if (card) speakSentence(card.sentence || '', speakButton, card.language || 'nl');
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;
    const cardToDelete = state.items.find(item => String(item.id) === String(id));
    if (!cardToDelete || !editableSyncRecord('card', id, cardToDelete) || !await confirmAction(`删除词卡“${cardToDelete.text}”？`, { title: '删除词卡', confirmLabel: '删除' })) return;
    snapshotBackup('before-delete-card');

    if (!await deleteFromCloud(id)) return;
    editor.querySelectorAll(`[data-item="${CSS.escape(String(id))}"]`).forEach(node => node.replaceWith(...node.childNodes));
    save();
    render();
  };

  // ── 保存、清空、导出 ─────────────────────────────
  $('#saveAsNewBtn').onclick = () => saveCurrentDocument('new');
  $('#updateHistoryBtn').onclick = () => saveCurrentDocument('update');
  editor.addEventListener('click', event => {
    if (event.target.closest('#newTextBtn')) startNewText();
  });
  $('#documentDate').onchange = () => {
    state.documentDate = $('#documentDate').value;
    save();
  };
  $('#docTitle').addEventListener('input', save);

  if ($('#clearDoc')) $('#clearDoc').onclick = async () => {
    if (await confirmAction('清空当前编辑区？未保存内容将丢失，已收集词卡不会删除。', { title: '清空编辑区', confirmLabel: '清空' })) {
      snapshotBackup('before-clear-editor');
      clearCurrentEditor(); save(); render();
    }
  };

  if ($('#clearAll')) $('#clearAll').onclick = async () => {
    if (!await confirmAction('清空全部词卡？此操作也会从云端删除所有卡片。', { title: '清空词卡', confirmLabel: '全部删除' })) return;
    snapshotBackup('before-clear-cards');
    const cards = [...state.items];
    if (cards.some(item => !editableSyncRecord('card', item.id, item))) return;
    for (const item of cards) {
      if (!await deleteFromCloud(item.id)) return;
    }
    editor.querySelectorAll('.hl-word,.hl-phrase').forEach(n => n.replaceWith(...n.childNodes));
    save();
    render();
  };

  $('#exportCards').onclick = () => {
    const fields = ['text', 'sentence', 'meaning', 'note', 'level', 'next_review', 'created_at'];
    const quote = value => '"' + String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    const csv = [fields.join(','), ...state.items.map(card => fields.map(field => quote(card[field])).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dutch-collection-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── 手动同步按钮 ──────────────────────────────────
  if ($('#syncNow')) $('#syncNow').onclick = () => pushAllToCloud({ announce: true });

  // ── 云端 API 设置对话框 ───────────────────────────
  $('#apiSettings').onclick = () => {
    $('#apiBaseUrl').value = apiConfig.baseUrl || defaultApiBaseUrl;
    $('#apiDialog').showModal();
  };

  async function connectApiAt(baseUrl) {
    baseUrl = normalizeScope(baseUrl);
    try {
      if (!['http:', 'https:'].includes(new URL(baseUrl).protocol)) throw new Error('请输入有效的 HTTP(S) Worker 地址。');
      const switching = baseUrl !== activeScope;
      if (switching) {
        if (!$('#resourceComposer').hidden || $('#reviewCardDialog').open || settingsDirtyRows.size) {
          notify('请先保存或取消尚未保存的资源、词卡及设置输入，再切换服务器。');
          return false;
        }
        if (!await confirmAction('切换云端将重新载入页面。当前草稿与未同步修改会保留，不会自动复制到新云端。', { title: '切换云端', confirmLabel: '切换' })) return false;
        if (!save()) return false;
      }
      const sessionRes = await fetch(apiRequestUrl(baseUrl + '/api/session'), {
        method: 'GET', credentials: 'include', redirect: 'manual', cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!sessionRes.ok || sessionRes.redirected || !/application\/json/i.test(sessionRes.headers.get('content-type') || '')) {
        throw new Error('请先在 Worker 地址完成 Cloudflare Access 登录，再返回这里重试。');
      }
      const session = await sessionRes.json();
      if (!session.authenticated || typeof session.email !== 'string' || !session.email) {
        throw new Error('Cloudflare Access 会话无效，请重新登录。');
      }
      stopSyncNetwork();
      if (syncBusy && engine) await engine.sync();
      apiConfig = { baseUrl, email: session.email };
      localStorage.setItem(apiKey, JSON.stringify(apiConfig));
      localStorage.setItem(scopeKey, baseUrl);
      if (switching) {
        activeScope = baseUrl;
        syncInitialized = false;
        document.body.inert = true;
        location.reload();
        return true;
      }
      return await connectAndSync();
    } catch (error) {
      syncFailure = '连接未完成';
      notify(error?.message || '暂未连上云端，请检查连接设置后重试。本机内容已保留。', 'error');
      updateSyncIndicator();
      return false;
    }
  }

  $('#connectApi').onclick = async e => {
    e.preventDefault();
    const baseUrl = $('#apiBaseUrl').value.trim().replace(/\/$/, '');
    if (!baseUrl) { $('#apiBaseUrl').focus(); return; }
    if (await connectApiAt(baseUrl)) $('#apiDialog').close();
  };

  $('#quickConnectServices').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在连接…';
    proxyUrl = defaultGptProxyUrl;
    localStorage.setItem(gptKey, proxyUrl);
    const ok = await connectApiAt(defaultApiBaseUrl);
    button.disabled = false;
    button.textContent = ok ? '已连接云端和 GPT' : '重新连接';
  };

  $('#disconnectApi').onclick = e => {
    e.preventDefault();
    stopSyncNetwork();
    localStorage.setItem(scopeKey, activeScope);
    apiConfig = { baseUrl: '', email: '' };
    localStorage.removeItem(apiKey);
    sessionStorage.removeItem(apiKey);
    updateSyncIndicator();
    $('#apiDialog').close();
  };

  // ── 设置页面：复习间隔与音频速度 ───────────────────
  function populateSettingsForm() {
    $('#intervalInput').value = state.reviewIntervals.join(', ');
    $('#intervalPreview').textContent = intervalSummary();
    $('#audioSpeed').value = String(state.audioSpeed);
    $('#quickConnectServices').textContent = isApiOnline() && proxyUrl ? '云端和翻译已配置' : '一键连接云端和 GPT';
    const backup = JSON.parse(localStorage.getItem(backupKey) || 'null');
    $('#backupStatus').textContent = backup?.savedAt
      ? `最近备份：${new Intl.DateTimeFormat(state.displayLanguage === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.savedAt))}`
      : '尚未创建本地备份。';
  }
  $('#intervalInput').oninput = () => {
    const parsed = parseIntervals($('#intervalInput').value);
    $('#intervalPreview').textContent = parsed ? intervalSummary(parsed) : '请输入从小到大的正整数，例如：1, 2, 4, 7, 15, 30, 60';
  };
  $('#resetLearningSettings').onclick = () => {
    $('#intervalInput').value = defaultIntervals.join(', ');
    $('#intervalPreview').textContent = intervalSummary(defaultIntervals);
    $('#audioSpeed').value = '1';
  };
  $('#saveLearningSettings').onclick = () => {
    const parsed = parseIntervals($('#intervalInput').value);
    if (!parsed) {
      $('#intervalInput').focus();
      $('#intervalPreview').textContent = '格式不正确：请使用从小到大的正整数，例如：1, 2, 4, 7。';
      return;
    }
    state.reviewIntervals = parsed;
    state.audioSpeed = Number($('#audioSpeed').value);
    save();
    render();
    $('#intervalPreview').textContent = '已保存：' + intervalSummary();
  };
  function downloadJson(payload, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    link.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function exportFullBackup() {
    if (!engine) return notify('同步存储未就绪，请先保留浏览器本机数据。', 'error');
    downloadJson({
      version: 3,
      savedAt: new Date().toISOString(),
      scope: activeScope,
      state: { ...state, html: editorHTML(), title: $('#docTitle').value },
      sync: engine.exportBackup(),
      ...(collectionsSyncClient() ? { collectionsSync: collectionsSyncClient().exportBackup() } : {}),
      migration,
    }, 'notebook-backup-v3');
  }
  $('#downloadBackup').onclick = exportFullBackup;
  $('#exportSyncBackup').onclick = exportFullBackup;
  $('#restoreBackup').onclick = async () => {
    const input = $('#backupFile'), file = input.files[0];
    if (!file) { input.click(); return; }
    if (syncPanelBusy || !engine || !syncInitialized) return;
    const instance = engine, scope = activeScope;
    syncPanelBusy = true;
    $('#restoreBackup').disabled = true;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('备份超过 50 MB，请先拆分或保留原文件');
      const payload = JSON.parse(await file.text());
      const scopes = [payload?.scope, payload?.sync?.scope, payload?.collectionsSync?.scope, payload?.state?.scope]
        .filter(value => typeof value === 'string' && value);
      const different = !scopes.length || scopes.some(value => normalizeScope(value) !== scope);
      const message = different
        ? '这份备份来自其他云端服务。读取后，你可以逐项确认是否添加为独立内容；不会覆盖现有内容。'
        : '先读取并保留备份，再由你确认要使用的内容。不会自动上传，也不会覆盖正在编辑的草稿。';
      if (!await confirmAction(message, { title: '从文件恢复', confirmLabel: '读取备份' })) return;
      if (engine !== instance || activeScope !== scope) return;
      // 只有 active Collections 才拆分恢复。retired/recovery 客户端不承载当前
      // Resources UI；此时整份备份必须进入 Notebook 引擎，配置才可见且可导入。
      const collectionInstance = collectionsEngine;
      const result = await instance.stageBackup(payload, {
        allowDifferentScope: different,
        ...(collectionInstance ? {
          entities: ['card', 'document'],
          includeSettings: false,
          includeDrafts: true,
        } : {}),
      });
      let collectionsResult = null;
      if (collectionInstance) {
        const collectionsPayload = payload.collectionsSync
          ? { version: payload.version, scope: payload.scope, sync: payload.collectionsSync, state: payload.state }
          : payload;
        collectionsResult = await collectionInstance.stageBackup(collectionsPayload, {
          allowDifferentScope: different,
          entities: ['resource'],
          includeSettings: true,
          includeDrafts: false,
        });
      }
      input.value = '';
      applySyncProjection();
      const added = result.added + (collectionsResult?.added || 0);
      $('#backupRestoreStatus').textContent = result.duplicate && (!collectionsResult || collectionsResult.duplicate)
        ? '这份备份已经保留，没有重复添加。'
        : `备份已保留，${added ? `有${added}项需要确认` : '没有新增需要确认的内容'}。请在“备份与已删除内容”中查看。${result.drafts ? '草稿也已保留，可单独下载。' : ''}`;
    } catch (error) {
      $('#backupRestoreStatus').textContent = error instanceof SyntaxError ? '无法读取这份备份，请确认选择了本应用的备份文件。文件选择和现有内容已保留。' : '恢复未完成，请检查备份文件后重试。文件选择和现有内容已保留。';
      notify($('#backupRestoreStatus').textContent, 'error');
    } finally { syncPanelBusy = false; $('#restoreBackup').disabled = false; renderSyncPanel(); }
  };
  $('#backupFile').onchange = () => { if ($('#backupFile').files.length) void $('#restoreBackup').onclick(); };
  $('#syncPanelFlush').onclick = () => pushAllToCloud({ announce: true });

  function legacySettingsPanel() {
    const active = resourceEngine();
    const sources = [
      { instance: active, engineKey: collectionsEngine ? 'collections' : 'notebook' },
      ...(collectionsRecoveryEngine && collectionsRecoveryEngine !== active
        ? [{ instance: collectionsRecoveryEngine, engineKey: 'collections' }]
        : []),
    ];
    return sources.flatMap(({ instance, engineKey }) => {
      const current = instance.view('settings').find(item => item.id === 'resources') ||
        { languages: [], groups: [], types: [], tags: [], decks: [] };
      return instance.settingsSources().map(source => {
      const lists = ['languages', 'groups', 'types', 'tags', 'decks'].map(key => {
        const noun = { languages: '语言', groups: '旧分组', types: '类型', tags: '标签', decks: '收藏册' }[key];
        const rows = (source.settings[key] || []).map((item, index) => {
          const exists = (current[key] || []).find(value => value.id === item.id) || (current[key] || []).find(value => value.name === item.name);
          const invalid = typeof item.name !== 'string' || !item.name.trim() || key === 'languages' && item.name === '不限语言';
          const inputKey = `${source.id}:${key}:${index}`;
          return `<div><label><input type="checkbox" data-legacy-kind="${key}" data-legacy-id="${esc(item.id)}" data-input-key="${esc(inputKey)}" ${exists || invalid ? 'disabled' : ''}>${noun}：<span data-archive-user-content>${esc(item.name ?? '无名称')}</span></label>${exists ? `<p>已存在“${esc(exists.name)}”，保留当前命名，不覆盖。</p>` : invalid ? '<p>原值已备份，请到资源设置手动创建有效名称。</p>' : ''}</div>`;
        }).join('');
        const removals = (source.removals?.[key] || []).map((item, index) => {
          const exists = (current[key] || []).find(value => value.id === item.id);
          const removable = exists && !source.asCopy;
          const inputKey = `${source.id}:remove:${key}:${index}`;
          const note = source.asCopy
            ? '来自其他云端，只保留删除记录，不会删除当前配置。'
            : exists
              ? '勾选后会按同一稳定 ID 显式移除；仍被资源引用时会安全停止。'
              : '当前同一 ID 已不存在，不需要再次移除。';
          return `<div><label><input type="checkbox" data-legacy-remove-kind="${key}" data-legacy-remove-id="${esc(item.id)}" data-input-key="${esc(inputKey)}" ${removable ? '' : 'disabled'}>恢复移除${noun}：<span data-archive-user-content>${esc(item.name)}</span></label><p>${note}</p></div>`;
        }).join('');
        return `<h4>旧${noun}</h4>${rows || '<p>无待添加项</p>'}${removals}`;
      }).join('');
        return `<details data-panel-key="${engineKey}:settings:${esc(source.id)}" data-settings-source="${esc(source.id)}" data-sync-engine="${engineKey}"><summary>${source.id === 'legacy' ? '找回本机的资源配置' : '找回备份中的资源配置'}</summary><p>会记录同名项目的 ID 映射，只添加勾选的缺失项目；删除命令必须单独勾选恢复。完成同步后，就可以用于恢复资源。</p>${lists}<button class="btn" type="button" data-sync-action="import-settings" data-sync-id="${esc(source.id)}">确认映射与所选项目</button></details>`;
      });
    }).join('');
  }

  function candidateResourceMapping(candidate, backup = resourceEngine().exportBackup(), instance = resourceEngine()) {
    const confirmed = backup.base[JSON.stringify(['settings', 'resources'])];
    const config = confirmed && !confirmed.deleted ? confirmed.data : {};
    const sources = instance.settingsSources().filter(source => candidate.sourceId ? source.id.startsWith(candidate.sourceId + ':') : source.id === 'legacy');
    const match = (key, value, extraName) => {
      const valid = config[key] || [];
      const direct = valid.find(item => item.id === value);
      if (direct) return direct.id;
      const names = new Set([value, extraName, ...sources.flatMap(source => (source.settings[key] || []).filter(item => item.id === value).map(item => item.name))].filter(Boolean));
      const matches = valid.filter(item => names.has(item.name));
      return matches.length === 1 ? matches[0].id : undefined;
    };
    const data = candidate.data;
    const languageName = data.legacy_language || data.language;
    return {
      type: match('types', data.type),
      language_id: !data.language_id && (!languageName || languageName === '不限语言') ? null : match('languages', data.language_id, languageName)
    };
  }

  function collectionsSyncRecoveryHtml() {
    const instance = collectionsSyncClient();
    if (!instance) return '';
    const { candidates, conflicts, commands } = instance.details();
    const backup = instance.exportBackup();
    const label = value => esc(String(value?.data?.name || value?.name || value?.data?.title || value?.title || '未命名资源').slice(0, 100));
    const action = (name, id, text, disabled = false, entity = '') =>
      `<button class="btn" type="button" data-sync-action="${name}" data-sync-id="${esc(id)}" ${entity ? `data-sync-entity="${esc(entity)}"` : ''} ${disabled ? 'disabled' : ''}>${text}</button>`;
    const candidateRows = candidates.map(item => {
      const remote = backup.base[JSON.stringify([item.entity, item.entityId])] || null;
      if (remote && !item.asCopy) {
        return `<details data-panel-key="collections-candidate:${esc(item.id)}"><summary><span data-archive-user-content>${label(item)}</span> · 资源版本需要确认</summary><p>云端已有同一 ID 的资源。请选择保留云端版本，或在云端未删除时使用备份版本。</p><div class="settings-actions">${action('candidate-remote', item.id, '保持云端这份')}${action('candidate-local', item.id, '使用备份这份', remote.deleted)}</div></details>`;
      }
      const mapping = item.entity === 'resource' ? candidateResourceMapping(item, backup, instance) : null;
      const invalid = item.entity !== 'resource' || !mapping?.type || mapping.language_id === undefined;
      return `<details data-panel-key="collections-candidate:${esc(item.id)}"><summary><span data-archive-user-content>${label(item)}</span> · 待恢复资源</summary><p>${item.asCopy ? '这份内容来自其他云端，确认后会使用新 ID 创建副本。' : '这份内容只在备份中，确认后会保留原 ID。'}</p>${invalid ? '<p class="small">请先在资源设置中补齐对应的 Type 与 Language，再恢复。</p>' : ''}<div class="settings-actions">${action('import', item.id, item.asCopy ? '添加为副本' : '恢复到同步', invalid)}${action('discard', item.id, '暂不使用')}</div></details>`;
    }).join('');
    const conflictRows = conflicts.map(item =>
      `<details data-panel-key="collections-conflict:${esc(item.id)}"><summary><span data-archive-user-content>${label(item.local || item.remote)}</span> · 资源冲突</summary><p>本机修改和云端版本发生冲突。云端已删除时不能通过冲突处理隐式恢复。</p><div class="settings-actions">${action('remote', item.id, '保持云端这份')}${action('local', item.id, '使用本机修改', item.remote?.deleted)}</div></details>`).join('');
    const tombstones = Object.values(backup.base).filter(item => item.entity === 'resource' && item.deleted &&
      !instance.view('resource').some(row => row.id === item.id && !row._syncCandidate));
    const tombstoneRows = tombstones.map(item =>
      `<details data-panel-key="collections-deleted:${esc(item.id)}"><summary>已删除资源 · <span data-archive-user-content>${label(item)}</span></summary><p>恢复会沿用原 Resource ID、Type、Tags 与 Decks 关联。</p>${action('restore', item.id, '恢复这份资源', backup.epochChanged || conflicts.some(conflict => conflict.entityId === item.id), 'resource')}</details>`).join('');
    const commandRows = (commands || []).filter(item => item.paused).map(item =>
      `<details data-panel-key="collections-command:${esc(item.token)}"><summary>批量操作已暂停 · ${esc(item.command?.command || 'Collections')}</summary><p>${esc(item.failure?.message || '关联配置或远端状态已变化。')} 修正后可以重试；放弃只移除这条本机命令，不会删除资源。</p><div class="settings-actions">${action('retry-command', item.token, '重试命令')}${action('discard-command', item.token, '放弃命令')}</div></details>`).join('');
    if (!candidateRows && !conflictRows && !tombstoneRows && !commandRows) return '';
    return `<details class="sync-recovery" data-panel-key="collections-recovery" data-sync-engine="collections"><summary>Collections 恢复与冲突${candidates.length + conflicts.length ? ` · ${candidates.length + conflicts.length} 项待确认` : ''}</summary>${candidateRows}${conflictRows}${commandRows}${tombstoneRows}</details>`;
  }

  function renderSyncPanel() {
    updateSyncIndicator();
    if (!engine || syncPanelBusy) return;
    const { candidates, conflicts } = engine.details();
    const backup = engine.exportBackup();
    const name = data => String(data?.name || data?.title || data?.text || '未命名内容').slice(0, 100);
    const savedTime = value => {
      const data = value?.data || value;
      const raw = data?.updated_at || data?.updatedAt || value?.timestamps?.updated_at || value?.timestamps?.updatedAt ||
        data?.created_at || data?.createdAt || value?.timestamps?.created_at || value?.timestamps?.createdAt;
      const time = raw ? new Date(raw) : null;
      return time && Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat(state.displayLanguage === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(time) : '未记录';
    };
    const info = value => {
      if (!value) return '<p class="small">未找到这份内容</p>';
      const data = value.data || value;
      const text = [data.description, data.topic, data.sentence, data.meaning, data.note, data.html ? archivePlainText(data.html) : ''].filter(value => typeof value === 'string' && value.trim()).join(' · ');
      const summary = text.length > 240 ? text.slice(0, 240) + '…' : text;
      return `<div class="sync-preview"><strong data-archive-user-content>${esc(name(data))}</strong><p class="small">保存时间：${esc(savedTime(value))}${value.deleted ? ' · 已删除' : ''}</p>${summary ? `<p data-archive-user-content>${esc(summary)}</p>` : '<p class="small">暂无文字摘要</p>'}</div>`;
    };
    const confirmed = backup.base[JSON.stringify(['settings', 'resources'])];
    const config = confirmed && !confirmed.deleted ? confirmed.data : { languages: [], groups: [], types: [] };
    const configPending = !backup.ready || backup.queue.some(entry => entry.entity === 'settings');
    const panel = $('#syncPanelDetails');
    const focusedKey = panel.contains(document.activeElement) ? document.activeElement.dataset.inputKey : null;
    const inputs = new Map([...panel.querySelectorAll('[data-input-key]')].map(input => [input.dataset.inputKey, { value: input.value, checked: input.checked, label: input.selectedOptions?.[0]?.textContent }]));
    const expanded = new Set([...panel.querySelectorAll('details[open][data-panel-key]')].map(item => item.dataset.panelKey));
    const button = (action, id, label, disabled = false) => `<button class="btn" data-sync-action="${action}" data-sync-id="${esc(id)}" type="button" ${disabled ? 'disabled' : ''}>${label}</button>`;
    const renderCandidate = item => {
      const remote = backup.base[JSON.stringify([item.entity, item.entityId])] || null;
      const localLabel = item.sourceId ? '备份中的内容' : '本机这份';
      let content = `<h4>${localLabel}</h4>${info(item.data)}`;
      if (remote && !item.asCopy) {
        content += `<h4>云端这份</h4>${info(remote)}`;
        if (remote.deleted) {
          content += `<p>这项内容已删除，不会自动恢复。需要找回时，请在下方已删除内容中恢复。</p>${button('discard', item.id, '保持删除')}`;
        } else {
          content += `<p>请确认要保留哪一份，不会添加重复内容。</p><div class="settings-actions">${button('candidate-remote', item.id, '保持云端这份')}${button('candidate-local', item.id, '使用本机这份')}</div>`;
        }
      } else {
        const mapping = item.entity === 'resource' ? candidateResourceMapping(item, backup) : null;
        const unmatched = mapping && (!mapping.type || mapping.language_id === undefined || inputs.has(`${item.id}:type`) || inputs.has(`${item.id}:language`));
        const add = button('import', item.id, item.asCopy ? '添加为独立内容' : '添加到同步', !backup.ready || item.entity === 'settings' || item.entity === 'resource' && configPending);
        content += `<p>${item.sourceId ? (item.asCopy ? '来自其他云端的备份，添加后会作为独立内容保存。' : '仅在这份备份中找到，确认后才会添加。') : '仅在这台设备找到'}</p>`;
        if (unmatched) {
          content += `<details class="sync-recovery" data-panel-key="mapping:${esc(item.id)}"><summary>高级恢复</summary><p>请确认这份内容使用的类型和语言，再添加到同步。</p><label>类型<select data-candidate-type data-input-key="${esc(item.id)}:type"><option value="">请选择类型</option>${(config.types || []).map(type => `<option value="${esc(type.id)}" ${mapping.type === type.id ? 'selected' : ''}>${esc(type.name)}</option>`).join('')}</select></label><label>语言<select data-candidate-language data-input-key="${esc(item.id)}:language"><option value="">请选择语言</option><option value="__any__" ${mapping.language_id === null ? 'selected' : ''}>不限语言</option>${(config.languages || []).map(language => `<option value="${esc(language.id)}" ${mapping.language_id === language.id ? 'selected' : ''}>${esc(language.name)}</option>`).join('')}</select></label><div class="settings-actions">${button('configure', item.id, '添加语言或类型')}${add}</div></details>`;
        } else content += `<div class="settings-actions">${add}</div>`;
        if (!backup.ready) content += '<p class="small">请先连接云端，确认没有重复内容后再添加。</p>';
        else if (item.entity === 'resource' && configPending) content += '<p class="small">请先同步语言和类型，再添加这份内容。</p>';
        content += button('discard', item.id, '暂不使用');
      }
      return `<details data-panel-key="candidate:${esc(item.id)}" data-candidate-id="${esc(item.id)}"><summary><span data-archive-user-content>${esc(name(item.data))}</span> · 需要确认</summary>${content}</details>`;
    };
    const recoveryCandidate = item => !!(item.sourceId || item.asCopy || backup.base[JSON.stringify([item.entity, item.entityId])]?.deleted);
    const candidatesHtml = candidates.filter(item => !recoveryCandidate(item)).map(renderCandidate).join('');
    const backupCandidates = candidates.filter(recoveryCandidate).map(renderCandidate).join('');
    const conflictsHtml = conflicts.map(item => `<details data-panel-key="conflict:${esc(item.id)}"><summary><span data-archive-user-content>${esc(name(item.local?.data || item.remote?.data))}</span> · 需要确认</summary><h4>本机这份</h4>${info(item.local)}<h4>云端这份</h4>${info(item.remote)}<div class="settings-actions">${button('remote', item.id, '保持云端这份')}${button('local', item.id, '使用本机这份', item.remote?.deleted || backup.conflicts[item.id]?.paused || backup.conflicts[item.id]?.epoch !== backup.epoch)}</div>${item.remote?.deleted ? '<p>云端已删除，不会自动恢复。可先保持删除，再到“备份与已删除内容”找回；建议先下载完整备份。</p>' : ''}</details>`).join('');
    const tombstones = Object.values(backup.base).filter(item => item.deleted &&
      !engine.view(item.entity).some(row => row.id === item.id && !row._syncCandidate));
    const tombstonesHtml = tombstones.map(item => `<details data-panel-key="deleted:${esc(item.entity)}:${esc(item.id)}"><summary>已删除 · <span data-archive-user-content>${esc(name(item.data))}</span></summary>${info(item)}<button class="btn" type="button" data-sync-action="restore" data-sync-id="${esc(item.id)}" data-sync-entity="${esc(item.entity)}" ${backup.epochChanged || conflicts.some(conflict => conflict.entity === item.entity && conflict.entityId === item.id) ? 'disabled' : ''}>恢复这份内容</button></details>`).join('');
    const preserved = (backup.stagedBackups || []).map((item, index) => `<details data-panel-key="backup:${esc(item.id)}"><summary>保留的备份 ${index + 1}</summary>${button('export-backup', item.id, '下载原备份')}${item.drafts.length ? `<p>保留了 ${item.drafts.length} 份草稿，不会覆盖正在编辑的内容。</p>${button('export-drafts', item.id, '下载保留的草稿')}` : ''}</details>`).join('');
    const older = Object.values(backup.preservedCandidates || {}).map((item, index) => `<details data-panel-key="preserved:${index}"><summary>保留的旧版本 · <span data-archive-user-content>${esc(name(item.data))}</span></summary>${info(item)}${button('export-preserved', String(index), '下载这份备份')}</details>`).join('');
    const epochRecovery = combinedSyncStatus()?.epochChanged
      ? `<details class="sync-recovery" data-panel-key="epoch-recovery" open><summary>云端同步世代已变化</summary><p>先下载完整备份，再明确接受新的云端基线。旧队列会保留在备份中，不会静默重放。</p><button class="btn danger" type="button" data-sync-action="resolve-epoch" data-sync-engine="all">下载备份并接受新基线</button></details>`
      : '';
    panel.innerHTML = epochRecovery + candidatesHtml + conflictsHtml + collectionsSyncRecoveryHtml() + `<details class="sync-recovery" data-panel-key="recovery"><summary>备份与已删除内容${backupCandidates ? ' · 有内容需要确认' : ''}</summary><p>旧版本和已删除内容在这里查看。保存时间仅供参考，不一定是实际编辑时间。</p>${backupCandidates}${legacySettingsPanel()}${tombstonesHtml}${preserved}${older}<details data-panel-key="recovery-download"><summary>完整恢复资料</summary><p>包含保留的原始内容和同步记录，仅供下载，不会改动现有内容。</p>${button('export-recovery', '', '下载完整备份')}</details></details>`;
    for (const input of panel.querySelectorAll('[data-input-key]')) {
      const previous = inputs.get(input.dataset.inputKey);
      if (!previous) continue;
      if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === previous.value)) {
        const option = new Option(`${previous.label || '原选择'}（暂不可用）`, previous.value);
        option.disabled = true;
        input.add(option);
      }
      input.value = previous.value;
      if (input.type === 'checkbox') input.checked = previous.checked;
    }
    for (const details of panel.querySelectorAll('details[data-panel-key]')) details.open = expanded.has(details.dataset.panelKey);
    if (focusedKey) [...panel.querySelectorAll('[data-input-key]')].find(input => input.dataset.inputKey === focusedKey)?.focus({ preventScroll: true });
  }

  $('#syncPanelDetails').onclick = async event => {
    const button = event.target.closest('[data-sync-action]');
    if (!button || syncPanelBusy || !engine) return;
    const action = button.dataset.syncAction, id = button.dataset.syncId;
    const engineKey = button.dataset.syncEngine || button.closest('[data-sync-engine]')?.dataset.syncEngine || 'notebook';
    if (action === 'resolve-epoch') {
      exportFullBackup();
      if (!await confirmAction('完整备份已开始下载。确认已保存备份，并接受当前云端作为新的同步基线？', { title: '接受新同步基线', confirmLabel: '已保存备份，继续' })) return;
      syncPanelBusy = true;
      try {
        for (const current of [engine, collectionsEngine, collectionsRecoveryEngine].filter(item => item?.status().epochChanged)) {
          await current.resolveEpochChange({ backupConfirmed: true });
        }
        applySyncProjection();
        await pushAllToCloud();
      } finally { syncPanelBusy = false; renderSyncPanel(); }
      return;
    }
    const instance = engineKey === 'collections' ? collectionsSyncClient() : engine, scope = activeScope;
    if (!instance) return;
    const candidate = instance.details().candidates.find(item => item.id === id);
    if (action === 'export-recovery') { exportFullBackup(); return; }
    if (action === 'export-preserved') {
      const item = Object.values(instance.exportBackup().preservedCandidates || {})[Number(id)];
      if (item) downloadJson({ version: 2, scope: activeScope, sync: { base: {}, queue: [], candidates: { [id]: item } } }, 'notebook-preserved-content');
      return;
    }
    if (action === 'export-backup' || action === 'export-drafts') {
      const backup = instance.exportBackup().stagedBackups?.find(item => item.id === id);
      if (backup) downloadJson(action === 'export-backup' ? backup.payload : { version: 2, scope: backup.scope, drafts: backup.drafts }, action === 'export-backup' ? 'notebook-original-backup' : 'notebook-preserved-drafts');
      return;
    }
    if (action === 'configure') {
      await activateView('resource-settings');
      const language = candidate?.data.legacy_language || candidate?.data.language;
      if (language && language !== '不限语言' && !$('#newResourceLanguage').value) {
        $('#newResourceLanguage').value = language;
        settingsDirtyRows.add($('#addResourceLanguageForm'));
      }
      $('#newResourceLanguage').focus();
      return;
    }
    let mapping, selection;
    if (action === 'import') {
      if (!candidate) return notify('这份内容已处理，请查看最新状态。');
      const remote = instance.exportBackup().base[JSON.stringify([candidate.entity, candidate.entityId])];
      if (remote && !candidate.asCopy) return notify('云端已有这份内容，请选择要保留的版本。', 'error');
      if (candidate.entity === 'resource') {
        mapping = candidateResourceMapping(candidate, instance.exportBackup(), instance);
        const row = button.closest('[data-candidate-id]');
        const typeInput = row?.querySelector('[data-candidate-type]'), languageInput = row?.querySelector('[data-candidate-language]');
        if (typeInput || languageInput) {
          if (!typeInput?.value || !languageInput?.value) return notify('请在高级恢复中选择类型和语言。当前选择已保留。', 'error');
          mapping = { type: typeInput.value, language_id: languageInput.value === '__any__' ? null : languageInput.value };
        }
        if (!mapping.type || mapping.language_id === undefined) return notify('暂时找不到对应的类型或语言，请在高级恢复中选择。', 'error');
      }
    }
    if (action === 'import-settings') {
      selection = {
        languages: [], groups: [], types: [], tags: [], decks: [], typeGroups: {},
        removals: { languages: [], groups: [], types: [], tags: [], decks: [] },
      };
      const row = button.closest('[data-settings-source]');
      for (const input of row.querySelectorAll('[data-legacy-kind]:checked:not(:disabled)')) selection[input.dataset.legacyKind].push(input.dataset.legacyId);
      for (const input of row.querySelectorAll('[data-legacy-remove-kind]:checked:not(:disabled)')) {
        selection.removals[input.dataset.legacyRemoveKind].push(input.dataset.legacyRemoveId);
      }
    }
    const messages = {
      import: candidate?.asCopy ? '将这份备份添加为独立内容？不会覆盖现有内容。' : '将这份内容添加到同步，在其他设备也能使用？',
      'import-settings': '记录同名配置映射，并应用勾选的新增或删除项？仍被资源引用的删除会安全停止。',
      discard: '暂不使用这份内容？不会删除云端内容，原备份仍保留。',
      'candidate-remote': '保持云端这份？本机的旧版本会保留在备份中。',
      'candidate-local': `${candidate?.sourceId ? '使用备份中的这份内容' : '使用本机这份内容'}更新云端？不会添加重复内容，也不会恢复已删除内容。`,
      remote: '保持云端这份，并放弃这次未同步的本机修改？建议先下载完整备份。',
      local: '使用本机这份修改更新云端？只更新改过的内容，不会恢复已删除内容。',
      restore: '恢复这份已删除的内容，并同步到其他设备？'
    };
    if (action === 'retry-command' || action === 'discard-command') {
      const confirmed = await confirmAction(action === 'retry-command'
        ? '重新检查当前配置并重试这条批量命令？'
        : '放弃这条本机批量命令？资源本身不会被删除。', {
        title: action === 'retry-command' ? '重试批量命令' : '放弃批量命令',
        confirmLabel: action === 'retry-command' ? '重试' : '放弃命令',
      });
      if (!confirmed) return;
      const saved = await commitSync(client => action === 'retry-command' ? client.retryCommand(id) : client.discardCommand(id), instance);
      if (saved && action === 'retry-command') scheduleSyncFlush(instance);
      return;
    }
    if (!messages[action]) return;
    syncPanelBusy = true;
    try {
      if (!await confirmAction(messages[action], { title: '确认同步操作', confirmLabel: '确认' })) return;
      if ((engineKey === 'collections' ? collectionsSyncClient() : engine) !== instance || activeScope !== scope) return;
      await commitSync(client => {
        if (action === 'candidate-local' || action === 'candidate-remote') {
          return client.resolveCandidate(id, action === 'candidate-local' ? 'local' : 'remote');
        }
        if (action === 'import') {
          const current = client.details().candidates.find(item => item.id === id);
          if (!current || !current.asCopy && client.exportBackup().base[JSON.stringify([current.entity, current.entityId])]) {
            throw new Error('内容已变化，请重新确认');
          }
          return client.importCandidate(id, mapping);
        }
        if (action === 'import-settings') return client.importSettings(id, selection);
        if (action === 'discard') return client.discardCandidate(id);
        if (action === 'restore') return client.restore(button.dataset.syncEntity, id);
        return client.resolveConflict(id, action);
      }, instance);
    } finally { syncPanelBusy = false; renderSyncPanel(); }
  };

  // ── 词卡列表 ──────────────────────────────────────
  function reviewCards() {
    const language = $('#reviewLanguageFilter')?.value || 'all';
    const query = ($('#reviewSearch')?.value || '').trim().toLowerCase();
    return state.items.filter(item => {
      const matchesLanguage = language === 'all' || (item.language || 'nl') === language;
      const haystack = [item.text, item.sentence, item.meaning, item.note].join(' ').toLowerCase();
      return matchesLanguage && (!query || haystack.includes(query));
    });
  }

  function renderReviewList() {
    const cards = reviewCards();
    $('#reviewStep').textContent = cards.length
      ? `共 ${cards.length} 张词卡。点击词卡查看原句、释义和复习状态。`
      : '没有符合筛选条件的词卡。';
    $('#reviewList').innerHTML = cards.length ? cards.map(item => `
      <article class="review-list-item" data-review-id="${esc(item.id)}">
        <button class="review-list-front" type="button" data-review-toggle aria-expanded="false" aria-controls="review-answer-${esc(item.id)}">${esc(item.text)} <span class="small">${languageName(item.language || 'nl')}</span><span class="front-sentence">${esc(item.sentence || '未保存原句')}</span></button>
        <div class="review-list-answer" id="review-answer-${esc(item.id)}">
          <div><strong>原句：</strong>${esc(item.sentence || '未保存原句')}</div>
          <div><strong>释义：</strong>${esc(item.meaning || '未添加释义')}</div>
          ${item.note ? `<div><strong>备注：</strong>${esc(item.note)}</div>` : ''}
          <div><strong>复习：</strong>${overdueDays(item) ? `逾期 ${overdueDays(item)} 天` : due(item) ? '今日到期' : '下次 ' + date(reviewDateOf(item))} · 阶段 ${Number(item.level) || 0}</div>
          <div class="review-history"><span>上次：${lastReviewedAt(item) ? date(lastReviewedAt(item)) : '尚未复习'}</span><span>记录：${reviewLogFor(item).length} 次</span></div>
        </div>
        <div class="review-list-actions">
          <button class="btn" type="button" data-review-speak="${esc(item.id)}">朗读原句</button>
          <button class="btn" type="button" data-review-edit="${esc(item.id)}">编辑</button>
          <button class="btn danger" type="button" data-review-delete="${esc(item.id)}">删除</button>
        </div>
      </article>
    `).join('') : '<div class="empty">词卡列表为空。</div>';
  }

  function openReviewPage(updateRoute = true) {
    document.body.dataset.activeView = 'cards';
    $('#workspace').hidden = true;
    $('#archiveView').hidden = true;
    $('#settingsView').hidden = true;
    dailyReviewView.hidden = true;
    reviewView.hidden = false;
    $('#conversationView').hidden = true;
    document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'cards'));
    renderReviewList();
    if (updateRoute) syncRouteState('cards');
  }
  $('#reviewSearch').oninput = () => { renderReviewList(); syncRouteState('cards', true); };
  $('#reviewLanguageFilter').onchange = event => {
    setInterfaceLanguageTheme(event.target.value === 'all' ? 'en' : event.target.value);
    renderReviewList();
    syncRouteState('cards', true);
  };

  let editingReviewCardId = null;

  function openReviewCardDialog(item = null) {
    if (item && !editableSyncRecord('card', item.id, item)) return;
    editingReviewCardId = item ? String(item.id) : null;
    reviewEditOriginal = item ? structuredClone(item) : null;
    $('#reviewCardForm').reset();
    $('#reviewCardDialogTitle').textContent = item ? '编辑词卡' : '添加词卡';
    $('#reviewCardDialogDescription').textContent = item ? '修改内容后保存，原有复习阶段和时间不会改变。' : '直接创建一张词卡，并安排到今日复习。';
    $('#saveReviewCard').textContent = item ? '保存修改' : '添加到今日复习';
    $('#reviewCardLanguage').value = item?.language || (['en', 'nl', 'ja'].includes(state.cardLanguage) ? state.cardLanguage : 'en');
    $('#reviewCardText').value = item?.text || '';
    $('#reviewCardSentence').value = item?.sentence || '';
    $('#reviewCardMeaning').value = item?.meaning || '';
    $('#reviewCardNote').value = item?.note || '';
    $('#reviewCardDialog').showModal();
    setTimeout(() => $('#reviewCardText').focus(), 0);
  }

  $('#addReviewCard').onclick = () => {
    openReviewCardDialog();
  };
  $('#cancelReviewCard').onclick = () => { editingReviewCardId = null; $('#reviewCardDialog').close(); };
  $('#reviewCardForm').onsubmit = async event => {
    event.preventDefault();
    const text = $('#reviewCardText').value.trim();
    if (!text) { $('#reviewCardText').focus(); return; }
    const language = $('#reviewCardLanguage').value;
    const existing = editingReviewCardId ? state.items.find(item => String(item.id) === editingReviewCardId) : null;
    if (editingReviewCardId && !existing) return notify('该词卡已删除或缺失，请先处理同步状态；不会自动创建替代记录。', 'error');
    const card = existing ? { ...existing } : {
      id: crypto.randomUUID(), level: 0,
      next_review: new Date().toISOString(), created_at: new Date().toISOString(),
    };
    Object.assign(card, {
      text, language,
      sentence: $('#reviewCardSentence').value.trim(),
      meaning: $('#reviewCardMeaning').value.trim(),
      note: $('#reviewCardNote').value.trim(),
    });
    if (!await pushCardToCloud(editedFields(card, reviewEditOriginal, ['text', 'language', 'sentence', 'meaning', 'note']))) return;
    state.cardLanguage = language;
    $('#reviewLanguageFilter').value = 'all';
    save(); render(); renderReviewList();
    $('#reviewCardDialog').close();
    editingReviewCardId = null;
  };

  $('#reviewList').onclick = async event => {
    const itemEl = event.target.closest('[data-review-id]');
    if (!itemEl) return;
    const id = itemEl.dataset.reviewId;
    const item = state.items.find(card => String(card.id) === String(id));
    if (!item) return;
    const editButton = event.target.closest('[data-review-edit]');
    if (editButton) {
      openReviewCardDialog(item);
      return;
    }
    const deleteButton = event.target.closest('[data-review-delete]');
    if (deleteButton) {
      if (!editableSyncRecord('card', item.id, item)) return;
      if (!await confirmAction(`删除词卡“${item.text}”？此操作也会从云端删除。`, { title: '删除词卡', confirmLabel: '删除' })) return;
      snapshotBackup('before-delete-card');
      if (!await deleteFromCloud(item.id)) return;
      editor.querySelectorAll(`[data-item="${CSS.escape(String(item.id))}"]`).forEach(node => node.replaceWith(...node.childNodes));
      save(); render(); renderReviewList();
      return;
    }
    const speakButton = event.target.closest('[data-review-speak]');
    if (speakButton) {
      speakSentence(item.sentence || '', speakButton, item.language || 'nl');
      return;
    }
    const toggleButton = event.target.closest('[data-review-toggle]');
    if (!toggleButton) return;
    const revealing = toggleButton.getAttribute('aria-expanded') !== 'true';
    toggleButton.setAttribute('aria-expanded', String(revealing));
    itemEl.classList.toggle('revealed', revealing);
    if (revealing) speakSentence(item.sentence || item.text, itemEl.querySelector('[data-review-speak]'), item.language || 'nl');
  };

  // ── 今日复习：艾宾浩斯间隔单卡模式 ───────────────
  let dailyReviewRequeued = new Set();
  let dailyReviewOpenSequence = 0;

  async function loadReviewPreferencesFromCloud() {
    if (!isApiOnline()) return;
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/review/preferences'), { headers: apiHeaders(), credentials: 'include' });
      if (!response.ok) return;
      const preferences = await response.json();
      if ([0, 10, 20, 30].includes(Number(preferences.batch_size))) state.reviewBatchSize = Number(preferences.batch_size);
      if (['card', 'cloze'].includes(preferences.exercise_mode)) state.reviewExerciseMode = preferences.exercise_mode;
      save();
    } catch (error) {
      console.warn('读取云端复习偏好失败:', error.message);
    }
  }

  async function saveReviewPreferencesToCloud() {
    if (!isApiOnline()) return false;
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/review/preferences'), {
        method: 'PUT', headers: apiHeaders(), credentials: 'include',
        body: JSON.stringify({ batch_size: state.reviewBatchSize, exercise_mode: state.reviewExerciseMode })
      });
      return response.ok;
    } catch (error) {
      console.warn('保存云端复习偏好失败:', error.message);
      return false;
    }
  }

  function dueCardsForSession() {
    return (state.reviewMode === 'mixed' ? state.items : cardsForLanguage(state.cardLanguage)).filter(due);
  }

  function shuffledReviewIds(cards) {
    const ids = cards.map(card => String(card.id));
    for (let index = ids.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
    }
    return ids;
  }

  function reviewPlanKey() {
    return [localDayKey(new Date()), state.reviewMode, state.reviewMode === 'mixed' ? 'all' : state.cardLanguage].join(':');
  }

  async function loadDailyReviewPlanFromCloud() {
    if (!isApiOnline()) return;
    const key = reviewPlanKey();
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/review/plan?key=' + encodeURIComponent(key)), { headers: apiHeaders(), credentials: 'include' });
      if (!response.ok) return;
      const plan = await response.json();
      if (plan.plan_key === key && Array.isArray(plan.order) && plan.order.length) {
        state.dailyReviewPlan = { key, order: plan.order.map(String), updated_at: plan.updated_at || '' };
        save();
      }
    } catch (error) {
      console.warn('读取云端复习序列失败:', error.message);
    }
  }

  async function saveDailyReviewPlanToCloud() {
    if (!isApiOnline() || !state.dailyReviewPlan) return false;
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/review/plan'), {
        method: 'PUT', headers: apiHeaders(), credentials: 'include',
        body: JSON.stringify({ plan_key: state.dailyReviewPlan.key, order: state.dailyReviewPlan.order })
      });
      return response.ok;
    } catch (error) {
      console.warn('保存云端复习序列失败:', error.message);
      return false;
    }
  }

  function plannedDueIds() {
    const dueCards = dueCardsForSession();
    const dueIds = new Set(dueCards.map(card => String(card.id)));
    const existingIds = new Set(state.items.map(card => String(card.id)));
    const key = reviewPlanKey();
    let order = state.dailyReviewPlan?.key === key && Array.isArray(state.dailyReviewPlan.order)
      ? state.dailyReviewPlan.order.map(String).filter(id => existingIds.has(id))
      : [];
    const known = new Set(order);
    const additions = shuffledReviewIds(dueCards.filter(card => !known.has(String(card.id))));
    order.push(...additions);
    const changed = state.dailyReviewPlan?.key !== key || JSON.stringify(state.dailyReviewPlan?.order || []) !== JSON.stringify(order);
    state.dailyReviewPlan = { key, order, updated_at: state.dailyReviewPlan?.updated_at || '' };
    if (changed) {
      save();
    }
    return order.filter(id => dueIds.has(id));
  }

  async function openDailyReviewPage(reset = true, updateRoute = true) {
    document.body.dataset.activeView = 'daily-review';
    setInterfaceLanguageTheme(state.reviewMode === 'mixed' ? 'en' : state.cardLanguage);
    $('#workspace').hidden = true;
    $('#archiveView').hidden = true;
    $('#settingsView').hidden = true;
    reviewView.hidden = true;
    $('#conversationView').hidden = true;
    dailyReviewView.hidden = false;
    document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'daily-review'));
    const opening = ++dailyReviewOpenSequence;
    $('#reviewExerciseMode').disabled = true;
    $('#reviewBatchSize').disabled = true;
    try {
      if (reset) {
        await loadReviewPreferencesFromCloud();
        await loadDailyReviewPlanFromCloud();
        if (opening !== dailyReviewOpenSequence || document.body.dataset.activeView !== 'daily-review') return;
        const planned = plannedDueIds();
        await saveDailyReviewPlanToCloud();
        if (opening !== dailyReviewOpenSequence || document.body.dataset.activeView !== 'daily-review') return;
        reviewQueue = state.reviewBatchSize > 0 ? planned.slice(0, state.reviewBatchSize) : planned;
        reviewIndex = 0;
        dailyReviewRequeued = new Set();
      }
      $('#reviewExerciseMode').value = state.reviewExerciseMode;
      $('#reviewBatchSize').value = String(state.reviewBatchSize);
      renderDailyReviewCard();
      if (updateRoute) syncRouteState('daily-review');
    } finally {
      if (opening === dailyReviewOpenSequence) {
        $('#reviewExerciseMode').disabled = false;
        $('#reviewBatchSize').disabled = false;
      }
    }
  }

  function renderDailyReviewCard() {
    if (!reviewQueue.length || reviewIndex >= reviewQueue.length) {
      const remaining = plannedDueIds().length;
      $('#dailyReviewProgress').textContent = remaining ? `本组完成 · 今日还剩 ${remaining} 张` : '今日复习完成';
      $('#dailyReviewStage').innerHTML = remaining
        ? `<div class="study-finished"><h3>本组完成</h3><p>今天还有 ${remaining} 张待复习，可以现在继续，也可以稍后回来。</p><div class="study-finished-actions"><button class="btn primary" type="button" data-next-review-batch>继续下一组</button><button class="btn" type="button" data-finish-review>稍后继续</button></div></div>`
        : `<div class="study-finished"><h3>今天完成了</h3><p>复习结果已根据你的间隔设置安排到下一次。</p><div class="study-finished-actions"><button class="btn primary" type="button" data-finish-review>返回词卡列表</button></div></div>`;
      $('#dailyReviewStage').querySelector('[data-finish-review]').onclick = openReviewPage;
      const nextBatch = $('#dailyReviewStage').querySelector('[data-next-review-batch]');
      if (nextBatch) nextBatch.onclick = () => void openDailyReviewPage(true);
      render();
      return;
    }
    const item = state.items.find(card => String(card.id) === String(reviewQueue[reviewIndex]));
    if (!item) { reviewIndex++; renderDailyReviewCard(); return; }
    $('#dailyReviewProgress').textContent = `本组 ${reviewIndex + 1} / ${reviewQueue.length} 张 · 今日剩余 ${dueCardsForSession().length} 张 · 当前阶段 ${Number(item.level) || 0}`;
    const clozeMode = state.reviewExerciseMode === 'cloze';
    const sentence = item.sentence || '';
    const term = String(item.text || '');
    const matchIndex = sentence.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
    const clozeSentence = matchIndex >= 0
      ? `${esc(sentence.slice(0, matchIndex))}<span class="cloze-blank" aria-label="填空">________</span>${esc(sentence.slice(matchIndex + term.length))}`
      : `${esc(sentence || '未保存原句')} <span class="cloze-blank" aria-label="填空">________</span>`;
    $('#dailyReviewStage').innerHTML = clozeMode ? `
      <article class="study-card study-card-cloze" data-study-id="${esc(item.id)}">
        <div class="study-card-language">${languageName(item.language || 'nl')} · 句子填空</div>
        <div class="cloze-sentence">${clozeSentence}</div>
        <div class="cloze-meaning"><span>释义提示</span><strong>${esc(item.meaning || '暂未添加释义')}</strong></div>
        <form class="cloze-form" data-cloze-form>
          <label class="sr-only" for="clozeAnswer-${esc(item.id)}">填写缺少的词语</label>
          <input id="clozeAnswer-${esc(item.id)}" data-cloze-input autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="填写缺少的词语…">
          <button class="btn primary" type="submit">检查</button>
        </form>
        <div class="cloze-feedback" data-cloze-feedback hidden></div>
        <div class="study-rating" hidden>
          <button class="study-forgot" type="button" data-study-rating="forgot">忘记</button>
          <button class="study-fuzzy" type="button" data-study-rating="fuzzy">模糊</button>
          <button class="study-mastered" type="button" data-study-rating="mastered">掌握</button>
          <button class="study-postpone" type="button" data-study-rating="postpone">明天再看</button>
        </div>
      </article>` : `
      <article class="study-card" data-study-id="${esc(item.id)}">
        <div class="study-card-language">${languageName(item.language || 'nl')}</div>
        <div class="study-card-term">${esc(item.text)}</div>
        <div class="study-card-sentence">${esc(item.sentence || '未保存原句')}</div>
        <button class="btn study-reveal" type="button" data-study-reveal aria-expanded="false" aria-controls="study-answer-${esc(item.id)}">显示答案</button>
        <div class="study-card-answer" id="study-answer-${esc(item.id)}" hidden>
          <p><strong>原句：</strong>${esc(item.sentence || '未保存原句')}</p>
          <p><strong>释义：</strong>${esc(item.meaning || '未添加释义')}</p>
          ${item.note ? `<p><strong>备注：</strong>${esc(item.note)}</p>` : ''}
          <button class="speak-sentence" type="button" data-study-speak>朗读原句</button>
        </div>
        <div class="study-rating" hidden>
          <button class="study-forgot" type="button" data-study-rating="forgot">忘记</button>
          <button class="study-fuzzy" type="button" data-study-rating="fuzzy">模糊</button>
          <button class="study-mastered" type="button" data-study-rating="mastered">掌握</button>
          <button class="study-postpone" type="button" data-study-rating="postpone">明天再看</button>
        </div>
      </article>`;
    const cardEl = $('#dailyReviewStage').querySelector('.study-card');
    if (clozeMode) {
      const form = cardEl.querySelector('[data-cloze-form]');
      const input = cardEl.querySelector('[data-cloze-input]');
      form.onsubmit = event => {
        event.preventDefault();
        const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        const correct = normalized(input.value) === normalized(item.text);
        const feedback = cardEl.querySelector('[data-cloze-feedback]');
        feedback.hidden = false;
        feedback.className = `cloze-feedback ${correct ? 'correct' : 'incorrect'}`;
        feedback.innerHTML = correct ? `<strong>正确</strong><span>${esc(item.meaning || '')}</span>` : `<strong>答案：${esc(item.text)}</strong><span>${esc(item.meaning || '')}</span>`;
        input.disabled = true;
        form.querySelector('button').hidden = true;
        cardEl.querySelector('.study-rating').hidden = false;
        cardEl.querySelector('[data-study-rating="mastered"]').focus();
      };
      input.focus();
    } else {
      cardEl.querySelector('[data-study-reveal]').onclick = event => {
        event.currentTarget.hidden = true;
        event.currentTarget.setAttribute('aria-expanded', 'true');
        cardEl.querySelector('.study-card-answer').hidden = false;
        cardEl.querySelector('.study-rating').hidden = false;
        const replayButton = cardEl.querySelector('[data-study-speak]');
        replayButton.focus();
        speakSentence(item.sentence || item.text, replayButton, item.language || 'nl');
      };
      cardEl.querySelector('[data-study-speak]').onclick = event => speakSentence(item.sentence || item.text, event.currentTarget, item.language || 'nl');
    }
    cardEl.querySelectorAll('[data-study-rating]').forEach(button => button.onclick = () => rateDailyReview(item, button.dataset.studyRating));
  }

  async function applyReviewRating(item, rating) {
    if (reviewRatingBusy) return false;
    const current = state.items.find(card => String(card.id) === String(item.id));
    if (!current) { notify('这条归档标注已没有活动词卡，不能通过复习复活；请到同步处理面板恢复或新建词卡。', 'error'); return false; }
    if (!editableSyncRecord('card', current.id, current)) return false;
    const currentLevel = Math.max(0, Number(current.level) || 0);
    const reviewedAt = new Date().toISOString();
    let nextLevel = currentLevel;
    if (rating === 'mastered') nextLevel = Math.min(currentLevel + 1, state.reviewIntervals.length);
    if (rating === 'forgot') nextLevel = 0;
    const intervalIndex = rating === 'mastered' ? Math.max(0, nextLevel - 1) : rating === 'fuzzy' ? Math.max(0, currentLevel - 1) : 0;
    const days = rating === 'postpone' ? 1 : state.reviewIntervals[Math.min(intervalIndex, state.reviewIntervals.length - 1)] || 1;
    const nextReview = scheduleReviewDate(days);
    reviewRatingBusy = true;
    try { if (!await patchReviewOnCloud(current.id, nextLevel, nextReview)) return false; }
    finally { reviewRatingBusy = false; }
    state.reviewLog[String(current.id)] = [...reviewLogFor(current), { at: reviewedAt, rating, level: nextLevel, nextReview }].slice(-50);
    save(); render();
    return true;
  }

  async function rateDailyReview(item, rating) {
    if (!await applyReviewRating(item, rating)) return;
    if (rating === 'forgot' && !dailyReviewRequeued.has(String(item.id))) {
      dailyReviewRequeued.add(String(item.id));
      reviewQueue.push(String(item.id));
    }
    reviewIndex++;
    renderDailyReviewCard();
  }

  $('#startReview').onclick = () => void openDailyReviewPage(true);
  $('#exitDailyReview').onclick = openReviewPage;
  $('#reviewExerciseMode').onchange = event => {
    state.reviewExerciseMode = event.target.value === 'cloze' ? 'cloze' : 'card';
    save();
    void saveReviewPreferencesToCloud();
    renderDailyReviewCard();
  };
  $('#reviewBatchSize').onchange = async event => {
    state.reviewBatchSize = [0, 10, 20, 30].includes(Number(event.target.value)) ? Number(event.target.value) : 20;
    save();
    await saveReviewPreferencesToCloud();
    await openDailyReviewPage(true, false);
  };

  // ── 口语陪练 ──────────────────────────────────────
  const scenarioOptions = {
    en: [['work_meeting','工作会议'],['social','日常社交'],['interview','求职面试'],['deep_discussion','深度讨论'],['academic','学术发表']],
    nl: [['work_meeting','工作会议'],['social','日常社交'],['interview','求职面试']],
    ja: [['travel','旅行会话'],['daily_life','生活会话'],['small_talk','Small talk']],
  };
  const starterTopics = {
    en: ['模拟一次项目进度会议','聊聊最近改变你想法的一件事','开始一轮行为面试'],
    nl: ['在茶水间认识新同事','练习介绍我的工作','模拟荷兰语面试开场'],
    ja: ['在咖啡店点单','聊聊周末做了什么','旅行时向当地人问路'],
  };

  const chatFonts = {
    sans: 'var(--font-ui)',
    serif: 'var(--font-reading)',
    readable: 'Verdana,"PingFang SC",sans-serif',
  };

  function applyChatDisplaySettings() {
    if (!FEATURES.conversation) return;
    const shell = $('.conversation-shell');
    const messages = $('#chatMessages');
    shell.style.setProperty('--chat-font', chatFonts[state.chatDisplay.font]);
    shell.style.setProperty('--chat-size', `${state.chatDisplay.size}px`);
    messages.classList.toggle('chat-align-center', state.chatDisplay.align === 'center');
    messages.classList.remove('chat-width-wide', 'chat-width-standard', 'chat-width-compact');
    messages.classList.add(`chat-width-${state.chatDisplay.width}`);
    $('#chatFontSize').value = state.chatDisplay.size;
    $('#chatFontSizeValue').textContent = `${state.chatDisplay.size} px`;
    $('#chatStreaming').checked = state.chatDisplay.streaming;
    document.querySelectorAll('[data-chat-font]').forEach(button => button.classList.toggle('active', button.dataset.chatFont === state.chatDisplay.font));
    document.querySelectorAll('[data-chat-align]').forEach(button => button.classList.toggle('active', button.dataset.chatAlign === state.chatDisplay.align));
    document.querySelectorAll('[data-chat-width]').forEach(button => button.classList.toggle('active', button.dataset.chatWidth === state.chatDisplay.width));
  }

  function updateChatDisplay(key, value) {
    if (!FEATURES.conversation) return;
    state.chatDisplay[key] = value;
    save();
    applyChatDisplaySettings();
  }

  $('#openChatDisplaySettings').onclick = () => { if (!FEATURES.conversation) return; applyChatDisplaySettings(); $('#chatDisplayDialog').showModal(); };
  document.querySelectorAll('[data-chat-font]').forEach(button => button.onclick = () => updateChatDisplay('font', button.dataset.chatFont));
  document.querySelectorAll('[data-chat-align]').forEach(button => button.onclick = () => updateChatDisplay('align', button.dataset.chatAlign));
  document.querySelectorAll('[data-chat-width]').forEach(button => button.onclick = () => updateChatDisplay('width', button.dataset.chatWidth));
  $('#chatFontSize').oninput = event => updateChatDisplay('size', Number(event.target.value));
  $('#chatStreaming').onchange = event => updateChatDisplay('streaming', event.target.checked);
  const currentChatTab = () => state.chatTabs.find(tab => tab.id === state.activeChatTabId) || state.chatTabs[0];
  const currentChat = () => {
    if (!FEATURES.conversation) return [];
    const tab = currentChatTab();
    if (!tab) return [];
    return state.chats[tab.id] || (state.chats[tab.id] = []);
  };

  function renderConversationTabs() {
    if (!FEATURES.conversation) return;
    $('#conversationTabs').innerHTML = state.chatTabs.map(tab => {
      const title = state.displayLanguage === 'en' && tab.title === '新对话' ? 'New conversation' : tab.title;
      return `
      <div class="conversation-tab-wrap${tab.id === state.activeChatTabId ? ' active' : ''}">
        <button class="conversation-tab" type="button" role="tab" aria-selected="${tab.id === state.activeChatTabId}" data-chat-tab="${esc(tab.id)}" title="${esc(title)}">${esc(title)}</button>
        <button class="conversation-tab-close" type="button" data-close-chat-tab="${esc(tab.id)}" aria-label="${state.displayLanguage === 'en' ? 'Close' : '关闭'} ${esc(title)}">×</button>
      </div>`;
    }).join('') + `<button class="conversation-tab-add" type="button" data-new-chat-tab aria-label="${state.displayLanguage === 'en' ? 'New conversation' : '新建对话'}" title="${state.displayLanguage === 'en' ? 'New conversation' : '新建对话'}">＋</button>`;
  }

  function createConversationTab() {
    if (!FEATURES.conversation) return;
    const id = 'conversation-' + Date.now().toString(36);
    state.chatTabs.push({ id, title: '新对话' });
    state.chats[id] = [];
    state.activeChatTabId = id;
    save();
    renderConversationTabs();
    renderConversation();
    syncRouteState('conversation', true);
    $('#chatInput').focus();
  }

  async function closeConversationTab(id) {
    if (!FEATURES.conversation) return;
    const tab = state.chatTabs.find(item => item.id === id);
    if (!tab) return;
    const messages = state.chats[id] || [];
    if (messages.length && !await confirmAction(`关闭“${tab.title}”？此对话将被删除。`, { title: '关闭对话', confirmLabel: '关闭' })) return;
    if (messages.length) snapshotBackup('before-close-chat');
    const index = state.chatTabs.findIndex(item => item.id === id);
    state.chatTabs.splice(index, 1);
    delete state.chats[id];
    if (!state.chatTabs.length) {
      const newId = 'conversation-' + Date.now().toString(36);
      state.chatTabs.push({ id: newId, title: '新对话' });
      state.chats[newId] = [];
    }
    if (state.activeChatTabId === id) state.activeChatTabId = state.chatTabs[Math.max(0, index - 1)]?.id || state.chatTabs[0].id;
    save(); renderConversationTabs(); renderConversation();
    syncRouteState('conversation', true);
  }

  $('#conversationTabs').onclick = event => {
    if (!FEATURES.conversation) return;
    const newButton = event.target.closest('[data-new-chat-tab]');
    if (newButton) return createConversationTab();
    const closeButton = event.target.closest('[data-close-chat-tab]');
    if (closeButton) return closeConversationTab(closeButton.dataset.closeChatTab);
    const tabButton = event.target.closest('[data-chat-tab]');
    if (!tabButton) return;
    state.activeChatTabId = tabButton.dataset.chatTab;
    save(); renderConversationTabs(); renderConversation();
    syncRouteState('conversation', true);
  };

  function updateConversationControls() {
    if (!FEATURES.conversation) return;
    if (document.body.dataset.activeView === 'conversation') setInterfaceLanguageTheme(state.chatLanguage);
    $('#chatLanguage').value = state.chatLanguage;
    $('#chatMode').value = state.chatMode;
    $('#correctionMode').value = state.correctionMode;
    $('#chatScenario').value = state.chatScenario;
    $('#chatScenario').placeholder = state.chatMode === 'friend' ? '可选：例如聊聊最近的工作' : '例如：向老板争取加薪';
    $('#chatTitle').textContent = state.chatMode === 'friend' ? '准备好了，随时开始' : state.chatScenario.trim() || '自定义场景';
    $('#chatSubtitle').textContent = state.correctionMode === 'strict'
      ? '逐轮给出自然版本，并邀请你重新表达。'
      : '交流优先，只纠正影响沟通或明显不自然的表达。';
    $('#starterChips').innerHTML = starterTopics[state.chatLanguage].map(topic => `<button type="button">${esc(topic)}</button>`).join('');
    $('#starterChips').querySelectorAll('button').forEach(button => button.onclick = () => { $('#chatInput').value = button.textContent; $('#chatInput').focus(); });
    $('#recordStatus').textContent = `Google ASR：${languageCode(state.chatLanguage)} · 录完后可修改文字再发送。`;
    applyChatDisplaySettings();
    renderConversationTabs();
    renderConversation();
  }

  function renderConversation() {
    if (!FEATURES.conversation) return;
    const messages = currentChat();
    const renderChatText = message => {
      const highlights = Array.isArray(message.highlights) ? [...message.highlights].sort((a, b) => a.start - b.start) : [];
      if (!highlights.length) return esc(message.content);
      let html = '', cursor = 0;
      highlights.forEach(highlight => {
        const start = Math.max(cursor, Number(highlight.start) || 0);
        const end = Math.min(message.content.length, Number(highlight.end) || 0);
        if (end <= start) return;
        html += esc(message.content.slice(cursor, start));
        html += `<span class="chat-highlight" data-item="${esc(highlight.cardId)}">${esc(message.content.slice(start, end))}</span>`;
        cursor = end;
      });
      return html + esc(message.content.slice(cursor));
    };
    $('#chatMessages').innerHTML = messages.length ? messages.map((message, index) => `
      <div class="chat-message ${message.role}">
        <div class="chat-bubble" data-chat-index="${index}">${renderChatText(message)}</div>
        ${message.correction ? `<div class="chat-correction"><strong>${message.correctionNotes?.length ? '纠正版本：' : '更自然：'}</strong> ${esc(message.correction)}${message.correctionNotes?.length ? `<ul class="chat-correction-notes">${message.correctionNotes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        ${message.role === 'assistant' ? `<div class="chat-tools"><button type="button" data-speak-chat="${index}">朗读</button></div>` : ''}
      </div>`).join('') : '<div class="empty">选择一个话题，或者直接说说你今天最想聊的事。对话会保留当前上下文。</div>';
    $('#chatMessages').querySelectorAll('[data-speak-chat]').forEach(button => button.onclick = () => {
      const message = messages[Number(button.dataset.speakChat)];
      if (message) speakSentence(message.content, button, state.chatLanguage);
    });
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  }

  async function addAssistantReply(messages, payload) {
    if (!FEATURES.conversation) return;
    const reply = String(payload.reply || '');
    if (!state.chatDisplay.streaming || !reply) {
      messages.push({ role: 'assistant', content: reply, correction: payload.correction || '', correctionNotes: Array.isArray(payload.correction_notes) ? payload.correction_notes : [] });
      save(); renderConversation();
      return;
    }
    const message = { role: 'assistant', content: '', correction: '', correctionNotes: [] };
    messages.push(message);
    renderConversation();
    const characters = Array.from(reply);
    const bubble = $('#chatMessages').querySelector(`[data-chat-index="${messages.length - 1}"]`);
    const chunkSize = characters.length > 500 ? 6 : characters.length > 220 ? 3 : 2;
    for (let index = 0; index < characters.length; index += chunkSize) {
      message.content += characters.slice(index, index + chunkSize).join('');
      if (bubble) bubble.textContent = message.content;
      $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 18));
    }
    message.correction = payload.correction || '';
    message.correctionNotes = Array.isArray(payload.correction_notes) ? payload.correction_notes : [];
    save(); renderConversation();
  }

  async function sendConversationMessage() {
    if (!FEATURES.conversation) return;
    const input = $('#chatInput');
    const content = input.value.trim();
    if (!content) return;
    if (!isApiOnline()) { notify('请先在“设置”中连接 Worker。'); return; }
    const messages = currentChat();
    messages.push({ role: 'user', content });
    const activeTab = currentChatTab();
    if (activeTab && (activeTab.title === '新对话' || activeTab.title === 'New conversation')) {
      activeTab.title = content.replace(/\s+/g, ' ').replace(/[。！？.!?].*$/, '').trim().slice(0, 24) || '新对话';
      renderConversationTabs();
    }
    input.value = '';
    save();
    renderConversation();
    $('#sendChat').disabled = true;
    $('#sendChat').textContent = '思考中…';
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/conversation'), {
        method: 'POST', headers: apiHeaders(), credentials: 'include', body: JSON.stringify({
          language: state.chatLanguage, mode: state.chatMode, scenario: state.chatScenario,
          correction_mode: state.correctionMode, ui_language: state.displayLanguage, messages: messages.slice(-16).map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json();
      if (response.status === 404 && payload.error === '未知的 API 路径。') {
        throw new Error('线上 Worker 版本较旧，尚未包含口语陪练接口。请重新部署文件包中的 worker.js。');
      }
      if (!response.ok) throw new Error(payload.error || '对话服务暂时不可用。');
      await addAssistantReply(messages, payload);
    } catch (error) {
      messages.pop();
      input.value = content;
      renderConversation();
      notify(error.message);
    } finally {
      $('#sendChat').disabled = false;
      $('#sendChat').textContent = '发送';
    }
  }

  let chatSelection = null;
  function hideChatSelectionAction() {
    $('#addChatSelection').hidden = true;
    chatSelection = null;
  }

  function showChatSelectionAction() {
    if (!FEATURES.conversation) return hideChatSelectionAction();
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return hideChatSelectionAction();
    const selectionRange = selection.getRangeAt(0);
    const bubble = selectionRange.commonAncestorContainer.nodeType === 1
      ? selectionRange.commonAncestorContainer.closest?.('[data-chat-index]')
      : selectionRange.commonAncestorContainer.parentElement?.closest('[data-chat-index]');
    if (!bubble || !$('#chatMessages').contains(bubble)) return hideChatSelectionAction();
    const text = selection.toString().trim();
    if (!text) return hideChatSelectionAction();
    const offsetRange = selectionRange.cloneRange();
    offsetRange.selectNodeContents(bubble);
    offsetRange.setEnd(selectionRange.startContainer, selectionRange.startOffset);
    const rawStart = offsetRange.toString().length;
    const message = currentChat()[Number(bubble.dataset.chatIndex)];
    const exactStart = message?.content.indexOf(text, Math.max(0, rawStart - 2));
    if (!message || exactStart < 0) return hideChatSelectionAction();
    chatSelection = { messageIndex: Number(bubble.dataset.chatIndex), start: exactStart, end: exactStart + text.length, text };
    const rect = selectionRange.getBoundingClientRect();
    const action = $('#addChatSelection');
    action.hidden = false;
    action.style.left = Math.min(innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 50)) + 'px';
    action.style.top = Math.max(8, rect.top - 42) + 'px';
  }

  $('#chatMessages').addEventListener('mouseup', () => setTimeout(showChatSelectionAction, 0));
  $('#chatMessages').addEventListener('keyup', event => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) setTimeout(showChatSelectionAction, 0);
  });
  $('#addChatSelection').onclick = async () => {
    if (!FEATURES.conversation) return;
    if (!chatSelection) return;
    const message = currentChat()[chatSelection.messageIndex];
    if (!message) return hideChatSelectionAction();
    const card = {
      id: crypto.randomUUID(), text: chatSelection.text, sentence: message.content,
      meaning: '', note: '来自口语陪练', level: 0, language: state.chatLanguage,
      next_review: new Date().toISOString(), created_at: new Date().toISOString(),
    };
    const selected = { ...chatSelection };
    if (!await pushCardToCloud(card)) return;
    message.highlights = Array.isArray(message.highlights) ? message.highlights : [];
    message.highlights.push({ start: selected.start, end: selected.end, cardId: card.id });
    state.cardLanguage = state.chatLanguage;
    getSelection()?.removeAllRanges();
    hideChatSelectionAction();
    save(); render(); renderConversation();
  };

  function fallbackConversationTitle(messages) {
    const firstUser = messages.find(message => message.role === 'user')?.content || '口语对话';
    return firstUser.replace(/\s+/g, ' ').replace(/[。！？.!?].*$/, '').trim().slice(0, 36) || '口语对话';
  }

  async function conversationTitle(messages) {
    if (!FEATURES.conversation) return '';
    const fallback = fallbackConversationTitle(messages);
    if (!isApiOnline()) return fallback;
    try {
      const response = await fetch(apiRequestUrl(apiConfig.baseUrl + '/api/conversation/title'), {
        method: 'POST', headers: apiHeaders(), credentials: 'include',
        body: JSON.stringify({ language: state.chatLanguage, messages: messages.slice(0, 12).map(({ role, content }) => ({ role, content })) }),
      });
      if (!response.ok) return fallback;
      const payload = await response.json();
      return String(payload.title || fallback).trim().slice(0, 60) || fallback;
    } catch { return fallback; }
  }

  async function saveConversationAsArchive() {
    if (!FEATURES.conversation) return;
    const messages = currentChat();
    if (!messages.length) { notify('当前还没有可保存的对话。'); return; }
    const button = $('#saveConversation');
    button.disabled = true;
    button.textContent = '提取主题…';
    try {
      const title = await conversationTitle(messages);
      const annotationIds = new Set(messages.flatMap(message => (message.highlights || []).map(highlight => String(highlight.cardId))));
      const annotations = state.items.filter(item => annotationIds.has(String(item.id)));
      const html = messages.map(message => {
        const role = message.role === 'user' ? '我' : '对话伙伴';
        return `<p><strong>${role}</strong><br>${esc(message.content).replace(/\n/g, '<br>')}</p>`;
      }).join('');
      const document = {
        id: newDocumentId(), document_date: new Date().toISOString().slice(0, 10), title,
        html, video_url: '', annotations, language: state.chatLanguage, updated_at: new Date().toISOString(),
      };
      if (!await saveArchiveToCloud(document)) return;
      save(); render(); renderArchives();
      notify(`已保存到本机历史全文：${title}。${syncSummary()}`);
    } finally {
      button.disabled = false;
      button.textContent = '保存全文';
    }
  }

  $('#chatLanguage').onchange = event => { if (!FEATURES.conversation) return; state.chatLanguage = event.target.value; save(); updateConversationControls(); };
  $('#chatMode').onchange = event => { if (!FEATURES.conversation) return; state.chatMode = event.target.value; save(); updateConversationControls(); };
  $('#chatScenario').onchange = event => { if (!FEATURES.conversation) return; state.chatScenario = event.target.value.trim(); save(); updateConversationControls(); };
  $('#correctionMode').onchange = event => { if (!FEATURES.conversation) return; state.correctionMode = event.target.value; save(); updateConversationControls(); };
  $('#sendChat').onclick = sendConversationMessage;
  $('#saveConversation').onclick = saveConversationAsArchive;
  $('#chatInput').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendConversationMessage(); } };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  $('#recordMessage').onclick = () => {
    if (!FEATURES.conversation) return;
    if (!SpeechRecognition) { notify('当前浏览器不支持 Google 语音识别。请使用最新版 Chrome，或直接输入文字。'); return; }
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition();
    recognition.lang = languageCode(state.chatLanguage);
    recognition.continuous = true;
    recognition.interimResults = true;
    const existing = $('#chatInput').value.trim();
    recognition.onstart = () => { const button = $('#recordMessage'); button.classList.add('recording'); button.textContent = '■'; button.setAttribute('aria-label', '结束录音'); button.title = '结束录音'; $('#recordStatus').textContent = '正在听…点击方块结束。'; };
    recognition.onresult = event => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      $('#chatInput').value = [existing, transcript].filter(Boolean).join(existing ? ' ' : '');
    };
    recognition.onerror = event => { $('#recordStatus').textContent = `识别失败：${event.error}。可以重试或改用文字输入。`; };
    recognition.onend = () => { recognition = null; const button = $('#recordMessage'); button.classList.remove('recording'); button.textContent = '🎙︎'; button.setAttribute('aria-label', '录语音消息'); button.title = '录语音消息'; $('#recordStatus').textContent = '转写完成。确认后发送。'; };
    recognition.start();
  };

  // ── Resource 待看任务列表 ─────────────────────────
  const resourceStatusNames = { backlog: '待看', active: '进行中', completed: '已完成' };
  const resourceComposer = $('#resourceComposer');
  const selectedResourceIds = new Set();
  const resourceDraftTagIds = new Set();
  const resourceDraftDeckIds = new Set();
  const resourceFilterTagIds = new Set();
  const resourceFilterDeckIds = new Set();
  const editingResourceConfigKeys = new Set();
  let visibleResources = [];
  let activeResourceDeckId = '';
  let resourceBatchBusy = false;
  let resourceComposerBaseline = null;
  const resourceEmojiPicker = $('#resourceEmojiPicker');
  const resourceEmojiCategories = [
    { id: 'recent', icon: '◷', name: '最近使用', emojis: [] },
    { id: 'smileys', icon: '☺', name: '表情与人物', emojis: ['😀','😃','😄','😁','😆','😅','😂','🙂','🙃','😉','😊','🥰','😍','🤩','😘','😋','😎','🥳','🤔','🫡','🤗','🤭','🫢','😴','🥱','😮','😯','😲','🥺','😭','😤','😡','🤯','😱','🫠','🫶','👏','🙌','👍','👎','✌️','🤞','🤟','🤘','👌','👋','✍️','🙏','💪','👀','🧠','👤','👥'] },
    { id: 'nature', icon: '❧', name: '动物与自然', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦉','🦋','🐌','🐞','🐝','🐙','🐠','🐬','🐳','🌱','🌿','🍀','🌵','🌴','🌲','🌳','🌸','🌼','🌻','🌞','🌙','⭐','✨','🔥','🌈','☀️','☁️','❄️','🌊','🍂'] },
    { id: 'food', icon: '♨', name: '食物与饮品', emojis: ['🍎','🍊','🍋','🍉','🍇','🍓','🫐','🍒','🥭','🍍','🥝','🍅','🥑','🥦','🥕','🌽','🍞','🥐','🧀','🥚','🍳','🥞','🍔','🍕','🍜','🍝','🍣','🍱','🍙','🍚','🍛','🍰','🍪','🍫','🍿','☕','🍵','🧋','🥤','🍷'] },
    { id: 'activities', icon: '⚽', name: '活动', emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥅','⛳','🏹','🎣','🤿','🎿','🛹','🧘','🏆','🥇','🎯','🎮','🎲','🧩','🎨','🎭','🎤','🎧','🎹','🎸','🎻','🎬','🎪','🎟️'] },
    { id: 'travel', icon: '✈', name: '旅行与地点', emojis: ['🚗','🚕','🚌','🚎','🏎️','🚓','🚑','🚒','🚲','🛴','🚆','🚇','🚄','✈️','🚀','🛸','🚁','⛵','🚢','⚓','⛽','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🏖️','🏕️','🏠','🏢','🏫','🏛️','⛩️','🌍','🌎','🌏'] },
    { id: 'objects', icon: '♙', name: '物品', emojis: ['⌚','📱','💻','⌨️','🖥️','🖨️','📷','📹','🎥','📺','📻','🎙️','⏰','💡','🔦','📖','📚','📓','📰','🔖','🏷️','💰','💳','📦','📌','📎','✂️','🔒','🔑','🔨','🛠️','🧪','🔬','🔭','💊','🩺','🧳','🎁','🛍️'] },
    { id: 'symbols', icon: '♥', name: '符号', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','♻️','⚠️','✅','❌','❓','❗','⭕','💯','🔅','🔆','⚡','💥','💫','🔗','➕','➖','➡️','⬆️','⬇️'] },
    { id: 'flags', icon: '⚑', name: '旗帜', emojis: ['🏳️','🏴','🏁','🚩','🏳️‍🌈','🇨🇳','🇯🇵','🇳🇱','🇬🇧','🇺🇸','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇵🇹','🇰🇷','🇨🇦','🇦🇺','🇳🇿','🇸🇬','🇹🇭','🇻🇳','🇮🇳','🇧🇷','🇲🇽','🇪🇺'] }
  ];
  const resourceEmojiKeywords = { '😀':'笑 开心 smile happy','😂':'笑哭 tears joy laugh','😊':'微笑 smile happy','🥰':'喜欢 爱 love','🤔':'思考 think','😭':'哭 sad cry','👍':'赞 同意 like yes','👎':'不同意 dislike no','👏':'鼓掌 clap','🙏':'感谢 thank pray','👀':'看 watch eyes','📚':'书 学习 阅读 book study read','📖':'书 阅读 book read','🎓':'课程 学习 course study','🔗':'链接 网站 link website','🎬':'电影 影视 movie film cinema','📺':'电视 综艺 TV show','🎧':'音频 音乐 audio music','🎙️':'录音 播客 microphone podcast','🎤':'唱歌 话筒 sing microphone','✈️':'旅行 飞机 travel plane','🚆':'火车 旅行 train travel','🚗':'汽车 car','🚲':'自行车 bike','🚀':'火箭 rocket','🏠':'家 home house','💼':'工作 项目 work project','🎯':'目标 target goal','💡':'想法 idea light','🧠':'知识 思考 knowledge think','🌍':'语言 世界 language world','☕':'咖啡 coffee','🍿':'电影 爆米花 cinema movie','🍎':'苹果 apple fruit','🍜':'面条 拉面 noodle ramen','🍣':'寿司 sushi','🎮':'游戏 game','🎨':'艺术 art','🎭':'戏剧 theatre','🎵':'音乐 music','🧩':'拼图 puzzle','📌':'收藏 固定 pin save','🔖':'书签 bookmark','❤️':'喜欢 爱 heart love','⭐':'收藏 星星 star favorite','🔥':'热门 火 fire hot','✨':'闪亮 sparkle','✅':'完成 正确 done check','❌':'错误 删除 wrong delete','⚠️':'警告 warning','❓':'问题 question','💯':'满分 hundred','🔑':'钥匙 key','💻':'电脑 computer laptop','📱':'手机 phone','📷':'相机 camera photo','📰':'新闻 news','🗺️':'地图 map travel','🌱':'植物 成长 plant grow','🌸':'花 樱花 flower sakura','🐶':'狗 dog','🐱':'猫 cat','🐼':'熊猫 panda','☀️':'太阳 sun weather','🌙':'月亮 moon night','🌈':'彩虹 rainbow','🏆':'奖杯 trophy winner','⚽':'足球 football soccer','🏀':'篮球 basketball','🇯🇵':'日本 Japan Japanese','🇨🇳':'中国 China Chinese','🇳🇱':'荷兰 Netherlands Dutch','🇬🇧':'英国 UK English','🇺🇸':'美国 USA American' };
  const resourceEmojiCategoryKeywords = { smileys: '表情 人物 手势 心情 smiley people face hand emotion', nature: '动物 自然 植物 天气 animal nature plant weather', food: '食物 饮品 水果 food drink fruit', activities: '活动 运动 音乐 艺术 游戏 activity sport music art game', travel: '旅行 地点 交通 建筑 travel place transport building', objects: '物品 工具 科技 文具 object tool technology stationery', symbols: '符号 爱心 箭头 状态 symbol heart arrow status', flags: '旗帜 国家 地区 flag country region' };
  let activeResourceEmojiCategory = 'recent';
  let resourceEmojiDraft = '';
  const safeResourceUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const formatResourceDate = value => new Intl.DateTimeFormat(state.displayLanguage === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium' }).format(new Date(value));
  const resourceType = id => state.resourceTypes.find(type => type.id === id) || { id, name: id || '未分类', emoji: '' };
  const resourceTypeName = id => resourceType(id).name;
  const normalizeSettingName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
  const defaultResourceEmoji = item => resourceType(item.type).emoji || ({ project: '📁', course: '🎓', website: '🌐', movie_series: '🎬', book: '📚', variety: '🎬', article: '📝', audio: '🎧', game: '🎮', other: '📌' }[item.type] || '🔖');
  const initialResourceSettings = () => ({
    id: 'resources',
    schema_version: 4,
    languages: [
      { id: 'lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21', name: '中文' },
      { id: 'lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06', name: 'English' },
      { id: 'lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5', name: '日本語' },
      { id: 'lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0', name: 'Nederlands' },
    ],
    groups: [],
    types: [
      { id: 'movie_series', name: '影视', emoji: '🎬' },
      { id: 'book', name: '书籍', emoji: '📚' },
      { id: 'article', name: '文章', emoji: '📝' },
      { id: 'audio', name: '音频', emoji: '🎧' },
      { id: 'course', name: '课程', emoji: '🎓' },
      { id: 'website', name: '网站 / 工具', emoji: '🌐' },
      { id: 'project', name: '项目资料', emoji: '📁' },
      { id: 'game', name: '游戏', emoji: '🎮' },
      { id: 'other', name: '其他', emoji: '📌' },
    ],
    tags: [],
    decks: [],
  });

  function firstGrapheme(value) {
    const text = value.trim();
    if (!text) return '';
    if (Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)][0]?.segment || '';
    return Array.from(text)[0] || '';
  }

  function prepareResourceEmojiEditor(item = null) {
    const emoji = item?.emoji || '';
    resourceEmojiDraft = emoji;
    $('#resourceEmojiValue').value = emoji;
    $('#resourceEmojiPreview').textContent = emoji || defaultResourceEmoji(item || { type: $('#resourceType').value });
    $('#customResourceEmoji').value = '';
    $('#resourceEmojiSearch').value = '';
    try {
      activeResourceEmojiCategory = JSON.parse(localStorage.getItem('notebook-resource-emojis') || '[]').length ? 'recent' : 'smileys';
    } catch { activeResourceEmojiCategory = 'smileys'; }
    renderResourceEmojiPicker();
  }

  function setResourceEmoji(value) {
    const emoji = firstGrapheme(value);
    resourceEmojiDraft = emoji;
    $('#resourceEmojiValue').value = emoji;
    $('#resourceEmojiPreview').textContent = emoji || defaultResourceEmoji({ type: $('#resourceType').value });
    $('#customResourceEmoji').value = '';
  }

  function renderResourceEmojiPicker() {
    const search = $('#resourceEmojiSearch').value.trim().toLocaleLowerCase();
    const recent = (() => { try { return JSON.parse(localStorage.getItem('notebook-resource-emojis') || '[]'); } catch { return []; } })();
    resourceEmojiCategories[0].emojis = recent;
    const all = resourceEmojiCategories.slice(1).flatMap(category => category.emojis);
    const category = resourceEmojiCategories.find(item => item.id === activeResourceEmojiCategory) || resourceEmojiCategories[0];
    const emojiCategories = new Map();
    resourceEmojiCategories.slice(1).forEach(item => item.emojis.forEach(emoji => emojiCategories.set(emoji, `${item.name} ${resourceEmojiCategoryKeywords[item.id] || ''}`)));
    const emojis = search ? [...new Set([...recent, ...all])].filter(emoji => `${emoji} ${resourceEmojiKeywords[emoji] || ''} ${emojiCategories.get(emoji) || ''}`.toLocaleLowerCase().includes(search)) : category.emojis;
    $('#resourceEmojiSectionLabel').textContent = search ? '搜索结果' : category.name;
    $('#resourceEmojiGrid').innerHTML = emojis.length ? emojis.map(emoji => `<button type="button" data-resource-emoji="${emoji}" aria-label="使用 ${emoji}" title="${emoji}">${emoji}</button>`).join('') : '<p class="emoji-empty">没有匹配的 emoji</p>';
    $('#resourceEmojiCategories').innerHTML = resourceEmojiCategories.map(item => `<button type="button" data-emoji-category="${item.id}" class="${item.id === activeResourceEmojiCategory ? 'active' : ''}" aria-label="${item.name}" title="${item.name}" aria-pressed="${item.id === activeResourceEmojiCategory}" ${item.id === 'recent' && !recent.length ? 'disabled' : ''}>${item.icon}</button>`).join('');
    applyInterfaceLanguage(resourceEmojiPicker);
  }

  $('#resourceEmojiGrid').onclick = event => { const button = event.target.closest('[data-resource-emoji]'); if (button) setResourceEmoji(button.dataset.resourceEmoji); };
  $('#resourceEmojiCategories').onclick = event => { const button = event.target.closest('[data-emoji-category]'); if (!button || button.disabled) return; activeResourceEmojiCategory = button.dataset.emojiCategory; $('#resourceEmojiSearch').value = ''; renderResourceEmojiPicker(); };
  $('#resourceEmojiSearch').oninput = () => renderResourceEmojiPicker();
  $('#customResourceEmoji').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); setResourceEmoji(event.currentTarget.value); } };
  $('#removeResourceEmoji').onclick = () => setResourceEmoji('');
  $('#resourceType').addEventListener('change', () => { if (!$('#resourceEmojiValue').value) $('#resourceEmojiPreview').textContent = defaultResourceEmoji({ type: $('#resourceType').value }); });

  const resourceTag = id => state.resourceTags.find(item => item.id === id) || { id, name: id, emoji: '' };
  const resourceDeck = id => state.resourceDecks.find(item => item.id === id) || { id, name: id, emoji: '', description: '' };
  const resourceTaxonomyName = (kind, id) => (kind === 'tag' ? resourceTag(id) : resourceDeck(id)).name;
  function captureResourceFocus(root) {
    const active = document.activeElement;
    if (!active || !root?.contains(active)) return null;
    const cardId = active.closest('[data-resource-id]')?.dataset.resourceId;
    for (const attribute of [
      'data-resource-draft-tag', 'data-resource-draft-deck',
      'data-remove-resource-draft-tag', 'data-remove-resource-draft-deck',
      'data-resource-filter-tag', 'data-resource-filter-deck', 'data-resource-deck',
      'data-resource-action', 'data-resource-select', 'data-clear-resource-filter',
    ]) {
      if (!active.hasAttribute(attribute)) continue;
      let selector = cardId ? `[data-resource-id="${CSS.escape(cardId)}"] ` : '';
      selector += `[${attribute}="${CSS.escape(active.getAttribute(attribute) || '')}"]`;
      if (attribute === 'data-clear-resource-filter') {
        selector += `[data-filter-id="${CSS.escape(active.dataset.filterId || '')}"]`;
      }
      return selector;
    }
    return active.id ? `#${CSS.escape(active.id)}` : null;
  }
  const restoreResourceFocus = selector => {
    if (selector) queueMicrotask(() => document.querySelector(selector)?.focus({ preventScroll: true }));
  };

  function fillResourceOptions(force = false) {
    const currentTypeFilter = $('#resourceTypeFilter').value || 'all';
    const currentLanguageFilter = $('#resourceLanguageFilter').value || 'all';
    const typeOptions = state.resourceTypes.map(type => `<option value="${esc(type.id)}" data-archive-user-content>${esc(type.emoji || '')}${type.emoji ? ' ' : ''}${esc(type.name)}</option>`).join('');
    const languageOptions = state.resourceLanguages.map(item => `<option value="${esc(item.id)}" data-archive-user-content>${esc(item.name)}</option>`).join('');
    if (force || resourceComposer.hidden) {
      const currentLanguage = $('#resourceLanguage').value;
      $('#resourceLanguage').innerHTML = '<option value="">不限语言</option>' + languageOptions;
      $('#resourceLanguage').value = state.resourceLanguages.some(item => item.id === currentLanguage) ? currentLanguage : '';
      const currentType = $('#resourceType').value;
      $('#resourceType').innerHTML = typeOptions;
      if (state.resourceTypes.some(type => type.id === currentType)) $('#resourceType').value = currentType;
    }
    $('#resourceTypeFilter').innerHTML = '<option value="all">全部类型</option>' + typeOptions;
    $('#resourceTypeFilter').value = currentTypeFilter === 'all' || state.resourceTypes.some(type => type.id === currentTypeFilter) ? currentTypeFilter : 'all';
    $('#resourceLanguageFilter').innerHTML = '<option value="all">全部语言</option><option value="__none__">未指定语言</option>' + languageOptions;
    $('#resourceLanguageFilter').value = currentLanguageFilter === 'all' || currentLanguageFilter === '__none__' ||
      state.resourceLanguages.some(item => item.id === currentLanguageFilter) ? currentLanguageFilter : 'all';
  }

  function renderResourceDraftTaxonomy(kind) {
    const focused = captureResourceFocus(resourceComposer);
    const isTag = kind === 'tag';
    const items = isTag ? state.resourceTags : state.resourceDecks;
    const selected = isTag ? resourceDraftTagIds : resourceDraftDeckIds;
    const search = $(isTag ? '#resourceTagSearch' : '#resourceDeckSearch').value.trim().toLocaleLowerCase();
    const options = items.filter(item => !search || `${item.name} ${item.emoji || ''}`.toLocaleLowerCase().includes(search));
    const optionTarget = $(isTag ? '#resourceTagOptions' : '#resourceDeckOptions');
    const selectionTarget = $(isTag ? '#resourceTagSelection' : '#resourceDeckSelection');
    const rawSearch = $(isTag ? '#resourceTagSearch' : '#resourceDeckSearch').value.trim();
    const canCreate = isTag && rawSearch && !items.some(item => normalizeSettingName(item.name) === normalizeSettingName(rawSearch));
    optionTarget.innerHTML = (canCreate ? `<button class="resource-taxonomy-create" type="button" data-create-resource-tag="${esc(rawSearch)}">＋ 创建“<span data-archive-user-content>${esc(rawSearch)}</span>”</button>` : '') +
      (options.length
        ? options.map(item => `<label><input type="checkbox" data-resource-draft-${kind}="${esc(item.id)}" ${selected.has(item.id) ? 'checked' : ''}><span data-archive-user-content>${item.emoji ? `${esc(item.emoji)} ` : ''}${esc(item.name)}</span></label>`).join('')
        : canCreate ? '' : `<p class="small">没有匹配的${isTag ? '标签' : '收藏册'}。</p>`);
    selectionTarget.innerHTML = [...selected].map(id => {
      const item = isTag ? resourceTag(id) : resourceDeck(id);
      return `<button type="button" data-remove-resource-draft-${kind}="${esc(id)}" aria-label="移除${isTag ? '标签' : '收藏册'}：${esc(item.name)}"><span data-archive-user-content>${item.emoji ? `${esc(item.emoji)} ` : ''}${esc(item.name)}</span> <span aria-hidden="true">×</span></button>`;
    }).join('');
    restoreResourceFocus(focused);
  }

  function resourceFilterState() {
    return {
      query: $('#resourceSearch').value.trim().toLocaleLowerCase(),
      type: $('#resourceTypeFilter').value,
      language: $('#resourceLanguageFilter').value,
      status: $('#resourceStatusFilter').value,
      topic: $('#resourceTopicFilter').value,
      tags: new Set(resourceFilterTagIds),
      decks: new Set(resourceFilterDeckIds),
      activeDeck: activeResourceDeckId,
      sort: $('#resourceSort').value,
    };
  }

  function matchesMultiFacet(ids, selected) {
    if (!selected.size) return true;
    const values = new Set(ids || []);
    return [...selected].some(id => id === '__none__' ? values.size === 0 : values.has(id));
  }

  function resourceMatches(item, filters = resourceFilterState()) {
    const tagNames = (item.tag_ids || []).map(id => resourceTag(id).name);
    const deckNames = (item.deck_ids || []).map(id => resourceDeck(id).name);
    const haystack = [item.name, item.topic, item.language, item.description, resourceTypeName(item.type), ...tagNames, ...deckNames].join(' ').toLocaleLowerCase();
    return (!filters.query || haystack.includes(filters.query)) &&
      (filters.topic === 'all' || item.topic === filters.topic) &&
      (filters.type === 'all' || item.type === filters.type) &&
      (filters.language === 'all' || filters.language === '__none__' ? filters.language !== '__none__' || item.language_id == null : item.language_id === filters.language) &&
      (filters.status === 'all' || item.status === filters.status) &&
      matchesMultiFacet(item.tag_ids, filters.tags) &&
      matchesMultiFacet(item.deck_ids, filters.decks) &&
      (!filters.activeDeck || (item.deck_ids || []).includes(filters.activeDeck));
  }

  function sortResources(items, mode) {
    const time = (item, field) => Number.isFinite(Date.parse(item[field])) ? Date.parse(item[field]) : 0;
    return [...items].sort((a, b) => {
      if (mode === 'name') return a.name.localeCompare(b.name, state.displayLanguage === 'en' ? 'en' : 'zh-CN');
      if (mode === 'created') return time(b, 'created_at') - time(a, 'created_at') || a.name.localeCompare(b.name);
      if (mode === 'completed') return time(b, 'completed_at') - time(a, 'completed_at') || time(b, 'updated_at') - time(a, 'updated_at');
      return time(b, 'updated_at') - time(a, 'updated_at') || time(b, 'created_at') - time(a, 'created_at');
    });
  }

  function renderResourceFacet(kind) {
    const isTag = kind === 'tag';
    const items = isTag ? state.resourceTags : state.resourceDecks;
    const selected = isTag ? resourceFilterTagIds : resourceFilterDeckIds;
    const target = $(isTag ? '#resourceTagFilter' : '#resourceDeckFilter');
    const field = isTag ? 'tag_ids' : 'deck_ids';
    const label = isTag ? '标签' : '收藏册';
    const rows = [{ id: '__none__', name: isTag ? '无标签' : '未加入收藏册', emoji: '' }, ...items];
    target.innerHTML = rows.map(item => {
      const count = state.resources.filter(resource => item.id === '__none__' ? !(resource[field] || []).length : (resource[field] || []).includes(item.id)).length;
      return `<label><input type="checkbox" data-resource-filter-${kind}="${esc(item.id)}" ${selected.has(item.id) ? 'checked' : ''}><span ${item.id === '__none__' ? '' : 'data-resource-user-content'}>${item.emoji ? `${esc(item.emoji)} ` : ''}${esc(item.name)} <small>${count}</small></span></label>`;
    }).join('');
    const summary = $(isTag ? '#resourceTagFilterLabel' : '#resourceDeckFilterLabel');
    summary.textContent = selected.size ? `${label} · ${selected.size}` : label;
  }

  function renderResourceDeckNav() {
    $('#resourceDeckNav').innerHTML = [
      `<button type="button" class="${activeResourceDeckId ? '' : 'active'}" data-resource-deck="" aria-pressed="${String(!activeResourceDeckId)}">全部项目</button>`,
      ...state.resourceDecks.map(deck => {
        const count = state.resources.filter(item => (item.deck_ids || []).includes(deck.id)).length;
        return `<button type="button" class="${activeResourceDeckId === deck.id ? 'active' : ''}" data-resource-deck="${esc(deck.id)}" aria-pressed="${String(activeResourceDeckId === deck.id)}"><span data-resource-user-content>${deck.emoji ? `${esc(deck.emoji)} ` : ''}${esc(deck.name)}</span> <small>${count}</small></button>`;
      }),
    ].join('');
  }

  function filterChip(label, kind, id = '') {
    return `<button class="resource-filter-chip" type="button" data-clear-resource-filter="${esc(kind)}" data-filter-id="${esc(id)}" aria-label="移除筛选：${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`;
  }

  function renderResourceFilterChips(filters) {
    const chips = [];
    if (filters.query) chips.push(filterChip(`搜索：${$('#resourceSearch').value.trim()}`, 'query'));
    if (filters.type !== 'all') chips.push(filterChip(`类型：${resourceTypeName(filters.type)}`, 'type'));
    if (filters.language !== 'all') chips.push(filterChip(`语言：${filters.language === '__none__' ? '未指定' : state.resourceLanguages.find(item => item.id === filters.language)?.name || filters.language}`, 'language'));
    if (filters.status !== 'all') chips.push(filterChip(`状态：${resourceStatusNames[filters.status]}`, 'status'));
    if (filters.topic !== 'all') chips.push(filterChip(`旧主题：${filters.topic}`, 'topic'));
    for (const id of filters.tags) chips.push(filterChip(`标签：${id === '__none__' ? '无标签' : resourceTag(id).name}`, 'tag', id));
    for (const id of filters.decks) chips.push(filterChip(`收藏册：${id === '__none__' ? '未加入' : resourceDeck(id).name}`, 'deck', id));
    if (filters.activeDeck) chips.push(filterChip(`收藏册视图：${resourceDeck(filters.activeDeck).name}`, 'activeDeck', filters.activeDeck));
    $('#resourceFilterChips').innerHTML = chips.join('');
    $('#clearResourceFilters').hidden = chips.length === 0;
  }

  function resourceRow(item) {
    const archived = item.status === 'completed';
    const safeUrl = safeResourceUrl(item.url);
    const title = safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" data-resource-user-content>${esc(item.name)}</a>` : `<span data-resource-user-content>${esc(item.name)}</span>`;
    const type = resourceType(item.type);
    const emoji = item.emoji || defaultResourceEmoji(item);
    const tags = (item.tag_ids || []).slice(0, 3).map(id => `<button type="button" class="resource-taxonomy-chip" data-resource-filter-tag="${esc(id)}" data-resource-user-content>${resourceTag(id).emoji ? `${esc(resourceTag(id).emoji)} ` : ''}${esc(resourceTag(id).name)}</button>`).join('');
    const decks = (item.deck_ids || []).slice(0, 2).map(id => `<button type="button" class="resource-taxonomy-chip deck" data-resource-filter-deck="${esc(id)}" data-resource-user-content>${resourceDeck(id).emoji ? `${esc(resourceDeck(id).emoji)} ` : ''}${esc(resourceDeck(id).name)}</button>`).join('');
    const overflow = Math.max(0, (item.tag_ids || []).length - 3) + Math.max(0, (item.deck_ids || []).length - 2);
    return `<article class="resource-card${selectedResourceIds.has(item.id) ? ' selected' : ''}" data-resource-id="${esc(item.id)}"><label class="resource-select"><input type="checkbox" data-resource-select ${selectedResourceIds.has(item.id) ? 'checked' : ''} aria-label="选择 ${esc(item.name)}"><span></span></label><span class="resource-card-icon" aria-hidden="true">${esc(emoji)}</span><div class="resource-card-body"><h3>${title}</h3>${item.description ? `<p class="resource-description" data-resource-user-content>${esc(item.description)}</p>` : ''}<div class="resource-meta"><span class="resource-tag" data-resource-user-content>${esc(type.name)}</span>${item.language_id != null ? `<span data-resource-user-content>${esc(item.language)}</span>` : ''}<span>${esc(resourceStatusNames[item.status] || '')}</span></div><div class="resource-taxonomy-chips">${decks}${tags}${overflow ? `<span class="resource-chip-overflow">+${overflow}</span>` : ''}</div></div><div class="resource-card-footer"><span>${archived && item.completed_at ? `完成于 ${esc(formatResourceDate(item.completed_at))}` : ''}</span><div class="resource-actions"><button class="btn" type="button" data-resource-action="details">详情</button><button class="btn" type="button" data-resource-action="edit">编辑</button>${archived ? `<button class="btn" type="button" data-resource-action="restore">恢复</button>` : item.status === 'backlog' ? `<button class="btn primary" type="button" data-resource-action="start">开始</button>` : `<button class="btn" type="button" data-resource-action="backlog">稍后</button><button class="btn primary" type="button" data-resource-action="complete">完成</button>`}</div></div></article>`;
  }

  function renderResources() {
    const focused = captureResourceFocus($('#resourcesView'));
    fillResourceOptions();
    renderResourceDeckNav();
    const topics = [...new Set(state.resources.map(item => item.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const currentTopic = $('#resourceTopicFilter').value || 'all';
    $('#resourceTopicFilter').innerHTML = '<option value="all">全部旧主题</option>' + topics.map(topic => `<option value="${esc(topic)}" data-archive-user-content>${esc(topic)}</option>`).join('');
    $('#resourceTopicFilter').value = topics.includes(currentTopic) ? currentTopic : 'all';
    $('#resourceTopicSuggestions').innerHTML = topics.map(topic => `<option value="${esc(topic)}"></option>`).join('');
    renderResourceFacet('tag');
    renderResourceFacet('deck');
    const filters = resourceFilterState();
    visibleResources = sortResources(state.resources.filter(item => resourceMatches(item, filters)), filters.sort);
    const visibleIds = new Set(visibleResources.map(item => item.id));
    for (const id of selectedResourceIds) if (!visibleIds.has(id)) selectedResourceIds.delete(id);
    const active = visibleResources.filter(item => item.status !== 'completed');
    const archived = visibleResources.filter(item => item.status === 'completed');
    $('#resourceCount').textContent = state.resources.filter(item => item.status !== 'completed').length;
    $('#resourceActiveCount').textContent = active.length;
    $('#resourceCompletedCount').textContent = archived.length;
    $('#resourceSummary').innerHTML = `<span><strong>${visibleResources.length}</strong> / ${state.resources.length} 项</span><span><strong>${state.resourceTags.length}</strong> 个标签</span><span><strong>${state.resourceDecks.length}</strong> 个收藏册</span>`;
    $('#resourceResultsStatus').textContent = filters.activeDeck
      ? `${resourceDeck(filters.activeDeck).name} 中有 ${visibleResources.length} 项符合当前条件。`
      : `当前显示 ${visibleResources.length} 项，共 ${state.resources.length} 项。`;
    const noData = state.resources.length === 0;
    const noMatch = !noData && visibleResources.length === 0;
    $('#resourceActiveList').innerHTML = active.length
      ? `<div class="resource-card-grid">${active.map(resourceRow).join('')}</div>`
      : `<div class="resource-empty">${noData ? '暂无资源' : noMatch ? '暂无结果' : '暂无待处理'}</div>`;
    $('#resourceArchiveList').innerHTML = archived.length
      ? `<div class="resource-card-grid">${archived.map(resourceRow).join('')}</div>`
      : `<div class="resource-empty">${noMatch ? '暂无结果' : '暂无已完成'}</div>`;
    renderResourceFilterChips(filters);
    const selectedVisible = visibleResources.filter(item => selectedResourceIds.has(item.id)).length;
    $('#resourceSelectionCount').textContent = `已选 ${selectedVisible} 项`;
    $('#resourceSelectAll').checked = Boolean(visibleResources.length && selectedVisible === visibleResources.length);
    $('#resourceSelectAll').indeterminate = selectedVisible > 0 && selectedVisible < visibleResources.length;
    $('#resourceSelectionBar').hidden = visibleResources.length === 0;
    for (const selector of ['#clearResourceSelection', '#deleteSelectedResources']) $(selector).disabled = resourceBatchBusy || selectedVisible === 0;
    renderResourceBatchValue();
    applyInterfaceLanguage($('#resourcesView'));
    restoreResourceFocus(focused);
  }

  function openResourceDialog(item = null) {
    if (item && !editableSyncRecord('resource', item.id, item)) return;
    resourceLanguageMapped = !item?.legacy_language;
    resourceEditOriginal = item ? structuredClone(item) : null;
    $('#resourceDialogTitle').textContent = item ? '编辑资源' : '新资源';
    $('#resourceEditId').value = item?.id || '';
    $('#resourceName').value = item?.name || '';
    $('#resourceUrl').value = item?.url || '';
    fillResourceOptions(true);
    $('#resourceType').value = state.resourceTypes.some(type => type.id === item?.type) ? item.type : (state.resourceTypes[0]?.id || '');
    $('#resourceStatus').value = ['backlog', 'active', 'completed'].includes(item?.status) ? item.status : 'backlog';
    $('#resourceLanguage').value = item?.language_id || '';
    if (item?.legacy_language && item.language_id == null) {
      $('#resourceLanguage').insertAdjacentHTML('beforeend', `<option value="__legacy__" data-archive-user-content>待映射：${esc(item.legacy_language)}</option>`);
      $('#resourceLanguage').value = '__legacy__';
    }
    $('#resourceTopic').value = item?.topic || '';
    $('#resourceDescription').value = item?.description || '';
    resourceDraftTagIds.clear();
    resourceDraftDeckIds.clear();
    for (const id of item?.tag_ids || []) resourceDraftTagIds.add(id);
    for (const id of item?.deck_ids || []) resourceDraftDeckIds.add(id);
    $('#resourceTagSearch').value = '';
    $('#resourceDeckSearch').value = '';
    renderResourceDraftTaxonomy('tag');
    renderResourceDraftTaxonomy('deck');
    $('#resourceAdvanced').open = Boolean(item && (item.url || item.description || item.language_id || item.legacy_language ||
      item.topic || item.emoji || item.tag_ids?.length || item.deck_ids?.length));
    prepareResourceEmojiEditor(item);
    resourceComposerBaseline = resourceComposerValue();
    resourceComposer.hidden = false;
    $('#resourceName').focus();
    resourceComposer.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function closeResourceComposer() {
    resourceComposer.hidden = true;
    $('#resourceForm').reset();
    $('#resourceEditId').value = '';
    resourceEmojiDraft = '';
    resourceDraftTagIds.clear();
    resourceDraftDeckIds.clear();
    resourceEditOriginal = null;
    resourceComposerBaseline = null;
  }

  function resourceComposerValue() {
    return {
      name: $('#resourceName').value.trim(),
      url: $('#resourceUrl').value.trim(),
      type: $('#resourceType').value,
      status: $('#resourceStatus').value,
      language: $('#resourceLanguage').value,
      languageMapped: resourceLanguageMapped,
      topic: $('#resourceTopic').value.trim(),
      description: $('#resourceDescription').value.trim(),
      emoji: resourceEmojiDraft,
      tags: [...resourceDraftTagIds].sort(),
      decks: [...resourceDraftDeckIds].sort(),
    };
  }

  async function syncResource(item, method = 'POST') {
    if (!editableSyncRecord('resource', item.id, item)) return false;
    return commitSync(instance => method === 'DELETE'
      ? instance.remove('resource', String(item.id))
      : instance.put('resource', String(item.id), item), resourceEngine());
  }

  async function saveResourceSettingsToCloud(settings) {
    // 仅由用户保存动作调用；首次离线改动也入队，与已有服务器配置交由冲突面板确认。
    return commitSync(instance => instance.put('settings', 'resources', settings), resourceEngine());
  }

  async function updateResource(item, changes) {
    if (!await syncResource({ id: item.id, _syncCandidate: item._syncCandidate, ...changes }, 'PATCH')) return false;
    save(); renderResources();
    return true;
  }

  $('#addResource').onclick = () => openResourceDialog();
  $('#openResourceSettings').onclick = () => activateView('resource-settings');
  $('#closeResourceSettings').onclick = () => activateView('resources');
  $('#syncResources').onclick = () => pushAllToCloud({ announce: true });
  $('#resourceLanguage').addEventListener('change', () => { resourceLanguageMapped = $('#resourceLanguage').value !== '__legacy__'; });
  $('#cancelResource').onclick = async () => {
    const dirty = resourceComposerBaseline !== null &&
      JSON.stringify(resourceComposerValue()) !== JSON.stringify(resourceComposerBaseline);
    if (dirty && !await confirmAction('关闭后将放弃尚未保存的资源输入。', { title: '放弃修改', confirmLabel: '放弃' })) return;
    closeResourceComposer();
  };
  $('#clearResourceForm').onclick = () => {
    $('#resourceForm').reset();
    resourceLanguageMapped = true;
    $('#resourceLanguage').value = '';
    resourceDraftTagIds.clear();
    resourceDraftDeckIds.clear();
    renderResourceDraftTaxonomy('tag');
    renderResourceDraftTaxonomy('deck');
    prepareResourceEmojiEditor();
    $('#resourceName').focus();
  };
  for (const kind of ['tag', 'deck']) {
    const search = $(kind === 'tag' ? '#resourceTagSearch' : '#resourceDeckSearch');
    search.oninput = () => renderResourceDraftTaxonomy(kind);
    search.onkeydown = event => {
      if (!['Enter', 'ArrowDown'].includes(event.key)) return;
      const options = $(kind === 'tag' ? '#resourceTagOptions' : '#resourceDeckOptions');
      const first = options.querySelector('button,[data-resource-draft-tag],[data-resource-draft-deck]');
      if (!first) return;
      event.preventDefault();
      if (event.key === 'ArrowDown') first.focus();
      else if (first.matches('button')) first.click();
      else {
        first.checked = !first.checked;
        first.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
  }
  $('#resourceForm').onchange = event => {
    for (const kind of ['tag', 'deck']) {
      const input = event.target.closest(`[data-resource-draft-${kind}]`);
      if (!input) continue;
      const selected = kind === 'tag' ? resourceDraftTagIds : resourceDraftDeckIds;
      input.checked ? selected.add(input.dataset[`resourceDraft${kind[0].toUpperCase()}${kind.slice(1)}`]) :
        selected.delete(input.dataset[`resourceDraft${kind[0].toUpperCase()}${kind.slice(1)}`]);
      renderResourceDraftTaxonomy(kind);
      return;
    }
  };
  $('#resourceForm').onclick = async event => {
    const createTag = event.target.closest('[data-create-resource-tag]');
    if (createTag) {
      const name = createTag.dataset.createResourceTag.trim();
      if (!name) return;
      let tag = state.resourceTags.find(item => normalizeSettingName(item.name) === normalizeSettingName(name));
      if (!tag) {
        tag = { id: crypto.randomUUID(), name, emoji: '🏷️' };
        const settings = resourceSettingsData();
        settings.tags.push(tag);
        if (!await persistResourceSettings(settings)) return;
      }
      resourceDraftTagIds.add(tag.id);
      $('#resourceTagSearch').value = '';
      renderResourceDraftTaxonomy('tag');
      $('#resourceTagSearch').focus();
      return;
    }
    for (const kind of ['tag', 'deck']) {
      const button = event.target.closest(`[data-remove-resource-draft-${kind}]`);
      if (!button) continue;
      const selected = kind === 'tag' ? resourceDraftTagIds : resourceDraftDeckIds;
      selected.delete(button.dataset[`removeResourceDraft${kind[0].toUpperCase()}${kind.slice(1)}`]);
      renderResourceDraftTaxonomy(kind);
      return;
    }
  };
  $('#resourceForm').onsubmit = async event => {
    event.preventDefault();
    if (resourceFormBusy) return;
    const id = $('#resourceEditId').value;
    const existing = state.resources.find(item => item.id === id);
    if (id && !existing) return notify('该资源已删除或缺失，请先处理同步状态；表单输入已保留。', 'error');
    const language = $('#resourceLanguage').value;
    const item = existing ? { ...existing } : { id: crypto.randomUUID(), status: 'backlog', completed_at: '', tag_ids: [], deck_ids: [] };
    const status = $('#resourceStatus').value;
    Object.assign(item, { name: $('#resourceName').value.trim(), url: $('#resourceUrl').value.trim(), type: $('#resourceType').value,
      language_id: language === '__legacy__' ? null : language || null,
      topic: $('#resourceTopic').value.trim(), description: $('#resourceDescription').value.trim(), emoji: resourceEmojiDraft,
      tag_ids: [...resourceDraftTagIds], deck_ids: [...resourceDraftDeckIds], status,
      completed_at: status === 'completed' ? (existing?.completed_at || new Date().toISOString()) : '' });
    if (resourceLanguageMapped) item.legacy_language = null;
    if (!item.name || !state.resourceTypes.some(type => type.id === item.type) ||
        item.language_id !== null && !state.resourceLanguages.some(entry => entry.id === item.language_id) ||
        item.tag_ids.some(tagId => !state.resourceTags.some(tag => tag.id === tagId)) ||
        item.deck_ids.some(deckId => !state.resourceDecks.some(deck => deck.id === deckId))) {
      notify('请输入名称并选择有效的类型、语言、标签和收藏册；配置可能已变化，当前输入仍保留。', 'error');
      return;
    }
    resourceFormBusy = true;
    $('#resourceForm').inert = true;
    try {
      const changes = editedFields(item, resourceEditOriginal, ['name', 'url', 'type', 'language_id', 'legacy_language', 'topic', 'description', 'emoji', 'tag_ids', 'deck_ids', 'status', 'completed_at']);
      if (!await syncResource(changes, existing ? 'PATCH' : 'POST')) return;
      closeResourceComposer();
      save(); renderResources();
      if (item.emoji) {
        try {
          const recent = JSON.parse(localStorage.getItem('notebook-resource-emojis') || '[]');
          localStorage.setItem('notebook-resource-emojis', JSON.stringify([item.emoji, ...recent.filter(emoji => emoji !== item.emoji)].slice(0, 24)));
        } catch { /* 图标历史不影响已提交的资源。 */ }
      }
    } finally { resourceFormBusy = false; $('#resourceForm').inert = false; }
  };
  const updateResourceFilters = () => { renderResources(); syncRouteState('resources', true); };
  $('#resourceSearch').oninput = updateResourceFilters;
  for (const selector of ['#resourceTopicFilter', '#resourceTypeFilter', '#resourceLanguageFilter', '#resourceStatusFilter', '#resourceSort']) {
    $(selector).onchange = updateResourceFilters;
  }
  function openResourceDetail(item) {
    const type = resourceType(item.type);
    const safeUrl = safeResourceUrl(item.url);
    const tagButtons = (item.tag_ids || []).map(id => `<button type="button" class="resource-taxonomy-chip" data-resource-filter-tag="${esc(id)}">${resourceTag(id).emoji ? `${esc(resourceTag(id).emoji)} ` : ''}${esc(resourceTag(id).name)}</button>`).join('') || '未设置';
    const deckButtons = (item.deck_ids || []).map(id => `<button type="button" class="resource-taxonomy-chip deck" data-resource-filter-deck="${esc(id)}">${resourceDeck(id).emoji ? `${esc(resourceDeck(id).emoji)} ` : ''}${esc(resourceDeck(id).name)}</button>`).join('') || '未加入';
    $('#resourceDetailEmoji').textContent = item.emoji || defaultResourceEmoji(item);
    $('#resourceDetailName').textContent = item.name;
    $('#resourceDetailDescription').textContent = item.description || '';
    $('#resourceDetailDescription').hidden = !item.description;
    $('#resourceDetailMeta').innerHTML = `<div><dt>类型</dt><dd>${esc(type.name)}</dd></div><div><dt>旧主题</dt><dd data-resource-user-content>${esc(item.topic || '未设置')}</dd></div><div><dt>语言</dt><dd>${esc(item.language || '不限语言')}</dd></div><div><dt>状态</dt><dd>${esc(resourceStatusNames[item.status] || '未设置')}</dd></div><div class="wide"><dt>标签</dt><dd class="resource-taxonomy-chips">${tagButtons}</dd></div><div class="wide"><dt>收藏册</dt><dd class="resource-taxonomy-chips">${deckButtons}</dd></div><div class="wide"><dt>链接</dt><dd>${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.url)}</a>` : '未设置'}</dd></div>`;
    applyInterfaceLanguage($('#resourceDetailDialog'));
    $('#openResourceDetailLink').hidden = !safeUrl;
    if (safeUrl) $('#openResourceDetailLink').href = safeUrl;
    $('#editResourceDetail').dataset.resourceId = item.id;
    $('#deleteResourceDetail').dataset.resourceId = item.id;
    $('#resourceDetailDialog').showModal();
  }
  $('#closeResourceDetail').onclick = () => $('#resourceDetailDialog').close();
  $('#editResourceDetail').onclick = event => { const item = state.resources.find(entry => entry.id === event.currentTarget.dataset.resourceId); $('#resourceDetailDialog').close(); if (item) openResourceDialog(item); };
  $('#deleteResourceDetail').onclick = async event => {
    const item = state.resources.find(entry => entry.id === event.currentTarget.dataset.resourceId);
    if (!item || !await confirmAction(`删除“${item.name}”？资源会进入可恢复记录，Tags 与 Deck 不会被删除。`, { title: '删除资源', confirmLabel: '删除资源' })) return;
    snapshotBackup('before-delete-resource');
    if (!editableSyncRecord('resource', item.id, item)) return;
    if (await syncResource({ id: item.id, _syncCandidate: item._syncCandidate }, 'DELETE')) {
      selectedResourceIds.delete(item.id);
      $('#resourceDetailDialog').close();
      save();
      renderResources();
    }
  };
  $('#resourceDetailDialog').onclick = event => { if (event.target === $('#resourceDetailDialog')) $('#resourceDetailDialog').close(); };
  $('#resourcesView').onchange = event => {
    if (event.target.matches('[data-resource-select]')) {
      const id = event.target.closest('[data-resource-id]')?.dataset.resourceId;
      event.target.checked ? selectedResourceIds.add(id) : selectedResourceIds.delete(id);
      renderResources();
      return;
    }
    for (const kind of ['tag', 'deck']) {
      const input = event.target.closest(`[data-resource-filter-${kind}]`);
      if (!input) continue;
      const selected = kind === 'tag' ? resourceFilterTagIds : resourceFilterDeckIds;
      input.checked ? selected.add(input.dataset[`resourceFilter${kind[0].toUpperCase()}${kind.slice(1)}`]) :
        selected.delete(input.dataset[`resourceFilter${kind[0].toUpperCase()}${kind.slice(1)}`]);
      updateResourceFilters();
      return;
    }
  };
  $('#resourcesView').onclick = async event => {
    const deckNav = event.target.closest('[data-resource-deck]');
    if (deckNav) {
      activeResourceDeckId = deckNav.dataset.resourceDeck || '';
      updateResourceFilters();
      return;
    }
    const taxonomyTag = event.target.closest('[data-resource-filter-tag]');
    const taxonomyDeck = event.target.closest('[data-resource-filter-deck]');
    if (taxonomyTag || taxonomyDeck) {
      const kind = taxonomyTag ? 'tag' : 'deck';
      const id = (taxonomyTag || taxonomyDeck).dataset[`resourceFilter${kind[0].toUpperCase()}${kind.slice(1)}`];
      (kind === 'tag' ? resourceFilterTagIds : resourceFilterDeckIds).add(id);
      $('#resourceDetailDialog').close();
      updateResourceFilters();
      return;
    }
    const clear = event.target.closest('[data-clear-resource-filter]');
    if (clear) {
      const kind = clear.dataset.clearResourceFilter, id = clear.dataset.filterId;
      if (kind === 'query') $('#resourceSearch').value = '';
      else if (['type', 'language', 'status', 'topic'].includes(kind)) $(`#resource${kind[0].toUpperCase()}${kind.slice(1)}Filter`).value = 'all';
      else if (kind === 'tag') resourceFilterTagIds.delete(id);
      else if (kind === 'deck') resourceFilterDeckIds.delete(id);
      else if (kind === 'activeDeck') activeResourceDeckId = '';
      updateResourceFilters();
      return;
    }
    const button = event.target.closest('[data-resource-action]');
    if (!button) return;
    const item = state.resources.find(entry => entry.id === button.closest('[data-resource-id]')?.dataset.resourceId);
    if (!item) return;
    const action = button.dataset.resourceAction;
    if (action === 'details') return openResourceDetail(item);
    if (action === 'edit') return openResourceDialog(item);
    if (action === 'start') return updateResource(item, { status: 'active', completed_at: '' });
    if (action === 'backlog' || action === 'restore') return updateResource(item, { status: 'backlog', completed_at: '' });
    if (action === 'complete') return updateResource(item, { status: 'completed', completed_at: new Date().toISOString() });
  };
  $('#resourceDetailMeta').onclick = event => $('#resourcesView').onclick(event);
  $('#clearResourceFilters').onclick = () => {
    $('#resourceSearch').value = '';
    for (const selector of ['#resourceTypeFilter', '#resourceLanguageFilter', '#resourceStatusFilter', '#resourceTopicFilter']) $(selector).value = 'all';
    resourceFilterTagIds.clear();
    resourceFilterDeckIds.clear();
    activeResourceDeckId = '';
    updateResourceFilters();
  };
  $('#resourceSelectAll').onchange = event => {
    for (const item of visibleResources) event.target.checked ? selectedResourceIds.add(item.id) : selectedResourceIds.delete(item.id);
    renderResources();
  };
  $('#clearResourceSelection').onclick = () => { selectedResourceIds.clear(); renderResources(); };

  function renderResourceBatchValue() {
    const action = $('#resourceBatchAction').value;
    const target = $('#resourceBatchValue');
    const previous = target.value;
    target.hidden = !action || action === 'delete';
    if (!action || action === 'delete') {
      target.innerHTML = '';
    } else if (action === 'status') {
      target.innerHTML = Object.entries(resourceStatusNames).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    } else if (action === 'type') {
      target.innerHTML = state.resourceTypes.map(item => `<option value="${esc(item.id)}" data-archive-user-content>${item.emoji ? `${esc(item.emoji)} ` : ''}${esc(item.name)}</option>`).join('');
    } else {
      const items = action.includes('tags') ? state.resourceTags : state.resourceDecks;
      target.innerHTML = items.map(item => `<option value="${esc(item.id)}" data-archive-user-content>${item.emoji ? `${esc(item.emoji)} ` : ''}${esc(item.name)}</option>`).join('');
    }
    if ([...target.options].some(option => option.value === previous)) target.value = previous;
    updateResourceBatchButton();
  }
  function updateResourceBatchButton() {
    const action = $('#resourceBatchAction').value;
    const target = $('#resourceBatchValue');
    $('#applyResourceBatchAction').disabled = resourceBatchBusy || !selectedResourceIds.size || !action || (!target.hidden && !target.value);
  }
  $('#resourceBatchAction').onchange = renderResourceBatchValue;
  $('#resourceBatchValue').onchange = updateResourceBatchButton;

  async function runResourceBatch(action, value = '') {
    const targets = visibleResources.filter(item => selectedResourceIds.has(item.id));
    if (!targets.length || resourceBatchBusy) return false;
    const validActions = new Set(['status', 'type', 'add_tags', 'remove_tags', 'add_decks', 'remove_decks', 'delete']);
    const validValue = action === 'delete' ||
      action === 'status' && Object.hasOwn(resourceStatusNames, value) ||
      action === 'type' && state.resourceTypes.some(item => item.id === value) ||
      action.includes('tags') && state.resourceTags.some(item => item.id === value) ||
      action.includes('decks') && state.resourceDecks.some(item => item.id === value);
    if (!validActions.has(action) || !validValue) {
      notify('批量操作目标已失效，请重新选择。', 'error');
      renderResourceBatchValue();
      return false;
    }
    const completedAt = action === 'status' && value === 'completed' ? new Date().toISOString() : '';
    const optimistic = targets.map(item => {
      let patch = {};
      if (action === 'status') patch = { status: value, completed_at: value === 'completed' ? (item.completed_at || completedAt) : '' };
      else if (action === 'type') patch = { type: value };
      else if (action === 'delete') return { entity: 'resource', id: item.id, kind: 'delete', patch: {} };
      else {
        const field = action.includes('tags') ? 'tag_ids' : 'deck_ids';
        const current = [...new Set(item[field] || [])];
        patch = { [field]: action.startsWith('add_') ? [...new Set([...current, value])] : current.filter(id => id !== value) };
      }
      return { entity: 'resource', id: item.id, kind: 'patch', patch };
    });
    const command = {
      command: 'bulk',
      resource_ids: targets.map(item => item.id),
      action,
      ...(action === 'status' || action === 'type' ? { value } :
        ['add_tags', 'remove_tags', 'add_decks', 'remove_decks'].includes(action) ? { ids: [value] } : {}),
      ...(completedAt ? { completed_at: completedAt } : {}),
    };
    resourceBatchBusy = true;
    renderResources();
    try {
      const instance = resourceEngine();
      const saved = collectionsEngine
        ? await commitSync(engineInstance => engineInstance.command(command, optimistic), instance)
        : await commitSync(engineInstance => engineInstance.batch(optimistic.map(change => ({
          action: change.kind === 'delete' ? 'remove' : 'put',
          entity: change.entity,
          id: change.id,
          ...(change.kind === 'delete' ? {} : { data: change.patch }),
        }))), instance);
      if (saved) selectedResourceIds.clear();
      return saved;
    } finally {
      resourceBatchBusy = false;
      renderResources();
    }
  }

  $('#applyResourceBatchAction').onclick = () => runResourceBatch($('#resourceBatchAction').value, $('#resourceBatchValue').value);
  $('#deleteSelectedResources').onclick = async () => {
    const doomed = visibleResources.filter(item => selectedResourceIds.has(item.id));
    if (!doomed.length || !await confirmAction(`确定删除所选的 ${doomed.length} 项资源吗？`, { title: '删除资源', confirmLabel: '删除所选' })) return;
    snapshotBackup('before-delete-resources');
    if (doomed.some(item => !editableSyncRecord('resource', item.id, item))) return;
    if (await runResourceBatch('delete')) {
      save();
      renderResources();
    }
  };

  function resourceConfigRow(kind, item) {
    const noun = { language: '语言', type: '类型', tag: '标签', deck: '收藏册' }[kind] || '配置';
    const field = { language: 'language_id', type: 'type', tag: 'tag_ids', deck: 'deck_ids' }[kind];
    const count = state.resources.filter(resource => Array.isArray(resource[field]) ? resource[field].includes(item.id) : resource[field] === item.id).length;
    const hasEmoji = ['type', 'tag', 'deck'].includes(kind);
    const editing = editingResourceConfigKeys.has(`${kind}:${item.id}`);
    const label = `${noun}“${item.name}”`;
    const button = (verb, text, className = 'btn') =>
      `<button class="${className}" data-config-action="${verb}" type="button" aria-label="${text}${esc(label)}">${text}</button>`;
    const actions = button('view', '查看') +
      (editing ? button('save', '保存', 'btn primary') + button('cancel', '取消') : button('edit', '编辑')) +
      (kind === 'tag' || kind === 'type' ? button('merge', '合并') : '') +
      button('remove', '移除', 'btn danger');
    const emoji = hasEmoji
      ? editing
        ? `<input class="resource-type-emoji" value="${esc(item.emoji || '')}" maxlength="16" aria-label="编辑${noun}图标" placeholder="📌">`
        : `<span class="resource-config-value resource-config-emoji" aria-hidden="true">${esc(item.emoji || '·')}</span>`
      : '';
    const name = editing
      ? `<input class="resource-config-name" value="${esc(item.name)}" maxlength="80" aria-label="编辑${noun}名称">`
      : `<span class="resource-config-value resource-config-name" data-resource-user-content>${esc(item.name)}</span>`;
    const description = kind === 'deck'
      ? editing
        ? `<input class="resource-config-description" value="${esc(item.description || '')}" maxlength="500" aria-label="编辑收藏册说明" placeholder="说明（可选）">`
        : `<span class="resource-config-value resource-config-description" data-resource-user-content>${esc(item.description || '')}</span>`
      : '';
    return `<div class="resource-config-row${editing ? ' editing' : ''}" data-config-kind="${kind}" data-config-key="${esc(item.id)}">${emoji}${name}${description}<span class="resource-config-count">${count} 项</span><div class="resource-config-actions">${actions}</div></div>`;
  }

  function renderResourceSettings(force = false) {
    if (resourceSettingsBusy) return;
    const focused = Boolean(document.activeElement?.closest?.('.resource-config-row'));
    if (settingsDirtyRows.size || focused) {
      // 即使 force 也不覆盖脏行；只追加新配置，避免其他未保存项挡住新增项。
      for (const [kind, items, selector] of [['language', state.resourceLanguages, '#resourceLanguageSettings'], ['type', state.resourceTypes, '#resourceTypeSettings'], ['tag', state.resourceTags, '#resourceTagSettings']]) {
        const list = $(selector);
        for (const item of items) {
          if ([...list.querySelectorAll('[data-config-key]')].some(row => row.dataset.configKey === item.id)) continue;
          list.insertAdjacentHTML('beforeend', resourceConfigRow(kind, item));
        }
      }
      if (settingsDirtyRows.size || !force) return;
    }
    $('#resourceLanguageSettings').innerHTML = state.resourceLanguages.map(item => resourceConfigRow('language', item)).join('');
    $('#resourceTypeSettings').innerHTML = state.resourceTypes.map(item => resourceConfigRow('type', item)).join('');
    const query = $('#resourceTagSettingsSearch').value.trim().toLocaleLowerCase();
    const sort = $('#resourceTagSettingsSort').value;
    const tags = state.resourceTags.filter(item => !query || `${item.name} ${item.emoji || ''}`.toLocaleLowerCase().includes(query));
    tags.sort((a, b) => {
      const count = item => state.resources.filter(resource => (resource.tag_ids || []).includes(item.id)).length;
      if (sort === 'count-desc') return count(b) - count(a) || a.name.localeCompare(b.name);
      if (sort === 'count-asc') return count(a) - count(b) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name, state.displayLanguage === 'en' ? 'en' : 'zh-CN');
    });
    $('#resourceTagSettings').innerHTML = tags.map(item => resourceConfigRow('tag', item)).join('') ||
      '<p class="small">暂无结果</p>';
    renderResourceDeckSettings();
  }
  const resourceSettingsData = () => structuredClone({
    schema_version: 4,
    languages: state.resourceLanguages,
    groups: state.resourceGroups,
    types: state.resourceTypes,
    tags: state.resourceTags,
    decks: state.resourceDecks,
  });
  function validResourceSettings(settings) {
    for (const [key, limit] of [['languages', 200], ['groups', 200], ['types', 500], ['tags', 1000], ['decks', 500]]) {
      const names = new Set(), ids = new Set();
      if (!Array.isArray(settings[key]) || settings[key].length > limit) return false;
      for (const item of settings[key]) {
        const name = item.name?.trim();
        const normalized = String(name || '').normalize('NFKC').replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
        if (!item.id || ids.has(item.id) || !name || name.length > 80 || names.has(normalized) || key === 'languages' && name === '不限语言' ||
            key === 'decks' && String(item.description || '').length > 500) return false;
        ids.add(item.id); names.add(normalized);
      }
    }
    return true;
  }

  async function persistResourceSettings(settings) {
    if (!validResourceSettings(settings)) { notify('名称不能为空或重复，ID 必须唯一；不限语言是独立选项。', 'error'); return false; }
    if (resourceSettingsBusy) return false;
    resourceSettingsBusy = true;
    $('#resourceSettingsView').inert = true;
    $('#resourceDeckDialog').inert = true;
    try {
      const saved = await saveResourceSettingsToCloud(settings);
      if (saved) { save(); renderResources(); }
      return saved;
    } finally { resourceSettingsBusy = false; $('#resourceSettingsView').inert = false; $('#resourceDeckDialog').inert = false; }
  }

  const markSettingsDirty = event => {
    const row = event.target.closest('[data-config-kind],form');
    if (row) settingsDirtyRows.add(row);
  };
  $('#resourceSettingsView').addEventListener('input', markSettingsDirty);
  $('#resourceSettingsView').addEventListener('change', markSettingsDirty);
  $('#resourceDeckDialog').addEventListener('input', markSettingsDirty);
  $('#resourceDeckDialog').addEventListener('change', markSettingsDirty);
  for (const [formId, inputId, key] of [
    ['addResourceLanguageForm', 'newResourceLanguage', 'languages'],
    ['addResourceTypeForm', 'newResourceType', 'types'],
    ['addResourceTagForm', 'newResourceTag', 'tags'],
  ]) {
    $('#' + formId).onsubmit = async event => {
      event.preventDefault();
      const input = $('#' + inputId), settings = resourceSettingsData();
      const item = { id: crypto.randomUUID(), name: input.value.trim() };
      if (key === 'types' || key === 'tags') item.emoji = firstGrapheme($(key === 'types' ? '#newResourceTypeEmoji' : '#newResourceTagEmoji')?.value || '');
      settings[key].push(item);
      if (!await persistResourceSettings(settings)) return;
      input.value = '';
      if (key === 'types') $('#newResourceTypeEmoji').value = '';
      if (key === 'tags') $('#newResourceTagEmoji').value = '';
      settingsDirtyRows.delete($('#' + formId));
      renderResourceSettings(true);
      notify('资源设置已保存本机；云端进度请查看同步状态。');
    };
  }

  function renderResourceDeckSettings() {
    if (!$('#resourceDeckSettings')) return;
    $('#resourceDeckSettings').innerHTML = state.resourceDecks.map(item => resourceConfigRow('deck', item)).join('') ||
      '<p class="small">暂无收藏册</p>';
  }

  async function runTaxonomyCommand(command, nextSettings, resourceChanges) {
    const optimistic = [
      { entity: 'settings', id: 'resources', kind: 'patch', patch: nextSettings },
      ...resourceChanges.map(({ item, patch }) => ({ entity: 'resource', id: item.id, kind: 'patch', patch })),
    ];
    if (collectionsEngine) return commitSync(instance => instance.command(command, optimistic), collectionsEngine);
    return commitSync(instance => instance.batch([
      ...resourceChanges.map(({ item, patch }) => ({ action: 'put', entity: 'resource', id: item.id, data: patch })),
      { action: 'put', entity: 'settings', id: 'resources', data: nextSettings },
    ]), resourceEngine());
  }

  async function handleResourceConfigAction(action, row) {
    if (!action || resourceSettingsBusy) return;
    const kind = row.dataset.configKind, id = row.dataset.configKey;
    const key = { language: 'languages', type: 'types', tag: 'tags', deck: 'decks' }[kind];
    const settings = resourceSettingsData(), item = settings[key]?.find(entry => entry.id === id);
    if (!item) return notify('此配置已被远端移除，输入保留；请先处理同步状态。', 'error');
    const verb = action.dataset.configAction;
    if (verb === 'edit') {
      editingResourceConfigKeys.add(`${kind}:${id}`);
      renderResourceSettings(true);
      const target = document.querySelector(`[data-config-kind="${kind}"][data-config-key="${CSS.escape(id)}"] .resource-config-name`);
      target?.focus();
      target?.select();
      return;
    }
    if (verb === 'cancel') {
      editingResourceConfigKeys.delete(`${kind}:${id}`);
      settingsDirtyRows.delete(row);
      renderResourceSettings(true);
      setTimeout(() => {
        document.querySelector(`[data-config-kind="${kind}"][data-config-key="${CSS.escape(id)}"] [data-config-action="edit"]`)?.focus();
      });
      return;
    }
    if (verb === 'view') {
      if (kind === 'tag') resourceFilterTagIds.add(id);
      else if (kind === 'deck') activeResourceDeckId = id;
      else if (kind === 'type') $('#resourceTypeFilter').value = id;
      else if (kind === 'language') $('#resourceLanguageFilter').value = id;
      $('#resourceDeckDialog').close();
      await activateView('resources');
      renderResources();
      return;
    }
    if (verb === 'save') {
      item.name = row.querySelector('.resource-config-name').value.trim();
      if (['type', 'tag', 'deck'].includes(kind)) item.emoji = firstGrapheme(row.querySelector('.resource-type-emoji')?.value || '');
      if (kind === 'deck') item.description = row.querySelector('.resource-config-description')?.value.trim() || '';
      if (!await persistResourceSettings(settings)) return;
    } else if (verb === 'merge' && (kind === 'tag' || kind === 'type')) {
      const noun = kind === 'tag' ? '标签' : '类型';
      const targetName = prompt(`将“${item.name}”合并到哪个${noun}？请输入目标${noun}名称。`);
      if (!targetName) return;
      const target = settings[key].find(entry => entry.id !== id && normalizeSettingName(entry.name) === normalizeSettingName(targetName));
      if (!target) return notify(`没有找到唯一的目标${noun}；请先确认名称。`, 'error');
      const changes = state.resources.filter(resource =>
        kind === 'tag' ? (resource.tag_ids || []).includes(id) : resource.type === id).map(resource => ({
        item: resource,
        patch: kind === 'tag'
          ? { tag_ids: [...new Set(resource.tag_ids.map(tagId => tagId === id ? target.id : tagId))] }
          : { type: target.id },
      }));
      if (!await confirmAction(`合并后，${changes.length} 项资源会改用“${target.name}”。`, { title: `合并${noun}`, confirmLabel: '合并' })) return;
      if (!await runTaxonomyCommand(
        { command: kind === 'tag' ? 'merge_tag' : 'delete_type', source_id: id, target_id: target.id },
        { [key]: settings[key].filter(entry => entry.id !== id) },
        changes,
      )) return;
    } else if (verb === 'remove') {
      if (kind === 'type') {
        const affected = state.resources.filter(resource => resource.type === id);
        if (affected.length) {
          const targetName = prompt(`“${item.name}”仍被 ${affected.length} 项资源使用。请输入重新分配的目标类型名称。`);
          if (!targetName) return;
          const target = settings.types.find(entry => entry.id !== id && normalizeSettingName(entry.name) === normalizeSettingName(targetName));
          if (!target) return notify('没有找到唯一的目标类型。', 'error');
          if (!await confirmAction(`将 ${affected.length} 项资源改为“${target.name}”，并移除“${item.name}”？`, { title: '重新分配类型', confirmLabel: '重新分配并移除' })) return;
          if (!await runTaxonomyCommand(
            { command: 'delete_type', source_id: id, target_id: target.id },
            { types: settings.types.filter(entry => entry.id !== id) },
            affected.map(resource => ({ item: resource, patch: { type: target.id } })),
          )) return;
        } else {
          settings.types = settings.types.filter(entry => entry.id !== id);
          if (!await persistResourceSettings(settings)) return;
        }
      } else if (kind === 'tag' || kind === 'deck') {
        const field = kind === 'tag' ? 'tag_ids' : 'deck_ids';
        const affected = state.resources.filter(resource => (resource[field] || []).includes(id));
        if (!await confirmAction(`移除“${item.name}”及其在 ${affected.length} 项资源上的关联？资源本身不会删除。`, { title: `移除${kind === 'tag' ? '标签' : '收藏册'}`, confirmLabel: '移除关联' })) return;
        if (!await runTaxonomyCommand(
          { command: kind === 'tag' ? 'delete_tag' : 'delete_deck', source_id: id },
          { [key]: settings[key].filter(entry => entry.id !== id) },
          affected.map(resource => ({ item: resource, patch: { [field]: resource[field].filter(value => value !== id) } })),
        )) return;
      } else {
        const inUse = state.resources.some(resource => resource.language_id === id);
        if (inUse) return notify('此语言仍被资源使用，请先修改这些资源。', 'error');
        if (!await confirmAction(`移除“${item.name}”？其稳定 ID 不会被重用。`, { title: '移除语言', confirmLabel: '移除' })) return;
        settings.languages = settings.languages.filter(entry => entry.id !== id);
        if (!await persistResourceSettings(settings)) return;
      }
    }
    editingResourceConfigKeys.delete(`${kind}:${id}`);
    settingsDirtyRows.delete(row);
    renderResourceSettings(true);
    setTimeout(() => {
      document.querySelector(`[data-config-kind="${kind}"][data-config-key="${CSS.escape(id)}"] [data-config-action="edit"]`)?.focus();
    });
    renderResources();
    notify('资源设置已保存本机；云端进度请查看同步状态。');
  }

  $('#resourceSettingsView').onclick = async event => {
    const action = event.target.closest('[data-config-action]');
    if (action) await handleResourceConfigAction(action, action.closest('[data-config-kind]'));
  };
  $('#resourceTagSettingsSearch').oninput = () => renderResourceSettings(true);
  $('#resourceTagSettingsSort').onchange = () => renderResourceSettings(true);
  const deckDialogIsDirty = () => [...settingsDirtyRows].some(item => item.closest?.('#resourceDeckDialog'));
  const closeResourceDeckDialog = async () => {
    if (deckDialogIsDirty() &&
        !await confirmAction('关闭后将放弃尚未保存的收藏册输入。', { title: '放弃修改', confirmLabel: '放弃' })) return;
    for (const item of [...settingsDirtyRows]) if (item.closest?.('#resourceDeckDialog')) settingsDirtyRows.delete(item);
    editingResourceConfigKeys.forEach(key => { if (key.startsWith('deck:')) editingResourceConfigKeys.delete(key); });
    $('#addResourceDeckForm').reset();
    $('#resourceDeckDialog').close();
  };
  $('#manageResourceDecks').onclick = () => {
    if (!deckDialogIsDirty()) renderResourceDeckSettings();
    $('#resourceDeckDialog').showModal();
  };
  $('#closeResourceDecks').onclick = closeResourceDeckDialog;
  $('#resourceDeckDialog').oncancel = event => { event.preventDefault(); void closeResourceDeckDialog(); };
  $('#resourceDeckDialog').onclick = async event => {
    if (event.target === $('#resourceDeckDialog')) return closeResourceDeckDialog();
    const action = event.target.closest('[data-config-action]');
    if (action) await handleResourceConfigAction(action, action.closest('[data-config-kind]'));
  };
  $('#addResourceDeckForm').onsubmit = async event => {
    event.preventDefault();
    const settings = resourceSettingsData();
    const timestamp = new Date().toISOString();
    settings.decks.push({
      id: crypto.randomUUID(),
      name: $('#newResourceDeck').value.trim(),
      emoji: firstGrapheme($('#newResourceDeckEmoji').value),
      description: $('#newResourceDeckDescription').value.trim(),
      created_at: timestamp,
      updated_at: timestamp,
    });
    if (!await persistResourceSettings(settings)) return;
    settingsDirtyRows.delete(event.currentTarget);
    event.currentTarget.reset();
    renderResourceDeckSettings();
  };

  // ── 导航切换 ──────────────────────────────────────
  const validViews = new Set([...NOTEBOOK_VIEWS, 'resources', 'resource-settings']);
  function syncRouteState(view = document.body.dataset.activeView || 'editor', replace = false) {
    if (!validViews.has(view)) view = 'editor';
    const url = new URL(location.href);
    url.searchParams.set('view', view);
    ['language','query','topic','type','status','tag','deck','collection','sort','chat'].forEach(key => url.searchParams.delete(key));
    if (view === 'cards') {
      const language = $('#reviewLanguageFilter').value;
      const query = $('#reviewSearch').value.trim();
      if (language !== 'all') url.searchParams.set('language', language);
      if (query) url.searchParams.set('query', query);
    }
    if (view === 'resources') {
      const query = $('#resourceSearch').value.trim(), topic = $('#resourceTopicFilter').value, type = $('#resourceTypeFilter').value;
      const language = $('#resourceLanguageFilter').value, status = $('#resourceStatusFilter').value, sort = $('#resourceSort').value;
      if (query) url.searchParams.set('query', query);
      if (topic !== 'all') url.searchParams.set('topic', topic);
      if (type !== 'all') url.searchParams.set('type', type);
      if (language !== 'all') url.searchParams.set('language', language);
      if (status !== 'all') url.searchParams.set('status', status);
      if (sort !== 'updated') url.searchParams.set('sort', sort);
      for (const id of resourceFilterTagIds) url.searchParams.append('tag', id);
      for (const id of resourceFilterDeckIds) url.searchParams.append('deck', id);
      if (activeResourceDeckId) url.searchParams.set('collection', activeResourceDeckId);
    }
    if (view === 'conversation' && state.activeChatTabId) url.searchParams.set('chat', state.activeChatTabId);
    history[replace ? 'replaceState' : 'pushState']({ view }, '', url);
  }

  function applyRouteControls() {
    const params = new URLSearchParams(location.search);
    const requestedView = params.get('view');
    const view = requestedView ? (validViews.has(requestedView) ? requestedView : 'editor') : (validViews.has(state.lastNotebookView) ? state.lastNotebookView : 'editor');
    if (view === 'cards') {
      const language = params.get('language');
      if (['all','en','nl','ja'].includes(language)) $('#reviewLanguageFilter').value = language;
      $('#reviewSearch').value = params.get('query') || '';
    }
    if (view === 'resources') {
      $('#resourceSearch').value = params.get('query') || '';
      const type = params.get('type');
      if ([...$('#resourceTypeFilter').options].some(option => option.value === type)) $('#resourceTypeFilter').value = type;
      const language = params.get('language');
      if ([...$('#resourceLanguageFilter').options].some(option => option.value === language)) $('#resourceLanguageFilter').value = language;
      const status = params.get('status');
      if ([...$('#resourceStatusFilter').options].some(option => option.value === status)) $('#resourceStatusFilter').value = status;
      const topic = params.get('topic');
      if ([...$('#resourceTopicFilter').options].some(option => option.value === topic)) $('#resourceTopicFilter').value = topic;
      const sort = params.get('sort');
      if ([...$('#resourceSort').options].some(option => option.value === sort)) $('#resourceSort').value = sort;
      resourceFilterTagIds.clear();
      resourceFilterDeckIds.clear();
      for (const id of params.getAll('tag')) if (id === '__none__' || state.resourceTags.some(item => item.id === id)) resourceFilterTagIds.add(id);
      for (const id of params.getAll('deck')) if (id === '__none__' || state.resourceDecks.some(item => item.id === id)) resourceFilterDeckIds.add(id);
      const collection = params.get('collection');
      activeResourceDeckId = state.resourceDecks.some(item => item.id === collection) ? collection : '';
    }
    if (view === 'conversation') {
      const chat = params.get('chat');
      if (state.chatTabs.some(tab => tab.id === chat)) state.activeChatTabId = chat;
    }
    return view;
  }

  async function activateView(view, navigationButton = null, { updateUrl = true, replaceUrl = false } = {}) {
      if (!validViews.has(view)) view = 'editor';
      const isResource = view === 'resources' || view === 'resource-settings';
      if (!isResource) state.lastNotebookView = view;
      document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', !isResource && (navigationButton ? x === navigationButton : x.dataset.view === view)));
      document.querySelectorAll('[data-product-view]').forEach(button => {
        const selected = button.dataset.productView === (isResource ? 'resources' : 'notebook');
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      $('#productMark').textContent = isResource ? '🗂️' : '📓';
      document.body.dataset.activeView = view;
      setInterfaceLanguageTheme(view === 'editor' ? state.currentLanguage : view === 'conversation' ? state.chatLanguage : view === 'cards' ? ($('#reviewLanguageFilter').value === 'all' ? 'en' : $('#reviewLanguageFilter').value) : view === 'daily-review' ? (state.reviewMode === 'mixed' ? 'en' : state.cardLanguage) : 'en');
      $('#workspace').hidden = view === 'history' || view === 'settings' || view === 'cards' || view === 'daily-review' || view === 'conversation' || view === 'resources' || view === 'resource-settings';
      $('#archiveView').hidden = view !== 'history';
      $('#settingsView').hidden = view !== 'settings';
      reviewView.hidden = view !== 'cards';
      dailyReviewView.hidden = view !== 'daily-review';
      $('#conversationView').hidden = view !== 'conversation';
      $('#resourcesView').hidden = view !== 'resources';
      $('#resourceSettingsView').hidden = view !== 'resource-settings';
      if (view === 'history') {
        renderArchives();
        // 切换视图只读取投影，手动同步和用户写操作负责网络同步。
      }
      if (view === 'settings') populateSettingsForm();
      if (view === 'cards') openReviewPage(false);
      if (view === 'daily-review') await openDailyReviewPage(true, false);
      if (view === 'conversation') updateConversationControls();
      if (view === 'resources') {
        renderResources();
      }
      if (view === 'resource-settings') renderResourceSettings();
      if (view === 'settings') renderSyncPanel();
      save();
      if (updateUrl) syncRouteState(view, replaceUrl);
  }

  document.querySelectorAll('.nav button').forEach(b => {
    b.onclick = () => activateView(b.dataset.view, b);
  });
  document.querySelector('[data-product-view="notebook"]').onclick = () => activateView(state.lastNotebookView);
  document.querySelector('[data-product-view="resources"]').onclick = () => activateView('resources');
  $('#syncStatus').onclick = () => activateView('settings');
  $('#collapseFlashcards').onclick = () => setFlashcardPanelCollapsed(true);
  $('#restoreFlashcards').onclick = () => setFlashcardPanelCollapsed(false);
  window.addEventListener('popstate', () => activateView(applyRouteControls(), null, { updateUrl: true, replaceUrl: true }));

  // ── 初始化：先读取引擎并完成一次候选迁移，再使用投影 ────────────
  $('#docTitle').value = state.title || '';
  $('#documentDate').value = state.documentDate;
  setEditorContent(state.html || '');
  const hasDraft = Boolean(editorText().trim() || state.html);
  setEditorEditable(hasDraft);
  editor.classList.toggle('is-blank', !hasDraft);
  $('#newTextPrompt').hidden = hasDraft;
  let instance, collectionInstance;
  [instance, collectionInstance] = await Promise.all([
    NotebookSync.open({
      scope: initialScope,
      fetchState: () => syncTransport(initialScope, '/api/sync/state'),
      sendOperation: operation => syncTransport(initialScope, '/api/sync/operations', operation),
      onChange: () => {
        if (!syncInitialized || engine !== instance || activeScope !== initialScope) return;
        applySyncProjection();
        if (instance.status().pending) scheduleSyncFlush(instance);
      },
    }),
    NotebookSync.open({
      scope: initialScope,
      storageKey: `${initialScope}::collections-v1`,
      fetchState: () => syncTransport(initialScope, '/api/collections/state'),
      sendOperation: operation => syncTransport(initialScope, '/api/collections/operations', operation),
      sendCommand: command => syncTransport(initialScope, '/api/collections/commands', command),
      onChange: () => {
        if (!syncInitialized || activeScope !== initialScope) return;
        if (collectionsEngine === collectionInstance) {
          applySyncProjection();
          if (collectionInstance.status().pending) scheduleSyncFlush(collectionInstance);
        }
        else if (collectionsRecoveryEngine === collectionInstance) {
          updateSyncIndicator();
          renderSyncPanel();
          if (collectionInstance.status().pending) scheduleSyncFlush(collectionInstance);
        }
      },
    }),
  ]);
  engine = instance;
  const collectionStatus = collectionInstance.status();
  const useCollections = collectionStatus.collectionsSchema >= 1 &&
    collectionStatus.remoteMode === 'active' &&
    (collectionStatus.objects > 0 || collectionStatus.pending || collectionStatus.conflicts ||
      collectionStatus.candidates || collectionStatus.epochChanged);
  if (useCollections) collectionsEngine = collectionInstance;
  else if (collectionStatus.pending || collectionStatus.conflicts || collectionStatus.candidates ||
      collectionStatus.preserved || collectionStatus.stagedBackups || collectionStatus.epochChanged) {
    collectionsRecoveryEngine = collectionInstance;
  } else collectionInstance.close();

  const legacyFingerprint = raw => {
    if (typeof raw !== 'string') return null;
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index++) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${raw.length}:${(hash >>> 0).toString(16)}`;
  };
  migration.legacyFingerprint ??= legacyFingerprint(migration.raw);
  migration.legacyBackupFingerprint ??= legacyFingerprint(migration.backupRaw);
  localStorage.setItem(migrationKey, JSON.stringify(migration));
  const preserveLaterLegacyWrite = async (raw, fingerprintKey, announce = false) => {
    const fingerprint = legacyFingerprint(raw);
    if (!fingerprint || fingerprint === migration[fingerprintKey]) return false;
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      // 即使旧标签页写出损坏 JSON，也把逐字内容留在迁移记录中，不能静默覆盖。
      migration[`${fingerprintKey}UnreadableRaw`] = raw;
      migration[fingerprintKey] = fingerprint;
      localStorage.setItem(migrationKey, JSON.stringify(migration));
      if (announce) notify('检测到旧标签页数据，但格式无效；原始内容已保留在迁移备份中。', 'error');
      return false;
    }
    const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
      (parsed.state || parsed.sync || parsed.collectionsSync)
      ? { ...parsed, scope: parsed.scope || initialScope }
      : { version: 1, scope: initialScope, state: parsed };
    if (collectionsEngine) {
      await engine.stageBackup(payload, {
        entities: ['card', 'document'],
        includeSettings: false,
        includeDrafts: true,
      });
      await collectionsEngine.stageBackup(payload, {
        entities: ['resource'],
        includeSettings: true,
        includeDrafts: false,
      });
    } else {
      await engine.stageBackup(payload);
    }
    migration[fingerprintKey] = fingerprint;
    migration.lastLegacyHandoffAt = new Date().toISOString();
    localStorage.setItem(migrationKey, JSON.stringify(migration));
    if (syncInitialized) applySyncProjection();
    if (announce) notify('检测到旧标签页的新修改，已保留为待确认恢复内容。');
    return true;
  };

  if (migration.scope === initialScope && legacyState) {
    await engine.migrateLegacy({
      cards: (legacyState.items || []).map(({ nextReview, ...card }) => ({ ...card, ...(card.next_review || nextReview ? { next_review: card.next_review || nextReview } : {}) })),
      documents: legacyState.archives || [],
      resources: collectionsEngine ? [] : (legacyState.resources || []),
      settings: collectionsEngine ? null : {
        languages: legacyState.resourceLanguages || [],
        groups: legacyState.resourceGroups || [],
        types: legacyState.resourceTypes || [],
        tags: legacyState.resourceTags || [],
        decks: legacyState.resourceDecks || [],
      },
    });
    if (collectionsEngine) {
      await collectionsEngine.migrateLegacy({
        resources: legacyState.resources || [],
        settings: {
          languages: legacyState.resourceLanguages || [],
          groups: legacyState.resourceGroups || [],
          types: legacyState.resourceTypes || [],
          tags: legacyState.resourceTags || [],
          decks: legacyState.resourceDecks || [],
        },
      });
    }
  }
  if (migration.scope === initialScope) {
    await preserveLaterLegacyWrite(legacyRaw, 'legacyFingerprint');
    await preserveLaterLegacyWrite(legacyBackupRaw, 'legacyBackupFingerprint');
  }
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || !event.newValue) return;
    const fingerprintKey = event.key === legacyKey
      ? 'legacyFingerprint'
      : event.key === legacyBackupKey
        ? 'legacyBackupFingerprint'
        : null;
    if (fingerprintKey) {
      void preserveLaterLegacyWrite(event.newValue, fingerprintKey, true)
        .catch(error => notify(`旧标签页修改尚未导入：${error.message}。原 localStorage 内容仍保留。`, 'error'));
    }
  });
  const resourcesStore = resourceEngine();
  if (!resourcesStore.view('settings').some(item => item.id === 'resources') && !isApiOnline()) {
    await resourcesStore.put('settings', 'resources', initialResourceSettings());
  }
  syncInitialized = true;
  localStorage.setItem(scopeKey, initialScope);
  applySyncProjection();
  applyLanguageUI();
  renderEditorTools();
  applyEditorMode();
  applyLanguageAssistantState();
  renderCapturedPhrases();
  setSaveModeUI();
  save();
  render();
  renderVideo();
  renderAudio();
  renderArchives();
  renderResources();
  renderResourceSettings();
  renderSyncPanel();
  if (FEATURES.conversation) updateConversationControls();
  applyInterfaceLanguage();
  applySiteFontScale();
  applyFlashcardPanelState();
  if (!localStorage.getItem(backupKey)) snapshotBackup('initial');
  document.body.inert = false;
  await activateView(applyRouteControls(), null, { updateUrl: true, replaceUrl: true });
  // 迁移可能新增本机修改；首次同步也会读取云端，随后由引擎发送待保存内容。
  refreshSyncWhenAvailable();
})().catch(error => {
  document.body.inert = false;
  const status = document.querySelector('#saveStatus');
  if (status) {
    status.dataset.state = 'error';
    status.innerHTML = '<span class="local-save-dot" aria-hidden="true"></span><span class="save-status-copy">初始化失败</span>';
  }
  console.error('同步初始化失败：', error);
  const { notify } = createFeedback(selector => document.querySelector(selector));
  notify(`同步初始化失败：${error.message}。请保留本机数据，勿直接覆盖恢复备份。`, 'error');
});
