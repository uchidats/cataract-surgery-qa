// code-yomereba-ii/assets/quiz.js の選択・出題・回答・復習フローを移植。
(() => {
  "use strict";
  const STORAGE_KEY = "cataractSurgeryQaProgressV1";
  const MAX_QUESTIONS = 10;
  const get = id => document.getElementById(id);
  const setup = get("quiz-setup");
  const panel = get("quiz-panel");
  const result = get("quiz-result");
  const categoryList = get("quiz-category-list");
  const form = get("quiz-form");
  const choices = get("quiz-choices");
  const submit = get("quiz-submit");
  const feedback = get("quiz-feedback");
  const next = get("quiz-next");
  const startBtn = get("quiz-start");
  const verdicts = { correct: "○ 正解", incorrect: "× 不正解", unknown: "？ わからない" };
  let round = [], position = 0, answered = false, responses = [];

  function storageWarning() {
    get("storage-warning").textContent = "進捗を保存できません。このページを開いている間は学習を続けられます。";
    get("storage-warning").hidden = false;
  }
  function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      storageWarning();
      return {};
    }
  }
  let progress = loadProgress();
  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      get("storage-warning").hidden = true;
    } catch { storageWarning(); }
  }
  function setRecord(id, status) {
    const old = progress[id] || {};
    progress[id] = {
      // 一度正解した問題の習得状態は従来どおり維持する。
      mastered: status === "correct" || old.mastered === true,
      lastStatus: status,
      attempts: (Number.isFinite(old.attempts) ? old.attempts : 0) + 1,
      updatedAt: new Date().toISOString()
    };
    saveProgress();
    updatePoolInfo();
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  CHAPTERS.forEach((chapter, index) => {
    const count = QUESTIONS.filter(q => q.chapter === chapter).length;
    const label = element("label", undefined, "quiz-cat-option");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "chapter";
    input.value = chapter;
    input.checked = count > 0;
    input.disabled = count === 0;
    const badge = element("span", undefined, "quiz-cat-count");
    badge.id = `chapter-count-${index}`;
    label.append(input, element("span", chapter), badge);
    categoryList.append(label);
  });
  function getCandidatePool() {
    const selected = [...categoryList.querySelectorAll("input:checked")].map(input => input.value);
    const mode = get("quiz-mode-list").querySelector("input:checked").value;
    const scope = QUESTIONS.filter(q => selected.includes(q.chapter));
    const pool = scope.filter(q => {
      const record = progress[q.id];
      if (mode === "unmastered") return !record?.mastered;
      if (mode === "all") return true;
      return record?.lastStatus === mode;
    });
    return { selected, mode, scope, pool };
  }
  function updatePoolInfo() {
    CHAPTERS.forEach((chapter, index) => {
      const scope = QUESTIONS.filter(q => q.chapter === chapter);
      const mastered = scope.filter(q => progress[q.id]?.mastered).length;
      const badge = get(`chapter-count-${index}`);
      badge.textContent = scope.length === 0 ? "準備中" : mastered === scope.length
        ? `✓ ${mastered} / ${scope.length}問` : `未習得 ${scope.length - mastered} / ${scope.length}問`;
      badge.classList.toggle("quiz-cat-completed", scope.length > 0 && mastered === scope.length);
    });
    get("mastery-progress").textContent = `全体の習得：${QUESTIONS.filter(q => progress[q.id]?.mastered).length} / ${QUESTIONS.length}問`;
    const { selected, mode, scope, pool } = getCandidatePool();
    get("quiz-category-error").hidden = selected.length > 0;
    startBtn.disabled = pool.length === 0;
    get("quiz-pool-info").textContent = selected.length === 0 ? "" : pool.length > 0
      ? `出題候補：${pool.length}問 → ランダム${Math.min(pool.length, MAX_QUESTIONS)}問`
      : mode === "unmastered" && scope.length > 0
        ? "選択した単元はすべて習得済みです。「全問復習」で再挑戦できます。"
        : "この条件に該当する問題はありません。";
  }
  function showQuestion() {
    answered = false;
    const q = round[position];
    get("quiz-progress").textContent = `全${round.length}問中 ${position + 1}問目`;
    get("quiz-chapter").textContent = q.chapter;
    get("quiz-question").textContent = q.question;
    feedback.hidden = true;
    next.hidden = true;
    submit.disabled = true;
    choices.disabled = false;
    get("quiz-options").replaceChildren();
    [...q.choices, "わからない"].forEach((text, index) => {
      const label = element("label", undefined, "quiz-option");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = index === q.choices.length ? "unknown" : String(index);
      input.required = true;
      label.append(input, element("span", text));
      get("quiz-options").append(label);
    });
    get("quiz-question").focus();
  }
  function start() {
    const { pool } = getCandidatePool();
    if (!pool.length) return;
    round = [...pool];
    // 参照実装と同じ Fisher–Yates。元の問題配列は変更しない。
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    round = round.slice(0, MAX_QUESTIONS);
    position = 0;
    responses = [];
    setup.hidden = true;
    result.hidden = true;
    panel.hidden = false;
    showQuestion();
  }
  form.addEventListener("change", () => { if (!answered) submit.disabled = false; });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const selected = form.querySelector('input[name="answer"]:checked');
    if (answered || !selected) return;
    answered = true;
    const q = round[position];
    const status = selected.value === "unknown" ? "unknown"
      : Number(selected.value) === q.correctIndex ? "correct" : "incorrect";
    responses.push({ question: q, selected: selected.value, status });
    setRecord(q.id, status);
    choices.disabled = true;
    submit.disabled = true;
    get("quiz-verdict").textContent = verdicts[status];
    feedback.dataset.correct = String(status === "correct");
    feedback.dataset.verdict = status;
    get("quiz-correct-answer").textContent = `正解：${q.choices[q.correctIndex]}`;
    get("quiz-explanation").textContent = q.feedback;
    get("quiz-source").textContent = `『スタンダード白内障手術』 ${q.source}`;
    feedback.hidden = false;
    next.textContent = position === round.length - 1 ? "結果を見る" : "次の問題";
    next.hidden = false;
    feedback.focus();
  });
  next.addEventListener("click", () => {
    if (!answered || panel.hidden) return;
    position++;
    if (position < round.length) return showQuestion();
    panel.hidden = true;
    result.hidden = false;
    const count = status => responses.filter(r => r.status === status).length;
    get("quiz-score").textContent = `${round.length}問中${count("correct")}問正解`;
    get("quiz-summary").textContent = `正解 ${count("correct")}問 ／ 不正解 ${count("incorrect")}問 ／ わからない ${count("unknown")}問`;
    const review = get("quiz-review");
    review.replaceChildren();
    const mistakes = responses.filter(r => r.status !== "correct");
    if (!mistakes.length) review.append(element("p", "今回は復習が必要な問題はありません。"));
    for (const { question: q, selected, status } of mistakes) {
      const card = element("article", undefined, "quiz-card quiz-review-card");
      card.append(element("h3", q.question), element("p", verdicts[status]),
        element("p", `あなたの回答：${selected === "unknown" ? "わからない" : q.choices[Number(selected)]}`),
        element("p", `正解：${q.choices[q.correctIndex]}`), element("p", q.feedback),
        element("p", `『スタンダード白内障手術』 ${q.source}`, "quiz-source"));
      review.append(card);
    }
    get("quiz-score").focus();
  });
  get("quiz-restart").addEventListener("click", () => {
    result.hidden = true;
    panel.hidden = true;
    updatePoolInfo();
    setup.hidden = false;
    get("quiz-setup-heading").focus();
  });
  get("quiz-reset").addEventListener("click", () => {
    if (!confirm("すべての習得履歴・回答履歴をリセットします。よろしいですか？")) return;
    progress = {};
    saveProgress();
    updatePoolInfo();
  });
  categoryList.addEventListener("change", updatePoolInfo);
  get("quiz-mode-list").addEventListener("change", updatePoolInfo);
  startBtn.addEventListener("click", start);
  updatePoolInfo();
  setup.hidden = false;
  get("quiz-unavailable").hidden = true;
})();
