// code-yomereba-ii/assets/quiz.js の選択・出題・回答・復習フローを移植。
(() => {
  "use strict";
  const STORAGE_KEY = "cataractSurgeryQaProgressV1";
  const COMPLETION_KEY = "cataractSurgeryQaCompletionV1";
  const ACTIVE_SESSION_KEY = "cataractSurgeryQaActiveSessionV1";
  const HOME_HINT_KEY = "cataractSurgeryQaHomeHintShownV1";
  const COMPLETION_API_URL = "https://script.google.com/macros/s/AKfycbx1kXbC0nZlKK_20kiMAL19j0jmI7WhW78psYutuvygqcFDmuglU77-D57m-nb1g-tK4w/exec";
  const GAS_COMPLETION_URL = COMPLETION_API_URL;
  const MAX_QUESTIONS = 10;
  const get = id => document.getElementById(id);
  const setup = get("quiz-setup");
  const panel = get("quiz-panel");
  const result = get("quiz-result");
  const completionSection = get("quiz-completion");
  const categoryList = get("quiz-category-list");
  const form = get("quiz-form");
  const choices = get("quiz-choices");
  const submit = get("quiz-submit");
  const feedback = get("quiz-feedback");
  const next = get("quiz-next");
  const startBtn = get("quiz-start");
  const homeNav = get("quiz-home-nav");
  const homeBtn = get("quiz-home");
  const homeHint = get("quiz-home-hint");
  const homeDialog = get("quiz-home-dialog");
  const dialogCancelBtn = get("quiz-dialog-cancel");
  const dialogConfirmBtn = get("quiz-dialog-confirm");
  const reportBtn = get("quiz-report");
  const verdicts = { correct: "○ 正解", incorrect: "× 不正解", unknown: "？ わからない" };
  let round = [], position = 0, answered = false, responses = [];
  let homeHintTimer = null;

  function showHomeHintIfNeeded() {
    if (!homeHint) return;
    try {
      if (localStorage.getItem(HOME_HINT_KEY)) return;
      localStorage.setItem(HOME_HINT_KEY, "true");
    } catch {}

    homeHint.hidden = false;
    requestAnimationFrame(() => {
      homeHint.classList.add("is-visible");
    });

    if (homeHintTimer) clearTimeout(homeHintTimer);
    homeHintTimer = setTimeout(() => {
      hideHomeHint();
    }, 4000);
  }

  function hideHomeHint() {
    if (homeHintTimer) {
      clearTimeout(homeHintTimer);
      homeHintTimer = null;
    }
    if (!homeHint || homeHint.hidden) return;
    homeHint.classList.remove("is-visible");
    setTimeout(() => {
      if (homeHint && !homeHint.classList.contains("is-visible")) {
        homeHint.hidden = true;
      }
    }, 300);
  }

  function saveActiveSession() {
    if (panel.hidden || round.length === 0) return;
    const selectedChapters = [...categoryList.querySelectorAll("input:checked")].map(i => i.value);
    const mode = get("quiz-mode-list").querySelector("input:checked")?.value || "unmastered";
    const session = {
      selectedChapters,
      mode,
      questionIds: round.map(q => q.id),
      position,
      currentQuestionId: round[position]?.id,
      responses: responses.map(r => ({
        questionId: r.question.id,
        selected: r.selected,
        status: r.status
      })),
      answered,
      savedAt: new Date().toISOString()
    };
    try {
      sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  function clearActiveSession() {
    try {
      sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {}
  }

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
  function loadCompletion() {
    try {
      const data = JSON.parse(localStorage.getItem(COMPLETION_KEY)) || {};
      return typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }
  function saveCompletion(data) {
    try {
      localStorage.setItem(COMPLETION_KEY, JSON.stringify(data));
    } catch {}
  }
  function clearCompletion() {
    try {
      localStorage.removeItem(COMPLETION_KEY);
    } catch {}
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
  function normalizeChapter(name) {
    return (name || "").replace(/[\s\u3000]+/g, "").trim();
  }
  function isChapterMatch(qChapter, targetChapter) {
    const normQ = normalizeChapter(qChapter);
    const normTarget = normalizeChapter(targetChapter);
    if (normQ === normTarget) return true;
    const prefixOnly = normTarget.match(/^([①-⑳\d]+)$/);
    if (prefixOnly && normQ.startsWith(prefixOnly[1])) {
      return true;
    }
    return false;
  }
  function getQuestionsForChapter(chapter) {
    return QUESTIONS.filter(q => isChapterMatch(q.chapter, chapter));
  }
  CHAPTERS.forEach((chapter, index) => {
    const scope = getQuestionsForChapter(chapter);
    const count = scope.length;
    const label = element("label", undefined, "quiz-cat-option");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "chapter";
    input.value = chapter;
    input.checked = count > 0;
    input.disabled = count === 0;

    const nameSpan = element("span", chapter, "quiz-cat-name");

    const progressRow = element("div", undefined, "quiz-cat-progress");
    const badge = element("span", undefined, "quiz-cat-count");
    badge.id = `chapter-count-${index}`;

    const barTrack = element("div", undefined, "quiz-cat-bar-track");
    const barFill = element("div", undefined, "quiz-cat-bar-fill");
    barFill.id = `chapter-bar-${index}`;
    barTrack.append(barFill);

    progressRow.append(badge, barTrack);
    label.append(input, nameSpan, progressRow);
    categoryList.append(label);
  });
  function getCandidatePool() {
    const selected = [...categoryList.querySelectorAll("input:checked")].map(input => input.value);
    const mode = get("quiz-mode-list").querySelector("input:checked")?.value || "unmastered";
    const scope = QUESTIONS.filter(q => selected.some(sel => isChapterMatch(q.chapter, sel)));
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
      const scope = getQuestionsForChapter(chapter);
      const hasQuestions = scope.length > 0;
      const mastered = scope.filter(q => progress[q.id]?.mastered).length;
      const badge = get(`chapter-count-${index}`);
      const bar = get(`chapter-bar-${index}`);
      if (badge) {
        badge.textContent = !hasQuestions ? "準備中" : `${mastered} / ${scope.length}問`;
        badge.classList.toggle("quiz-cat-completed", hasQuestions && mastered === scope.length);
      }
      if (bar) {
        const percent = hasQuestions && scope.length > 0 ? (mastered / scope.length) * 100 : 0;
        bar.style.width = `${percent}%`;
      }
      const input = categoryList.querySelector(`input[value="${chapter}"]`);
      if (input) {
        input.disabled = !hasQuestions;
        if (!hasQuestions) {
          input.checked = false;
        }
      }
    });
    const totalMastered = QUESTIONS.filter(q => progress[q.id]?.mastered).length;
    const totalQuestions = QUESTIONS.length;
    const overallPercent = totalQuestions > 0 ? (totalMastered / totalQuestions) * 100 : 0;

    get("mastery-progress").textContent = `全体の習得：${totalMastered} / ${totalQuestions}問`;
    const overallFill = get("mastery-progress-fill");
    if (overallFill) {
      overallFill.style.width = `${overallPercent}%`;
    }
    const overallTrack = get("mastery-progress-track");
    if (overallTrack) {
      overallTrack.setAttribute("aria-valuenow", Math.round(overallPercent));
    }
    const { selected, mode, scope, pool } = getCandidatePool();
    get("quiz-category-error").hidden = selected.length > 0;
    startBtn.disabled = pool.length === 0;
    get("quiz-pool-info").textContent = selected.length === 0 ? "" : pool.length > 0
      ? `出題候補：${pool.length}問 → ランダム${Math.min(pool.length, MAX_QUESTIONS)}問`
      : mode === "unmastered" && scope.length > 0
        ? "選択した単元はすべて習得済みです。「全問復習」で再挑戦できます。"
        : "この条件に該当する問題はありません。";
  }
  function isMultiChoice(q) {
    return Array.isArray(q.correctIndexes);
  }
  function getCorrectIndexes(q) {
    if (isMultiChoice(q)) {
      return [...q.correctIndexes].sort((a, b) => a - b);
    }
    return [q.correctIndex];
  }
  function getChoiceText(choice) {
    if (typeof choice === "object" && choice !== null) {
      return choice.text || "";
    }
    return String(choice);
  }
  function getChoiceImage(choice) {
    if (typeof choice === "object" && choice !== null) {
      return choice.image || null;
    }
    return null;
  }
  function formatChoiceLabel(q, index) {
    const choice = q.choices[index];
    const text = getChoiceText(choice);
    const num = index + 1;
    if (!text || text === String(num)) {
      return String(num);
    }
    return `${num}. ${text}`;
  }
  function createTableElement(tableData) {
    if (!tableData) return null;
    const table = element("table", undefined, "quiz-table");

    if (Array.isArray(tableData.headers) && tableData.headers.length > 0) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      tableData.headers.forEach(headerText => {
        const th = element("th", headerText);
        tr.append(th);
      });
      thead.append(tr);
      table.append(thead);
    }

    if (Array.isArray(tableData.rows)) {
      const tbody = document.createElement("tbody");
      tableData.rows.forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(cell => {
          const td = document.createElement("td");
          const str = String(cell ?? "").trim();
          if (/^[1-9]$/.test(str)) {
            td.className = "quiz-table-blank-cell";
            const span = element("span", str, "quiz-table-blank");
            td.append(span);
          } else {
            td.textContent = cell;
          }
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(tbody);
    }

    return table;
  }
  function showQuestion(options = {}) {
    const { autoFocus = true } = options;
    answered = false;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    get("quiz-progress").textContent = `全${round.length}問中 ${position + 1}問目`;
    get("quiz-chapter").textContent = q.chapter;
    get("quiz-question").textContent = q.question;

    const tableContainer = get("quiz-table-container");
    if (tableContainer) {
      tableContainer.replaceChildren();
      if (q.table) {
        tableContainer.append(createTableElement(q.table));
        tableContainer.hidden = false;
      } else {
        tableContainer.hidden = true;
      }
    }

    feedback.hidden = true;
    next.hidden = true;
    submit.disabled = true;
    choices.disabled = false;

    const legend = choices.querySelector("legend");
    if (legend) {
      legend.textContent = isMulti ? "当てはまる答えをすべて選んでください" : "答えを1つ選んでください";
    }

    get("quiz-options").replaceChildren();
    q.choices.forEach((choice, index) => {
      const label = element("label", undefined, "quiz-option");
      const text = getChoiceText(choice);
      const imgPath = getChoiceImage(choice);

      if (imgPath) {
        label.classList.add("quiz-option-has-image");
      }

      const input = document.createElement("input");
      input.type = isMulti ? "checkbox" : "radio";
      input.name = "answer";
      input.value = String(index);
      label.append(input);

      const content = element("div", undefined, "quiz-option-content");
      if (text) {
        content.append(element("span", text, "quiz-option-text"));
      }
      if (imgPath) {
        const img = document.createElement("img");
        img.src = imgPath;
        img.alt = `選択肢 ${index + 1}`;
        img.className = "quiz-option-image";
        img.loading = "lazy";
        content.append(img);
      }
      label.append(content);

      get("quiz-options").append(label);
    });

    const unknownLabel = element("label", undefined, "quiz-option quiz-option-unknown");
    const unknownInput = document.createElement("input");
    unknownInput.type = isMulti ? "checkbox" : "radio";
    unknownInput.name = isMulti ? "unknown-option" : "answer";
    unknownInput.value = "unknown";
    unknownLabel.append(unknownInput, element("span", "わからない", "quiz-option-text"));
    get("quiz-options").append(unknownLabel);

    if (autoFocus) {
      get("quiz-question").focus();
    }
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
    if (completionSection) completionSection.hidden = true;
    panel.hidden = false;
    if (homeNav) {
      homeNav.hidden = false;
      showHomeHintIfNeeded();
    }
    showQuestion();
    saveActiveSession();
  }
  form.addEventListener("change", e => {
    if (answered) return;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const unknownInput = form.querySelector('input[value="unknown"]');

    if (e.target === unknownInput && unknownInput.checked) {
      // 「わからない」が選択されたら、通常の選択肢をすべて解除
      form.querySelectorAll('input[name="answer"]').forEach(input => {
        if (input !== unknownInput) input.checked = false;
      });
    } else if (e.target !== unknownInput && e.target.checked && unknownInput) {
      // 通常の選択肢が選択されたら、「わからない」を解除
      unknownInput.checked = false;
    }

    const isUnknown = unknownInput && unknownInput.checked;
    if (isMulti) {
      const checkedAnswers = form.querySelectorAll('input[name="answer"]:checked');
      submit.disabled = checkedAnswers.length === 0 && !isUnknown;
    } else {
      const selected = form.querySelector('input[name="answer"]:checked');
      submit.disabled = !selected && !isUnknown;
    }
  });
  function renderAnswerFeedback(status, userAnswers) {
    answered = true;
    choices.disabled = true;
    submit.disabled = true;

    const q = round[position];
    const correctAnswers = getCorrectIndexes(q);

    if (status === "unknown") {
      const unknownInput = form.querySelector('input[value="unknown"]');
      if (unknownInput) unknownInput.checked = true;
    } else if (Array.isArray(userAnswers)) {
      userAnswers.forEach(val => {
        const input = form.querySelector(`input[name="answer"][value="${val}"]`);
        if (input) input.checked = true;
      });
    }

    // 回答確定後の選択肢ハイライト
    const optionLabels = get("quiz-options").querySelectorAll(".quiz-option");
    optionLabels.forEach((label, index) => {
      if (index === q.choices.length) {
        if (status === "unknown") {
          label.classList.add("is-user-selected");
          label.append(element("span", "選択", "quiz-option-status quiz-badge-missed"));
        } else {
          label.classList.add("is-not-selected");
        }
        return;
      }

      const isCorrect = correctAnswers.includes(index);
      const isUser = Array.isArray(userAnswers) && userAnswers.includes(index);

      if (isCorrect && isUser) {
        label.classList.add("is-correct", "is-user-selected");
        label.append(element("span", "○ 正解", "quiz-option-status quiz-badge-correct"));
      } else if (isCorrect && !isUser) {
        label.classList.add("is-correct", "is-missed");
        label.append(element("span", "○ 正解", "quiz-option-status quiz-badge-correct"));
      } else if (!isCorrect && isUser) {
        label.classList.add("is-incorrect", "is-user-selected");
        label.append(element("span", "× 誤り", "quiz-option-status quiz-badge-incorrect"));
      } else {
        label.classList.add("is-not-selected");
      }
    });

    const verdictEl = get("quiz-verdict");
    if (status === "unknown") {
      verdictEl.textContent = "";
      verdictEl.hidden = true;
    } else {
      verdictEl.textContent = verdicts[status];
      verdictEl.hidden = false;
    }
    feedback.dataset.correct = String(status === "correct");
    feedback.dataset.verdict = status;

    const correctLabels = correctAnswers.map(idx => formatChoiceLabel(q, idx));
    get("quiz-correct-answer").textContent = `正解：${correctLabels.join("、 ")}`;
    get("quiz-explanation").textContent = q.feedback;
    get("quiz-source").textContent = q.source ? `『スタンダード白内障手術』 ${q.source}` : `『スタンダード白内障手術』`;
    feedback.hidden = false;
    next.textContent = position === round.length - 1 ? "結果を見る" : "次の問題";
    next.hidden = false;
  }
  function handleAnswerSubmit(forcedStatus) {
    if (answered) return;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const correctAnswers = getCorrectIndexes(q);

    let status = "";
    let userAnswers = [];

    if (forcedStatus === "unknown") {
      status = "unknown";
    } else if (isMulti) {
      const checked = [...form.querySelectorAll('input[name="answer"]:checked')];
      userAnswers = checked.map(input => Number(input.value)).sort((a, b) => a - b);
      const isCorrect = userAnswers.length === correctAnswers.length &&
        userAnswers.every((val, i) => val === correctAnswers[i]);
      status = isCorrect ? "correct" : "incorrect";
    } else {
      const selected = form.querySelector('input[name="answer"]:checked');
      if (!selected) return;
      if (selected.value === "unknown") {
        status = "unknown";
      } else {
        const val = Number(selected.value);
        userAnswers = [val];
        status = val === q.correctIndex ? "correct" : "incorrect";
      }
    }

    responses.push({ question: q, selected: status === "unknown" ? "unknown" : userAnswers, status });
    setRecord(q.id, status);
    renderAnswerFeedback(status, userAnswers);
    saveActiveSession();
    feedback.focus();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (answered) return;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const unknownInput = form.querySelector('input[value="unknown"]');
    if (unknownInput && unknownInput.checked) {
      handleAnswerSubmit("unknown");
      return;
    }
    if (!isMulti) {
      const selected = form.querySelector('input[name="answer"]:checked');
      if (!selected) return;
      handleAnswerSubmit();
    } else {
      const checkedAnswers = form.querySelectorAll('input[name="answer"]:checked');
      if (checkedAnswers.length === 0) return;
      handleAnswerSubmit();
    }
  });
  next.addEventListener("click", () => {
    if (!answered || panel.hidden) return;
    position++;
    if (position < round.length) {
      showQuestion();
      saveActiveSession();
      return;
    }
    clearActiveSession();
    panel.hidden = true;
    if (checkCompletion()) return;
    result.hidden = false;
    const count = status => responses.filter(r => r.status === status).length;
    get("quiz-score").textContent = `${round.length}問中${count("correct")}問正解`;
    get("quiz-summary").textContent = `正解 ${count("correct")}問 ／ 不正解 ${count("incorrect")}問 ／ わからない ${count("unknown")}問`;
    const review = get("quiz-review");
    review.replaceChildren();
    const mistakes = responses.filter(r => r.status !== "correct");
    if (!mistakes.length) review.append(element("p", "今回は復習が必要な問題はありません。"));
    for (const { question: q, selected, status } of mistakes) {
      const correctAnswers = getCorrectIndexes(q);
      const card = element("article", undefined, "quiz-card quiz-review-card");

      let userText = "";
      if (status === "unknown" || selected === "unknown") {
        userText = "わからない";
      } else if (Array.isArray(selected)) {
        userText = selected.length > 0
          ? selected.map(i => formatChoiceLabel(q, i)).join("、 ")
          : "未選択";
      } else {
        userText = formatChoiceLabel(q, Number(selected));
      }

      const correctText = correctAnswers.map(i => formatChoiceLabel(q, i)).join("、 ");

      const cardChildren = [
        element("h3", q.question)
      ];
      if (q.table) {
        const reviewTableContainer = element("div", undefined, "quiz-table-container");
        reviewTableContainer.append(createTableElement(q.table));
        cardChildren.push(reviewTableContainer);
      }
      cardChildren.push(
        element("p", verdicts[status]),
        element("p", `あなたの回答：${userText}`),
        element("p", `正解：${correctText}`),
        element("p", q.feedback),
        element("p", q.source ? `『スタンダード白内障手術』 ${q.source}` : `『スタンダード白内障手術』`, "quiz-source")
      );

      card.append(...cardChildren);
      review.append(card);
    }
    get("quiz-score").focus();
  });
  function showCompletionScreen(completedAt, hasError) {
    setup.hidden = true;
    panel.hidden = true;
    result.hidden = true;
    if (homeNav) homeNav.hidden = true;

    const total = QUESTIONS.length;
    const countEl = get("completion-count");
    if (countEl) countEl.textContent = `${total} / ${total}問`;

    const dateBlock = get("completion-date-block");
    const dateEl = get("completion-date");
    const errorEl = get("completion-error");

    if (hasError || !completedAt) {
      if (dateBlock) dateBlock.hidden = true;
      if (errorEl) errorEl.hidden = !hasError;
    } else {
      const dateText = completedAt.endsWith("JST") ? completedAt : `${completedAt} JST`;
      if (dateEl) dateEl.textContent = dateText;
      if (dateBlock) dateBlock.hidden = false;
      if (errorEl) errorEl.hidden = true;
    }

    if (completionSection) {
      completionSection.hidden = false;
    }
    const titleEl = get("completion-title");
    if (titleEl) titleEl.focus();
  }

  async function postCompletionToGas(masteredCount, totalCount) {
    try {
      const response = await fetch(COMPLETION_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          masteredCount,
          totalCount
        })
      });
      const result = await response.json();
      return result;
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  function checkCompletion() {
    const total = QUESTIONS.length;
    if (total === 0) return false;
    const mastered = QUESTIONS.filter(q => progress[q.id]?.mastered).length;
    if (mastered < total) return false;

    const saved = loadCompletion();
    if (saved && saved.reported && saved.completedAt) {
      showCompletionScreen(saved.completedAt, false);
      return true;
    }

    showCompletionScreen(null, false);
    postCompletionToGas(mastered, total).then(res => {
      if (res && res.ok && res.completedAt) {
        saveCompletion({
          reported: true,
          completedAt: res.completedAt,
          completionId: res.completionId
        });
        showCompletionScreen(res.completedAt, false);
      } else {
        showCompletionScreen(null, true);
      }
    }).catch(() => {
      showCompletionScreen(null, true);
    });

    return true;
  }

  function handleResetAll() {
    if (!confirm("すべての習得履歴・回答履歴をリセットします。よろしいですか？")) return;
    clearActiveSession();
    progress = {};
    saveProgress();
    clearCompletion();
    if (completionSection) completionSection.hidden = true;
    returnToTop();
  }

  function openHomeConfirmDialog() {
    if (!homeDialog) return;
    if (typeof homeDialog.showModal === "function") {
      homeDialog.showModal();
    } else {
      homeDialog.setAttribute("open", "");
    }
    if (dialogCancelBtn) {
      dialogCancelBtn.focus();
    }
  }

  function closeHomeConfirmDialog() {
    if (!homeDialog) return;
    if (typeof homeDialog.close === "function") {
      homeDialog.close();
    } else {
      homeDialog.removeAttribute("open");
    }
  }

  function returnToTop() {
    hideHomeHint();
    clearActiveSession();
    closeHomeConfirmDialog();
    result.hidden = true;
    panel.hidden = true;
    if (completionSection) completionSection.hidden = true;
    if (homeNav) homeNav.hidden = true;
    updatePoolInfo();
    setup.hidden = false;
    get("quiz-setup-heading").focus();
  }
  get("quiz-restart").addEventListener("click", returnToTop);
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      hideHomeHint();
      if (!panel.hidden) {
        openHomeConfirmDialog();
        return;
      }
      returnToTop();
    });
  }
  if (dialogCancelBtn) {
    dialogCancelBtn.addEventListener("click", () => {
      closeHomeConfirmDialog();
      if (homeBtn) homeBtn.focus();
    });
  }
  if (dialogConfirmBtn) {
    dialogConfirmBtn.addEventListener("click", () => {
      returnToTop();
    });
  }
  if (homeDialog) {
    homeDialog.addEventListener("click", (e) => {
      if (e.target === homeDialog) {
        closeHomeConfirmDialog();
        if (homeBtn) homeBtn.focus();
      }
    });
    homeDialog.addEventListener("cancel", () => {
      closeHomeConfirmDialog();
      if (homeBtn) homeBtn.focus();
    });
  }
  function formatChoicesForReport(question) {
    if (!Array.isArray(question?.choices)) return "";
    return question.choices.map((choice, index) => {
      if (typeof choice === "string") {
        return `${index + 1}. ${choice}`;
      }

      const text = choice?.text ?? "";
      const image = choice?.image ? ` [${choice.image}]` : "";
      return `${index + 1}. ${text}${image}`;
    }).join("\n");
  }

  function openReportForm(question) {
    if (!question) return;
    const baseUrl =
      "https://docs.google.com/forms/d/e/1FAIpQLSe4ajqntE-ZyqbJ8jgaL8_tZJsM0ivYvDYEO6CiRiux5C7eeQ/viewform";

    const params = new URLSearchParams({
      usp: "pp_url",
      "entry.843181098": question.id ?? "",
      "entry.64528700": question.chapter ?? "",
      "entry.982855707": question.question ?? "",
      "entry.1187832261": formatChoicesForReport(question),
      "entry.455737619": question.feedback ?? "",
      "entry.389300495": question.source ?? ""
    });

    window.open(`${baseUrl}?${params.toString()}`, "_blank", "noopener,noreferrer");
  }
  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      openReportForm(round[position]);
    });
  }
  get("quiz-reset").addEventListener("click", handleResetAll);
  const completionReviewBtn = get("completion-review");
  if (completionReviewBtn) {
    completionReviewBtn.addEventListener("click", () => {
      if (completionSection) completionSection.hidden = true;
      const allModeInput = get("quiz-mode-list").querySelector('input[value="all"]');
      if (allModeInput) {
        allModeInput.checked = true;
      }
      returnToTop();
    });
  }
  const completionResetBtn = get("completion-reset");
  if (completionResetBtn) {
    completionResetBtn.addEventListener("click", handleResetAll);
  }

  function restoreActiveSession() {
    let session = null;
    try {
      const raw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
      if (raw) session = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!session || !Array.isArray(session.questionIds) || session.questionIds.length === 0) {
      return false;
    }

    const restoredRound = session.questionIds
      .map(id => QUESTIONS.find(q => q.id === id))
      .filter(Boolean);

    if (
      restoredRound.length === 0 ||
      typeof session.position !== "number" ||
      session.position < 0 ||
      session.position >= restoredRound.length
    ) {
      clearActiveSession();
      return false;
    }

    // 単元選択とモードの復元
    if (Array.isArray(session.selectedChapters)) {
      categoryList.querySelectorAll('input[name="chapter"]').forEach(input => {
        input.checked = session.selectedChapters.includes(input.value);
      });
    }
    if (session.mode) {
      const modeInput = get("quiz-mode-list").querySelector(`input[value="${session.mode}"]`);
      if (modeInput) modeInput.checked = true;
    }

    round = restoredRound;
    position = session.position;
    responses = (session.responses || []).map(r => ({
      question: QUESTIONS.find(q => q.id === r.questionId),
      selected: r.selected,
      status: r.status
    })).filter(r => r.question);

    setup.hidden = true;
    result.hidden = true;
    if (completionSection) completionSection.hidden = true;
    panel.hidden = false;
    if (homeNav) {
      homeNav.hidden = false;
      showHomeHintIfNeeded();
    }

    showQuestion({ autoFocus: false });

    if (session.answered) {
      const currentResp = responses.find(r => r.question.id === round[position].id) || responses[responses.length - 1];
      if (currentResp) {
        renderAnswerFeedback(currentResp.status, currentResp.selected);
      }
    }

    if (document.activeElement && document.activeElement === get("quiz-question")) {
      document.activeElement.blur();
    }

    return true;
  }

  categoryList.addEventListener("change", updatePoolInfo);
  get("quiz-mode-list").addEventListener("change", updatePoolInfo);
  startBtn.addEventListener("click", start);
  updatePoolInfo();

  const restored = restoreActiveSession();
  if (!restored) {
    if (checkCompletion()) {
      // 100%達成時は修了画面を表示（setupは非表示）
    } else {
      setup.hidden = false;
    }
    if (homeNav) homeNav.hidden = true;
  }
  get("quiz-unavailable").hidden = true;

  // PWA自動インストールプロンプト（ブラウザ標準の自動バナー等）を抑止
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });
})();
